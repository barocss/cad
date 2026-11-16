import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['packages/barocss-cad-model/src/app/commands.ts'];
const f = await createFlow({ name: 'hole-selection-guidance', output: process.argv[2], envFrozen: 'HOLE_SELECTION_FROZEN', initialFiles: pins, requiredFrozen: pins,
  qualification: 'Hole search distinguishes zero/multiple faces and recovers to a single-face bore.',
  limits: ['Desktop axis-aligned box; no new geometry support or assistive-device qualification.'],
  inspectorSource: `import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { readFileSync } from 'node:fs';
const doc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const [body] = partSnapshot(doc).outputs;
console.log(JSON.stringify({ valid: checkBrep(body.brep, { strict: true }).valid, volume: massPropertiesOf(body).volume }));` });
const box = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 10 }], outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2 };
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const palette = () => f.page.getByRole('dialog', { name: 'Command palette', exact: true });
const selection = () => f.page.evaluate(() => window.__studioSelection.selection);
async function search() { await f.page.evaluate(() => document.activeElement?.blur()); await f.page.keyboard.press('Space'); await palette().getByRole('combobox').fill('Hole'); }
async function refuse(reason, label) {
  const before = await selection();
  await search(); await palette().getByText(reason, { exact: true }).waitFor();
  await f.page.keyboard.press('Enter');
  assert.equal(await palette().getByRole('combobox').inputValue(), 'Hole');
  assert.deepEqual(await selection(), before); await f.same(box); await f.snapshot(label);
  await f.page.keyboard.press('Escape'); await palette().waitFor({ state: 'hidden' });
}
async function pick(view, world, shift = false) {
  await button(view, f.page.getByRole('group', { name: 'Views' })).click();
  await f.page.waitForFunction(view => document.querySelector('.view-cube .vc-label')?.textContent === view.toUpperCase(), view);
  const point = await f.page.evaluate(world => window.__studioScreenOf(world), world);
  if (shift) await f.page.keyboard.down('Shift');
  await f.page.mouse.click(...point);
  if (shift) await f.page.keyboard.up('Shift');
}
await f.run(async () => {
 for (const width of [1024, 1440]) {
  await f.newPage(); await f.page.setViewportSize({ width, height: 900 });
  await f.openFile({ name: 'selection-box.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(box)) }, 2);
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  const filter = button('Selection filter');
  for (let i = 0; i < 5 && !(await filter.innerText()).includes('Faces'); i++) await filter.click();
  assert.match(await filter.innerText(), /Faces/);
  await refuse('Select the flat face where the hole goes in.', 'zero-' + width);
  await pick('Top', [16, 10, 10]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await pick('Front', [16, 0, 4], true);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 2);
  await refuse('Leave only one flat face selected where the hole goes in.', 'multiple-' + width);
  await pick('Top', [16, 10, 10]);
  await f.page.waitForFunction(() => window.__studioSelection.selection.faces.length === 1);
  await search(); await f.page.keyboard.press('Enter');
  const hud = f.page.getByRole('dialog', { name: 'Hole', exact: true });
  await hud.getByLabel('Diameter', { exact: true }).fill('4');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Cancel', hud).click(); await f.same(box);
  await f.page.evaluate(() => document.activeElement?.blur()); await f.page.keyboard.press('h');
  await hud.getByLabel('Diameter', { exact: true }).fill('4');
  await hud.locator('.status').filter({ hasText: /^preview$/ }).waitFor();
  await button('Apply', hud).click(); await f.changed(box); await f.ready();
  const doc = await f.doc(), native = await f.inspect('hole-' + width, doc);
  assert.ok(native.valid); assert.ok(Math.abs(native.volume - (12000 - 40 * Math.PI)) < 1e-7);
  await f.undo(); await f.same(box); await f.redo(); await f.same(doc);
  const saved = await f.save('single-hole-' + width); await f.freshOpen(saved.file, doc, 'reopened-' + width);
  f.report.observations.push({ width, native });
 }
});
