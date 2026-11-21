import assert from 'node:assert/strict';
import test from 'node:test';
import { directInspectionRevision } from '../src/chat/sweepSource';
import { acceptProposal, dispatchTool, previewProposal, type ChatState } from '../src/chat/tools';
import { directOps, emptyDirect, importSource } from '../src/engine/direct';
import { emptyDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';

test('a Direct Ruled surface requires human approval even if the saved risk was cleared', async () => {
  const direct = importSource(emptyDirect(), `@model rails {version:0;length-unit:mm;
    @curve #a {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,0,0],[20,0,0]];weights:[1,1];}
    @curve #b {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,10,0],[20,10,5]];weights:[1,1];}
  }`, 'Rails');
  const state: ChatState = { doc: { ...emptyDoc(), direct }, bodies: [] };
  const [first, second] = direct.objects.map(object => object.id);
  const evaluate = async (doc: ChatState['doc']) => evaluatePart(doc, 1);
  const command = { action: 'command', command: 'direct-ruled', values: { first, second }, expectedRevision: directInspectionRevision(state.doc) };
  const ops = [{ tool: 'features', args: command }];
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
