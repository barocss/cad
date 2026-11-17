// #235: explicit additive isolation, without modifying shared GPU implementation.
import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const f = await createFlow({ name: 'instance-isolation-add', envFrozen: 'ISOLATION_ADD_FROZEN', output: process.argv[2],
  initialFiles: ['apps/cad-studio/test/instance-isolation-add-browser.mjs'],
  qualification: '#235 explicit top-level Add to isolation and display-only ownership.',
  limits: ['Synthetic A/B/C and hidden D. Desktop WebGPU only. Actual renderer frame passes and existing raycast hooks, not a new opacity API. Nested assembly and all blocked modes are not exhaustively exercised. No downloads.'] });
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] }, { id: 'n1', kind: 'extrude', sketch: 0, height: 10 }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0, instances: ['A', 'B', 'C', 'D'].map((name, i) => ({ id: `p${i + 1}`, name, doc: structuredClone(part), position: [i * 20, 0, 0], rotation: [0, 0, 0], ...(name === 'D' ? { hidden: true } : {}) })) };
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const row = id => f.page.locator(`[data-browser-instance-path="${id}"]`);
const add = name => button(`Add ${name} to isolation`);
const selected = () => f.page.locator('[data-browser-instance-path].sel').evaluateAll(rows => rows.map(r => r.dataset.browserInstancePath));
async function stable() { return f.page.evaluate(() => ({ doc: window.__studioDoc, camera: window.__studioCamera(), dirty: !!document.querySelector('[aria-label="Unsaved changes"]'), history: [...document.querySelectorAll('.history .hs')].map(e => e.textContent), undo: document.querySelector('button[aria-label="Undo"]')?.disabled, redo: document.querySelector('button[aria-label="Redo"]')?.disabled })); }
async function picks() { return f.page.evaluate(() => [5, 25, 45, 65].map(x => window.__studioInstanceAt([x, 5, 10])?.id ?? null)); }
async function draws(opaque, faded) {
  await f.page.evaluate(() => window.__studioFrameCost(true));
  await f.page.waitForFunction(({ opaque, faded }) => {
    const c = window.__studioFrameCost()['shaded-with-edges']; if (!c || c.renderer !== 'webgpu') return false;
    const body = id => c.bodies.find(b => b.key.startsWith(id + '/'));
    return opaque.every(id => body(id)?.passes.surface > 0) && faded.every(id => body(id) && body(id).passes.surface === 0 && body(id).passes.oit + body(id).passes.transparent > 0);
  }, { opaque, faded });
  const cost = await f.page.evaluate(() => window.__studioFrameCost()['shaded-with-edges']);
  assert.ok(!cost.bodies.find(b => b.key.startsWith('p4/'))?.draws);
  f.report.observations.push({ opaque, faded, cost });
}
async function open() { await f.page.setInputFiles('input[aria-label="Model file"]', { name: 'isolation-own-boxes.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }); await f.same(seed); await f.page.waitForFunction(() => window.__studioInstanceBounds?.()?.length >= 3); }
await f.run(async () => {
  await f.newPage(); await f.page.setViewportSize({ width: 1440, height: 900 }); await open();
  await button('Top').click(); await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Display and previews').click(); await f.page.getByLabel('CAD display mode', { exact: true }).selectOption('shaded-with-edges');
  await draws(['p1', 'p2', 'p3'], []); assert.deepEqual(await picks(), ['p1', 'p2', 'p3', null]);
  const before = await stable();
  f.phase = 'Isolate A, selecting B does not add B';
  await row('p1').click(); await button('Isolate selection').click(); await button('Restore view').waitFor();
  await draws(['p1'], ['p2', 'p3']); assert.deepEqual(await picks(), ['p1', null, null, null]);
  await row('p2').click(); assert.deepEqual(await selected(), ['p2']);
  assert.equal(await add('A').isDisabled(), true); assert.equal(await add('B').isEnabled(), true); assert.equal(await add('D').isDisabled(), true);
  await draws(['p1'], ['p2', 'p3']); assert.deepEqual(await stable(), before); await f.snapshot('01-B-selected-not-isolated');
  f.phase = 'Explicit Add B preserves selection and changes only isolation';
  await add('B').click(); assert.deepEqual(await selected(), ['p2']);
  await draws(['p1', 'p2'], ['p3']); assert.deepEqual(await picks(), ['p1', 'p2', null, null]);
  assert.equal(await add('A').isDisabled(), true); assert.equal(await add('B').isDisabled(), true);
  assert.deepEqual(await stable(), before); await f.snapshot('02-A-B-isolated');
  await f.page.keyboard.press('Escape'); assert.deepEqual(await selected(), []);
  await draws(['p1', 'p2'], ['p3']); assert.deepEqual(await stable(), before);
  f.phase = 'Measure refuses additive isolation without changing its operation';
  await clickModelCommand(f.page, 'Inspect', 'Measure'); const measurement = f.page.getByLabel('Measurement', { exact: true }); await measurement.waitFor();
  assert.equal(await add('C').isDisabled(), true); await add('C').evaluate(el => el.click());
  assert.equal(await measurement.isVisible(), true); await button('Done measuring', measurement).click();
  await draws(['p1', 'p2'], ['p3']); assert.deepEqual(await selected(), []); assert.deepEqual(await stable(), before);
  f.phase = 'Restore removes isolation without document or camera edits';
  await button('Restore view').click(); await button('Isolate selection').waitFor();
  assert.equal(await f.page.locator('[data-add-isolation]').count(), 0);
  await draws(['p1', 'p2', 'p3'], []); assert.deepEqual(await picks(), ['p1', 'p2', 'p3', null]); assert.deepEqual(await stable(), before);
  f.phase = 'Accepted Open resets isolation';
  await row('p1').click(); await button('Isolate selection').click(); await add('B').click(); await draws(['p1', 'p2'], ['p3']);
  await open(); assert.equal(await f.page.locator('[data-add-isolation]').count(), 0); await draws(['p1', 'p2', 'p3'], []); await f.same(seed);
  await f.snapshot('03-Open-restored');
});
