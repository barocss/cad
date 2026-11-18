import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
 nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } } };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
 instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: i < 2 ? 'Synthetic shared block' : 'Synthetic unassigned cap', doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'shared' : 'independent', rev: 'A' } })),
 assemblySteps: [{ id: 'mount', name: 'Synthetic mount', add: ['p1', 'retained-missing'], note: 'Synthetic mount instruction', explode: 0.5 }, { id: 'finish', name: 'Synthetic finish', add: ['p2'], note: 'Synthetic finish instruction' }] };
const f = await createFlow({ name: 'assembly-step-query', envFrozen: 'ASSEMBLY_STEP_QUERY_FROZEN', output: process.argv[2],
 initialFiles: ['apps/cad-studio/test/assembly-step-query-browser.mjs', 'apps/cad-studio/src/ui/AssemblyStepsPanel.tsx', 'apps/cad-studio/src/app/assemblySteps.ts', 'packages/barocss-cad-model/src/chat/assembly.ts', 'packages/barocss-cad-model/src/chat/tools.ts', 'packages/barocss-cad-model/src/chat/contract.ts', 'packages/barocss-cad-model/src/chat/groups.ts', 'packages/barocss-cad-model/src/assembly/steps.ts'],
 qualification: 'Saved top-level instruction query via public runTool on copies of actual Studio-accepted native documents; optional query does not track session navigation.',
 limits: ['Synthetic three-occurrence native fixture with a deliberately retained missing member.', 'Inspector invokes public runTool, not chat UI or an external MCP transport. dispatchTool is a separate comparison without session autonomy/approval gates.', 'History checks cover visible rows and Undo/Redo availability, not all internal history or dirty state.', 'No hidden-rendering, geometry accuracy, manufacturing, playback, nested or late-callback qualification.'],
 inspectorSource: `import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dispatchTool,runTool} from '@barocss/cad-model/chat/tools';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),before=structuredClone(doc);
const evaluate=async d=>evaluateDoc(d,1);
async function call(extra={}) {
 const state={doc,bodies:[]}; const r=await runTool(state,'assembly',{action:'get',...extra},evaluate);
 assert.equal(r.isError,false); assert.equal(r.changed,false); assert.deepEqual(r.state.doc,before); assert.equal(r.state.policy?.calls,1); assert.deepEqual(doc,before);
 return {content:r.content,data:JSON.parse(r.content)};
}
const ordinary=await call(),disabled=await call({include_steps:false}); assert.equal(disabled.content,ordinary.content); assert.equal(Object.hasOwn(ordinary.data,'assembly_steps'),false);
const list=await call({include_steps:true}),zero=await call({include_steps:true,step_index:0}),one=await call({include_steps:true,step_index:1});
const expectedSteps=[{index:0,id:'mount',name:'Synthetic mount',parts:['p1','retained-missing']},{index:1,id:'finish',name:'Synthetic finish',parts:['p2']}];
const a=list.data.assembly_steps;
assert.deepEqual(Object.keys(a).sort(),['problems','scope','steps','unassigned']);
assert.equal(a.scope,'saved-top-level-instructions');assert.deepEqual(a.steps,expectedSteps);assert.deepEqual(a.unassigned,['p3']);
assert.deepEqual(a.problems.map(p=>({kind:p.kind,...(p.step?{step:p.step}:{}),...(p.part?{part:p.part}:{})})),[{kind:'missing-part',step:'mount',part:'retained-missing'},{kind:'unassigned'}]);
for(const p of a.problems)assert.equal(typeof p.message,'string');
const z={index:0,step_id:'mount',installed:[],active:['p1'],waiting:['p2','p3'],unresolved:['retained-missing'],unassigned:['p3']};
const o={index:1,step_id:'finish',installed:['p1','p3'],active:['p2'],waiting:[],unresolved:['retained-missing'],unassigned:['p3']};
assert.deepEqual(zero.data.assembly_steps,{...a,state:z});assert.deepEqual(one.data.assembly_steps,{...a,state:o});
for(const r of [list,zero,one]) {
 const {assembly_steps,...unchanged}=r.data;assert.deepEqual(unchanged,ordinary.data);
 for(const sentinel of ['Synthetic mount instruction','Synthetic finish instruction'])assert.ok(!r.content.includes(sentinel));
 for(const step of assembly_steps.steps)assert.deepEqual(Object.keys(step).sort(),['id','index','name','parts']);
}
const direct=await dispatchTool({doc,bodies:[]},'assembly',{action:'get',include_steps:true,step_index:1},evaluate);
assert.equal(direct.isError,false);assert.equal(direct.changed,false);assert.deepEqual(JSON.parse(direct.content),one.data);assert.deepEqual(direct.state.doc,before);
const refused=[];
for(const args of [{include_steps:false,step_index:0},{include_steps:true,step_index:'0'},{include_steps:true,step_index:2},{include_steps:true,step_index:-1},{include_steps:true,step_index:0.5}]) {
 const state={doc,bodies:[]};const r=await runTool(state,'assembly',{action:'get',...args},evaluate);
 assert.equal(r.isError,true);assert.equal(r.changed,false);assert.equal(r.state,state);assert.deepEqual(doc,before);refused.push({args,error:r.content});
}
console.log(JSON.stringify({ordinary:ordinary.data,list:list.data,zero:zero.data,one:one.data,refused,documentUnchanged:true,defaultFalseByteEqual:true,policyCalls:1,dispatcherMatches:true}));` });
const panel = () => f.page.getByRole('complementary', { name: 'Assembly steps panel', exact: true });
const members = () => panel().getByRole('group', { name: 'Parts of this step', exact: true }).locator('[data-part]').evaluateAll(rows => rows.map(r => r.getAttribute('data-part')));
const history = async () => ({ undo: await f.page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), redo: await f.page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), rows: await f.page.locator('.history .hs').evaluateAll(rows => rows.map(r => r.textContent)) });
async function query(doc,label) {
 f.phase=label;const result=await f.inspect(label,doc);
 assert.equal(result.documentUnchanged,true);assert.equal(result.defaultFalseByteEqual,true);assert.equal(result.policyCalls,1);assert.equal(result.dispatcherMatches,true);assert.equal(result.refused.length,5);
 return result;
}
await f.run(async () => {
 f.phase='public native Open';await f.newPage();await f.openFile({name:'synthetic-step-query.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))},0);await f.ready();
 const accepted=await f.doc(),initialHistory=await history();assert.deepEqual(accepted.assemblySteps,seed.assemblySteps);
 f.phase='first displayed step';await f.command('Assembly steps');await panel().waitFor();assert.deepEqual(await members(),['p1','retained-missing']);
 const position=panel().getByRole('status',{name:'Step position',exact:true});await position.waitFor();assert.equal(await position.innerText(),'Step 1 of 2');
 assert.match(await panel().locator('[data-part="retained-missing"]').innerText(),/missing/);
 const first=await query(accepted,'query-at-first-displayed-step');await f.same(accepted);assert.deepEqual(await history(),initialHistory);await f.snapshot('01-first-step-query');
 f.phase='second displayed step and unassigned occurrence';await panel().getByRole('button',{name:'Next step',exact:true}).click();assert.deepEqual(await members(),['p2']);
 assert.equal(await position.innerText(),'Step 2 of 2');await f.page.locator('[data-browser-instance-path="p3"]').click();
 await panel().getByRole('status').filter({hasText:'Synthetic unassigned cap is in no step.'}).waitFor();
 const second=await query(await f.doc(),'query-at-second-displayed-step');assert.deepEqual(second,first);await f.same(accepted);assert.deepEqual(await history(),initialHistory);await f.snapshot('02-second-step-same-explicit-query');
 const saved=await f.save('synthetic-step-query');assert.deepEqual(saved.doc,accepted);await f.freshOpen(saved.file,saved.doc,'03-native-fresh-open');
 const reopenedHistory=await history();await f.command('Assembly steps');await panel().waitFor();assert.deepEqual(await members(),['p1','retained-missing']);
 const reopened=await query(await f.doc(),'reopened-explicit-query');assert.deepEqual(reopened,first);await f.same(saved.doc);assert.deepEqual(await history(),reopenedHistory);await f.snapshot('04-reopened-steps');
 f.report.observations.push({publicRunToolOnAcceptedCopy:true,dispatcherSeparateComparison:true,defaultAndFalseByteEqual:true,explicitIndicesIndependentOfDisplayedStep:true,listOnlyOmitsState:true,missingAndUnassignedPreserved:true,notesNotDisclosed:true,malformedRefusals:5,sourceAndHistoryAvailabilityUnchanged:true,nativeSaveFreshOpen:true});
});
