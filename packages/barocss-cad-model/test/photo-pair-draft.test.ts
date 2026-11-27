import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { addPart } from '../src/assembly/edit';
import { acceptProposal, previewProposal, rebaseProposal, runTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, rectanglePart } from '../src/engine/doc';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import { twoViewAssignments, twoViewTrace } from './fixtures/two-view-reference';

const evaluate = async (doc: Parameters<typeof evaluatePart>[0]) => evaluatePart(doc, 1);

test('sketch and extrude a trace-pinned four-part proposal and replay it without the attached images', async () => {
  const front = twoViewTrace('front'), side = twoViewTrace('side');
  const doc = rectanglePart(12, 8, 5), base = await evaluate(doc);
  assert.ok(base.ok);
  const state: ChatState = { doc, bodies: base.bodies, images: [front, side] };
  const input = { frontImage: 1, sideImage: 2, ...twoViewAssignments(front, side) };
  type PairInput = Omit<typeof input, 'parts'> & { parts: { name: string; frontLayer: string; sideLayer?: string }[] };
  const read = async (values: PairInput = input) => {
    const measured = await runTool(state, 'image', { ...values, action: 'measure_pair' }, evaluate);
    assert.equal(measured.isError, false, measured.content);
    return JSON.parse(measured.content);
  };
  const report = await read();
  const stage = (traceRevision: string, values: PairInput = input) => runTool(state, 'image', { action: 'propose_pair', ...values, traceRevision }, evaluate);
  const stale = await stage('0'.repeat(64));
  assert.equal(JSON.parse(stale.content).code, 'PHOTO_DRAFT_STALE');
  assert.equal(stale.state, state);
  const missing = { ...input, parts: input.parts.map((part, i) => i === 0 ? { name: part.name, frontLayer: part.frontLayer } : part) };
  const incomplete = await stage((await read(missing)).evidence.traceRevision, missing);
  assert.equal(JSON.parse(incomplete.content).code, 'PHOTO_DRAFT_PROFILE');
  assert.equal(incomplete.state, state);

  const proposed = await stage(report.evidence.traceRevision);
  assert.equal(proposed.isError, false, proposed.content);
  const pending = proposed.state.doc;
  assert.deepEqual(pending.nodes, doc.nodes);
  assert.equal(pending.instances, undefined);
  assert.deepEqual(pending.proposals?.[0].risk.approval, ['assembly']);
  assert.match(pending.proposals?.[0].plan ?? '', /Supplied outside diameter 84 mm.*Hidden geometry.*Trace/);
  assert.equal(pending.proposals?.[0].ops.length, 8);
  const reopened: ChatState = { doc: JSON.parse(JSON.stringify(pending)), bodies: base.bodies };
  const rival = addPart(reopened.doc, { name: 'New companion', doc: rectanglePart(3, 4, 5) }).doc;
  const rebased = await rebaseProposal({ ...reopened, doc: rival }, 'P1', evaluate);
  assert.ok('error' in rebased);
  assert.match(rebased.error, /next part ID changed/);
  assert.deepEqual(rival.instances?.map(part => part.name), ['New companion']);
  const review = await previewProposal(reopened, 'P1', evaluate);
  assert.ok('doc' in review, JSON.stringify(review));
  const refusal = await runTool(reopened, 'proposals', { action: 'accept', id: 'P1' }, evaluate);
  assert.equal(refusal.isError, true);
  assert.equal(refusal.state, reopened);
  const decision = await acceptProposal(reopened, 'P1', evaluate, { by: { agent: 'user' } });
  assert.ok('state' in decision, JSON.stringify(decision));
  assert.deepEqual(decision.state.doc.instances, review.doc.instances);
  assert.deepEqual(decision.state.doc.nodes, doc.nodes);
  assert.equal(decision.state.doc.proposals?.[0].decided?.by, 'user');
  const instances = decision.state.doc.instances ?? [];
  assert.deepEqual(instances.map(p => p.name), ['Ring head', 'Handle', 'Filter cap', 'Button']);
  for (const [i, instance] of instances.entries()) {
    assert.deepEqual(instance.doc.nodes.map(node => node.kind), ['sketch', 'extrude']);
    const [{ brep }] = partBreps(instance.doc);
    assert.ok(checkBrep(brep, { strict: true }).valid);
    assert.deepEqual(brep.bodies.map(body => body.kind), ['solid']);
    assert.ok(brep.shells.every(shell => shell.closed));
    if (i === 0) assert.equal(brep.faces.filter(face => face.loops.length === 2).length, 2);
    else {
      const { widthMM, heightMM, depthMM } = report.parts[i];
      assert.ok(Math.abs(brepMassProperties(brep, 1).volume - widthMM * heightMM * depthMM) < 1e-5);
    }
  }
  const mismatch = await runTool({ doc: emptyDoc(), bodies: [], images: [front, twoViewTrace('side', 100)] }, 'image',
    { action: 'propose_pair', ...input, traceRevision: report.evidence.traceRevision }, evaluate);
  assert.equal(JSON.parse(mismatch.content).code, 'PHOTO_PAIR_ALIGNMENT');
});
