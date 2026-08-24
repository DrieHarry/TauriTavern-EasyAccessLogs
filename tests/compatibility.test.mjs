import assert from 'node:assert/strict';
import { test } from 'node:test';

test('activation exits cleanly when TauriTavern APIs are absent', async () => {
    const previousWindow = globalThis.window;
    const previousDocument = globalThis.document;
    globalThis.window = {};
    globalThis.document = { readyState: 'complete' };

    try {
        const extension = await import(`../index.js?non-tauri=${Date.now()}`);
        assert.equal(await extension.onActivate(), false);
        assert.doesNotThrow(() => extension.onDisable());
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window;
        } else {
            globalThis.window = previousWindow;
        }
        if (previousDocument === undefined) {
            delete globalThis.document;
        } else {
            globalThis.document = previousDocument;
        }
    }
});
