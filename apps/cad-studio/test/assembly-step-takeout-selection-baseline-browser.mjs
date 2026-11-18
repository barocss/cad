import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';

// Baseline of existing single-member editing, not a core atomic-edit defect.
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } } };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: 'Synthetic shared block', doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: 'shared', rev: 'A' } })),
  assemblySteps: [
    { id: 'base', name: 'Mount first block', add: ['p1'], note: 'Synthetic first instruction', explode: .25 },
    { id: 'finish', name: 'Mount remaining blocks', add: ['p2', 'p3'], note: 'Synthetic second instruction', explode: .5 },
  ] };
const pins = ['apps/cad-studio/test/assembly-step-takeout-selection-baseline-browser.mjs', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/AssemblyStepsPanel.tsx', 'apps/cad-studio/src/ui/OutlinerInstances.tsx', 'apps/cad-studio/src/app/assemblySteps.ts', 'packages/barocss-cad-model/src/assembly/steps.ts'];
const f = await createFlow({ name: 'assembly-step-takeout-selection-baseline', envFrozen: 'ASSEMBLY_STEP_TAKEOUT_SELECTION_BASELINE_FROZEN', output: process.argv[2], initialFiles: pins, requiredFrozen: pins,
  qualification: 'Existing public single-member Take out requires two explicit edits for two selected members; one Undo restores only the last removal. This observes a missing batch UI, not a core atomicity defect.',
  limits: ['Synthetic same-name shared-definition top-level occurrences only; public outliner Meta selection on Mac.', 'No new batch feature or automatic order inference is qualified. Existing core supports an atomic membership replacement.', 'Two edit boundaries are established by accepted document transitions and public Undo/Redo, not a private history-stack length.', 'Only instruction membership is edited. Complete accepted source outside membership is compared, not independent evaluated geometry or mass.', 'No nested, pattern, stale callback, native Save/Open or external MCP qualification.'] });
const panel = () => f.page.getByRole('complementary', { name: 'Assembly steps panel', exact: true });
const membersGroup = () => panel().getByRole('group', { name: 'Parts of this step', exact: true });
const members = () => membersGroup().locator('[data-part]').evaluateAll(xs => xs.map(x => x.getAttribute('data-part')));
const selected = () => f.page.locator('.ol.instance.sel[data-browser-instance-path]').evaluateAll(xs => xs.map(x => x.getAttribute('data-browser-instance-path')).sort());
const take = id => membersGroup().locator(`[data-part="${id}"]`).getByRole('button', { name: 'Take Synthetic shared block out of this step', exact: true });
const history = async () => ({
  rows: await f.page.locator('.history .hs').evaluateAll(xs => xs.map(x => x.textContent)),
  undo: await f.page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(),
  redo: await f.page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(),
});
const withoutMembership = doc => ({ ...doc, assemblySteps: doc.assemblySteps.map(({ add, ...rest }) => rest) });
function membershipOnly(doc, original, expected) {
  assert.deepEqual(doc.assemblySteps.map(step => step.add), expected);
  assert.deepEqual(withoutMembership(doc), withoutMembership(original), 'all document fields except instruction membership preserved');
  for (const key of ['nodes', 'outputs', 'parameters', 'instances', 'mates']) assert.deepEqual(doc[key], original[key], key);
}
async function expectMembers(expected) {
  await f.page.waitForFunction(({ expected }) => {
    const group = document.querySelector('[aria-label="Parts of this step"]');
    return group && JSON.stringify([...group.querySelectorAll('[data-part]')].map(x => x.getAttribute('data-part'))) === JSON.stringify(expected);
  }, { expected });
  assert.deepEqual(await members(), expected);
}
await f.run(async () => {
  f.phase = 'Open synthetic three-occurrence assembly';
  await f.newPage(); await f.openFile({ name: 'synthetic-step-takeout.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 0);
  await f.page.waitForFunction(() => window.__studioDoc?.assemblySteps?.[1]?.id === 'finish' && window.__studioDoc?.instances?.length === 3);
  await f.ready();
  const original = await f.doc(), before = await history();
  assert.deepEqual(original.assemblySteps.map(s => s.add), [['p1'], ['p2', 'p3']]);
  await f.command('Assembly steps'); await panel().waitFor();
  await panel().getByRole('button', { name: 'Go to step 2: Mount remaining blocks', exact: true }).click();
  await expectMembers(['p2', 'p3']);
  f.phase = 'Select two exact current-step occurrences';
  await f.page.locator('[data-browser-instance-path="p2"]').click();
  await f.page.locator('[data-browser-instance-path="p3"]').click({ modifiers: ['Meta'] });
  assert.deepEqual(await selected(), ['p2', 'p3']);
  assert.equal(await take('p2').count(), 1); assert.equal(await take('p3').count(), 1);
  const labels = await panel().getByRole('button').evaluateAll(xs => xs.map(x => ({ aria: x.getAttribute('aria-label'), text: x.textContent })));
  assert.equal(labels.filter(x => /(?:take|remove).*selected.*(?:out|step)|selected.*(?:take out|remove)/i.test(`${x.aria ?? ''} ${x.text ?? ''}`)).length, 0, 'no selected-members Take out UI');
  assert.equal(labels.filter(x => /^Take .* out of this step$/.test(x.aria ?? '')).length, 2, 'existing removal controls are the two individual member chips');
  await f.same(original); assert.deepEqual(await history(), before);
  await f.snapshot('01-two-selected-single-controls');
  f.phase = 'Existing single Take out p2';
  await take('p2').click(); await f.changed(original); await expectMembers(['p3']);
  const first = await f.doc(); membershipOnly(first, original, [['p1'], ['p3']]);
  await f.snapshot('02-first-single-removal');
  f.phase = 'Existing single Take out p3';
  await take('p3').click(); await f.changed(first); await expectMembers([]);
  const second = await f.doc(); membershipOnly(second, original, [['p1'], []]);
  await f.snapshot('03-second-single-removal');
  f.phase = 'One Undo restores only the last removal';
  await f.undo(); await f.same(first); await expectMembers(['p3']);
  assert.notDeepEqual(await f.doc(), original);
  await f.snapshot('04-one-undo-restores-only-p3');
  f.phase = 'Second Undo restores original membership';
  await f.undo(); await f.same(original); await expectMembers(['p2', 'p3']);
  f.phase = 'Redo controls reproduce each separate membership edit';
  await f.redo(); await f.same(first); await expectMembers(['p3']);
  await f.redo(); await f.same(second); await expectMembers([]);
  await f.undo(); await f.undo(); await f.same(original); await expectMembers(['p2', 'p3']);
  await f.snapshot('05-original-restored');
  f.report.observations.push({ mode: 'BASELINE_ONLY', selectedIds: ['p2', 'p3'], selectedByPublicOutliner: true, currentStep: 'finish', repeatedDefinitionDistinctOccurrences: true,
    selectedTakeoutControlAbsent: true, individualTakeoutControls: 2, twoExplicitMembershipEdits: true, oneUndoRestoresOnlyLastRemoval: true, secondUndoRestoresOriginal: true,
    redoEachEditExact: true, finalDocumentExactOriginal: true, onlyInstructionMembershipChanged: true, noCoreAtomicityDefectClaim: true, nativeSaveFreshOpen: 'NOT_RUN' });
});
