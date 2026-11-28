import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const points = [[0, 0], [40, 0], [40, 30], [0, 30]];
const pins = [
  'apps/cad-studio/test/sketch-two-setback-chamfer-browser.mjs',
  'apps/cad-studio/src/ui/SketchCornerTools.tsx',
  'apps/cad-studio/src/sketch/cornerDraft.ts',
  'apps/cad-studio/src/sketch/constraintInspection.ts',
  'packages/barocss-cad-model/src/sketch/corner.ts',
];
const f = await createFlow({
  name: 'sketch-two-setback-chamfer', output: process.argv[2], envFrozen: 'TWO_SETBACK_CHAMFER_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Apply two distinct setbacks at one authored right-angle sketch corner and reopen the native extrusion.',
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { profileOf } from '@barocss/cad-model/sketch/loops';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (process.argv[3] === '"seed"') {
  const profile = profileOf([{ kind: 'polygon', closed: true, points: doc.points, ids: ['e1','e2','e3','e4'],
    hv: { h: [0, 2], v: [1, 3] }, lengths: { 2: 40, 3: 30 } }]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })));
} else {
  const [output] = partSnapshot(doc).outputs;
  const report = checkBrep(output.brep, { strict: true });
  assert.ok(report.valid, report.issues.join(' | '));
  console.log(JSON.stringify({ volume: massPropertiesOf(output).volume, counts: report.counts,
    vertices: output.brep.vertices.map(vertex => vertex.point), faces: output.brep.faces.map(face => face.name) }));
}
`,
});
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.sketchPanel().getByRole('group', { name: 'Chamfer', exact: true });
const field = name => panel().getByLabel(name, { exact: true });
const preview = () => f.page.locator('.sk-corner-preview');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} vs ${b}`);
const cut = (incoming, outgoing) => [[0, 0], [40 - incoming, 0], [40, outgoing], [40, 30], [0, 30]];

async function editSketch() {
  await f.openFeatureEditor(1, 'Extrude');
  await button('Edit sketch', f.editor()).click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame(points);
}

async function startChamfer() {
  await f.worldClick(points[1]);
  const tools = f.sketchPanel().getByRole('group', { name: 'Corner tools', exact: true });
  await button('Chamfer', tools).click();
  await panel().waitFor();
}

async function verifyNative(label, doc, incoming, outgoing) {
  const outline = doc.nodes[0].outline;
  const expected = cut(incoming, outgoing);
  for (const [i, [x, y]] of expected.entries()) {
    near(outline.points[i][0], x);
    near(outline.points[i][1], y);
  }
  assert.deepEqual(doc.nodes[0].sideTags.outer, ['e1', 'e5', 'e2', 'e3', 'e4']);
  near(outline.lengths[1], Math.hypot(incoming, outgoing));
  const angle = outline.rules.find(rule => rule.kind === 'angle' && rule.a === 0 && rule.b === 1);
  near(angle.value, 180 - Math.atan2(outgoing, incoming) * 180 / Math.PI);
  const report = await f.inspect(label, doc);
  const volume = (40 * 30 - incoming * outgoing / 2) * 10;
  near(report.volume, volume);
  near((await f.bodies()).bodies[0].volume, volume);
  assert.equal(report.counts.faces, 7);
  assert.equal(report.counts.vertices, 10);
  assert.ok(report.faces.includes('n1.side[e5]'));
  for (const [x, y] of expected) for (const z of [0, 10]) {
    assert.ok(report.vertices.some(v => Math.hypot(v[0] - x, v[1] - y, v[2] - z) < 1e-7));
  }
  f.report.observations.push({ label, incoming, outgoing, volume, angle: angle.value });
}

await f.run(async () => {
  const source = await f.inspect('orthogonal-stock', { points }, 'seed');
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'two-setback-stock.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)),
  });
  await f.same(source);
  await editSketch();
  await startChamfer();
  await field('Distance').waitFor();
  if (baseline) {
    assert.equal(await field('Distance mode').count(), 0);
    await f.snapshot('equal-distance-only');
    await button('Cancel', panel()).click();
    await f.same(source);
    return;
  }

  f.phase = 'Preview two independent setbacks and keep the original outline on refusal and Cancel';
  await field('Distance mode').selectOption('two');
  await field('Incoming distance').fill('3');
  await field('Outgoing distance').fill('4');
  await preview().waitFor();
  await f.same(source);
  await f.snapshot('two-setback-preview');
  await field('Outgoing distance').fill('30');
  assert.equal(await button('Apply', panel()).isDisabled(), true);
  await preview().waitFor({ state: 'hidden' });
  await f.same(source);
  await f.snapshot('oversized-outgoing-refused');
  await button('Cancel', panel()).click();
  await f.same(source);

  f.phase = 'Apply the two-setback bevel, then finish and check the native solid';
  await startChamfer();
  await field('Distance mode').selectOption('two');
  await field('Incoming distance').fill('3');
  await field('Outgoing distance').fill('4');
  await button('Apply', panel()).click();
  await f.same(source);
  const accepted = (await f.finishSketch('two-setback-applied')).doc;
  await verifyNative('two-setback-native', accepted, 3, 4);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(accepted);
  const saved = await f.save('two-setback-chamfer');
  const reopened = (await f.freshOpen(saved.file, accepted, 'two-setback-reopened')).doc;
  await verifyNative('two-setback-native-reopened', reopened, 3, 4);

  f.phase = 'Edit the persisted bevel length while keeping the angle and original carriers';
  await editSketch();
  await f.sketchPanel().getByLabel('Edge 2 length', { exact: true }).fill('10');
  const revised = (await f.finishSketch('two-setback-length-edited')).doc;
  await verifyNative('edited-two-setback-native', revised, 6, 8);
});
