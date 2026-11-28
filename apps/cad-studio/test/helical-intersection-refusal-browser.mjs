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
const button = name => f.page.getByRole('button', { name, exact: true });
const undoButtons = async () => Promise.all(['Undo', 'Redo'].map(name => button(name).isEnabled()));
await f.run(async () => {
  const file = join(f.output, 'original-helical-pair.bcad');
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
  const saved = await f.save('originals-after-refusal');
  await f.freshOpen(saved.file, stock, 'both-original-gears-reopened');
  await frame();
  await f.snapshot('both-original-gears-framed');
});
