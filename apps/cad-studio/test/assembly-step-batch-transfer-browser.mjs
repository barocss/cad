import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';

// Set ASSEMBLY_STEP_BATCH_TRANSFER_MODE=baseline only against the frozen pre-change source.
const mode = process.env.ASSEMBLY_STEP_BATCH_TRANSFER_MODE ?? 'actual';
assert.ok(['actual', 'baseline'].includes(mode), 'explicit supported fixture mode');
const base = JSON.parse(await readFile(new URL('./fixtures/assembly-steps.bcad', import.meta.url), 'utf8'));
base.assemblySteps = [
  { id: 'mount', name: 'Mount blocks', add: ['b1', 'b2'], note: 'Install the support blocks', explode: 0.5 },
  { id: 'finish', name: 'Fit post and cap', add: mode === 'baseline' ? ['post', 'cap'] : ['post'], note: 'Finish the assembly' },
];
const f = await createFlow({
  name: 'assembly-step-batch-transfer', envFrozen: 'ASSEMBLY_STEP_BATCH_TRANSFER_FROZEN', output: process.argv[2],
  qualification: mode === 'actual' ? 'Public mixed batch instruction-step transfer, atomic Undo/Redo and native Save/Open with unchanged physical assembly.' : 'Pre-change baseline: real additive top-level selection has no explicit batch step-transfer action; Add selected refuses without changing the document.',
  initialFiles: [
    'apps/cad-studio/test/assembly-step-batch-transfer-browser.mjs',
    'apps/cad-studio/test/assembly-step-transfer-browser.mjs',
    'apps/cad-studio/test/fixtures/assembly-steps.bcad',
    'apps/cad-studio/src/App.tsx',
    'apps/cad-studio/src/app/assemblySteps.ts',
    'apps/cad-studio/src/ui/AssemblyStepsPanel.tsx',
    'apps/cad-studio/src/ui/OutlinerInstances.tsx',
    'packages/barocss-cad-model/src/assembly/steps.ts',
  ],
  limits: [
    mode === 'baseline' ? 'Baseline-only, not evidence of a completed batch transfer feature.' : 'Mixed already-target, unassigned and other-step members; single-part transfer is a positive control.',
    'Synthetic native assembly; exact top-level occurrences selected by public outliner clicks with Meta.',
    'History comparison covers the complete accepted document history field, visible history rows, and Undo/Redo availability, not private history-stack internals.',
    'No motion, collision, manufacturing, nested occurrence or new file-schema qualification.',
  ],
});
const panel = () => f.page.getByRole('complementary', { name: 'Assembly steps panel', exact: true });
const button = name => panel().getByRole('button', { name, exact: true });
const row = id => f.page.locator(`[data-browser-instance-path="${id}"]`);
const selected = () => f.page.locator('.ol.instance.sel[data-browser-instance-path]').evaluateAll(xs => xs.map(x => x.getAttribute('data-browser-instance-path')).sort());
const members = () => panel().getByRole('group', { name: 'Parts of this step', exact: true }).locator('[data-part]').evaluateAll(xs => xs.map(x => x.getAttribute('data-part')));
async function history() {
  return {
    rows: await f.page.locator('.history .hs').evaluateAll(xs => xs.map(x => ({ label: x.getAttribute('aria-label'), text: x.textContent }))),
    undoEnabled: await f.page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(),
    redoEnabled: await f.page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(),
  };
}
async function noTransferOffer() {
  assert.equal(await button('Go to its step').count(), 0);
  assert.equal(await button('Move selected part to this step').count(), 0);
  assert.equal(await button('Move selected parts to this step').count(), 0);
}
await f.run(async () => {
  f.phase = 'Open synthetic assembly';
  await f.newPage();
  await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'step-batch-transfer.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(base)) });
  await f.page.waitForFunction(() => window.__studioDoc?.assemblySteps?.[0]?.id === 'mount');
  await f.ready();
  const original = await f.doc(), originalHistory = await history();
  if (mode === 'actual') {
    await f.command('Assembly steps'); await panel().waitFor();
    await button('Next step').click();
    assert.deepEqual(await members(), ['post']);
    await row('b2').click(); await button('Go to its step').waitFor();
    await row('post').click({ modifiers: ['Meta'] });
    await row('cap').click({ modifiers: ['Meta'] });
    assert.deepEqual(await selected(), ['b2', 'cap', 'post']);
    assert.equal(await button('Go to its step').count(), 0);
    assert.equal(await button('Move selected part to this step').count(), 0);
    await button('Move selected parts to this step').waitFor();
    await f.same(original); assert.deepEqual(await history(), originalHistory);
    await f.snapshot('01-mixed-batch-selected');
    f.phase = 'Add selected refuses the complete mixed batch';
    await button('Add selected parts to this step').click();
    await f.page.getByText('Step not changed', { exact: true }).waitFor();
    await f.same(original); assert.deepEqual(await history(), originalHistory);
    assert.deepEqual(await members(), ['post']);
    await f.snapshot('02-mixed-add-refused');
    await f.page.getByRole('button', { name: 'Dismiss', exact: true }).click();
    assert.deepEqual(await selected(), ['b2', 'cap', 'post']);
    f.phase = 'One explicit batch transfer';
    await button('Move selected parts to this step').click();
    await f.changed(original); const moved = await f.doc();
    assert.deepEqual(moved.assemblySteps.map(s => s.add), [['b1'], ['post', 'b2', 'cap']]);
    const withoutMembership = d => ({ ...d, assemblySteps: d.assemblySteps.map(({ add, ...rest }) => rest) });
    assert.deepEqual(withoutMembership(moved), withoutMembership(original), 'only instruction-step membership changes');
    assert.deepEqual(moved.nodes, original.nodes);
    assert.deepEqual(moved.instances, original.instances);
    assert.deepEqual(moved.mates, original.mates);
    assert.deepEqual(await members(), ['post', 'b2', 'cap']);
    await noTransferOffer(); await f.snapshot('03-batch-transferred');
    await f.undo(); await f.same(original); assert.deepEqual(await members(), ['post']);
    await f.redo(); await f.same(moved); assert.deepEqual(await members(), ['post', 'b2', 'cap']);
    await f.snapshot('04-batch-redone');
    // Existing single-part navigation and transfer still operate independently.
    await row('b1').click(); await button('Go to its step').click();
    assert.deepEqual(await members(), ['b1']);
    await button('Next step').click();
    await button('Move selected part to this step').click();
    await f.changed(moved); const single = await f.doc();
    assert.deepEqual(single.assemblySteps.map(s => s.add), [[], ['post', 'b2', 'cap', 'b1']]);
    assert.deepEqual(withoutMembership(single), withoutMembership(original));
    await f.undo(); await f.same(moved);
    f.phase = 'Native Save and same-context Open clear the previous selection';
    const saved = await f.save('batch-transferred-assembly-step');
    assert.deepEqual(saved.doc, moved);
    assert.deepEqual(await selected(), ['b1']);
    await f.page.locator('input[aria-label="Model file"]').setInputFiles(saved.file);
    await f.page.waitForFunction(() => document.querySelectorAll('.ol.instance.sel[data-browser-instance-path]').length === 0);
    await f.same(moved); assert.deepEqual(await selected(), []);
    await f.snapshot('05-same-context-open-selection-cleared');
    await f.freshOpen(saved.file, saved.doc, '06-native-fresh-open');
    assert.deepEqual(await selected(), []);
    await f.command('Assembly steps'); await panel().waitFor();
    assert.deepEqual(await members(), ['b1']);
    await button('Next step').click();
    assert.deepEqual(await members(), ['post', 'b2', 'cap']);
    await noTransferOffer(); await f.same(moved);
    await f.snapshot('07-persisted-membership');
    f.report.observations.push({ mode: 'ACTUAL', selectedInstanceIds: ['b2', 'cap', 'post'], sourceMembership: [['b1', 'b2'], ['post']], targetMembership: [['b1'], ['post', 'b2', 'cap']], addSelectedRefusedAtomically: true, oneUndoRestoresWholeBatch: true, redoExact: true, onlyMembershipChanged: true, singleTransferAndGoControl: true, sameContextOpenClearsSelection: true, nativeSaveFreshOpen: true });
    return;
  }

  await f.command('Assembly steps'); await panel().waitFor();
  await button('Next step').click();
  assert.deepEqual(await members(), ['post', 'cap']);
  f.phase = 'Select both already-assigned blocks through public outliner';
  await row('b1').click();
  await button('Go to its step').waitFor();
  await row('b2').click({ modifiers: ['Meta'] });
  assert.deepEqual(await selected(), ['b1', 'b2']);
  await noTransferOffer();
  await f.same(original); assert.deepEqual(await history(), originalHistory);
  await f.snapshot('01-baseline-selected-batch');
  f.phase = 'Existing Add selected refuses atomically';
  await button('Add selected parts to this step').click();
  await f.page.getByText('Step not changed', { exact: true }).waitFor();
  await f.same(original);
  assert.deepEqual(await history(), originalHistory);
  assert.deepEqual(await selected(), ['b1', 'b2']);
  assert.deepEqual(await members(), ['post', 'cap']);
  await noTransferOffer();
  await f.snapshot('02-baseline-add-refused');
  await f.page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await f.same(original); assert.deepEqual(await history(), originalHistory);
  f.report.observations.push({
    mode: 'BASELINE_ONLY', selectedInstanceIds: ['b1', 'b2'], targetStep: 'finish',
    sourceMembership: [['b1', 'b2'], ['post', 'cap']], noSingleOrBatchTransferOffer: true,
    addSelectedRefused: true, fullAcceptedDocumentUnchanged: true,
    visibleHistoryAndUndoRedoAvailabilityUnchanged: true,
  });
});
