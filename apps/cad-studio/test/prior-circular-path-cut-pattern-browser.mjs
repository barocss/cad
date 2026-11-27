import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand, modelRail } from './model-rail-helper.mjs';
import { choosePriorCutSource, equivalent } from './prior-cut-pattern-browser-fixture.mjs';

const baseline = process.argv.includes('--baseline');
const quarter = process.argv.includes('--quarter');
const quadratic = process.argv.includes('--quadratic');
const mixed = process.argv.includes('--mixed');
const entry = process.argv.includes('--history') ? 'History' : 'Browser';
assert.ok(!(quarter && quadratic));
const mixedCurved = mixed && (quarter || quadratic);
const count = mixedCurved ? 2 : quarter || mixed ? 4 : 3;
const spacing = mixedCurved ? (quadratic ? 14 : 19) : quadratic ? 10 : quarter ? 8 : mixed ? 12.5 : 16;
const revisedSpacing = mixedCurved ? (quadratic ? 15 : 20) : quadratic ? 12 : quarter ? 9 : mixed ? 12 : 14;
const centersOnQuarter = pitch => Array.from({ length: count }, (_, i) => {
  const a = i * pitch / 20;
  return [10 + 20 * Math.sin(a), 10 + 20 * (1 - Math.cos(a))];
});
// Integrate the speed of [40t − 20t², 20t²] and invert length independently.
const primitive = x => 5 * Math.SQRT2 * (x * Math.hypot(1, x) + Math.asinh(x));
const centersOnQuadratic = pitch => Array.from({ length: count }, (_, i) => {
  if (i === 0) return [10, 10];
  let lower = 0, upper = 1;
  for (let step = 0; step < 53; step++) {
    const t = (lower + upper) / 2;
    if (primitive(2 * t - 1) - primitive(-1) < pitch * i) lower = t;
    else upper = t;
  }
  const t = (lower + upper) / 2;
  return [10 + 40 * t - 20 * t ** 2, 10 + 20 * t ** 2];
});
const centersOnMixedPath = pitch => [[10, 10], [10, 10 + pitch], [2 * pitch - 6, 26], [3 * pitch - 6, 26]];
const laterCircle = mixedCurved ? (quadratic ? [25, 20] : [10 + 10 * Math.sqrt(3), 25]) : [38, 26];
const tangentPitch = mixedCurved ? (quadratic ? 10 + 5 * Math.SQRT2 * Math.asinh(1) : 20 * Math.PI / 3) : 13;
const overlapPitch = mixedCurved ? (quadratic ? 17 : 22) : 13.125;
const placementTolerance = quadratic ? 1e-7 : 1e-8;
const pins = ['apps/cad-studio/test/prior-circular-path-cut-pattern-browser.mjs', 'apps/cad-studio/test/prior-cut-pattern-browser-fixture.mjs',
  'apps/cad-studio/src/app/cutPatternSource.ts', 'packages/barocss-cad-model/src/engine/doc.ts',
  'packages/barocss-cad-model/src/engine/curveFeaturePattern.ts',
  'packages/barocss-cad/src/features/curve-cut-pattern.ts', 'packages/barocss-cad/src/part/part-model.ts',
  'packages/barocss-cad/src/part/part-transform.ts', 'packages/barocss-cad/src/part/part-prior-circular-cut.ts',
  'packages/barocss-cad/src/part/part-prior-rectangular-cut.ts'];
const f = await createFlow({
  name: 'prior-circular-path-cut-pattern', output: process.argv[2],
  envFrozen: mixedCurved ? 'D2035_SOURCE_FROZEN' : mixed ? 'D2034_SOURCE_FROZEN' : quadratic ? 'D1950_SOURCE_FROZEN' : quarter ? 'D1931_SOURCE_FROZEN' : 'D1911_SOURCE_FROZEN',
  qualification: mixed ? `Repeat the selected original R2 after later R3 and rectangle through cuts via ${entry}.` : 'Repeat only the first original circular through-Subtract across one later rectangular through-Subtract.',
  limits: ['One upright rectangular stock, only original full-height cuts and fixed-orientation copies on a linked, level XY path.'],
  initialFiles: pins, requiredFrozen: pins,
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, curveDomain, evaluateCurve, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { modelOf } from '@barocss/cad-model/engine/direct';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (doc.checkPath) {
  const { sources, objects } = doc.direct;
  const object = objects.find(object => object.id === doc.checkPath);
  const curve = modelOf(sources[object.source]).objects.find(shape => shape.id === object.geometry);
  console.log(JSON.stringify(curve));
  process.exit(0);
}
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
if (mixed) {
  stock.nodes.push(
    { kind: 'sketch', profile: 'circle', center: laterCircle, radius: 3, id: 'n8' },
    { kind: 'extrude', sketch: 8, height: 10, id: 'n9' },
    { kind: 'difference', parent: ref(7), tool: ref(9), id: 'n10' },
  );
  stock.nextId = 11;
  stock.outputs = { b10: ref(10) };
}
const parentIndex = stock.nodes.length - 1;
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const field = (panel, name) => panel.getByLabel(name, { exact: true });
const panel = () => f.page.getByRole('dialog', { name: 'Path cut pattern', exact: true });
const status = expected => panel().locator('.status').filter({ hasText: new RegExp(`^${expected}$`) }).waitFor();

async function inspect(label, doc, centers, placed = false) {
  const bores = centers.map(center => [...center, 2]);
  if (mixed) bores.push([...laterCircle, 3]);
  const { check, caps, cylinders, mass } = await f.inspect(label, doc);
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].shells, 1);
  assert.equal(check.topology[0].genus, bores.length + 1);
  assert.equal(caps.length, 2);
  assert.equal(cylinders.length, 2 * bores.length);
  for (const [x, y, r] of bores) {
    const walls = cylinders.filter(wall => Math.hypot(wall.c[0] - x, wall.c[1] - y) < placementTolerance);
    assert.equal(walls.length, 2);
    const position = centers.findIndex(center => center[0] === x && center[1] === y);
    if (placed && position > 0) for (const wall of walls) assert.match(wall.name, new RegExp(`@${position}(?:[^0-9]|$)`));
    for (const wall of walls) {
      equivalent(wall.r, r);
      equivalent(Math.abs(wall.a[2]), 1);
      assert.equal(wall.out, -1);
    }
  }
  for (const cap of caps) {
    assert.equal(cap.outer, 1);
    assert.equal(cap.openings.length, bores.length + 1);
    equivalent(cap.z, cap.outward < 0 ? 0 : 10);
    const rectangle = cap.openings.find(opening => opening.degree.length === 4 && opening.degree.every(degree => degree === 1));
    assert.ok(rectangle);
    for (const [axis, [lo, hi]] of [[24, 28], [8, 10]].entries()) {
      equivalent(Math.min(...rectangle.points.map(point => point[axis])), lo);
      equivalent(Math.max(...rectangle.points.map(point => point[axis])), hi);
    }
    const circles = cap.openings.filter(opening => opening !== rectangle);
    for (const [x, y, r] of bores) {
      const rings = circles.filter(ring => ring.points.every(point => Math.abs(Math.hypot(point[0] - x, point[1] - y) - r) < placementTolerance));
      assert.equal(rings.length, 1);
      assert.deepEqual(rings[0].degree, [2, 2]);
    }
    for (const point of cap.openings.flatMap(opening => opening.points)) equivalent(point[2], cap.z);
  }
  const removed = r => 10 * Math.PI * r * r;
  const volume = 23920 - bores.reduce((sum, bore) => sum + removed(bore[2]), 0);
  const moment = [717920, 479280].map((value, axis) => value - bores.reduce((sum, bore) => sum + removed(bore[2]) * bore[axis], 0));
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

async function createPath() {
  await button('Sketch', modelRail(f.page)).click();
  await f.sketchPanel().waitFor();
  await field(f.sketchPanel(), 'Sketch plane').selectOption('xy');
  if (quarter) {
    const center = [6, 24], start = [6, 4], end = [26, 24];
    await f.frame([center, start, end]);
    await f.tool('Centre arc', 'q');
    await f.worldClick(center);
    await f.worldClick(start);
    for (const point of [[18, 8], [22, 12], end]) await f.page.mouse.move(...await f.screenOf(point), { steps: 3 });
    await f.worldClick(end);
    assert.equal(Number(await field(f.sketchPanel(), 'Arc 1 radius').inputValue()), 20);
  } else {
    await button('Line').click();
    await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const points = quadratic ? [[0, 0, 0], [20, 20, 0]] : [[6, 5, 0], [6, 21, 0], [30, 21, 0]];
    for (const point of points) {
      const pixel = await f.page.evaluate(world => window.__studioScreenOf(world), point);
      assert.ok(pixel, 'Path point is in the sketch viewport');
      await f.page.mouse.click(pixel[0], pixel[1]);
    }
    await button('Select').click();
  }
  await button('Make curves', f.sketchPanel()).click();
  await f.page.waitForFunction(() => window.__studioDoc.direct?.objects.length === 1);
  await f.ready();
  let { doc } = await f.snapshot('00-path-made-in-studio');
  if (!quadratic) return doc;
  f.phase = 'Author the exact middle pole in Direct geometry';
  for (const [axis, value] of [['X', 20], ['Y', 0]]) {
    await f.page.locator('.ol.direct').filter({ hasText: doc.direct.objects[0].name }).click();
    const direct = f.page.getByRole('complementary', { name: 'Direct geometry' });
    await field(direct, 'Control point').selectOption('1');
    const input = field(direct, axis);
    await input.fill(String(value));
    await input.press('Enter');
    await f.changed(doc);
    doc = await f.doc();
  }
  return (await f.snapshot('00a-quadratic-path-authored')).doc;
}
async function refused(doc, history, label, reason) {
  await status('refused');
  assert.equal(await button('Apply', panel()).isEnabled(), false);
  if (reason) {
    const error = panel().locator('.hud-error'), details = error.locator('details:not([open]) > summary');
    if (await details.count()) await details.click();
    assert.match(await error.innerText(), reason);
  }
  await f.same(doc);
  assert.deepEqual(await stackState(), history);
  await f.snapshot(label);
}
await f.run(async () => {
  await f.newPage();
  await openModel(stock, 'circle-path-source.bcad');
  f.phase = 'Author a linked XY path and choose the earlier circular Subtract';
  const doc = await createPath();
  assert.deepEqual(doc.nodes, stock.nodes);
  const objectId = doc.direct.objects[0].id;
  const path = await f.inspect('authored-level-path', { direct: doc.direct, checkPath: objectId });
  if (quadratic) {
    assert.deepEqual([path.degree, path.knots, path.weights], [2, [0, 0, 0, 1, 1, 1], [1, 1, 1]]);
    assert.deepEqual(path.controlPoints, [[0, 0, 0], [20, 0, 0], [20, 20, 0]]);
  } else if (quarter) {
    assert.deepEqual([path.degree, path.knots, path.weights], [2, [0, 0, 0, 1, 1, 1], [1, Math.SQRT1_2, 1]]);
    assert.deepEqual(path.controlPoints, [[6, 4, 0], [26, 4, 0], [26, 24, 0]]);
  } else {
    assert.deepEqual([path.degree, path.knots, path.weights], [2, [0, 0, 0, 1, 1, 2, 2, 2], [1, 1, 1, 1, 1]]);
    assert.deepEqual(path.controlPoints, [[6, 5, 0], [6, 13, 0], [6, 21, 0], [18, 21, 0], [30, 21, 0]]);
  }
  const original = await inspect('original-circle-and-later-rectangle', doc, [[10, 10]]);
  await choosePriorCutSource(f, entry);
  await clickModelCommand(f.page, 'Pattern', 'Path cut pattern');
  await panel().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(panel(), 'Path').selectOption(objectId);
  await field(panel(), 'Count').fill(String(count));
  await field(panel(), 'Spacing').fill(String(spacing));
  const history = await stackState();
  f.report.observations.push({ entry, parent: ref(parentIndex), source: ref(4), path: { objectId } });
  if (baseline) {
    await refused(doc, history, '01-circular-path-refused', undefined);
    return;
  }
  await status('preview');
  for (const [pitch, name, reason] of [[4, '02-source-touch-refused', /disjoint/], [mixedCurved ? 33 : quarter ? 11 : 21, '03-path-too-short', /exceeds.*path length/i],
    ...(mixed ? [[tangentPitch, '03a-later-r3-tangent-refused', /disjoint from the newer cuts/], [overlapPitch, '03b-later-r3-overlap-refused', /disjoint from the newer cuts/]] : [])]) {
    await field(panel(), 'Spacing').fill(String(pitch));
    await refused(doc, history, name, reason);
    await field(panel(), 'Spacing').fill(String(spacing));
    await status('preview');
  }
  await button('Apply', panel()).click();
  await f.changed(doc);
  const applied = (await f.snapshot('04-circular-path-applied')).doc, pattern = applied.nodes.at(-1);
  assert.deepEqual(applied.nodes.slice(0, -1), doc.nodes);
  assert.deepEqual(applied.direct, doc.direct);
  assert.deepEqual([pattern.kind, pattern.parent, pattern.source, pattern.path, pattern.spacing, pattern.count],
    ['curve-feature-pattern', ref(parentIndex), ref(4), { objectId }, spacing, count]);
  const originalCenters = quadratic ? centersOnQuadratic(spacing) : quarter ? centersOnQuarter(spacing) : mixed ? centersOnMixedPath(spacing) : [[10, 10], [10, 26], [26, 26]];
  const accepted = await inspect('path-native', applied, originalCenters, true);
  assert.deepEqual(accepted.filter(wall => original.some(old => old.name === wall.name)), original);
  await f.openFeatureEditor(stock.nodes.length, 'Path source spacing');
  await f.editor().getByText('Subtract 1 (n4)', { exact: true }).waitFor();
  await field(f.editor(), 'Spacing').fill(String(revisedSpacing));
  const edited = (await f.applyEditor(applied, '05-path-spacing-edited')).doc;
  assert.deepEqual(edited.nodes.at(-1), { ...pattern, spacing: revisedSpacing });
  const centers = quadratic ? centersOnQuadratic(revisedSpacing) : quarter ? centersOnQuarter(revisedSpacing) : mixed ? centersOnMixedPath(revisedSpacing) : [[10, 10], [10, 24], [22, 26]];
  const editedWalls = await inspect('path-edited-native', edited, centers, true);
  assert.deepEqual(editedWalls.filter(wall => original.some(old => old.name === wall.name)), original);
  await f.undo(); await f.same(applied);
  await f.redo(); await f.same(edited);
  const saved = await f.save('circular-path-cut-pattern');
  const reopened = await f.freshOpen(saved.file, edited, '06-fresh-open-circular-path');
  assert.deepEqual(reopened.doc.nodes.at(-1), { ...pattern, spacing: revisedSpacing });
  const reopenedWalls = await inspect('path-reopened-native', reopened.doc, centers, true);
  assert.deepEqual(reopenedWalls.filter(wall => original.some(old => old.name === wall.name)), original);
});
