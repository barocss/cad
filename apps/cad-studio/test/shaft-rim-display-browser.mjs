import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const fixtures = process.argv[3], backend = process.argv.includes('--webgl2') ? 'webgl2' : 'webgpu';
assert.ok(fixtures, 'Supply the D1843 shaft evidence folder.');
const pins = [
  'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/cylinderProjection.ts',
  'packages/barocss-cad-model/src/engine/cylinderDisplay.ts',
  'packages/barocss-cad-model/src/engine/twoStepShaftGeometry.ts',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
];
const f = await createFlow({
  name: 'shaft-rim-display', output: process.argv[2], envFrozen: 'D1844_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Measure and pick both circular rims of the D1843 native and anonymous STEP shafts.',
  limits: ['Desktop ordinary shaded-with-edges perspective view of one exact two-step shaft.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep } from '@barocss/cad';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const base = evaluateDoc(doc, 1), detail = evaluateDoc(doc, 2, 8, true);
assert.ok(base.ok && detail.ok);
const a = base.bodies[0], b = detail.bodies[0];
assert.ok(b.mesh.cylinderDetail && !a.mesh.cylinderDetail);
assert.deepEqual(a.mesh.faces, b.mesh.faces);
assert.deepEqual(a.mesh.edges, b.mesh.edges);
assert.deepEqual(a.mesh.positions, b.mesh.positions);
assert.deepEqual(a.mesh.indices, b.mesh.indices);
assert.deepEqual(a.mesh.edgeLines, b.mesh.edgeLines);
assert.equal(a.volume, b.volume);
const rims = [[6, 20], [10, 12]].map(([r, z]) => {
  const edges = a.mesh.edges.filter(e => e.nativeCircle && Math.abs(e.nativeCircle.radius - r) < 1e-8 && Math.abs(e.nativeCircle.centre[2] - z) < 1e-8);
  const segments = [];
  for (let i = 0; i < a.mesh.edgeLines.length; i += 6) {
    if (edges.some(e => e.index === a.mesh.edgeOfSegment[i / 3])) segments.push(Array.from(a.mesh.edgeLines.slice(i, i + 6)));
  }
  return { r, z, segments, edges: edges.map(e => ({ index: e.index, names: e.names })) };
});
console.log(JSON.stringify({ volume: a.volume, report: checkBrep(partBreps(doc)[0].brep, { strict: true }),
  basePositions: a.mesh.positions.length, rims }));
`,
});
const button = name => f.page.getByRole('button', { name, exact: true });
const distance = ([x, y], [a, b]) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], square = dx ** 2 + dy ** 2;
  const t = square ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / square)) : 0;
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
};
const maximum = (curve, segments) => Math.max(...curve.map(point => Math.min(...segments.map(segment => distance(point, segment)))));

async function rim(label, canonical) {
  const { r, z, segments, edges } = canonical;
  assert.ok(edges.length > 0 && segments.length > 0);
  const curve = Array.from({ length: 361 }, (_, i) => [r * Math.cos(i * Math.PI / 180), r * Math.sin(i * Math.PI / 180), z]);
  const detail = await f.page.evaluate(({ curve, segments, edges }) => {
    const screen = window.__studioScreenOf, allowed = new Set(edges.map(e => e.index)), hits = new Map(), available = [];
    for (const point of curve) {
      const pixel = screen(point);
      if (!document.elementFromPoint(pixel[0], pixel[1])?.matches('canvas.vp-canvas')) continue;
      const hit = window.__studioEdgeAt(point, 5);
      if (hit?.body === 0 && allowed.has(hit.edge)) {
        hits.set(hit.edge, hit.segments);
        available.push({ pixel, index: hit.edge });
      }
    }
    const project = list => list.map(s => [screen(s.slice(0, 3)), screen(s.slice(3))]);
    return { base: project(segments), fine: project([...hits.values()].flat()), curve: curve.map(screen),
      indices: [...hits.keys()].sort((a, b) => a - b), target: available[Math.floor(available.length / 2)],
      camera: window.__studioCamera() };
  }, { curve, segments, edges });
  assert.deepEqual(detail.indices, edges.map(e => e.index).sort((a, b) => a - b), label);
  assert.ok(detail.target && detail.fine.length > detail.base.length, label);
  const baseError = maximum(detail.curve, detail.base), fineError = maximum(detail.curve, detail.fine);
  assert.ok(baseError > 0.25 && fineError < 0.25 && fineError * 2 < baseError, JSON.stringify({ label, baseError, fineError }));
  await f.page.mouse.click(...detail.target.pixel.slice(0, 2));
  await f.page.waitForFunction(index => window.__studioSelection?.selection.edges.some(e => e.body === 0 && e.edge === index), detail.target.index);
  f.report.observations.push({ label, backend, owners: edges, selected: detail.target.index, baseError, fineError,
    baseSegments: detail.base.length, fineSegments: detail.fine.length, camera: detail.camera });
  await f.snapshot(label);
  await f.page.keyboard.press('Escape');
}

await f.run(async () => {
  const origin = f.server.resolvedUrls.local[0];
  for (const [label, filename] of [['native', 'anonymous-shaft-editable.bcad'], ['step', 'anonymous-shaft.step']]) {
    await f.newPage();
    if (backend === 'webgl2') await f.page.goto(origin + '?renderer=webgl2');
    await f.page.locator(`.viewport[data-renderer="${backend}"]`).waitFor();
    await f.openFile(join(fixtures, filename), 1);
    const doc = await f.doc(), native = await f.inspect(label, doc);
    assert.ok(native.report.valid && Math.abs(native.volume - 1488 * Math.PI) < 1e-8);
    await button('Iso').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    assert.notEqual(await button('Ortho').getAttribute('aria-pressed'), 'true');
    const filter = button('Selection filter');
    for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
    assert.match(await filter.innerText(), /Edges/);
    await f.page.waitForFunction(base => (window.__studioSweepCylinderMesh?.()?.length ?? 0) > base, native.basePositions);
    const bytes = await f.page.evaluate(() => window.__studioCylinderDisplayBytes());
    assert.ok(bytes?.length === 2 && bytes.reduce((sum, tier) => sum + tier, 0) <= 192 * 1024);
    f.report.observations.push({ label, byteCounts: bytes, volume: native.volume });
    await rim(label + '-top-rim', native.rims[0]);
    await rim(label + '-shoulder-rim', native.rims[1]);
    await f.same(doc);
  }
});
