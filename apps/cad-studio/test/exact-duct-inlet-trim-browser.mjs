import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const spaced = process.argv.includes('--spaced-opposite');
const path = spaced ? { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 16, 0], [12, 20, 0], [12, 38, 0], [30, 38, 0]],
  weights: [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1] } : { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [-6, 30, 0]],
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1] };
const hole = [[-1, -2], [-1, 2], [1, 2], [1, -2]].map(start => ({ kind: 'line', start }));
const sideTags = { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8']] };
const rail = spaced ? 'Spaced S-bend rail' : 'Same-turn rail';
const outletEnd = { x: spaced ? 30 : -6, y: spaced ? 38 : 30, sign: spaced ? 1 : -1 };
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: { InletTrim: 1 }, nextId: 4,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3], holes: [hole], sideTags },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: rail, path, mode: 'exact' },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [-8, -5], max: [{ parameter: 'InletTrim' }, 5] },
    { id: 'n3', kind: 'extrude', sketch: 2, from: -5, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } },
};
const pins = ['apps/cad-studio/src/App.tsx', 'packages/barocss-cad-model/src/app/commands.ts',
  'packages/barocss-cad/src/brep/exact-sweep.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad/src/brep/affine-plane-binding.ts'];
const f = await createFlow({
  name: spaced ? 'exact-spaced-duct-inlet-trim' : 'exact-duct-inlet-trim', output: process.argv[2],
  envFrozen: spaced ? 'D1739_SOURCE_FROZEN' : 'D1714_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Trim one Exact rectangular duct inlet with a box and reopen the editable result.',
  limits: [`R12/R18 quarter arcs${spaced ? ' separated by an 8 mm straight span' : ''}, 4 × 6 mm section, 2 × 4 mm aperture, one planar inlet trim in desktop WebGPU.`],
  inspectorSource: String.raw`
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const output = partSnapshot(doc).outputs.find(item => ['analytic-boolean', 'sweep-curve'].includes(item.brep.source.family));
const { brep } = output;
const edgeMap = new Map(brep.edges.map(edge => [edge.id, edge]));
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const points = edge => {
  const [a, b] = curveDomain(edge.curve);
  return [0, .25, .5, .75, 1].map(t => evaluateCurve(edge.curve, a + (b-a)*t));
};
const caps = brep.faces.flatMap(face => {
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane' || Math.abs(plane.n[0]) < .999999 || face.loops.length !== 2) return [];
  const boundaries = face.loops.map(id => {
    const loop = loops.get(id);
    return { kind: loop.kind, edges: loop.coedges.map(id => {
      const use = uses.get(id), twin = uses.get(use.twin), edge = edgeMap.get(use.edge);
      return { points: points(edge), reciprocal: twin?.twin === id && twin.edge === edge.id && twin.sense !== use.sense };
    }) };
  });
  return [{ name: face.name, plane, boundaries }];
});
const seams = ${JSON.stringify(spaced ? [12, 20] : [12])}.flatMap(station => brep.edges.filter(edge =>
  points(edge).every(point => Math.abs(point[1] - station) < 1e-7)).map(edge => ({
  station, points: points(edge), result: measureBrepEdgeContinuity(brep, edge.id, { curvature: true }),
  bindings: brep.coedges.filter(use => use.edge === edge.id).map(use => !!use.pcurve),
})));
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), source: brep.source, caps, seams,
  volume: massPropertiesOf(output).volume, quadrature: brepMassProperties(brep, 1).volume, digest: digestOf(brep) }));
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) <= tolerance,
  JSON.stringify({ actual, expected, tolerance }));
const intercept = (radius, x) => 12 - Math.sqrt(radius ** 2 - x ** 2);

function verifyCap(cap, x, centreY, sign = -1) {
  near(cap.plane.o[0], x);
  cap.plane.n.forEach((value, i) => near(value, i === 0 ? sign : 0));
  assert.deepEqual(cap.boundaries.map(loop => loop.kind).sort(), ['inner', 'outer']);
  for (const loop of cap.boundaries) {
    const inner = loop.kind === 'inner';
    const ys = centreY === undefined ? (inner ? [intercept(13, x), intercept(11, x)] : [intercept(14, x), intercept(10, x)])
      : [centreY - (inner ? 1 : 2), centreY + (inner ? 1 : 2)];
    const height = inner ? 2 : 3;
    assert.equal(loop.edges.length, 4);
    for (const edge of loop.edges) {
      assert.ok(edge.reciprocal);
      for (const [px, y, z] of edge.points) {
        near(px, x);
        assert.ok(y >= ys[0] - 1e-7 && y <= ys[1] + 1e-7 && Math.abs(z) <= height + 1e-7);
        assert.ok(Math.min(Math.abs(y - ys[0]), Math.abs(y - ys[1]), Math.abs(Math.abs(z) - height)) < 1e-7);
      }
    }
  }
}

async function verify(doc, inset, label) {
  const native = await f.inspect(label, doc);
  assert.deepEqual(native.source, { family: 'analytic-boolean', id: 'n4' });
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  assert.equal(native.check.topology[0].genus, 1);
  const inlet = native.caps.find(cap => Math.abs(cap.plane.o[0] - inset) < 1e-7);
  const outlet = native.caps.find(cap => cap.name === 'n1.end');
  assert.equal(native.caps.length, 2);
  assert.ok(inlet && outlet);
  verifyCap(inlet, inset);
  verifyCap(outlet, outletEnd.x, outletEnd.y, outletEnd.sign);
  const cylindricalSeams = native.seams.filter(seam => seam.points.every(point => Math.abs(point[0] - seam.points[0][0]) < 1e-7));
  assert.equal(cylindricalSeams.length, spaced ? 8 : 4);
  if (spaced) assert.deepEqual([12, 20].map(station => cylindricalSeams.filter(seam => seam.station === station).length), [4, 4]);
  for (const seam of cylindricalSeams) {
    assert.deepEqual(seam.bindings, [true, true]);
    assert.equal(seam.result.status, 'measured');
    near(seam.result.maximumAngleDegrees, 0, 1e-6);
    assert.equal(seam.result.curvature.status, 'measured');
    const radius = Math.abs(seam.points[0][0] - (seam.station === 12 ? 0 : outletEnd.x));
    near(seam.result.curvature.maximumDifference, spaced ? 1 / radius : 1 / radius - 1 / (radius + 6));
  }
  const integral = r => (r ** 2 * Math.asin(inset / r) + inset * Math.sqrt(r ** 2 - inset ** 2)) / 2;
  const removed = 6 * (integral(14) - integral(10)) - 4 * (integral(13) - integral(11));
  const expected = 240 * Math.PI + (spaced ? 16 * 8 : 0) - removed;
  near(native.volume, expected);
  near(native.quadrature, expected);
  const { bodies } = await f.bodies();
  assert.equal(bodies.length, 1);
  near(bodies[0].volume, expected);
  f.report.observations.push({ label, inset, removed, expected, volume: native.volume, digest: native.digest,
    counts: native.check.counts, pcurveGap: native.check.maximumPcurveGap });
  return native;
}

async function showJoints(native, label = '03-native-joints-after-trim') {
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button(`Sweep along ${rail} · Subtract`, browser).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const edges = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  for (const seam of native.seams) {
    await edges.selectOption(seam.result.edgeId);
    await button('Measure continuity', panel).click();
    const angle = result.locator('[data-continuity-angle]');
    await angle.waitFor();
    assert.equal(await angle.textContent(), '0°');
    assert.match(await result.innerText(), /Native samples\s+8/);
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot(label);
}

async function showMouths(inset, label) {
  const centres = [{ x: inset, y: (intercept(13, inset) + intercept(11, inset)) / 2, sign: -1, end: 'inlet' },
    { ...outletEnd, end: 'outlet' }];
  for (const { x, y, sign, end } of centres) {
    const view = sign > 0 ? 'Right' : 'Left';
    await button('View cube directions', f.page.getByRole('group', { name: 'View cube', exact: true })).click();
    await f.page.getByRole('menuitem', { name: view, exact: true }).click();
    if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
    await f.page.getByTitle('Frame all (F)', { exact: true }).click();
    await f.page.waitForFunction(name => {
      const labels = [...document.querySelectorAll('.view-cube .vc-label')];
      return labels.length === 1 && labels[0].textContent === name;
    }, view.toUpperCase());
    const { opening, land } = await f.page.evaluate(([x, y, z]) => ({
      opening: window.__studioSurfacePoint([x, y, z]), land: window.__studioSurfacePoint([x, y, 2.5]),
    }), [x, y, 0]);
    assert.ok(land);
    near(land[0], x, 1e-4);
    assert.ok(!opening || sign * (x - opening[0]) > .5, JSON.stringify({ opening, land }));
    f.report.observations.push({ label, end, x, opening: opening ?? null, land });
    if (spaced) await f.snapshot(`${label}-${end}`);
  }
  if (!spaced) await f.snapshot(label);
}

await f.run(async () => {
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'duct-and-trim-tool.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  await f.snapshot('01-original-duct-and-cutting-box');
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button(`Sweep along ${rail}`, browser).click();
  await button('Extrude 10', browser).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  f.phase = 'Subtract the box from the inlet';
  await f.command('Subtract');
  await f.changed(seed);
  const { doc } = await f.snapshot('02-subtract-applied');
  assert.deepEqual(doc.nodes[4], { kind: 'difference', parent: { node: 1, side: 'solid' },
    tool: { node: 3, side: 'solid' }, id: 'n4' });
  const first = await verify(doc, 1, 'trim-one');
  await showJoints(first);
  await showMouths(1, '03-trim-one-mouths');
  const edited = (await f.setParameter('InletTrim', 2, '04-trim-edited')).doc;
  assert.deepEqual(edited.nodes, doc.nodes);
  const next = await verify(edited, 2, 'trim-two');
  const outlet = native => native.caps.find(cap => cap.name === 'n1.end');
  assert.deepEqual(outlet(next), outlet(first));
  await f.undo();
  await f.same(doc);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('duct-trimmed-inlet');
  const reopened = (await f.freshOpen(saved.file, edited, '05-trim-reopened')).doc;
  const reopenedNative = await verify(reopened, 2, 'trim-reopened');
  assert.equal(reopenedNative.digest, next.digest);
  if (spaced) await showJoints(reopenedNative, '05-reopened-native-joints');
  await showMouths(2, '06-reopened-mouths');
  const restored = (await f.setParameter('InletTrim', 1, '07-trim-restored-after-open')).doc;
  assert.equal((await verify(restored, 1, 'trim-restored')).digest, first.digest);
});
