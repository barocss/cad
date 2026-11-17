// Real Worker payloads are never changed; only delivery is delayed to expose stale diagnostics.
import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const baseline = process.argv.includes('--baseline');
const f = await createFlow({ name: 'drawing-section-result-currentness', output: process.argv[2], envFrozen: 'SECTION_CURRENT_FROZEN', initialFiles: ['apps/cad-studio/test/drawing-section-result-currentness-browser.mjs'], extraFrozen: ['apps/cad-studio/src/ui/useDrawingSheet.ts'], qualification: 'Section results and errors belong to the current projection request, including while a changed cut waits for its native reply.', limits: ['Synthetic native box only. Real Worker responses held and released unchanged. No export, persistence or general race-matrix claim.'] });
const seed = {format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[20,10]},{id:'n1',kind:'extrude',sketch:0,height:8}],outputs:{b1:{node:1,side:'solid'}},nextId:2,drawing:{sheet:'A4',scope:{kind:'part'},scale:2,projection:'third',hidden:true,sections:[{id:'A',view:'front',at:50}],dimensions:[]}};
function holdReplies() {
  const proto = Worker.prototype, post = proto.postMessage, descriptor = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  let armed = false, target = null, held = null;
  const queue = [];
  proto.postMessage = function(request, ...args) { if (armed && request?.type === 'drawing') { armed = false; target = { worker: this, request: structuredClone(request) }; } return post.call(this, request, ...args); };
  Object.defineProperty(proto, 'onmessage', { configurable: true, get: descriptor.get, set(cb) { descriptor.set.call(this, cb && function(event) { if (target?.worker === this) { if (event.data?.id === target.request.id && event.data.drawing) held = structuredClone(event.data.drawing); if (held) { queue.push(() => cb.call(this, event)); return; } } cb.call(this, event); }); } });
  window.__sectionHold = { arm() { if (target || armed) throw Error('Already holding'); armed = true; }, read: () => ({ held, request: target?.request, queued: queue.length }), release() { target = null; held = null; while (queue.length) queue.shift()(); } };
}
const button = name => f.page.getByRole('button', { name, exact: true });
const errors = () => f.page.getByText(/^Section A–A:/);
const current = () => f.page.evaluate(() => window.__studioDrawing?.());
async function edit(at) { const input = f.page.getByLabel('Section Y', { exact: true }); await input.fill(String(at)); await input.press('Enter'); }
async function readyCut(ok) { await f.page.waitForFunction(ok => { const s = window.__studioDrawing?.()?.sections?.[0]; return ok ? s?.rings > 0 : !!s?.error; }, ok); }
await f.run(async () => {
  const make = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => { const c = await make(options); await c.addInitScript(holdReplies); return c; };
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({ name: 'section-currentness.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.page.waitForFunction(() => window.__studioDoc?.nodes?.length === 2 && !!window.__studioDoc.drawing);
  await f.ready(); await button('Drawing').click(); await readyCut(false);
  assert.equal(await errors().count(), 1);
  const original = await current();
  await f.page.evaluate(() => window.__sectionHold.arm()); await edit(5);
  await f.page.waitForFunction(() => !!window.__sectionHold.read().held);
  const held = await f.page.evaluate(() => window.__sectionHold.read());
  assert.equal(held.held.ok, true); assert.equal(held.held.sections[0].result.ok, true);
  assert.equal(await f.page.getByLabel('Section Y', { exact: true }).inputValue(), '5');
  assert.equal(await errors().count(), baseline ? 1 : 0, 'old out-of-body error must not describe the new valid cut');
  await f.snapshot('01-valid-cut-reply-held');
  f.report.observations.push({ original, held, staleErrorVisible: await errors().count() });
  await f.page.evaluate(() => window.__sectionHold.release()); await readyCut(true);
  assert.equal(await errors().count(), 0);
  await f.snapshot('02-current-valid-cut');
  if (baseline) return;
  await f.page.evaluate(() => window.__sectionHold.arm()); await button('Undo').click();
  await f.page.waitForFunction(() => !!window.__sectionHold.read().held);
  assert.equal(await f.page.getByLabel('Section Y', { exact: true }).inputValue(), '50');
  assert.equal(await errors().count(), 0, 'pending undo must not show an unconfirmed result');
  await f.page.evaluate(() => window.__sectionHold.release()); await readyCut(false); assert.equal(await errors().count(), 1);
  await button('Redo').click(); await readyCut(true); assert.equal(await errors().count(), 0);
  const bounds = await f.page.evaluate(() => { const lines = [...document.querySelectorAll('svg[aria-label="Drawing sheet"] g.section[data-dim="A"]:not([data-view]) line')]; const xs = lines.flatMap(l => [+l.getAttribute('x1'), +l.getAttribute('x2')]), ys = lines.flatMap(l => [+l.getAttribute('y1'), +l.getAttribute('y2')]); return { width: Math.max(...xs)-Math.min(...xs), height: Math.max(...ys)-Math.min(...ys) }; });
  assert.ok(Math.abs(bounds.width - 40) < .001 && Math.abs(bounds.height - 16) < .001);
  assert.deepEqual((await f.doc()).nodes, seed.nodes);
  assert.ok(Math.abs((await f.bodies()).bodies[0].volume - 1600) < 1e-8);
  await f.snapshot('03-redone-current-cut'); f.report.observations.push({ bounds, sourceVolume: 1600, undoRedo: 'PASS' });
});
