import assert from 'node:assert/strict';
import { statfs } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';

// Exact public batch membership removal and separate pending text commits.
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } } };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
  instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: 'Synthetic shared block', doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: 'shared', rev: 'A' } })),
  assemblySteps: [
    { id: 'base', name: 'Mount first block', add: ['p1'], note: 'Synthetic first instruction', explode: .25 },
    { id: 'finish', name: 'Mount remaining blocks', add: ['p2', 'p3'], note: 'Synthetic second instruction', explode: .5 },
  ] };
const pins = ['apps/cad-studio/test/assembly-step-takeout-selection-browser.mjs', 'apps/cad-studio/src/App.tsx', 'apps/cad-studio/src/ui/AssemblyStepsPanel.tsx', 'apps/cad-studio/src/ui/OutlinerInstances.tsx', 'apps/cad-studio/src/app/assemblySteps.ts', 'packages/barocss-cad-model/src/assembly/steps.ts'];
const f = await createFlow({ name: 'assembly-step-takeout-selection', envFrozen: 'ASSEMBLY_STEP_TAKEOUT_SELECTION_FROZEN', output: process.argv[2], initialFiles: pins, requiredFrozen: pins,
  qualification: 'Explicit exact-ID selected-members Take out is one undoable membership edit; mixed selections and pending text drafts cannot be silently filtered or committed.',
  limits: ['Synthetic same-name top-level occurrences; public Mac Meta selection. No nested/pattern/stale callback race qualification.', 'Accepted document outside membership is compared, not an independent geometry/mass oracle.', 'One edit boundary is established by Undo/Redo, not private history-stack inspection. Native Save/fresh Open checks the whole accepted document.'] });
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
const batch=()=>panel().getByRole('button',{name:'Take selected parts out of this step',exact:true});
async function selectIds(ids){for(let i=0;i<ids.length;i++)await f.page.locator(`[data-browser-instance-path="${ids[i]}"]`).click(i?{modifiers:['Meta']}:{});assert.deepEqual(await selected(),[...ids].sort());}
async function pendingPointer(field,doc,priorHistory){
 const text=await field.inputValue();assert.equal(await field.evaluate(e=>document.activeElement===e),true);
 await batch().scrollIntoViewIfNeeded();const box=await batch().boundingBox();assert.ok(box);
 const point=[box.x+box.width/2,box.y+box.height/2];
 assert.equal(await batch().evaluate((e,[x,y])=>{const hit=document.elementFromPoint(x,y);return e.disabled && getComputedStyle(e).pointerEvents==='none' && hit===e.parentElement;},point),true,'pointer reaches the exact disabled-control wrapper');
 await f.page.mouse.click(...point);
 assert.equal(await field.inputValue(),text);assert.equal(await field.evaluate(e=>document.activeElement===e),true);
 assert.equal(await batch().isDisabled(),true);await f.same(doc);assert.deepEqual(await history(),priorHistory);
}
async function goFinish(name='Mount remaining blocks'){await panel().getByRole('button',{name:'Go to step 2: '+name,exact:true}).click();}
await f.run(async()=>{
 const disk=await statfs(process.argv[2]);assert.ok(disk.bavail*disk.bsize>=2*1024**3);
 await f.newPage();await f.openFile({name:'synthetic-step-takeout.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))},0);
 await f.page.waitForFunction(()=>window.__studioDoc?.assemblySteps?.[1]?.id==='finish'&&window.__studioDoc?.instances?.length===3);await f.ready();
 const original=await f.doc();assert.deepEqual(original.assemblySteps.map(s=>s.add),[['p1'],['p2','p3']]);
 await f.command('Assembly steps');await panel().waitFor();await goFinish();await expectMembers(['p2','p3']);
 f.phase='same-name exact p2 p3 batch removal';await selectIds(['p2','p3']);assert.equal(await batch().isEnabled(),true);
 await f.same(original);await f.snapshot('01-exact-members-selected');
 await batch().click();await f.changed(original);await expectMembers([]);
 const removed=await f.doc();membershipOnly(removed,original,[['p1'],[]]);await f.snapshot('02-one-batch-removal');
 await f.undo();await f.same(original);await expectMembers(['p2','p3']);
 await f.redo();await f.same(removed);await expectMembers([]);await f.undo();await f.same(original);await expectMembers(['p2','p3']);
 f.phase='mixed membership is not silently filtered';await selectIds(['p1','p2']);
 const mixedHistory=await history();assert.equal(await batch().isDisabled(),true);await f.same(original);assert.deepEqual(await history(),mixedHistory);
 await f.snapshot('03-mixed-selection-disabled');
 f.phase='existing single member control remains independent';await selectIds(['p2']);assert.equal(await batch().isDisabled(),true);
 await take('p2').click();await f.changed(original);await expectMembers(['p3']);membershipOnly(await f.doc(),original,[['p1'],['p3']]);
 await f.undo();await f.same(original);await expectMembers(['p2','p3']);await selectIds(['p2','p3']);
 f.phase='pending Name draft blocks batch without implicit commit';
 const name=panel().getByRole('textbox',{name:'Step name',exact:true}),beforeNameHistory=await history();
 await name.fill('Temporary draft');assert.equal(await batch().isDisabled(),true);
 await name.fill('Mount remaining blocks');assert.equal(await batch().isEnabled(),true);await f.same(original);assert.deepEqual(await history(),beforeNameHistory);
 await name.fill('   ');assert.equal(await batch().isDisabled(),true);await name.press('Enter');
 assert.equal(await name.inputValue(),'Mount remaining blocks');assert.equal(await batch().isEnabled(),true);await f.same(original);assert.deepEqual(await history(),beforeNameHistory);
 await name.fill('Reviewed remaining blocks');assert.equal(await batch().isDisabled(),true);await f.same(original);assert.deepEqual(await history(),beforeNameHistory);await pendingPointer(name,original,beforeNameHistory);
 await name.press('Enter');await f.changed(original);const named=await f.doc(),expectedNamed=structuredClone(original);expectedNamed.assemblySteps[1].name='Reviewed remaining blocks';assert.deepEqual(named,expectedNamed);
 await expectMembers(['p2','p3']);assert.equal(await batch().isEnabled(),true);
 f.phase='pending Note draft blocks batch until separate blur commit';
 const details=panel().getByRole('button',{name:/^Details(?::|$)/});if(await details.getAttribute('data-state')!=='open')await details.click();
 const note=panel().getByRole('textbox',{name:'Step note',exact:true}),beforeNoteHistory=await history();
 await note.fill('Synthetic separately committed instruction');assert.equal(await batch().isDisabled(),true);await f.same(named);assert.deepEqual(await history(),beforeNoteHistory);await pendingPointer(note,named,beforeNoteHistory);
 await note.press('Tab');await f.changed(named);let annotated=await f.doc();const expectedAnnotated=structuredClone(named);expectedAnnotated.assemblySteps[1].note='Synthetic separately committed instruction';assert.deepEqual(annotated,expectedAnnotated);
 await expectMembers(['p2','p3']);assert.equal(await batch().isEnabled(),true);
 f.phase="Note focus commit then keyboard close and reopen";
 await note.fill("Synthetic instruction committed on close");assert.equal(await batch().isDisabled(),true);
 const beforeClose=annotated;await note.press("Shift+Tab");await f.changed(beforeClose);
 assert.equal(await details.evaluate(e=>document.activeElement===e),true,"Shift+Tab reaches the visible Details trigger");
 annotated=await f.doc();const expectedClosed=structuredClone(beforeClose);expectedClosed.assemblySteps[1].note="Synthetic instruction committed on close";assert.deepEqual(annotated,expectedClosed);
 assert.equal(await batch().isEnabled(),true);await details.press("Enter");await f.page.waitForFunction(()=>document.querySelector('[aria-label="Assembly steps panel"] button[aria-label="Details"]')?.getAttribute("data-state")==="closed");
 assert.equal(await details.getAttribute("data-state"),"closed");assert.equal(await batch().isEnabled(),true);
 await details.click();assert.equal(await note.inputValue(),expectedClosed.assemblySteps[1].note);assert.equal(await batch().isEnabled(),true);
 // Only a later explicit click removes members. One Undo keeps independently committed metadata.
 await batch().focus();await batch().press('Enter');await f.changed(annotated);await expectMembers([]);const final=await f.doc();membershipOnly(final,annotated,[['p1'],[]]);
 await f.undo();await f.same(annotated);await expectMembers(['p2','p3']);
 await f.redo();await f.same(final);await expectMembers([]);await f.snapshot('04-explicit-batch-after-text-commits');
 f.phase='native Save and fresh Open whole document preservation';const saved=await f.save('synthetic-step-takeout');assert.deepEqual(saved.doc,final);
 await f.freshOpen(saved.file,final,'05-native-reopened');await f.command('Assembly steps');await panel().waitFor();await goFinish('Reviewed remaining blocks');await expectMembers([]);await f.same(final);
 f.report.observations.push({sameNameExactIds:['p2','p3'],oneUndoRestoresBoth:true,redoExact:true,mixedSelectionDisabled:true,singleMemberPathPreserved:true,
  pendingNameAndNoteDisabledWithoutImplicitCommit:true,disabledPointerPreservesDraftFocus:true,revertedDraftReenablesBatch:true,blankNameEnterResetsWithoutEdit:true,keyboardBatchAfterTextCommit:true,pendingDraftUnrelatedDocumentCommit:'NOT_RUN',separateTextCommitsPreservedByBatchUndo:true,onlyMembershipChangedByBatch:true,nativeSaveFreshOpen:true,
  nestedPatternAndStaleCallback:'NOT_RUN',independentGeometry:'NOT_RUN'});
 assert.equal(f.report.downloads.length,1);const end=await statfs(process.argv[2]);assert.ok(end.bavail*end.bsize>=2*1024**3);
});
