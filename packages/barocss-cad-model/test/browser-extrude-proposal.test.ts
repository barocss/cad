import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep } from '@barocss/cad';
import { acceptProposal, dispatchTool, previewProposal, proposeBrowserBox, proposeBrowserBoxWidth, proposeBrowserClosedShell, proposeBrowserCylinder, proposeBrowserExtrude, proposeBrowserHole, runTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import { canonical, revisionOf } from '../src/util/revision';
import { commandById } from '../src/app/commands';
import { isEditableBox, isEditableCylinder } from '../src/app/editCommand';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
const neverEvaluate = async (): Promise<never> => assert.fail('A refused request must not evaluate a candidate');

test('browser Box stages one origin-aligned solid in an empty part', async () => {
  const state: ChatState = { doc: emptyDoc(), bodies: [] };
  const expectedRevision = revisionOf(state.doc);
  const args = { width: 80, depth: 50, height: 10, expectedRevision };
  const outcome = await proposeBrowserBox(state, args, evaluate);
  assert.ok(outcome.changed && !outcome.isError, outcome.content);
  const waiting = outcome.state;
  const proposal = waiting.doc.proposals?.at(-1);
  assert.ok(proposal && proposal.status === 'open');
  assert.equal(proposal.by.agent, 'browser');
  assert.equal(waiting.doc.nodes, state.doc.nodes);
  assert.equal(waiting.bodies, state.bodies);
  assert.equal(revisionOf(waiting.doc), expectedRevision);

  for (const [version, fields] of [
    [waiting, args],
    [await stock(), args],
    [state, { ...args, width: NaN }],
    [state, { ...args, depth: 0.5 }],
    [state, { ...args, height: Infinity }],
    [state, { ...args, expectedRevision: '0000000000000000' }],
  ] as const) {
    const refused = await proposeBrowserBox(version, fields, neverEvaluate);
    assert.ok(refused.isError && !refused.changed);
    assert.equal(refused.state, version);
  }
  assert.deepEqual(await acceptProposal(waiting, proposal.id, neverEvaluate, { by: { agent: 'chat' } }),
    { error: 'A browser proposal needs approval by the user in Studio.' });
  const preview = await previewProposal(waiting, proposal.id, evaluate);
  assert.ok('bodies' in preview);
  const applied = await acceptProposal(waiting, proposal.id, evaluate);
  assert.ok('state' in applied);
  assert.equal(applied.state.doc.proposals?.at(-1)?.decided?.by, 'user');
  for (const bodies of [preview.bodies, applied.state.bodies]) {
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].volume, 40000);
    assert.deepEqual(bodies[0].mesh.bounds, { min: [0, 0, 0], max: [80, 50, 10] });
  }
  const box = { ...applied.state, doc: JSON.parse(canonical(applied.state.doc)) as StudioDoc };
  assert.equal(revisionOf(box.doc), revisionOf(applied.state.doc));
  const edit = { body: box.bodies[0].key, height: 15, expectedRevision: revisionOf(box.doc) };
  const belowMinimum = await proposeBrowserExtrude(box, { ...edit, height: 0.5 }, neverEvaluate);
  assert.ok(belowMinimum.isError && !belowMinimum.changed);
  const next = await proposeBrowserExtrude(box, edit, evaluate);
  assert.ok(next.changed && !next.isError, next.content);
  const editProposal = next.state.doc.proposals?.at(-1);
  assert.ok(editProposal);
  const revised = await acceptProposal(next.state, editProposal.id, evaluate);
  assert.ok('state' in revised);
  assert.ok(isEditableBox(revised.state.doc.nodes, 0));
  assert.deepEqual(revised.state.doc.nodes.map(node => node.id), box.doc.nodes.map(node => node.id));
  assert.equal(revised.state.bodies[0].volume, 60000);
});

async function stock(height = 10): Promise<ChatState> {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] });
  const doc = withNode(sketch, { kind: 'extrude', sketch: 0, height });
  const result = await evaluate(doc);
  assert.ok(result.ok);
  return { doc, bodies: result.bodies };
}

test('browser Cylinder stages a replayable round part at the origin', async () => {
  const source: ChatState = { doc: emptyDoc(), bodies: [] };
  const args = { radius: 5, height: 10, expectedRevision: revisionOf(source.doc) };
  for (const invalid of [{ ...args, radius: 0.49 }, { ...args, height: 0.99 }, { ...args, expectedRevision: '0000000000000000' }]) {
    const refused = await proposeBrowserCylinder(source, invalid, neverEvaluate);
    assert.ok(refused.isError && !refused.changed);
    assert.equal(refused.state, source);
  }
  const waiting = await proposeBrowserCylinder(source, args, evaluate);
  assert.ok(waiting.changed && !waiting.isError, waiting.content);
  assert.equal(waiting.state.doc.nodes, source.doc.nodes);
  const proposal = waiting.state.doc.proposals?.at(-1);
  assert.ok(proposal && proposal.status === 'open');
  assert.equal(proposal.by.agent, 'browser');
  assert.deepEqual(await acceptProposal(waiting.state, proposal.id, neverEvaluate, { by: { agent: 'chat' } }),
    { error: 'A browser proposal needs approval by the user in Studio.' });
  const accepted = await acceptProposal(waiting.state, proposal.id, evaluate);
  assert.ok('state' in accepted);
  assert.ok(isEditableCylinder(accepted.state.doc.nodes, 0));
  const [body] = accepted.state.bodies;
  const bounds = { min: [-5, -5, 0], max: [5, 5, 10] };
  for (const side of ['min', 'max'] as const)
    body.mesh.bounds[side].forEach((value, axis) => assert.ok(Math.abs(value - bounds[side][axis]) < 1e-10));
  assert.ok(body.volume !== null && Math.abs(body.volume - 250 * Math.PI) < 1e-8);
});

test('browser Hole stages a native axial through cut on a translated Cylinder', async () => {
  const command = commandById('cylinder');
  assert.ok(command?.build);
  const authored = command.build({ doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } },
    { r: 5, h: 10, x: 8, y: -3, z: 4 });
  const doc = JSON.parse(canonical(authored)) as StudioDoc;
  assert.notEqual(JSON.stringify(doc.nodes), JSON.stringify(authored.nodes));
  assert.equal(revisionOf(doc), revisionOf(authored));
  const evaluated = await evaluate(doc);
  assert.ok(evaluated.ok);
  const state: ChatState = { doc, bodies: evaluated.bodies };
  const args = { body: state.bodies[0].key, diameter: 4, expectedRevision: revisionOf(doc) };
  const unknown = { ...state, bodies: [{ ...state.bodies[0], topology: undefined }] };
  const rectangle = await stock();
  const mismatched = { ...doc, nodes: doc.nodes.map(node => node.kind === 'extrude' && node.made
    ? { ...node, made: { ...node.made, values: { ...node.made.values, h: 11 } } } : node) };
  for (const [version, fields] of [
    [state, { ...args, diameter: 0.49 }], [state, { ...args, diameter: 10 }],
    [state, { ...args, body: 'other' }], [state, { ...args, expectedRevision: '0000000000000000' }],
    [unknown, args], [rectangle, { ...args, expectedRevision: revisionOf(rectangle.doc) }],
    [{ ...state, doc: mismatched }, { ...args, expectedRevision: revisionOf(mismatched) }],
  ] as const) {
    const refused = await proposeBrowserHole(version, fields, neverEvaluate);
    assert.ok(refused.isError && !refused.changed);
    assert.equal(refused.state, version);
  }
  const waiting = await proposeBrowserHole(state, args, evaluate);
  assert.ok(waiting.changed && !waiting.isError, waiting.content);
  assert.equal(waiting.state.doc.nodes, doc.nodes);
  assert.equal(waiting.state.bodies, state.bodies);
  const proposal = waiting.state.doc.proposals?.at(-1);
  assert.ok(proposal && proposal.status === 'open');
  assert.deepEqual(await acceptProposal(waiting.state, proposal.id, neverEvaluate, { by: { agent: 'chat' } }),
    { error: 'A browser proposal needs approval by the user in Studio.' });
  const preview = await previewProposal(waiting.state, proposal.id, evaluate);
  assert.ok('bodies' in preview);
  const applied = await acceptProposal(waiting.state, proposal.id, evaluate);
  assert.ok('state' in applied);
  const [sketch, extrusion, hole] = applied.state.doc.nodes;
  assert.deepEqual([sketch, extrusion], doc.nodes);
  assert.ok(hole?.kind === 'hole');
  assert.deepEqual(hole.center, [8, -3]);
  assert.deepEqual(hole.parent, { node: 1, side: 'solid' });
  assert.equal(hole.radius, 2);
  assert.equal(hole.face, 'n1.top');
  assert.equal(hole.depth, undefined);
  assert.equal(proposal.ops[0].args?.command, 'hole');
  for (const bodies of [preview.bodies, applied.state.bodies]) {
    assert.equal(bodies.length, 1);
    const [body] = bodies;
    assert.ok(body.volume !== null && Math.abs(body.volume - 210 * Math.PI) < 1e-8);
    assert.deepEqual(body.topology, { kind: 'solid', bodyCount: 1, openShells: 0, boundaryEdges: 0 });
  }
  const [result] = partBreps(applied.state.doc);
  const native = checkBrep(result.brep, { strict: true });
  assert.ok(native.valid, native.issues.join('\n'));
  assert.equal(native.topology.length, 1);
  assert.equal(native.topology[0].genus, 1);
  assert.equal(result.brep.faces.length, 6);
  assert.equal(result.brep.edges.length, 12);
});

test('browser Shell stages a closed cavity with independent wall, floor and ceiling thicknesses', async () => {
  const command = commandById('cylinder');
  assert.ok(command?.build);
  const doc = command.build({ doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } },
    { r: 15, h: 20, x: 14, y: 9, z: 3 });
  const evaluated = await evaluate(doc);
  assert.ok(evaluated.ok);
  const state: ChatState = { doc, bodies: evaluated.bodies };
  const args = { body: state.bodies[0].key, wall: 2, floor: 3, ceiling: 5, expectedRevision: revisionOf(doc) };
  const rectangle = await stock();
  const unknown = { ...state, bodies: [{ ...state.bodies[0], topology: undefined }] };

  for (const [version, fields] of [
    [state, { ...args, wall: NaN }], [state, { ...args, wall: 14.999 }],
    [state, { ...args, floor: 15 }], [state, { ...args, ceiling: 0.099 }],
    [state, { ...args, ceiling: Infinity }], [state, { ...args, body: 'other' }],
    [state, { ...args, expectedRevision: '0000000000000000' }],
    [unknown, args], [rectangle, { ...args, expectedRevision: revisionOf(rectangle.doc) }],
  ] as const) {
    const refused = await proposeBrowserClosedShell(version, fields, neverEvaluate);
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state, version);
  }

  const waiting = await proposeBrowserClosedShell(state, args, evaluate);
  assert.ok(waiting.changed && !waiting.isError, waiting.content);
  assert.equal(waiting.state.doc.nodes, doc.nodes);
  assert.equal(waiting.state.bodies, state.bodies);
  assert.equal(revisionOf(waiting.state.doc), args.expectedRevision);
  const proposal = waiting.state.doc.proposals?.at(-1);
  assert.ok(proposal && proposal.status === 'open');
  assert.equal(proposal.by.agent, 'browser');
  assert.deepEqual(await acceptProposal(waiting.state, proposal.id, neverEvaluate, { by: { agent: 'chat' } }),
    { error: 'A browser proposal needs approval by the user in Studio.' });

  const preview = await previewProposal(waiting.state, proposal.id, evaluate);
  assert.ok('bodies' in preview);
  const approved = await acceptProposal(waiting.state, proposal.id, evaluate);
  assert.ok('state' in approved);
  assert.equal(approved.state.doc.proposals?.at(-1)?.decided?.by, 'user');
  const [sketch, extrusion, shell] = approved.state.doc.nodes;
  assert.deepEqual([sketch, extrusion], doc.nodes);
  assert.ok(shell?.kind === 'shell');
  assert.deepEqual([shell.open, shell.floorThickness, shell.ceilingThickness], [[], 3, 5]);
  for (const bodies of [preview.bodies, approved.state.bodies]) {
    assert.equal(bodies.length, 1);
    assert.ok(Math.abs(bodies[0].volume! - 2472 * Math.PI) < 1e-7);
    assert.deepEqual(bodies[0].mesh.bounds, state.bodies[0].mesh.bounds);
  }
  const [result] = partBreps(approved.state.doc);
  const native = checkBrep(result.brep, { strict: true });
  assert.ok(native.valid, native.issues.join('\n'));
  assert.equal(native.topology.length, 1);
  assert.equal(native.topology[0].genus, 0);
  assert.equal(result.brep.shells.length, 2);
  assert.ok(result.brep.shells.every(shell => shell.closed));
});

test('browser Extrude retains a standalone Cylinder command and literal circle geometry', async () => {
  const command = commandById('cylinder');
  assert.ok(command?.build);
  const doc = command.build({ doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } },
    { r: 5, h: 10, x: 8, y: -3, z: 4 });
  assert.ok(isEditableCylinder(doc.nodes, 0));
  const evaluated = await evaluate(doc);
  assert.ok(evaluated.ok);
  const state: ChatState = { doc, bodies: evaluated.bodies };
  const args = { body: state.bodies[0].key, height: 15, expectedRevision: revisionOf(doc) };
  const refused = await proposeBrowserExtrude(state, { ...args, height: 0.5 }, neverEvaluate);
  assert.ok(refused.isError && !refused.changed);
  const draft = { ...doc, nodes: doc.nodes.map(node => node.kind === 'extrude' ? { ...node, draft: 3, made: undefined } : node) };
  const drafted = await proposeBrowserExtrude({ ...state, doc: draft }, { ...args, expectedRevision: revisionOf(draft) }, neverEvaluate);
  assert.ok(drafted.isError && !drafted.changed);
  const waiting = await proposeBrowserExtrude(state, args, evaluate);
  assert.ok(waiting.changed && !waiting.isError, waiting.content);
  assert.equal(waiting.state.doc.nodes, doc.nodes);
  const proposal = waiting.state.doc.proposals?.at(-1);
  assert.ok(proposal);
  const applied = await acceptProposal(waiting.state, proposal.id, evaluate);
  assert.ok('state' in applied);
  const [before, after] = [doc, applied.state.doc].map(current => current.nodes[1]);
  assert.ok(before.kind === 'extrude' && before.made && after.kind === 'extrude');
  assert.deepEqual(after, { ...before, height: 15, made: { ...before.made, values: { ...before.made.values, h: 15 } } });
  assert.equal(applied.state.doc.nodes[0], doc.nodes[0]);
  assert.deepEqual(applied.state.doc.outputs, doc.outputs);
  assert.ok(isEditableCylinder(applied.state.doc.nodes, 0));
  const acceptedVolume = applied.state.bodies[0].volume;
  assert.ok(acceptedVolume !== null && Math.abs(acceptedVolume - 375 * Math.PI) < 1e-8);

  const literal = { ...doc, nodes: [doc.nodes[0], { ...before, made: undefined }] };
  const raw = await proposeBrowserExtrude({ ...state, doc: literal }, { ...args, height: 0.5, expectedRevision: revisionOf(literal) }, evaluate);
  assert.ok(raw.changed && !raw.isError, raw.content);
  const rawProposal = raw.state.doc.proposals?.at(-1);
  assert.ok(rawProposal);
  const preview = await previewProposal(raw.state, rawProposal.id, evaluate);
  assert.ok('bodies' in preview);
  const previewVolume = preview.bodies[0].volume;
  assert.ok(previewVolume !== null && Math.abs(previewVolume - 12.5 * Math.PI) < 1e-8);
});

test('browser Extrude stages one exact value change for the user to approve', async () => {
  const state = await stock();
  const expectedRevision = revisionOf(state.doc), body = state.bodies[0].key;
  const args = { body, height: 15, expectedRevision };
  const outcome = await proposeBrowserExtrude(state, args, evaluate);
  assert.ok(outcome.changed && !outcome.isError, outcome.content);
  const waiting = outcome.state;
  const proposal = waiting.doc.proposals?.at(-1);
  assert.ok(proposal && proposal.status === 'open');
  assert.equal(proposal.by.agent, 'browser');
  assert.equal(waiting.doc.nodes, state.doc.nodes);
  assert.equal(waiting.bodies, state.bodies);
  assert.equal(revisionOf(waiting.doc), expectedRevision);
  for (const [version, fields] of [
    [waiting, args],
    [state, { ...args, body: 'other' }],
    [state, { ...args, height: 10 }],
    [state, { ...args, height: Infinity }],
    [state, { ...args, height: -1 }],
    [await stock(11), args],
  ] as const) {
    const refused = await proposeBrowserExtrude(version, fields, neverEvaluate);
    assert.ok(refused.isError && !refused.changed);
    assert.equal(refused.state, version);
  }
  const preview = await previewProposal(waiting, proposal.id, evaluate);
  assert.ok('bodies' in preview);
  assert.equal(preview.bodies[0].volume, 18000);
  assert.equal(waiting.bodies[0].volume, 12000);

  const prior = process.env.CAD_AUTONOMY;
  try {
    process.env.CAD_AUTONOMY = '4';
    const refused = await runTool(waiting, 'proposals', { action: 'accept', id: proposal.id }, neverEvaluate);
    assert.ok(refused.isError && !refused.changed);
    assert.match(refused.content, /browser proposal needs approval/);
    assert.deepEqual(await acceptProposal(waiting, proposal.id, neverEvaluate, { by: { agent: 'chat' } }),
      { error: 'A browser proposal needs approval by the user in Studio.' });
  } finally {
    if (prior === undefined) delete process.env.CAD_AUTONOMY;
    else process.env.CAD_AUTONOMY = prior;
  }
  const applied = await acceptProposal(waiting, proposal.id, evaluate);
  assert.ok('state' in applied);
  assert.equal(applied.state.bodies[0].volume, 18000);
  assert.equal(applied.state.doc.proposals?.at(-1)?.decided?.by, 'user');
});

test('browser Box width resolves both reference X sides and requires explicit approval', async () => {
  let stock: ChatState = { doc: emptyDoc(), bodies: [] };
  for (const values of [
    { x: 2.25, y: -4.5, z: 2.125, w: 12, d: 8, h: 6 },
    { x: 32.75, y: 9, z: -2, w: 7, d: 5, h: 4 },
  ]) {
    const authored = await dispatchTool(stock, 'features', { action: 'command', command: 'box', values }, evaluate);
    assert.ok(authored.changed && !authored.isError, authored.content);
    stock = authored.state;
  }
  const args = { body: 'b1', referenceBody: 'b3', referenceSide: 'left' as const, expectedRevision: revisionOf(stock.doc) };
  for (const bad of [{ ...args, body: 'b3' }, { ...args, referenceBody: 'b1' }, { ...args, expectedRevision: '0000000000000000' }]) {
    const refusal = await proposeBrowserBoxWidth(stock, bad, neverEvaluate);
    assert.ok(refusal.isError && !refusal.changed);
    assert.equal(refusal.state, stock);
  }
  for (const [referenceSide, targetX] of [['left', 32.75], ['right', 39.75]] as const) {
    const staged = await proposeBrowserBoxWidth(stock, { ...args, referenceSide }, evaluate);
    assert.ok(staged.changed && !staged.isError, staged.content);
    assert.equal(staged.state.doc.nodes, stock.doc.nodes);
    const proposal = staged.state.doc.proposals?.at(-1);
    assert.ok(proposal && proposal.status === 'open');
    assert.equal(proposal.by.agent, 'browser');
    const secondGrant = await proposeBrowserBoxWidth(staged.state, args, neverEvaluate);
    assert.ok(secondGrant.isError && !secondGrant.changed);
    assert.ok('error' in await acceptProposal(staged.state, proposal.id, neverEvaluate, { by: { agent: 'chat' } }));
    const approved = await acceptProposal(staged.state, proposal.id, evaluate);
    assert.ok('state' in approved);
    const { doc, bodies } = approved.state;
    assert.deepEqual(doc.nodes.slice(2), stock.doc.nodes.slice(2));
    assert.deepEqual(partBreps(doc)[1], partBreps(stock.doc)[1]);
    assert.ok(isEditableBox(doc.nodes, 0) && isEditableBox(doc.nodes, 2));
    const result = bodies.find(b => b.key === 'b1');
    assert.equal(result?.mesh.bounds.min[0], 2.25);
    assert.equal(result?.mesh.bounds.max[0], targetX);
    assert.ok(Math.abs((result?.volume ?? 0) - (targetX - 2.25) * 8 * 6) < 1e-9);
  }
});
