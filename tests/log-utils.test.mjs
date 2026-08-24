import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
    describeIndexEntry,
    mergeById,
    normalizeLevel,
    positiveInteger,
    trimTail,
} from '../log-utils.js';

test('level normalization accepts frontend and backend casing', () => {
    assert.equal(normalizeLevel('warn'), 'WARN');
    assert.equal(normalizeLevel('ERROR'), 'ERROR');
    assert.equal(normalizeLevel('notice'), 'OTHER');
});

test('live-entry helpers keep a bounded tail and replace duplicate ids', () => {
    assert.deepEqual(trimTail([{ id: 1 }, { id: 2 }, { id: 3 }], 2), [{ id: 2 }, { id: 3 }]);
    assert.deepEqual(
        mergeById([{ id: 1, message: 'old' }, { id: 2 }], { id: 1, message: 'new' }, 2),
        [{ id: 2 }, { id: 1, message: 'new' }],
    );
});

test('positiveInteger rejects unsafe retention values', () => {
    assert.equal(positiveInteger('20'), 20);
    assert.equal(positiveInteger(0), null);
    assert.equal(positiveInteger('1.5'), null);
});

test('index labels retain status and model metadata', () => {
    const label = describeIndexEntry({ ok: false, timestampMs: 0, model: 'image-model', source: 'openai' });
    assert.match(label, /^✕ · /);
    assert.match(label, /image-model$/);
});

test('manifest references loadable extension assets', async () => {
    const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
    assert.equal(manifest.display_name, 'TauriTavern Easy Access Logs');
    await Promise.all([
        readFile(new URL(`../${manifest.js}`, import.meta.url)),
        readFile(new URL(`../${manifest.css}`, import.meta.url)),
        readFile(new URL('../drawer.html', import.meta.url)),
    ]);
});
