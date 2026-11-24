import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
      holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'cw' }]],
      sideTags: { outer: ['e0'], holes: [['bore']] } },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Perpendicular bore', mode: 'exact', path: {
      degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
      controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18], [12, 30, 23], [12, 30, 28]],
    } },
  ], outputs: { b1: { node: 1, side: 'solid' } } };
const pins = ['packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad/src/brep/analytic-boolean.ts',
  'packages/barocss-cad/src/brep/sweep-circular-join-bindings.ts'];
const f = await createFlow({ name: 'perpendicular-sweep-inlet-subtract', output: process.argv[2], envFrozen: 'D1919_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Subtract an actual box from the straight inlet and retain the three original circular joins.',
  limits: ['One exact annular Sweep and a box covering only the end of the straight inlet. Desktop only.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity, surfaceDomain } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [out] } = partSnapshot(doc), { brep } = out;
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const owners = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face.name])));
const samples = edge => {
  const [lo,hi] = curveDomain(edge.curve);
  return [0,.2,.5,.8,1].map(t => evaluateCurve(edge.curve, lo+(hi-lo)*t));
};
const reciprocal = use => {
  const twin = uses.get(use.twin);
  return twin?.twin === use.id && twin.edge === use.edge && twin.sense !== use.sense;
};
const cap = face => {
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane') return [];
  return [{ name: face.name, plane, loops: face.loops.map(id => {
    const loop = loops.get(id);
    return { kind: loop.kind, rims: loop.coedges.map(id => {
      const use = uses.get(id), edge = edges.get(use.edge);
      return { points: samples(edge), reciprocal: reciprocal(use), degree: edge.curve.degree };
    }) };
  }) }];
};
const joints = [[0,0],[1,12],[2,18]].map(([axis,level]) => brep.edges
  .filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[axis]-level) < 1e-9)).map(edge => {
    const sides = brep.coedges.filter(use => use.edge === edge.id);
    return { id: edge.id, owners: sides.map(use => owners.get(use.loop)).sort(), reciprocal: sides.length === 2 && sides.every(reciprocal),
      bound: sides.filter(use => !!use.pcurve).length, continuity: measureBrepEdgeContinuity(brep, edge.id), points: samples(edge) };
  }));
const bends = brep.faces.filter(face => /\\.(first|second)\\./.test(face.name)).map(face => {
  const { u:[u0,u1], v:[v0,v1] } = surfaceDomain(face.surface), positions = [0,.19,.5,.81,1];
  return { name: face.name, points: positions.flatMap(s => positions.map(t => evaluateSurface(face.surface, u0+(u1-u0)*s, v0+(v1-v0)*t))) };
});
console.log(JSON.stringify({ digest: digestOf(brep), topology: checkBrep(brep, { strict: true }),
  caps: brep.faces.flatMap(cap), joints, mass: massPropertiesOf(out), quadrature: brepMassProperties(brep,1), bends }));
`,
});
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const browser = () => f.page.getByRole('complementary', { name: 'Browser', exact: true });
const near = (a, b, tol = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tol, JSON.stringify({ a, b, tol }));
const stockLength = 15 * Math.PI + 20;
const stockMoments = [324 * Math.PI + 2583 / 4, 540 * Math.PI + 1440, 486 * Math.PI - 1143 / 4].map(value => value / 3);

async function verify(label, doc, trim, bound) {
  const actual = await f.inspect(label, doc), { topology, caps, joints, mass, quadrature } = actual;
  assert.ok(topology.valid, topology.issues.join('\n'));
  assert.deepEqual(topology.counts, { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 72, edges: 36, vertices: 20 });
  assert.equal(topology.topology[0].genus, 1);
  assert.equal(caps.length, 2);
  for (const [axis, center, sign] of [[0, [trim, 0, 0], -1], [2, [12, 30, 28], 1]]) {
    const cap = caps.find(cap => Math.abs(cap.plane.n[axis] - sign) < 1e-7);
    assert.ok(cap);
    near(cap.plane.o[axis], center[axis]);
    assert.deepEqual(cap.loops.map(loop => loop.kind), ['outer', 'inner']);
    for (const { kind, rims } of cap.loops) {
      assert.equal(rims.length, 2);
      for (const rim of rims) {
        assert.equal(rim.degree, 2);
        assert.ok(rim.reciprocal);
        for (const point of rim.points) {
          near(point[axis], center[axis]);
          near(Math.hypot(...point.map((value, i) => value - center[i])), kind === 'outer' ? 2 : 1);
        }
      }
    }
  }
  assert.deepEqual(joints.map(edges => edges.length), [4, 4, 4]);
  for (const edge of joints.flat()) {
    assert.ok(edge.reciprocal);
    assert.equal(edge.bound, bound ? 2 : 0);
    assert.equal(edge.continuity.status, bound ? 'measured' : 'unsupported');
    if (bound) near(edge.continuity.maximumAngleDegrees, 0, 1e-6);
    else assert.equal(edge.continuity.reason, 'missing-pcurve');
  }
  assert.equal(actual.bends.length, 8);
  for (const { name, points } of actual.bends) {
    const r = name.includes('[bore]') ? 1 : 2;
    for (const [x, y, z] of points) {
      const radial = name.includes('.first.') ? Math.hypot(x, y - 12) - 12 : Math.hypot(y - 12, z - 18) - 18;
      const axial = name.includes('.first.') ? z : x - 12;
      near(Math.hypot(radial, axial), r);
    }
  }
  const removed = trim + 10, length = stockLength - removed;
  const center = stockMoments.map((moment, i) => (moment - (i ? 0 : removed * (trim - 10) / 2)) / length);
  const [shown] = (await f.bodies()).bodies;
  for (const body of [mass, quadrature, shown]) {
    near(body.volume, 3 * Math.PI * length);
    body.centroid.forEach((value, i) => near(value, center[i]));
  }
  f.report.observations.push({ label, trim, volume: mass.volume, centroid: mass.centroid,
    gap: topology.maximumPcurveGap, bindings: joints.map(edges => edges.map(edge => edge.bound)), digest: actual.digest });
  return actual;
}

async function nativeInspector(result, measured) {
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await browser().getByRole('button', { name: /^Sweep along Perpendicular bore/ }).click();
  const panel = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', panel).click();
  const input = panel.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const output = panel.getByRole('status', { name: 'Edge continuity result', exact: true });
  for (const edge of measured ? result.joints.flat() : result.joints[1].slice(0, 1)) {
    await input.selectOption(edge.id);
    await button('Measure continuity', panel).click();
    if (measured) {
      const angle = output.locator('[data-continuity-angle]');
      await angle.waitFor();
      assert.equal(await angle.textContent(), '0°');
    } else {
      await output.locator('details').waitFor();
      assert.match(await output.innerText(), /parameter|binding|measure/);
    }
  }
  await output.scrollIntoViewIfNeeded();
  await f.snapshot(measured ? '08-measured-native-joints' : '04-before-missing-native-bindings');
}

await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: 'perpendicular-annular-sweep.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 2);
  await f.same(seed);
  const stock = await verify('original', seed, -10, true);
  f.phase = 'author the cutter box in Studio';
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Box');
  const box = f.page.getByRole('dialog', { name: 'Box', exact: true });
  for (const [label, value] of Object.entries({ 'Width X': 5, 'Depth Y': 8, 'Height Z': 8, 'At X': -12, 'At Y': -4, 'At Z': -4 }))
    await box.getByLabel(label, { exact: true }).fill(String(value));
  await box.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.snapshot('01-box-preview');
  await button('Apply', box).click();
  await f.changed(seed);
  const boxed = (await f.snapshot('02-box-applied')).doc;
  assert.deepEqual([boxed.nodes[2].min, boxed.nodes[2].max, boxed.nodes[3].from, boxed.nodes[3].height],
    [[-12, -4], [-7, 4], -4, 8]);
  f.phase = 'subtract the authored box from only the straight inlet';
  await button('Sweep along Perpendicular bore', browser()).click();
  await button('Box', browser()).click({ modifiers: ['Shift'] });
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Subtract');
  await f.changed(boxed);
  const cut = (await f.snapshot('03-inlet-subtract')).doc;
  assert.deepEqual(cut.nodes[4], { kind: 'difference', parent: { node: 1, side: 'solid' },
    tool: { node: 3, side: 'solid' }, id: 'n4' });
  const first = await verify('trim-three', cut, -7, !baseline);
  const bendNames = body => body.bends.map(face => face.name).sort();
  assert.deepEqual(bendNames(first), bendNames(stock));
  if (baseline) { await nativeInspector(first, false); return; }
  f.phase = 'edit the cutter width and reopen the exact cut';
  await f.openFeatureEditor(3, 'cutter box');
  await f.editor().getByLabel('Width', { exact: true }).fill('6');
  const edited = (await f.applyEditor(cut, '04-cutter-edit')).doc;
  assert.deepEqual(edited.nodes[2].max, [-6, 4]);
  assert.deepEqual(edited.nodes[4], cut.nodes[4]);
  const changed = await verify('trim-four', edited, -6, true);
  assert.deepEqual(bendNames(changed), bendNames(first));
  await f.undo(); await f.same(cut);
  await f.redo(); await f.same(edited);
  const save = await f.save('perpendicular-sweep-inlet-subtract');
  await f.freshOpen(save.file, edited, '05-trim-reopened');
  const reopened = await verify('trim-reopened', await f.doc(), -6, true);
  assert.equal(reopened.digest, changed.digest);
  await nativeInspector(reopened, true);
});
