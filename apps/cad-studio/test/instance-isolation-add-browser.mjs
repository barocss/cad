// #235: explicit additive isolation, without modifying shared GPU implementation.
import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const lifecycle = process.argv[3] === '--lifecycle';
const f = await createFlow({ name: 'instance-isolation-add', envFrozen: 'ISOLATION_ADD_FROZEN', output: process.argv[2],
  initialFiles: ['apps/cad-studio/test/instance-isolation-add-browser.mjs'],
  qualification: lifecycle ? '#235 isolation snapshot across member deletion/Undo and explicit linked revision replacement.' : '#235 explicit top-level Add to isolation and display-only ownership.',
  limits: ['Synthetic A/B/C and hidden D. Desktop WebGPU only. Actual renderer frame passes and existing raycast hooks, not a new opacity API. Nested assembly and all blocked modes are not exhaustively exercised. No downloads.'] });
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] }, { id: 'n1', kind: 'extrude', sketch: 0, height: 10 }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0, instances: ['A', 'B', 'C', 'D'].map((name, i) => ({ id: `p${i + 1}`, name, doc: structuredClone(part), position: [i * 20, 0, 0], rotation: [0, 0, 0], ...(name === 'D' ? { hidden: true } : {}) })) };
function holdPlaced() {
  const proto = Worker.prototype, post = proto.postMessage, descriptor = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  let armed = false, target = null, held = null; const queue = [], tables = new WeakMap();
  proto.postMessage = function(request, ...args) {
    const table = tables.get(this) ?? new Map(); tables.set(this, table);
    for (const wire of [request?.doc, request?.base]) for (const [id, node] of wire?.added ?? []) table.set(id, structuredClone(node));
    if (armed && request?.type === 'placed') { armed = false; target = { worker: this, request: structuredClone(request), resolvedNodes: request.doc.ids.map(id => table.get(id)) }; }
    return post.call(this, request, ...args);
  };
  Object.defineProperty(proto, 'onmessage', { configurable: true, get: descriptor.get, set(cb) {
    descriptor.set.call(this, cb && function(event) {
      if (target?.worker === this) {
        if (event.data?.id === target.request.id && event.data.result) held = { request: target.request, resolvedNodes: target.resolvedNodes, ok: event.data.result.ok };
        if (held) { queue.push(() => cb.call(this, event)); return; }
      }
      cb.call(this, event);
    });
  } });
  window.__isolationHold = { arm() { if (armed || target) throw Error('Already holding'); armed = true; }, read: () => ({ held, queued: queue.length }),
    async release() { if (!held) throw Error('No real placed reply'); while (queue.length) { queue.shift()(); await new Promise(resolve => setTimeout(resolve, 0)); } target = null; held = null; } };
}
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
async function open(doc = seed) { await f.page.setInputFiles('input[aria-label="Model file"]', { name: 'isolation-own-boxes.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }); await f.same(doc); await f.page.waitForFunction(() => window.__studioInstanceBounds?.()?.length >= 3); }
await f.run(async () => {
  if (lifecycle) { const create = f.browser.newContext.bind(f.browser); f.browser.newContext = async options => { const context = await create(options); await context.addInitScript(holdPlaced); return context; }; }
  await f.newPage(); await f.page.setViewportSize({ width: 1440, height: 900 }); await open();
  await button('Top').click(); await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await button('Display and previews').click(); await f.page.getByLabel('CAD display mode', { exact: true }).selectOption('shaded-with-edges');
  await draws(['p1', 'p2', 'p3'], []); assert.deepEqual(await picks(), ['p1', 'p2', 'p3', null]);
  if (lifecycle) {
    f.phase = 'Delete isolated B: original snapshot blocks Add until Undo';
    await row('p1').click(); await button('Isolate selection').click(); await add('B').click(); await draws(['p1', 'p2'], ['p3']);
    await row('p2').click(); const instance = f.page.getByRole('complementary', { name: 'Instance', exact: true });
    await button('Remove', instance).click(); await f.page.waitForFunction(() => window.__studioDoc.instances.length === 3); await f.ready();
    assert.equal(await row('p2').count(), 0); assert.equal(await add('C').isDisabled(), true);
    assert.match(await add('C').getAttribute('title'), /Restore the view and isolate again/);
    const deleted = await stable(); await add('C').evaluate(el => el.click()); assert.deepEqual(await stable(), deleted);
    await draws(['p1'], ['p3']); await f.snapshot('04-deleted-member-refuses-add');
    await f.undo(); await f.same(seed); await draws(['p1', 'p2'], ['p3']);
    assert.equal(await add('A').isDisabled(), true); assert.equal(await add('B').isDisabled(), true); assert.equal(await add('C').isEnabled(), true);
    const restored = await stable(); await add('C').click(); await draws(['p1', 'p2', 'p3'], []); assert.deepEqual(await stable(), restored);
    await f.snapshot('05-Undo-revives-same-snapshot');
    f.phase = 'Public New revision file offers B while linked A stays accepted';
    const linked = structuredClone(seed); linked.instances[0].part = { id: 'linked-box', rev: 'A', source: 'box-A.bcad' };
    await open(linked); await row('p1').click(); await button('Isolate selection').click(); await draws(['p1'], ['p2', 'p3']);
    const revised = structuredClone(part); revised.nodes[1].height = 20;
    await f.page.setInputFiles('input[aria-label="New revision file"]', { name: 'box-B.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(revised)) });
    await instance.getByRole('status', { name: 'Revision waiting', exact: true }).waitFor(); await f.ready();
    const offered = await f.doc(); assert.deepEqual(offered.instances, linked.instances);
    assert.match(await instance.innerText(), /1000 mm³/);
    await f.page.evaluate(() => window.__isolationHold.arm()); await button('Accept Rev B', instance).click();
    await f.page.waitForFunction(() => window.__isolationHold.read().held);
    const held = await f.page.evaluate(() => window.__isolationHold.read());
    assert.equal(held.held.ok, true); assert.equal(held.held.request.type, 'placed');
    f.report.observations.push({ heldPlacedSource: held });
    assert.equal(held.held.resolvedNodes[1].height, 20); assert.ok(held.queued > 0);
    const accepted = await stable(); assert.equal(accepted.doc.instances[0].part.rev, 'B'); assert.equal(accepted.doc.instances[0].part.source, 'box-B.bcad');
    assert.equal(await add('C').isDisabled(), true); await add('C').evaluate(el => el.click()); assert.deepEqual(await stable(), accepted);
    await f.snapshot('06-new-source-old-placed-reply-held');
    await f.page.evaluate(() => window.__isolationHold.release()); await f.ready();
    await f.page.waitForFunction(() => window.__studioInstanceBounds().find(b => b.id === 'p1')?.max[2] === 20);
    await draws(['p1'], ['p2', 'p3']); assert.equal(await add('C').isEnabled(), true);
    // UI mass is independently expected from literal box dimensions, not inferred from measured output.
    await f.page.waitForFunction(() => document.querySelector('[aria-label="Instance"]')?.textContent.includes('2000 mm³'));
    const bounds = await f.page.evaluate(() => window.__studioInstanceBounds());
    const a = bounds.find(b => b.id === 'p1'); assert.deepEqual(a.min, [0, 0, 0]); assert.deepEqual(a.max, [10, 10, 20]);
    const current = await stable(); assert.deepEqual(current.doc, accepted.doc);
    const selection = await selected(); await add('C').click(); await draws(['p1', 'p3'], ['p2']); assert.deepEqual(await selected(), selection); assert.deepEqual(await stable(), current);
    await f.snapshot('07-fresh-revision-allows-explicit-add');
    f.report.observations.push({ lifecycle: true, deletionRefusedWithoutPruning: true, UndoRestoredSnapshot: true, held, bounds, literalVolumes: { A: 1000, B: 2000 }, FIFO: true, projectSaveFreshOpen: 'NOT_RUN' });
    return;
  }
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
