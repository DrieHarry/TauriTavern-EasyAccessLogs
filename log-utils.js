export const MAX_LIVE_ENTRIES = 800;

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
