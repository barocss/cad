import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

// Actual desktop UI proof. The world endpoints come from the source native mesh,
// and the rendered SVG endpoints are independently transformed into page pixels.
const f = await createFlow({
  name: 'fillet-picked-edge-highlight', output: process.argv[2],
  envFrozen: 'FILLET_PICKED_EDGE_HIGHLIGHT_SOURCE_FROZEN',
  initialFiles: ['apps/cad-studio/test/fillet-picked-edge-highlight-browser.mjs', 'apps/cad-studio/test/model-rail-helper.mjs'],
  qualification: '#740: actual desktop row hover and keyboard focus locate original straight edges through Fillet preview updates; Remove/Apply and Undo/Redo remain intact.',
  limits: ['Desktop WebGPU only; two non-adjacent straight edges of a 40×30×10 mm box. Curved edges, History editing and other tools are outside this proof.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkBrep,massPropertiesOf} from '@barocss/cad';
import {rectanglePart} from '@barocss/cad-model/engine/doc';
import {partSnapshot} from '@barocss/cad-model/engine/part';
import {bodyMesh} from '@barocss/cad-model/engine/mesh';
if(process.argv[3]==='"seed"'){console.log(JSON.stringify(rectanglePart(40,30,10)));process.exit(0);}
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
const {outputs}=partSnapshot(doc);assert.equal(outputs.length,1);
const output=outputs[0],check=checkBrep(output.brep,{strict:true});assert.ok(check.valid,JSON.stringify(check.issues));
console.log(JSON.stringify({mass:massPropertiesOf(output),nativeTargets:output.filletTargets,
 displayEdges:bodyMesh(output.brep,0).edges.map(({index,a,b,names,straight})=>({index,a,b,names,straight}))}));
`,
});
// Delay delivery of one unmodified, successful real Worker result. This is
// timing control only: the worker still performs the actual Fillet evaluation.
function holdPreview() {
  const proto = Worker.prototype, post = proto.postMessage;
  const handler = Object.getOwnPropertyDescriptor(proto, 'onmessage');
  let armed = false, target, pending, deliver;
  proto.postMessage = function (request, ...rest) {
    if (armed && request.type === 'preview') {
      armed = false;
      target = { worker: this, id: request.id, revision: request.revision };
    }
    return Reflect.apply(post, this, [request, ...rest]);
  };
  Object.defineProperty(proto, 'onmessage', {
    configurable: true, get: handler.get,
    set(callback) {
      handler.set.call(this, callback && function (event) {
        if (target?.worker === this && target.id === event.data?.id && event.data.result) {
          pending = { id: target.id, revision: target.revision, ok: event.data.result.ok };
          deliver = () => callback.call(this, event);
          target = null;
          return;
        }
        callback.call(this, event);
      });
    },
  });
  window.__filletLocationPreview = {
    arm() { armed = true; pending = null; deliver = null; },
    read: () => pending,
    release() { deliver(); deliver = null; },
  };
}
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('dialog', { name: 'Fillet', exact: true });
const overlay = () => f.page.locator('g[aria-label="Picked fillet edge location"]');
const row = edge => hud().getByRole('listitem', { name: `Locate ${edge.names.join(', ')}`, exact: true });
const midpoint = edge => edge.a.map((v, i) => (v + edge.b[i]) / 2);
const near = (a, b, tolerance = 1) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b}, tolerance ${tolerance}`);
async function open(doc) {
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'picked-edge-location.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) });
  await f.same(doc);
  await button('Iso', f.page.getByRole('group', { name: 'Views', exact: true })).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).trim().endsWith('Edges'); i++) await filter.click();
  assert.match((await filter.innerText()).trim(), /Edges$/);
}
async function pick(edge, shift = false) {
  const pixel = await f.screenOf(midpoint(edge)); assert.ok(pixel?.length === 2);
  if (shift) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...pixel); } finally { if (shift) await f.page.keyboard.up('Shift'); }
}
async function ready() { await hud().locator('.status.ok').waitFor(); }
async function scope(edges) {
  await f.page.waitForFunction(wanted => {
    const group = document.querySelector('[role="group"][aria-label="Fillet scope"]');
    const field = [...(group?.querySelectorAll('.field') ?? [])].find(element => element.firstElementChild?.textContent === 'Picked native edges');
    const names = field?.querySelector('span[title]')?.getAttribute('title')?.split('\n').filter(Boolean).sort();
    return JSON.stringify(names) === JSON.stringify(wanted);
  }, edges.flatMap(edge => edge.names).sort(), { timeout: 15000 });
}
async function outside() {
  // An actual pointer move, without changing selection or focus.
  await f.page.mouse.move(800, 70);
}
async function absent() { await overlay().waitFor({ state: 'hidden' }); }
async function invariant() {
  const state = await f.page.evaluate(() => ({
    doc: JSON.parse(JSON.stringify(window.__studioDoc)), selection: window.__studioSelection?.selection,
    radius: document.querySelector('[role="dialog"][aria-label="Fillet"] input[aria-label="Radius"]')?.value,
    history: [...document.querySelectorAll('.history .hs')].map(x => x.getAttribute('aria-label')),
    undo: [...document.querySelectorAll('button')].filter(x => ['Undo', 'Redo'].includes(x.getAttribute('aria-label') ?? x.textContent?.trim())).map(x => ({ name: x.getAttribute('aria-label') ?? x.textContent, disabled: x.disabled })),
    scope: document.querySelector('[role="group"][aria-label="Fillet scope"]')?.textContent,
  }));
  state.radius = await hud().getByLabel('Radius', { exact: true }).inputValue();
  return state;
}
async function located(edge, label, baseline) {
  await overlay().waitFor();
  // Use the actual visible SVG stroke; do not trust a product-provided ordinal.
  await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
  const actual = await overlay().evaluate(group => [...group.querySelectorAll('line')].flatMap(line => {
    const style = getComputedStyle(line), matrix = line.getScreenCTM();
    if (style.stroke !== 'rgb(244, 114, 208)' || !matrix) return [];
    const a = new DOMPoint(line.x1.baseVal.value, line.y1.baseVal.value).matrixTransform(matrix);
    const b = new DOMPoint(line.x2.baseVal.value, line.y2.baseVal.value).matrixTransform(matrix);
    return [{ a: [a.x, a.y], b: [b.x, b.y], stroke: style.stroke, width: style.strokeWidth, display: style.display, visibility: style.visibility, opacity: style.opacity }];
  }));
  assert.ok(actual.length);
  const expected = await Promise.all([f.screenOf(edge.a), f.screenOf(edge.b)]);
  const [start, end] = expected, dx = end[0] - start[0], dy = end[1] - start[1], length = Math.hypot(dx, dy);
  assert.ok(length > 10);
  let error = 0;
  const intervals = actual.map(segment => {
    assert.notEqual(segment.display, 'none'); assert.notEqual(segment.visibility, 'hidden'); assert.notEqual(segment.opacity, '0');
    assert.ok(Number.parseFloat(segment.width) >= 3);
    return [segment.a, segment.b].map(point => {
      const x = point[0] - start[0], y = point[1] - start[1];
      const distance = Math.abs(x * dy - y * dx) / length, along = (x * dx + y * dy) / length;
      error = Math.max(error, distance); assert.ok(distance <= 1, `Highlight left the original edge by ${distance}px`);
      assert.ok(along >= -1 && along <= length + 1, 'Highlight extends beyond the original edge');
      return along;
    }).sort((a, b) => a - b);
  }).sort((a, b) => a[0] - b[0]);
  near(intervals[0][0], 0); let reach = intervals[0][1];
  for (const [a, b] of intervals.slice(1)) { assert.ok(a <= reach + 1, 'Highlight has an unexpected gap'); reach = Math.max(reach, b); }
  near(reach, length);
  assert.deepEqual(await invariant(), baseline, 'locating an edge must preserve document, direct selection, radius, scope and Undo/Redo');
  f.report.observations.push({ label, original: { a: edge.a, b: edge.b, index: edge.index, names: edge.names }, expectedPixels: expected, rendered: actual, maxPixelError: error });
  await f.snapshot(label);
}
async function focusWithTab(target) {
  // Start at the real summary; every transition uses the keyboard.
  await hud().getByText('Edit picked edges', { exact: true }).click();
  if (await hud().locator('details').getAttribute('open') === null) await hud().getByText('Edit picked edges', { exact: true }).click();
  for (let i = 0; i < 16; i++) {
    await f.page.keyboard.press('Tab');
    if (await target.evaluate(element => element === document.activeElement)) return;
  }
  assert.fail('Tab did not reach the requested picked-edge row');
}
await f.run(async () => {
  const newContext = f.browser.newContext.bind(f.browser);
  f.browser.newContext = async options => {
    const context = await newContext({ ...options, serviceWorkers: 'block' });
    await context.addInitScript(holdPreview);
    return context;
  };
  const seed = await f.inspect('seed', {}, 'seed'), stock = await f.inspect('source-native', seed);
  const top = stock.displayEdges.find(edge => edge.straight && edge.names.includes('n1.side0|n1.top'));
  const bottom = stock.displayEdges.find(edge => edge.straight && edge.names.includes('n1.bottom|n1.side0'))
    ?? stock.displayEdges.find(edge => edge.straight && edge.names.some(name => name.split('|').includes('n1.bottom')) && edge.a[1] === 0 && edge.b[1] === 0);
  assert.ok(top && bottom); assert.equal(top.names.length, 1); assert.equal(bottom.names.length, 1);
  assert.ok(top.a[2] === 10 && top.b[2] === 10 && bottom.a[2] === 0 && bottom.b[2] === 0);
  await f.newPage(); await f.page.setViewportSize({ width: 1600, height: 1100 }); await open(seed);
  await pick(top); await f.page.waitForFunction(index => window.__studioSelection?.selection.edges.some(edge => edge.edge === index), top.index);
  await clickModelCommand(f.page, 'Modify', 'Fillet'); await hud().getByLabel('Radius', { exact: true }).fill('1.5'); await ready();
  await pick(bottom, true); await ready(); await scope([top, bottom]);
  await hud().getByText('Edit picked edges', { exact: true }).click();
  assert.equal(await hud().getByRole('listitem').count(), 2);
  let baseline = await invariant(); await f.same(seed); await absent(); await f.snapshot('01-two-picked-original-baseline');
  await row(top).hover(); await located(top, '02-top-hover-preview', baseline);
  await row(bottom).hover(); await located(bottom, '03-bottom-hover-preview', baseline);
  await outside(); await absent(); assert.deepEqual(await invariant(), baseline);
  await focusWithTab(row(top)); await located(top, '04-top-keyboard-focus', baseline);
  // Keep the mouse on the first row while Tab moves focus to the second row.
  await row(top).hover();
  // The Remove button belongs to its row; Tab must then move to the other row.
  await f.page.keyboard.press('Tab'); await located(top, '05-remove-button-focus-keeps-top-location', baseline);
  await f.page.keyboard.press('Tab'); assert.ok(await row(bottom).evaluate(element => element === document.activeElement));
  await located(bottom, '06-bottom-keyboard-focus-with-pointer-on-top', baseline);
  await outside(); await located(bottom, '06b-pointer-leave-keeps-keyboard-bottom', baseline);
  await hud().getByLabel('Radius', { exact: true }).click(); await outside(); await absent();
  // Hold the actual next Worker response, with no fake geometry or reply.
  await row(top).hover();
  await f.page.evaluate(() => window.__filletLocationPreview.arm());
  await hud().getByLabel('Radius', { exact: true }).fill('2');
  await f.page.waitForFunction(() => window.__filletLocationPreview.read());
  await hud().locator('.status.busy').waitFor();
  const held = await f.page.evaluate(() => window.__filletLocationPreview.read());
  assert.equal(held.ok, true);
  const pendingBaseline = await invariant(); assert.equal(Number(pendingBaseline.radius), 2);
  assert.deepEqual({ ...pendingBaseline, radius: baseline.radius, scope: baseline.scope }, baseline,
    'A pending radius request changes no document, direct selection or Undo state');
  const topStillHovered = await row(top).evaluate(el => el.matches(':hover'));
  f.report.observations.push({ label: 'radius-input-to-pending-layout', topStillHovered, overlayCount: await overlay().count() });
  await f.persist();
  if (!topStillHovered) await row(top).hover();
  await located(top, '07a-held-real-preview-original-top', pendingBaseline);
  await row(bottom).hover(); await located(bottom, '07b-hover-other-row-while-preview-pending', pendingBaseline);
  assert.ok(await hud().locator('.status.busy').isVisible());
  f.report.observations.push({ label: 'held-real-preview-response', ...held, replyDataModified: false });
  // Keep a keyboard-owned row across layout reflow when the busy status returns to ready.
  await focusWithTab(row(bottom)); await outside();
  await located(bottom, '07b-focused-before-worker-release', pendingBaseline);
  await f.page.evaluate(() => window.__filletLocationPreview.release());
  await ready(); await scope([top, bottom]); baseline = await invariant();
  assert.deepEqual({ ...baseline, scope: pendingBaseline.scope }, pendingBaseline,
    'Delivering the held real preview preserves authored state and direct selection');
  await located(bottom, '07c-released-preview-original-bottom', baseline);
  await row(top).hover(); await located(top, '07d-updated-preview-original-top', baseline);
  // Closing the list must clear a pointer-owned location.
  await hud().getByText('Edit picked edges', { exact: true }).click(); await absent();
  await hud().getByText('Edit picked edges', { exact: true }).click(); await absent();
  await row(top).hover(); await located(top, '08-before-remove', baseline);
  await button(`Remove ${top.names.join(', ')}`, hud()).click(); await ready(); await scope([bottom]); await outside(); await absent();
  assert.equal(await hud().getByRole('listitem').count(), 1); assert.equal(await row(bottom).count(), 1);
  assert.equal(Number(await hud().getByLabel('Radius', { exact: true }).inputValue()), 2); await f.same(seed);
  baseline = await invariant(); await row(bottom).hover(); await located(bottom, '09-remaining-original-bottom', baseline);
  await button('Apply', hud()).click(); await f.changed(seed); await absent();
  const applied = await f.doc(); assert.deepEqual(applied.nodes.slice(0, 2), seed.nodes);
  assert.equal(applied.nodes[2].kind, 'fillet'); assert.deepEqual(applied.nodes[2].edges, bottom.names); assert.equal(applied.nodes[2].radius, 2);
  const native = await f.inspect('applied-native', applied);
  const expectedVolume = 12000 - 40 * 4 * (1 - Math.PI / 4); near(native.mass.volume, expectedVolume, 1e-7);
  assert.deepEqual([...native.nativeTargets].sort(), [...bottom.names].sort());
  await f.snapshot('10-applied-bottom-only'); await f.undo(); await f.same(seed); await absent(); await f.redo(); await f.same(applied); await absent();
  await f.snapshot('11-redo-no-location');
  // A new command reuses original ordinals. No previous row location may reappear.
  await f.undo(); await f.same(seed); await pick(top); await clickModelCommand(f.page, 'Modify', 'Fillet'); await ready(); await scope([top]);
  await hud().getByText('Edit picked edges', { exact: true }).click(); await absent(); baseline = await invariant();
  await row(top).hover(); await located(top, '12-new-command-reused-ordinal', baseline);
  await button('Cancel', hud()).click(); await absent(); await f.same(seed);
  await clickModelCommand(f.page, 'Modify', 'Chamfer'); await f.page.getByRole('dialog', { name: 'Chamfer', exact: true }).waitFor(); await absent();
  await button('Cancel', f.page.getByRole('dialog', { name: 'Chamfer', exact: true })).click();
  // Same mesh ordinal in a different source document must resolve fresh coordinates.
  const shifted = structuredClone(seed); shifted.nodes[0].min[0] += 12; shifted.nodes[0].max[0] += 12;
  await open(shifted); const shiftedStock = await f.inspect('shifted-source-native', shifted);
  const shiftedTop = shiftedStock.displayEdges.find(edge => edge.names.includes(top.names[0])); assert.ok(shiftedTop); assert.equal(shiftedTop.index, top.index);
  await pick(shiftedTop); await clickModelCommand(f.page, 'Modify', 'Fillet'); await ready(); await scope([shiftedTop]);
  await hud().getByText('Edit picked edges', { exact: true }).click(); await absent(); baseline = await invariant();
  await row(shiftedTop).hover(); await located(shiftedTop, '13-new-document-same-ordinal-fresh-location', baseline);
  await button('Cancel', hud()).click(); await absent(); await f.same(shifted); await f.snapshot('14-cancel-cleared');
});
