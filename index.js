import {
    MAX_LIVE_ENTRIES,
    describeIndexEntry,
    escapeHtml,
    formatClock,
    formatTimestamp,
    levelClass,
    loadExtensionSettings,
    mergeById,
    normalizeLevel,
    positiveInteger,
    renderFormattedRoleHtml,
    renderRawJsonRoleHtml,
    saveExtensionSettings,
    trimTail,
} from './log-utils.js';

const DRAWER_ID = 'tt-easy-access-logs-drawer';
const DRAWER_PANEL_ID = 'tt-easy-access-logs-panel';
const PANEL_TITLES = Object.freeze({
    llm: 'LLM API Logs',
    frontend: 'Frontend Logs',
    backend: 'Backend Logs',
});

let activationPromise = null;
let drawerElement = null;
let drawerListeners = null;
let activePanelCleanup = null;
let panelPromise = null;

export function onActivate() {
    if (!activationPromise) {
        activationPromise = initialize().catch(error => {
            console.error('[TauriTavern Easy Access Logs] Failed to initialize.', error);
            return false;
        });
    }
    return activationPromise;
}

export function onDisable() {
    teardown();
}

export function onDelete() {
    teardown();
}

async function initialize() {
    await whenDocumentReady();

    const devApi = await resolveDevApi();
    if (!devApi) {
        console.info('[TauriTavern Easy Access Logs] Compatible TauriTavern log APIs are unavailable; no UI was added.');
        return false;
    }

    const topBar = document.getElementById('top-settings-holder');
    if (!topBar) {
        console.warn('[TauriTavern Easy Access Logs] The top navigation holder was not found; no UI was added.');
        return false;
    }

    if (document.getElementById(DRAWER_ID)) {
        return true;
    }

    drawerElement = await loadDrawer();
    const personaDrawer = document.getElementById('persona-management-button');
    topBar.insertBefore(drawerElement, personaDrawer?.parentElement === topBar ? personaDrawer : null);
    bindDrawer(drawerElement);
    return true;
}

async function resolveDevApi() {
    const host = window.__TAURITAVERN__;
    if (!host || typeof host !== 'object') {
        return null;
    }

    const ready = host.ready ?? window.__TAURITAVERN_MAIN_READY__;
    if (ready && typeof ready.then === 'function') {
        await ready;
    }

    const dev = window.__TAURITAVERN__?.api?.dev;
    const requiredMethods = [
        dev?.frontendLogs?.list,
        dev?.frontendLogs?.subscribe,
        dev?.frontendLogs?.getConsoleCaptureEnabled,
        dev?.frontendLogs?.setConsoleCaptureEnabled,
        dev?.backendLogs?.tail,
        dev?.backendLogs?.subscribe,
        dev?.llmApiLogs?.index,
        dev?.llmApiLogs?.getPreview,
        dev?.llmApiLogs?.getRaw,
        dev?.llmApiLogs?.subscribeIndex,
        dev?.llmApiLogs?.getKeep,
        dev?.llmApiLogs?.setKeep,
    ];
    return requiredMethods.every(method => typeof method === 'function') ? dev : null;
}

async function loadDrawer() {
    const response = await fetch(new URL('./drawer.html', import.meta.url));
    if (!response.ok) {
        throw new Error(`Drawer template failed to load (${response.status})`);
    }

    const wrapper = document.createElement('div');
    wrapper.innerHTML = await response.text();
    const template = wrapper.querySelector('#tt-easy-access-logs-drawer-template');
    const drawer = template?.content?.firstElementChild?.cloneNode(true);
    if (!(drawer instanceof HTMLElement)) {
        throw new Error('Drawer template is invalid');
    }
    return drawer;
}

function bindDrawer(drawer) {
    const controller = new AbortController();
    const { signal } = controller;
    const toggle = requireElement(drawer, '.tt-eal-drawer-toggle');

    toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        setDrawerOpen(drawer, !isDrawerOpen(drawer));
    }, { signal });

    toggle.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        setDrawerOpen(drawer, !isDrawerOpen(drawer));
    }, { signal });

    for (const button of drawer.querySelectorAll('[data-tt-eal-panel]')) {
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const kind = button.getAttribute('data-tt-eal-panel');
            if (!Object.hasOwn(PANEL_TITLES, kind)) {
                return;
            }
            setDrawerOpen(drawer, false);
            requestPanel(kind);
        }, { signal });
    }

    const fullscreenActionBtn = drawer.querySelector('[data-tt-eal-action="fullscreen"]');
    if (fullscreenActionBtn) {
        fullscreenActionBtn.addEventListener('click', async event => {
            event.preventDefault();
            event.stopPropagation();
            setDrawerOpen(drawer, false);
            try {
                await toggleAppFullscreen();
            } catch (error) {
                reportError(error, 'Could not toggle fullscreen.');
            }
            await updateFullscreenButtonState(drawer);
        }, { signal });
    }

    void updateFullscreenButtonState(drawer);
    document.addEventListener('fullscreenchange', () => void updateFullscreenButtonState(drawer), { signal });
    document.addEventListener('webkitfullscreenchange', () => void updateFullscreenButtonState(drawer), { signal });
    window.addEventListener('resize', () => void updateFullscreenButtonState(drawer), { signal });

    document.addEventListener('pointerdown', event => {
        if (isDrawerOpen(drawer) && !drawer.contains(event.target)) {
            setDrawerOpen(drawer, false);
        }
    }, { signal, capture: true });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && isDrawerOpen(drawer)) {
            setDrawerOpen(drawer, false);
            toggle.focus();
        }
    }, { signal });

    drawerListeners = controller;
}

function getTauriWindow() {
    try {
        const tauri = window.__TAURI__;
        if (tauri?.window) {
            return tauri.window.getCurrentWindow?.() || tauri.window.appWindow || null;
        }
    } catch (error) {
        // ignore
    }
    return null;
}

async function setTauriWindowFullscreen(enable) {
    try {
        const win = getTauriWindow();
        if (win && typeof win.setFullscreen === 'function') {
            await win.setFullscreen(enable);
            return true;
        }
        if (typeof window.__TAURI_INVOKE__ === 'function') {
            await window.__TAURI_INVOKE__('tauri', {
                __tauriModule: 'Window',
                message: { cmd: 'setFullscreen', value: enable }
            });
            return true;
        }
    } catch (error) {
        console.warn('[TauriTavern Easy Access Logs] Tauri window setFullscreen failed:', error);
    }
    return false;
}

function isAppFullscreen() {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        return true;
    }
    if (typeof window.innerHeight === 'number' && typeof screen.height === 'number') {
        if (Math.abs(window.innerHeight - screen.height) < 12 && Math.abs(window.innerWidth - screen.width) < 12) {
            return true;
        }
    }
    return false;
}

async function checkTauriFullscreenState() {
    try {
        const win = getTauriWindow();
        if (win && typeof win.isFullscreen === 'function') {
            return await win.isFullscreen();
        }
    } catch (error) {
        // ignore
    }
    return isAppFullscreen();
}

async function toggleAppFullscreen() {
    const isCurrentlyFull = isAppFullscreen();
    const targetState = !isCurrentlyFull;

    try {
        if (targetState) {
            const req = document.documentElement.requestFullscreen?.()
                || document.documentElement.webkitRequestFullscreen?.()
                || document.body.requestFullscreen?.();
            if (req && typeof req.then === 'function') {
                await req;
            }
        } else if (document.fullscreenElement || document.webkitFullscreenElement) {
            const exit = document.exitFullscreen?.() || document.webkitExitFullscreen?.();
            if (exit && typeof exit.then === 'function') {
                await exit;
            }
        }
    } catch (error) {
        console.warn('[TauriTavern Easy Access Logs] Fullscreen toggle attempt:', error);
        reportError(error, 'Could not toggle fullscreen.');
    }

    try {
        await setTauriWindowFullscreen(targetState);
    } catch (error) {
        // ignore
    }

    try {
        window.dispatchEvent(new Event('resize'));
    } catch (error) {
        // ignore
    }
}

async function updateFullscreenButtonState(drawer) {
    const fullscreenBtn = drawer?.querySelector?.('[data-tt-eal-action="fullscreen"]');
    if (!fullscreenBtn) {
        return;
    }
    const isFull = await checkTauriFullscreenState();
    const icon = fullscreenBtn.querySelector('.tt-eal-fullscreen-action-icon');
    const label = fullscreenBtn.querySelector('.tt-eal-fullscreen-action-text');
    if (icon) {
        icon.className = `fa-solid ${isFull ? 'fa-compress' : 'fa-expand'} fa-fw tt-eal-fullscreen-action-icon`;
    }
    if (label) {
        label.textContent = isFull ? 'Exit Fullscreen' : 'Immersive Fullscreen';
    }
    fullscreenBtn.title = isFull ? 'Exit Fullscreen' : 'Immersive Fullscreen';
    fullscreenBtn.setAttribute('aria-label', isFull ? 'Exit Fullscreen' : 'Immersive Fullscreen');
}

function isDrawerOpen(drawer) {
    return drawer.querySelector(`#${DRAWER_PANEL_ID}`)?.classList.contains('openDrawer') ?? false;
}

function setDrawerOpen(drawer, open) {
    const toggle = requireElement(drawer, '.tt-eal-drawer-toggle');
    const icon = requireElement(drawer, '.drawer-icon');
    const panel = requireElement(drawer, `#${DRAWER_PANEL_ID}`);

    if (open) {
        void updateFullscreenButtonState(drawer);
        for (const otherPanel of document.querySelectorAll('.openDrawer:not(.pinnedOpen)')) {
            if (otherPanel === panel) {
                continue;
            }
            otherPanel.classList.remove('openDrawer');
            otherPanel.classList.add('closedDrawer');
            const otherIcon = otherPanel.closest('.drawer')?.querySelector('.drawer-icon');
            otherIcon?.classList.remove('openIcon');
            otherIcon?.classList.add('closedIcon');
        }
    }

    panel.classList.toggle('openDrawer', open);
    panel.classList.toggle('closedDrawer', !open);
    icon.classList.toggle('openIcon', open);
    icon.classList.toggle('closedIcon', !open);
    toggle.setAttribute('aria-expanded', String(open));
}

function requestPanel(kind) {
    if (panelPromise) {
        return;
    }
    panelPromise = openPanel(kind)
        .catch(error => reportError(error, `Could not open ${PANEL_TITLES[kind]}.`))
        .finally(() => {
            panelPromise = null;
        });
}

async function openPanel(kind) {
    const devApi = await resolveDevApi();
    if (!devApi) {
        throw new Error('TauriTavern developer log APIs are unavailable');
    }

    const { callGenericPopup, POPUP_TYPE } = await import('../../../popup.js');

    const panel = kind === 'llm'
        ? await createLlmPanel(devApi.llmApiLogs)
        : await createLivePanel(kind, kind === 'frontend' ? devApi.frontendLogs : devApi.backendLogs);
    activePanelCleanup = panel.cleanup;

    try {
        await callGenericPopup(panel.root, POPUP_TYPE.TEXT, '', {
            okButton: 'Close',
            allowVerticalScrolling: true,
            wide: true,
            large: true,
        });
    } finally {
        panel.cleanup();
        if (activePanelCleanup === panel.cleanup) {
            activePanelCleanup = null;
        }
    }
}

async function createLivePanel(kind, api) {
    const frontend = kind === 'frontend';
    const title = PANEL_TITLES[kind];
    const description = frontend
        ? 'Browser console messages captured by TauriTavern.'
        : 'Live diagnostics emitted by the native host.';
    const root = createPanelShell(title, description, 'LIVE STREAM');
    const toolbar = element('div', 'tt-eal-toolbar');
    const levels = element('div', 'tt-eal-levels');
    const search = element('input', 'text_pole tt-eal-search');
    const pauseButton = menuButton('Pause', 'fa-pause');
    const latestButton = menuButton('Latest', 'fa-arrow-down');
    const refreshButton = menuButton('Refresh', 'fa-rotate');
    const status = element('div', 'tt-eal-status-row');
    const connectionStatus = element('span', '', 'CONNECTING');
    const countStatus = element('span', '', '0 entries');
    const list = element('div', 'tt-eal-live-list');
    const levelButtons = new Map();

    search.type = 'search';
    search.placeholder = 'Search messages or targets';
    search.setAttribute('aria-label', 'Search logs');
    list.setAttribute('role', 'log');
    list.setAttribute('aria-live', 'polite');
    list.setAttribute('aria-label', title);

    for (const level of ['ALL', 'ERROR', 'WARN', 'INFO', 'DEBUG']) {
        const button = element('button', `tt-eal-chip ${level === 'ALL' ? '' : levelClass(level)}`, level);
        button.type = 'button';
        button.dataset.level = level;
        button.classList.toggle('active', level === 'ALL');
        button.setAttribute('aria-pressed', String(level === 'ALL'));
        levels.append(button);
        levelButtons.set(level, button);
    }

    toolbar.append(levels, search, pauseButton, latestButton, refreshButton);
    let captureToggle = null;
    if (frontend) {
        const captureLabel = element('label', 'tt-eal-capture');
        captureToggle = element('input');
        captureToggle.type = 'checkbox';
        captureLabel.append(captureToggle, document.createTextNode('Capture console'));
        toolbar.append(captureLabel);
    }
    status.append(connectionStatus, countStatus);
    root.append(toolbar, status, list);

    let entries;
    let selectedLevel = 'ALL';
    let paused = false;
    let followLatest = true;
    let disposed = false;
    let renderFrame = 0;
    let unsubscribe = null;

    async function refresh() {
        refreshButton.disabled = true;
        try {
            const next = frontend
                ? await api.list({ limit: MAX_LIVE_ENTRIES })
                : await api.tail({ limit: MAX_LIVE_ENTRIES });
            if (!disposed) {
                entries = trimTail(next);
                scheduleRender();
            }
        } finally {
            refreshButton.disabled = false;
        }
    }

    function scheduleRender() {
        if (disposed || renderFrame) {
            return;
        }
        renderFrame = requestAnimationFrame(() => {
            renderFrame = 0;
            render();
        });
    }

    function render() {
        const query = search.value.trim().toLowerCase();
        const shown = entries.filter(entry => {
            const matchesLevel = selectedLevel === 'ALL' || normalizeLevel(entry?.level) === selectedLevel;
            if (!matchesLevel) {
                return false;
            }
            if (!query) {
                return true;
            }
            return `${entry?.target ?? ''}\n${entry?.message ?? ''}`.toLowerCase().includes(query);
        });

        const fragment = document.createDocumentFragment();
        if (shown.length === 0) {
            fragment.append(element('div', 'tt-eal-empty', entries.length ? 'No entries match the current filters.' : 'No log entries yet.'));
        } else {
            for (const entry of shown) {
                fragment.append(createLogRow(entry, frontend ? 'frontend' : 'host'));
            }
        }
        list.replaceChildren(fragment);
        countStatus.textContent = `${shown.length} shown · ${entries.length} loaded${paused ? ' · paused' : ''}`;
        if (followLatest) {
            list.scrollTop = list.scrollHeight;
        }
    }

    for (const [level, button] of levelButtons) {
        button.addEventListener('click', () => {
            selectedLevel = level;
            for (const [candidate, candidateButton] of levelButtons) {
                const active = candidate === selectedLevel;
                candidateButton.classList.toggle('active', active);
                candidateButton.setAttribute('aria-pressed', String(active));
            }
            scheduleRender();
        });
    }
    search.addEventListener('input', scheduleRender);
    list.addEventListener('scroll', () => {
        followLatest = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
    }, { passive: true });
    latestButton.addEventListener('click', () => {
        followLatest = true;
        list.scrollTop = list.scrollHeight;
    });
    pauseButton.addEventListener('click', async () => {
        paused = !paused;
        setButton(pauseButton, paused ? 'Resume' : 'Pause', paused ? 'fa-play' : 'fa-pause');
        if (!paused) {
            followLatest = true;
            await refresh().catch(error => reportError(error, 'Could not refresh logs.'));
        }
        scheduleRender();
    });
    refreshButton.addEventListener('click', () => {
        void refresh().catch(error => reportError(error, 'Could not refresh logs.'));
    });

    if (captureToggle) {
        captureToggle.checked = await api.getConsoleCaptureEnabled();
        captureToggle.addEventListener('change', async () => {
            const requested = captureToggle.checked;
            captureToggle.disabled = true;
            try {
                await api.setConsoleCaptureEnabled(requested);
            } catch (error) {
                captureToggle.checked = !requested;
                reportError(error, 'Could not update frontend console capture.');
            } finally {
                captureToggle.disabled = false;
            }
        });
    }

    entries = trimTail(frontend
        ? await api.list({ limit: MAX_LIVE_ENTRIES })
        : await api.tail({ limit: MAX_LIVE_ENTRIES }));
    render();

    Promise.resolve(api.subscribe(entry => {
        if (!disposed && !paused) {
            entries = mergeById(entries, entry, MAX_LIVE_ENTRIES);
            scheduleRender();
        }
    })).then(stop => {
        if (disposed) {
            stop?.();
        } else {
            unsubscribe = stop;
            connectionStatus.textContent = 'LIVE';
        }
    }).catch(error => {
        connectionStatus.textContent = 'SNAPSHOT ONLY';
        reportError(error, `Could not subscribe to ${title}.`);
    });

    return {
        root,
        cleanup() {
            if (disposed) {
                return;
            }
            disposed = true;
            if (renderFrame) {
                cancelAnimationFrame(renderFrame);
            }
            try {
                unsubscribe?.();
            } catch (error) {
                console.warn('[TauriTavern Easy Access Logs] Log unsubscribe failed.', error);
            }
        },
    };
}

function createLogRow(entry, fallbackTarget) {
    const level = normalizeLevel(entry?.level);
    const row = element('div', `tt-eal-log-row ${levelClass(level)}`);
    const time = element('span', 'tt-eal-log-time', formatClock(entry?.timestampMs));
    const badge = element('span', 'tt-eal-log-badge', level);
    const target = element('span', 'tt-eal-log-target', String(entry?.target || fallbackTarget));
    const message = element('span', 'tt-eal-log-message', String(entry?.message ?? ''));
    row.append(time, badge, target, message);
    return row;
}

const ZOOM_LEVELS = ['0.6rem', '0.67rem', '0.74rem', '0.84rem', '0.96rem', '1.1rem', '1.28rem', '1.5rem'];
const DEFAULT_ZOOM_INDEX = 2;

async function createLlmPanel(api) {
    let keep = positiveInteger(await api.getKeep()) ?? 50;
    let entries = trimTail(await api.index({ limit: keep }), keep);
    let selectedId = entries.at(-1)?.id ?? null;
    let disposed = false;
    let unsubscribe = null;
    let previewEpoch = 0;
    let rawEpoch = 0;

    const root = createPanelShell(
        PANEL_TITLES.llm,
        null,
        'API TRACE',
    );
    const toolbar = element('div', 'tt-eal-toolbar');
    const previousButton = menuButton('Prev', 'fa-chevron-left');
    const nextButton = menuButton('Next', 'fa-chevron-right');
    const entrySelect = element('select', 'text_pole tt-eal-entry-select');
    const reloadButton = menuButton('Reload', 'fa-rotate');

    const metaCard = element('div', 'tt-eal-meta-card');
    const metaInfo = element('div', 'tt-eal-meta-info');
    const metaControls = element('div', 'tt-eal-meta-controls');
    const keepLabel = element('span', 'tt-eal-keep-label', 'Keep Entries: ');
    const keepInput = element('input', 'text_pole tt-eal-keep-input');
    const applyButton = iconButton('Apply retention', 'fa-check');

    keepInput.type = 'number';
    keepInput.min = '1';
    keepInput.step = '1';
    keepInput.value = String(keep);
    keepInput.setAttribute('aria-label', 'Keep entries');
    metaControls.append(keepLabel, keepInput, applyButton);
    metaCard.append(metaControls, metaInfo);

    const previewSection = element('section', 'tt-eal-section tt-eal-preview-section');
    const previewBar = element('div', 'tt-eal-section-bar');
    const previewTitle = element('span', 'tt-eal-section-title', 'Formatted Preview');
    const previewTools = element('div', 'tt-eal-section-tools');
    const previewZoomOut = iconButton('Zoom out (−)', 'fa-magnifying-glass-minus');
    const previewZoomIn = iconButton('Zoom in (+)', 'fa-magnifying-glass-plus');
    previewTools.append(previewZoomOut, previewZoomIn);
    previewBar.append(previewTitle, previewTools);

    const settings = loadExtensionSettings();

    let previewZoomer = null;
    const onPreviewZoom = delta => previewZoomer?.(delta);

    const onTogglePreviewColorizer = enabled => saveExtensionSettings({ previewRoleColor: enabled });
    const onToggleRawColorizer = enabled => saveExtensionSettings({ rawRoleColor: enabled });

    const bodyGrid = element('div', 'tt-eal-body-grid');
    const requestBlock = createTextBlock('Request', 'Copy request', true, null, onPreviewZoom, renderFormattedRoleHtml, settings.previewRoleColor, onTogglePreviewColorizer);
    const responseBlock = createTextBlock('Response', 'Copy response', true, null, onPreviewZoom);
    bodyGrid.append(requestBlock.root, responseBlock.root);
    previewSection.append(previewBar, bodyGrid);

    let rawWordWrap = settings.rawWordWrap;

    function setRawWordWrap(enabled) {
        rawWordWrap = enabled;
        rawWordWrapBtn.classList.toggle('active', rawWordWrap);
        rawWordWrapBtn.setAttribute('aria-pressed', String(rawWordWrap));
        rawWordWrapBtn.title = rawWordWrap ? 'Word wrap: On' : 'Toggle word wrap';
        rawWordWrapBtn.setAttribute('aria-label', rawWordWrap ? 'Word wrap: On' : 'Toggle word wrap');

        rawRequestBlock.setWrapState?.(rawWordWrap);
        rawResponseBlock.setWrapState?.(rawWordWrap);

        for (const block of [rawRequestBlock, rawResponseBlock]) {
            block.area.wrap = rawWordWrap ? 'soft' : 'off';
            block.area.style.whiteSpace = rawWordWrap ? 'pre-wrap' : 'pre';
        }
    }

    const toggleRawWordWrap = () => {
        const next = !rawWordWrap;
        setRawWordWrap(next);
        saveExtensionSettings({ rawWordWrap: next });
    };

    let rawZoomer = null;
    const onRawZoom = delta => rawZoomer?.(delta);

    const rawSection = element('section', 'tt-eal-section tt-eal-raw-section');
    const rawBar = element('div', 'tt-eal-section-bar');
    const rawTitle = element('span', 'tt-eal-section-title', 'Raw JSON / SSE');
    const rawTools = element('div', 'tt-eal-section-tools');
    const rawWordWrapBtn = iconButton('Toggle word wrap', 'fa-align-left');
    rawWordWrapBtn.setAttribute('aria-pressed', String(rawWordWrap));
    rawWordWrapBtn.classList.toggle('active', rawWordWrap);
    const rawZoomOut = iconButton('Zoom out (−)', 'fa-magnifying-glass-minus');
    const rawZoomIn = iconButton('Zoom in (+)', 'fa-magnifying-glass-plus');
    rawTools.append(rawWordWrapBtn, rawZoomOut, rawZoomIn);
    rawBar.append(rawTitle, rawTools);

    const rawGrid = element('div', 'tt-eal-body-grid');
    const rawRequestBlock = createTextBlock('Raw request', 'Copy raw request', false, toggleRawWordWrap, onRawZoom, renderRawJsonRoleHtml, settings.rawRoleColor, onToggleRawColorizer);
    const rawResponseBlock = createTextBlock('Raw response', 'Copy raw response', false, toggleRawWordWrap, onRawZoom);
    rawGrid.append(rawRequestBlock.root, rawResponseBlock.root);
    rawSection.append(rawBar, rawGrid);

    entrySelect.setAttribute('aria-label', 'Log entry');
    toolbar.append(previousButton, nextButton, entrySelect, reloadButton);
    root.append(toolbar, metaCard, previewSection, rawSection);

    previewZoomer = setupSectionZoom([requestBlock, responseBlock], previewZoomIn, previewZoomOut);
    rawZoomer = setupSectionZoom([rawRequestBlock, rawResponseBlock], rawZoomIn, rawZoomOut);

    setRawWordWrap(rawWordWrap);
    rawWordWrapBtn.addEventListener('click', toggleRawWordWrap);

    function renderIndex() {
        if (selectedId !== null && !entries.some(entry => entry.id === selectedId)) {
            selectedId = entries.at(-1)?.id ?? null;
        }
        const fragment = document.createDocumentFragment();
        for (const entry of [...entries].reverse()) {
            const option = element('option', '', describeIndexEntry(entry));
            option.value = String(entry.id);
            fragment.append(option);
        }
        entrySelect.replaceChildren(fragment);
        entrySelect.value = selectedId === null ? '' : String(selectedId);
        const currentIndex = entries.findIndex(entry => entry.id === selectedId);
        const empty = currentIndex < 0;
        entrySelect.disabled = empty;
        previousButton.disabled = empty || currentIndex === 0;
        nextButton.disabled = empty || currentIndex === entries.length - 1;
        reloadButton.disabled = empty;
        if (empty) {
            metaCard.classList.remove('error');
            metaInfo.textContent = 'No LLM API entries yet.';
            requestBlock.setValue('');
            responseBlock.setValue('');
            rawRequestBlock.setValue('');
            rawResponseBlock.setValue('');
        }
    }

    async function loadEntry() {
        await Promise.all([loadPreview(), loadRaw()]);
    }

    async function select(id) {
        selectedId = id;
        renderIndex();
        await loadEntry();
    }

    async function loadPreview() {
        const id = selectedId;
        if (!id) {
            renderIndex();
            return;
        }
        const epoch = ++previewEpoch;
        requestBlock.setValue('Loading…');
        responseBlock.setValue('Loading…');
        metaCard.classList.remove('error');
        metaInfo.textContent = 'Loading entry…';
        try {
            const preview = await api.getPreview(id);
            if (disposed || epoch !== previewEpoch || selectedId !== id) {
                return;
            }
            metaCard.classList.toggle('error', !preview.ok || Boolean(preview.errorMessage));
            metaInfo.textContent = formatPreviewMeta(preview);
            requestBlock.setValue(String(preview?.requestReadable ?? ''));
            responseBlock.setValue(String(preview?.responseReadable ?? ''));
        } catch (error) {
            if (!disposed && epoch === previewEpoch && selectedId === id) {
                metaCard.classList.add('error');
                metaInfo.textContent = errorMessage(error);
                requestBlock.setValue('');
                responseBlock.setValue('');
            }
        }
    }

    async function loadRaw() {
        const id = selectedId;
        if (!id) {
            return;
        }
        const epoch = ++rawEpoch;
        rawRequestBlock.setValue('Loading…');
        rawResponseBlock.setValue('Loading…');
        try {
            const raw = await api.getRaw(id);
            if (disposed || epoch !== rawEpoch || selectedId !== id) {
                return;
            }
            rawRequestBlock.setValue(String(raw?.requestRaw ?? ''));
            rawResponseBlock.setValue(String(raw?.responseRaw ?? ''));
        } catch (error) {
            if (!disposed && epoch === rawEpoch && selectedId === id) {
                rawRequestBlock.setValue(errorMessage(error));
                rawResponseBlock.setValue('');
            }
        }
    }

    function selectRelative(delta) {
        const index = entries.findIndex(entry => entry.id === selectedId);
        if (index < 0) {
            return;
        }
        const next = Math.max(0, Math.min(index + delta, entries.length - 1));
        void select(entries[next]?.id ?? selectedId);
    }

    entrySelect.addEventListener('change', () => {
        void select(Number(entrySelect.value));
    });
    previousButton.addEventListener('click', () => selectRelative(-1));
    nextButton.addEventListener('click', () => selectRelative(1));
    reloadButton.addEventListener('click', () => {
        void loadEntry();
    });
    applyButton.addEventListener('click', async () => {
        const nextKeep = positiveInteger(keepInput.value);
        if (!nextKeep) {
            reportError(new Error('Keep entries must be a positive whole number.'));
            return;
        }
        applyButton.disabled = true;
        try {
            await api.setKeep(nextKeep);
            keep = nextKeep;
            keepInput.value = String(keep);
            entries = trimTail(await api.index({ limit: keep }), keep);
            if (!entries.some(entry => entry.id === selectedId)) {
                selectedId = entries.at(-1)?.id ?? null;
            }
            renderIndex();
            await loadEntry();
        } catch (error) {
            reportError(error, 'Could not update log retention.');
        } finally {
            applyButton.disabled = false;
        }
    });

    function bindCopyButton(button, getAreaValue, label) {
        let copyTimeout = null;
        button.addEventListener('click', async () => {
            try {
                await copyText(getAreaValue());
                if (copyTimeout) {
                    clearTimeout(copyTimeout);
                }
                button.classList.add('copied');
                setIconButton(button, 'Copied!', 'fa-check');
                copyTimeout = setTimeout(() => {
                    button.classList.remove('copied');
                    setIconButton(button, label, 'fa-copy');
                    copyTimeout = null;
                }, 1200);
            } catch (error) {
                reportError(error, 'Could not copy to clipboard.');
            }
        });
        return () => {
            if (copyTimeout) {
                clearTimeout(copyTimeout);
                copyTimeout = null;
            }
        };
    }

    const copyCleanups = [
        bindCopyButton(requestBlock.copyButton, () => requestBlock.area.value, 'Copy request'),
        bindCopyButton(responseBlock.copyButton, () => responseBlock.area.value, 'Copy response'),
        bindCopyButton(rawRequestBlock.copyButton, () => rawRequestBlock.area.value, 'Copy raw request'),
        bindCopyButton(rawResponseBlock.copyButton, () => rawResponseBlock.area.value, 'Copy raw response'),
    ];

    renderIndex();
    await loadEntry();

    Promise.resolve(api.subscribeIndex(entry => {
        if (disposed || entries.some(existing => existing.id === entry?.id)) {
            return;
        }
        const followingLatest = selectedId === entries.at(-1)?.id || entries.length === 0;
        entries = mergeById(entries, entry, keep);
        if (followingLatest) {
            selectedId = entries.at(-1)?.id ?? null;
            renderIndex();
            void loadEntry();
        } else {
            renderIndex();
        }
    })).then(stop => {
        if (disposed) {
            stop?.();
        } else {
            unsubscribe = stop;
        }
    }).catch(error => reportError(error, 'Could not subscribe to LLM API logs.'));

    return {
        root,
        cleanup() {
            if (disposed) {
                return;
            }
            disposed = true;
            previewEpoch += 1;
            rawEpoch += 1;
            for (const cleanup of copyCleanups) {
                cleanup();
            }
            requestBlock.cleanup();
            responseBlock.cleanup();
            rawRequestBlock.cleanup();
            rawResponseBlock.cleanup();
            try {
                unsubscribe?.();
            } catch (error) {
                console.warn('[TauriTavern Easy Access Logs] LLM log unsubscribe failed.', error);
            }
        },
    };
}

function setupSectionZoom(blocks, zoomInBtn, zoomOutBtn) {
    let zoomIndex = DEFAULT_ZOOM_INDEX;

    function applyZoom(delta) {
        zoomIndex = Math.max(0, Math.min(zoomIndex + delta, ZOOM_LEVELS.length - 1));
        const fontSize = ZOOM_LEVELS[zoomIndex];
        for (const block of blocks) {
            block.area.style.fontSize = fontSize;
            if (block.codeView) {
                block.codeView.style.fontSize = fontSize;
            }
        }
    }

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => applyZoom(1));
    }
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => applyZoom(-1));
    }

    return applyZoom;
}

function createPanelShell(title, description, mark) {
    const root = element('div', 'tt-eal-panel');
    const header = element('header', 'tt-eal-panel-header');
    const titleBlock = element('div', 'tt-eal-panel-title');
    titleBlock.append(element('h2', '', title));
    if (description) {
        titleBlock.append(element('p', '', description));
    }
    header.append(titleBlock, element('span', 'tt-eal-panel-mark', mark));
    root.append(header);
    return root;
}

function createTextBlock(title, copyLabel, softWrap = true, onToggleWrap = null, onZoom = null, colorizer = null, initialColorized = false, onToggleColorizer = null) {
    const root = element('section', 'tt-eal-text-block');
    const header = element('header');
    const titleElem = element('b', '', title);
    const actions = element('div', 'tt-eal-block-actions');
    let colorizeBtn = null;
    let zoomOutBtn = null;
    let zoomInBtn = null;
    let wrapButton = null;
    let isColorized = Boolean(initialColorized);

    const area = element('textarea', 'text_pole');
    let codeView = null;

    if (typeof colorizer === 'function') {
        codeView = element('div', 'text_pole tt-eal-code-view');
        codeView.setAttribute('tabindex', '0');
        codeView.setAttribute('role', 'region');
        codeView.setAttribute('aria-label', `${title} (colorized view)`);
        codeView.style.display = isColorized ? 'block' : 'none';
        area.style.display = isColorized ? 'none' : '';

        colorizeBtn = iconButton('Toggle role colors', 'fa-palette');
        colorizeBtn.classList.toggle('active', isColorized);
        colorizeBtn.setAttribute('aria-pressed', String(isColorized));
        colorizeBtn.title = isColorized ? 'Role colors: On' : 'Toggle role colors';
        colorizeBtn.setAttribute('aria-label', isColorized ? 'Role colors: On' : 'Toggle role colors');

        colorizeBtn.addEventListener('click', () => {
            isColorized = !isColorized;
            colorizeBtn.classList.toggle('active', isColorized);
            colorizeBtn.setAttribute('aria-pressed', String(isColorized));
            colorizeBtn.title = isColorized ? 'Role colors: On' : 'Toggle role colors';
            colorizeBtn.setAttribute('aria-label', isColorized ? 'Role colors: On' : 'Toggle role colors');
            if (isColorized) {
                codeView.innerHTML = colorizer(area.value);
                area.style.display = 'none';
                codeView.style.display = 'block';
            } else {
                codeView.style.display = 'none';
                area.style.display = '';
            }
            onToggleColorizer?.(isColorized);
        });
        actions.append(colorizeBtn);
    }

    if (typeof onZoom === 'function') {
        zoomOutBtn = iconButton(`Zoom out (${title.toLowerCase()})`, 'fa-magnifying-glass-minus');
        zoomOutBtn.classList.add('tt-eal-fullscreen-only-tool');
        zoomOutBtn.addEventListener('click', () => {
            onZoom(-1);
        });

        zoomInBtn = iconButton(`Zoom in (${title.toLowerCase()})`, 'fa-magnifying-glass-plus');
        zoomInBtn.classList.add('tt-eal-fullscreen-only-tool');
        zoomInBtn.addEventListener('click', () => {
            onZoom(1);
        });

        actions.append(zoomOutBtn, zoomInBtn);
    }

    if (typeof onToggleWrap === 'function') {
        wrapButton = iconButton('Toggle word wrap', 'fa-align-left');
        wrapButton.classList.add('tt-eal-fullscreen-only-tool');
        wrapButton.addEventListener('click', () => {
            onToggleWrap();
        });
        actions.append(wrapButton);
    }

    const fullscreenButton = iconButton(`Fullscreen ${title.toLowerCase()}`, 'fa-expand');
    const copyButton = iconButton(copyLabel, 'fa-copy');

    area.readOnly = true;
    area.rows = 9;
    area.wrap = softWrap ? 'soft' : 'off';
    area.setAttribute('aria-label', title);

    let isFullscreen = false;
    let escapeHandler = null;

    function setFullscreen(enabled) {
        if (isFullscreen === enabled) {
            return;
        }
        isFullscreen = enabled;
        root.classList.toggle('tt-eal-fullscreen', isFullscreen);
        document.body.classList.toggle('tt-eal-has-fullscreen', isFullscreen);
        const icon = isFullscreen ? 'fa-compress' : 'fa-expand';
        const label = isFullscreen ? `Exit fullscreen (${title})` : `Fullscreen ${title.toLowerCase()}`;
        setIconButton(fullscreenButton, label, icon);

        void setTauriWindowFullscreen(isFullscreen);

        if (isFullscreen) {
            escapeHandler = (event) => {
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    setFullscreen(false);
                    fullscreenButton.focus();
                }
            };
            document.addEventListener('keydown', escapeHandler, { capture: true });
            if (isColorized && codeView) {
                codeView.focus();
            } else {
                area.focus();
            }
        } else {
            if (escapeHandler) {
                document.removeEventListener('keydown', escapeHandler, { capture: true });
                escapeHandler = null;
            }
            fullscreenButton.focus();
        }
    }

    fullscreenButton.addEventListener('click', () => {
        setFullscreen(!isFullscreen);
    });

    actions.append(fullscreenButton, copyButton);
    header.append(titleElem, actions);
    if (codeView) {
        root.append(header, area, codeView);
    } else {
        root.append(header, area);
    }

    function setValue(val) {
        const text = String(val ?? '');
        area.value = text;
        if (codeView && isColorized && typeof colorizer === 'function') {
            codeView.innerHTML = colorizer(text);
        }
    }

    return {
        root,
        area,
        codeView,
        setValue,
        copyButton,
        fullscreenButton,
        wrapButton,
        zoomOutButton: zoomOutBtn,
        zoomInButton: zoomInBtn,
        colorizeButton: colorizeBtn,
        setFullscreen,
        setWrapState(enabled) {
            area.wrap = enabled ? 'soft' : 'off';
            area.style.whiteSpace = enabled ? 'pre-wrap' : 'pre';
            if (codeView) {
                codeView.style.whiteSpace = enabled ? 'pre-wrap' : 'pre';
            }
            if (wrapButton) {
                wrapButton.classList.toggle('active', enabled);
                wrapButton.setAttribute('aria-pressed', String(enabled));
                wrapButton.title = enabled ? 'Word wrap: On' : 'Toggle word wrap';
                wrapButton.setAttribute('aria-label', enabled ? 'Word wrap: On' : 'Toggle word wrap');
            }
        },
        cleanup() {
            if (escapeHandler) {
                document.removeEventListener('keydown', escapeHandler, { capture: true });
                escapeHandler = null;
            }
            if (isFullscreen) {
                isFullscreen = false;
                root.classList.remove('tt-eal-fullscreen');
                document.body.classList.remove('tt-eal-has-fullscreen');
                void setTauriWindowFullscreen(false);
            }
        }
    };
}

function setIconButton(button, label, icon) {
    button.title = label;
    button.setAttribute('aria-label', label);
    const iconElement = element('i', `fa-solid ${icon}`);
    iconElement.setAttribute('aria-hidden', 'true');
    button.replaceChildren(iconElement);
}

function formatPreviewMeta(preview) {
    const lines = [
        `${preview.source ?? 'Unknown'}${preview.model ? ` (${preview.model})` : ''}`,
        String(preview.endpoint ?? ''),
        `Duration: ${Number(preview.durationMs) || 0}ms · ${preview.ok ? 'OK' : 'ERROR'} · ${formatTimestamp(preview.timestampMs)}`,
    ];
    if (preview.errorMessage) {
        lines.push(String(preview.errorMessage));
    }
    return lines.filter(Boolean).join('\n');
}

async function copyText(value) {
    const text = String(value ?? '');
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const fallback = element('textarea');
    fallback.value = text;
    fallback.style.position = 'fixed';
    fallback.style.opacity = '0';
    document.body.append(fallback);
    fallback.select();
    const copied = document.execCommand('copy');
    fallback.remove();
    if (!copied) {
        throw new Error('Clipboard access is unavailable');
    }
}

function menuButton(label, icon) {
    const button = element('button', 'menu_button menu_button_icon');
    button.type = 'button';
    setButton(button, label, icon);
    return button;
}

function iconButton(label, icon) {
    const button = element('button', 'menu_button menu_button_icon tt-eal-icon-button');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    const iconElement = element('i', `fa-solid ${icon}`);
    iconElement.setAttribute('aria-hidden', 'true');
    button.append(iconElement);
    return button;
}

function setButton(button, label, icon) {
    const iconElement = element('i', `fa-solid ${icon}`);
    iconElement.setAttribute('aria-hidden', 'true');
    button.replaceChildren(iconElement, element('span', '', label));
}

function element(tag, className = '', text = null) {
    const node = document.createElement(tag);
    if (className) {
        node.className = className;
    }
    if (text !== null) {
        node.textContent = String(text);
    }
    return node;
}

function requireElement(root, selector) {
    const node = root.querySelector(selector);
    if (!(node instanceof HTMLElement)) {
        throw new Error(`Required extension element is missing: ${selector}`);
    }
    return node;
}

function errorMessage(error) {
    if (typeof error === 'string' && error) {
        return error;
    }
    if (error && typeof error.message === 'string' && error.message) {
        return error.message;
    }
    return 'Unknown error';
}

function reportError(error, prefix = '') {
    const message = [prefix, errorMessage(error)].filter(Boolean).join(' ');
    console.error('[TauriTavern Easy Access Logs]', message, error);
    if (window.toastr && typeof window.toastr.error === 'function') {
        window.toastr.error(message, 'Easy Access Logs');
    }
}

function whenDocumentReady() {
    if (document.readyState !== 'loading') {
        return Promise.resolve();
    }
    return new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
}

function teardown() {
    activePanelCleanup?.();
    activePanelCleanup = null;
    drawerListeners?.abort();
    drawerListeners = null;
    drawerElement?.remove();
    drawerElement = null;
    activationPromise = null;
}
