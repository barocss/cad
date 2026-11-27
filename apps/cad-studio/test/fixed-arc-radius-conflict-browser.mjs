import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const points = [[0, 0], [20, 0], [20, 20], [0, 20]];
const pins = [
  'apps/cad-studio/test/fixed-arc-radius-conflict-browser.mjs',
  'apps/cad-studio/src/sketch/constraintList.ts',
  'apps/cad-studio/src/viewport/studioSketchViewportActions.ts',
  'apps/cad-studio/src/ui/StudioSketchInspector.tsx',
  'apps/cad-studio/src/ui/SketchPanel.tsx',
];
const f = await createFlow({
  name: 'fixed-arc-radius-conflict', output: process.argv[2], envFrozen: 'D2063_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'The radius of a closed outline arc cannot be less than half its fixed chord. Verify both editors and explicit release of one Fix.',
  snapshotExtra: () => ({
    picked: document.querySelector('.cons-sel')?.textContent ?? null,
    solver: document.querySelector('.sk-solver-diagnostics')?.textContent ?? null,
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
    controls: ['Undo', 'Redo'].map(name => document.querySelector(`button[aria-label="${name}"]`)?.disabled),
  }),
  inspectorSource: `
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { checkBrep, brepMassProperties, faceGeometry } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { profileOf } from '@barocss/cad-model/sketch/loops';
const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (input.seed) {
  const profile = profileOf([{ kind: 'polygon', closed: true, points: input.points, bulges: [0,.5,0,0],
    hv: { h: [0,2], v: [3] }, rules: [1,2].map(point => ({ kind:'fix', point, at: input.points[point] })) }]);
  assert.ok('node' in profile);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), profile.node), { kind:'extrude', sketch:0, height:5 })));
} else {
  const [{ brep }] = partBreps(input);
  console.log(JSON.stringify({ check:checkBrep(brep,{strict:true}), volume:brepMassProperties(brep,1).volume,
    rounds:brep.faces.map(faceGeometry).filter(s => s.kind === 'cylinder') }));
}
`,
});
const panel = () => f.sketchPanel();
const button = name => panel().getByRole('button', { name, exact: true });
const radius = () => panel().getByLabel('Arc 2 radius', { exact: true });
const field = () => f.page.locator('input.dim-edit');
const drag = async (from, to) => {
  await f.page.mouse.move(...await f.screenOf(from));
  await f.page.mouse.down();
  await f.page.mouse.move(...await f.screenOf(to), { steps: 6 });
  await f.page.mouse.up();
};
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
async function coordinates() {
  return panel().locator('input[aria-label^="Point "]').evaluateAll(inputs => inputs.map(i => Number(i.value)));
}
async function native(label, doc, expectedRadius) {
  const { check, volume, rounds } = await f.inspect(label, doc);
  assert.ok(check.valid, JSON.stringify(check.issues));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, 0);
  assert.equal(rounds.length, 1);
  near(rounds[0].r, expectedRadius);
  const { points: outline, bulges } = doc.nodes[0].outline;
  const polygon = outline.reduce((sum, [x, y], i) => {
    const [nextX, nextY] = outline[(i + 1) % outline.length];
    return sum + x * nextY - y * nextX;
  }, 0) / 2;
  const angle = 4 * Math.atan(bulges[1]);
  const expectedVolume = (polygon + expectedRadius ** 2 * (angle - Math.sin(angle)) / 2) * 5;
  near(volume, expectedVolume);
  f.report.observations.push({ label, volume, expectedVolume, radius: rounds[0].r });
}
async function refusal(label, action) {
  const before = await f.snapshot(label + '-before');
  const xy = await coordinates();
  await action();
  const alert = panel().locator('[role="alert"]');
  await alert.waitFor();
  const after = await f.snapshot(label);
  assert.deepEqual(await coordinates(), xy);
  assert.equal(Number(await radius().inputValue()), 12.5);
  for (const key of ['doc', 'bodies', 'selection', 'picked', 'history', 'controls', 'dirty', 'solver']) assert.deepEqual(after[key], before[key], key);
  const text = await alert.textContent();
  f.report.observations.push({ label, text });
  if (baseline) {
    assert.equal(await button('Find fixed point 2').count(), 0);
    assert.equal(await button('Find fixed point 3').count(), 0);
  } else {
    assert.match(text, /Radius of arc 2 = 9 mm.*20 mm.*fixed points 2 and 3.*at least 10 mm/);
    await button('Find fixed point 2').waitFor();
    await button('Find fixed point 3').waitFor();
  }
}
async function focusFix(point, id) {
  await button('Find fixed point ' + (point + 1)).press('Enter');
  await f.page.waitForFunction(({ point, id }) => {
    const mark = document.querySelector('.vp-overlay .inspected');
    return document.activeElement?.getAttribute('data-constraint-id') === id &&
      mark?.getAttribute('data-sketch-entity') === 'point:' + point;
  }, { point, id });
}

await f.run(async () => {
  const seed = await f.inspect('seed', { seed: true, points });
  await f.newPage();
  await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
    name: 'fixed-arc-radius.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)),
  });
  await f.same(seed);
  await native('original-native', seed, 12.5);
  await f.openFeatureEditor(1);
  await f.editor().getByRole('button', { name: 'Edit sketch', exact: true }).click();
  await panel().waitFor();
  await f.tool('Select', 's');
  await f.frame(points);
  const mobility = panel().locator('details.sk-mobility');
  const point3 = mobility.getByRole('listitem', { name: 'Locally movable point 3', exact: true });
  await mobility.locator('summary').click();
  await mobility.getByLabel('Locally movable geometry', { exact: true }).waitFor();
  assert.equal(await point3.count(), 0);
  await drag([20, 20], [20, 16]);
  assert.deepEqual(await coordinates(), points.flat(), 'fixed point cannot shorten the chord');
  await refusal('01-panel-refusal', () => radius().fill('9'));
  await f.worldClick([25, 10]);
  await button('Dimension the selection').click();
  await field().waitFor();
  await field().fill('9');
  await refusal('02-inline-refusal', async () => {
    await field().press('Enter');
    await field().waitFor({ state: 'hidden' });
  });
  if (baseline) return;

  await focusFix(1, 'rule:0');
  await focusFix(2, 'rule:1');
  await f.snapshot('03-focused-arc-endpoint');
  await panel().locator('[data-constraint-id="rule:1"] button.x').click();
  await point3.waitFor();
  assert.equal(await point3.getAttribute('aria-description'), 'Two independent directions');
  await f.snapshot('03b-unfixed-local-mobility');
  await f.tool('Select', 's');
  await drag([20, 20], [20, 16]);
  assert.deepEqual(await coordinates(), points.flat(), 'free, non-tangent circular outlines do not enter the existing point drag');
  await panel().getByLabel('Point 3 Y', { exact: true }).fill('16');
  const moved = [[0, 0], [20, 0], [20, 16], [0, 16]];
  (await coordinates()).forEach((v, i) => near(v, moved.flat()[i]));
  await radius().fill('9');
  await f.page.waitForFunction(() => {
    const input = document.querySelector('input[aria-label="Arc 2 radius"]');
    return Number(input?.value) === 9 && input?.classList.contains('locked');
  });
  const applied = (await f.finishSketch('04-shorter-chord-radius-9')).doc;
  assert.deepEqual(applied.nodes[0].outline.rules, [{ kind: 'fix', point: 1, at: [20, 0] }]);
  assert.equal(applied.nodes[0].outline.radii[1], 9);
  const [anchor, fixed, free, opposite] = applied.nodes[0].outline.points;
  [...anchor, fixed[0], fixed[1]].forEach((v, i) => near(v, [0, 0, 20, 0][i]));
  near(opposite[0], 0);
  near(free[1], opposite[1]);
  const chord = Math.hypot(free[0] - fixed[0], free[1] - fixed[1]);
  assert.ok(chord < 18 && free[1] > 0);
  f.report.observations.push({ label: 'unfixed-endpoint', afterCoordinateEdit: moved[2], afterRadiusEdit: free, chord });
  assert.deepEqual(applied.nodes[0].sideTags, seed.nodes[0].sideTags);
  assert.deepEqual(applied.nodes[1], seed.nodes[1]);
  await native('radius-9-native', applied, 9);
  await f.undo();
  await f.same(seed);
  await f.redo();
  await f.same(applied);
  const saved = await f.save('fixed-arc-radius-recovered');
  const reopened = await f.freshOpen(saved.file, applied, '05-reopened');
  await native('reopened-radius-9-native', reopened.doc, 9);
});
