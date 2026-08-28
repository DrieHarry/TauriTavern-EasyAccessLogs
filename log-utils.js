export const MAX_LIVE_ENTRIES = 800;
export const SETTINGS_STORAGE_KEY = 'tt_eal_settings';

export const DEFAULT_HOTKEYS = Object.freeze({
    llm: { key: 'F10', ctrl: false, alt: false, shift: false, meta: false },
    frontend: { key: 'F10', ctrl: true, alt: false, shift: false, meta: false },
    backend: { key: 'F10', ctrl: false, alt: true, shift: false, meta: false },
});

export function normalizeHotkey(hotkey) {
    if (!hotkey || typeof hotkey !== 'object' || !hotkey.key) {
        return null;
    }
    let key = String(hotkey.key).trim().toUpperCase();
    if (!key) {
        return null;
    }
    if (key === 'CTRL') {
        key = 'CONTROL';
    }
    return {
        key,
        ctrl: Boolean(hotkey.ctrl),
        alt: Boolean(hotkey.alt),
        shift: Boolean(hotkey.shift),
        meta: Boolean(hotkey.meta),
    };
}

export function isModifierKeyName(key) {
    if (!key) return false;
    const k = String(key).trim().toUpperCase();
    return k === 'CONTROL' || k === 'CTRL' || k === 'ALT' || k === 'SHIFT' || k === 'META';
}

export function isModifierHotkey(hotkey) {
    const norm = normalizeHotkey(hotkey);
    if (!norm) return false;
    return isModifierKeyName(norm.key);
}

export function matchesModifierHotkey(pressedKeyName, hotkey) {
    const norm = normalizeHotkey(hotkey);
    if (!norm || !pressedKeyName) return false;
    const p = String(pressedKeyName).trim().toUpperCase();
    const k = norm.key.toUpperCase();
    if ((p === 'CONTROL' || p === 'CTRL') && (k === 'CONTROL' || k === 'CTRL')) return true;
    if (p === 'ALT' && k === 'ALT') return true;
    if (p === 'SHIFT' && k === 'SHIFT') return true;
    if (p === 'META' && k === 'META') return true;
    return false;
}

export function formatHotkey(hotkey) {
    const norm = normalizeHotkey(hotkey);
    if (!norm) {
        return 'None';
    }
    const k = norm.key.toUpperCase();
    if (k === 'CONTROL' || k === 'CTRL') return 'Ctrl';
    if (k === 'ALT') return 'Alt';
    if (k === 'SHIFT') return 'Shift';
    if (k === 'META') return 'Meta';

    const parts = [];
    if (norm.ctrl) parts.push('Ctrl');
    if (norm.alt) parts.push('Alt');
    if (norm.shift) parts.push('Shift');
    if (norm.meta) parts.push('Meta');
    parts.push(norm.key === 'TAB' ? 'Tab' : norm.key);
    return parts.join(' + ');
}

export function matchesHotkey(event, hotkey) {
    const norm = normalizeHotkey(hotkey);
    if (!event || !norm) {
        return false;
    }
    if (isModifierHotkey(norm)) {
        return false;
    }
    const eventKey = String(event.key || '').toUpperCase();
    const eventCode = String(event.code || '').toUpperCase();
    const targetKey = norm.key;

    const keyMatches = eventKey === targetKey || eventCode === targetKey || eventCode === `KEY${targetKey}` || eventCode === `DIGIT${targetKey}`;
    if (!keyMatches) {
        return false;
    }

    const ctrlMatches = norm.ctrl === Boolean(event.ctrlKey);
    const altMatches = norm.alt === Boolean(event.altKey);
    const shiftMatches = norm.shift === Boolean(event.shiftKey);
    const metaMatches = norm.meta === Boolean(event.metaKey);

    return ctrlMatches && altMatches && shiftMatches && metaMatches;
}

export function resolveHotkeySetting(saved, defaultHotkey) {
    if (saved === null) {
        return null;
    }
    if (saved === undefined) {
        return { ...defaultHotkey };
    }
    return normalizeHotkey(saved);
}

export function loadExtensionSettings(storage = globalThis.localStorage) {
    try {
        const raw = storage?.getItem?.(SETTINGS_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            const showDropdown = Boolean(parsed?.showUserSettingsDropdown);
            const showTopbar = showDropdown ? false : (parsed?.showTopbarIcon === true || (parsed?.showTopbarIcon === undefined && !showDropdown));
            return {
                rawWordWrap: Boolean(parsed?.rawWordWrap),
                previewRoleColor: Boolean(parsed?.previewRoleColor),
                rawRoleColor: Boolean(parsed?.rawRoleColor),
                showTopbarIcon: showTopbar,
                showUserSettingsDropdown: showDropdown,
                hotkeys: {
                    llm: resolveHotkeySetting(parsed?.hotkeys?.llm, DEFAULT_HOTKEYS.llm),
                    frontend: resolveHotkeySetting(parsed?.hotkeys?.frontend, DEFAULT_HOTKEYS.frontend),
                    backend: resolveHotkeySetting(parsed?.hotkeys?.backend, DEFAULT_HOTKEYS.backend),
                },
            };
        }
    } catch (error) {
        // ignore
    }
    return {
        rawWordWrap: false,
        previewRoleColor: false,
        rawRoleColor: false,
        showTopbarIcon: true,
        showUserSettingsDropdown: false,
        hotkeys: {
            llm: { ...DEFAULT_HOTKEYS.llm },
            frontend: { ...DEFAULT_HOTKEYS.frontend },
            backend: { ...DEFAULT_HOTKEYS.backend },
        },
    };
}

export function saveExtensionSettings(patch, storage = globalThis.localStorage) {
    try {
        const current = loadExtensionSettings(storage);
        const updated = {
            ...current,
            ...patch,
            hotkeys: patch.hotkeys ? { ...current.hotkeys, ...patch.hotkeys } : current.hotkeys,
        };
        storage?.setItem?.(SETTINGS_STORAGE_KEY, JSON.stringify(updated));
        return updated;
    } catch (error) {
        // ignore
    }
    return null;
}

export function normalizeLevel(value) {
    const level = String(value ?? 'OTHER').trim().toUpperCase();
    return ['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(level) ? level : 'OTHER';
}

export function levelClass(value) {
    return `tt-eal-level-${normalizeLevel(value).toLowerCase()}`;
}

export function trimTail(entries, limit = MAX_LIVE_ENTRIES) {
    if (!Array.isArray(entries)) {
        return [];
    }
    const safeLimit = Number.isSafeInteger(limit) && limit > 0 ? limit : MAX_LIVE_ENTRIES;
    return entries.slice(-safeLimit);
}

export function mergeById(entries, entry, limit) {
    const current = Array.isArray(entries) ? entries : [];
    const nextId = entry?.id;
    const withoutDuplicate = nextId === undefined
        ? current
        : current.filter(item => item?.id !== nextId);
    return trimTail([...withoutDuplicate, entry], limit);
}

export function positiveInteger(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function formatClock(timestampMs) {
    const date = new Date(Number(timestampMs));
    if (Number.isNaN(date.getTime())) {
        return '--:--:--';
    }
    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    });
}

export function formatTimestamp(timestampMs) {
    const date = new Date(Number(timestampMs));
    return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString();
}

export function describeIndexEntry(entry) {
    const status = entry?.ok ? '✓' : '✕';
    const source = entry?.model || entry?.source || 'Unknown';
    return `${status} · ${formatClock(entry?.timestampMs)} · ${source}`;
}

export function escapeHtml(str) {
    return String(str ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

export function renderFormattedRoleHtml(text) {
    if (!text) {
        return '';
    }
    const roleRegex = /(?:^|\n\n|\r\n\r\n|\n)\[(system|assistant|user|developer|model|thought)\](?:\r?\n|$)/gi;
    const matches = [...text.matchAll(roleRegex)];
    if (matches.length === 0) {
        return `<div class="tt-eal-role-segment tt-eal-role-neutral"><span class="tt-eal-role-body">${escapeHtml(text)}</span></div>`;
    }

    const parts = [];
    let currentRole = null;
    let currentTag = '';
    let pos = 0;

    for (const m of matches) {
        const matchStart = m.index + (m[0].startsWith('\n') ? (m[0].startsWith('\r\n\r\n') ? 4 : m[0].startsWith('\n\n') ? 2 : 1) : 0);
        const tagText = `[${m[1]}]`;
        const role = m[1].toLowerCase();

        if (matchStart > pos) {
            const prevContent = text.slice(pos, matchStart);
            if (currentRole) {
                parts.push(`<div class="tt-eal-role-segment tt-eal-role-${currentRole}"><span class="tt-eal-role-tag">${escapeHtml(currentTag)}</span>\n<span class="tt-eal-role-body">${escapeHtml(prevContent.trimEnd())}</span></div>`);
            } else if (prevContent.trim()) {
                parts.push(`<div class="tt-eal-role-segment tt-eal-role-neutral"><span class="tt-eal-role-body">${escapeHtml(prevContent.trimEnd())}</span></div>`);
            }
        }

        currentRole = role;
        currentTag = tagText;
        pos = m.index + m[0].length;
    }

    if (pos < text.length) {
        const tailContent = text.slice(pos);
        if (currentRole) {
            parts.push(`<div class="tt-eal-role-segment tt-eal-role-${currentRole}"><span class="tt-eal-role-tag">${escapeHtml(currentTag)}</span>\n<span class="tt-eal-role-body">${escapeHtml(tailContent.trimEnd())}</span></div>`);
        } else {
            parts.push(`<div class="tt-eal-role-segment tt-eal-role-neutral"><span class="tt-eal-role-body">${escapeHtml(tailContent.trimEnd())}</span></div>`);
        }
    } else if (currentRole) {
        parts.push(`<div class="tt-eal-role-segment tt-eal-role-${currentRole}"><span class="tt-eal-role-tag">${escapeHtml(currentTag)}</span></div>`);
    }

    return parts.join('\n');
}

export function renderRawJsonRoleHtml(text) {
    if (!text) {
        return '';
    }

    const tokenRegex = /("(?:[^"\\]|\\.)*")|(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\b(?:true|false|null)\b)|([{}[\]:,])|([^\s"{}[\]:,]+)|(\s+)/g;
    const tokens = [];
    let match;

    while ((match = tokenRegex.exec(text)) !== null) {
        let type = 'other';
        if (match[1] !== undefined) {
            type = 'string';
        } else if (match[2] !== undefined) {
            type = 'number';
        } else if (match[3] !== undefined) {
            type = 'boolean_or_null';
        } else if (match[4] !== undefined) {
            type = 'punct';
        } else if (match[6] !== undefined) {
            type = 'ws';
        }
        tokens.push({
            type,
            text: match[0],
            index: match.index,
            end: match.index + match[0].length,
        });
    }

    if (tokens.length === 0) {
        return escapeHtml(text);
    }

    const roleBlocks = [];
    const stack = [];
    let prevNonWsToken = null;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'ws') {
            continue;
        }

        if (token.text === '{') {
            stack.push({
                startIndex: token.index,
                role: null,
                roleTagToken: null,
            });
        } else if (token.text === '}') {
            const currentObj = stack.pop();
            if (currentObj && currentObj.role) {
                roleBlocks.push({
                    start: currentObj.startIndex,
                    end: token.end,
                    role: currentObj.role,
                    roleTagToken: currentObj.roleTagToken,
                });
            }
        } else if (token.type === 'string' && stack.length > 0) {
            const currentObj = stack[stack.length - 1];
            if (prevNonWsToken && prevNonWsToken.text === ':') {
                let keyToken = null;
                for (let j = i - 1; j >= 0; j--) {
                    if (tokens[j].type === 'ws') continue;
                    if (tokens[j].text === ':') continue;
                    keyToken = tokens[j];
                    break;
                }
                if (keyToken && keyToken.type === 'string') {
                    const rawKey = keyToken.text.slice(1, -1);
                    if (rawKey === 'role') {
                        const rawVal = token.text.slice(1, -1).toLowerCase();
                        if (['system', 'user', 'assistant', 'developer', 'model', 'thought'].includes(rawVal)) {
                            currentObj.role = rawVal;
                            currentObj.roleTagToken = token;
                        }
                    }
                }
            }
        }

        prevNonWsToken = token;
    }

    function findRoleBlock(index) {
        for (let b = roleBlocks.length - 1; b >= 0; b--) {
            if (index >= roleBlocks[b].start && index < roleBlocks[b].end) {
                return roleBlocks[b];
            }
        }
        return null;
    }

    let html = '';
    const activeBlocks = new Set();

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        for (const rb of roleBlocks) {
            if (rb.start === token.index && !activeBlocks.has(rb)) {
                activeBlocks.add(rb);
                html += `<div class="tt-eal-json-role-block tt-eal-json-role-${rb.role}">`;
            }
        }

        const currentBlock = findRoleBlock(token.index);

        if (token.type === 'ws') {
            html += escapeHtml(token.text);
        } else if (token.type === 'punct') {
            html += `<span class="tt-eal-json-punct">${escapeHtml(token.text)}</span>`;
        } else if (token.type === 'number') {
            html += `<span class="tt-eal-json-num">${escapeHtml(token.text)}</span>`;
        } else if (token.type === 'boolean_or_null') {
            html += `<span class="tt-eal-json-bool">${escapeHtml(token.text)}</span>`;
        } else if (token.type === 'string') {
            let isKey = false;
            for (let j = i + 1; j < tokens.length; j++) {
                if (tokens[j].type === 'ws') continue;
                if (tokens[j].text === ':') isKey = true;
                break;
            }

            if (isKey) {
                html += `<span class="tt-eal-json-key">${escapeHtml(token.text)}</span>`;
            } else if (currentBlock && currentBlock.roleTagToken === token) {
                html += `<span class="tt-eal-json-str tt-eal-json-role-tag">${escapeHtml(token.text)}</span>`;
            } else if (currentBlock) {
                let isContent = false;
                for (let j = i - 1; j >= 0; j--) {
                    if (tokens[j].type === 'ws') continue;
                    if (tokens[j].text === ':') continue;
                    if (tokens[j].type === 'string') {
                        const rawKey = tokens[j].text.slice(1, -1);
                        if (rawKey === 'content' || rawKey === 'text') {
                            isContent = true;
                        }
                    }
                    break;
                }
                if (isContent) {
                    html += `<span class="tt-eal-json-str tt-eal-json-role-content">${escapeHtml(token.text)}</span>`;
                } else {
                    html += `<span class="tt-eal-json-str">${escapeHtml(token.text)}</span>`;
                }
            } else {
                html += `<span class="tt-eal-json-str">${escapeHtml(token.text)}</span>`;
            }
        } else {
            html += escapeHtml(token.text);
        }

        for (const rb of roleBlocks) {
            if (rb.end === token.end && activeBlocks.has(rb)) {
                activeBlocks.delete(rb);
                html += '</div>';
            }
        }
    }

    for (let count = 0; count < activeBlocks.size; count++) {
        html += '</div>';
    }

    return html;
}
