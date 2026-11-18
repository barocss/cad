import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const part = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
 nodes: [{ kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [10, 5] }, { kind: 'extrude', id: 'n1', sketch: 0, height: 2 }], outputs: { b1: { node: 1, side: 'solid' } } };
const seed = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [], outputs: {}, nextId: 0,
 instances: ['p1', 'p2', 'p3'].map((id, i) => ({ id, name: i < 2 ? 'Synthetic shared block' : 'Synthetic unassigned cap', doc: structuredClone(part), position: [i * 15, 0, 0], rotation: [0, 0, 0], part: { id: i < 2 ? 'shared' : 'independent', rev: 'A' } })),
 assemblySteps: [{ id: 'mount', name: 'Synthetic mount', add: ['p1', 'retained-missing'], note: 'Synthetic mount instruction', explode: 0.5 }, { id: 'finish', name: 'Synthetic finish', add: ['p2'], note: 'Synthetic finish instruction' }] };
const f = await createFlow({ name: 'assembly-step-query-baseline', envFrozen: 'ASSEMBLY_STEP_QUERY_BASELINE_FROZEN', output: process.argv[2],
 initialFiles: ['apps/cad-studio/test/assembly-step-query-baseline-browser.mjs', 'apps/cad-studio/src/ui/AssemblyStepsPanel.tsx', 'apps/cad-studio/src/app/assemblySteps.ts', 'packages/barocss-cad-model/src/chat/assembly.ts', 'packages/barocss-cad-model/src/chat/tools.ts', 'packages/barocss-cad-model/src/assembly/steps.ts'],
 qualification: 'Baseline: saved instruction steps appear in Studio but existing public get_assembly exposes no step query contract or result.',
 limits: ['Synthetic top-level three-occurrence fixture only; retained missing member is deliberate.', 'Public runTool assembly.get is called by the fixture inspector on a copy of the accepted native document, not through a chat UI conversation or external MCP transport.', 'API results do not claim the currently displayed UI step. Stored steps and session UI navigation are distinct.', 'No new query behavior, manufacturing, geometry accuracy, playback, nested or asynchronous ownership qualification.'],
 inspectorSource: `import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dispatchTool,runTool} from '@barocss/cad-model/chat/tools';
import {ASSEMBLY_TOOLS} from '@barocss/cad-model/chat/assembly';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),before=structuredClone(doc);
const evaluate=async d=>evaluateDoc(d,1);
const reply=await runTool({doc,bodies:[]},'assembly',{action:'get'},evaluate);
const direct=await dispatchTool({doc,bodies:[]},'assembly',{action:'get'},evaluate);
assert.equal(direct.isError,false);assert.deepEqual(JSON.parse(reply.content),JSON.parse(direct.content));
const unsupported=await runTool({doc,bodies:[]},'assembly',{action:'get',include_steps:true},evaluate);
assert.equal(unsupported.isError,true);assert.equal(unsupported.changed,false);assert.deepEqual(unsupported.state.doc,before);
assert.match(unsupported.content,/UNKNOWN_ARGUMENT/);assert.match(unsupported.content,/include_steps/);
assert.deepEqual(doc,before);assert.deepEqual(reply.state.doc,before);
console.log(JSON.stringify({isError:reply.isError,changed:reply.changed,documentUnchanged:true,summary:JSON.parse(reply.content),dispatcherMatches:true,unsupportedIncludeStepsRefused:true,policyCalls:reply.state.policy?.calls,inputSchema:ASSEMBLY_TOOLS.find(t=>t.name==='get_assembly').input_schema}));` });
const panel = () => f.page.getByRole('complementary', { name: 'Assembly steps panel', exact: true });
const members = () => panel().getByRole('group', { name: 'Parts of this step', exact: true }).locator('[data-part]').evaluateAll(rows => rows.map(r => r.getAttribute('data-part')));
const history = async () => ({ undo: await f.page.getByRole('button', { name: 'Undo', exact: true }).isEnabled(), redo: await f.page.getByRole('button', { name: 'Redo', exact: true }).isEnabled(), rows: await f.page.locator('.history .hs').evaluateAll(rows => rows.map(r => r.textContent)) });
async function query(doc, label) {
 const r = await f.inspect(label, doc); assert.equal(r.isError, false); assert.equal(r.changed, false); assert.equal(r.documentUnchanged, true); assert.equal(r.dispatcherMatches, true); assert.equal(r.unsupportedIncludeStepsRefused, true); assert.equal(r.policyCalls, 1);
 assert.deepEqual(r.summary.instances.map(i => i.id), ['p1', 'p2', 'p3']);
 assert.deepEqual(Object.keys(r.inputSchema.properties), ['faces_of']); assert.equal(r.inputSchema.additionalProperties, false);
 for (const key of ['steps', 'assemblySteps', 'assembly_steps', 'instruction_steps']) assert.equal(Object.hasOwn(r.summary, key), false);
 const text = JSON.stringify(r.summary); for (const value of ['retained-missing', 'Synthetic mount instruction', 'Synthetic finish instruction']) assert.ok(!text.includes(value));
 return r;
}
await f.run(async () => {
 await f.newPage(); await f.openFile({ name: 'synthetic-step-query.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) }, 0); await f.ready();
 const accepted = await f.doc(), initialHistory = await history(); assert.deepEqual(accepted.assemblySteps, seed.assemblySteps);
 await f.command('Assembly steps'); await panel().waitFor();
 assert.deepEqual(await members(), ['p1', 'retained-missing']);
 await panel().getByRole('status', { name: 'Step position', exact: true }).getByText('Step 1 of 2', { exact: true }).waitFor();
 await panel().locator('[data-part="retained-missing"]').waitFor();
 assert.match(await panel().locator('[data-part="retained-missing"]').innerText(), /missing/);
 const first = await query(accepted, 'public-default-query-at-first-ui-step'); await f.same(accepted); assert.deepEqual(await history(), initialHistory); await f.snapshot('01-ui-step-present-query-absent');
 await panel().getByRole('button', { name: 'Next step', exact: true }).click(); assert.deepEqual(await members(), ['p2']);
 await f.page.locator('[data-browser-instance-path="p3"]').click();
 await panel().getByRole('status').filter({ hasText: 'Synthetic unassigned cap is in no step.' }).waitFor();
 const second = await query(await f.doc(), 'public-default-query-at-second-ui-step'); assert.deepEqual(second.summary, first.summary);
 await f.same(accepted); assert.deepEqual(await history(), initialHistory); await f.snapshot('02-unassigned-and-stored-query-boundary');
 const saved = await f.save('synthetic-step-query'); assert.deepEqual(saved.doc, accepted); await f.freshOpen(saved.file, saved.doc, '03-native-fresh-open');
 await f.command('Assembly steps'); await panel().waitFor(); assert.deepEqual(await members(), ['p1', 'retained-missing']);
 await query(saved.doc, 'reopened-public-default-query'); await f.same(saved.doc);
 f.report.observations.push({ publicRunToolV2DefaultQuery: true, dispatcherMatches: true, unsupportedOptInRefused: true, policyCallCountSeparateFromDocument: true, schemaOnlyFacesOf: true, savedStepsMissingFromSummary: true, actualUIPresentsSavedSteps: true, retainedMissingPreserved: true, unassignedOccurrenceObserved: true, queryDoesNotTrackCurrentUIStep: true, sourceAndHistoryAvailabilityUnchanged: true, nativeSaveFreshOpen: true });
});
