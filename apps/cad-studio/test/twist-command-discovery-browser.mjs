import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

const baseline = process.argv.includes('--baseline');
const pins = [
  'apps/cad-studio/test/twist-command-discovery-browser.mjs',
  'apps/cad-studio/src/ui/Palette.tsx', 'apps/cad-studio/src/ui/paletteList.ts',
  'apps/cad-studio/src/ui/paletteRank.ts',
  'packages/barocss-cad-model/src/app/profileCommands.ts',
  'packages/barocss-cad-model/src/app/ruledTurnCommand.ts',
];
const f = await createFlow({
  name: 'twist-command-discovery', output: process.argv[2], envFrozen: 'TWIST_DISCOVERY_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Use the general Twist query and keep exact Ruled Turn directly accessible.',
  limits: ['An eligible standalone rectangular sketch in desktop Studio.'],
  inspectorSource: `
import { readFileSync } from 'node:fs';
import { checkBrep, brepMassProperties } from '@barocss/cad';
import { partBreps } from '@barocss/cad-model/engine/evaluate';
import { digestOf } from '@barocss/cad-model/util/digest';
const [{ brep }] = partBreps(JSON.parse(readFileSync(process.argv[2], 'utf8')));
console.log(JSON.stringify({ valid: checkBrep(brep, { strict: true }).valid, closed: brep.shells[0].closed,
  bodies: brep.bodies.length, faces: brep.faces.length, edges: brep.edges.length,
  volume: brepMassProperties(brep, 1).volume, digest: digestOf(brep) }));
`,
});
const seed = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, outputs: {}, nextId: 1,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [12, 8] }],
};
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const palette = () => f.page.getByRole('dialog', { name: 'Command palette', exact: true });

async function launch(query, expected, label, before) {
  f.phase = label;
  await button('Sketch 1').click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.page.keyboard.press('Space');
  const search = palette().getByRole('combobox');
  await search.fill(query);
  const labels = palette().locator('.pl-label');
  await labels.first().waitFor();
  const order = await labels.allTextContents();
  assert.equal(order[0], expected);
  if (query === 'Twist') assert.deepEqual(order, baseline ? ['Ruled Turn', 'Smooth Turn'] : ['Smooth Turn', 'Ruled Turn']);
  await f.snapshot(label + '-search');
  await search.press('Enter');
  const hud = f.page.getByRole('dialog', { name: expected, exact: true });
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await f.same(before);
  await button('Apply', hud).click();
  await f.changed(before);
  const created = await f.doc(), smooth = expected === 'Smooth Turn';
  const feature = created.nodes.at(-1);
  assert.equal(feature.kind, 'loft');
  assert.equal(Boolean(feature.smooth), smooth);
  assert.equal(feature.sections.length, smooth ? 13 : 5);
  const result = await f.inspect(label + '-native', created);
  assert.deepEqual([result.valid, result.closed, result.bodies, result.faces, result.edges],
    smooth ? [true, true, 1, 6, 12] : [true, true, 1, 18, 36]);
  const expectedVolume = smooth ? 3840.49391848882 : 2560;
  assert.ok(Math.abs(result.volume - expectedVolume) < 1e-7);
  assert.ok(Math.abs((await f.bodies()).bodies[0].volume - expectedVolume) < 1e-7);
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)', { exact: true }).click();
  await f.snapshot(label + '-result');
  f.report.observations.push({ query, expected, order, ...result });
  return { created, result };
}

await f.run(async () => {
  await f.newPage();
  const [chooser] = await Promise.all([f.page.waitForEvent('filechooser'), button('Open').click()]);
  await chooser.setFiles({ name: 'twist-command.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.same(seed);
  const current = await launch('Twist', baseline ? 'Ruled Turn' : 'Smooth Turn', 'general-twist', seed);
  if (baseline) return;
  await f.undo();
  await f.same(seed);
  await launch('Ruled Turn', 'Ruled Turn', 'explicit-ruled', seed);
  await f.undo();
  await f.same(seed);
  const saved = await launch('Twist', 'Smooth Turn', 'repeat-twist', seed);
  assert.equal(saved.result.digest, current.result.digest);
  const file = await f.save('smooth-turn-from-palette');
  await f.freshOpen(file.file, saved.created, 'reopened-smooth-turn');
  assert.equal((await f.inspect('reopened-native', await f.doc())).digest, saved.result.digest);
});
