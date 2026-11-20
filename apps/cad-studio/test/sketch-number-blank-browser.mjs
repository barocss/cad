import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const [output, mode] = process.argv.slice(2);
assert.ok(mode === undefined || mode === '--baseline');
const baseline = mode === '--baseline';
const panelSource = 'apps/cad-studio/src/ui/SketchPanel.tsx';
const f = await createFlow({
  name: 'sketch-number-blank', output, envFrozen: 'SKETCH_NUMBER_SOURCE_FROZEN',
  initialFiles: [panelSource], requiredFrozen: [panelSource],
  qualification: baseline ? 'Reproduce a blank numeric field changing an active circle'
    : 'Keep a blank numeric field local to the active circle and preserve sketch history',
  limits: ['Desktop Chrome. XY circle, rectangle and straight slot. Native extrusion checks cover the circle.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { brepMassProperties, checkBrep, curveDomain, curveEvaluator } from '@barocss/cad';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({ brep }) => ({
  valid: checkBrep(brep, { strict: true }).valid,
  kinds: brep.bodies.map(body => body.kind),
  closed: brep.shells.map(shell => shell.closed),
  volume: brepMassProperties(brep, 1).volume,
  capSamples: brep.edges.filter(edge => edge.curve.degree === 2).flatMap(edge => {
    const [lo, hi] = curveDomain(edge.curve);
    const evaluate = curveEvaluator(edge.curve);
    return Array.from({ length: 5 }, (_, i) => evaluate(lo + (hi - lo) * i / 4));
  }),
}))));
`,
});

const source = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [11, 8], radius: 5, sideTags: { outer: ['e0'] } },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 2 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};

const button = name => f.page.getByRole('button', { name, exact: true });
const centre = () => f.sketchPanel().locator('#sk-cx');
const nextField = () => f.sketchPanel().locator('#sk-cy');
const diameter = () => f.sketchPanel().locator('#sk-diameter');
const outline = () => f.page.locator('.vp-overlay polygon.sk-shape:not(.done)');
const history = () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));

async function edit() {
  await f.openFeatureEditor(1);
  await f.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click();
  await f.sketchPanel().waitFor();
  await outline().waitFor({ state: 'attached' });
}

async function open(doc = source) {
  await f.newPage();
  await f.openFile({
    name: 'circle-with-extrusion.bcad', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  }, doc.nodes.length);
  await f.same(doc);
  await edit();
}

async function backspace(field) {
  await field.press('Meta+a');
  await field.press('Backspace');
}

async function checkOtherShapes() {
  const cases = [
    { name: 'Rectangle', key: 'r', widthId: '#sk-width', otherId: '#sk-height', saved: '10', clicks: [[10, 15], [20, 25]] },
    { name: 'Slot', key: 'o', widthId: '#sk-slot-width', otherId: '#sk-slot-length', saved: '8', clicks: [[10, 15], [45, 15], [10, 19]] },
  ];
  for (const { name, key, widthId, otherId, saved, clicks } of cases) {
    await f.newPage();
    await button('New part').click();
    await f.ready();
    await f.page.getByLabel('Mode', { exact: true }).getByRole('button', { name: 'Sketch', exact: true }).click();
    await f.sketchPanel().getByLabel('Sketch plane', { exact: true }).selectOption('xy');
    await f.tool(name, key);
    await f.frame(clicks);
    for (const point of clicks) await f.worldClick(point);
    f.phase = `Switch numeric fields in the ${name}`;
    const before = await history();
    const width = f.sketchPanel().locator(widthId);
    const other = f.sketchPanel().locator(otherId);
    assert.equal(await width.inputValue(), saved);
    const points = await outline().getAttribute('points');
    await backspace(width);
    assert.equal(await width.inputValue(), '');
    await other.focus();
    assert.equal(await width.inputValue(), saved);
    await width.focus();
    assert.equal(await width.inputValue(), saved);
    assert.equal(await outline().getAttribute('points'), points);
    assert.deepEqual(await history(), before);
    const { doc } = await f.finishSketch(`${name}-blank-finish`);
    assert.equal(doc.nodes.length, 1);
    const [shape] = doc.nodes;
    if (name === 'Rectangle') {
      assert.equal(shape.profile, 'rectangle');
      assert.deepEqual([shape.min, shape.max], clicks);
    } else {
      assert.deepEqual(shape.slot.a, clicks[0]);
      assert.deepEqual(shape.slot.b, clicks[1]);
      assert.equal(shape.slot.r, 4);
    }
  }
}

async function verifyCircle(state, x, radius) {
  assert.deepEqual(state.doc.nodes[0].center, [x, 8]);
  assert.equal(state.doc.nodes[0].radius, radius);
  const parts = await f.inspect(state.label, state.doc);
  assert.equal(parts.length, 1);
  const [part] = parts;
  assert.equal(part.valid, true);
  assert.deepEqual(part.kinds, ['solid']);
  assert.deepEqual(part.closed, [true]);
  const expectedVolume = 2 * Math.PI * radius ** 2;
  const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-8, `${value} != ${expected}`);
  assert.equal(state.bodies.bodies.length, 1);
  close(state.bodies.bodies[0].volume, expectedVolume);
  close(part.volume, expectedVolume);
  for (const z of [0, 2]) {
    const samples = part.capSamples.filter(point => Math.abs(point[2] - z) < 1e-8);
    assert.ok(samples.length >= 5, 'Native rational edge samples on each cap');
    for (const [px, py] of samples) close(Math.hypot(px - x, py - 8), radius);
  }
  f.report.observations.push({ center: [x, 8], radius, expectedVolume, nativeVolume: part.volume, tolerance: 1e-8 });
}

await f.run(async () => {
  await open();
  assert.equal(await centre().inputValue(), '11');
  assert.equal(await diameter().inputValue(), '10');
  assert.deepEqual(await history(), [false, false]);

  if (baseline) {
    await backspace(centre());
    assert.equal(await centre().inputValue(), '0');
    await verifyCircle(await f.finishSketch('baseline-centre'), 0, 5);
    await open();
    await backspace(diameter());
    assert.equal(await diameter().inputValue(), '0.5');
    await verifyCircle(await f.finishSketch('baseline-diameter'), 11, 0.25);
    return;
  }

  // Finishing an existing sketch has its own document-history behavior.
  const control = await f.finishSketch('no-edit-finish');
  assert.deepEqual(control.doc, source);
  const finishHistory = await history();
  await open();
  f.phase = 'Clear the centre and diameter with Backspace';
  const original = await outline().getAttribute('points');
  for (const [field, saved] of [[centre(), '11'], [diameter(), '10']]) {
    await backspace(field);
    assert.equal(await field.inputValue(), '');
    assert.equal(await outline().getAttribute('points'), original);
    assert.deepEqual(await history(), [false, false]);
    await nextField().focus();
    assert.equal(await field.inputValue(), saved);
  }
  await backspace(diameter());
  assert.equal(await diameter().inputValue(), '');
  const untouched = await f.finishSketch('blank-finish');
  assert.deepEqual(untouched.doc, control.doc);
  assert.deepEqual(await history(), finishHistory);
  await verifyCircle(untouched, 11, 5);

  f.phase = 'Replace the diameter and replay only the accepted edit';
  await edit();
  assert.equal(await diameter().inputValue(), '10');
  await backspace(diameter());
  await f.page.keyboard.insertText('12');
  assert.equal(await diameter().inputValue(), '12');
  assert.notEqual(await outline().getAttribute('points'), original);
  await backspace(diameter());
  assert.equal(await diameter().inputValue(), '');
  await button('Undo').click();
  assert.equal(await diameter().inputValue(), '10');
  assert.deepEqual(await history(), [false, true]);
  await backspace(diameter());
  assert.equal(await diameter().inputValue(), '');
  assert.deepEqual(await history(), [false, true]);
  await button('Redo').click();
  assert.equal(await diameter().inputValue(), '12');
  assert.deepEqual(await history(), [true, false]);

  f.phase = 'Change the circle owner with the same field still focused';
  const focused = () => diameter().evaluate(element => element === document.activeElement);
  await backspace(diameter());
  // Invoke the toolbar handlers without the pointer's usual focus change.
  await button('Undo').dispatchEvent('click');
  assert.equal(await diameter().inputValue(), '10');
  assert.equal(await focused(), true);
  await button('Redo').dispatchEvent('click');
  assert.equal(await diameter().inputValue(), '12');
  assert.equal(await focused(), true);

  f.phase = 'Apply explicit zero and a finite negative centre';
  await diameter().fill('0');
  assert.equal(await diameter().inputValue(), '0.5');
  await button('Undo').click();
  assert.equal(await diameter().inputValue(), '12');
  await centre().fill('0');
  assert.equal(await centre().inputValue(), '0');
  await centre().fill('-11');
  assert.equal(await centre().inputValue(), '-11');
  await button('Undo').click();
  assert.equal(await centre().inputValue(), '0');
  await button('Redo').click();
  assert.equal(await centre().inputValue(), '-11');
  assert.equal(await diameter().inputValue(), '12');
  const edited = await f.finishSketch('edited-finish');
  assert.deepEqual(edited.doc.nodes[0].sideTags, source.nodes[0].sideTags);
  await verifyCircle(edited, -11, 6);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(edited.doc);
  await checkOtherShapes();
});
