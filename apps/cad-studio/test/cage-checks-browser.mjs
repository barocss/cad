import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['apps/cad-studio/src/ui/CagePanel.tsx'];
const f = await createFlow({ name: 'cage-checks', output: process.argv[2], envFrozen: 'CAGE_CHECKS_FROZEN', initialFiles: pins, requiredFrozen: pins,
 qualification: 'Cage status stays quiet when closed, exposes diagnostic details on demand, and retains actionable open-edge status.', limits: ['Desktop 96-quad SubD box; synthetic render tests cover non-manifold/ngon warnings, not native browser fixtures.'] });
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Cage editor', exact: true });
const checks = () => panel().getByLabel('Cage checks', { exact: true });
const state = () => f.page.evaluate(() => window.__studioCage());
const command = async text => { await f.page.getByText('barocss', { exact: true }).click(); await f.command(text); };
await f.run(async () => {
 await f.newPage(); await button('New part').click(); await f.page.waitForFunction(() => window.__studioDoc.nodes.length === 0); await f.ready();
 await command('subd box'); const hud = f.page.getByRole('dialog', { name: 'SubD box', exact: true });
 for (const [name, value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',0],['Centre Y',0],['At Z',0]]) await hud.getByLabel(name, { exact: true }).fill(String(value));
 await hud.locator('.status.ok').waitFor(); await button('Apply', hud).click(); await f.page.waitForFunction(() => window.__studioDoc.nodes.some(n => n.kind === 'subd')); await f.ready();
 const base = await f.doc(), saved = await f.save('cage-checks-base');
 for (const width of [1024, 1440]) {
  await f.freshOpen(saved.file, base, 'base-' + width); await f.page.setViewportSize({ width, height: 900 }); await command('edit cage'); await panel().waitFor();
  const initial = await state(); assert.equal(initial.cage.faces.length, 96);
  for (const display of ['Box', 'Smooth']) {
   await button(display, panel()).click(); assert.equal((await checks().innerText()).trim(), 'Cage details'); await f.same(base);
  }
  const details = checks().locator('details'), summary = checks().locator('summary');
  await summary.focus(); await summary.press('Enter'); assert.equal(await details.getAttribute('open'), '');
  assert.match(await checks().innerText(), /G1 caps there/); assert.match(await checks().innerText(), /0 n-gons.*0 open edges.*96 faces/s);
  await f.snapshot('details-' + width); await summary.press('Enter'); assert.equal(await details.getAttribute('open'), null);
  await button('Box', panel()).click(); await button('View cube directions').click(); await f.page.getByRole('menuitem', { name: 'Top', exact: true }).click();
  if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await button('Face', panel()).click();
  const point = await f.page.evaluate(() => window.__studioScreenOf([3.75, 2.5, 16])); await f.page.mouse.click(...point);
  await f.page.waitForFunction(() => window.__studioCage().sel.faces.length === 1);
  await button('Delete', panel()).click(); await f.page.waitForFunction(() => window.__studioCage().cage.faces.length === 95);
  await checks().getByRole('status').filter({ hasText: '4 open edges' }).waitFor(); assert.equal(await details.getAttribute('open'), null); await f.snapshot('open-' + width);
  await button('Undo cage step', panel()).click(); await f.page.waitForFunction(() => window.__studioCage().cage.faces.length === 96);
  assert.equal((await checks().innerText()).trim(), 'Cage details'); assert.deepEqual((await state()).cage, initial.cage);
  await button('Redo cage step', panel()).click(); await f.page.waitForFunction(() => window.__studioCage().cage.faces.length === 95);
  await checks().getByRole('status').filter({ hasText: '4 open edges' }).waitFor();
  await button('Cancel cage edit', panel()).click(); await panel().waitFor({ state: 'hidden' }); await f.same(base);
 }
});
