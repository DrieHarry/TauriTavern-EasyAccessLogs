import {
    MAX_LIVE_ENTRIES,
    describeIndexEntry,
    formatClock,
    formatTimestamp,
    levelClass,
    mergeById,
    normalizeLevel,
    positiveInteger,
    trimTail,
} from './log-utils.js';

const DRAWER_ID = 'tt-easy-access-logs-drawer';
const DRAWER_PANEL_ID = 'tt-easy-access-logs-panel';
const PANEL_TITLES = Object.freeze({
    llm: 'LLM & Image API Logs',
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

function isDrawerOpen(drawer) {
    return drawer.querySelector(`#${DRAWER_PANEL_ID}`)?.classList.contains('openDrawer') ?? false;
}

function setDrawerOpen(drawer, open) {
    const toggle = requireElement(drawer, '.tt-eal-drawer-toggle');
    const icon = requireElement(drawer, '.drawer-icon');
    const panel = requireElement(drawer, `#${DRAWER_PANEL_ID}`);

    if (open) {
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
        'Requests and responses recorded by TauriTavern, including image-generation metadata.',
        'API TRACE',
    );
    const toolbar = element('div', 'tt-eal-toolbar');
    const previousButton = menuButton('Prev', 'fa-chevron-left');
    const nextButton = menuButton('Next', 'fa-chevron-right');
    const entrySelect = element('select', 'text_pole tt-eal-entry-select');
    const reloadButton = menuButton('Reload', 'fa-rotate');
    const settings = element('div', 'tt-eal-settings-row');
    const keepLabel = element('span', '', 'Keep entries');
    const keepInput = element('input', 'text_pole tt-eal-keep-input');
    const applyButton = menuButton('Apply', 'fa-check');
    const note = element('small', '', 'Logs can contain private prompts and responses. Review copied text before sharing.');
    const meta = element('div', 'tt-eal-meta');
    const bodyGrid = element('div', 'tt-eal-body-grid');
    const requestBlock = createTextBlock('Request', 'Copy request');
    const responseBlock = createTextBlock('Response', 'Copy response');
    const rawDetails = element('details', 'tt-eal-raw');
    const rawSummary = element('summary', '', 'Raw JSON / SSE');
    const rawBody = element('div', 'tt-eal-raw-body');
    const rawGrid = element('div', 'tt-eal-body-grid');
    const rawRequestBlock = createTextBlock('Raw request', 'Copy raw request', false);
    const rawResponseBlock = createTextBlock('Raw response', 'Copy raw response', false);

    entrySelect.setAttribute('aria-label', 'Log entry');
    keepInput.type = 'number';
    keepInput.min = '1';
    keepInput.step = '1';
    keepInput.value = String(keep);
    note.className = 'tt-eal-drawer-description';
    toolbar.append(previousButton, nextButton, entrySelect, reloadButton);
    settings.append(keepLabel, keepInput, applyButton, note);
    bodyGrid.append(requestBlock.root, responseBlock.root);
    rawGrid.append(rawRequestBlock.root, rawResponseBlock.root);
    rawBody.append(rawGrid);
    rawDetails.append(rawSummary, rawBody);
    root.append(toolbar, settings, meta, bodyGrid, rawDetails);

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
            meta.classList.remove('error');
            meta.textContent = 'No LLM or image API entries yet.';
            requestBlock.area.value = '';
            responseBlock.area.value = '';
            rawRequestBlock.area.value = '';
            rawResponseBlock.area.value = '';
        }
    }

    async function select(id) {
        selectedId = id;
        renderIndex();
        rawEpoch += 1;
        rawRequestBlock.area.value = '';
        rawResponseBlock.area.value = '';
        await loadPreview();
        if (rawDetails.open) {
            await loadRaw();
        }
    }

    async function loadPreview() {
        const id = selectedId;
        if (!id) {
            renderIndex();
            return;
        }
        const epoch = ++previewEpoch;
        requestBlock.area.value = 'Loading…';
        responseBlock.area.value = 'Loading…';
        meta.classList.remove('error');
        meta.textContent = 'Loading entry…';
        try {
            const preview = await api.getPreview(id);
            if (disposed || epoch !== previewEpoch || selectedId !== id) {
                return;
            }
            meta.classList.toggle('error', !preview.ok || Boolean(preview.errorMessage));
            meta.textContent = formatPreviewMeta(preview);
            requestBlock.area.value = String(preview.requestReadable ?? '');
            responseBlock.area.value = String(preview.responseReadable ?? '');
        } catch (error) {
            if (!disposed && epoch === previewEpoch && selectedId === id) {
                meta.classList.add('error');
                meta.textContent = errorMessage(error);
                requestBlock.area.value = '';
                responseBlock.area.value = '';
            }
        }
    }

    async function loadRaw() {
        const id = selectedId;
        if (!id || !rawDetails.open) {
            return;
        }
        const epoch = ++rawEpoch;
        rawRequestBlock.area.value = 'Loading…';
        rawResponseBlock.area.value = 'Loading…';
        try {
            const raw = await api.getRaw(id);
            if (disposed || epoch !== rawEpoch || selectedId !== id || !rawDetails.open) {
                return;
            }
            rawRequestBlock.area.value = String(raw.requestRaw ?? '');
            rawResponseBlock.area.value = String(raw.responseRaw ?? '');
        } catch (error) {
            if (!disposed && epoch === rawEpoch && selectedId === id) {
                rawRequestBlock.area.value = errorMessage(error);
                rawResponseBlock.area.value = '';
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
        void loadPreview().then(() => rawDetails.open && loadRaw());
    });
    rawDetails.addEventListener('toggle', () => {
        if (rawDetails.open) {
            void loadRaw();
        } else {
            rawEpoch += 1;
            rawRequestBlock.area.value = '';
            rawResponseBlock.area.value = '';
        }
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
            await loadPreview();
        } catch (error) {
            reportError(error, 'Could not update log retention.');
        } finally {
            applyButton.disabled = false;
        }
    });

    requestBlock.copyButton.addEventListener('click', () => void copyText(requestBlock.area.value));
    responseBlock.copyButton.addEventListener('click', () => void copyText(responseBlock.area.value));
    rawRequestBlock.copyButton.addEventListener('click', () => void copyText(rawRequestBlock.area.value));
    rawResponseBlock.copyButton.addEventListener('click', () => void copyText(rawResponseBlock.area.value));

    renderIndex();
    await loadPreview();

    Promise.resolve(api.subscribeIndex(entry => {
        if (disposed || entries.some(existing => existing.id === entry?.id)) {
            return;
        }
        const followingLatest = selectedId === entries.at(-1)?.id || entries.length === 0;
        entries = mergeById(entries, entry, keep);
        if (followingLatest) {
            selectedId = entries.at(-1)?.id ?? null;
            renderIndex();
            void loadPreview();
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
            try {
                unsubscribe?.();
            } catch (error) {
                console.warn('[TauriTavern Easy Access Logs] LLM log unsubscribe failed.', error);
            }
        },
    };
}

function createPanelShell(title, description, mark) {
    const root = element('div', 'tt-eal-panel');
    const header = element('header', 'tt-eal-panel-header');
    const titleBlock = element('div', 'tt-eal-panel-title');
    titleBlock.append(element('h2', '', title), element('p', '', description));
    header.append(titleBlock, element('span', 'tt-eal-panel-mark', mark));
    root.append(header);
    return root;
}

function createTextBlock(title, copyLabel, softWrap = true) {
    const root = element('section', 'tt-eal-text-block');
    const header = element('header');
    const copyButton = menuButton(copyLabel, 'fa-copy');
    const area = element('textarea', 'text_pole');
    area.readOnly = true;
    area.rows = 12;
    area.wrap = softWrap ? 'soft' : 'off';
    area.setAttribute('aria-label', title);
    header.append(element('b', '', title), copyButton);
    root.append(header, area);
    return { root, area, copyButton };
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
