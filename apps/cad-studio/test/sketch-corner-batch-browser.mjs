import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const original = [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]];
const result = [[0, 0], [60, 0], [60, 40], [44, 40], [38, 34], [38, 21], [32, 15], [22, 15], [22, 40], [0, 40]];
const originalIds = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'];
const resultIds = ['e1', 'e2', 'e3', 'e9', 'e4', 'e10', 'e5', 'e6', 'e7', 'e8'];
const pins = [
  'apps/cad-studio/test/sketch-corner-batch-browser.mjs',
  'apps/cad-studio/src/sketch/cornerDraft.ts', 'apps/cad-studio/src/sketch/constraintInspection.ts',
  'apps/cad-studio/src/ui/SketchCornerTools.tsx', 'apps/cad-studio/src/ui/ConstraintTools.tsx',
  'apps/cad-studio/src/sketch/useSketchDraftHistory.ts', 'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/sketchOverlay.tsx',
  'packages/barocss-cad-model/src/sketch/corner.ts', 'packages/barocss-cad-model/src/sketch/cornerBatch.ts',
];
const f = await createFlow({
  name: 'sketch-corner-batch', output: process.argv[2], envFrozen: 'D1695_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Round and chamfer adjacent convex and reflex sketch corners. Refuse shared-edge consumption as a group.',
  limits: ['One notched XY outline, one 10 mm Extrude, desktop Studio WebGPU.'],
  inspectorSource: String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.argv[3] === '"seed"') {
  const profile = profileOf([{ kind: 'polygon', closed: true, points: input.points, ids: input.ids,
    hv: { h: [0, 2, 4, 6], v: [1, 3, 5, 7] },
    lengths: { 0: 60 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
  }]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const [body] = partSnapshot(input).outputs;
  const b = body.brep;
  assert.ok(checkBrep(b, { strict: true }).valid && b.shells.every(shell => shell.closed));
  const vertices = new Map(b.vertices.map(vertex => [vertex.id, vertex.point]));
  const edges = new Map(b.edges.map(edge => [edge.id, edge]));
  const coedges = new Map(b.coedges.map(coedge => [coedge.id, coedge]));
  const loops = new Map(b.loops.map(loop => [loop.id, loop]));
  const faces = b.faces.map(face => ({ name: face.name, geometry: faceGeometry(face),
    vertices: face.loops.flatMap(id => loops.get(id).coedges.flatMap(key => edges.get(coedges.get(key).edge).vertices.map(v => vertices.get(v)))) }));
  console.log(JSON.stringify({ volume: massPropertiesOf(body).volume, faces }));
}
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const group = name => f.sketchPanel().getByRole('group', { name, exact: true });
const preview = () => f.page.locator('.sk-corner-preview');
async function edit() {
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(original);
}
async function expectPoints(points) {
  const outline = group('Outline points');
  for (const [i, point] of points.entries()) for (const [axis, k] of [['X', 0], ['Y', 1]])
    assert.equal(Number(await outline.getByLabel(`Point ${i + 1} ${axis}`, { exact: true }).inputValue()), point[k]);
  assert.equal(await outline.getByLabel(`Point ${points.length + 1} X`, { exact: true }).count(), 0);
}
async function pick(points) {
  await f.worldClick(points[0]);
  await f.page.keyboard.down('Shift');
  try { for (const point of points.slice(1)) await f.worldClick(point); }
  finally { await f.page.keyboard.up('Shift'); }
}
async function expectTargets() {
  const targets = f.page.locator('.sk-corner-target');
  assert.deepEqual(await targets.evaluateAll(items => items.map(item => item.dataset.cornerIndex)), ['3', '4']);
}
async function checkNative(label, doc, fillet) {
  const native = await f.inspect(label, doc);
  // The convex removal and reflex addition cancel in this fixture. Check both named walls and their endpoints too.
  assert.ok(Math.abs(native.volume - (60 * 40 - 16 * 25) * 10) < 1e-8);
  assert.equal(native.faces.length, 12);
  const [source] = doc.nodes;
  assert.deepEqual(source.sideTags.outer, resultIds);
  assert.deepEqual(source.outline.lengths, { 0: 60 });
  assert.deepEqual(source.outline.rules, [{ kind: 'fix', point: 0, at: [0, 0] }]);
  if (fillet) {
    assert.deepEqual(source.outline.radii, { 3: 6, 5: 6 });
    assert.ok(source.outline.bulges[3] > 0 && source.outline.bulges[5] < 0);
  }
  for (const [i, id] of resultIds.entries()) {
    const face = native.faces.find(item => item.name === `n1.side[${id}]`);
    assert.ok(face, id);
    const newWall = id === 'e9' || id === 'e10';
    assert.equal(face.geometry.kind, fillet && newWall ? 'cylinder' : 'plane');
    if (fillet && newWall) {
      const center = id === 'e9' ? [44, 34] : [32, 21];
      assert.ok(Math.hypot(face.geometry.c[0] - center[0], face.geometry.c[1] - center[1]) < 1e-8);
      assert.ok(Math.abs(face.geometry.r - 6) < 1e-8);
      assert.equal(face.geometry.out, id === 'e9' ? 1 : -1);
    }
    for (const [x, y] of [result[i], result[(i + 1) % result.length]]) for (const z of [0, 10])
      assert.ok(face.vertices.some(p => Math.hypot(p[0] - x, p[1] - y, p[2] - z) < 1e-8), `${id} at ${[x, y, z]}`);
  }
  return native;
}

await f.run(async () => {
  const seed = await f.inspect('seed', { points: original, ids: originalIds }, 'seed');
  const file = join(f.output, 'notched-source.bcad');
  const bytes = JSON.stringify(seed);
  await writeFile(file, bytes);
  await f.freshOpen(file, seed, '01-original');

  for (const { name, field, selection } of [
    { name: 'Fillet', field: 'Radius', selection: [[49, 40], [38, 27], [30, 15]] },
    { name: 'Chamfer', field: 'Distance', selection: [original[3], original[4]] },
  ]) {
    const fillet = name === 'Fillet', tag = name.toLowerCase();
    await edit();
    f.phase = `Pick ${tag} targets and refuse a consumed shared edge`;
    await pick(selection);
    await button(name, group('Corner tools')).click();
    const input = group(name).getByLabel(field, { exact: true });
    const apply = button('Apply', group(name));
    await preview().waitFor();
    await expectTargets();
    await input.fill('12.5');
    await preview().waitFor({ state: 'hidden' });
    await group(name).getByRole('alert').getByText(/share|fit|overlap|shorter/i).waitFor();
    assert.equal(await apply.isDisabled(), true);
    await expectTargets();
    await expectPoints(original);
    await f.same(seed);
    await f.snapshot(`02-${tag}-shared-edge-refused`);

    f.phase = `Review and apply the two ${tag} corners once`;
    await input.fill('6');
    await preview().waitFor();
    await expectTargets();
    const projected = await preview().evaluate(polygon => polygon.points.numberOfItems);
    assert.ok(fillet ? projected > result.length : projected === result.length);
    await expectPoints(original);
    await f.same(seed);
    await f.snapshot(`03-${tag}-preview`);
    if (!fillet) {
      await button('Cancel', group(name)).click();
      await preview().waitFor({ state: 'hidden' });
      await expectPoints(original);
      await button(name, group('Corner tools')).click();
      await input.fill('6');
    }
    await apply.click();
    await preview().waitFor({ state: 'hidden' });
    await expectPoints(result);
    await f.same(seed);
    await f.page.keyboard.press('Meta+z');
    await expectPoints(original);
    await f.page.keyboard.press('Meta+Shift+z');
    await expectPoints(result);
    const accepted = (await f.finishSketch(`04-${tag}-applied`)).doc;
    const native = await checkNative(`${tag}-native`, accepted, fillet);
    await f.undo();
    await f.same(seed);
    await f.redo();
    await f.same(accepted);
    const saved = await f.save(`batched-${tag}`);
    await f.freshOpen(saved.file, saved.doc, `05-${tag}-fresh-open`);
    assert.deepEqual(await checkNative(`${tag}-reopened`, await f.doc(), fillet), native);
    await edit();
    await expectPoints(result);
    await f.snapshot(`06-${tag}-editable-sketch`);
    if (fillet) await f.freshOpen(file, seed, '07-reset-original');
  }
  assert.equal(await readFile(file, 'utf8'), bytes);
});
