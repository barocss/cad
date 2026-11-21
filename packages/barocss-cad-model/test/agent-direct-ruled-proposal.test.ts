import assert from 'node:assert/strict';
import test from 'node:test';
import { directInspectionRevision } from '../src/chat/sweepSource';
import { acceptProposal, dispatchTool, previewProposal, type ChatState } from '../src/chat/tools';
import { directOps, emptyDirect, importSource } from '../src/engine/direct';
import { emptyDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';

const evaluate = async (doc: ChatState['doc']) => evaluatePart(doc, 1);
const call = (state: ChatState, tool: string, args: Record<string, unknown>) => dispatchTool(state, tool, args, evaluate);

function setup() {
  const direct = importSource(emptyDirect(), `@model rails {version:0;length-unit:mm;
    @curve #a {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,0,0],[20,0,0]];weights:[1,1];}
    @curve #b {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,10,0],[20,10,5]];weights:[1,1];}
  }`, 'Rails');
  const state: ChatState = { doc: { ...emptyDoc(), direct }, bodies: [] };
  const [first, second] = direct.objects.map(object => object.id);
  const command = { action: 'command', command: 'direct-ruled', values: { first, second }, expectedRevision: directInspectionRevision(state.doc) };
  const ops = [{ tool: 'features', args: command }];
  return { state, direct, first, second, command, ops };
}

test('a Direct Ruled surface requires human approval even if the saved risk was cleared', async () => {
  const { state, direct, first, second, command, ops } = setup();
  const forbidden = await dispatchTool(state, 'features', command, evaluate);
  assert.equal(forbidden.state, state);
  assert.equal(JSON.parse(forbidden.content).code, 'needs_approval');

  const proposed = await dispatchTool(state, 'proposals', { action: 'propose', title: 'Ruled sheet', ops }, evaluate);
  assert.equal(proposed.isError, false, proposed.content);
  const pending = proposed.state;
  assert.deepEqual(pending.doc.direct, direct);
  const [proposal] = pending.doc.proposals!;
  assert.deepEqual(proposal.risk.approval, ['Direct geometry']);
  const preview = await previewProposal(pending, proposal.id, evaluate);
  assert.ok('doc' in preview);
  assert.deepEqual(preview.doc.direct, directOps.ruledSurface(direct, first, second));

  const forged: ChatState = { ...pending, doc: { ...pending.doc, proposals: [{ ...proposal, risk: { ...proposal.risk, approval: [] } }] } };
  assert.deepEqual(await acceptProposal(forged, proposal.id, evaluate, { by: { agent: 'chat' } }),
    { error: 'A Direct geometry proposal needs approval by the user in Studio.' });
  assert.deepEqual(forged.doc.direct, direct);
  const edited = { ...pending, doc: { ...pending.doc, direct: directOps.rename(direct, second, 'Renamed rail') } };
  assert.ok('error' in await previewProposal(edited, proposal.id, evaluate));
  assert.ok('error' in await acceptProposal(edited, proposal.id, evaluate));

  const accepted = await acceptProposal(pending, proposal.id, evaluate);
  assert.ok('state' in accepted);
  assert.deepEqual(accepted.state.doc.direct, preview.doc.direct);
  assert.equal(accepted.state.doc.proposals?.[0].decided?.by, 'user');
});

test('an Agent image of a Ruled proposal pins both the exact candidate and its current source', async () => {
  const { state, direct, second, ops, command } = setup();
  const proposed = await call(state, 'proposals', { action: 'propose', title: 'Ruled sheet', ops });
  assert.equal(proposed.isError, false, proposed.content);
  const pending = proposed.state, [proposal] = pending.doc.proposals!;
  const listed = await call(pending, 'proposals', { action: 'list' });
  const [{ directReviewRevision: expectedProposalRevision }] = JSON.parse(listed.content).proposals;
  const rendered = { action: 'render', expectedDirectRevision: command.expectedRevision, proposal: proposal.id, expectedProposalRevision };
  assert.match(expectedProposalRevision, /^[a-f0-9]{64}$/);
  const candidate = await call(pending, 'query', rendered);
  assert.equal(candidate.isError, false, candidate.content);
  const meta = JSON.parse(candidate.content);
  assert.deepEqual(meta.candidate, { proposal: proposal.id, proposalRevision: expectedProposalRevision, baseDirectRevision: command.expectedRevision });
  assert.equal(candidate.state, pending);
  assert.equal(candidate.changed, false);
  assert.deepEqual(pending.doc.direct, direct);

  const replaced = { ...pending, doc: { ...pending.doc, proposals: [{ ...proposal, title: 'Replaced at the same ID' }] } };
  const edited = { ...pending, doc: { ...pending.doc, direct: directOps.rename(direct, second, 'Renamed rail') } };
  const rejected = { ...pending, doc: { ...pending.doc, proposals: [{ ...proposal, status: 'rejected' as const }] } };
  const current = { ...rendered, expectedDirectRevision: directInspectionRevision(edited.doc) };
  for (const [source, args, code] of [
    [replaced, rendered, 'DIRECT_RENDER_PROPOSAL_STALE'],
    [edited, rendered, 'DIRECT_RENDER_STALE'],
    [edited, current, 'DIRECT_RENDER_PROPOSAL_STALE'],
    [rejected, rendered, 'DIRECT_RENDER_PROPOSAL_UNAVAILABLE'],
    [pending, { ...rendered, expectedProposalRevision: undefined }, 'DIRECT_RENDER_PROPOSAL_INPUT'],
  ] as const) {
    const out = await call(source, 'query', args);
    assert.equal(JSON.parse(out.content).code, code);
    assert.equal(out.images, undefined);
    assert.equal(out.state, source);
  }
});
