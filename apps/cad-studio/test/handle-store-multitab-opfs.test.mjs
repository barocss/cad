// #621 partial: real OPFS + Web Locks in two pages of an isolated context; no user project data.
// CHROME=/path/to/chrome PW_DIR=/path/to/playwright/package-parent node --test test/handle-store-multitab-opfs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';

test('canonical OPFS scope serializes separate tabs through close and receipt without blocking other paths', { timeout: 90000 }, async () => {
  assert.ok(process.env.CHROME && process.env.PW_DIR, 'Explicit Chrome and Playwright paths required');
  const root = path.resolve(import.meta.dirname, '..');
  const bundle = await build({ stdin: { contents: "export {handleStore} from './src/storage/handleStore'; export {browserProject} from './src/storage/access';", resolveDir: root }, bundle: true, write: false, format: 'esm', platform: 'browser' });
  const server = createServer((req, res) => { res.setHeader('content-type', req.url === '/store.js' ? 'text/javascript' : 'text/html'); res.end(req.url === '/store.js' ? bundle.outputFiles[0].contents : '<!doctype html><title>Isolated OPFS concurrency fixture</title>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = createRequire(path.join(process.env.PW_DIR, 'package.json'))('playwright');
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME, headless: true });
    const context = await browser.newContext(), a = await context.newPage(), b = await context.newPage();
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const page of [a, b]) {
      await page.goto(origin);
      await page.evaluate(async () => {
        const { browserProject, handleStore } = await import('/store.js');
        const name = 'issue621-isolated';
        const store = await browserProject(name), other = await browserProject('issue621-independent');
        const directory = await (await (await navigator.storage.getDirectory()).getDirectoryHandle('projects')).getDirectoryHandle(name);
        const control = { hold: null, release: null, entered: false, admitted: 0, committed: false };
        const wrap = dir => ({ kind: dir.kind, name: dir.name,
          getDirectoryHandle: async (name, options) => wrap(await dir.getDirectoryHandle(name, options)),
          removeEntry: name => dir.removeEntry(name), entries: () => dir.entries(),
          async getFileHandle(name, options) {
            const h = await dir.getFileHandle(name, options);
            return { kind: h.kind, name: h.name,
              async getFile() {
                if (control.hold === 'receipt' && control.committed) { control.entered = true; await new Promise(resolve => { control.release = resolve; }); control.hold = null; }
                return h.getFile();
              },
              async createWritable() { control.admitted++; const w = await h.createWritable(); return {
                write: data => w.write(data), abort: () => w.abort(),
                async close() {
                  if (control.hold === 'close') { control.entered = true; await new Promise(resolve => { control.release = resolve; }); control.hold = null; }
                  if (control.hold === 'failure') { control.hold = null; throw new Error('fixture close failure'); }
                  await w.close(); control.committed = true;
                },
              }; },
            };
          },
        });
        const held = handleStore(wrap(directory), 'browser', { browserProject: name });
        window.fixture = { store, other, held, control, pending: {}, results: {}, encode: text => new TextEncoder().encode(text) };
        window.start = (id, operation, target, file, value, expect) => {
          const f = window.fixture; delete f.results[id];
          const promise = operation === 'remove' ? f[target].remove(file, { expect }) : f[target].write(file, f.encode(value), { expect });
          f.pending[id] = promise.then(value => f.results[id] = { ok: true, value }, e => f.results[id] = { ok: false, code: e.code, message: e.message });
        };
      });
    }
    for (const stage of ['close', 'receipt']) {
      const tag = await a.evaluate(async stage => { const f = window.fixture; const result = await f.store.write('part.bcad', f.encode('seed-' + stage)); Object.assign(f.control, { hold: stage, entered: false, committed: false }); window.start('a', 'write', 'held', 'part.bcad', 'first-longer-' + stage, result.tag); return result.tag; }, stage);
      await a.waitForFunction(() => window.fixture.control.entered);
      await b.evaluate(tag => { window.start('b', 'write', 'store', 'part.bcad', 'stale-second', tag); window.start('remove', 'remove', 'store', 'part.bcad', '', tag); }, tag);
      // A second path and another project must finish while A remains held.
      await b.evaluate(async () => { await window.fixture.store.write('other.bcad', window.fixture.encode('independent')); await window.fixture.other.write('part.bcad', window.fixture.encode('independent-project')); });
      assert.equal(await b.evaluate(() => 'b' in window.fixture.results || 'remove' in window.fixture.results), false);
      await a.evaluate(async () => { window.fixture.control.release(); await window.fixture.pending.a; });
      const result = await b.evaluate(async () => { await Promise.all([window.fixture.pending.b, window.fixture.pending.remove]); return window.fixture.results; });
      assert.equal(result.b.code, 'STORAGE_CHANGED'); assert.equal(result.remove.code, 'STORAGE_CHANGED');
      const saved = await a.evaluate(async () => ({ receipt: window.fixture.results.a.value.tag, actual: await window.fixture.store.read('part.bcad').then(r => ({ tag: r.tag, text: new TextDecoder().decode(r.bytes) })) }));
      assert.equal(saved.receipt, saved.actual.tag); assert.equal(saved.actual.text, 'first-longer-' + stage);
    }
    // Concurrent absent creates, separate tabs; exactly one succeeds.
    await Promise.all([a.evaluate(() => window.start('new', 'write', 'store', 'new.bcad', 'A', null)), b.evaluate(() => window.start('new', 'write', 'store', 'new.bcad', 'B-longer', null))]);
    const creates = await Promise.all([a, b].map(page => page.evaluate(async () => { await window.fixture.pending.new; return window.fixture.results.new; })));
    assert.equal(creates.filter(r => r.ok).length, 1); assert.equal(creates.find(r => !r.ok).code, 'STORAGE_CHANGED');
    // Failed stream releases lock; other tab may retry using unchanged tag.
    const unchanged = await a.evaluate(async () => { const f = window.fixture; const tag = (await f.store.read('part.bcad')).tag; f.control.hold = 'failure'; window.start('fail', 'write', 'held', 'part.bcad', 'not-committed', tag); await f.pending.fail; return { tag, result: f.results.fail }; });
    assert.equal(unchanged.result.ok, false);
    await b.evaluate(async tag => { await window.fixture.store.write('part.bcad', window.fixture.encode('retry-success'), { expect: tag }); }, unchanged.tag);
    // No Web Locks: explicit fail-closed before any file/remove mutation, reads still work.
    const unsupported = await b.evaluate(async () => {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
      try { window.start('unsupported', 'write', 'store', 'not-created', 'x'); window.start('unsupported-remove', 'remove', 'store', 'part.bcad'); await Promise.all([window.fixture.pending.unsupported, window.fixture.pending['unsupported-remove']]); return { write: window.fixture.results.unsupported, remove: window.fixture.results['unsupported-remove'], missing: await window.fixture.store.read('not-created'), retained: !!(await window.fixture.store.read('part.bcad')) }; }
      finally { delete navigator.locks; }
    });
    assert.equal(unsupported.write.code, 'STORAGE_UNAVAILABLE'); assert.equal(unsupported.remove.code, 'STORAGE_UNAVAILABLE'); assert.equal(unsupported.missing, null); assert.equal(unsupported.retained, true);
    const fifo = await b.evaluate(async () => {
      const f = window.fixture;
      const first = f.store.write('fifo.bcad', f.encode('first'));
      const second = f.store.write('fifo.bcad', f.encode('second-longer'));
      const receipts = await Promise.all([first, second]);
      const actual = await f.store.read('fifo.bcad');
      return { receipts, tag: actual.tag, text: new TextDecoder().decode(actual.bytes) };
    });
    assert.equal(fifo.text, 'second-longer'); assert.equal(fifo.receipts[1].tag, fifo.tag); assert.notEqual(fifo.receipts[0].tag, fifo.tag);
    // Closing a lock-owning page releases ownership; no lease stealing or timeout fallback.
    await a.evaluate(() => { Object.assign(window.fixture.control, { hold: 'receipt', entered: false, committed: false }); window.start('ending', 'write', 'held', 'part.bcad', 'committed-before-tab-close'); });
    await a.waitForFunction(() => window.fixture.control.entered);
    await b.evaluate(async () => { const tag = (await window.fixture.store.read('part.bcad')).tag; window.start('after-close', 'write', 'store', 'part.bcad', 'next-tab-owner', tag); });
    assert.equal(await b.evaluate(() => 'after-close' in window.fixture.results), false);
    await a.close();
    const next = await b.evaluate(async () => { await window.fixture.pending['after-close']; return window.fixture.results['after-close']; });
    assert.equal(next.ok, true);
    await context.close();
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
});
