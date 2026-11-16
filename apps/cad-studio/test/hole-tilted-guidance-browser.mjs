import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['packages/barocss-cad-model/src/app/commands.ts'];
const reason = 'The selected flat face is tilted. Select a flat face facing ±X, ±Y or ±Z instead.';
const f = await createFlow({ name: 'hole-tilted-guidance', output: process.argv[2], envFrozen: 'HOLE_TILTED_FROZEN', initialFiles: pins, requiredFrozen: pins,
 qualification: 'Hole identifies a drafted tilted planar face and recovers after an axis-normal face pick.', limits: ['Two-face Draft box, desktop WebGPU; no tilted-hole geometry expansion or assistive-device test.'],
 inspectorSource: `import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { readFileSync } from 'node:fs';
const [body] = partSnapshot(JSON.parse(readFileSync(process.argv[2], 'utf8'))).outputs;
console.log(JSON.stringify({ valid: checkBrep(body.brep, { strict: true }).valid, volume: massPropertiesOf(body).volume }));` });
const box = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
 { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 20] }, { id: 'n1', kind: 'extrude', sketch: 0, height: 10 }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const hud = name => f.page.getByRole('dialog', { name, exact: true });
const preview = panel => panel.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
async function pick(view, world, shift = false) {
 await button('View cube directions').click(); await f.page.getByRole('menuitem', { name: view, exact: true }).click();
 await f.page.locator('.view-cube .vc-label').getByText(view.toUpperCase(), { exact: true }).waitFor();
 await f.page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
 const point = await f.page.evaluate(world => window.__studioScreenOf(world), world);
 if (shift) await f.page.keyboard.down('Shift'); await f.page.mouse.click(...point); if (shift) await f.page.keyboard.up('Shift');
 await f.page.waitForFunction(n => window.__studioSelection.selection.faces.length === n, shift ? 2 : 1);
}
await f.run(async () => {
 for (const width of [1024, 1440]) {
  await f.newPage(); await f.page.setViewportSize({ width, height: width === 1024 ? 800 : 900 });
  await f.openFile({ name: 'tilted-box.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(box)) }, 2);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  const filter = button('Selection filter'); for (let i = 0; i < 5 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  await pick('Back', [8, 20, 5]); await pick('Top', [8, 10, 10], true);
  await f.page.evaluate(() => document.activeElement?.blur()); await f.command('Draft');
  const draft = hud('Draft'); await draft.getByLabel('Pull', { exact: true }).selectOption('-x'); await draft.getByLabel('Angle', { exact: true }).fill('10');
  await preview(draft); await button('Apply', draft).click(); await f.changed(box); const source = await f.doc();
  const initial = await f.inspect('draft-' + width, source); assert.ok(initial.valid);
  await pick('Top', [8, 10, 10 - 12 * Math.tan(Math.PI / 18)]);
  const selection = await f.page.evaluate(() => window.__studioSelection.selection);
  await f.page.evaluate(() => document.activeElement?.blur()); await f.page.keyboard.press('Space');
  const palette = hud('Command palette'); await palette.getByRole('combobox').fill('Hole'); await palette.getByText(reason, { exact: true }).waitFor();
  await f.page.keyboard.press('Enter'); assert.equal(await palette.getByRole('combobox').inputValue(), 'Hole'); await f.same(source);
  assert.deepEqual(await f.page.evaluate(() => window.__studioSelection.selection), selection); await f.snapshot('tilted-' + width);
  await f.page.keyboard.press('Escape'); await palette.waitFor({ state: 'hidden' });
  await f.page.evaluate(() => document.activeElement?.blur()); await f.page.keyboard.press('h');
  await f.page.locator('.toast').getByText(reason, { exact: true }).waitFor(); assert.equal(await hud('Hole').count(), 0); await f.same(source);
  await pick('Right', [20, 7, 4]); await f.page.evaluate(() => document.activeElement?.blur()); await f.page.keyboard.press('h');
  const hole = hud('Hole'); await hole.getByLabel('Type', { exact: true }).selectOption('blind');
  for (const [label, value] of [['Diameter', '2'], ['Depth', '2'], ['Centre Y', '10'], ['Centre Z', '5']]) await hole.getByLabel(label, { exact: true }).fill(value);
  await preview(hole); await button('Apply', hole).click(); await f.changed(source); const doc = await f.doc();
  const result = await f.inspect('hole-' + width, doc); assert.ok(result.valid); assert.ok(Math.abs(initial.volume - result.volume - 2 * Math.PI) < 1e-7);
  await f.undo(); await f.same(source); await f.redo(); await f.same(doc);
  const saved = await f.save('tilted-recovered-' + width); await f.freshOpen(saved.file, doc, 'reopened-' + width);
  f.report.observations.push({ width, removedVolume: initial.volume - result.volume });
 }
});
