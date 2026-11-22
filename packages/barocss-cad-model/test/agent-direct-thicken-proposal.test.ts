import assert from 'node:assert/strict';
import test from 'node:test';
import { directInspectionRevision } from '../src/chat/sweepSource';
import { acceptProposal, dispatchTool, previewProposal, type ChatState } from '../src/chat/tools';
import { directOps, emptyDirect, geometryOf, importSource } from '../src/engine/direct';
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

test('an ordered rail pair proposes a Ruled sheet and exact semicylinder as one approved change', async () => {
  const weight = Math.SQRT1_2;
  const circle = [[10, 0], [10, 10], [0, 10], [-10, 10], [-10, 0]];
  const rail = (id: string, z: number) => `@curve #${id} {type:nurbs;degree:2;knots:[0,0,0,1,1,2,2,2];
    control-points:${JSON.stringify(circle.map(([x, y]) => [x, y, z]))};weights:[1,${weight},1,${weight},1];}`;
  const direct = importSource(emptyDirect(), `@model rails {version:0;length-unit:mm;${rail('low', 0)}${rail('high', 12)}}`, 'Rails');
  const [first, second] = direct.objects.map(object => object.id);
  const state: ChatState = { doc: { ...emptyDoc(), direct }, bodies: [] };
  const evaluate = async (doc: ChatState['doc']) => evaluatePart(doc, 1);
  const expectedRevision = directInspectionRevision(state.doc);
  const values = { first, second, t: 2, side: 'reverse', mode: 'exact-cylinder' };
  const command = { action: 'command', command: 'direct-thicken', expectedRevision, values };
  const propose = (from: ChatState, args: Record<string, unknown>) =>
    dispatchTool(from, 'proposals', { action: 'propose', title: 'Build and thicken the semicylinder', ops: [{ tool: 'features', args }] }, evaluate);

  // A second independent operation cannot reuse the pin from before its Ruled surface exists.
  const prior = directOps.ruledSurface(direct, first, second).objects.at(-1)!.id;
  const chained = await dispatchTool(state, 'proposals', { action: 'propose', title: 'Independent operations', ops: [
    { tool: 'features', args: { ...command, command: 'direct-ruled', values: { first, second } } },
    { tool: 'features', args: { ...command, values: { surface: prior, t: 2, side: 'reverse', mode: 'exact-cylinder' } } },
  ] }, evaluate);
  assert.equal(chained.changed, false);
  assert.equal(chained.state.doc, state.doc);
  assert.match(chained.content, /Direct inputs changed/);

  for (const [args, message] of [
    [{ ...command, values: { ...values, surface: prior } }, /either/],
    [{ ...command, values: { ...values, second: first } }, /distinct/],
    [{ ...command, values: { ...values, t: 10 } }, /kernel could not build this.*Nothing was applied/i],
    [{ ...command, expectedRevision: '0'.repeat(64) }, /Direct inputs changed/],
  ] as const) {
    const refused = await propose(state, args);
    assert.equal(refused.isError, true, refused.content);
    assert.equal(refused.changed, false);
    assert.equal(refused.state.doc, state.doc);
    assert.match(refused.content, message);
  }
  for (const objects of [[direct.objects[0], { ...direct.objects[1], hidden: true }], [...direct.objects, direct.objects[1]]]) {
    const invalid = { ...state, doc: { ...state.doc, direct: { ...direct, objects } } };
    const refused = await propose(invalid, { ...command, expectedRevision: directInspectionRevision(invalid.doc) });
    assert.equal(refused.changed, false);
    assert.equal(refused.state.doc, invalid.doc);
    assert.match(refused.content, /two unique visible Direct rail IDs/);
  }
  const directCall = await dispatchTool(state, 'features', command, evaluate);
  assert.equal(directCall.state, state);
  assert.match(directCall.content, /approval/);

  const proposed = await propose(state, command);
  assert.equal(proposed.isError, false, proposed.content);
  const pending = proposed.state, [p] = pending.doc.proposals!;
  assert.deepEqual([pending.doc.direct, pending.doc.nodes, pending.bodies], [direct, [], []]);
  assert.deepEqual(p.risk.approval, ['Direct geometry', 'Direct surface snapshot']);
  assert.match(p.summary, /Ruled surface/);
  const preview = await previewProposal(pending, p.id, evaluate);
  assert.ok('doc' in preview);
  const [node] = preview.doc.nodes;
  assert.equal(node.kind, 'thicken');
  assert.equal(node.mode, 'exact-cylinder');
  assert.deepEqual(preview.doc.direct!.objects.slice(0, 2), direct.objects);
  assert.equal(preview.doc.direct!.objects.length, 3);
  const sheet = preview.doc.direct!.objects[2];
  const { kind, id, ...source } = geometryOf(preview.doc.direct!, sheet);
  assert.equal(kind, 'surface');
  assert.equal(id, sheet.geometry);
  assert.deepEqual(node.surface, source);
  assert.ok(Math.abs((preview.bodies[0].volume ?? 0) - 216 * Math.PI) < 1e-7);
  const agent = await acceptProposal(pending, p.id, evaluate, { by: { agent: 'chat' } });
  assert.ok('error' in agent);
  assert.match(agent.error, /approval/);
  const partial = await acceptProposal(pending, p.id, evaluate, { leaveOut: ['n0'] });
  assert.ok('error' in partial);
  assert.match(partial.error, /accepted together/);
  const changed = { ...pending, doc: { ...pending.doc, direct: directOps.move(direct, [second], [0, 0, 1]) } };
  const stale = await acceptProposal(changed, p.id, evaluate);
  assert.ok('stale' in stale && stale.stale);
  const accepted = await acceptProposal(pending, p.id, evaluate);
  assert.ok('state' in accepted);
  assert.deepEqual([accepted.state.doc.direct, accepted.state.doc.nodes], [preview.doc.direct, preview.doc.nodes]);
  assert.equal(accepted.state.doc.proposals?.[0].decided?.by, 'user');
});
