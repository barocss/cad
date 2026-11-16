import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['apps/cad-studio/src/ui/Hud.tsx', 'apps/cad-studio/src/app/draftNeutralFeedback.ts'];
const reason = 'Choose Body end under Neutral plane to place it at the start of the pull. Your selected faces and saved model are unchanged.';
const f = await createFlow({ name: 'draft-neutral-recovery', output: process.argv[2], envFrozen: 'DRAFT_NEUTRAL_FROZEN', initialFiles: pins, requiredFrozen: pins,
 qualification: 'Adjacent Draft neutral refusal preserves the model and recovers in its history editor.', limits: ['Two-face Draft box, desktop WebGPU; no tilted-hole geometry expansion or assistive-device test.'],
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
  await f.openFeatureEditor(2, 'Draft'); await button('Edit draft', f.editor()).click();
  const edit = hud('Edit Draft');
  await edit.getByLabel('Neutral plane', { exact: true }).selectOption('fixed'); await preview(edit);
  assert.equal(await edit.getByLabel('Neutral coordinate', { exact: true }).inputValue(), '20');
  for (const value of ['21', '22']) {
    await edit.getByLabel('Neutral coordinate', { exact: true }).fill(value);
    await edit.getByText(reason, { exact: true }).waitFor();
    assert.equal(await edit.getByLabel('Neutral coordinate', { exact: true }).getAttribute('aria-invalid'), 'true');
    assert.equal(await edit.getByLabel('Neutral coordinate', { exact: true }).getAttribute('aria-describedby'), 'hud-draft-neutral');
    assert.equal(await button('Apply', edit).isDisabled(), true); await f.same(source);
    assert.equal(await edit.getByText(reason, { exact: true }).count(), 1);
  }
  await f.snapshot('refusal-' + width);
  await edit.getByLabel('Neutral plane', { exact: true }).selectOption('auto');
  await edit.getByLabel('Angle', { exact: true }).fill('-12'); await preview(edit);
  assert.equal(await edit.getByText(reason, { exact: true }).count(), 0);
  await button('Apply', edit).click(); await f.changed(source); const doc = await f.doc();
  const result = await f.inspect('recovered-' + width, doc); assert.ok(result.valid); assert.ok(Math.abs(result.volume - 5395.820148444084) < 1e-7);
  assert.deepEqual(doc.nodes[2].faces, source.nodes[2].faces);
  await f.undo(); await f.same(source); await f.redo(); await f.same(doc);
  const saved = await f.save('neutral-recovered-' + width); await f.freshOpen(saved.file, doc, 'reopened-' + width);
  await f.openFeatureEditor(2, 'Draft after Open'); await button('Edit draft', f.editor()).click();
  const again = hud('Edit Draft'); await again.getByLabel('Neutral plane', { exact: true }).selectOption('fixed');
  await again.getByLabel('Neutral coordinate', { exact: true }).fill('21'); await again.getByText(reason, { exact: true }).waitFor();
  await button('Cancel', again).click(); await f.same(doc); await f.snapshot('cancel-' + width);
  f.report.observations.push({ width, volume: result.volume });
 }
});
