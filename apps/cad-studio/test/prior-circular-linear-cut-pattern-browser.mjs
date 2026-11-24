import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
import { choosePriorCutSource, equivalent } from './prior-cut-pattern-browser-fixture.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/prior-circular-linear-cut-pattern-browser.mjs', 'apps/cad-studio/test/prior-cut-pattern-browser-fixture.mjs',
  'apps/cad-studio/src/app/cutPatternSource.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad/src/part/part-model.ts', 'packages/barocss-cad/src/part/part-prior-rectangular-cut.ts'];
const f = await createFlow({
  name: 'prior-circular-linear-cut-pattern', output: process.argv[2], envFrozen: 'D1901_SOURCE_FROZEN',
  qualification: 'Repeat only the first original circular through-Subtract across one later rectangular through-Subtract.',
  limits: ['One original rectangular upright stock, two original full-height cuts and signed Linear copies.'],
  initialFiles: pins, requiredFrozen: pins,
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
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 8,
  nodes: [
    { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40], id: 'n0' },
    { kind: 'extrude', sketch: 0, height: 10, id: 'n1' },
    { kind: 'sketch', profile: 'circle', center: [10, 10], radius: 2, id: 'n2' },
    { kind: 'extrude', sketch: 2, height: 10, id: 'n3' },
    { kind: 'difference', parent: ref(1), tool: ref(3), id: 'n4' },
    { kind: 'sketch', profile: 'rectangle', min: [24, 8], max: [28, 10], id: 'n5' },
    { kind: 'extrude', sketch: 5, height: 10, id: 'n6' },
    { kind: 'difference', parent: ref(4), tool: ref(6), id: 'n7' },
  ],
  outputs: { b7: ref(7) },
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (panel, name) => panel.getByLabel(name, { exact: true });
const panel = () => f.page.getByRole('dialog', { name: 'Linear cut pattern', exact: true });
const status = expected => panel().locator('.status').filter({ hasText: new RegExp(`^${expected}$`) }).waitFor();

async function inspect(label, doc, centers) {
  const { check, caps, cylinders, mass } = await f.inspect(label, doc);
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].shells, 1);
  assert.equal(check.topology[0].genus, centers.length + 1);
  assert.equal(caps.length, 2);
  assert.equal(cylinders.length, 2 * centers.length);
  for (const [x, y] of centers) {
    const walls = cylinders.filter(wall => Math.hypot(wall.c[0] - x, wall.c[1] - y) < 1e-8);
    assert.equal(walls.length, 2);
    for (const wall of walls) {
      equivalent(wall.r, 2);
      equivalent(Math.abs(wall.a[2]), 1);
      assert.equal(wall.out, -1);
    }
  }
  for (const cap of caps) {
    assert.equal(cap.outer, 1);
    assert.equal(cap.openings.length, centers.length + 1);
    equivalent(cap.z, cap.outward < 0 ? 0 : 10);
    const rectangle = cap.openings.find(opening => opening.degree.length === 4 && opening.degree.every(degree => degree === 1));
    assert.ok(rectangle);
    for (const [axis, [lo, hi]] of [[24, 28], [8, 10]].entries()) {
      equivalent(Math.min(...rectangle.points.map(point => point[axis])), lo);
      equivalent(Math.max(...rectangle.points.map(point => point[axis])), hi);
    }
    const circles = cap.openings.filter(opening => opening !== rectangle);
    for (const [x, y] of centers) {
      const rings = circles.filter(ring => ring.points.every(point => Math.abs(Math.hypot(point[0] - x, point[1] - y) - 2) < 1e-8));
      assert.equal(rings.length, 1);
      assert.deepEqual(rings[0].degree, [2, 2]);
    }
    for (const point of cap.openings.flatMap(opening => opening.points)) equivalent(point[2], cap.z);
  }
  const removed = 40 * Math.PI, volume = 23920 - centers.length * removed;
  const moment = [717920, 479280].map((value, axis) => value - removed * centers.reduce((sum, center) => sum + center[axis], 0));
  equivalent(mass.volume, volume);
  for (let axis = 0; axis < 2; axis++) equivalent(mass.centroid[axis], moment[axis] / volume);
  equivalent(mass.centroid[2], 5);
  equivalent((await f.bodies()).bodies[0].volume, volume);
  f.report.observations.push({ label, centers, volume, centroid: mass.centroid, topology: check.counts });
  return cylinders;
}

async function openPattern(entry) {
  await choosePriorCutSource(f, entry);
  await clickModelCommand(f.page, 'Pattern', 'Linear cut pattern');
  await panel().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(panel(), 'Count').fill('2');
  await field(panel(), 'Spacing').fill('8');
}

await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'circle-and-rectangle-through-cuts.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock)),
  });
  await f.same(stock);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Show its features', browser).click();
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const original = await inspect('original-native-cuts', stock, [[10, 10]]);
  await openPattern('Browser');
  if (baseline) {
    f.phase = 'Reproduce refusal of the original circular through-cut';
    await status('refused');
    assert.ok(await button('Apply', panel()).isDisabled());
    await f.same(stock);
    await f.snapshot('00-circular-source-refused');
    return;
  }

  f.phase = 'Reject touching and overlapping cells without adding History';
  const undo = await button('Undo').getAttribute('data-tip');
  for (const [spacing, count, label] of [[4, 2, 'original-contact'], [12, 2, 'rectangle-contact'],
    [16, 2, 'rectangle-overlap'], [8, 3, 'third-cell-overlap']]) {
    await field(panel(), 'Count').fill('2');
    await field(panel(), 'Spacing').fill('8');
    await status('preview');
    if (spacing !== 8) await field(panel(), 'Spacing').fill(String(spacing));
    if (count !== 2) await field(panel(), 'Count').fill(String(count));
    await status('refused');
    assert.ok(await button('Apply', panel()).isDisabled());
    await f.same(stock);
    assert.equal(await button('Undo').getAttribute('data-tip'), undo);
    await f.snapshot('01-' + label);
  }
  await field(panel(), 'Count').fill('2');
  await status('preview');
  await button('Apply', panel()).click();
  await f.changed(stock);
  const applied = (await f.snapshot('02-circle-copy-x8')).doc;
  assert.deepEqual(applied.nodes.slice(0, -1), stock.nodes);
  const pattern = applied.nodes.at(-1);
  assert.deepEqual([pattern.kind, pattern.parent, pattern.source, pattern.axis, pattern.spacing, pattern.count],
    ['linear-feature-pattern', ref(7), ref(4), 'x', 8, 2]);
  const positive = await inspect('x8-native', applied, [[10, 10], [18, 10]]);
  assert.deepEqual(positive.filter(wall => original.some(old => old.name === wall.name)), original);

  await f.openFeatureEditor(8, 'edit signed spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'Spacing').fill('-6');
  const edited = (await f.applyEditor(applied, '03-circle-copy-x-minus6')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...pattern, spacing: -6 });
  await inspect('x-minus6-native', edited, [[10, 10], [4, 10]]);
  await f.undo();
  await f.same(applied);
  await f.redo();
  await f.same(edited);
  const saved = await f.save('circular-linear-cut-pattern');
  const reopened = await f.freshOpen(saved.file, edited, '04-fresh-open-circular-cut-pattern');
  await inspect('fresh-open-native', reopened.doc, [[10, 10], [4, 10]]);
});
