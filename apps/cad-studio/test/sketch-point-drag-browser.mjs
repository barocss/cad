import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/src/viewport/sketchPointDrag.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/SceneViewport.tsx',
  'apps/cad-studio/src/sketch/useSketchDraftHistory.ts',
  'packages/barocss-cad-model/src/sketch/pointDrag.ts',
];
const f = await createFlow({
  output: process.argv[2], name: 'sketch-point-drag', envFrozen: 'D1698_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Drag one closed sketch vertex with its constraints, then finish and reopen the downstream solid.',
  limits: ['Desktop Studio WebGPU, one tagged XY outline, 10 mm native Extrude, one optional convex R6 Fillet.'],
  inspectorSource: String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { digestOf } from '@barocss/cad-model/util/digest';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.argv[3] === '"seed"') {
  const profile = profileOf([input]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const [body] = partSnapshot(input).outputs;
  const brep = body.brep;
  assert.ok(checkBrep(brep, { strict: true }).valid && brep.shells.every(shell => shell.closed));
  console.log(JSON.stringify({ volume: massPropertiesOf(body).volume, hash: digestOf(brep),
    faces: brep.faces.map(face => ({ name: face.name, geometry: faceGeometry(face) })) }));
}
`,
});

const coordinates = () => f.sketchPanel().getByRole('group', { name: 'Outline points', exact: true })
  .getByRole('spinbutton', { name: /^Point \d+ [XY]$/ });
const cursor = () => f.page.locator('.vp-canvas').evaluate(canvas => canvas.style.cursor);
const selected = index => f.page.locator(`.sk-pick-point.on[data-sketch-entity="point:${index}"]`);
const keyboard = process.platform === 'darwin' ? 'Meta' : 'Control';
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
async function expectPoints(points) {
  await f.page.waitForFunction(expected => {
    const fields = [...document.querySelectorAll('.sk-panel input[aria-label^="Point "]')];
    return fields.length === expected.length && fields.every((field, i) => Number(field.value) === expected[i]);
  }, points.flat());
  assert.deepEqual(await coordinates().evaluateAll(inputs => inputs.map(input => Number(input.value))), points.flat());
}
async function expectPreviewAt(index, at) {
  const pixel = await f.screenOf(at);
  await f.page.waitForFunction(({ index, pixel }) => {
    const mark = document.querySelector(`.sk-pick-point.on[data-sketch-entity="point:${index}"]`);
    const r = mark?.getBoundingClientRect();
    return r && Math.hypot(r.x + r.width / 2 - pixel[0], r.y + r.height / 2 - pixel[1]) < 1.5;
  }, { index, pixel });
}
async function edit(points) {
  await f.openFeatureEditor(1, 'extrude');
  await f.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(points);
}
async function move(point) {
  const pixel = await f.screenOf(point);
  assert.ok(pixel?.length === 2);
  await f.page.mouse.move(...pixel);
}
async function begin(point) {
  await move(point);
  await f.page.mouse.down();
}

const fixed = [{ kind: 'fix', point: 0, at: [0, 0] }];
const common = { kind: 'polygon', closed: true, lengths: { 0: 40 }, rules: fixed };
const fixtures = [{
  label: 'straight', index: 2, target: [46, 40], blocked: [46, 0], escape: [44, 46],
  shape: { ...common, points: [[0, 0], [40, 0], [40, 30], [0, 30]], hv: { h: [0, 2], v: [1, 3] }, ids: ['e1', 'e2', 'e3', 'e4'] },
  expected: [[0, 0], [40, 0], [40, 40], [0, 40]], volume: 16000,
}, {
  label: 'fillet', index: 3, target: [40, 40], escape: [40, 46],
  shape: { ...common, points: [[0, 0], [40, 0], [40, 24], [34, 30], [0, 30]],
    bulges: [0, 0, Math.tan(Math.PI / 8), 0, 0], hv: { h: [0, 3], v: [1, 4] },
    radii: { 2: 6 }, tangents: [2, 3], ids: ['e1', 'e2', 'e5', 'e3', 'e4'] },
  expected: [[0, 0], [40, 0], [40, 34], [34, 40], [0, 40]], volume: (1600 - 36 + 9 * Math.PI) * 10,
}];

await f.run(async () => {
  for (const { label, shape, index, target, expected, blocked, escape, volume } of fixtures) {
    const original = shape.points, start = original[index];
    const seed = await f.inspect(`${label}-seed`, shape, 'seed');
    const file = join(f.output, `${label}-source.bcad`), bytes = JSON.stringify(seed);
    await writeFile(file, bytes);
    await f.freshOpen(file, seed, `${label}-opened`);
    await edit([...original, target, escape]);
    await expectPoints(original);
    f.phase = `Click and Shift-click ${label} points without moving them`;
    await f.worldClick(start);
    await selected(index).waitFor();
    await f.page.keyboard.down('Shift');
    try { await f.worldClick(original[0]); } finally { await f.page.keyboard.up('Shift'); }
    await selected(0).waitFor();
    await selected(index).waitFor();
    await expectPoints(original);
    await f.worldClick(start);
    assert.equal(await selected(0).count(), 0);

    if (blocked) {
      f.phase = 'Drag an authored fixed point';
      await begin(original[0]);
      await move([8, 8]);
      await f.page.mouse.up();
      await expectPoints(original);
    }
    f.phase = `Cancel ${label} point drag with Escape`;
    await begin(start);
    await move(escape);
    assert.equal(await cursor(), 'grabbing');
    await f.page.keyboard.press('Escape');
    await f.page.mouse.up();
    assert.notEqual(await cursor(), 'grabbing');
    await expectPoints(original);
    assert.equal(await f.sketchPanel().isVisible(), true);

    f.phase = `Preview ${label} point drag before mouse release`;
    await begin(start);
    await move(target);
    assert.equal(await cursor(), 'grabbing');
    await expectPreviewAt(index, expected[index]);
    await expectPoints(original);
    await f.same(seed);
    await f.snapshot(`${label}-drag-preview`);
    if (blocked) {
      f.phase = 'A collapsed side keeps the last valid point preview';
      await move(blocked);
      await expectPreviewAt(index, expected[index]);
    }
    await f.page.mouse.up();
    await expectPoints(expected);
    await f.page.keyboard.press(`${keyboard}+z`);
    await expectPoints(original);
    await f.page.keyboard.press(`${keyboard}+Shift+z`);
    await expectPoints(expected);
    assert.deepEqual(await f.doc(), seed);
    await f.snapshot(`${label}-drag-committed`);

    const { doc } = await f.finishSketch(`${label}-extrude-rebuilt`);
    assert.deepEqual(doc.nodes[0].outline.points, expected);
    assert.deepEqual(doc.nodes[0].outline.rules, fixed);
    assert.deepEqual(doc.nodes[0].outline.lengths, { 0: 40 });
    assert.deepEqual(doc.nodes[0].sideTags, seed.nodes[0].sideTags);
    assert.equal(doc.nodes[1].height, 10);
    const native = await f.inspect(`${label}-native`, doc);
    near(native.volume, volume);
    for (const id of shape.ids) assert.ok(native.faces.some(face => face.name === `n1.side[${id}]`));
    if (shape.radii) {
      assert.deepEqual(doc.nodes[0].outline.radii, shape.radii);
      assert.deepEqual(doc.nodes[0].outline.tangents, shape.tangents);
      const arc = native.faces.find(face => face.name === 'n1.side[e5]').geometry;
      assert.equal(arc.kind, 'cylinder');
      near(arc.r, 6);
      near(arc.c[0], 34);
      near(arc.c[1], 34);
      const walls = ['e2', 'e3'].map(tag => native.faces.find(face => face.name === `n1.side[${tag}]`).geometry);
      for (const wall of walls) {
        assert.equal(wall.kind, 'plane');
        near(Math.abs(wall.n.reduce((d, n, i) => d + n * (arc.c[i] - wall.o[i]), 0)), 6);
      }
    }
    const saved = await f.save(`${label}-dragged`);
    await f.freshOpen(saved.file, saved.doc, `${label}-fresh-open`);
    assert.deepEqual(await f.inspect(`${label}-reopened-native`, await f.doc()), native);
    f.report.observations.push({ label, expected, volume: native.volume, nativeHash: native.hash });
    await edit(expected);
    await expectPoints(expected);
    assert.equal(await readFile(file, 'utf8'), bytes);
  }
});
