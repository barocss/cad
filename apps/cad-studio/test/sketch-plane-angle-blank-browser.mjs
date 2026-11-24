import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = ['apps/cad-studio/test/sketch-plane-angle-blank-browser.mjs', 'apps/cad-studio/src/ui/SketchPanel.tsx',
  'apps/cad-studio/src/sketch/useSketchActions.ts', 'packages/barocss-cad-model/src/sketch/plane.ts'];
const f = await createFlow({
  name: 'sketch-plane-angle-blank', output: process.argv[2], envFrozen: 'PLANE_ANGLE_BLANK_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Clear a nonzero Sketch Plane Angle while preserving the authored placement and resulting extrusion.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const [{ brep }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ valid: checkBrep(brep, { strict: true }).valid,
  mass: brepMassProperties(brep, 1), vertices: brep.vertices.map(vertex => vertex.point) }));
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const angle = () => f.sketchPanel().getByLabel('Plane angle', { exact: true });
const offset = () => f.sketchPanel().getByLabel('Plane offset', { exact: true });
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const close = (value, expected) => Math.abs(value - expected) <= 1e-8;
const near = (value, expected) => assert.ok(close(value, expected), `${value} != ${expected}`);

async function prepare() {
  await f.newPage();
  await button('New part').click();
  await f.ready();
  const empty = await f.doc();
  assert.equal(empty.nodes.length, 0);
  await button('Sketch', f.page.getByLabel('Mode', { exact: true })).click();
  await f.sketchPanel().getByLabel('Sketch plane', { exact: true }).selectOption('xy');
  await f.tool('Rectangle', 'r');
  const points = [[10, 10], [30, 22]];
  await f.frame(points);
  for (const point of points) await f.worldClick(point);
  await offset().fill('7');
  await angle().fill('30');
  await offset().focus();
  return empty;
}
async function erase() {
  await angle().press('Meta+a');
  await angle().press('Backspace');
}
async function verify(label, sketch, doc, degrees) {
  const shape = sketch.nodes[0], radians = degrees * Math.PI / 180, sin = Math.sin(radians), cos = Math.cos(radians);
  const world = (x, y, z) => [x, y * cos + (7 + z) * sin, -y * sin + (7 + z) * cos];
  assert.equal(shape.profile, 'rectangle');
  assert.deepEqual([shape.min, shape.max], [[10, 10], [30, 22]]);
  assert.deepEqual(shape.plane.xAxis, [1, 0, 0]);
  shape.plane.normal.forEach((value, axis) => near(value, [0, sin, cos][axis]));
  shape.plane.origin.forEach((value, axis) => near(value, world(0, 0, 0)[axis]));
  const native = await f.inspect(label, doc);
  assert.equal(native.valid, true);
  assert.equal(native.vertices.length, 8);
  for (const x of [10, 30]) for (const y of [10, 22]) for (const z of [0, 3]) {
    const p = world(x, y, z);
    assert.ok(native.vertices.some(point => point.every((value, axis) => close(value, p[axis]))), JSON.stringify(p));
  }
  const expected = world(20, 16, 1.5);
  native.mass.centroid.forEach((value, axis) => near(value, expected[axis]));
  near(native.mass.volume, 720);
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 1);
  near(worker[0].volume, 720);
  f.report.observations.push({ label, angle: degrees, plane: shape.plane, centroid: native.mass.centroid, nativeVolume: native.mass.volume });
}
async function finish(degrees, label) {
  const sketch = (await f.finishSketch(label + '-sketch')).doc;
  await f.openExtrudeHud();
  const solid = (await f.applyExtrude({ distance: 3, previous: sketch, label })).doc;
  await verify(label + '-native', sketch, solid, degrees);
  return { sketch, solid };
}

await f.run(async () => {
  const empty = await prepare();
  assert.equal(await angle().inputValue(), '30');
  const acceptedHistory = await history();
  await erase();
  f.phase = 'Clear Plane Angle while retaining the 7 mm normal offset';
  assert.equal(await offset().inputValue(), '7');
  if (baseline) {
    assert.equal(await angle().inputValue(), '0');
    await f.snapshot('01-prior-blank-resets-plane');
    await finish(0, '02-prior-horizontal-extrusion');
    return;
  }

  assert.equal(await angle().inputValue(), '');
  assert.deepEqual(await history(), acceptedHistory);
  await f.same(empty);
  await f.snapshot('01-blank-preserves-tilted-plane');
  await offset().focus();
  assert.equal(await angle().inputValue(), '30');
  await erase();
  await finish(30, '02-blank-finish-tilted');

  await prepare();
  await erase();
  await f.page.keyboard.insertText('0');
  assert.equal(await angle().inputValue(), '0');
  await erase();
  await f.page.keyboard.insertText('-20');
  assert.equal(await angle().inputValue(), '-20');
  await erase();
  await button('Undo').dispatchEvent('click');
  assert.equal(await angle().inputValue(), '0');
  await button('Redo').dispatchEvent('click');
  assert.equal(await angle().inputValue(), '-20');
  await f.snapshot('03-negative-angle-redone');
  const { sketch, solid } = await finish(-20, '04-negative-plane-extruded');
  await f.undo();
  await f.same(sketch);
  await f.redo();
  await f.same(solid);
  const file = await f.save('negative-plane-angle');
  await f.freshOpen(file.file, solid, '05-fresh-open');
  await verify('reopened-native', sketch, solid, -20);
});
