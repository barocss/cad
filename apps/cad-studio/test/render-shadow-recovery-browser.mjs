import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['apps/cad-studio/src/ui/RenderPanel.tsx', 'apps/cad-studio/src/ui/renderShadowHint.ts'];
const f = await createFlow({ name: 'render-shadow-recovery', output: process.argv[2], envFrozen: 'SHADOW_RECOVERY_FROZEN', initialFiles: pins, requiredFrozen: pins,
 qualification: 'Point Shadow conflicts identify the active light at the failed input and preserve accepted settings.', limits: ['Desktop WebGPU settings UI; no shadow-pixel correctness oracle or path-tracing run.'] });
const button = name => f.page.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Render', exact: true });
const shadow = n => panel().getByRole('checkbox', { name: `Light ${n} shadow`, exact: true });
const radius = n => panel().getByLabel(`Light ${n} shadow radius mm`, { exact: true });
const reason = 'Point 3 already casts shadows. Turn off Shadow on Point 3, then enable Shadow on Point 4.';
async function openLights() { await f.page.getByRole('group', { name: 'Mode', exact: true }).getByRole('button', { name: 'Render', exact: true }).click(); await panel().getByRole('tab', { name: 'Lights', exact: true }).click(); }
async function conflict(doc, label) {
 await shadow(4).focus(); await shadow(4).press('Space');
 await panel().getByRole('alert').getByText(reason, { exact: true }).waitFor();
 assert.equal(await shadow(4).isChecked(), false); assert.equal(await shadow(4).evaluate(el => el === document.activeElement), true);
 assert.equal(await shadow(4).getAttribute('aria-invalid'), 'true');
 const id = await shadow(4).getAttribute('aria-describedby'); assert.ok(id); assert.equal(await f.page.locator(`[id="${id}"]`).innerText(), reason);
 assert.equal(await panel().getByRole('alert').count(), 1); await f.same(doc); await f.snapshot(label);
}
await f.run(async () => {
 for (const width of [1024, 1440]) {
  await f.newPage(); await f.page.setViewportSize({ width, height: 900 }); await openLights();
  await button('Add point').click(); await radius(3).waitFor(); await button('Add point').click(); await radius(4).waitFor();
  assert.equal(await radius(4).inputValue(), ''); await panel().getByText('Uses the default radius (0 mm) when Shadow is on.', { exact: true }).first().waitFor();
  await shadow(3).check(); const defaultDoc = await f.doc(); await conflict(defaultDoc, 'default-conflict-' + width);
  await radius(4).fill('2'); await f.page.waitForFunction(() => window.__studioDoc.render?.lights[3].shadowRadius === 2);
  await panel().getByText('Saved radius 2 mm is kept while Shadow is off.', { exact: true }).waitFor();
  const before = await f.doc(); await conflict(before, 'saved-conflict-' + width);
  if (width === 1024) { await panel().getByLabel('Render method', { exact: true }).selectOption('path-tracing'); await conflict(before, 'path-settings-conflict'); }
  await shadow(3).uncheck(); assert.equal(await shadow(4).getAttribute('aria-invalid'), 'false'); await shadow(4).check();
  const accepted = await f.doc(); assert.equal(accepted.render.lights[2].castShadow, false); assert.equal(accepted.render.lights[3].castShadow, true); assert.equal(accepted.render.lights[3].shadowRadius, 2);
  await f.undo(); assert.equal(!!(await f.doc()).render.lights[3].castShadow, false); await f.redo(); await f.same(accepted);
  const saved = await f.save('shadow-recovery-' + width); await f.newPage(); await f.openFile(saved.file, accepted.nodes.length); assert.deepEqual(await f.doc(), accepted); await f.snapshot('reopened-' + width);
  await openLights(); assert.equal(await shadow(4).isChecked(), true); assert.equal(await radius(4).inputValue(), '2');
  await shadow(4).uncheck(); await shadow(3).check(); const active = await f.doc(); await conflict(active, 'repeat-' + width);
  await panel().getByRole('button', { name: 'Remove light 3', exact: true }).click();
  assert.equal(await panel().getByRole('alert').count(), 0); assert.equal(await radius(3).inputValue(), '2');
  f.report.observations.push({ width, preservedRadius: 2, conflictLabel: 'Point 3', repeatedAfterReopen: true });
 }
});
