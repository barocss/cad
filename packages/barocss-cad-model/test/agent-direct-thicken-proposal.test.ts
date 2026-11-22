import assert from 'node:assert/strict';
import test from 'node:test';
import { directInspectionRevision } from '../src/chat/sweepSource';
import { acceptProposal, dispatchTool, previewProposal, type ChatState } from '../src/chat/tools';
import { directOps, emptyDirect, importSource } from '../src/engine/direct';
import { emptyDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';

test('a reviewed Direct Thicken snapshots the visible whole source and always needs Studio approval', async () => {
  const rails = importSource(emptyDirect(), `@model rails {version:0;length-unit:mm;
    @curve #a {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,0,3],[20,0,3]];weights:[1,1];}
    @curve #b {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,10,3],[20,10,3]];weights:[1,1];}
  }`, 'Rails');
  const direct = directOps.ruledSurface(rails, rails.objects[0].id, rails.objects[1].id), source = direct.objects.at(-1)!;
  const state: ChatState = { doc: { ...emptyDoc(), direct }, bodies: [] };
  const evaluate = async (doc: ChatState['doc']) => evaluatePart(doc, 1);
  const command = { action: 'command', command: 'direct-thicken', values: { surface: source.id, t: 2, side: 'both' }, expectedRevision: directInspectionRevision(state.doc) };
  const propose = (from: ChatState, args: Record<string, unknown>) => dispatchTool(from, 'proposals', {
    action: 'propose', title: 'Thicken the sheet', ops: [{ tool: 'features', args }],
  }, evaluate);
  const directCall = await dispatchTool(state, 'features', command, evaluate);
  assert.equal(directCall.state, state);
  assert.equal(JSON.parse(directCall.content).code, 'needs_approval');

  for (const change of [{ hidden: true }, { trims: [{ keep: 'inside' as const, uv: [[0, 0], [1, 0], [0, 1]] as [number, number][] }] }]) {
    const candidate = { ...state, doc: { ...state.doc, direct: { ...direct, objects: [...direct.objects.slice(0, -1), { ...source, ...change }] } } };
    const refused = await propose(candidate, { ...command, expectedRevision: directInspectionRevision(candidate.doc) });
    assert.equal(refused.isError, true, refused.content);
    assert.equal(refused.changed, false);
    assert.equal(refused.state.doc, candidate.doc);
  }

  const proposed = await propose(state, command);
  assert.equal(proposed.isError, false, proposed.content);
  const pending = proposed.state, [proposal] = pending.doc.proposals!;
  assert.deepEqual(proposal.risk.approval, ['Direct surface snapshot']);
  assert.deepEqual(pending.doc.nodes, []);
  assert.equal(pending.doc.direct, direct);
  const preview = await previewProposal(pending, proposal.id, evaluate);
  assert.ok('doc' in preview);
  assert.equal(preview.doc.nodes.at(-1)?.kind, 'thicken');
  const volume = preview.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - 400) < 1e-8);
  const forged = { ...pending, doc: { ...pending.doc, proposals: [{ ...proposal, risk: { ...proposal.risk, approval: [] } }] } };
  assert.deepEqual(await acceptProposal(forged, proposal.id, evaluate, { by: { agent: 'chat' } }),
    { error: 'A Direct Thicken proposal needs approval by the user in Studio.' });

  const accepted = await acceptProposal(pending, proposal.id, evaluate);
  assert.ok('state' in accepted);
  assert.deepEqual(accepted.state.doc.nodes, preview.doc.nodes);
  assert.equal(accepted.state.doc.direct, direct);
  assert.equal(accepted.state.doc.proposals?.[0].decided?.by, 'user');

  const trapezoid = { ...state, doc: { ...state.doc, direct: directOps.editSurfacePole(direct, source.id, 1, 1, { xMM: 15 }) } };
  const exact = await propose(trapezoid, { ...command, expectedRevision: directInspectionRevision(trapezoid.doc), values: { ...command.values, mode: 'exact-planar' } });
  assert.equal(exact.isError, false, exact.content);
  const exactPreview = await previewProposal(exact.state, proposal.id, evaluate);
  assert.ok('doc' in exactPreview);
  const exactNode = exactPreview.doc.nodes[0];
  assert.equal(exactNode.kind, 'thicken');
  assert.equal(exactNode.mode, 'exact-planar');
  const exactVolume = exactPreview.bodies[0].volume;
  assert.ok(exactVolume !== null && Math.abs(exactVolume - (20 + 15) / 2 * 10 * 2) < 1e-8);
});

test('a Direct Thicken proposal previews the exact obtuse sector before user approval', async () => {
  const weight = 1 / Math.sqrt(5);
  const direct = importSource(emptyDirect(), `@model sector {version:0;length-unit:mm;
    @surface #s {type:nurbs;degree-u:2;degree-v:1;knots-u:[0,0,0,1,1,1];knots-v:[0,0,1,1];
      control-points:[[[10,0,0],[10,0,12]],[[10,20,0],[10,20,12]],[[-6,8,0],[-6,8,12]]];
      weights:[[1,1],[${weight},${weight}],[1,1]];}
  }`, 'Sector');
  const state: ChatState = { doc: { ...emptyDoc(), direct }, bodies: [] };
  const evaluate = async (doc: ChatState['doc']) => evaluatePart(doc, 1);
  const proposed = await dispatchTool(state, 'proposals', { action: 'propose', title: 'Thicken the sector',
    ops: [{ tool: 'features', args: { action: 'command', command: 'direct-thicken', expectedRevision: directInspectionRevision(state.doc),
      values: { surface: direct.objects[0].id, t: 2, side: 'reverse', mode: 'exact-cylinder' } } }],
  }, evaluate);
  assert.equal(proposed.isError, false, proposed.content);
  assert.deepEqual(proposed.state.doc.nodes, []);
  const [proposal] = proposed.state.doc.proposals!;
  assert.deepEqual(proposal.risk.approval, ['Direct surface snapshot']);
  const preview = await previewProposal(proposed.state, proposal.id, evaluate);
  assert.ok('doc' in preview);
  const [node] = preview.doc.nodes;
  assert.equal(node.kind, 'thicken');
  assert.equal(node.mode, 'exact-cylinder');
  const volume = preview.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - Math.atan(2) * 36 * 12) < 1e-7);
  const accepted = await acceptProposal(proposed.state, proposal.id, evaluate);
  assert.ok('state' in accepted);
  assert.deepEqual(accepted.state.doc.nodes, preview.doc.nodes);
  assert.equal(accepted.state.doc.direct, direct);
});
