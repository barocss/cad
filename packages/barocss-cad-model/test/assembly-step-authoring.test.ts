import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { addInstancePattern } from '../src/assembly/patterns';
import { editAssemblyStep } from '../src/assembly/steps';
import { runAssemblyTool } from '../src/chat/assembly';
import { acceptProposal, dispatchTool, previewProposal, rebaseProposal, runTool, type ChatState } from '../src/chat/tools';
import { approvalOf } from '../src/chat/proposals';
import { modelHash } from '../src/chat/spec';
import { requirementEvidenceRevision } from '../src/util/digest';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 1);
function fixture(): StudioDoc {
  const part = rectanglePart(10, 8, 4);
  return { ...emptyDoc(), instances: ['p1', 'p2', 'p3'].map((id, k) => ({ id, name: 'Same name', doc: part, part: { id: 'shared', rev: 'A' }, position: [k * 20, 0, 0], rotation: [0, 0, 0] })),
    assemblySteps: [{ id: 'existing', name: 'Existing', add: ['p3'], note: 'Synthetic preserved note', explode: 0.75, view: { eye: [100, 100, 100], target: [0, 0, 0], up: [0, 0, 1] } }] };
}
const input = { name: 'Fit pair', parts: ['p1', 'p2'] };
const op = { tool: 'add_assembly_step', args: input };
const stateOf = (doc = fixture()): ChatState => ({ doc, bodies: [] });
function physicalSame(before: StudioDoc, after: StudioDoc) {
  const a = { ...before }, b = { ...after };
  delete a.assemblySteps; delete a.history; delete a.proposals;
  delete b.assemblySteps; delete b.history; delete b.proposals;
  assert.deepEqual(b, a);
}
async function proposed(state: ChatState) {
  const result = await runTool(state, 'propose', { title: 'Explicit instruction step', plan: 'Introduce only the named occurrences.', ops: [op] }, evaluate);
  assert.equal(result.isError, false, result.content); assert.deepEqual(result.state.doc.assemblySteps, state.doc.assemblySteps);
  const p = result.state.doc.proposals!.at(-1)!;
  assert.ok(p.risk.approval.length > 0);
  return { state: result.state, id: p.id };
}

test('direct dispatcher adds one step by exact occurrence IDs and preserves physical data and old step metadata', async () => {
  const state = stateOf(), before = structuredClone(state.doc);
  const result = await dispatchTool(state, 'assembly', { action: 'add_step', ...input }, evaluate);
  assert.equal(result.isError, false, result.content); assert.equal(result.changed, true);
  assert.equal(result.state.doc.assemblySteps!.length, 2);
  assert.deepEqual(result.state.doc.assemblySteps![0], before.assemblySteps![0]);
  assert.deepEqual(result.state.doc.assemblySteps![1].add, input.parts);
  assert.equal(result.state.doc.assemblySteps![1].name, input.name);
  assert.ok(approvalOf(state.doc, result.state.doc).length > 0);
  physicalSame(state.doc, result.state.doc); assert.deepEqual(state.doc, before);
});

test('public direct and batch authoring require approval at L1, L2, L3 and L4; agent cannot accept', async () => {
  const previous = process.env.CAD_AUTONOMY;
  try {
    for (const level of [1, 2, 3, 4]) {
      process.env.CAD_AUTONOMY = String(level);
      const state = stateOf(), before = structuredClone(state.doc);
      for (const [tool, args] of [['assembly', { action: 'add_step', ...input }], ['apply_ops', { ops: [op] }]] as const) {
        const refused = await runTool(state, tool, args, evaluate);
        assert.equal(refused.isError, true, refused.content); assert.equal(refused.changed, false);
        assert.equal(refused.state.doc, state.doc);
      }
      const p = await proposed(state);
      const refused = await runTool(p.state, 'accept_proposal', { id: p.id }, evaluate);
      assert.equal(refused.isError, true); assert.equal(refused.state.doc, p.state.doc);
      assert.deepEqual(state.doc, before);
    }
  } finally { if (previous === undefined) delete process.env.CAD_AUTONOMY; else process.env.CAD_AUTONOMY = previous; }
});

test('proposal preview and explicit user acceptance append the step without changing placements', async () => {
  const state = stateOf(), before = structuredClone(state.doc), p = await proposed(state);
  const preview = await previewProposal(p.state, p.id, evaluate);
  assert.ok('doc' in preview, JSON.stringify(preview));
  assert.equal(preview.doc.assemblySteps!.length, 2); physicalSame(state.doc, preview.doc);
  assert.equal(p.state.doc.assemblySteps!.length, 1);
  const accepted = await acceptProposal(p.state, p.id, evaluate);
  assert.ok('state' in accepted, JSON.stringify(accepted));
  assert.deepEqual(accepted.state.doc.assemblySteps, preview.doc.assemblySteps);
  assert.equal(accepted.state.doc.proposals!.find(x => x.id === p.id)!.status, 'accepted');
  physicalSame(state.doc, accepted.state.doc); assert.deepEqual(state.doc, before);
});

test('step-only edits stale acceptance by evidence revision, while general helper preview still replays; explicit rebase is required', async () => {
  const p = await proposed(stateOf());
  const edited = editAssemblyStep(p.state.doc, { id: 'existing', name: 'Explicit later edit' }).doc;
  const stale = { ...p.state, doc: edited }, before = structuredClone(edited);
  assert.equal(modelHash(edited), modelHash(p.state.doc));
  assert.notEqual(requirementEvidenceRevision(edited), requirementEvidenceRevision(p.state.doc));
  const refused = await acceptProposal(stale, p.id, evaluate);
  assert.ok('error' in refused && refused.stale);
  // General helper preview is intentionally not the Studio button's stale admission gate.
  const preview = await previewProposal(stale, p.id, evaluate);
  assert.ok('doc' in preview, JSON.stringify(preview)); assert.equal(preview.doc.assemblySteps!.length, 2);
  assert.equal(preview.doc.assemblySteps![0].name, 'Explicit later edit');
  assert.deepEqual(edited, before);
  const rebased = await rebaseProposal(stale, p.id, evaluate);
  assert.ok('state' in rebased, JSON.stringify(rebased));
  assert.equal(rebased.state.doc.proposals!.find(x => x.id === p.id)!.base_evidence_revision, requirementEvidenceRevision(edited));
  const reviewed = await previewProposal(rebased.state, p.id, evaluate); assert.ok('doc' in reviewed);
  const accepted = await acceptProposal(rebased.state, p.id, evaluate); assert.ok('state' in accepted);
  assert.deepEqual(accepted.state.doc.assemblySteps, reviewed.doc.assemblySteps); physicalSame(edited, accepted.state.doc);
});

test('batch failure after a successful tentative step is atomic', async () => {
  const state = stateOf(), before = structuredClone(state.doc);
  const result = await dispatchTool(state, 'apply_ops', { ops: [op, { tool: 'add_assembly_step', args: { name: 'Refused duplicate assignment', parts: ['p1'] } }] }, evaluate);
  assert.equal(result.isError, true, result.content); assert.equal(result.changed, false);
  assert.equal(result.state.doc, state.doc); assert.deepEqual(state.doc, before);
});

test('strict malformed and out-of-scope arguments refuse in direct handler and public dispatcher without mutation', async () => {
  const state = stateOf(), before = structuredClone(state.doc);
  const bad: Record<string, unknown>[] = [
    { name: input.name }, { parts: input.parts },
    ...[null, 0, '', '   ', undefined, 'x'.repeat(61)].map(name => ({ ...input, name })),
    ...[null, 'p1', 0, undefined, [null], [0], ['missing'], ['Same name'], ['base'], ['p1/child'], Array(1)].map(parts => ({ ...input, parts })),
    { ...input, part: 'p1' }, { ...input, part: 'base' }, { ...input, extra: true }, { ...input, note: 'Not admitted' },
  ];
  for (const args of bad) {
    const direct = await runAssemblyTool(state, 'add_assembly_step', args, evaluate);
    assert.equal(direct.isError, true, JSON.stringify(args)); assert.equal(direct.changed, false); assert.equal(direct.doc, state.doc);
    const result = await dispatchTool(state, 'assembly', { action: 'add_step', ...args }, evaluate);
    assert.equal(result.isError, true, result.content); assert.equal(result.changed, false); assert.equal(result.state.doc, state.doc);
  }
  const scoped = await runAssemblyTool({ ...state, partOf: 'p1' }, 'add_assembly_step', input, evaluate);
  assert.equal(scoped.isError, true); assert.equal(scoped.doc, state.doc);
  assert.deepEqual(state.doc, before);
});

test('hidden occurrences, actual core-generated pattern copies and whole subassemblies retain exact membership', async () => {
  let doc = fixture();
  doc = { ...doc, instances: doc.instances!.map(i => i.id === 'p1' ? { ...i, hidden: true } : i) };
  doc = addInstancePattern(doc, { seed: 'p2', kind: 'linear', count: 2, spacing: 30, dir: [1, 0, 0] }).doc;
  const generated = doc.instances!.find(i => i.pattern)!; assert.ok(generated);
  const child = { ...emptyDoc(), instances: [{ id: 'child', name: 'Child', doc: rectanglePart(2, 2, 2), position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] }] };
  doc = { ...doc, instances: [...doc.instances!, { id: 'sub', name: 'Whole subassembly', doc: child, position: [0, 40, 0], rotation: [0, 0, 0] }] };
  const before = structuredClone(doc), parts = ['p1', generated.id, 'sub'];
  const result = await dispatchTool(stateOf(doc), 'assembly', { action: 'add_step', name: 'Supported top-level members', parts }, evaluate);
  assert.equal(result.isError, false, result.content); assert.deepEqual(result.state.doc.assemblySteps!.at(-1)!.add, parts);
  physicalSame(doc, result.state.doc); assert.deepEqual(doc, before);
  // Model-generated pattern membership is not a claim of actual pattern UI qualification.
});

test('empty membership and duplicate requests retain the existing core authoring semantics', async () => {
  for (const parts of [[], ['p1', 'p1']]) {
    const state = stateOf(), before = structuredClone(state.doc);
    const result = await dispatchTool(state, 'assembly', { action: 'add_step', name: 'Explicit step', parts }, evaluate);
    assert.equal(result.isError, false, result.content);
    assert.deepEqual(result.state.doc.assemblySteps!.at(-1)!.add, [...new Set(parts)]);
    physicalSame(state.doc, result.state.doc); assert.deepEqual(state.doc, before);
  }
});

test('proposal summary identifies the authored step and preserves a mixed feature-change summary without leaking saved notes', async () => {
  const state = stateOf(), before = structuredClone(state.doc);
  const step = { tool: 'add_assembly_step', args: { name: '  Fit exact pair  ', parts: ['p2', 'p1', 'p2'] } };
  const feature = { tool: 'run_command', args: { command: 'box', values: { w: 12, d: 8, h: 4 } } };
  async function make(ops: typeof step[] | (typeof step | typeof feature)[]) {
    const result = await runTool(state, 'propose', { title: 'Review explicit changes', ops }, evaluate);
    assert.equal(result.isError, false, result.content);
    return result.state.doc.proposals!.at(-1)!;
  }
  const only = await make([step]);
  const dispatched = await dispatchTool(state, 'add_assembly_step', step.args, evaluate);
  assert.equal(dispatched.isError, false, dispatched.content);
  const saved = dispatched.state.doc.assemblySteps!.at(-1)!;
  for (const value of [saved.id, JSON.stringify('Fit exact pair'), JSON.stringify(['p2', 'p1'])]) assert.ok(only.summary.includes(value), `${value}: ${only.summary}`);
  assert.ok(!only.summary.includes('Synthetic preserved note'));
  const ordinary = await make([feature]), mixed = await make([feature, step]);
  assert.notEqual(ordinary.summary, 'no change');
  assert.ok(mixed.summary.includes(ordinary.summary), `${mixed.summary} should retain ${ordinary.summary}`);
  assert.ok(mixed.summary.includes(JSON.stringify('Fit exact pair')));
  assert.ok(mixed.summary.includes(JSON.stringify(['p2', 'p1'])));
  assert.ok(!mixed.summary.includes('Synthetic preserved note'));
  assert.deepEqual(state.doc, before);
});

test('a skipped earlier opId does not shift step proposal summary ownership', async () => {
  const state: ChatState = { ...stateOf(), tx: { applied: ['already'], checkpoints: {} } };
  const result = await runTool(state, 'propose', { title: 'Only the unexecuted step', ops: [
    { tool: 'add_assembly_step', opId: 'already', args: { name: 'SKIPPED_NAME_NOT_APPLIED', parts: ['p3'] } },
    { tool: 'assembly', args: { action: 'add_step', name: 'Actual second operation', parts: ['p2'] } },
  ] }, evaluate);
  assert.equal(result.isError, false, result.content);
  const proposal = result.state.doc.proposals!.at(-1)!;
  assert.equal(proposal.ops.length, 1);
  assert.ok(proposal.summary.includes(JSON.stringify('Actual second operation')));
  assert.ok(proposal.summary.includes(JSON.stringify(['p2'])));
  assert.ok(!proposal.summary.includes('SKIPPED_NAME_NOT_APPLIED'));
  assert.deepEqual(result.state.doc.assemblySteps, state.doc.assemblySteps);
});
