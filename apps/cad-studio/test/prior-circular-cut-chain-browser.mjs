import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
import { choosePriorCutSource, equivalent } from './prior-cut-pattern-browser-fixture.mjs';

const baseline = process.argv.includes('--baseline');
const mixed = process.argv.includes('--mixed');
const laterName = mixed ? 'one later rectangle and one later circle' : 'two later rectangles';
const pins = [
  'apps/cad-studio/test/prior-circular-cut-chain-browser.mjs',
  'apps/cad-studio/test/prior-cut-pattern-browser-fixture.mjs',
  'packages/barocss-cad/src/part/part-model.ts',
  'packages/barocss-cad/src/part/part-prior-circular-cut.ts',
];
const f = await createFlow({
  name: 'prior-circular-cut-chain', output: process.argv[2], envFrozen: 'D1993_SOURCE_FROZEN',
  qualification: `Repeat an earlier original circular through-Subtract across ${laterName}.`,
  limits: [`One original upright rectangular stock, one circular through-cut followed by ${laterName}, and signed Linear copies.`],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
const uses = new Map(brep.coedges.map(use => [use.id, use]));
const edges = new Map(brep.edges.map(edge => edge.id ? [edge.id, edge] : ['', edge]));
const caps = brep.faces.flatMap(face => {
  const plane = faceGeometry(face);
  if (plane.kind !== 'plane' || Math.abs(plane.n[2]) < 1 - 1e-9) return [];
  const rings = face.loops.map(id => loops.get(id)!);
  const openings = rings.filter(loop => loop.kind === 'inner').map(loop => {
    const curves = loop.coedges.map(id => edges.get(uses.get(id)!.edge)!.curve);
    return { degree: curves.map(curve => curve.degree), points: curves.flatMap(curve => {
      const [lo, hi] = curveDomain(curve);
      return [0, .25, .5, .75, 1].map(t => evaluateCurve(curve, lo + (hi - lo) * t));
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
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 11,
  nodes: [
    { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40], id: 'n0' },
    { kind: 'extrude', sketch: 0, height: 10, id: 'n1' },
    { kind: 'sketch', profile: 'circle', center: [10, 10], radius: 2, id: 'n2' },
    { kind: 'extrude', sketch: 2, height: 10, id: 'n3' },
    { kind: 'difference', parent: ref(1), tool: ref(3), id: 'n4' },
    { kind: 'sketch', profile: 'rectangle', min: [24, 8], max: [28, 10], id: 'n5' },
    { kind: 'extrude', sketch: 5, height: 10, id: 'n6' },
    { kind: 'difference', parent: ref(4), tool: ref(6), id: 'n7' },
    mixed ? { kind: 'sketch', profile: 'circle', center: [44, 10], radius: 3, id: 'n8' }
      : { kind: 'sketch', profile: 'rectangle', min: [42, 8], max: [46, 12], id: 'n8' },
    { kind: 'extrude', sketch: 8, height: 10, id: 'n9' },
    { kind: 'difference', parent: ref(7), tool: ref(9), id: 'n10' },
  ],
  outputs: { b10: ref(10) },
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
  assert.equal(check.topology[0].genus, centers.length + 2);
  assert.equal(caps.length, 2);
  const circularOpenings = [...centers.map(([x, y]) => [x, y, 2]), ...(mixed ? [[44, 10, 3]] : [])];
  assert.equal(cylinders.length, 2 * circularOpenings.length);
  for (const [x, y, radius] of circularOpenings) {
    const walls = cylinders.filter(wall => Math.hypot(wall.c[0] - x, wall.c[1] - y) < 1e-8);
    assert.equal(walls.length, 2);
    for (const wall of walls) {
      equivalent(wall.r, radius);
      equivalent(Math.abs(wall.a[2]), 1);
      assert.equal(wall.out, -1);
    }
  }
  const rectBounds = mixed ? [[[24, 28], [8, 10]]] : [[[24, 28], [8, 10]], [[42, 46], [8, 12]]];
  for (const cap of caps) {
    assert.equal(cap.outer, 1);
    assert.equal(cap.openings.length, centers.length + 2);
    equivalent(cap.z, cap.outward < 0 ? 0 : 10);
    const rects = cap.openings.filter(opening => opening.degree.length === 4 && opening.degree.every(degree => degree === 1));
    assert.equal(rects.length, rectBounds.length);
    for (const [[x0, x1], [y0, y1]] of rectBounds) {
      assert.equal(rects.filter(r =>
        Math.abs(Math.min(...r.points.map(p => p[0])) - x0) < 1e-7 &&
        Math.abs(Math.max(...r.points.map(p => p[0])) - x1) < 1e-7 &&
        Math.abs(Math.min(...r.points.map(p => p[1])) - y0) < 1e-7 &&
        Math.abs(Math.max(...r.points.map(p => p[1])) - y1) < 1e-7).length, 1);
    }
    const circles = cap.openings.filter(opening => !rects.includes(opening));
    assert.equal(circles.length, circularOpenings.length);
    for (const [x, y, radius] of circularOpenings) {
      assert.equal(circles.filter(ring => ring.points.every(p => Math.abs(Math.hypot(p[0] - x, p[1] - y) - radius) < 1e-8)).length, 1);
    }
  }
  const removed = 40 * Math.PI, laterRemoved = mixed ? 90 * Math.PI : 160;
  const volume = 24000 - 80 - laterRemoved - centers.length * removed;
  // Base stock 24000 (cx=30, cy=20) - rect1 80 (cx=26, cy=9) - rect2 160 (cx=44, cy=10)
  const baseMx = 24000 * 30 - 80 * 26 - laterRemoved * 44;
  const baseMy = 24000 * 20 - 80 * 9 - laterRemoved * 10;
  const moment = [baseMx, baseMy].map((value, axis) => value - removed * centers.reduce((sum, c) => sum + c[axis], 0));
  equivalent(mass.volume, volume);
  for (let axis = 0; axis < 2; axis++) equivalent(mass.centroid[axis], moment[axis] / volume);
  equivalent(mass.centroid[2], 5);
  equivalent((await f.bodies()).bodies[0].volume, volume);
  f.report.observations.push({ label, centers, volume, centroid: mass.centroid, topology: check.counts });
  return cylinders;
}

await f.run(async () => {
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'circle-and-two-rectangle-through-cuts.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(stock)),
  });
  await f.same(stock);
  const browser = f.page.getByRole('complementary', { name: 'Browser', exact: true });
  await button('Show its features', browser).click();
  await button('Top', f.page.locator('.views')).click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  const original = await inspect('original-three-cuts', stock, [[10, 10]]);

  await choosePriorCutSource(f, 'Browser');
  await clickModelCommand(f.page, 'Pattern', 'Linear cut pattern');
  await panel().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(panel(), 'Count').fill('2');
  await field(panel(), 'Spacing').fill('8');

  if (baseline) {
    f.phase = `Reproduce prior refusal with ${laterName}`;
    await status('refused');
    assert.ok(await button('Apply', panel()).isDisabled());
    await f.same(stock);
    await f.snapshot('00-previous-chain-refused');
    return;
  }

  f.phase = 'Reject collision with the second later cut (n10) without changing document or History';
  const undo = await button('Undo').getAttribute('data-tip');
  await status('preview');
  await field(panel(), 'Spacing').fill('32');
  await status('refused');
  assert.ok(await button('Apply', panel()).isDisabled());
  await f.same(stock);
  assert.equal(await button('Undo').getAttribute('data-tip'), undo);
  await f.snapshot('01-later-cut-3-collision-refused');
  if (mixed) {
    await field(panel(), 'Spacing').fill('29'); // X=39: R2 copy exactly tangent to the later R3 bore at X44.
    await status('refused');
    assert.ok(await button('Apply', panel()).isDisabled());
    await f.same(stock);
    await f.snapshot('01b-later-circle-tangency-refused');
  }

  f.phase = 'Apply Linear cut pattern across both later cuts';
  await field(panel(), 'Spacing').fill('8');
  await status('preview');
  await button('Apply', panel()).click();
  await f.changed(stock);
  await f.ready();
  const applied = (await f.snapshot('02-linear-applied')).doc;
  const pattern = applied.nodes.at(-1);
  assert.deepEqual([pattern.kind, pattern.parent, pattern.source, pattern.axis, pattern.spacing, pattern.count],
    ['linear-feature-pattern', ref(10), ref(4), 'x', 8, 2]);
  const positive = await inspect('applied-x8', applied, [[10, 10], [18, 10]]);
  assert.deepEqual(positive.filter(wall => original.some(old => old.name === wall.name)), original);

  f.phase = 'Edit History spacing 8 -> 24 (landing between rect 1 and rect 2 at x=34), verify Undo/Redo and fresh Open';
  await f.openFeatureEditor(11, 'edit spacing across rect 1');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'Spacing').fill('24');
  const edited = (await f.applyEditor(applied, '03-history-edited-x24')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...pattern, spacing: 24 });
  await inspect('edited-x24', edited, [[10, 10], [34, 10]]);

  await f.undo();
  await f.same(applied);
  await inspect('undo-x8', await f.doc(), [[10, 10], [18, 10]]);
  await f.redo();
  await f.same(edited);
  await inspect('redo-x24', await f.doc(), [[10, 10], [34, 10]]);

  const saved = await f.save('prior-circular-cut-chain');
  const reopened = await f.freshOpen(saved.file, edited, '04-fresh-open');
  await inspect('fresh-open-x24', reopened.doc, [[10, 10], [34, 10]]);
});
