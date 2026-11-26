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
  const desktopOnly = process.env.DESKTOP_ONLY === '1';
  page.on('request', r => requested.push(new URL(r.url()).pathname));
  page.on('pageerror', e => errors.push(e.message));
  const origin = 'http://127.0.0.1:' + server.address().port;
  await page.goto(origin);
  await page.getByRole('heading', { name:'있는 설계를 내 부품에 맞추세요' }).waitFor();
  assert.equal(await page.locator('#scene polygon').count(), 0, 'starter should not generate scene geometry');
  assert.equal(await page.locator('#tools').isHidden(), true);
  await page.screenshot({ path: join(out, 'casual-start-desktop.png') });
  // The native import editor remains bounded and unchanged. Test it independently of the starter.
  const legacy = {
    name:'legacy-plate.bcad',mimeType:'application/octet-stream',
    buffer:Buffer.from(JSON.stringify({
      format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:4,
      nodes:[
        { kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[60,40] },
        { kind:'extrude',id:'n1',sketch:0,height:5 },
        { kind:'hole',id:'n2',parent:{node:1,side:'solid'},center:[15,20],radius:3,axis:'z' },
        { kind:'hole',id:'n3',parent:{node:2,side:'solid'},center:[45,20],radius:3,axis:'z' }
      ],outputs:{ b3:{node:3,side:'solid'} }
    }))
  };
  const loadLegacy = () => page.locator('#file').setInputFiles(legacy);
  await loadLegacy();
  await page.locator('#workarea').waitFor();
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
  assert.ok(!requested.some(p => /\/code-|recipeWork-|worker|\.wasm$/.test(p)), 'code/worker/WASM should not load for the first model or its preview');
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
  await loadLegacy(); await control('구멍 A 지름 6 mm').waitFor();
  assert.equal(await page.locator('#undo').isDisabled(), true);
  await control('구멍 A 지름 6 mm').click();
  await input.fill('7');
  await page.locator('#file').setInputFiles(done.path);
  await page.getByRole('dialog').waitFor();
  await action('discard'); await control('구멍 A 지름 8 mm').waitFor();
  await action('home'); await control('이 예제로 시작').waitFor();
  const fresh = await browser.newContext({ viewport: desktopOnly ? { width: 1140, height: 750 } : { width: 390, height: 844 } });
  const reopen = await fresh.newPage();
  await reopen.goto(origin);
  await reopen.getByRole('button', { name:'이 예제로 시작' }).waitFor();
  assert.equal(await reopen.evaluate(() => document.documentElement.scrollWidth === innerWidth), true, 'mobile starter horizontal overflow');
  if (!desktopOnly) await reopen.screenshot({ path: join(out, 'casual-start-mobile.png') });
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
  // The beginner and blank-code entries use the same recipe workspace, but start in different modes.
  const starter = await ctx.newPage();
  starter.on('pageerror', e => errors.push(e.message));
  await starter.goto(origin);
  await starter.getByRole('button',{name:'이 예제로 시작',exact:true}).click();
  await starter.getByRole('heading',{name:'케이블 가이드 어댑터',exact:true}).waitFor();
  const st = id => starter.locator('#recipe-' + id);
  assert.equal(await st('panel').isHidden(),true);
  assert.equal(await st('toggle').getAttribute('aria-expanded'),'false');
  assert.match(await st('purpose').textContent(),/고정 구멍/);
  assert.equal(await st('context').isHidden(),true);
  assert.equal(await st('transaction').isHidden(),true);
  // Pick the real geometry, without relying on a synthetic option or internal map.
  const a = st('scene').locator('polyline[data-rim]').first();
  const position = await a.evaluate(el => {
    for (let i=1;i<15;i++) {
      const p = el.getPointAtLength(el.getTotalLength()*i/15).matrixTransform(el.getScreenCTM());
      if (document.elementFromPoint(p.x,p.y) === el) return { x:p.x,y:p.y };
    }
    return null;
  });
  assert.ok(position);
  await starter.mouse.click(position.x,position.y);
  assert.match(await st('selection').textContent(),/구멍 A · 가이드 쪽/);
  assert.equal(await st('diameter').evaluate(e => e.getBoundingClientRect().bottom <= innerHeight),true,'selected diameter must be reachable without scrolling on desktop');
  await st('diameter').fill('8');
  await st('size').click();
  assert.match(await st('context-caption').textContent(),/변경 미리보기/);
  assert.equal(await st('change').textContent(),'Ø6 → Ø8 mm');
  assert.equal(await st('dimensions').isHidden(),true);
  await starter.screenshot({path:join(out,'casual-context-desktop.png')});
  await st('apply').click();
  assert.equal(await st('transaction').isHidden(),true);
  await st('dismiss').click();
  assert.equal(await st('context').isHidden(),true);
  assert.equal(await starter.getByRole('button',{name:'구멍 A · 가이드 쪽'}).evaluate(e => document.activeElement === e),true);
  await starter.keyboard.press('Enter');
  assert.match(await st('selection').textContent(),/Ø8 mm/);
  const exp = starter.waitForEvent('download'); await st('export').click();
  const examplePath = join(out,'example.bcad'); await (await exp).saveAs(examplePath);
  const example = JSON.parse(await readFile(examplePath,'utf8'));
  assert.deepEqual(example.nodes.slice(2).map(n => [n.center,n.radius]),[[[15,20],4],[[45,20],3]]);
  await starter.screenshot({path:join(out,'casual-shared-example-chrome.png')});
  await st('reset').click();
  assert.match(await st('selection').textContent(),/Ø6 mm/);
  await st('cancel').click();
  assert.match(await st('selection').textContent(),/Ø8 mm/);
  await st('reset').click(); await st('apply').click();
  assert.match(await st('selection').textContent(),/Ø6 mm/);
  await st('undo').click();
  assert.match(await st('selection').textContent(),/Ø8 mm/);
  await st('toggle').click();
  assert.match(await st('source').inputValue(),/param guideDia = 8/);
  assert.match(await st('source').inputValue(),/param mountDia = 6/);
  await st('undo').click();
  assert.match(await st('source').inputValue(),/param guideDia = 6/);
  await st('redo').click();
  const rs = starter.waitForEvent('download'); await st('save').click();
  const exampleRecipe = join(out,'example.cadrecipe'); await (await rs).saveAs(exampleRecipe);
  await st('home').click();
  await starter.getByRole('button',{name:'이 예제로 시작',exact:true}).waitFor();
  await starter.locator('#file').setInputFiles(exampleRecipe);
  await starter.getByLabel('CAD 레시피').waitFor();
  assert.match(await st('source').inputValue(),/param guideDia = 8/);

  if (!desktopOnly) {
    const phone = await (await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true })).newPage();
    await phone.goto(origin);
    await phone.getByRole('button',{name:'이 예제로 시작',exact:true}).tap();
    await phone.getByRole('button',{name:'구멍 B · 장비 쪽',exact:true}).tap();
    const mobile = id => phone.locator('#recipe-' + id);
    assert.equal(await mobile('context').isVisible(),true);
    assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth === innerWidth),true);
    assert.ok((await mobile('context').boundingBox()).y > (await mobile('scene').boundingBox()).y);
    await mobile('diameter').fill('7'); await mobile('size').tap();
    await phone.screenshot({path:join(out,'casual-context-mobile.png')});
    await mobile('apply').tap();
    assert.match(await mobile('selection').textContent(),/장비 쪽 · Ø7 mm/);
    await mobile('toggle').tap();
    assert.match(await mobile('source').inputValue(),/param mountDia = 7/);
    assert.ok((await mobile('panel').boundingBox()).y > (await mobile('scene').boundingBox()).y);
  }

  // A genuine blank project: no sample insertion and no preexisting template geometry.
  const recipeContext = await browser.newContext({ viewport:{ width:1140,height:750 }, acceptDownloads:true });
  const recipe = await recipeContext.newPage();
  recipe.on('pageerror', e => errors.push(e.message));
  await recipe.goto(origin);
  await recipe.getByRole('button', { name:'코드로 만들기', exact:true }).click();
  const editor = recipe.getByLabel('CAD 레시피');
  const rb = id => recipe.locator('#recipe-' + id);
  assert.equal(await editor.inputValue(), '');
  assert.equal(await rb('scene').locator('polygon').count(),0);
  const authored = `recipe 1
units mm
# My own fixture
param guideDia = 6
param w = 64
plate fixture width=w depth=42 thickness=7
hole near in=fixture at=(12, 12) diameter=guideDia
hole far in=fixture at=(48, 16) diameter=8
hole wire in=fixture at=(31, 29) diameter=4
output fixture
`;
  await editor.fill(authored);
  await rb('run').click();
  assert.match(await rb('state').textContent(), /미리보기 · 관통 구멍 3개/);
  assert.equal(new Set(await rb('scene').locator('polyline[data-hole]').evaluateAll(es => es.map(e => e.dataset.hole))).size,3);
  assert.equal(await rb('export').isDisabled(),true);
  // A newer input invalidates an older preview before Apply.
  await editor.fill(authored.replace('diameter=8','diameter=0'));
  assert.equal(await rb('apply').isDisabled(),true);
  await rb('run').click();
  assert.match(await rb('error').textContent(),/^8행:/);
  await editor.fill(authored);
  await rb('run').click(); await rb('apply').click();
  await rb('undo').click(); assert.equal(await editor.inputValue(),'');
  await rb('redo').click(); assert.equal(await editor.inputValue(),authored);
  await editor.fill(authored.replace('at=(48, 16)','at=(12, 12)'));
  await rb('run').click();
  assert.match(await rb('error').textContent(),/겹쳐요/);
  assert.match(await rb('state').textContent(), /마지막 적용 모델 · 관통 구멍 3개/);
  await rb('cancel').click();
  await recipe.screenshot({ path:join(out,'casual-recipe-chrome.png') });
  const grab = async (id,name) => {
    const slot = recipe.waitForEvent('download'); await rb(id).click();
    const path = join(out,name); await (await slot).saveAs(path); return path;
  };
  const exported = await grab('export','authored.bcad');
  assert.match(await rb('status').textContent(), /지름 연결은 현재 값/);
  await rb('home').click();
  await recipe.getByRole('dialog').waitFor();
  assert.match(await recipe.locator('#switch-detail').textContent(), /레시피로 저장하지 않은/);
  await recipe.locator('#keep').click();
  const recipeFile = await grab('save','authored.cadrecipe');
  assert.equal(await readFile(recipeFile,'utf8'),authored);
  await rb('home').click();
  await recipe.getByRole('button', { name:'코드로 만들기' }).waitFor();
  await recipe.locator('#file').setInputFiles(recipeFile);
  await editor.waitFor();
  assert.equal(await editor.inputValue(),authored);
  await editor.fill(authored.replace('param guideDia = 6','param guideDia = 7'));
  await rb('run').click(); await rb('apply').click();
  const edited = JSON.parse(await readFile(await grab('export','recipe-reopened.bcad'),'utf8'));
  assert.deepEqual(edited.nodes.slice(2).map(n => n.radius),[3.5,4,2]);
  // Canvas-to-source uses the same commit/undo path without exposing a fixed literal.
  await recipe.getByRole('button',{ name:'far',exact:true }).click();
  assert.equal(await rb('dimensions').isHidden(),true);
  await recipe.getByRole('button',{ name:'near',exact:true }).click();
  assert.match(await rb('binding').textContent(),/연결된 피처: near/);
  await rb('toggle').click();
  assert.equal(await editor.isHidden(),true);
  await rb('diameter').fill('9'); await rb('size').click();
  assert.match(await rb('state').textContent(),/미리보기/);
  await rb('apply').click();
  await rb('toggle').click();
  assert.equal(await editor.inputValue(),authored.replace('param guideDia = 6','param guideDia = 9'));
  const changedCanvas = JSON.parse(await readFile(await grab('export','canvas-edited.bcad'),'utf8'));
  assert.deepEqual(changedCanvas.nodes.slice(2).map(n => n.radius),[4.5,4,2]);
  await rb('undo').click();
  assert.equal(await editor.inputValue(),authored.replace('param guideDia = 6','param guideDia = 7'));
  await rb('redo').click();
  assert.match(await rb('selection').textContent(),/near · Ø9 mm/);
  await recipe.screenshot({ path:join(out,'casual-parameter-chrome.png') });
  const coupled = authored.replace('guideDia = 6','guideDia = 6.00').replace('thickness=7','thickness=guideDia').replace('diameter=8','diameter=guideDia');
  await editor.fill(coupled);
  await rb('run').click(); await rb('apply').click();
  await rb('size').click();
  assert.match(await rb('dimension-error').textContent(),/변경 없음/);
  assert.equal(await editor.inputValue(),coupled);
  assert.equal(await rb('apply').isDisabled(),true);
  await rb('diameter').fill('8');
  await rb('view').click();
  assert.equal(await rb('diameter').inputValue(),'8');
  await rb('home').click();
  await recipe.getByRole('dialog').waitFor();
  assert.match(await recipe.locator('#switch-detail').textContent(),/적용하지 않은/);
  await recipe.locator('#keep').click();
  assert.equal(await rb('diameter').inputValue(),'8');
  await rb('size').click();
  assert.equal(new Set(await rb('scene').locator('[data-previous-rim]').evaluateAll(es => es.map(e => e.dataset.previousRim))).size,2);
  assert.equal(await rb('scene').locator('[data-previous-plate]').count(),1);
  await rb('apply').click();
  assert.equal(await editor.inputValue(),coupled.replace('6.00','8'));
  let recipeHandoff = 'NOT_RUN';
  if (studioServer) {
    const studio = await (await browser.newContext({ acceptDownloads:true })).newPage();
    studio.on('pageerror', e => errors.push(e.message));
    await studio.goto('http://127.0.0.1:' + studioServer.address().port);
    await studio.getByLabel('Model file',{exact:true}).setInputFiles(examplePath);
    await studio.getByText(/^Bounds 60 × 40 × 5$/).waitFor({timeout:30_000});
    await studio.locator('.history .hs[data-node-index="2"]').click();
    assert.equal(await studio.locator('.node-editor').getByLabel('Diameter',{exact:true}).inputValue(),'8');
    await studio.getByLabel('Model file', { exact:true }).setInputFiles(exported);
    await studio.getByText(/Perspective · 1 solid/).waitFor({ timeout:30_000 });
    await studio.getByText(/^Bounds 64 × 42 × 7$/).waitFor({ timeout:30_000 });
    await studio.locator('.history .hs[data-node-index="4"]').click();
    const fields = studio.locator('.node-editor');
    const dia = fields.getByLabel('Diameter',{ exact:true });
    assert.equal(await dia.inputValue(),'4');
    await dia.fill('5');
    await fields.getByRole('button',{ name:'Apply',exact:true }).click();
    await studio.locator('[aria-label="Unsaved changes"]').waitFor({ state:'attached',timeout:15_000 });
    const slot = studio.waitForEvent('download');
    await studio.getByRole('button',{ name:'Save',exact:true }).click();
    const path = join(out,'recipe-studio-edited.bcad');
    await (await slot).saveAs(path);
    const doc = JSON.parse(await readFile(path,'utf8'));
    assert.deepEqual(doc.nodes.slice(2).map(n => n.radius),[3,4,2.5]);
    recipeHandoff = 'PASS';
  }
  const sensor = await ctx.newPage();
  sensor.on('pageerror', e => errors.push(e.message));
  await sensor.goto(origin);
  await sensor.getByRole('button', { name:'센서 케이스 열기', exact:true }).click();
  const se = id => sensor.locator('#sensor-' + id);
  const sensorState = async (width, pending) => assert.equal(await se('state').textContent(), '적용된 폭 ' + width + ' mm' + (pending ? ' · ' + pending + ' mm 미리보기' : ''));
  await se('scene').waitFor();
  assert.deepEqual(await se('scene').locator('[data-sensor-part]').evaluateAll(items => [...new Set(items.map(e => e.dataset.sensorPart))].sort()), ['board','body','left','lid','right']);
  assert.equal(await se('code-panel').isHidden(),true);
  await sensorState(56);
  await se('views').getByRole('button',{name:'내부',exact:true}).click();
  assert.equal(await se('scene').locator('[data-sensor-part=lid]').count(),0);
  await se('views').getByRole('button',{name:'조립',exact:true}).click();
  assert.ok(await se('scene').locator('[data-sensor-part=lid]').count() > 0);
  await se('views').getByRole('button',{name:'분해',exact:true}).click();
  await se('width').fill('65'); await se('preview').click();
  assert.match(await se('error').textContent(), /56–64/);
  assert.equal(await se('undo').isDisabled(),true);
  await sensorState(56);
  await se('width').fill('64'); await se('preview').click();
  await sensorState(56, 64);
  assert.match(await se('rows').textContent(), /64 mm → 72 mm/);
  assert.match(await se('rows').textContent(), /54 mm → 62 mm/);
  assert.match(await se('rows').textContent(), /10 × 6 mm 유지/);
  assert.equal(await se('scene').locator('[data-sensor-part=left][data-highlighted]').count(),0);
  await se('rows').getByRole('button', { name:/오른쪽 고정점/ }).focus();
  assert.ok(await se('scene').locator('[data-sensor-part=right][data-highlighted]').count() > 0);
  assert.equal(await se('scene').locator('[data-sensor-part=body][data-highlighted]').count(),0);
  assert.equal(await se('scene').locator('[data-anchor=right]').count(),2);
  await se('apply').focus();
  await sensor.screenshot({ path:join(out, 'casual-sensor-preview.png') });
  await se('cancel').click(); await sensorState(56);
  assert.equal(await se('undo').isDisabled(),true);
  await se('width').fill('64'); await se('preview').click();
  await se('home').click(); await sensor.getByRole('dialog').waitFor();
  assert.match(await sensor.locator('#switch-detail').textContent(),/적용하지 않은/);
  await sensor.locator('#keep').click(); await sensorState(56,64);
  await se('apply').click();
  await sensorState(64);
  await se('undo').click(); await sensorState(56);
  await se('redo').click(); await sensorState(64);
  await se('code').click();
  assert.match(await se('source').inputValue(), /boardWidth=64/);
  await se('source').fill('recipe 1\nunits mm\nsensor-enclosure boardWidth=60.5\n');
  await se('code-preview').click(); await sensorState(64,60.5);
  await se('cancel').click();
  assert.match(await se('source').inputValue(), /boardWidth=64/);
  const getSensorDownload = async (id, file) => {
    const event = sensor.waitForEvent('download'); await se(id).click();
    const dest = join(out,file); await (await event).saveAs(dest); return dest;
  };
  const sensorRecipe = await getSensorDownload('save', 'sensor-applied.cadrecipe');
  assert.match(await readFile(sensorRecipe,'utf8'), /boardWidth=64/);
  await se('home').click();
  await sensor.getByRole('button',{ name:'센서 케이스 열기', exact:true }).waitFor();
  await sensor.locator('#file').setInputFiles(sensorRecipe);
  await se('scene').waitFor();
  await sensorState(64);
  const sensorCad = await getSensorDownload('export','sensor-applied.bcad');
  const sensorDoc = JSON.parse(await readFile(sensorCad,'utf8'));
  assert.equal(sensorDoc.variability.inputs[0].default,64);
  assert.deepEqual(sensorDoc.parameters,{ caseWidth:72, interiorRight:70, boardRight:68, rightAnchorX:62 });
  let sensorHandoff = 'NOT_RUN';
  if (studioServer) {
    const studio = await (await browser.newContext({ viewport:{width:1440,height:950} })).newPage();
    studio.on('pageerror', e => errors.push(e.message));
    await studio.goto('http://127.0.0.1:' + studioServer.address().port);
    await studio.getByLabel('Model file',{exact:true}).setInputFiles(sensorCad);
    await studio.getByText('Bounds 72 × 42 × 21',{exact:true}).waitFor({timeout:30000});
    await studio.getByRole('button',{name:'Inspect',exact:true}).click();
    await studio.getByRole('button',{name:'Variants',exact:true}).click();
    const values = studio.getByRole('complementary',{name:'Variants panel'});
    assert.equal(await values.getByRole('spinbutton',{name:'Value of boardWidth'}).inputValue(),'64');
    await values.getByRole('button',{name:'Show 56 mm board'}).click();
    await studio.getByText('Bounds 64 × 42 × 21',{exact:true}).waitFor();
    sensorHandoff = 'PASS';
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result:'PASS', studioHandoff, recipeHandoff, sensorHandoff, desktopOnly, requested:[...new Set(requested)], output:out }));
} finally {
  await browser?.close();
  server.close();
  studioServer?.close();
}
