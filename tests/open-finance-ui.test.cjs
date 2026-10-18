const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('service worker never caches authenticated bank views or falls back offline', async () => {
    const handlers = {};
    const fetches = [];
    const context = {
        self: { addEventListener: (name, callback) => { handlers[name] = callback; } },
        URL,
        caches: { open() { throw new Error('Bank data reached cache'); }, match() { throw new Error('Offline bank fallback'); } },
        fetch: async (request, options) => { fetches.push(options); return { ok: true }; }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../templates/static/sw.js'), 'utf8'), context);
    for (const route of ['/open-finance', '/api/open-finance/inventory', '/api/open-finance/jobs/sync']) {
        let result;
        handlers.fetch({ request: { method: 'GET', url: 'https://finances.test' + route, mode: 'navigate' },
            respondWith(value) { result = value; } });
        assert.equal((await result).ok, true);
        assert.equal(fetches.at(-1).cache, 'no-store');
    }
    context.fetch = async () => { throw new Error('Offline'); };
    let result;
    handlers.fetch({ request: { method: 'GET', url: 'https://finances.test/api/open-finance/inventory' },
        respondWith(value) { result = value; } });
    await assert.rejects(result, /Offline/);
});

test('UI renders hostile provider strings as text and does not persist credentials', async () => {
    class Element {
        constructor() { this.children = []; this.listeners = {}; this.hidden = false; }
        append(...nodes) { this.children.push(...nodes); }
        replaceChildren(...nodes) { this.children = nodes; }
        addEventListener(name, callback) { this.listeners[name] = callback; }
        set innerHTML(value) { throw new Error('Unsafe HTML assignment'); }
    }
    const elements = new Map();
    const get = (id) => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
    const hostile = '<img src=x onerror=alert(1)>';
    const calls = [];
    const context = {
        document: { getElementById: get, createElement: () => new Element() },
        window: { addEventListener() {} },
        fetch: async (url, options) => {
            calls.push({ url, options });
            return { ok: true, status: 200, json: async () => ({
                items: [{ connector: hostile, status: 'synced', provider_status: 'UPDATED' }], consents: [],
                accounts: [{ id: hostile, kind: 'BANK', balance: 10, currency: 'BRL' }], transactions: [],
                sandbox: true,currencies: {},movements: [],projections: [],decisions: [],rules: [],legacy: [],historical_count: 0,pending_count: 0
            }) };
        },
        setInterval() {},
        localStorage: { setItem() { throw new Error('Credential persistence'); } },
        sessionStorage: { setItem() { throw new Error('Credential persistence'); } }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../templates/static/js/open-finance.js'), 'utf8'), context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls[0].options.cache, 'no-store');
    assert.ok(get('connections').children[0].textContent.includes(hostile));
    assert.equal(get('inventory').hidden, false);
    assert.ok(get('status').textContent.includes('sem soma duplicada'));
});
