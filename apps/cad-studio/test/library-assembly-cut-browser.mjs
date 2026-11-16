import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const files = ['apps/cad-studio/src/App.tsx', 'packages/barocss-cad-model/src/app/commands.ts', 'apps/cad-studio/test/library-assembly-cut-browser.mjs'];
const f = await createFlow({ name: 'library-assembly-cut', output: process.argv[2], envFrozen: 'LIBRARY_CUT_SOURCE_FROZEN', initialFiles: files, requiredFrozen: files,
 qualification: 'Newly placed Library bracket can be cut without a base body or reopening.', limits: ['Built-in angle bracket; circular through cut; Chrome WebGPU.'] });
const button = name => f.page.getByRole('button', { name, exact: true });
const hud = () => f.page.getByRole('complementary', { name: 'Assembly cut', exact: true });
await f.run(async () => {
 for (const width of [1024, 1440]) {
  await f.newPage(); await f.page.setViewportSize({ width, height: 900 });
  await button('New part').click(); await f.ready();
  await button('Library').click(); await button('Place angle-bracket').click();
  await f.page.waitForFunction(() => window.__studioDoc?.instances?.length === 1);
  await button('Close library').click(); await f.ready();
  const original = await f.doc(); assert.equal(original.nodes.length, 0);
  await f.page.locator('.ol.instance:not(.nested)').first().click();
  await f.page.evaluate(() => document.activeElement?.blur());
  await f.command('Assembly cut'); await hud().waitFor();
  assert.equal(await hud().locator('[data-target]').count(), 1);
  await hud().getByLabel('Radius mm', { exact: true }).fill('0.5');
  for (const [axis,value] of [['X','10'],['Y','1.5'],['Z','18']]) await hud().getByLabel('Centre '+axis, { exact:true }).fill(value);
  await f.snapshot('preview-'+width); await f.same(original);
  await hud().getByRole('button', {name:'Cut',exact:true}).click();
  await hud().waitFor({state:'hidden'}); await f.changed(original);
  const cut = await f.doc(); assert.equal(cut.assemblyCuts.length,1); assert.deepEqual(cut.instances,original.instances); assert.equal(cut.nodes.length,0);
  await f.page.locator('button[aria-label^="Edit cut"]').first().click(); await hud().waitFor();
  await hud().getByLabel('Radius mm',{exact:true}).fill('0.75');
  await hud().getByRole('button',{name:'Apply',exact:true}).click(); await hud().waitFor({state:'hidden'}); await f.changed(cut);
  const edited=await f.doc(); assert.equal(edited.assemblyCuts[0].profile.radius,0.75);
  await f.undo(); await f.same(cut); await f.undo(); await f.same(original); await f.redo(); await f.same(cut);
  const saved=await f.save('library-cut-'+width); await f.freshOpen(saved.file,cut,'reopened-'+width);
  await f.snapshot('completed-'+width);
 }
});
