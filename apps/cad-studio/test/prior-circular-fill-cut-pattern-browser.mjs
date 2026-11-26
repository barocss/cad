import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
import { choosePriorCutSource, equivalent } from './prior-cut-pattern-browser-fixture.mjs';

const baseline = process.argv.includes('--baseline');
const mixed = process.argv.includes('--mixed');
const extra = { center: [22, 25], radius: 3 };
const pins = ['apps/cad-studio/test/prior-circular-fill-cut-pattern-browser.mjs', 'apps/cad-studio/test/prior-cut-pattern-browser-fixture.mjs',
  'apps/cad-studio/src/app/cutPatternSource.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/features/fill-cut-pattern.ts', 'packages/barocss-cad/src/part/part-model.ts',
  'packages/barocss-cad/src/part/part-transform.ts', 'packages/barocss-cad/src/part/part-prior-circular-cut.ts',
  'packages/barocss-cad/src/part/part-prior-rectangular-cut.ts'];
const f = await createFlow({
  name: 'prior-circular-fill-cut-pattern', output: process.argv[2], envFrozen: 'D1909_SOURCE_FROZEN',
  qualification: 'Repeat only the first original circular through-Subtract across the captured cells, retaining later rectangular and optional circular through cuts.',
  limits: ['One original rectangular upright stock, original full-height cuts and selected XY copies under a captured mask. Mixed mode adds a later R3 bore.'],
  initialFiles: pins, requiredFrozen: pins, navigationTimeoutMs: 120000,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
const caps = brep.faces.flatMap(face => {
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane' || Math.abs(plane.n[2]) < 1 - 1e-9) return [];
  const rings = face.loops.map(id => loops.get(id)!);
  const openings = rings.filter(loop => loop.kind === 'inner').map(loop => {
    const curves = loop.coedges.map(id => edges.get(uses.get(id)!.edge)!.curve);
    return { degree: curves.map(curve => curve.degree), points: curves.flatMap(curve => {
      const [lo, hi] = curveDomain(curve);
      return [0, .125, .25, .5, .75, .875, 1].map(t => evaluateCurve(curve, lo + (hi - lo) * t));
    }) };
  });
  return [{ z: plane.o[2], outward: plane.n[2], outer: rings.filter(loop => loop.kind === 'outer').length, openings }];
});
const cylinders = brep.faces.flatMap(face => {
  const surface = faceGeometry(face);
  return surface.kind === 'cylinder' ? [{ name: face.name, ...surface }] : [];
});
console.log(JSON.stringify({ check: checkBrep(brep, { strict: true }), mass: brepMassProperties(brep, 1), caps, cylinders }));
`,
});
const ref = node => ({ node, side: 'solid' });
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: mixed ? 12 : 9,
  nodes: [
    { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40], id: 'n0' },
    { kind: 'extrude', sketch: 0, height: 10, id: 'n1' },
    { kind: 'sketch', profile: 'circle', center: [10, 10], radius: 2, id: 'n2' },
    { kind: 'extrude', sketch: 2, height: 10, id: 'n3' },
    { kind: 'difference', parent: ref(1), tool: ref(3), id: 'n4' },
    { kind: 'sketch', profile: 'rectangle', min: [24, 8], max: [28, 10], id: 'n5' },
    { kind: 'extrude', sketch: 5, height: 10, id: 'n6' },
    { kind: 'difference', parent: ref(4), tool: ref(6), id: 'n7' },
    ...(mixed ? [
      { kind: 'sketch', profile: 'circle', center: extra.center, radius: extra.radius, id: 'n8' },
      { kind: 'extrude', sketch: 8, height: 10, id: 'n9' },
      { kind: 'difference', parent: ref(7), tool: ref(9), id: 'n10' },
    ] : []),
    { kind: 'sketch', profile: 'rectangle', min: [17, 5], max: [29, 23], id: mixed ? 'n11' : 'n8' },
  ],
  outputs: mixed ? { b10: ref(10) } : { b7: ref(7) },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (panel, name) => panel.getByLabel(name, { exact: true });
const panel = () => f.page.getByRole('dialog', { name: 'Fill cut pattern', exact: true });
const status = expected => panel().locator('.status').filter({ hasText: new RegExp(`^${expected}$`) }).waitFor();

async function inspect(label, doc, centers, grid = false) {
  const { check, caps, cylinders, mass } = await f.inspect(label, doc);
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].shells, 1);
  const all = centers.map(([x, y]) => [x, y, 2]);
  if (mixed) all.push([...extra.center, extra.radius]);
  assert.equal(check.topology[0].genus, all.length + 1);
  assert.equal(caps.length, 2);
  assert.equal(cylinders.length, 2 * all.length);
  for (const [x, y, r] of all) {
    const walls = cylinders.filter(wall => Math.hypot(wall.c[0] - x, wall.c[1] - y) < 1e-8);
    assert.equal(walls.length, 2);
    if (grid && r === 2) {
      const i = x === centers[0][0] ? 0 : 1, j = y === centers[0][1] ? 0 : 1;
      if (i || j) for (const wall of walls) assert.ok(wall.name.includes(`@${i},${j}`));
    }
    for (const wall of walls) {
      equivalent(wall.r, r);
      if (r === 3) assert.ok(!wall.name.includes('@'));
      equivalent(Math.abs(wall.a[2]), 1);
      assert.equal(wall.out, -1);
    }
  }
  for (const cap of caps) {
    assert.equal(cap.outer, 1);
    assert.equal(cap.openings.length, all.length + 1);
    equivalent(cap.z, cap.outward < 0 ? 0 : 10);
    const rectangle = cap.openings.find(opening => opening.degree.length === 4 && opening.degree.every(degree => degree === 1));
    assert.ok(rectangle);
    for (const [axis, [lo, hi]] of [[24, 28], [8, 10]].entries()) {
      equivalent(Math.min(...rectangle.points.map(point => point[axis])), lo);
      equivalent(Math.max(...rectangle.points.map(point => point[axis])), hi);
    }
    const circles = cap.openings.filter(opening => opening !== rectangle);
    for (const [x, y, r] of all) {
      const rings = circles.filter(ring => ring.points.every(point => Math.abs(Math.hypot(point[0] - x, point[1] - y) - r) < 1e-8));
      assert.equal(rings.length, 1);
      assert.deepEqual(rings[0].degree, [2, 2]);
    }
    for (const point of cap.openings.flatMap(opening => opening.points)) equivalent(point[2], cap.z);
  }
  const removed = r => 10 * Math.PI * r * r;
  const volume = 23920 - all.reduce((sum, [, , r]) => sum + removed(r), 0);
  const moment = [717920, 479280].map((value, axis) => value - all.reduce((sum, center) => sum + removed(center[2]) * center[axis], 0));
  equivalent(mass.volume, volume);
  for (let axis = 0; axis < 2; axis++) equivalent(mass.centroid[axis], moment[axis] / volume);
  equivalent(mass.centroid[2], 5);
  equivalent((await f.bodies()).bodies[0].volume, volume);
  f.report.observations.push({ label, centers, volume, centroid: mass.centroid, topology: check.counts });
  return cylinders;
}

const stackState = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
async function openModel(doc, name) {
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)),
  });
  await f.same(doc);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Show its features', browser).click();
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
}
async function openFill(entry) {
  await choosePriorCutSource(f, entry);
  await clickModelCommand(f.page, 'Pattern', 'Fill cut pattern');
  await panel().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(panel(), 'Region snapshot').selectOption(mixed ? '11' : '8');
  for (const [label, value] of [['Reference X', 10], ['Reference Y', 10], ['X spacing', 8], ['Columns', 2], ['Y spacing', 8], ['Rows', 2]]) {
    await field(panel(), label).fill(String(value));
  }
}
async function refused(doc, history, label) {
  await status('refused');
  assert.equal(await button('Apply', panel()).isEnabled(), false);
  await f.same(doc);
  assert.deepEqual(await stackState(), history);
  await f.snapshot(label);
}
await f.run(async () => {
  await f.newPage();
  await openModel(stock, 'circle-fill-mask.bcad');
  f.phase = 'choose the earlier original circular cut and the captured Fill mask';
  const original = await inspect('original-circle-and-later-rectangle', stock, [[10, 10]]);
  await openFill('Browser');
  const history = await stackState();
  if (baseline) {
    await refused(stock, history, '00-circular-fill-refused');
    return;
  }
  await status('preview');
  if (mixed) {
    f.phase = 'refuse only the captured row that touches the later round cavity';
    for (const pitch of ['12', '12.5']) {
      await field(panel(), 'Y spacing').fill(pitch);
      await refused(stock, history, '01-circular-conflict-' + pitch);
    }
    await field(panel(), 'Y spacing').fill('8');
    await status('preview');
  }
  f.phase = 'refuse a selected cell that hits the later rectangular cavity';
  await field(panel(), 'X spacing').fill('16');
  await refused(stock, history, '01-mask-overlap-refused');
  await field(panel(), 'X spacing').fill('8');
  await status('preview');
  await button('Apply', panel()).click();
  await f.changed(stock);
  const applied = (await f.snapshot('02-circular-fill-applied')).doc, pattern = applied.nodes.at(-1);
  assert.deepEqual(applied.nodes.slice(0, -1), stock.nodes);
  assert.deepEqual([pattern.kind, pattern.parent, pattern.source, pattern.anchor, pattern.spacing, pattern.count,
    pattern.spacing2, pattern.count2], ['fill-feature-pattern', ref(mixed ? 10 : 7), ref(4), [10, 10], 8, 2, 8, 2]);
  assert.deepEqual(pattern.region, { points: [[17, 5], [29, 5], [29, 23], [17, 23]] });
  const accepted = await inspect('fill-native', applied, [[10, 10], [18, 10], [18, 18]], true);
  assert.deepEqual(accepted.filter(wall => original.some(old => old.name === wall.name)), original);
  await f.openFeatureEditor(mixed ? 12 : 9, 'Fill source spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'Y spacing').fill('11');
  const edited = (await f.applyEditor(applied, '03-y-spacing-edited')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...pattern, spacing2: 11 });
  const centers = [[10, 10], [18, 10], [18, 21]];
  await inspect('fill-y11-native', edited, centers, true);
  await f.undo(); await f.same(applied);
  await f.redo(); await f.same(edited);
  const saved = await f.save('circular-fill-cut-pattern');
  const reopened = await f.freshOpen(saved.file, edited, '04-fresh-open-circular-fill');
  await inspect('fill-reopened-native', reopened.doc, centers, true);
});
