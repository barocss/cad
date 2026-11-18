// #207 baseline: existing core/UI authoring versus currently advertised public chat actions.
import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
 nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } } };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
 instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: i < 2 ? 'Synthetic shared block' : 'Synthetic unassigned cap', doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'shared' : 'independent', rev: 'A' } })),
 assemblySteps: [{ id: 'mount', name: 'Synthetic mount', add: ['p1'] }] };
const pins=['apps/cad-studio/test/assembly-step-authoring-baseline-browser.mjs','apps/cad-studio/src/ui/AssemblyStepsPanel.tsx','apps/cad-studio/src/app/assemblySteps.ts','packages/barocss-cad-model/src/assembly/steps.ts','packages/barocss-cad-model/src/api/assembly.ts','packages/barocss-cad-model/src/chat/groups.ts','packages/barocss-cad-model/src/chat/tools.ts','packages/barocss-cad-model/src/chat/toolDefinitions.ts'];
const f=await createFlow({name:'assembly-step-authoring-baseline',envFrozen:'ASSEMBLY_STEP_AUTHORING_BASELINE_FROZEN',output:process.argv[2],initialFiles:pins,requiredFrozen:pins,
 qualification:'Existing public describe/query contract and unsupported authoring probe compared with actual Steps UI and supported core/API operations on isolated copies. An invented tool refusal alone is not a product bug.',
 limits:['Synthetic top-level p1/p2 share a name; UI and core use exact occurrence IDs. Assembly.step uses names and is compared using uniquely named p3 only.','Local inspector invokes public runtime APIs, not external MCP or a chat conversation. No new write/proposal authorization contract is tested.','Read-only calls preserve document/dirty/history; the explicit existing UI Add operation intentionally changes steps and is checked separately with Undo/Redo.','Geometry inputs, placements and definitions remain structurally unchanged after stripping assemblySteps. This is not independent geometric accuracy or rendering certification.'],
 inspectorSource:`import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runTool} from '@barocss/cad-model/chat/tools';
import {addAssemblyStep} from '@barocss/cad-model/assembly/steps';
import {Assembly} from '@barocss/cad-model/api/assembly';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),before=structuredClone(doc),evaluate=async d=>evaluateDoc(d,1);
const strip=d=>{const {assemblySteps,...rest}=d;return rest;};
const described=await runTool({doc,bodies:[]},'describe',{tool:'assembly'},evaluate);assert.equal(described.isError,false);assert.equal(described.changed,false);
const actions=JSON.parse(described.content).actions;assert.ok(Object.hasOwn(actions,'get'));for(const name of ['step','add_step','edit_step','delete_step'])assert.equal(Object.hasOwn(actions,name),false);
const query=await runTool({doc,bodies:[]},'assembly',{action:'get',include_steps:true},evaluate);assert.equal(query.isError,false);assert.equal(query.changed,false);const data=JSON.parse(query.content);assert.deepEqual(data.assembly_steps.steps.map(s=>({id:s.id,parts:s.parts})),doc.assemblySteps.map(s=>({id:s.id,parts:s.add})));
const refused=await runTool({doc,bodies:[]},'add_assembly_step',{name:'Synthetic proposal probe',parts:['p2']},evaluate);assert.equal(refused.isError,true);assert.equal(refused.changed,false);assert.equal(JSON.parse(refused.content).error,'Unknown tool "add_assembly_step".');assert.deepEqual(refused.state.doc,before);
for(const r of [described,query])assert.deepEqual(r.state.doc,before);
// Core exact-ID and API name-based contracts are intentionally separate from the unsupported chat probe.
const free=doc.instances.find(i=>!doc.assemblySteps.some(s=>s.add.includes(i.id)));assert.ok(free);
const core=addAssemblyStep(doc,{name:'Synthetic core-only step',add:[free.id]});assert.deepEqual(core.doc.assemblySteps.at(-1).add,[free.id]);assert.deepEqual(strip(core.doc),strip(before));
const api=new Assembly('Synthetic kit',doc).step({name:'Synthetic API-only step',parts:['Synthetic unassigned cap']}).doc;assert.deepEqual(api.assemblySteps.at(-1).add,['p3']);assert.deepEqual(strip(api),strip(before));assert.deepEqual(doc,before);
console.log(JSON.stringify({actions:Object.keys(actions),query:data.assembly_steps,unsupportedAuthoring:{isError:refused.isError,changed:refused.changed,message:refused.content},coreExactId:free.id,apiUniqueNameId:'p3',originalUnchanged:true}));`});
const panel=()=>f.page.getByRole('complementary',{name:'Assembly steps panel',exact:true});
const members=()=>panel().getByRole('group',{name:'Parts of this step',exact:true}).locator('[data-part]').evaluateAll(rows=>rows.map(r=>r.getAttribute('data-part')));
const history=async()=>({dirty:await f.page.locator('[aria-label="Unsaved changes"]').count(),undo:await f.page.getByRole('button',{name:'Undo',exact:true}).isEnabled(),redo:await f.page.getByRole('button',{name:'Redo',exact:true}).isEnabled(),rows:await f.page.locator('.history .hs').evaluateAll(rows=>rows.map(r=>r.textContent))});
const strip=doc=>{const {assemblySteps,...rest}=doc;return rest;};
await f.run(async()=>{
 f.phase='public native Open';await f.newPage();await f.openFile({name:'synthetic-step-authoring.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))},0);await f.ready();const accepted=await f.doc();assert.deepEqual(accepted.assemblySteps,seed.assemblySteps);
 const initial=await history();await f.command('Assembly steps');await panel().waitFor();assert.deepEqual(await members(),['p1']);
 f.phase='existing describe and unsupported chat authoring probe';const query=await f.inspect('01-current-public-contract',accepted);await f.same(accepted);assert.deepEqual(await history(),initial);await f.snapshot('01-existing-step-and-public-contract');
 f.phase='existing UI exact occurrence add';await f.page.locator('[data-browser-instance-path="p2"]').click();await panel().getByRole('button',{name:'Add selected parts to this step',exact:true}).click();await f.changed(accepted);const edited=await f.doc();assert.deepEqual(edited.assemblySteps[0].add,['p1','p2']);assert.deepEqual(strip(edited),strip(accepted));assert.deepEqual(await members(),['p1','p2']);await f.snapshot('02-same-name-exact-id-added');
 await f.undo();await f.same(accepted);await f.redo();await f.same(edited);
 const postEdit=await history();const after=await f.inspect('02-public-query-after-existing-ui-add',edited);await f.same(edited);assert.deepEqual(await history(),postEdit);assert.deepEqual(after.query.steps[0].parts,['p1','p2']);
 const saved=await f.save('synthetic-step-authoring');assert.deepEqual(saved.doc,edited);await f.freshOpen(saved.file,saved.doc,'03-native-fresh-open');await f.command('Assembly steps');await panel().waitFor();assert.deepEqual(await members(),['p1','p2']);assert.deepEqual(strip(await f.doc()),strip(accepted));
 f.report.observations.push({advertisedAssemblyActions:query.actions,readOnlyQueryAndRefusalPreserveDocumentDirtyHistory:true,unknownToolProbeAloneIsNotBug:true,existingCoreExactIdsSupported:true,existingApiUniqueNamesSupported:true,existingUiSameNameExactOccurrenceAdd:true,uiUndoRedo:true,geometryInputsPlacementsDefinitionsUnchanged:true,nativeSaveFreshOpen:true,externalMcp:'NOT_RUN',newWriteApprovalContract:'NOT_RUN'});
 assert.equal(f.report.downloads.length,1);
});
