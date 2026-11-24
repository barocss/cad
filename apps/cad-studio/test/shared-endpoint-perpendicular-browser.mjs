import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const f = await createFlow({
  name: 'shared-endpoint-perpendicular',
  output: process.argv[2],
  envFrozen: 'D1980_SOURCE_FROZEN',
  qualification: 'Apply and preserve a perpendicular relation to the tangent of a circular arc at one original endpoint.',
  limits: ['One clockwise R8 XY outline with a cut-in arc, one existing Extrude and live R9 and length edits.'],
  initialFiles: [
    'apps/cad-studio/src/ui/ConstraintTools.tsx',
    'apps/cad-studio/src/ui/ConstraintList.tsx',
    'apps/cad-studio/src/ui/SketchMarks.tsx',
    'packages/barocss-cad-model/src/sketch/profile.ts',
    'packages/barocss-cad-model/src/sketch/endpointPerpendicular.ts',
    'packages/barocss-cad-model/src/sketch/rules.ts',
    'packages/barocss-cad-model/src/sketch/terms.ts',
    'packages/barocss-cad-model/src/sketch/driven.ts',
    'packages/barocss-cad-model/src/sketch/entityIds.ts',
    'packages/barocss-cad-model/src/sketch/mobility.ts',
    'packages/barocss-cad-model/src/engine/migrate.ts',
  ],
  inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkBrep, faceGeometry } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { profileOf } from '@barocss/cad-model/sketch/loops';
if (process.argv[3] === '"native"') {
  const parts = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
  assert.equal(parts.length, 1);
  const { brep } = parts[0];
  assert.ok(checkBrep(brep, { strict: true }).valid);
  assert.ok(brep.shells.length === 1 && brep.shells[0].closed);
  console.log(JSON.stringify({ names: brep.faces.map(face => face.name),
    cylinders: brep.faces.map(faceGeometry).filter(surface => surface.kind === 'cylinder') }));
} else {
  const sketch = profileOf([{ kind: 'polygon', closed: true, points: [[0,-1.5],[12,0],[20,8],[0,12]],
    bulges: [0,-Math.tan(Math.PI/8),0,0], radii: { 1: 8 }, hv: { h: [], v: [] } }]);
  assert.ok('node' in sketch);
  console.log(JSON.stringify(withNode(withNode(emptyDoc(), sketch.node), { kind: 'extrude', sketch: 0, height: 6 })));
}
`,
  oracleSource: String.raw`
import json, math, sys
v = json.load(sys.stdin)
sketch, radius, length = v["sketch"], v["radius"], v["length"]
line, arc, next_line, last_line = sketch["segments"]
assert [s["kind"] for s in sketch["segments"]] == ["line", "arc", "line", "line"]
assert arc["direction"] == "cw"
sub = lambda a,b: [a[0]-b[0], a[1]-b[1]]
cross = lambda a,b: a[0]*b[1]-a[1]*b[0]
dot = lambda a,b: a[0]*b[0]+a[1]*b[1]
unit_dot = lambda a,b: dot(a,b)/(math.hypot(*a)*math.hypot(*b))
u = sub(arc["start"],line["start"])
r = sub(arc["start"],arc["center"])
r2 = sub(next_line["start"],arc["center"])
t = [-r[1],r[0]]
sweep = -((math.atan2(r[1],r[0])-math.atan2(r2[1],r2[0])) % math.tau)
assert -math.pi < sweep < 0, sweep
a = [s["start"] for s in sketch["segments"]]
volume = 6 * (sum(cross(x,a[(i+1)%len(a)]) for i,x in enumerate(a))/2
              + radius**2*(sweep-math.sin(sweep))/2)
assert abs(math.hypot(*r)-radius) <= 1e-6 and abs(math.hypot(*r2)-radius) <= 1e-6
if length is not None:
    assert abs(math.hypot(*u)-length) <= 1e-6
assert abs(unit_dot(u,t)) <= 1e-7, unit_dot(u,t)
assert abs(unit_dot(u,sub(next_line["start"],arc["start"]))) > 0.3
assert abs(v["volume"]-volume) <= 1e-5, (v["volume"],volume)
print(json.dumps({"status":"PASS","radius":radius,"length":math.hypot(*u),"tangentDot":unit_dot(u,t),
                  "sweepRad":sweep,"volume":volume,"nativeVolume":v["volume"]}))
`,
  snapshotExtra: () => ({
    solver: document.querySelector('.sk-panel .solver')?.textContent ?? null,
    constraintRows: [...document.querySelectorAll('.cons-row .kv')].map(row => row.textContent),
    picked: document.querySelector('.cons-sel')?.textContent ?? null,
    dimensionControls: [...document.querySelectorAll('.sk-panel input[aria-label]')].map(input => [input.getAttribute('aria-label'), input.value]),
    dirty: !!document.querySelector('[aria-label="Unsaved changes"]'),
  }),
});
const line = [6, -0.75], arc = [20 - 8 / Math.SQRT2, 8 / Math.SQRT2];
const expectedRule = { kind: 'perpendicular', a: 0, b: 1, at: 'shared-endpoint' };
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
const tool = name => button(f.sketchPanel(), name);
const row = () => f.sketchPanel().getByRole('button', { name: /^Remove Perpendicular/ });
const solver = () => f.sketchPanel().locator('.solver');
const edit = async () => {
  await f.openFeatureEditor(1, 'Extrude sketch');
  await button(f.editor(), 'Edit sketch').click();
  await f.sketchPanel().waitFor();
  await f.tool('Select', 's');
  await f.frame([line, arc]);
};
const pickPair = async (first, second, text) => {
  await f.worldClick(first);
  await f.page.keyboard.down('Shift');
  try { await f.worldClick(second); } finally { await f.page.keyboard.up('Shift'); }
  assert.equal(await f.sketchPanel().locator('.cons-sel').textContent(), text);
};
const selectRelation = async reverse => {
  await pickPair(...(reverse ? [arc, line, 'Picked arc 2, edge 1'] : [line, arc, 'Picked edge 1, arc 2']));
  assert.equal(await tool('Perpendicular').isEnabled(), true);
  await tool('Perpendicular').click();
  await row().waitFor();
};
const sketchHistory = async key => {
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press(key);
};
const sketchUndo = () => sketchHistory('Meta+z');
const sketchRedo = () => sketchHistory('Meta+Shift+z');
const writeDoc = async (label, doc) => {
  const file = join(f.output, label + '.bcad');
  await writeFile(file, JSON.stringify(doc));
  return file;
};
const check = async (state, radius, length, source, originalNative) => {
  const sketch = state.doc.nodes[0];
  assert.deepEqual(sketch.outline.rules, [expectedRule]);
  assert.deepEqual(sketch.sideTags, source.nodes[0].sideTags);
  assert.deepEqual(state.doc.nodes.slice(1), source.nodes.slice(1));
  assert.deepEqual(state.doc.outputs, source.outputs);
  assert.equal(state.bodies.bodies.length, 1);
  const native = await f.inspect(state.label + '-native', state.doc, 'native');
  assert.deepEqual(native.names, originalNative.names);
  assert.equal(native.cylinders.length, 1);
  assert.ok(Math.abs(native.cylinders[0].r - radius) <= 1e-6);
  await f.runOracle({ sketch, radius, length, volume: state.bodies.bodies[0].volume }, state.label);
};

await f.run(async () => {
  const source = await f.inspect('oblique-source', {});
  const sourceFile = await writeDoc('oblique-source', source);
  await f.newPage();
  await f.openFile(sourceFile, source.nodes.length);
  await f.same(source);
  const original = await f.snapshot('01-original-nonperpendicular-part');
  const originalNative = await f.inspect('original-native', original.doc, 'native');
  await edit();
  await solver().filter({ hasText: /6 DOF/ }).waitFor({ state: 'attached' });
  await selectRelation(false);
  const forward = await f.snapshot('02-add-perpendicular-line-first');
  assert.match(forward.solver, /5 DOF/);
  assert.deepEqual(forward.doc, source);
  assert.ok(forward.constraintRows.some(text => /edge 1 ⊥ arc 2 at shared endpoint/.test(text)));
  assert.equal(await f.page.locator('.cons-glyph title').filter({ hasText: 'Perpendicular at the shared endpoint of edge 1 and arc 2' }).count(), 2);
  const listed = f.sketchPanel().locator('.cons-row').filter({ has: f.page.getByRole('button', { name: /^Remove Perpendicular/ }) });
  await listed.hover();
  const highlights = f.page.locator('.sk-pick-edge.inspected');
  await highlights.nth(1).waitFor({ state: 'attached' });
  assert.deepEqual(await highlights.evaluateAll(items => items.map(item => item.getAttribute('data-sketch-entity')).sort()), ['edge:0', 'edge:1']);
  await f.snapshot('03-perpendicular-arc-and-line-highlight');
  await sketchUndo();
  await row().waitFor({ state: 'detached' });
  await selectRelation(true);
  const reverse = await f.snapshot('04-add-perpendicular-arc-first');
  assert.deepEqual(reverse.constraintRows, forward.constraintRows);
  assert.equal(reverse.solver, forward.solver);
  const geometry = await f.finishSketch('05-finish-perpendicular');
  await check(geometry, 8, null, source, originalNative);
  await f.undo();
  await f.same(source);
  await f.redo();
  await f.same(geometry.doc);

  await edit();
  assert.equal(await f.sketchPanel().getByLabel('Arc 2 radius', { exact: true }).inputValue(), '8');
  await row().click();
  await row().waitFor({ state: 'detached' });
  await f.snapshot('06-perpendicular-removed');
  await sketchUndo();
  await row().waitFor();
  await sketchRedo();
  await row().waitFor({ state: 'detached' });
  await sketchUndo();
  await row().waitFor();
  const setDimension = async (name, value) => {
    const input = f.sketchPanel().getByLabel(name, { exact: true });
    await input.fill(String(value));
    await input.press('Enter');
    assert.equal(await input.inputValue(), String(value));
  };
  await setDimension('Arc 2 radius', 9);
  await setDimension('Edge 1 length', 11);
  const edited = await f.finishSketch('07-finish-radius-and-length-edits');
  await check(edited, 9, 11, source, originalNative);
  const saved = await f.save('perpendicular-edited');
  const reopened = await f.freshOpen(saved.file, edited.doc, '08-saved-perpendicular-reopened');
  await check(reopened, 9, 11, source, originalNative);
  await edit();
  await row().waitFor();
  const locked = await f.snapshot('09-reopen-shared-endpoint-constraint');
  assert.deepEqual(locked.doc.nodes[0].outline.rules, [expectedRule]);
  assert.equal(await f.sketchPanel().getByLabel('Arc 2 radius', { exact: true }).inputValue(), '9');
  assert.equal(await f.sketchPanel().getByLabel('Edge 1 length', { exact: true }).inputValue(), '11');

  f.phase = 'reject an unmarked legacy rule and a marked unsatisfied rule before changing the open document';
  for (const [label, rule] of [['legacy', { kind: 'perpendicular', a: 0, b: 1 }], ['marked', expectedRule]]) {
    const altered = structuredClone(source);
    altered.nodes[0].outline.rules = [rule];
    const badFile = await writeDoc('bad-' + label, altered);
    const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button(f.page, 'Open').click()]);
    await chooser.setFiles(badFile);
    await f.waitToast(/Could not open this file.*BAD_REFERENCE/);
    const refused = await f.snapshot('10-refused-' + label);
    for (const k of ['doc', 'bodies', 'history', 'solver', 'constraintRows', 'dimensionControls', 'dirty']) assert.deepEqual(refused[k], locked[k], k);
    await f.dismissToasts();
  }
  assert.equal(f.report.downloads.length, 1);
});
