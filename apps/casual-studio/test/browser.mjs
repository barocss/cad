import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const serve = base => createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const file = pathname === '/' ? '/index.html' : pathname;
    if (!/^\/(?:index\.html|assets\/[\w.-]+)$/.test(file)) { res.writeHead(404).end(); return; }
    const bytes = await readFile(new URL(base + file, import.meta.url));
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(bytes);
  } catch { res.writeHead(404).end(); }
});
const server = serve('../dist');
const studioServer = process.env.CHECK_STUDIO ? serve('../../cad-studio/dist') : null;
for (const s of [server, studioServer].filter(Boolean)) await new Promise(resolve => s.listen(0, '127.0.0.1', resolve));
let browser;
const out = process.env.CASUAL_TEST_OUTPUT || await mkdtemp(join(tmpdir(), 'casual-browser-'));
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: studioServer ? ['--enable-unsafe-webgpu'] : [] });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1140, height: 750 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(7000);
  const requested = [], errors = [];
  page.on('request', r => requested.push(new URL(r.url()).pathname));
  page.on('pageerror', e => errors.push(e.message));
  const origin = 'http://127.0.0.1:' + server.address().port;
  await page.goto(origin);
  await page.getByRole('heading', { name:'있는 설계를 내 부품에 맞추세요' }).waitFor();
  assert.equal(await page.locator('#scene polygon').count(), 0, 'starter should not generate scene geometry');
  assert.equal(await page.locator('#tools').isHidden(), true);
  await page.screenshot({ path: join(out, 'casual-start-desktop.png') });
  await page.getByRole('button', { name:'이 예제로 시작' }).click();
  assert.equal(await page.locator('#start').isHidden(), true);
  await page.getByRole('button', { name: '구멍 A 지름 6 mm' }).waitFor();
  const input = page.locator('#diameter');
  const action = id => page.locator('#' + id).click();
  const control = name => page.getByRole('button', { name, exact: true });
  async function pick(selector) {
    const hit = await page.evaluate(selector => {
      for (const e of document.querySelectorAll(selector)) {
        for (let i = 1; i < 15; i++) {
          const p = e.getPointAtLength(e.getTotalLength() * i / 15).matrixTransform(e.getScreenCTM());
          if (document.elementFromPoint(p.x, p.y) === e) return { x: p.x, y: p.y };
        }
      }
      return null;
    }, selector);
    assert.ok(hit, 'no visible location for ' + selector);
    await page.mouse.click(hit.x, hit.y);
  }
  // Triangle centroid interior selects the bore wall in the default oblique view.
  const bore = await page.evaluate(() => [...document.querySelectorAll('polygon[data-hole=n2]')].flatMap(e => {
    const p = e.points;
    const point = new DOMPoint((p[0].x + p[1].x + p[2].x) / 3, (p[0].y + p[1].y + p[2].y) / 3).matrixTransform(e.getScreenCTM());
    return document.elementFromPoint(point.x, point.y) === e ? [{ x: point.x, y: point.y }] : [];
  })[0]);
  assert.ok(bore, 'expected physically hittable oblique bore wall');
  await page.mouse.click(bore.x, bore.y);
  assert.match(await page.locator('#selection').textContent(), /구멍 A/);
  await action('view');
  await pick('polyline[data-rim=n2]');
  assert.match(await page.locator('#selection').textContent(), /구멍 A/);
  await input.fill('8');
  await control('구멍 A 지름 8 mm').waitFor();
  await control('구멍 B 지름 6 mm').waitFor();
  assert.equal(await page.locator('#undo').isDisabled(), true);
  assert.ok(!requested.some(p => /\/code-|worker|\.wasm$/.test(p)), 'code/worker/WASM should not load for the first model or its preview');
  // Check the draft there, but not committed; use a fresh download before cancelling.
  async function download(name) {
    const slot = page.waitForEvent('download'); await action('save');
    const item = await slot; const path = join(out, name); await item.saveAs(path);
    return { path, doc: JSON.parse(await readFile(path, 'utf8')) };
  }
  const uncommitted = await download('uncommitted.bcad');
  assert.equal(uncommitted.doc.nodes[2].radius, 3);
  await action('cancel'); await control('구멍 A 지름 6 mm').waitFor();
  await pick('polyline[data-rim=n3]'); assert.match(await page.locator('#selection').textContent(), /구멍 B/);
  // Blank/panel and cap still do not create a new target.
  await page.locator('#scene').click({ position: { x: 8, y: 8 } }); assert.equal(await page.locator('#editor').isHidden(), true);
  await pick('polyline[data-rim=n2]'); await input.fill('100');
  assert.equal(await page.locator('#apply').isDisabled(), true);
  await input.fill('8');
  await action('apply'); await action('undo'); await control('구멍 A 지름 6 mm').waitFor();
  await action('redo'); await control('구멍 A 지름 8 mm').waitFor();
  await Promise.all([page.waitForResponse(r => /\/code-/.test(r.url())), action('code')]);
  assert.ok(requested.some(p => /\/code-/.test(p)), 'code must be loaded only when shown');
  await page.locator('#script').fill('holeB.diameter = 7');
  await action('run-code'); await control('구멍 B 지름 7 mm').waitFor();
  await action('cancel'); await control('구멍 B 지름 6 mm').waitFor();
  await action('code'); await action('view');
  await control('구멍 A 지름 8 mm').click();
  await page.screenshot({ path: join(out, 'casual-plate-chrome.png') });
  const done = await download('edited.bcad');
  assert.deepEqual(done.doc.nodes.map(n => [n.id, n.kind]), [['n0','sketch'],['n1','extrude'],['n2','hole'],['n3','hole']]);
  assert.deepEqual(done.doc.nodes.slice(2).map(n => [n.center,n.radius]), [[[15,20],4],[[45,20],3]]);
  // A rejected file does not replace the current model or discard a pending edit.
  await input.fill('9');
  await page.locator('#file').setInputFiles({ name:'bad.bcad', mimeType:'application/octet-stream', buffer:Buffer.from('not a CAD file') });
  await page.waitForFunction(() => document.getElementById('notice').textContent.length > 0);
  assert.equal(await page.locator('#switch-dialog').isHidden(), true);
  await control('구멍 A 지름 9 mm').waitFor();
  // After saving Ø8, pending Ø9 is the only change lost by replacing it.
  await page.locator('#file').setInputFiles(uncommitted.path);
  await page.getByRole('dialog').waitFor();
  assert.match(await page.locator('#switch-detail').textContent(), /적용하지 않은/);
  assert.doesNotMatch(await page.locator('#switch-detail').textContent(), /저장하지 않은/);
  await action('keep'); await control('구멍 A 지름 9 mm').waitFor();
  await action('apply');
  await input.fill('10');
  await action('home');
  assert.match(await page.locator('#switch-detail').textContent(), /적용하지 않은.*저장하지 않은/);
  await page.keyboard.press('Escape');
  await control('구멍 A 지름 10 mm').waitFor();
  await action('cancel');
  await action('home');
  assert.doesNotMatch(await page.locator('#switch-detail').textContent(), /적용하지 않은/);
  assert.match(await page.locator('#switch-detail').textContent(), /저장하지 않은/);
  await action('discard');
  await control('이 예제로 시작').waitFor();
  await action('starter'); await control('구멍 A 지름 6 mm').waitFor();
  assert.equal(await page.locator('#undo').isDisabled(), true);
  await control('구멍 A 지름 6 mm').click();
  await input.fill('7');
  await page.locator('#file').setInputFiles(done.path);
  await page.getByRole('dialog').waitFor();
  await action('discard'); await control('구멍 A 지름 8 mm').waitFor();
  await action('home'); await control('이 예제로 시작').waitFor();
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const reopen = await fresh.newPage();
  await reopen.goto(origin);
  await reopen.getByRole('button', { name:'이 예제로 시작' }).waitFor();
  assert.equal(await reopen.evaluate(() => document.documentElement.scrollWidth === innerWidth), true, 'mobile starter horizontal overflow');
  await reopen.screenshot({ path: join(out, 'casual-start-mobile.png') });
  const chooser = reopen.waitForEvent('filechooser');
  await reopen.getByRole('button', { name:'내 CAD 파일 열기' }).click();
  await (await chooser).setFiles(done.path);
  await reopen.getByRole('button', { name:'구멍 A 지름 8 mm' }).waitFor();
  await reopen.getByRole('button', { name:'구멍 B 지름 6 mm' }).waitFor();
  let studioHandoff = 'NOT_RUN';
  if (studioServer) {
    const studioContext = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });
    const studio = await studioContext.newPage();
    studio.on('pageerror', e => errors.push(e.message));
    await studio.goto('http://127.0.0.1:' + studioServer.address().port);
    await studio.getByLabel('Model file', { exact: true }).setInputFiles(done.path);
    const row = studio.locator('.history .hs[data-node-index="2"]');
    await row.waitFor({ timeout: 30_000 });
    await studio.getByText(/Perspective · 1 solid/).waitFor({ timeout: 30_000 });
    await studio.getByText(/^Bounds 60 × 40 × 5$/).waitFor({ timeout: 30_000 });
    await row.click();
    const fields = studio.locator('.node-editor');
    const dia = fields.getByLabel('Diameter', { exact: true });
    assert.equal(await dia.inputValue(), '8');
    await dia.fill('9');
    await fields.getByRole('button', { name: 'Apply', exact: true }).click();
    await studio.locator('[aria-label="Unsaved changes"]').waitFor({ state: 'attached', timeout: 15_000 });
    const slot = studio.waitForEvent('download');
    await studio.getByRole('button', { name: 'Save', exact: true }).click();
    const saved = join(out, 'studio-edited.bcad');
    await (await slot).saveAs(saved);
    const changed = JSON.parse(await readFile(saved, 'utf8'));
    assert.equal(changed.nodes[2].radius, 4.5);
    assert.equal(changed.nodes[3].radius, 3);
    await reopen.locator('#file').setInputFiles(saved);
    await reopen.getByRole('button', { name:'구멍 A 지름 9 mm' }).waitFor();
    studioHandoff = 'PASS';
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result:'PASS', studioHandoff, requested:[...new Set(requested)], output:out }));
} finally {
  await browser?.close();
  server.close();
  studioServer?.close();
}
