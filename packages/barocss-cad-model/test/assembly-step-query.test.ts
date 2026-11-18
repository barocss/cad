import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { runTool, dispatchTool } from '../src/chat/tools';
import { runAssemblyTool } from '../src/chat/assembly';
import { outputSchemaOf, validate } from '../src/chat/contract';
import { assemblyStepProblems, stepStateOf } from '../src/assembly/steps';
const evaluate = async (doc: StudioDoc) => evaluateDoc(doc, 1);
function fixture(): StudioDoc {
 const part = rectanglePart(10, 5, 2);
 return { ...emptyDoc(), instances: ['p1', 'p2', 'p3'].map((id, index) => ({ id, name: index < 2 ? 'Same part' : 'Unassigned', doc: part, position: [index * 15, 0, 0], rotation: [0, 0, 0], part: { id: index < 2 ? 'shared' : 'other', rev: 'A' } })), assemblySteps: [{ id: 'get_assembly', name: 'run_command', add: ['p1', 'missing'], note: 'SECRET_NOTE', explode: 0.75, view: { eye: [90, 80, 70], target: [0, 0, 0], up: [0, 0, 1] } }, { id: 'finish', name: 'Finish', add: ['p2'] }] };
}
async function query(doc: StudioDoc, args: Record<string, unknown> = {}) {
 const before = structuredClone(doc), state = { doc, bodies: [] };
 const publicResult = await runTool(state, 'assembly', { action: 'get', ...args }, evaluate);
 const direct = await dispatchTool(state, 'assembly', { action: 'get', ...args }, evaluate);
 assert.equal(publicResult.isError, false, publicResult.content); assert.equal(direct.isError, false, direct.content);
 assert.equal(publicResult.changed, false); assert.equal(direct.changed, false);
 assert.equal(publicResult.state.doc, doc); assert.equal(direct.state.doc, doc); assert.deepEqual(doc, before);
 assert.deepEqual(JSON.parse(publicResult.content), JSON.parse(direct.content));
 assert.deepEqual(validate(outputSchemaOf('get_assembly')!, JSON.parse(publicResult.content)), []);
 assert.equal(publicResult.state.policy?.calls, 1);
 return { value: JSON.parse(publicResult.content), content: publicResult.content };
}
test('default and explicit false remain byte-identical; opt-in is a whitelisted additive result', async () => {
 const doc = fixture(), legacy = await query(doc), no = await query(doc, { include_steps: false }); assert.equal(no.content, legacy.content);
 assert.equal(Object.hasOwn(legacy.value, 'assembly_steps'), false);
 const opted = (await query(doc, { include_steps: true })).value; const { assembly_steps: steps, ...rest } = opted;
 assert.deepEqual(rest, legacy.value);
 assert.deepEqual(steps, { scope: 'saved-top-level-instructions', steps: [{ index: 0, id: 'get_assembly', name: 'run_command', parts: ['p1', 'missing'] }, { index: 1, id: 'finish', name: 'Finish', parts: ['p2'] }], unassigned: ['p3'], problems: assemblyStepProblems(doc) });
 const text = JSON.stringify(steps); for (const key of ['note', 'view', 'eye', 'target', 'up', 'explode']) assert.ok(!Object.hasOwn(steps.steps[0], key));
 assert.ok(!text.includes('SECRET_NOTE')); assert.equal(Object.hasOwn(steps, "state"), false);
});
test('specified index reuses saved classification, retaining literal IDs and not display visibility', async () => {
 const doc = fixture(); doc.instances![0].hidden = true;
 for (const index of [1, 0, 1]) {
  const actual = (await query(doc, { include_steps: true, step_index: index })).value.assembly_steps.state;
  const { step, ...state } = stepStateOf(doc, index);
  assert.deepEqual(actual, { ...state, step_id: step.id });
 }
 const first = (await query(doc, { include_steps: true, step_index: 0 })).value.assembly_steps.state;
 assert.deepEqual(first.active, ['p1']); assert.deepEqual(first.unresolved, ['missing']); assert.deepEqual(first.waiting, ['p2', 'p3']);
 const last = (await query(doc, { include_steps: true, step_index: 1 })).value.assembly_steps.state;
 assert.deepEqual(last.installed, ['p1', 'p3']); assert.deepEqual(last.active, ['p2']);
});
test('empty saved list reports all placed IDs unassigned and never fabricates a state', async () => {
 const doc = fixture(); delete doc.assemblySteps;
 assert.deepEqual((await query(doc, { include_steps: true })).value.assembly_steps, { scope: 'saved-top-level-instructions', steps: [], unassigned: ['p1', 'p2', 'p3'], problems: [] });
 const empty = (await query(emptyDoc(), { include_steps: true })).value.assembly_steps; assert.deepEqual(empty.steps, []); assert.deepEqual(empty.unassigned, []);
});
test('all malformed and unsupported new arguments are rejected before evaluation with original identity', async () => {
 const doc = fixture(), before = structuredClone(doc); let calls = 0;
 const noEvaluate = async () => { calls++; throw new Error('Invalid query must not evaluate'); };
 const bad = [null, 'true', 1, {}, [], undefined].map(include_steps => ({ include_steps }));
 const args: Record<string, unknown>[] = [...bad, { step_index: 0 }, { include_steps: false, step_index: 0 }, ...[null, '0', NaN, Infinity, -1, 0.5, 2, Number.MAX_SAFE_INTEGER + 1, undefined].map(step_index => ({ include_steps: true, step_index }))];
 for (const input of args) {
  const direct = await runAssemblyTool({ doc, bodies: [] }, 'get_assembly', input, noEvaluate);
  assert.equal(direct.isError, true); assert.equal(direct.changed, false); assert.equal(direct.doc, doc);
  const result = await runTool({ doc, bodies: [] }, 'assembly', { action: 'get', ...input }, noEvaluate);
  assert.equal(result.isError, true); assert.equal(result.changed, false); assert.equal(result.state.doc, doc);
 }
 const empty = emptyDoc(); const absent = await runTool({ doc: empty, bodies: [] }, 'assembly', { action: 'get', include_steps: true, step_index: 0 }, noEvaluate);
 assert.equal(absent.isError, true); assert.equal(absent.state.doc, empty);
 assert.equal(calls, 0); assert.deepEqual(doc, before);
});
test('whole subassemblies and pattern occurrence IDs stay top-level; retained nested reference is reported', async () => {
 // Handler classification fixture, not native Save/Open or public pattern-authoring qualification.
 const doc = fixture(); doc.instances![0].part = { id: 'independent-subassembly', rev: 'A' };
 doc.instances![0].doc = { ...emptyDoc(), instances: [{ ...doc.instances![2], id: 'leaf' }] };
 doc.instances![1].pattern = { id: 'repeat', k: 1 };
 doc.assemblySteps![0].add.push('p1/leaf', 'base');
 const steps = (await query(doc, { include_steps: true, step_index: 1 })).value.assembly_steps;
 assert.deepEqual(steps.steps[0].parts, ['p1', 'missing', 'p1/leaf', 'base']);
 assert.deepEqual(steps.state.active, ['p2']); assert.ok(steps.state.installed.includes('p1'));
 assert.ok(steps.problems.some((p: { part?: string; kind: string }) => p.part === 'p1/leaf' && p.kind === 'unlistable-part'));
 assert.ok(steps.problems.some((p: { part?: string; kind: string }) => p.part === 'base' && p.kind === 'unlistable-part'));
});
test('face detail and existing unknown-argument admission remain independent of opt-in', async () => {
 const doc = fixture(); const detail = await query(doc, { faces_of: 'p1' });
 const opted = (await query(doc, { faces_of: 'p1', include_steps: true })).value; delete opted.assembly_steps; assert.deepEqual(opted, detail.value);
 const out = await runTool({ doc, bodies: [] }, 'assembly', { action: 'get', include_steps: true, invented: true }, evaluate);
 assert.equal(out.isError, true); assert.match(out.content, /UNKNOWN_ARGUMENT/); assert.equal(out.state.doc, doc);
});

test('public describe exposes optional step inputs and result schema retains existing required base', async () => {
 const doc = fixture(), before = structuredClone(doc);
 const r = await runTool({ doc, bodies: [] }, 'describe', { tool: 'assembly', action: 'get' }, evaluate);
 assert.equal(r.isError, false, r.content); assert.equal(r.changed, false); assert.equal(r.state.doc, doc);
 const described = JSON.parse(r.content);
 assert.equal(described.input.properties.include_steps.type, 'boolean');
 assert.equal(described.input.properties.step_index.type, 'integer');
 assert.equal(described.input.properties.step_index.minimum, 0);
 assert.ok(!(described.input.required ?? []).includes('include_steps'));
 assert.ok(!(described.input.required ?? []).includes('step_index'));
 assert.match(described.description, /not current UI visibility or motion/);
 const schema = outputSchemaOf('get_assembly')!;
 assert.deepEqual(schema.required, ['base']);
 assert.ok(schema.properties?.assembly_steps); assert.deepEqual(doc, before);
});
