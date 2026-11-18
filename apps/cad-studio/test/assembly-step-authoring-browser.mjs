// #207: local public proposal preparation followed by explicit Studio approval.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
 nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } } };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
 instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: i < 2 ? 'Synthetic shared block' : 'Synthetic unassigned cap', doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'shared' : 'independent', rev: 'A' } })),
 assemblySteps: [{ id: 'mount', name: 'Synthetic mount', add: ['p1'], note: 'Synthetic retained instruction', explode: 0.5, view: {eye:[60,50,40],target:[15,0,0],up:[0,0,1]} }] };
const output=process.argv[2];
const pins=['apps/cad-studio/test/assembly-step-authoring-browser.mjs','packages/barocss-cad-model/src/chat/assembly.ts','packages/barocss-cad-model/src/chat/groups.ts','packages/barocss-cad-model/src/chat/toolDefinitions.ts','packages/barocss-cad-model/src/chat/tools.ts','packages/barocss-cad-model/src/chat/part/proposals.ts','packages/barocss-cad-model/src/chat/spec.ts','packages/barocss-cad-model/src/assembly/steps.ts','apps/cad-studio/src/ui/AssemblyStepsPanel.tsx','apps/cad-studio/src/ui/ProposalBrowser.tsx','apps/cad-studio/src/state/useProposalPreview.ts'];
const f=await createFlow({name:'assembly-step-authoring',envFrozen:'ASSEMBLY_STEP_AUTHORING_FROZEN',output,initialFiles:pins,requiredFrozen:pins,
 qualification:'Public local runtime prepares a proposal on an accepted-document copy; a native file transports that proposal to Studio for explicit Preview/Accept. Normal and stale step-only-edit/rebase paths are separate.',
 limits:['Synthetic top-level same-name p1/p2 and uniquely named p3 only. External MCP transport is NOT_RUN.','Proposal creation stores proposal/history metadata but must not apply the step; it is not a byte-identical document operation.','Original geometry inputs, placements, mates and definitions are structurally unchanged. No independent geometry/visual accuracy oracle.','No automatic approval, hidden state injection, nested occurrence support, capture-view authoring or edit/delete step chat support claimed.'],
 inspectorSource:`import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runTool} from '@barocss/cad-model/chat/tools';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),before=structuredClone(doc),evaluate=async d=>evaluateDoc(d,1);
const args={action:'add_step',name:'Synthetic proposed second step',parts:['p2']};
const state={doc,bodies:[]};const direct=await runTool(state,'assembly',args,evaluate);assert.equal(direct.isError,true);assert.equal(direct.changed,false);assert.deepEqual(direct.state.doc,before);assert.equal(JSON.parse(direct.content).code,'needs_approval');
const proposed=await runTool(state,'proposals',{action:'propose',title:'Synthetic exact occurrence step',ops:[{tool:'assembly',args}]},evaluate);
assert.equal(proposed.isError,false,proposed.content);assert.equal(proposed.changed,true);assert.deepEqual(doc,before);
const pending=proposed.state.doc;assert.equal(pending.proposals.length,1);assert.equal(pending.proposals[0].status,'open');assert.ok(pending.proposals[0].summary.includes(args.name));assert.ok(pending.proposals[0].summary.includes('p2'));assert.deepEqual(pending.assemblySteps,before.assemblySteps);assert.ok(pending.history.some(h=>h.kind==='proposal'));
const strip=d=>{const {proposals,history,...rest}=d;return rest;};assert.deepEqual(strip(pending),strip(before));
console.log(JSON.stringify({pending,proposalId:pending.proposals[0].id,directRefused:true,modelUnchanged:true,proposalHistoryAdded:true}));`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Assembly steps panel',exact:true});
const history=async()=>({dirty:await f.page.locator('[aria-label="Unsaved changes"]').count(),undo:await button('Undo').isEnabled(),redo:await button('Redo').isEnabled(),rows:await f.page.locator('.history .hs').evaluateAll(rows=>rows.map(r=>r.textContent))});
const geometryInputs=doc=>{const {assemblySteps,proposals,history,...rest}=doc;return rest;};
async function steps(){await f.command('Assembly steps');await panel().waitFor();}
async function showChat(){const close=button('Close chat');if(!await close.isVisible())await button('Chat').first().click();}
async function closeChat(){const close=button('Close chat');if(await close.isVisible())await close.click();}
async function scenario(file,pending,original,id,stale){
 const prefix=stale?'stale':'normal';f.phase=prefix+' native Open pending proposal';await f.newPage();await f.openFile(file,pending.nodes.length);await f.same(pending);
 let reviewBase=await f.doc();
 if(stale){await steps();const name=panel().getByLabel('Step name',{exact:true});await name.fill('Synthetic locally renamed mount');await name.press('Enter');await f.changed(pending);reviewBase=await f.doc();assert.equal(reviewBase.assemblySteps[0].name,'Synthetic locally renamed mount');assert.deepEqual({...reviewBase.assemblySteps[0],name:original.assemblySteps[0].name},original.assemblySteps[0]);assert.deepEqual(geometryInputs(reviewBase),geometryInputs(original));}
 await showChat();const card=f.page.getByRole('listitem',{name:`Proposal ${id}`,exact:true});await card.waitFor();assert.ok((await card.innerText()).includes('Synthetic proposed second step'));assert.ok((await card.innerText()).includes('p2'));
 if(stale){assert.equal(await button('Preview',card).isDisabled(),true);assert.equal(await button('Accept',card).count(),0);await f.same(reviewBase);await f.snapshot(prefix+'-01-stale-refusal');await button('Rebase & preview',card).click();await button('Hide',card).waitFor();await f.ready();reviewBase=await f.doc();assert.equal(reviewBase.proposals[0].status,'open');assert.deepEqual(reviewBase.assemblySteps[0].add,['p1']);assert.equal(reviewBase.assemblySteps[0].name,'Synthetic locally renamed mount');}
 else{const before=await history();await button('Preview',card).click();await button('Hide',card).waitFor();await f.same(reviewBase);assert.deepEqual(await history(),before);}
 assert.deepEqual(geometryInputs(reviewBase),geometryInputs(original));await f.snapshot(prefix+'-02-explicit-preview');
 f.phase=prefix+' explicit Accept';await button('Accept',card).click();await f.page.waitForFunction(id=>window.__studioDoc?.proposals?.find(p=>p.id===id)?.status==='accepted',id);await f.ready();const accepted=await f.doc();assert.equal(accepted.assemblySteps.length,2);assert.deepEqual(accepted.assemblySteps[1].add,['p2']);assert.equal(accepted.assemblySteps[1].name,'Synthetic proposed second step');assert.deepEqual(accepted.assemblySteps[0],reviewBase.assemblySteps[0]);assert.deepEqual(geometryInputs(accepted),geometryInputs(original));
 await closeChat();await steps();await button('Next step',panel()).click();assert.deepEqual(await panel().getByRole('group',{name:'Parts of this step',exact:true}).locator('[data-part]').evaluateAll(rows=>rows.map(r=>r.getAttribute('data-part'))),['p2']);await f.snapshot(prefix+'-03-exact-member');
 await f.undo();await f.same(reviewBase);await f.redo();await f.same(accepted);
 const saved=await f.save('synthetic-step-'+prefix);await f.freshOpen(saved.file,saved.doc,prefix+'-04-fresh-open');assert.deepEqual((await f.doc()).assemblySteps,accepted.assemblySteps);assert.deepEqual(geometryInputs(await f.doc()),geometryInputs(original));
 f.report.observations.push({scenario:prefix,directWriteRefused:true,localRuntimeProposalFileOpened:true,explicitPreviewAccept:true,exactP2NotSameNameP1:true,existingStepMetadataPreserved:true,staleStepOnlyEditRequiresRebase:stale,undoRedoRestoresWholeDocument:true,nativeSaveFreshOpen:true,externalMcp:'NOT_RUN'});
}
await f.run(async()=>{await f.newPage();await f.openFile({name:'synthetic-step-authoring.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))},0);await f.ready();const original=await f.doc(),before=await history();const made=await f.inspect('prepare-local-proposal',original);await f.same(original);assert.deepEqual(await history(),before);const file=join(output,'synthetic-pending-step.bcad');await writeFile(file,JSON.stringify(made.pending),{flag:'wx'});await scenario(file,made.pending,original,made.proposalId,false);await scenario(file,made.pending,original,made.proposalId,true);assert.equal(f.report.downloads.length,2);});
