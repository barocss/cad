import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/helical-meshing-phase-browser.mjs',
  'packages/barocss-cad-model/src/app/primitives.ts',
  'packages/barocss-cad-model/src/app/editFields.ts',
  'packages/barocss-cad-model/src/engine/part.ts',
  'packages/barocss-cad-model/src/engine/bodyNotes.ts',
  'packages/barocss-cad/src/part/part-gears.ts',
];
const f = await createFlow({
  name: 'helical-meshing-phase', output: process.argv[2], envFrozen: 'HELICAL_MESHING_PHASE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Author a normal opposite-hand helical mate, compare an intentional 3 degree phase offset and reopen the restored pair.',
  limits: ['Two 18-tooth generated-root gears at a nominal centre distance. The pair verdict samples transverse profiles. Intersect and manufacturing are separate.'],
  inspectorSource: `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { checkBrep, outputOf } from '@barocss/cad';
    import { snapshotOf } from '@barocss/cad-model/engine/evaluate';
    import { featureId } from '@barocss/cad-model/engine/ids';
    const doc = JSON.parse(readFileSync(process.argv[2], 'utf8')), part = snapshotOf(doc);
    const values = doc.nodes.map((_, index) => {
      const { brep, gearPlacement } = outputOf(part, featureId(doc.nodes, index));
      assert.ok(brep && gearPlacement);
      assert.ok(checkBrep(brep).valid);
      const { center, from, spec, rotation } = gearPlacement;
      return { center, from, rotation, hand: spec.hand, normalModule: spec.normalModule, width: spec.faceWidth };
    });
    console.log(JSON.stringify(values));
  `,
});

const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const project = 'Helical mesh phase';
const note = pattern => f.page.getByLabel('Generator note', { exact: true }).filter({ hasText: pattern });
const clear = () => note(/Clear over a full tooth period/);
const radians = degrees => degrees * Math.PI / 180;
const sameNumber = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();

async function createGear(command, values, index) {
  f.phase = `Create ${command}`;
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command(command.toLowerCase());
  const hud = f.page.getByRole('dialog', { name: command, exact: true });
  for (const [field, value] of Object.entries(values)) await hud.getByLabel(field, { exact: true }).fill(String(value));
  await f.page.locator('.hud .status').getByText('preview', { exact: true }).waitFor({ timeout: 60000 });
  await f.page.keyboard.press('Enter');
  await f.page.waitForFunction(index => window.__studioDoc.nodes[index]?.kind === 'gear', index, { timeout: 60000 });
  await f.ready();
}

async function details() {
  const row = f.page.locator('.outliner .ol-row > button.ol').nth(1);
  await row.click();
  await note(/Helical β 20° left hand/).waitFor();
  await note(/centre distance 38\.3104 mm, ratio −18:18/).waitFor();
}

async function openProject() {
  if (!(await versions().isVisible())) await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}

async function inspect(phase, doc) {
  const [first, second] = await f.inspect(`phase-${phase}`, doc);
  assert.deepEqual([first.hand, second.hand], ['right', 'left']);
  assert.deepEqual([first.from, second.from, first.width, second.width], [0, 0, 6, 6]);
  assert.deepEqual([first.normalModule, second.normalModule], [2, 2]);
  sameNumber(second.center[0] - first.center[0], 36 / Math.cos(radians(20)));
  sameNumber(second.center[1] - first.center[1], 0);
  sameNumber(second.rotation, radians(180 - 180 / 18 + phase));
  return [first, second];
}

await f.run(async () => {
  await f.newPage();
  await button('New part').click();
  await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0);
  await f.ready();
  await createGear('Spur gear', { Teeth: 18, 'Face width': 6, 'Helix angle β': 20, Bore: 0 }, 0);
  await f.page.locator('.outliner .ol-row > button.ol').first().click();
  await createGear('Meshing gear', { Teeth: 18, Bore: 0 }, 1);
  const normal = await f.doc();
  assert.equal(normal.nodes[1].mesh.gear, 0);
  assert.equal(normal.nodes[1].mesh.phase ?? 0, 0);
  const placements = await inspect(0, normal);
  await details();
  await clear().scrollIntoViewIfNeeded();
  assert.equal(await note(/teeth cross/).count(), 0);
  await frame();
  await f.snapshot('normal-phase-zero');

  await f.openFeatureEditor(1);
  await f.editor().getByLabel('Phase', { exact: true }).fill('3');
  await f.closeEditor();
  await f.same(normal);
  await f.openFeatureEditor(1);
  await f.editor().getByLabel('Phase', { exact: true }).fill('3');
  const crossed = (await f.applyEditor(normal, 'explicit-phase-three')).doc;
  assert.equal(crossed.nodes[1].mesh.phase, 3);
  const changedPlacements = await inspect(3, crossed);
  assert.deepEqual(changedPlacements[0], placements[0]);
  assert.deepEqual(changedPlacements[1].center, placements[1].center);
  if (!(await note(/Helical β 20° left hand/).count())) await details();
  const warning = note(/The teeth cross .*phase 3\.00°.*interference/);
  await warning.scrollIntoViewIfNeeded();
  assert.match(await warning.getAttribute('class'), /\bwarn\b/);
  assert.equal(await clear().count(), 0);
  await f.snapshot('deliberate-phase-interference');
  await f.undo();
  await f.same(normal);
  await f.redo();
  await f.same(crossed);
  await f.undo();
  await f.same(normal);

  f.phase = 'Save and reopen the normal mate in a browser project';
  await openProject();
  await button('Save').click();
  const documents = versions().getByRole('list', { name: 'Project documents', exact: true });
  const row = documents.getByRole('listitem').first();
  await row.waitFor();
  const savedName = (await row.textContent()).trim();
  await button('Close project', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await openProject();
  await button('Open ' + savedName, versions()).click();
  await f.same(normal);
  assert.deepEqual(await inspect(0, await f.doc()), placements);
  await button('Project and versions').click();
  await details();
  await clear().scrollIntoViewIfNeeded();
  await frame();
  await f.snapshot('normal-mate-fresh-open');
  assert.deepEqual(f.report.downloads, []);
  f.report.observations.push({ placements, changedPlacements, savedName });
});
