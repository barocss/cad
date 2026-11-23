import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/src/App.tsx',
  'apps/cad-studio/src/sketch/useTwoPointSnap.ts',
  'apps/cad-studio/src/sketch/TwoPointSnapControls.tsx',
  'apps/cad-studio/src/ui/StudioTopBar.tsx',
  'apps/cad-studio/src/ui/useWorkspaceModeExit.tsx',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts',
];
const f = await createFlow({
  name: 'two-point-snap-project-open', output: process.argv[2], envFrozen: 'D1816_SOURCE_FROZEN',
  initialFiles: pins, requiredFrozen: pins,
  qualification: 'Check the pending rectangle snap across sketch Undo, confirmed New part and Project Open.',
  limits: ['Desktop Chrome WebGPU and a browser-owned OPFS project. Project controls are available in Model mode.'],
  snapshotExtra: () => ({
    formText: document.querySelector('form[aria-label="Two-point snap"]')?.textContent ?? null,
    marker: !![...document.querySelectorAll('.vp-overlay .sk-osnap')].find(el => el.textContent === 'Calculated'),
  }),
});
const empty = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0 };
const target = { ...empty, parameters: { SnapProjectTarget: 17 } };
const name = 'Snap project target.bcad', projectName = 'D1816 ' + randomUUID();
const button = (name, scope = f.page) => scope.getByRole('button', { name, exact: true });
const panel = () => f.page.getByRole('complementary', { name: 'Versions panel', exact: true });
const form = () => f.page.getByRole('form', { name: 'Two-point snap', exact: true });
const marker = () => f.page.locator('.vp-overlay .sk-osnap').filter({ hasText: 'Calculated' });
const prompt = () => f.page.getByRole('dialog', { name: 'Discard sketch changes?', exact: true });

async function openProject() {
  if (!(await panel().isVisible())) await button('Project and versions').click();
  if (!(await panel().getByLabel('Project', { exact: true }).isVisible())) {
    await panel().getByRole('textbox', { name: 'Browser project name', exact: true }).fill(projectName);
    await button('Project in this browser', panel()).click();
    await panel().getByLabel('Project', { exact: true }).waitFor();
  }
}

async function arm() {
  await button('Two-point snap', f.sketchPanel()).click();
  await f.worldClick([0, 0]);
  await f.worldClick([31, 13]);
  await form().getByLabel('Snap value').fill('0.25');
  await form().getByRole('status').getByText('Point 7.75, 3.25 mm', { exact: true }).waitFor();
  await marker().waitFor();
}

await f.run(async () => {
  f.phase = 'Save an authored target in a browser project';
  await f.newPage();
  await f.openFile({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(target)) }, 0);
  await f.same(target);
  await openProject();
  await button('Save').click();
  await panel().getByRole('list', { name: 'Project documents', exact: true }).getByText(name, { exact: true }).waitFor();
  await button('Project and versions').click();

  f.phase = 'Create a construction line and calculate one corner';
  await button('Sketch', f.page.locator('.mode')).click();
  await f.sketchPanel().waitFor();
  await f.frame([[0, 0], [31, 13]]);
  await f.tool('Line', 'l');
  await f.page.keyboard.press('x');
  await f.worldClick([0, 0]);
  await f.worldClick([31, 13]);
  await f.page.keyboard.press('x');
  await f.tool('Rectangle', 'r');
  await arm();
  await f.same(target);
  await button('Project and versions').click();
  assert.equal(await panel().isVisible(), false);
  await marker().waitFor();
  await f.same(target);
  const pending = await f.snapshot('01-project-controls-inactive-during-pending-snap');

  f.phase = 'Keep the original pending snap when New part is canceled';
  await button('New part').click();
  await prompt().waitFor();
  await f.snapshot('02-new-part-confirmation');
  await button('Keep editing', prompt()).click();
  await prompt().waitFor({ state: 'hidden' });
  assert.equal(await form().textContent(), pending.formText);
  await marker().waitFor();
  await f.same(target);
  await f.snapshot('03-keep-editing-retains-preview');

  f.phase = 'Undo the selected construction and confirm the next calculation wins';
  await f.undo();
  await form().waitFor({ state: 'hidden' });
  await marker().waitFor({ state: 'hidden' });
  await f.same(target);
  await f.snapshot('04-sketch-undo-clears-snap');
  await f.redo();
  await f.tool('Rectangle', 'r');
  await arm();

  f.phase = 'Discard the active sketch and reopen the saved Project file';
  await button('New part').click();
  await prompt().waitFor();
  await button('Discard changes', prompt()).click();
  await f.sketchPanel().waitFor({ state: 'hidden' });
  await form().waitFor({ state: 'hidden' });
  await marker().waitFor({ state: 'hidden' });
  await f.page.waitForFunction(() => !window.__studioDoc?.parameters?.SnapProjectTarget);
  await f.snapshot('05-new-part-clears-snap');
  await openProject();
  await button('Open ' + name, panel()).click();
  await f.same(target);
  assert.equal(await form().count(), 0);
  await marker().waitFor({ state: 'hidden' });
  await f.snapshot('06-project-open-preserves-saved-target-only');
  assert.deepEqual(f.report.downloads, []);
});
