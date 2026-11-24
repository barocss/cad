import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const flow = await createFlow({
  name: 'outline-point-blank', output: process.argv[2], envFrozen: 'OUTLINE_POINT_BLANK_SOURCE_FROZEN',
  initialFiles: ['apps/cad-studio/src/ui/SketchPanel.tsx'],
  qualification: 'Editing an empty Outline coordinate preserves geometry and length locks until the user enters a number.',
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [{ brep }] = partBreps(doc);
console.log(JSON.stringify({ volume: brepMassProperties(brep, 1).volume, check: checkBrep(brep, { strict: true }) }));
`,
});
const points = [[10, 10], [40, 10], [10, 30]];
const lengths = { 0: 30, 2: 20 };
const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points, outline: { points, lengths, bulges: [0, 0, 0], hv: { h: [0], v: [2] } },
      sideTags: { outer: ['a', 'b', 'c'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 2 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const button = name => flow.page.getByRole('button', { name, exact: true });
const field = axis => flow.sketchPanel().getByLabel('Point 1 ' + axis, { exact: true });
const lock = index => flow.sketchPanel().getByLabel('Edge ' + index + ' length', { exact: true });
const outline = () => flow.page.locator('.vp-overlay polygon.sk-shape:not(.done)');
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const isLocked = index => lock(index).evaluate(input => input.classList.contains('locked'));
const blur = () => flow.page.locator('.topbar button.finish').focus();

async function open() {
  await flow.newPage();
  await flow.openFile({ name: 'locked-triangle.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) }, 2);
  await flow.same(source);
  await flow.openFeatureEditor(1, 'Edit triangle extrusion');
  await flow.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click();
  await flow.sketchPanel().waitFor();
  await outline().waitFor({ state: 'attached' });
  assert.equal(await field('X').inputValue(), '10');
  assert.equal(await field('Y').inputValue(), '10');
  assert.ok(await isLocked(1) && await isLocked(3));
}
async function clear(axis) {
  const input = field(axis);
  await input.press('Meta+a');
  await input.press('Backspace');
}
async function verify(doc, x, expectedLocks, label) {
  const shape = doc.nodes[0];
  assert.deepEqual(shape.points, [[x, 10], [40, 10], [x, 30]]);
  assert.deepEqual(shape.outline.lengths ?? {}, expectedLocks);
  assert.deepEqual(doc.nodes[1], source.nodes[1]);
  assert.deepEqual(shape.sideTags, source.nodes[0].sideTags);
  const native = await flow.inspect(label, doc), [worker] = (await flow.bodies()).bodies;
  assert.ok(native.check.valid, native.check.issues.join('\n'));
  const volume = (40 - x) * 20;
  assert.ok(Math.abs(native.volume - volume) < 1e-7);
  assert.ok(Math.abs(worker.volume - volume) < 1e-7);
  flow.report.observations.push({ label, x, expectedLocks, volume, nativeVolume: native.volume });
}

await flow.run(async () => {
  flow.phase = 'Clear a coordinate on the locked triangle';
  await open();
  const originalOutline = await outline().getAttribute('points'), originalHistory = await history();
  await clear('X');
  if (baseline) {
    await blur();
    assert.equal(await field('X').inputValue(), '0');
    assert.notEqual(await outline().getAttribute('points'), originalOutline);
    assert.ok(!await isLocked(1) && !await isLocked(3));
    await flow.same(source);
    await flow.snapshot('00-prior-blank-moved-outline');
    const { doc } = await flow.finishSketch('01-prior-finished-800');
    await verify(doc, 0, {}, 'previous-blank-native');
    return;
  }

  assert.equal(await field('X').inputValue(), '');
  assert.equal(await outline().getAttribute('points'), originalOutline);
  assert.ok(await isLocked(1) && await isLocked(3));
  assert.deepEqual(await history(), originalHistory);
  await flow.snapshot('01-blank-X-keeps-outline-and-locks');
  await field('Y').focus();
  assert.equal(await field('X').inputValue(), '10');
  await clear('Y');
  assert.equal(await field('Y').inputValue(), '');
  await blur();
  assert.equal(await field('Y').inputValue(), '10');
  assert.equal(await outline().getAttribute('points'), originalOutline);
  await flow.same(source);
  assert.deepEqual(await history(), originalHistory);
  await clear('X');
  const unmodified = (await flow.finishSketch('02-finish-with-blank-600')).doc;
  await verify(unmodified, 10, lengths, 'blank-finish-native');

  flow.phase = 'Enter zero and a negative coordinate and replay the sketch edit';
  await open();
  await clear('X');
  await field('X').fill('0');
  assert.equal(await field('X').inputValue(), '0');
  assert.ok(!await isLocked(1) && !await isLocked(3));
  await flow.snapshot('03-explicit-zero-moves-outline');
  await clear('X');
  await field('X').fill('-5');
  assert.equal(await field('X').inputValue(), '-5');
  await clear('X');
  await button('Undo').click();
  assert.equal(await field('X').inputValue(), '0');
  await button('Redo').click();
  assert.equal(await field('X').inputValue(), '-5');
  await flow.same(source);
  const changed = (await flow.finishSketch('04-finish-negative-900')).doc;
  await verify(changed, -5, {}, 'negative-native');
  await flow.undo();
  await flow.same(source);
  await flow.redo();
  await flow.same(changed);
  const { file } = await flow.save('outline-coordinate-edited');
  await flow.freshOpen(file, changed, '05-fresh-open-900');
  await verify(changed, -5, {}, 'reopened-native');
});
