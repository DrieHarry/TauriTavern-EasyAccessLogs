import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
    describeIndexEntry,
    escapeHtml,
    loadExtensionSettings,
    mergeById,
    normalizeLevel,
    positiveInteger,
    renderFormattedRoleHtml,
    renderRawJsonRoleHtml,
    saveExtensionSettings,
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

test('escapeHtml sanitizes html special characters', () => {
    assert.equal(escapeHtml('<script>alert("xss")</script> & \'test\''), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;');
});

test('renderFormattedRoleHtml colorizes system, user, and assistant segments', () => {
    const sample = `[system]\nWrite Seraphina's next reply.\n\n[user]\nHello there!\n\n[assistant]\n*smiles* Hello Andrie.`;
    const html = renderFormattedRoleHtml(sample);
    assert.match(html, /tt-eal-role-system/);
    assert.match(html, /tt-eal-role-user/);
    assert.match(html, /tt-eal-role-assistant/);
    assert.match(html, /Write Seraphina&#39;s next reply/);
    assert.match(html, /Hello there!/);
    assert.match(html, /\*smiles\* Hello Andrie\./);
});

test('renderRawJsonRoleHtml highlights JSON role blocks and retains 100% exact text', () => {
    const jsonSample = JSON.stringify({
        model: 'gpt-5.6-sol',
        input: [
            { role: 'system', content: "Write Seraphina's reply." },
            { role: 'user', content: 'Who are you?' },
            { role: 'assistant', content: [{ text: 'I am Seraphina.', type: 'output_text' }] }
        ]
    }, null, 2);

    const html = renderRawJsonRoleHtml(jsonSample);
    assert.match(html, /tt-eal-json-role-system/);
    assert.match(html, /tt-eal-json-role-user/);
    assert.match(html, /tt-eal-json-role-assistant/);
    assert.match(html, /tt-eal-json-role-content/);

    // Verify text preservation (decoding entities gives exact original JSON string)
    const stripped = html
        .replace(/<[^>]+>/g, '')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&amp;', '&');

    assert.equal(stripped, jsonSample);
});

test('loadExtensionSettings and saveExtensionSettings persist user preferences', () => {
    const mockStorage = {
        store: {},
        getItem(key) {
            return this.store[key] ?? null;
        },
        setItem(key, val) {
            this.store[key] = String(val);
        },
    };

    const initial = loadExtensionSettings(mockStorage);
    assert.deepEqual(initial, {
        rawWordWrap: false,
        previewRoleColor: false,
        rawRoleColor: false,
    });

    saveExtensionSettings({ rawWordWrap: true, previewRoleColor: true }, mockStorage);
    const updated = loadExtensionSettings(mockStorage);
    assert.deepEqual(updated, {
        rawWordWrap: true,
        previewRoleColor: true,
        rawRoleColor: false,
    });
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
