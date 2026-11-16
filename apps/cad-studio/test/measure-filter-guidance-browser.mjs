import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const pins = ['apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/MeasurementInspector.tsx', 'apps/cad-studio/src/ui/measurePickHint.ts'];
const f = await createFlow({ name: 'measure-filter-guidance', output: process.argv[2], envFrozen: 'MEASURE_FILTER_FROZEN', initialFiles: pins, requiredFrozen: pins,
 qualification: 'Measure next-target help follows filter changes without losing accepted targets.', limits: ['Desktop WebGPU Bracket-01; placed instances and assistive devices not qualified.'] });
const button = name => f.page.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Measurement', exact: true });
async function filter(name) {
 const control = button('Selection filter');
 for (let i = 0; i < 5 && !(await control.innerText()).includes(name); i++) await control.click();
 assert.ok((await control.innerText()).includes(name));
}
async function pick(world) { const point = await f.page.evaluate(world => window.__studioScreenOf(world), world); await f.page.mouse.click(...point); }
await f.run(async () => {
 for (const width of [1024, 1440]) {
  await f.newPage(); await f.page.setViewportSize({ width, height: width === 1024 ? 800 : 900 });
  const doc = await f.doc();
  await button('Top').click(); if (await button('Ortho').getAttribute('aria-pressed') !== 'true') await button('Ortho').click();
  await filter('Edges'); await clickModelCommand(f.page, 'Inspect', 'Measure');
  await panel().getByText('Click an edge to measure from.', { exact: false }).waitFor();
  await pick([16, 10, 8]); assert.equal(await panel().locator('.measure-item').count(), 0);
  await pick([32, 0, 8]); await panel().getByText('64 mm', { exact: true }).waitFor();
  const from = await panel().locator('.measure-item').first().innerText();
  await panel().getByText('Click an edge to measure to.', { exact: false }).waitFor();
  await f.snapshot('edge-from-' + width);
  await filter('Faces'); await panel().getByText('Click a face to measure to.', { exact: false }).waitFor();
  assert.equal(await panel().locator('.measure-item').first().innerText(), from);
  await filter('Pick all'); await panel().getByText('Click a face, edge, or vertex to measure to.', { exact: true }).waitFor();
  await pick([16, 10, 8]); await panel().locator('.measure-item').nth(1).getByText('Planar face', { exact: true }).waitFor();
  assert.equal(await panel().locator('.measure-item').first().innerText(), from);
  await panel().locator('.kv').filter({ hasText: /^Distance/ }).getByText('0 mm (mesh approximation)', { exact: true }).waitFor();
  await f.snapshot('all-to-' + width);
  await f.page.keyboard.press('Escape'); await panel().waitFor({ state: 'hidden' }); await f.same(doc);
  for (const name of ['Faces', 'Bodies']) {
   await filter(name); await clickModelCommand(f.page, 'Inspect', 'Measure');
   await panel().getByText('Click a face to measure from.', { exact: false }).waitFor();
   await pick([16, 10, 8]); await panel().getByText('Planar face', { exact: true }).waitFor();
   await panel().getByText('Click a face to measure to.', { exact: false }).waitFor();
   await f.snapshot(name.toLowerCase() + '-' + width);
   await button('Done measuring').click(); await panel().waitFor({ state: 'hidden' }); await f.same(doc);
  }
 }
});
