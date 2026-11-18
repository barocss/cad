import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
 nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } } };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
 instances: ['p1', 'p2'].map((id, i) => ({ id, name: 'Synthetic shared block', doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: 'shared', rev: 'A' } })),
 assemblySteps: [{ id: 'mount', name: 'Mount shared blocks', add: ['p1', 'p2'], note: 'Synthetic instruction only' }] };
const f = await createFlow({ name: 'assembly-step-member-selection-baseline', envFrozen: 'ASSEMBLY_STEP_MEMBER_SELECTION_BASELINE_FROZEN', output: process.argv[2],
 initialFiles: ['apps/cad-studio/test/assembly-step-member-selection-baseline-browser.mjs', 'apps/cad-studio/src/ui/AssemblyStepsPanel.tsx', 'apps/cad-studio/src/app/assemblySteps.ts', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/OutlinerInstances.tsx', 'packages/barocss-cad-model/src/assembly/steps.ts'],
 qualification: 'Pre-change baseline: step member labels cannot select an exact occurrence; public outliner selection is the positive control.',
 limits: ['Synthetic same-name, same-definition two-occurrence top-level assembly only.', 'No completed list-selection feature claim. Baseline intentionally fails once selectable member controls exist.', 'Outliner DOM and Instance coordinate inputs verify selection; no viewport picking or independent pixel-highlight claim.', 'Whole accepted document and Undo/Redo availability checked, not private history stack internals or geometry accuracy. No motion, nested, pattern or stale callback qualification.'] });
const panel = () => f.page.getByRole('complementary', { name: 'Assembly steps panel', exact: true });
const member = id => panel().getByRole('group', { name: 'Parts of this step', exact: true }).locator(`[data-part="${id}"]`);
const selected = () => f.page.locator('.ol.instance.sel[data-browser-instance-path]').evaluateAll(rows => rows.map(r => r.getAttribute('data-browser-instance-path')).sort());
const history = async () => ({ undoEnabled: await f.page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), redoEnabled: await f.page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), rows: await f.page.locator('.history .hs').evaluateAll(rows => rows.map(r => r.textContent)) });
async function outliner(id, x) {
 await f.page.locator(`[data-browser-instance-path="${id}"]`).click();
 assert.deepEqual(await selected(), [id]);
 const inspector = f.page.getByRole('complementary', { name: 'Instance', exact: true }); await inspector.waitFor();
 await inspector.getByText('POSITION · MM', { exact: true }).waitFor();
 await inspector.getByText('ROTATION · ° (X, THEN Y, THEN Z)', { exact: true }).waitFor();
 const axes = inspector.getByRole('spinbutton', { name: 'Instance X', exact: true });
 assert.equal(await axes.count(), 2, 'Position and rotation each have an X input');
 assert.deepEqual(await axes.evaluateAll(inputs => inputs.map(input => Number(input.value))), [x, 0], 'InstancePanel renders position before rotation');
}
async function clickLabel(id) {
 const row = member(id); await row.scrollIntoViewIfNeeded();
 // Click the left text area, not its separate right-hand destructive Take out button.
 await row.click({ position: { x: 6, y: 7 } });
}
await f.run(async () => {
 await f.newPage(); await f.openFile({ name: 'synthetic-step-member-selection.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 0); await f.ready();
 const accepted = await f.doc(), originalHistory = await history();
 await f.command('Assembly steps'); await panel().waitFor();
 assert.deepEqual(await panel().getByRole('group', { name: 'Parts of this step', exact: true }).locator('[data-part]').evaluateAll(rows => rows.map(r => r.getAttribute('data-part'))), ['p1', 'p2']);
 for (const id of ['p1', 'p2']) {
   const buttons = member(id).getByRole('button'); assert.equal(await buttons.count(), 1);
   assert.equal(await buttons.first().getAttribute('aria-label'), 'Take Synthetic shared block out of this step');
   assert.equal(await member(id).locator('a, input, [role="button"], [tabindex]').count(), 0);
 }
 await outliner('p2', 15); await f.same(accepted); assert.deepEqual(await history(), originalHistory);
 await clickLabel('p1'); assert.deepEqual(await selected(), ['p2']); await f.same(accepted); assert.deepEqual(await history(), originalHistory);
 await f.snapshot('01-p1-label-does-not-select');
 await outliner('p1', 0); await f.same(accepted); assert.deepEqual(await history(), originalHistory);
 await clickLabel('p2'); assert.deepEqual(await selected(), ['p1']); await f.same(accepted); assert.deepEqual(await history(), originalHistory);
 await f.snapshot('02-p2-label-does-not-select');
 f.report.observations.push({ sameNameAndDefinition: true, listMembers: ['p1', 'p2'], listHasOnlyTakeOutButtons: true, labelClicksDoNotChangeSelection: true, outlinerExactIDPositiveControl: true, inspectorXPositiveControl: [15, 0], acceptedDocumentExact: true, undoRedoAvailabilityUnchanged: true });
});
