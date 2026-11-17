import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const base = JSON.parse(await readFile(new URL('./fixtures/assembly-steps.bcad', import.meta.url), 'utf8'));
const f = await createFlow({ name: 'assembly-translate-selection', envFrozen: 'ASSEMBLY_TRANSLATE_SELECTION_FROZEN', output: process.argv[2], qualification: 'One explicit world offset preserves the relative placement and evaluated bounds of two free ordinary parts.', initialFiles: ['apps/cad-studio/test/assembly-translate-selection-browser.mjs', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/assembly/translateSelection.ts', 'apps/cad-studio/src/ui/SelectedInstancesPanel.tsx'], limits: ['Synthetic static support blocks. No constrained, patterned, cut, linked-housing or jointed assembly move qualification. No group rotation.'] });
const row = id => f.page.locator(`[data-browser-instance-path="${id}"]`);
const panel = () => f.page.getByRole('complementary', { name: 'Selected placed parts', exact: true });
const field = a => panel().getByRole('textbox', { name: `Selected parts offset ${a}`, exact: true });
const move = () => panel().getByRole('button', { name: 'Move selected parts', exact: true });
async function select(a = 'b1', b = 'b2') { await row(a).click(); await row(b).click({ modifiers: ['Meta'] }); await panel().waitFor(); await field('X').waitFor(); await f.page.waitForFunction(() => !document.querySelector('[aria-label="Selected parts offset X"]')?.disabled); }
async function offset(values) { for (const [k, a] of ['X', 'Y', 'Z'].entries()) await field(a).fill(String(values[k])); }
await f.run(async () => {
  await f.newPage(); await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'move-group.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(base)) });
  await f.page.waitForFunction(() => window.__studioDoc?.instances?.some(i => i.id === 'b2')); await f.ready(); await select();
  const before = await f.doc(), bounds = await f.page.evaluate(() => window.__studioInstanceBounds());
  await field('X').fill('Infinity'); assert.equal(await move().isEnabled(), false); await f.same(before);
  await offset([12, -7, 5]); await f.snapshot('01-offset-draft'); await move().click(); await f.changed(before); const moved = await f.doc();
  for (const old of before.instances) { const now = moved.instances.find(i => i.id === old.id); assert.deepEqual(now, ['b1', 'b2'].includes(old.id) ? { ...old, position: old.position.map((v, k) => v + [12, -7, 5][k]) } : old); }
  assert.deepEqual(moved.nodes, before.nodes); assert.deepEqual(moved.mates, before.mates);
  await f.page.waitForFunction(old => { const now = window.__studioInstanceBounds?.(); return now && old.every(b => { const n = now.find(x => x.id === b.id); return n && ['min', 'max'].every(key => b[key].every((v, k) => Math.abs(n[key][k] - v - (['b1', 'b2'].includes(b.id) ? [12, -7, 5][k] : 0)) < 1e-7)); }); }, bounds);
  f.report.observations.push({ event: 'placed-bounds-translation', before: bounds, after: await f.page.evaluate(() => window.__studioInstanceBounds()), delta: [12, -7, 5] });
  await f.snapshot('02-moved'); await f.undo(); await f.same(before); await f.redo(); await f.same(moved);
  await select(); await offset([99, 0, 0]); await select('b1', 'cap'); assert.equal(await field('X').inputValue(), '0'); await f.same(moved);
  await offset([8, 0, 0]); await field('X').press('Escape'); assert.equal(await field('X').inputValue(), '0'); await panel().waitFor(); await f.same(moved);
  const saved = await f.save('translated-group'); await f.freshOpen(saved.file, saved.doc, '03-reopened'); await select(); assert.equal(await field('X').inputValue(), '0'); await f.same(moved);
  // One fixed occurrence refuses the complete selection, rather than moving the other block.
  await row('b1').click(); await f.page.getByRole('complementary', { name: 'Instance', exact: true }).getByRole('button', { name: 'Fix in place', exact: true }).click(); await f.changed(moved); await select(); const fixed = await f.doc(); await offset([4, 0, 0]); await move().click(); await f.page.getByText('Selected parts not moved', { exact: true }).waitFor(); await f.same(fixed); await f.snapshot('04-fixed-refusal');
});
