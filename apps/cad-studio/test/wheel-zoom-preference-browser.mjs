import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';

const KEY = 'studio.reverse-wheel-zoom';
const f = await createFlow({ name: 'wheel-zoom-preference', output: process.argv[2], envFrozen: 'WHEEL_ZOOM_PREFERENCE_FROZEN',
  initialFiles: ['apps/cad-studio/test/wheel-zoom-preference-browser.mjs', 'apps/cad-studio/test/fixtures/d349.bcad'],
  requiredFrozen: ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/viewport/Viewport.tsx', 'apps/cad-studio/src/viewport/viewportPointerInput.ts', 'apps/cad-studio/src/viewport/wheelZoomPreference.ts'],
  qualification: 'Actual desktop wheel direction, target-plane cursor anchoring and origin-local preference lifetime, without model edits.',
  limits: ['Physical trackpad pinch NOT_RUN: modifier tests use Playwright keyboard plus mouse.wheel, not device hardware.', 'Drawing wheel behavior is outside this Model/Sketch preference scope.', 'No download or native folder access; save/reopen uses an isolated browser project.'] });
const template = JSON.parse(await readFile(new URL('./fixtures/d349.bcad', import.meta.url), 'utf8')).nodes[2];
const sketch = { ...structuredClone(template), id: 'n0', plane: { origin: [0, 0, 10], normal: [0, 0, 1], xAxis: [1, 0, 0] } }; delete sketch.on;
const doc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { Depth: 5 }, nodes: [sketch, { id: 'n1', kind: 'extrude', sketch: 0, height: { parameter: 'Depth' } }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const button = name => f.page.getByRole('button', { name, exact: true });
const camera = () => f.page.evaluate(() => window.__studioCamera());
const settle = () => f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const project = point => f.page.evaluate(p => window.__studioProject(p), point);
async function open(document = doc) { await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'wheel-preference.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) }); await f.same(document); }
async function display(opened) { const control = button('Display and previews'); if ((await control.getAttribute('aria-expanded') === 'true') !== opened) await control.click(); }
const state = async () => ({ camera: await camera(), doc: await f.doc(), selection: await f.page.evaluate(() => structuredClone(window.__studioSelection ?? null)), dirty: await f.page.getByLabel('Unsaved changes', { exact: true }).count() });
async function preference(on) {
  await display(true); const before = await state(), toggle = button('Reverse wheel zoom');
  if (await toggle.getAttribute('aria-pressed') !== String(on)) await toggle.click();
  assert.equal(await toggle.getAttribute('aria-pressed'), String(on)); await settle();
  assert.deepEqual(await state(), before, 'preference is navigation-only, including selection, dirty and camera'); await display(false);
}
async function currentPreference() { await display(true); const pressed = await button('Reverse wheel zoom').getAttribute('aria-pressed'); await display(false); return pressed; }
async function projection(ortho) { await button('Iso').click(); if (await button('Ortho').getAttribute('aria-pressed') !== String(ortho)) await button('Ortho').click(); await settle(); }
async function wheel(delta, reversed, modifier) {
  const before = await camera();
  // Independent world point on the plane through camera.target perpendicular to the view direction.
  const right = [-Math.sin(before.yaw), Math.cos(before.yaw), 0];
  const up = [-Math.sin(before.pitch) * Math.cos(before.yaw), -Math.sin(before.pitch) * Math.sin(before.yaw), Math.cos(before.pitch)];
  const point = before.target.map((x, i) => x + before.distance * (.06 * right[i] + .04 * up[i]));
  const cursor = await project(point), box = await f.page.locator('canvas.vp-canvas').boundingBox();
  assert.ok(cursor[0] > 0 && cursor[0] < box.width && cursor[1] > 0 && cursor[1] < box.height);
  await f.page.mouse.move(box.x + cursor[0], box.y + cursor[1]);
  if (modifier) await f.page.keyboard.down(modifier);
  try { await f.page.mouse.wheel(0, delta); await f.page.waitForFunction(d => window.__studioCamera().distance !== d, before.distance); }
  finally { if (modifier) await f.page.keyboard.up(modifier); }
  await settle(); const after = await camera(), screen = await project(point);
  const ratio = Math.exp(delta * .0015 * (reversed && !modifier ? -1 : 1));
  assert.ok(Math.abs(after.distance / before.distance - ratio) < 1e-8, JSON.stringify({ before, after, delta, modifier, ratio }));
  assert.ok(Math.hypot(screen[0] - cursor[0], screen[1] - cursor[1]) < .5, JSON.stringify({ cursor, screen, point }));
  for (const key of ['yaw', 'pitch', 'fovY', 'ortho']) assert.equal(after[key], before[key]);
  await f.same(doc); f.report.observations.push({ delta, reversed, modifier: modifier ?? null, ortho: before.ortho, ratio, measured: after.distance / before.distance, cursorError: Math.hypot(screen[0] - cursor[0], screen[1] - cursor[1]) });
}
async function saveAndReopen() {
  const name = 'wheel-preference.bcad', owned = 'Wheel zoom preference fixture';
  const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
  await f.page.locator('.doc-tab input').fill(name.slice(0, -5)); await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(owned);
  await versions().getByRole('button', { name: 'Project in this browser', exact: true }).click(); await versions().getByLabel('Project', { exact: true }).waitFor();
  await button('Save').click(); await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(name, { exact: true }).waitFor();
  await f.page.getByLabel('Unsaved changes', { exact: true }).waitFor({ state: 'hidden' });
  const saved = await f.page.evaluate(async ({ owned, name }) => { const root = await navigator.storage.getDirectory(), directory = await (await root.getDirectoryHandle('projects')).getDirectoryHandle(owned); return (await (await directory.getFileHandle(name)).getFile()).text(); }, { owned, name });
  assert.deepEqual(JSON.parse(saved), doc); assert.equal(await f.page.evaluate(key => localStorage.getItem(key), KEY), 'on');
  await versions().getByRole('button', { name: 'Close project', exact: true }).click(); await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  // Fresh browser context proves that the preference did not enter the saved model.
  await f.newPage(); await open(JSON.parse(saved)); assert.equal(await currentPreference(), 'false'); await f.same(doc);
  f.report.observations.push({ save: 'OPFS', exactDocument: true, freshContextPreference: 'off' });
}

await f.run(async () => {
  if (process.argv.includes('--input-only')) {
    await f.newPage(); await open(); await display(true); await f.snapshot('01-wheel-setting-visible'); await display(false);
    await f.openFeatureEditor(1); await f.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click(); await f.sketchPanel().waitFor();
    await display(true);
    const input=f.sketchPanel().getByLabel('Point 2 X',{exact:true}); await input.focus(); await input.press('ControlOrMeta+A'); await input.press('-');
    const draft=await input.inputValue();
    const before=await state(); await button('Reverse wheel zoom').click();
    assert.equal(await input.inputValue(),draft); assert.equal(await button('Reverse wheel zoom').getAttribute('aria-pressed'),'false');
    assert.deepEqual(await state(),before); await f.page.getByRole('status',{name:'Sketch camera input',exact:true}).waitFor();
    await f.snapshot('02-pending-input-retained');
    await input.press('Escape'); await f.page.evaluate(()=>document.activeElement?.blur());
    for(let i=0;i<3&&await f.sketchPanel().isVisible();i++) await f.page.keyboard.press('Escape');
    await f.sketchPanel().waitFor({state:'hidden'}); await f.same(doc); return;
  }
  await f.newPage(); await open(); assert.equal(await currentPreference(), 'false');
  assert.equal(await f.page.evaluate(key => localStorage.getItem(key), KEY), null);
  for (const ortho of [false, true]) for (const reversed of [false, true]) {
    await projection(ortho); await preference(reversed);
    for (const delta of [120, -120]) await wheel(delta, reversed);
    for (const modifier of ['Control', 'Meta', 'Alt', 'Shift']) await wheel(120, reversed, modifier);
  }
  await preference(true); await f.snapshot('01-model-reversed');
  // A wheel over a settings control is not a canvas wheel.
  await display(true); const beforePanel = await camera(), toggleBox = await button('Reverse wheel zoom').boundingBox();
  await f.page.mouse.move(toggleBox.x + toggleBox.width / 2, toggleBox.y + toggleBox.height / 2); await f.page.mouse.wheel(0, 120); await settle(); assert.deepEqual(await camera(), beforePanel); await display(false);
  await f.openFeatureEditor(1); await f.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click(); await f.sketchPanel().waitFor();
  for (const ortho of [false, true]) for (const reversed of [false, true]) { await projection(ortho); await preference(reversed); for (const delta of [120, -120]) await wheel(delta, reversed); }
  await preference(true); await f.snapshot('02-sketch-reversed');
  await f.page.evaluate(() => document.activeElement?.blur()); for (let i = 0; i < 3 && await f.sketchPanel().isVisible(); i++) await f.page.keyboard.press('Escape'); await f.sketchPanel().waitFor({ state: 'hidden' }); await f.same(doc);
  await f.page.reload(); await f.ready(); assert.equal(await currentPreference(), 'true'); await open(); assert.equal(await currentPreference(), 'true');
  await button('New part').click(); await f.ready(); assert.equal((await f.doc()).nodes.length, 0); assert.equal(await currentPreference(), 'true'); await open();
  await saveAndReopen();
  // Invalid stored values fall back to off, without rewriting the model.
  await f.page.evaluate(key => localStorage.setItem(key, 'invalid'), KEY); await f.page.reload(); await f.ready(); assert.equal(await currentPreference(), 'false'); await open(); await preference(true); await wheel(120, true);
  // Only this preference key is blocked; other Studio persistence retains its normal behavior.
  await f.newPage(); await f.page.addInitScript(key => {
    const get = Storage.prototype.getItem, set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) { if (name === key) throw new DOMException('blocked fixture', 'SecurityError'); return get.call(this, name); };
    Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException('blocked fixture', 'SecurityError'); return set.call(this, name, value); };
  }, KEY);
  await f.page.reload(); await f.ready(); await open(); assert.equal(await currentPreference(), 'false');
  await display(true); const notice = f.page.getByRole('status', { name: 'Wheel zoom preference', exact: true }); await notice.waitFor(); assert.match(await notice.innerText(), /this session only/); await display(false);
  await preference(true); await wheel(120, true); await f.snapshot('03-storage-denied-session-only'); await f.page.reload(); await f.ready(); assert.equal(await currentPreference(), 'false');
  assert.equal(f.report.downloads.length, 0); f.report.observations.push({ physicalTrackpadPinch: 'NOT_RUN', storageDenied: 'session only and reload defaults off' });
});
