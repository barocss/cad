import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
 nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } } };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
 instances: ['p1', 'p2'].map((id, i) => ({ id, name: 'Synthetic shared block', doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: 'shared', rev: 'A' } })),
 assemblySteps: [{ id: 'mount', name: 'Mount shared blocks', add: ['p1', 'p2'], note: 'Synthetic instruction only' }] };
const f = await createFlow({ name: 'assembly-step-member-selection', envFrozen: 'ASSEMBLY_STEP_MEMBER_SELECTION_FROZEN', output: process.argv[2],
 initialFiles: ['apps/cad-studio/test/assembly-step-member-selection-browser.mjs', 'apps/cad-studio/src/ui/AssemblyStepsPanel.tsx', 'apps/cad-studio/src/app/assemblySteps.ts', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/OutlinerInstances.tsx', 'packages/barocss-cad-model/src/assembly/steps.ts'],
 qualification: 'Public step-member exact occurrence selection, independent Take out, Undo/Redo and native Save/fresh Open.',
 limits: ['Synthetic native documents only. Pattern expansion is model fixture setup, not pattern authoring UI proof.', 'Selection is observed through outliner exact IDs, pressed state and ordinary Inspector coordinates. No pixel-highlight or geometry accuracy claim.', 'History assertions cover Undo/Redo availability and visible rows, not internal stack or dirty state. No delayed callback, nested-path, bearing-specific edit-draft or asynchronous ownership race qualification.'],
 inspectorSource: `import {readFileSync} from 'node:fs';
import {expandPatterns} from '@barocss/cad-model/assembly/patterns';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(expandPatterns(doc)));`
});
const panel = () => f.page.getByRole('complementary', { name: 'Assembly steps panel', exact: true });
const member = id => panel().getByRole('group', { name: 'Parts of this step', exact: true }).locator(`[data-part="${id}"]`);
const selected = () => f.page.locator('.ol.instance.sel[data-browser-instance-path]').evaluateAll(rows => rows.map(r => r.getAttribute('data-browser-instance-path')).sort());
const history = async () => ({ undoEnabled: await f.page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), redoEnabled: await f.page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), rows: await f.page.locator('.history .hs').evaluateAll(rows => rows.map(r => r.textContent)) });
const pick = (id, name = 'Synthetic shared block') => member(id).getByRole('button', { name: `Select step part ${name} (${id})`, exact: true });
async function openSteps() { await f.command('Assembly steps'); await panel().waitFor(); }
async function selectPart(id, doc, x, name = 'Synthetic shared block') {
 const before = await history(); await pick(id, name).click();
 assert.deepEqual(await selected(), [id]); assert.equal(await pick(id, name).getAttribute('aria-pressed'), 'true');
 const inspector = f.page.getByRole('complementary', { name: 'Instance', exact: true }); await inspector.waitFor();
 if (x !== undefined) {
  await inspector.getByText('POSITION · MM', { exact: true }).waitFor();
  await inspector.getByText('ROTATION · ° (X, THEN Y, THEN Z)', { exact: true }).waitFor();
  const axes = inspector.getByRole('spinbutton', { name: 'Instance X', exact: true });
  assert.equal(await axes.count(), 2); assert.deepEqual(await axes.evaluateAll(inputs => inputs.map(i => Number(i.value))), [x, 0]);
 }
 await f.same(doc); assert.deepEqual(await history(), before);
}
async function openSynthetic(doc, name) {
 await f.newPage(); await f.openFile({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(doc)) }, 0);
 await f.ready(); const accepted = await f.doc(); await openSteps(); return accepted;
}
await f.run(async () => {
 f.phase = 'same-name member selection';
 const accepted = await openSynthetic(seed, 'synthetic-step-members.bcad');
 await selectPart('p2', accepted, 15); await selectPart('p1', accepted, 0);
 assert.equal(await pick('p2').getAttribute('aria-pressed'), 'false');
 await f.snapshot('01-exact-p1'); await selectPart('p2', accepted, 15); await f.snapshot('02-exact-p2');
 f.phase = 'ordinary Inspector draft is committed before selecting another member';
 await selectPart('p1', accepted, 0);
 const nameDraft = f.page.getByRole('complementary', { name: 'Instance', exact: true }).getByRole('textbox', { name: 'Instance Name', exact: true });
 await nameDraft.fill('Synthetic edited first block');
 await pick('p2').click();
 const renamed = structuredClone(accepted); renamed.instances[0].name = 'Synthetic edited first block';
 await f.same(renamed);
 const afterBlurSelection = await selected();
 assert.ok(afterBlurSelection.length === 1 && ['p1', 'p2'].includes(afterBlurSelection[0]), 'A blur commit may retire the original selection callback');
 await selectPart('p2', renamed, 15);
 await f.undo(); await f.same(accepted); await selectPart('p2', accepted, 15);
 f.phase = 'Take out is a separate undoable edit';
 await member('p1').getByRole('button', { name: 'Take Synthetic shared block out of this step', exact: true }).click();
 const removed = structuredClone(accepted); removed.assemblySteps[0].add = ['p2'];
 await f.same(removed); assert.equal(await member('p1').count(), 0);
 await f.undo(); await f.same(accepted); await member('p1').waitFor();
 await f.redo(); await f.same(removed); assert.equal(await member('p1').count(), 0);
 await f.undo(); await f.same(accepted); await selectPart('p2', accepted, 15);
 f.phase = 'native Save and fresh Open discard session selection';
 const saved = await f.save('step-members'); assert.deepEqual(saved.doc, accepted);
 await f.freshOpen(saved.file, saved.doc, '03-fresh-open'); assert.deepEqual(await selected(), []);
 await openSteps(); assert.equal(await pick('p1').getAttribute('aria-pressed'), 'false'); assert.equal(await pick('p2').getAttribute('aria-pressed'), 'false');
 await selectPart('p1', saved.doc, 0);
 f.phase = 'hidden member selectable without unhiding; missing member disabled';
 const hidden = structuredClone(seed); hidden.instances[1].hidden = true; hidden.assemblySteps[0].add.push('missing-part');
 const hiddenDoc = await openSynthetic(hidden, 'synthetic-hidden-missing.bcad');
 assert.equal(hiddenDoc.instances[1].hidden, true);
 await selectPart('p2', hiddenDoc, 15);
 assert.equal(await pick('missing-part', 'missing-part').isDisabled(), true);
 assert.deepEqual(await selected(), ['p2']); await f.same(hiddenDoc); await f.snapshot('04-hidden-and-missing');
 f.phase = 'generated pattern occurrence retains exact top-level identity';
 const patternSeed = structuredClone(seed); patternSeed.instances = [patternSeed.instances[0]];
 patternSeed.instancePatterns = [{ id: 'repeat', seed: 'p1', kind: 'linear', dir: [1, 0, 0], count: 2, spacing: 15 }];
 patternSeed.assemblySteps[0].add = ['p1', 'repeat-1'];
 const pattern = await f.inspect('pattern-fixture-setup', patternSeed, 'expand');
 assert.equal(pattern.instances.length, 2); assert.deepEqual(pattern.instances[1].pattern, { id: 'repeat', k: 1 });
 assert.deepEqual(pattern.instances[1].position, [15, 0, 0]);
 const patternDoc = await openSynthetic(pattern, 'synthetic-pattern-member.bcad');
 assert.deepEqual(patternDoc.instances[1].pattern, { id: 'repeat', k: 1 });
 await selectPart('repeat-1', patternDoc, undefined, patternDoc.instances[1].name);
 const inspector = f.page.getByRole('complementary', { name: 'Instance', exact: true });
 await inspector.getByText('Placed by its pattern: move or hide the seed, or edit the pattern (Skip leaves this one out).', { exact: true }).waitFor();
 assert.equal(await inspector.getByRole('spinbutton', { name: 'Instance X', exact: true }).count(), 0);
 await f.same(patternDoc); await f.snapshot('05-pattern-exact-id');
 f.report.observations.push({ sameNameExactID: true, inspectorPositionRotationX: true, selectedPressedState: true, selectionDoesNotEditDocumentOrHistoryAvailability: true, ordinaryNameDraftBlurCommitAndUndo: true, separateTakeOutUndoRedo: true, nativeSaveFreshOpen: true, selectionSessionNotRestored: true, hiddenSelectedNotUnhidden: true, missingDisabled: true, generatedPatternExactID: true, patternAuthoredThroughUI: false });
});
