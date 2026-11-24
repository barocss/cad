import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const files = ['apps/cad-studio/test/slot-angle-blank-browser.mjs', 'apps/cad-studio/src/ui/SketchPanel.tsx', 'apps/cad-studio/src/sketch/slotEndpoint.ts'];
const f = await createFlow({
  name: 'slot-angle-blank', output: process.argv[2], envFrozen: 'SLOT_ANGLE_BLANK_SOURCE_FROZEN',
  initialFiles: files, requiredFrozen: files,
  qualification: 'Clear and replace a nonzero Slot angle without committing an unintended rotation.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const [{ brep }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({
  valid: checkBrep(brep, { strict: true }).valid,
  mass: brepMassProperties(brep, 1),
  ends: brep.faces.map(faceGeometry).filter(surface => surface.kind === 'cylinder').map(surface => ({ point: surface.c, radius: surface.r })),
}));
`,
});
const button = (label, scope = f.page) => scope.getByRole('button', { name: label, exact: true });
const angle = () => f.sketchPanel().locator('#sk-slot-angle');
const width = () => f.sketchPanel().locator('#sk-slot-width');
const outline = () => f.page.locator('.vp-overlay polygon.sk-shape:not(.done)');
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-8, `${actual} != ${expected}`);
const a = [10, 15], length = 35, radius = 4, height = 3;
const volume = height * (2 * radius * length + Math.PI * radius ** 2);

async function erase() {
  await angle().press('Meta+a');
  await angle().press('Backspace');
}
async function edit() {
  await f.openFeatureEditor(1);
  await button('Edit sketch', f.editor()).click();
  await angle().waitFor();
}
async function verify(label, doc, degrees) {
  const rad = degrees * Math.PI / 180, b = [a[0] + length * Math.cos(rad), a[1] + length * Math.sin(rad)];
  const { slot } = doc.nodes[0];
  assert.deepEqual(slot.a, a);
  assert.equal(slot.r, radius);
  slot.b.forEach((value, axis) => near(value, b[axis]));
  const native = await f.inspect(label, doc);
  assert.equal(native.valid, true);
  assert.equal(native.ends.length, 2);
  for (const p of [a, b]) {
    const end = native.ends.find(({ point }) => Math.hypot(point[0] - p[0], point[1] - p[1]) < 1e-8);
    assert.ok(end, JSON.stringify({ p, ends: native.ends }));
    near(end.radius, radius);
  }
  const worker = (await f.bodies()).bodies;
  assert.equal(worker.length, 1);
  near(worker[0].volume, volume);
  near(native.mass.volume, volume);
  native.mass.centroid.forEach((value, axis) => near(value, axis === 2 ? height / 2 : (a[axis] + b[axis]) / 2));
  f.report.observations.push({ label, degrees, b: slot.b, centroid: native.mass.centroid, nativeVolume: native.mass.volume });
}

await f.run(async () => {
  await f.newPage();
  await button('New part').click();
  await f.ready();
  await button('Sketch', f.page.getByLabel('Mode', { exact: true })).click();
  await f.sketchPanel().getByLabel('Sketch plane', { exact: true }).selectOption('xy');
  await f.tool('Slot', 'o');
  const points = [a, [45, 15], [10, 19]];
  await f.frame(points);
  for (const point of points) await f.worldClick(point);
  await angle().fill('30');
  await width().focus();
  const sketch = (await f.finishSketch('slot-30-sketch')).doc;
  await f.openExtrudeHud();
  const original = (await f.applyExtrude({ distance: height, previous: sketch, label: '01-original-slot-30' })).doc;
  await verify('original-native', original, 30);
  await edit();
  const originalOutline = await outline().getAttribute('points');
  const before = await history();
  assert.equal(await angle().inputValue(), '30');

  f.phase = 'Clear the nonzero Slot angle with Backspace';
  await erase();
  if (baseline) {
    assert.equal(await angle().inputValue(), '0');
    assert.notEqual(await outline().getAttribute('points'), originalOutline);
    await f.snapshot('02-prior-blank-rotates-slot');
    const changed = (await f.finishSketch('03-prior-rotated-finish')).doc;
    await verify('prior-native-zero', changed, 0);
    return;
  }

  assert.equal(await angle().inputValue(), '');
  assert.equal(await outline().getAttribute('points'), originalOutline);
  assert.deepEqual(await history(), before);
  await f.snapshot('02-blank-angle-preserves-outline');
  await width().focus();
  assert.equal(await angle().inputValue(), '30');
  await erase();
  const untouched = (await f.finishSketch('03-blank-finish')).doc;
  assert.deepEqual(untouched, original);
  await verify('blank-finish-native', untouched, 30);

  await edit();
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
  await f.snapshot('04-negative-angle-redone');
  const revised = (await f.finishSketch('05-negative-angle-finish')).doc;
  assert.deepEqual(revised.nodes[1], original.nodes[1]);
  assert.deepEqual(revised.nodes[0].sideTags, original.nodes[0].sideTags);
  await verify('edited-native', revised, -20);
  await f.undo();
  await f.same(untouched);
  await f.redo();
  await f.same(revised);
  const saved = await f.save('slot-angle-edit');
  await f.freshOpen(saved.file, revised, '06-fresh-open');
  await verify('reopened-native', revised, -20);
});
