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
const pins = ['packages/barocss-cad/src/blend/edge-finish.ts', 'packages/barocss-cad/src/brep/sweep-circular-join-bindings.ts',
  'packages/barocss-cad/src/brep/exact-sweep.ts'];
const f = await createFlow({ name: 'perpendicular-sweep-bore-fillet', output: process.argv[2], envFrozen: 'D1917_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Apply a constant Fillet to the original straight inlet bore and preserve all three native circular sections.',
  limits: ['One native bore mouth, R2 outside and R1 inside, two 10 mm ends and perpendicular R12/R18 quarter arcs. Desktop only.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, curveDomain, evaluateCurve, faceGeometry, massPropertiesOf, measureBrepEdgeContinuity } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { outputs: [out] } = partSnapshot(doc), { brep } = out;
const owners = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face.name])));
const usesByEdge = new Map();
for (const use of brep.coedges) {
  const uses = usesByEdge.get(use.edge) ?? [];
  uses.push(use);
  usesByEdge.set(use.edge, uses);
}
const describe = edge => {
  const [lo, hi] = curveDomain(edge.curve), uses = usesByEdge.get(edge.id);
  return { id: edge.id, owners: uses.map(use => owners.get(use.loop)).sort(),
    reciprocal: uses.length === 2 && uses[0].twin === uses[1].id && uses[1].twin === uses[0].id && uses[0].sense !== uses[1].sense,
    bound: uses.every(use => !!use.pcurve), continuity: measureBrepEdgeContinuity(brep, edge.id),
    points: Array.from({ length: 9 }, (_, i) => evaluateCurve(edge.curve, lo + (hi-lo)*i/8)) };
};
const joints = [[0,0],[1,12],[2,18]].map(([axis, level]) => brep.edges
  .filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[axis]-level) < 1e-9)).map(describe));
const caps = brep.faces.filter(face => face.name === 'n1.start' || face.name === 'n1.end').map(face => ({
  name: face.name, plane: faceGeometry(face), loops: face.loops.map(id => brep.loops.find(loop => loop.id === id).kind),
})).sort((a,b) => a.name.localeCompare(b.name));
const inlet = doc.nodes.length === 2 ? evaluatePart(doc, 1).bodies[0].mesh.edges
  .filter(edge => edge.names.some(name => name.includes('.lead.side[bore]') && name.includes('n1.start'))).map(edge => edge.names) : [];
const contacts = brep.edges.map(describe).filter(edge => edge.owners.some(name => name?.startsWith('n2.face')) && (
  edge.owners.includes('n1.start') || edge.owners.some(name => name?.startsWith('n1.lead.side[bore]'))));
const report = checkBrep(brep, { strict: true }), { volume, centroid } = massPropertiesOf(out);
console.log(JSON.stringify({ joints, caps, inlet, contacts, valid: report.valid, genus: report.topology[0].genus,
  gap: report.maximumPcurveGap, volume, centroid, digest: digestOf(brep) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const fillet = () => f.page.getByRole('dialog', { name: 'Fillet', exact: true });
const phase = mode => fillet().locator('.status').filter({ hasText: new RegExp(`^${mode}$`) });
const near = (a, b, tol = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tol, JSON.stringify({ a, b, tol }));
const stockLength = 15 * Math.PI + 20, stockVolume = 3 * Math.PI * stockLength;
const stockCentroid = [324 * Math.PI + 2583 / 4, 540 * Math.PI + 1440, 486 * Math.PI - 1143 / 4]
  .map(moment => moment / (3 * stockLength));
// Revolve a square minus a quarter circle. Integrate its radial and axial first moments.
function finishedMass(r) {
  const removed = 2 * Math.PI * (r ** 2 * (1 - Math.PI / 4) + r ** 3 * (5 / 6 - Math.PI / 4));
  const depthMoment = 2 * Math.PI * (r ** 3 * (5 / 6 - Math.PI / 4) + r ** 4 * (19 / 24 - Math.PI / 4));
  const volume = stockVolume - removed;
  const centroid = stockCentroid.map((center, i) => (stockVolume * center - (i ? 0 : depthMoment - 10 * removed)) / volume);
  return { volume, centroid };
}

async function pickInlet() {
  const cube = f.page.getByRole('group', { name: 'View cube', exact: true });
  await button('View cube directions', cube).click();
  await f.page.getByRole('menuitem', { name: 'Left', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const filter = button('Selection filter');
  for (let i = 0; i < 6 && !(await filter.innerText()).includes('Edges'); i++) await filter.click();
  assert.match(await filter.innerText(), /Edges/);
  await f.page.waitForFunction(() => {
    const a = window.__studioScreenOf([-10, 0, 0]), b = window.__studioScreenOf([-9, 0, 0]);
    return document.querySelector('.view-cube .vc-label')?.textContent === 'LEFT' && Math.hypot(a[0] - b[0], a[1] - b[1]) < .01;
  });
  const point = await f.page.evaluate(() => window.__studioScreenOf([-10, Math.SQRT1_2, Math.SQRT1_2]));
  assert.ok(point && await f.page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.matches('canvas.vp-canvas'), point));
  await f.page.mouse.click(...point);
  await f.page.waitForFunction(() => window.__studioSelection?.selection.edges.length === 1);
}

async function verify(label, doc, base, radius, previousLoss = false) {
  assert.deepEqual(doc.nodes.slice(0, 2), seed.nodes);
  assert.equal(doc.nodes[2].kind, 'fillet');
  assert.equal(doc.nodes[2].radius, radius);
  assert.deepEqual([...doc.nodes[2].edges].sort(), [...base.inlet[0]].sort());
  const native = await f.inspect(label, doc);
  assert.ok(native.valid && native.genus === 1);
  const expected = finishedMass(radius), [display] = (await f.bodies()).bodies;
  for (const observed of [native, display]) {
    near(observed.volume, expected.volume);
    observed.centroid.forEach((coordinate, axis) => near(coordinate, expected.centroid[axis]));
  }
  assert.deepEqual(native.caps.map(cap => [cap.name, cap.loops]), base.caps.map(cap => [cap.name, cap.loops]));
  assert.deepEqual(native.joints.map(joint => joint.length), [4, 4, 4]);
  for (const [i, joint] of native.joints.entries()) {
    const [axis, center] = [[0, [0, 0, 0]], [1, [12, 12, 0]], [2, [12, 30, 18]]][i];
    for (const edge of joint) {
      assert.ok(edge.reciprocal);
      assert.equal(edge.bound, !previousLoss);
      assert.equal(edge.continuity.status, previousLoss ? 'unsupported' : 'measured');
      if (previousLoss) assert.equal(edge.continuity.reason, 'missing-pcurve');
      else near(edge.continuity.maximumAngleDegrees, 0, 1e-6);
      const r = edge.owners.every(name => name.includes('[bore]')) ? 1 : 2;
      for (const p of edge.points) {
        near(p[axis], center[axis]);
        near(Math.hypot(...p.flatMap((value, dim) => axis === dim ? [] : [value - center[dim]])), r);
      }
    }
  }
  assert.equal(native.contacts.length, 4);
  for (const edge of native.contacts) for (const [x, y, z] of edge.points) {
    assert.ok(edge.reciprocal);
    if (edge.owners.includes('n1.start')) {
      near(x, -10);
      near(Math.hypot(y, z), 1 + radius);
    } else {
      near(x, -10 + radius);
      near(Math.hypot(y, z), 1);
    }
  }
  f.report.observations.push({ label, radius, volume: native.volume, centroid: native.centroid, gap: native.gap, digest: native.digest,
    bound: native.joints.map(joint => joint.filter(edge => edge.bound).length) });
  return native;
}

await f.run(async () => {
  await f.newPage();
  await f.openFile({ name: 'perpendicular-sweep-bore.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 2);
  await f.same(seed);
  const base = await f.inspect('original', seed);
  assert.ok(base.valid && base.genus === 1);
  near(base.volume, stockVolume);
  base.centroid.forEach((value, axis) => near(value, stockCentroid[axis]));
  assert.deepEqual(base.joints.map(joint => joint.filter(edge => edge.bound).length), [4, 4, 4]);
  assert.equal(base.inlet.length, 1);
  assert.equal(base.inlet[0].length, 2);
  f.phase = 'pick the original inlet bore';
  await pickInlet();
  const picked = await f.snapshot('01-inlet-rim');
  await f.command('Fillet');
  const radius = fillet().getByLabel('Radius', { exact: true });
  f.phase = 'check oversized fillet at the original cap';
  await radius.fill('2');
  await phase('preview|refused').waitFor();
  if (baseline) {
    assert.equal(await phase('preview').count(), 1);
    await button('Apply', fillet()).click();
    await f.changed(seed);
    const oversized = await f.inspect('oversized', await f.doc());
    assert.ok(!oversized.caps.some(cap => cap.name === 'n1.start'));
    await f.snapshot('02-inlet-cap-lost');
    await f.undo(); await f.same(seed);
    await pickInlet(); await f.command('Fillet');
  } else {
    await phase('refused').waitFor();
    assert.ok(await button('Apply', fillet()).isDisabled());
    await f.same(seed);
    const refused = await f.snapshot('02-oversized-refused');
    assert.deepEqual(refused.history, picked.history);
    assert.deepEqual(refused.selection.selection, picked.selection.selection);
  }
  f.phase = 'apply the existing exact small inlet Fillet';
  await radius.fill('0.2');
  await phase('preview').waitFor();
  await f.same(seed);
  await f.snapshot('03-inlet-preview');
  await button('Apply', fillet()).click();
  await f.changed(seed);
  const applied = (await f.snapshot('04-inlet-applied')).doc;
  await verify('r0.2', applied, base, .2, baseline);
  if (baseline) return;
  f.phase = 'edit the radius and reopen the accepted native part';
  await f.openFeatureEditor(2, 'inlet bore Fillet');
  await f.editor().getByLabel('Radius', { exact: true }).fill('0.25');
  const edited = (await f.applyEditor(applied, '05-inlet-radius-edited')).doc;
  const current = await verify('r0.25', edited, base, .25);
  await f.undo(); await f.same(applied);
  await f.redo(); await f.same(edited);
  const saved = await f.save('perpendicular-sweep-inlet-fillet');
  await f.freshOpen(saved.file, edited, '06-native-reopened');
  const reopened = await verify('reopened', await f.doc(), base, .25);
  assert.equal(reopened.digest, current.digest);
  await button('Iso', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot('07-reopened-both-ends');
  f.phase = 'measure all twelve unaffected native edges in the reopened Studio part';
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await browser.getByRole('button', { name: /^Sweep along Perpendicular bore/ }).click();
  const continuity = f.page.getByRole('region', { name: 'Edge continuity', exact: true });
  await button('Inspect native joints', continuity).click();
  const edgePicker = continuity.getByRole('combobox', { name: 'Native shared edge', exact: true });
  const result = continuity.getByRole('status', { name: 'Edge continuity result', exact: true });
  for (const edge of reopened.joints.flat()) {
    await edgePicker.selectOption(edge.id);
    await button('Measure continuity', continuity).click();
    const angle = result.locator('[data-continuity-angle]');
    await angle.waitFor();
    assert.equal(await angle.textContent(), '0°');
    assert.match(await result.innerText(), /Native samples\s+8/);
  }
  await result.scrollIntoViewIfNeeded();
  await f.snapshot('08-reopened-continuity');
});
