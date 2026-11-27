import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'App.tsx', 'app/useBridgeCurve.ts', 'app/bridgeCurveDisplay.ts', 'ui/BridgeCurvePanel.tsx',
  'viewport/Viewport.tsx', 'viewport/viewportPointerInput.ts', 'viewport/gpuRenderer.ts', 'viewport/renderer.ts',
].map(path => 'apps/cad-studio/src/' + path).concat([
  'packages/barocss-cad-model/src/engine/bridgeCurve.ts', 'packages/barocss-cad-model/src/engine/direct.ts',
]);
const f = await createFlow({
  name: 'bridge-curve', envFrozen: 'BRIDGE_CURVE_SOURCE_FROZEN', output: process.argv[2],
  qualification: '#750 native Bridge Curve in desktop Studio',
  limits: ['Two exact root edges and Direct scenes. No G2, live references, or arbitrary curves.'],
  initialFiles: [...pins, 'apps/cad-studio/test/bridge-curve-browser.mjs'], requiredFrozen: pins,
  inspectorSource: `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { curveDomain, evaluateCurveD1 } from '@barocss/cad';
import { geometryOf } from '@barocss/cad-model/engine/direct';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const bodies = partBreps(doc).map(({ key, brep }) => [key, createHash('sha256').update(JSON.stringify(brep)).digest('hex')]);
const object = doc.direct?.objects.find(item => item.name.startsWith('Bridge curve · '));
const bridge = object && geometryOf(doc.direct, object);
const curve = bridge && { degree: bridge.degree, controls: bridge.controlPoints,
  ends: curveDomain(bridge).map(knot => evaluateCurveD1(bridge, knot)) };
console.log(JSON.stringify({ bodies, curve }));
`,
});

const base = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {} };
const rect = (id, min, max, z) => ({ id, kind: 'sketch', profile: 'rectangle', min, max,
  plane: { origin: [0, 0, z], normal: [0, 0, 1], xAxis: [1, 0, 0] } });
const edges = { ...base, nodes: [
  rect('n0', [0, 0], [20, 10], 0), { id: 'n1', kind: 'extrude', sketch: 0, height: 6 },
  rect('n2', [33, 12], [43, 26], 8), { id: 'n3', kind: 'extrude', sketch: 2, height: 6 },
], outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } }, nextId: 4 };
const linear = (a, b) => ({ knots: [0, 0, 1, 1], poles: [a, b] });
const lines = {
  a: linear([0, 0, 2], [20, 0, 2]), b: linear([28, 8, 9], [28, 22, 9]),
  duplicate: linear([20, 0, 2], [0, 0, 2]),
  closed: { knots: [0, 0, 1, 2, 3, 3], poles: [[0, 10, 4], [6, 10, 4], [3, 16, 4], [0, 10, 4]] },
  tiny: linear([12, 13, 0], [12.00000005, 13, 0]),
};
const source = ({ knots, poles }) => `@model test { version:0; length-unit:mm;
  @curve #line { type:nurbs; degree:1; knots:${JSON.stringify(knots)};
  control-points:${JSON.stringify(poles)}; weights:${JSON.stringify(poles.map(() => 1))}; } }`;
const directSeed = { ...base, nodes: [], outputs: {}, nextId: 0, direct: {
  sources: Object.fromEntries(Object.entries(lines).map(([id, curve]) => [id, source(curve)])),
  objects: Object.keys(lines).map(id => ({ id, name: 'Source ' + id, source: id, geometry: 'line' })),
} };

const button = name => f.page.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Bridge curve', exact: true });
const coordinates = () => panel().locator('[aria-label="Bridge endpoint coordinates"]');
const history = async () => [await button('Undo').isEnabled(), await button('Redo').isEnabled()];
const readEdges = () => f.page.evaluate(() => window.__studioSelection.selection.edges);
const directAt = point => f.page.evaluate(point => window.__studioDirectAt(point), point);
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
async function open(seed, label) {
  const file = { name: label + '.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) };
  await f.openFile(file, seed.nodes.length);
  await f.same(seed);
}
async function pick(point, additive = false) {
  const pixel = await f.page.evaluate(point => window.__studioScreenOf(point), point);
  assert.equal(pixel?.length, 2);
  assert.ok(await f.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.matches('.vp-canvas'), pixel),
    'pick reaches the viewport at ' + pixel.join(', '));
  if (additive) await f.page.keyboard.down('Shift');
  try { await f.page.mouse.click(...pixel); } finally { if (additive) await f.page.keyboard.up('Shift'); }
}
async function begin() {
  await button('Bridge curve').click({ timeout: 12000 });
  await panel().getByRole('button', { name: 'Apply' }).waitFor({ timeout: 10000 });
}
async function cancel() {
  await panel().getByRole('button', { name: 'Cancel' }).click();
  await panel().waitFor({ state: 'hidden' });
}
function checkNative({ curve }, expectedEnds, degree, expectedDirections) {
  assert.equal(curve.degree, degree);
  assert.deepEqual(curve.ends.map(end => end.point), expectedEnds);
  if (expectedDirections) curve.ends.forEach(({ derivative: [x, y, z] }, i) => {
    const [a, b, c] = expectedDirections[i];
    const cross = Math.hypot(y * c - z * b, z * a - x * c, x * b - y * a);
    assert.ok(x * a + y * b + z * c > 0);
    assert.ok(cross / Math.hypot(x, y, z) < 1e-12);
  });
}

await f.run(async () => {
  await f.newPage();
  f.phase = 'WebGPU native edge selection';
  await open(edges, 'two-offset-boxes');
  const nativeSeed = await f.inspect('before', edges);
  assert.equal(nativeSeed.bodies.length, 2);
  await button('Top').click();
  await frame();
  const filter = button('Selection filter');
  await filter.click();
  await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await pick([17, 0, 6]);
  assert.equal((await readEdges()).length, 1);
  await pick([43, 15, 14], true);
  assert.deepEqual((await readEdges()).map(hit => hit.body), [0, 1]);
  const originalHistory = await history(), originalSelection = await readEdges();
  await begin();
  assert.equal(await coordinates().innerText(), '(20, 0, 6) → (43, 12, 14) mm');
  await button('Iso').click();
  await frame();
  await f.same(edges);
  assert.deepEqual(await history(), originalHistory);
  assert.equal(await directAt([31.5, 6, 10]), null, 'preview is not a selectable Direct curve');
  await f.snapshot('01-g0-preview');
  await cancel();
  await f.same(edges);
  assert.deepEqual(await readEdges(), originalSelection);
  assert.deepEqual(await history(), originalHistory);

  f.phase = 'WebGPU G1 edit and Apply';
  await begin();
  const first = panel().getByLabel('First endpoint', { exact: true });
  const savedFirst = await first.inputValue();
  await first.selectOption(savedFirst === 'start' ? 'end' : 'start');
  assert.equal(await coordinates().innerText(), '(0, 0, 6) → (43, 12, 14) mm');
  await first.selectOption(savedFirst);
  await panel().getByLabel('Bridge continuity').selectOption('G1');
  await f.same(edges);
  assert.deepEqual(await history(), originalHistory);
  await f.snapshot('02-g1-preview');
  await panel().getByRole('button', { name: 'Apply', exact: true }).click();
  await f.changed(edges);
  const accepted = await f.doc();
  const { direct, ...unchanged } = accepted;
  assert.deepEqual(unchanged, edges);
  assert.equal(direct.objects.length, 1);
  const g1 = await f.inspect('g1', accepted);
  assert.deepEqual(g1.bodies, nativeSeed.bodies);
  checkNative(g1, [[20, 0, 6], [43, 12, 14]], 3, [[1, 0, 0], [0, 1, 0]]);
  await f.snapshot('03-g1-applied');
  await f.undo();
  await f.same(edges);
  await f.redo();
  await f.same(accepted);
  assert.deepEqual(await f.inspect('redo', await f.doc()), g1);
  const saved = await f.save('edge-bridge');
  await f.freshOpen(saved.file, accepted, '04-g1-fresh-open');
  assert.deepEqual(await f.inspect('reopened', await f.doc()), g1);
  f.report.observations.push({ fixture: 'root edges', g1 });

  f.phase = 'WebGL2 Direct refusals and exact G0';
  await f.page.goto(new URL('?renderer=webgl2', f.server.resolvedUrls.local[0]).href);
  await f.page.locator('.viewport[data-renderer="webgl2"]').waitFor();
  await f.ready();
  await open(directSeed, 'direct-bridge-inputs');
  const row = id => f.page.locator('.outliner .ol.direct').getByText('Source ' + id, { exact: true });
  const pickRows = async (a, b) => { await row(a).click(); await row(b).click({ modifiers: ['Shift'] }); };
  const directHistory = await history();
  for (const [id, reason] of [['duplicate', /same segment/], ['closed', /closed source/], ['tiny', /modeling tolerance/]]) {
    await pickRows('a', id);
    await begin();
    assert.match(await panel().getByRole('alert').innerText(), reason);
    assert.equal(await panel().getByRole('button', { name: 'Apply' }).isEnabled(), false);
    await f.same(directSeed);
    assert.deepEqual(await history(), directHistory);
    if (id === 'closed') await f.snapshot('05-closed-refusal');
    await cancel();
  }
  await pickRows('a', 'b');
  await begin();
  assert.equal(await coordinates().innerText(), '(20, 0, 2) → (28, 8, 9) mm');
  await button('Iso').click();
  await frame();
  assert.equal(await directAt([24, 4, 5.5]), null);
  await f.snapshot('06-webgl2-g0-preview');
  await panel().getByRole('button', { name: 'Apply' }).click();
  await f.changed(directSeed);
  const straight = await f.doc(), g0 = await f.inspect('g0', straight);
  assert.equal(straight.direct.objects.length, directSeed.direct.objects.length + 1);
  assert.deepEqual(straight.direct.objects.slice(0, -1), directSeed.direct.objects);
  for (const [id, original] of Object.entries(directSeed.direct.sources)) assert.equal(straight.direct.sources[id], original);
  checkNative(g0, [[20, 0, 2], [28, 8, 9]], 1);
  assert.deepEqual(g0.curve.controls, [[20, 0, 2], [28, 8, 9]]);
  await f.snapshot('07-webgl2-g0-applied');
  f.report.observations.push({ fixture: 'Direct lines', backend: 'webgl2', g0, refusals: 3 });
});
