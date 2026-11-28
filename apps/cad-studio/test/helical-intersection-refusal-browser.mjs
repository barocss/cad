import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const fixture = 'packages/barocss-cad/robustness/corpus/oracle/gear-helical-pair-crossing-intersect.json';
const baseline = process.argv.includes('--baseline');
const pins = [fixture, 'apps/cad-studio/test/helical-intersection-refusal-browser.mjs',
  'packages/barocss-cad-model/src/engine/evaluate.ts',
  'packages/barocss-cad/src/brep/analytic-boolean.ts', 'packages/barocss-cad-model/src/engine/part.ts'];
const f = await createFlow({
  name: 'helical-intersection-refusal', output: process.argv[2], envFrozen: 'HELICAL_PAIR_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Verify that the original opposite-hand helical gear Intersect refusal names the operation and preserves both originals.',
  limits: ['The original corpus geometry maps to native Studio Gear authoring with generator spur-gear@0 and explicit 3 degree phase.'],
});
const corpus = JSON.parse(await readFile(join(f.repo, fixture), 'utf8')).input.partDocument.features;
const nodes = corpus.slice(0, 2).map((gear, i) => ({
  id: `n${i}`, kind: 'gear', module: gear.normalModule, helixAngle: gear.helixAngle, hand: gear.hand,
  teeth: gear.teeth, faceWidth: gear.faceWidth, thicknessReduction: gear.thicknessReduction,
  center: [0, 0], generator: gear.generator, ...(gear.mesh ? { mesh: { gear: 0, phase: gear.mesh.phase } } : {}),
}));
const stock = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2, nodes,
  outputs: { b0: { node: 0, side: 'solid' }, b1: { node: 1, side: 'solid' } },
};
const frame = () => f.page.getByTitle('Frame all (F)', { exact: true }).click();
const button = (name, root = f.page) => root.getByRole('button', { name, exact: true });
const undoButtons = async () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
const versions = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const project = 'Original crossing gear inputs';
async function projectOpen() {
  if (!(await versions().isVisible())) await button('Project and versions').click();
  await versions().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(project);
  await button('Project in this browser', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor();
}
await f.run(async () => {
  const filename = 'original-helical-pair.bcad', file = join(f.output, filename);
  await writeFile(file, JSON.stringify(stock));
  for (const [a, b] of [[0, 1], [1, 0]]) {
    await f.freshOpen(file, stock, 'original-gear-inputs-' + a);
    await frame();
    const rows = f.page.locator('.outliner .ol-row > button.ol');
    await rows.nth(a).click();await rows.nth(b).click({ modifiers: ['Shift'] });
    const selected = await f.page.evaluate(() => window.__studioSelection.selection.bodies);
    assert.deepEqual(selected, [a, b]);
    const before = await undoButtons();
    await clickModelCommand(f.page, 'Combine', 'Intersect');
    const warning = await f.waitToast(/manifold|could not|refused/i, 120000);
    assert.match(warning, baseline ? /could not be joined into one solid/ : /Intersect could not form a solid/);
    assert.match(warning, a === 0 ? /has 1 uses/ : /has 3 uses/);
    await f.same(stock);
    assert.deepEqual(await undoButtons(), before);
    const accepted = (await f.bodies()).bodies;
    assert.equal(accepted.length, 2);
    assert.ok(accepted.every(body => Math.abs(body.volume - 6729.5331434245) < 1e-6));
    await f.page.locator('.toast').getByText('Details', { exact: true }).click();
    await f.snapshot('intersect-refusal-' + a);
    f.report.observations.push({ order: selected, warning, retainedBodies: accepted.length, history: before });
  }
  await projectOpen();
  await button('Save').click();
  await versions().getByRole('list', { name: 'Project documents', exact: true }).getByText(filename, { exact: true }).waitFor();
  await button('Close project', versions()).click();
  await versions().getByLabel('Project', { exact: true }).waitFor({ state: 'hidden' });
  await f.page.reload();
  await f.ready();
  await projectOpen();
  await button('Open ' + filename, versions()).click();
  await f.same(stock);
  await button('Project and versions').click();
  await frame();
  await f.snapshot('both-original-gears-framed');
  assert.deepEqual(f.report.downloads, []);
});
