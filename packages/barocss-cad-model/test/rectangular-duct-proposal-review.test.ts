import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { sweepPath } from '../src/app/profileCommands';
import { rectangularDuctProposal, reviewedRectangularDuctEvidence } from '../src/chat/rectangularDuctProposalReview';
import { sweepSourceRevision } from '../src/chat/sweepSource';
import { emptyDoc, withNode, type ModelNode } from '../src/engine/doc';
import type { Proposal } from '../src/engine/schema/proposals';
import { digestOf } from '../src/util/digest';
import { revisionOf } from '../src/util/revision';

const text = `@model rails { version:0; length-unit:mm;
  @curve #s-bend { type:nurbs; degree:2; knots:[0,0,0,1,1,2,2,2];
    control-points:[[0,0,0],[12,0,0],[12,12,0],[12,30,0],[30,30,0]];
    weights:[1,0.7071067811865476,1,0.7071067811865476,1]; } }`;

async function fixture() {
  const base = { ...withNode(emptyDoc(), {
    kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3],
    holes: [[[-1, -2], [-1, 2], [1, 2], [1, -2]].map(start => ({ kind: 'line' as const, start: start as [number, number] }))],
    sideTags: { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8']] },
  }), direct: { sources: { rails: text }, objects: [{ id: 's-bend', name: 'S-bend rail', source: 'rails', geometry: 's-bend' }] } };
  const pin = await sweepSourceRevision(base, 's-bend');
  assert.ok('revision' in pin);
  const proposal: Proposal = {
    id: 'P1', title: 'Exact rectangular duct', status: 'open', by: { agent: 'chat' }, at: '2026-11-22T16:24:01.567Z', base: 'test',
    ops: [{ tool: 'run_command', args: { command: 'sweep-curve', expectedRevision: revisionOf(base), values: {
      sketch: 'n0', path: 's-bend', pathRevision: pin.revision, representation: 'exact',
    } } }], risk: { level: 'low', features_touched: 1, references_broken: 0, hard_requirements_changed: [], approval: [] }, summary: '1 added',
  };
  const copied = sweepPath(base, ['s-bend']);
  assert.notEqual(typeof copied, 'string');
  if (typeof copied === 'string') throw new Error(copied);
  const candidate = withNode(base, { kind: 'sweep-curve', sketch: 0, name: copied.name, path: copied.path, mode: 'exact' });
  const edit = rectangularDuctProposal(base, proposal);
  assert.ok(edit);
  return { base, candidate, proposal, edit };
}

test('one pinned rectangular duct creation proves both native openings and all eight tangent seams without changing its source', async () => {
  const { base, candidate, proposal, edit } = await fixture(), before = structuredClone(base), after = structuredClone(candidate);
  assert.equal(edit.revision, digestOf(proposal));
  const evidence = await reviewedRectangularDuctEvidence(base, candidate, edit);
  assert.ok(evidence);
  const { brep, rectangularDuct: duct } = evidence;
  assert.deepEqual([duct.body, duct.sketch, duct.path, duct.pathRevision], ['b1', 'n0', 's-bend', edit.pathRevision]);
  assert.deepEqual(duct.caps.map(cap => cap.name), ['n1.start', 'n1.end']);
  for (const cap of duct.caps) {
    assert.equal(cap.outerEdges.length, 4);
    assert.equal(cap.innerEdges.length, 4);
    assert.equal(new Set([...cap.outerEdges, ...cap.innerEdges]).size, 8);
    assert.ok([...cap.outerEdges, ...cap.innerEdges].every(id => brep.edges.find(edge => edge.id === id)?.curve.degree === 1));
  }
  assert.equal(duct.exteriorSeams.length, 4);
  assert.equal(duct.interiorSeams.length, 4);
  assert.equal(new Set([...duct.exteriorSeams, ...duct.interiorSeams]).size, 8);
  assert.deepEqual(checkBrep(brep, { strict: true }).topology.map(item => item.genus), [1]);
  assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 240 * Math.PI) < 1e-7);
  assert.deepEqual(base, before);
  assert.deepEqual(candidate, after);
  assert.equal(await reviewedRectangularDuctEvidence(base, base, edit), undefined);
  assert.equal(await reviewedRectangularDuctEvidence(base, candidate, { ...edit, pathRevision: 'a'.repeat(64) }), undefined);
  assert.equal(await reviewedRectangularDuctEvidence(base, candidate, { ...edit, path: 'other' }), undefined);
  assert.equal(await reviewedRectangularDuctEvidence(base, { ...candidate, direct: { ...base.direct, sources: { rails: text + '\n' } } }, edit), undefined);
  assert.equal(await reviewedRectangularDuctEvidence({ ...base, direct: { ...base.direct, sources: { rails: text + '\n' } } }, candidate, edit), undefined);
  for (const patch of [{ mode: 'exact-straight' }, { sketch: 1 }, { name: 'Other rail' }, { suppressed: true }, { id: 'n0' }]) {
    const nodes = [candidate.nodes[0], { ...candidate.nodes[1], ...patch } as ModelNode];
    assert.equal(await reviewedRectangularDuctEvidence(base, { ...candidate, nodes }, edit), undefined);
  }
  const sweep = candidate.nodes[1];
  assert.ok(sweep.kind === 'sweep-curve');
  const changedPath = { ...sweep.path, controlPoints: sweep.path.controlPoints.map(point => [...point] as [number, number, number]) };
  changedPath.controlPoints[1][0] += 1;
  assert.equal(await reviewedRectangularDuctEvidence(base, { ...candidate, nodes: [candidate.nodes[0], { ...sweep, path: changedPath }] }, edit), undefined);
  assert.equal(await reviewedRectangularDuctEvidence(base, { ...candidate, parameters: { extra: 1 } }, edit), undefined);
});

test('closed, stale, ambiguous, dependent and unrelated Sweep proposals do not receive a duct review revision', async () => {
  const { base, proposal } = await fixture(), op = proposal.ops[0], args = op.args!, values = args.values as Record<string, unknown>;
  for (const status of ['accepted', 'rejected'] as const) assert.equal(rectangularDuctProposal(base, { ...proposal, status }), undefined);
  for (const ops of [[], [op, op], [{ ...op, tool: 'features' }], [{ ...op, args: { ...args, faces: [] } }],
    [{ ...op, args: { ...args, expectedRevision: 'a'.repeat(16) } }],
    ...[{ representation: 'exact-straight' }, { sketch: 'missing' }, { path: 'missing' }, { pathRevision: 'bad' }, { op: 'new' }]
      .map(patch => [{ ...op, args: { ...args, values: { ...values, ...patch } } }])]) {
    assert.equal(rectangularDuctProposal(base, { ...proposal, ops }), undefined);
  }
  const current = (doc: typeof base) => ({ ...proposal, ops: [{ ...op, args: { ...args, expectedRevision: revisionOf(doc) } }] });
  for (const patch of [{ on: { node: 0, side: 'solid' } }, { plane: { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] } },
    { held: 'missing' }, { suppressed: true }, { holes: [] }, { sideTags: { outer: ['a', 'b', 'c', 'd'], holes: [['a', 'f', 'g', 'h']] } },
    { min: [{ parameter: 'width' }, -3] }, { holes: [[[-1, -2], [-1, 2], [1.1, 2], [1.1, -2]].map(start => ({ kind: 'line', start }))] }]) {
    const doc = { ...base, nodes: [{ ...base.nodes[0], ...patch } as ModelNode] };
    assert.equal(rectangularDuctProposal(doc, current(doc)), undefined);
  }
  const duplicates = { ...base, direct: { ...base.direct, objects: [...base.direct.objects, { ...base.direct.objects[0] }] } };
  assert.equal(rectangularDuctProposal(duplicates, current(duplicates)), undefined);
  const hidden = { ...base, direct: { ...base.direct, objects: [{ ...base.direct.objects[0], hidden: true }] } };
  assert.equal(rectangularDuctProposal(hidden, current(hidden)), undefined);
  const outputs = { ...base, outputs: { ghost: { node: 0, side: 'solid' as const } } };
  assert.equal(rectangularDuctProposal(outputs, current(outputs)), undefined);
});

test('hidden Join constituents can remain while the whole Direct source store stays pinned', async () => {
  const { base, proposal } = await fixture();
  const direct = { sources: { ...base.direct.sources, original: text }, objects: [
    ...base.direct.objects, { id: 'hidden-first', name: 'First source', source: 'original', geometry: 's-bend', hidden: true },
  ] };
  const doc = { ...base, direct }, edit = rectangularDuctProposal(doc, proposal);
  assert.ok(edit);
  const copied = sweepPath(doc, ['s-bend']);
  assert.ok(typeof copied !== 'string');
  const candidate = withNode(doc, { kind: 'sweep-curve', sketch: 0, name: copied.name, path: copied.path, mode: 'exact' });
  assert.ok(await reviewedRectangularDuctEvidence(doc, candidate, edit));
  const changed = { ...candidate, direct: { ...direct, objects: direct.objects.slice(0, 1) } };
  assert.equal(await reviewedRectangularDuctEvidence(doc, changed, edit), undefined);
  assert.equal(doc.direct.objects.length, 2);
});

test('retained authored outline constraints and construction metadata do not remove an independent numeric rectangle from review', async () => {
  const { base, proposal } = await fixture();
  const sketch = { ...base.nodes[0], outline: {
    points: [[-2, -3], [2, -3], [2, 3], [-2, 3]] as [number, number][], lengths: { 0: 4, 1: 6 }, hv: { h: [0, 2], v: [1, 3] },
  }, construction: [{ kind: 'line', a: [0, 0], b: [0, 1] }] } as ModelNode;
  const doc = { ...base, nodes: [sketch] };
  const current = { ...proposal, ops: [{ ...proposal.ops[0], args: { ...proposal.ops[0].args, expectedRevision: revisionOf(doc) } }] };
  const edit = rectangularDuctProposal(doc, current);
  assert.ok(edit);
  const copied = sweepPath(doc, ['s-bend']);
  assert.ok(typeof copied !== 'string');
  const candidate = withNode(doc, { kind: 'sweep-curve', sketch: 0, name: copied.name, path: copied.path, mode: 'exact' });
  assert.ok(await reviewedRectangularDuctEvidence(doc, candidate, edit));
  assert.deepEqual(candidate.nodes[0], sketch);
  const erased = { ...sketch };
  assert.ok(erased.kind === 'sketch');
  delete erased.outline;
  assert.equal(await reviewedRectangularDuctEvidence(doc, { ...candidate, nodes: [erased, candidate.nodes[1]] }, edit), undefined);
});
