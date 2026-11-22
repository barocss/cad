import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const points = [[0, 0], [40, 0], [40, 30], [0, 30]];
const cut = [[0, 0], [34, 0], [40, 6], [40, 30], [0, 30]];
const originalSides = ['e1', 'e2', 'e3', 'e4'];
const chamferSides = ['e1', 'e5', 'e2', 'e3', 'e4'];
const pins = [
  'apps/cad-studio/test/sketch-chamfer-browser.mjs',
  'apps/cad-studio/src/ui/ConstraintTools.tsx',
  'apps/cad-studio/src/app/sketchControls.ts',
  'apps/cad-studio/src/app/useStudioKeyboard.ts',
  'apps/cad-studio/src/sketch/useSketchDraftHistory.ts',
  'packages/barocss-cad-model/src/sketch/corner.ts',
  'packages/barocss-cad-model/src/sketch/entityIds.ts',
  'packages/barocss-cad-model/src/sketch/loops.ts',
  'packages/barocss-cad-model/src/sketch/reopen.ts',
  'packages/barocss-cad-model/src/sketch/trim.ts',
];
const f = await createFlow({
  name: 'sketch-chamfer', envFrozen: 'D1691_SOURCE_FROZEN', output: process.argv[2],
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Chamfer an existing straight-corner sketch in Studio and verify both draft and native document lifecycles.',
  limits: ['One 6 mm equal-distance chamfer on a 40 × 30 mm XY sketch feeding a native 10 mm Extrude. Desktop Studio WebGPU.'],
  inspectorSource: String.raw`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';

const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.argv[3] === '"seed"') {
  const profile = profileOf([{ kind: 'polygon', closed: true, points: doc.points, ids: ['e1','e2','e3','e4'],
    hv: { h: [0, 2], v: [1, 3] }, lengths: { 2: 40 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }] }]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const [output] = partSnapshot(doc).outputs;
  assert.ok(output && checkBrep(output.brep, { strict: true }).valid);
  assert.ok(output.brep.shells.every(shell => shell.closed));
  const b = output.brep, vertices = new Map(b.vertices.map(v => [v.id, v.point])),
    edges = new Map(b.edges.map(e => [e.id, e])), coedges = new Map(b.coedges.map(c => [c.id, c])),
    loops = new Map(b.loops.map(l => [l.id, l]));
  const faces = b.faces.map(face => ({ name: face.name, kind: faceGeometry(face).kind,
    points: face.loops.flatMap(id => loops.get(id).coedges.flatMap(id => edges.get(coedges.get(id).edge).vertices.map(id => vertices.get(id)))) }));
  console.log(JSON.stringify({ volume: massPropertiesOf(output).volume, vertices: b.vertices.map(v => v.point), faces }));
}
`,
});

const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const group = () => f.sketchPanel().getByRole('group', { name: 'Chamfer the corner', exact: true });
const field = () => group().getByLabel('Chamfer distance', { exact: true });
async function expectPoints(expected) {
  const outline = f.sketchPanel().getByRole('group', { name: 'Outline points', exact: true });
  for (const [i, point] of expected.entries()) for (const [axis, k] of [['X', 0], ['Y', 1]])
    assert.equal(Number(await outline.getByLabel(`Point ${i + 1} ${axis}`, { exact: true }).inputValue()), point[k]);
  assert.equal(await outline.getByLabel(`Point ${expected.length + 1} X`, { exact: true }).count(), 0);
}
async function editSketch() {
  await f.openFeatureEditor(1, 'extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(points);
}
async function verifyNative(label, doc, outline, sides, volume) {
  const result = await f.inspect(label, doc);
  assert.ok(Math.abs(result.volume - volume) < 1e-8, result.volume);
  assert.equal(result.vertices.length, 2 * outline.length);
  for (const [i, point] of outline.entries()) {
    const next = outline[(i + 1) % outline.length], face = result.faces.find(face => face.name === `n1.side[${sides[i]}]`);
    assert.equal(face?.kind, 'plane');
    for (const [x, y] of [point, next]) for (const z of [0, 10])
      assert.ok(face.points.some(p => Math.hypot(p[0] - x, p[1] - y, p[2] - z) < 1e-8), `${sides[i]} at ${[x, y, z]}`);
  }
  assert.equal(result.faces.length, sides.length + 2);
  return result;
}

await f.run(async () => {
  const seed = await f.inspect('seed', { points }, 'seed'), file = join(f.output, 'rectangle-source.bcad');
  const originalBytes = JSON.stringify(seed);
  await writeFile(file, originalBytes);
  await f.freshOpen(file, seed, '01-source-extrude');
  await verifyNative('source-native', seed, points, originalSides, 12000);

  await editSketch();
  await f.worldClick(points[1]);
  await group().waitFor();
  await expectPoints(points);
  await f.snapshot('02-chamfer-control');
  await field().fill('');
  await field().press('Enter');
  await f.sketchPanel().getByRole('alert').getByText(/Enter a positive chamfer distance/).waitFor();
  await expectPoints(points);
  await f.same(seed);
  await field().fill('30');
  await button('Chamfer the corner', group()).click();
  await f.sketchPanel().getByRole('alert').getByText('The chamfer distance must be shorter than both edges.', { exact: true }).waitFor();
  await expectPoints(points);
  await f.same(seed);
  await f.snapshot('03-oversized-refused');

  await field().fill('6');
  await field().press('Enter');
  await expectPoints(cut);
  await f.same(seed);
  await f.snapshot('04-six-mm-chamfer');

  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Meta+z');
  await expectPoints(points);
  await f.page.keyboard.press('Meta+Shift+z');
  await expectPoints(cut);
  const accepted = (await f.finishSketch('05-finished-chamfer')).doc;
  assert.deepEqual(accepted.nodes[0].sideTags.outer, chamferSides);
  assert.deepEqual(accepted.nodes[0].outline.lengths, { 3: 40 });
  assert.deepEqual(accepted.nodes[0].outline.rules, seed.nodes[0].outline.rules);
  assert.deepEqual(accepted.nodes[1], seed.nodes[1]);
  assert.deepEqual(accepted.outputs, seed.outputs);
  const result = await verifyNative('chamfer-native', accepted, cut, chamferSides, (40 * 30 - 6 * 6 / 2) * 10);
  assert.ok(result.vertices.every(p => p[0] !== 40 || p[1] !== 0), 'the sharp original corner is gone');

  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('six-mm-chamfer');
  await f.freshOpen(saved.file, saved.doc, '06-reopened-solid');
  assert.deepEqual(await verifyNative('reopened-native', await f.doc(), cut, chamferSides, 11820), result);
  assert.equal(await readFile(file, 'utf8'), originalBytes);
  await editSketch();
  await expectPoints(cut);
  await f.snapshot('07-reopened-editable-outline');

  const bound = { ...seed, parameters: { W: 40 }, nodes: [
    { id: seed.nodes[0].id, kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [{ parameter: 'W' }, 30],
      sideTags: { outer: originalSides } },
    seed.nodes[1],
  ] };
  const boundFile = join(f.output, 'bound-source.bcad');
  await writeFile(boundFile, JSON.stringify(bound));
  await f.freshOpen(boundFile, bound, '08-bound-source');
  await editSketch();
  await f.worldClick(points[1]);
  await field().fill('6');
  await button('Chamfer the corner', group()).click();
  await f.sketchPanel().getByRole('alert').getByText('Chamfer would remove a sketch parameter binding.', { exact: true }).waitFor();
  await expectPoints(points);
  await f.same(bound);
  await f.snapshot('09-binding-preserved');
});
