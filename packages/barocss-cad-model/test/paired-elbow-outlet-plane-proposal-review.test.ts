import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep } from '@barocss/cad';
import { pairedElbowInletPlaneProposal, pairedElbowOutletPlaneProposal, reviewedPairedElbowInletPlaneEvidence, reviewedPairedElbowOutletPlaneEvidence } from '../src/chat/pairedElbowOutletPlaneProposalReview';
import { emptyDoc, withNode, type BodyRef, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { offsetPlaneWitness } from '../src/engine/offsetPlane';
import { captureSignatures } from '../src/engine/references';
import type { Proposal } from '../src/engine/schema/proposals';
import { digestOf } from '../src/util/digest';
import { revisionOf } from '../src/util/revision';

const solid = (node: number): BodyRef => ({ node, side: 'solid' });
const near = (actual: number, expected: number) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);

function document(offset = 0, inlet = false): StudioDoc {
  let doc = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5],
    holes: [-2, 2].map(y => ([[-1, y - 1], [-1, y + 1], [1, y + 1], [1, y - 1]] as [number, number][])
      .map(start => ({ kind: 'line' as const, start }))),
    sideTags: { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8'], ['e9', 'e10', 'e11', 'e12']] } });
  doc = withNode(doc, { kind: 'sweep-curve', sketch: 0, name: 'Paired duct', mode: 'exact',
    path: { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5],
      controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 16, 0],
        [12, 20, 0], [12, 38, 0], [30, 38, 0], [33, 38, 0], [36, 38, 0]],
      weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1, 1, 1] } });
  doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: inlet ? [-19, -14] : [40, 52], max: inlet ? [-14, -8] : [45, 58] });
  doc = withNode(doc, { kind: 'extrude', sketch: 2, height: 4, from: 10 });
  doc = withNode(doc, { kind: 'translate', parent: solid(3), offset: [offset, 0, 0] });
  return { ...doc, outputs: { b1: solid(1), b4: solid(4) } };
}

function proposalFor(base: StudioDoc, referenceFace = 'n3.side3', sourceFace = 'n1.end'): Proposal {
  return { id: 'P1', title: 'Bind the original cap to a live plane', status: 'open', by: { agent: 'chat' },
    at: '2026-11-24T00:00:00.000Z', base: 'test', summary: '1 added',
    ops: [{ tool: 'run_command', args: { command: 'offset-face', expectedRevision: revisionOf(base),
      faces: [sourceFace, referenceFace], values: { offsetMode: 'to-plane' } } }],
    risk: { level: 'low', features_touched: 1, references_broken: 0, hard_requirements_changed: [], approval: [] } };
}

function fixture(offset = 0, referenceFace = 'n3.side3', inlet = false) {
  const sourceFace = inlet ? 'n1.start' : 'n1.end';
  const base = document(offset, inlet), proposal = proposalFor(base, referenceFace, sourceFace);
  const evaluated = evaluateDoc(base, 1); assert.ok(evaluated.ok, evaluated.ok ? '' : evaluated.error.detail);
  const original = partBreps(base), donor = original.find(output => output.key === 'b4')!.brep;
  const plane = offsetPlaneWitness(donor, referenceFace); assert.ok(plane);
  const target = { body: solid(4), feature: 'n4', face: referenceFace,
    normal: plane.normal, localAnchor: plane.localAnchor, localSupport: plane.localSupport };
  const candidate = captureSignatures(withNode(base, { kind: 'offset-face', parent: solid(1), faces: [sourceFace], target }), evaluated.bodies);
  const classify = inlet ? pairedElbowInletPlaneProposal : pairedElbowOutletPlaneProposal;
  const edit = classify(base, proposal); assert.ok(edit);
  return { base, proposal, bodies: evaluated.bodies, original, donor, candidate, edit };
}

for (const [offset, referenceFace, distance, relation] of [
  [0, 'n3.side3', 4, 'opposed'], [-8, 'n3.side3', -4, 'opposed'], [-5, 'n3.side1', 4, 'aligned'],
] as const) test(`linked outlet review proves ${distance} mm with ${relation} donor normal and retained native ownership`, async () => {
  const f = fixture(offset, referenceFace), saved = structuredClone({ base: f.base, candidate: f.candidate, proposal: f.proposal });
  const reviewed = await reviewedPairedElbowOutletPlaneEvidence(f.base, f.bodies, f.candidate, f.edit);
  assert.ok(reviewed && !('error' in reviewed));
  const e = reviewed.pairedElbowOutletPlaneOffset;
  assert.deepEqual([e.sourceBody, e.body, e.pathKind], ['b1', 'b5', 'line-arc-line-arc-line']);
  assert.equal(e.source.feature, 'n1'); assert.equal(e.source.face, 'n1.end');
  assert.equal(e.reference.body, 'b4'); assert.equal(e.reference.feature, 'n4'); assert.equal(e.reference.face, referenceFace);
  assert.equal(e.reference.normalRelation, relation); assert.deepEqual(e.reference.target, f.candidate.nodes[5].kind === 'offset-face' && f.candidate.nodes[5].target);
  assert.equal(e.reference.faceId, f.donor.faces.find(face => face.name === referenceFace)!.id);
  assert.equal(e.reference.bodySha256, digestOf(f.donor));
  assert.equal(e.source.bodySha256, digestOf(f.original.find(output => output.key === 'b1')!.brep));
  assert.deepEqual(e.candidate, { body: 'b5', feature: 'n5', face: 'n1.end', faceId: e.source.faceId, bodySha256: digestOf(reviewed.brep) });
  assert.equal('orientation' in e, false);
  const actual = partBreps(f.candidate);
  assert.deepEqual(actual.find(output => output.key === 'b4')!.brep, f.donor);
  const strict = checkBrep(reviewed.brep, { strict: true }); assert.ok(strict.valid);
  assert.deepEqual(strict.counts, { bodies: 1, shells: 1, faces: 62, loops: 66, coedges: 264, edges: 132, vertices: 72 });
  near(e.distance, distance); near(e.materialChange.native, 32 * distance); near(e.materialChange.analytic, 32 * distance);
  const length = 24 + 15 * Math.PI + distance;
  near(e.volume.original.native, 32 * (24 + 15 * Math.PI)); near(e.volume.candidate.native, 32 * length);
  const centroid = [(270 * Math.PI + 64 + 36 * distance + distance ** 2 / 2) / length,
    (252 * Math.PI + 536 + 38 * distance) / length, 0];
  e.centroid.native.forEach((value, axis) => near(value, centroid[axis]));
  assert.deepEqual(e.retained.inlet.center, [-10, 0, 0]); near(e.movedCap.center[0], 36 + distance);
  assert.equal(e.retained.faces.length, 49); assert.equal(e.movedCap.apertures.length, 2);
  const joins = e.retained.junctions!.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat();
  assert.equal(new Set(joins).size, 48);
  for (const id of [...joins, ...e.movedCap.outerEdges, ...e.movedCap.innerEdges,
    ...e.retained.inlet.outerEdges, ...e.retained.inlet.innerEdges])
    assert.equal(reviewed.brep.coedges.filter(use => use.edge === id && use.pcurve).length, 2);
  assert.deepEqual({ base: f.base, candidate: f.candidate, proposal: f.proposal }, saved);
});

for (const [offset, referenceFace, distance, relation] of [
  [0, 'n3.side1', 4, 'opposed'], [8, 'n3.side1', -4, 'opposed'], [8, 'n3.side3', 1, 'aligned'],
] as const) test(`linked inlet review proves ${distance} mm with ${relation} donor normal and retained native ownership`, async () => {
  const f = fixture(offset, referenceFace, true);
  const review = await reviewedPairedElbowInletPlaneEvidence(f.base, f.bodies, f.candidate, f.edit);
  assert.ok(review);
  const e = review.pairedElbowInletPlaneOffset, length = 24 + 15 * Math.PI + distance;
  assert.equal(e.pathKind, 'line-arc-line-arc-line');
  assert.deepEqual([e.source.body, e.source.feature, e.source.face], ['b1', 'n1', 'n1.start']);
  assert.deepEqual([e.reference.body, e.reference.feature, e.reference.face], ['b4', 'n4', referenceFace]);
  assert.equal(e.reference.normalRelation, relation);
  assert.equal(e.reference.bodySha256, digestOf(f.donor));
  assert.deepEqual(e.candidate, { body: 'b5', feature: 'n5', face: 'n1.start', faceId: e.source.faceId, bodySha256: digestOf(review.brep) });
  assert.deepEqual(e.retained.outlet.center, [36, 38, 0]);
  near(e.movedCap.center[0], -10 - distance); near(e.distance, distance);
  near(e.materialChange.native, 32 * distance); near(e.volume.candidate.native, 32 * length);
  near(e.centroid.native[0], (270 * Math.PI + 64 - 10 * distance - distance ** 2 / 2) / length);
  near(e.centroid.native[1], (252 * Math.PI + 536) / length);
  near(e.centroid.native[2], 0);
  assert.equal(e.movedCap.apertures.length, 2);
  assert.equal(new Set(e.retained.junctions!.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat()).size, 48);
});

test('linked inlet review refuses wrong or stale members and an altered target witness', async () => {
  const f = fixture(0, 'n3.side1', true);
  assert.equal(pairedElbowOutletPlaneProposal(f.base, f.proposal), undefined);
  assert.equal(pairedElbowInletPlaneProposal(f.base, proposalFor(f.base)), undefined);
  const tilted = pairedElbowInletPlaneProposal(f.base, proposalFor(f.base, 'n3.top', 'n1.start'));
  assert.ok(tilted);
  const review = (base = f.base, candidate = f.candidate, edit = f.edit) =>
    reviewedPairedElbowInletPlaneEvidence(base, f.bodies, candidate, edit);
  assert.equal(await review(f.base, f.candidate, tilted), undefined);
  assert.equal(await review(document(8, true)), undefined);
  assert.equal(await review(f.base, f.candidate, { ...f.edit, sourceFace: 'n1.end' }), undefined);
  const changed = structuredClone(f.candidate), node = changed.nodes[5];
  assert.ok(node.kind === 'offset-face' && node.target);
  node.target.localSupport += 1;
  assert.equal(await review(f.base, changed), undefined);
});

test('linked outlet classifier refuses extra operations, wrong members, unsupported sources and non-rectangular donors', () => {
  const base = document(), proposal = proposalFor(base), args = proposal.ops[0].args;
  const changedArgs = (change: object): Proposal => ({ ...proposal, ops: [{ tool: 'run_command', args: { ...args, ...change } }] });
  for (const bad of [changedArgs({ faces: ['n1.start', 'n3.side3'] }), changedArgs({ faces: ['n3.side3', 'n1.end'] }),
    changedArgs({ faces: ['n1.end', 'n4.side3'] }), changedArgs({ faces: ['n1.end', 'n3.side3+n3.side1'] }),
    changedArgs({ expectedRevision: 'stale' }), changedArgs({ values: { offsetMode: 'to-plane', d: 4 } }),
    { ...proposal, status: 'accepted' as const }, { ...proposal, ops: [...proposal.ops, proposal.ops[0]] }])
    assert.equal(pairedElbowOutletPlaneProposal(base, bad), undefined);
  const changed: StudioDoc[] = [
    { ...base, outputs: { b1: solid(1), b3: solid(3) } },
    { ...base, direct: { sources: {}, objects: [] } },
    { ...base, nodes: base.nodes.map((node, index) => index === 3 && node.kind === 'extrude' ? { ...node, draft: 2 } : node) },
    { ...base, nodes: base.nodes.map((node, index) => index === 2 && node.kind === 'sketch' ? { ...node, holes: [[{ kind: 'line', start: [41, 53] }]] } : node) },
    { ...base, nodes: base.nodes.map((node, index) => index === 4 ? { ...node, suppressed: true } : node) },
  ];
  for (const doc of changed) assert.equal(pairedElbowOutletPlaneProposal(doc, proposalFor(doc)), undefined);
});

test('linked outlet reducer refuses stale source, changed donor and complete candidate recipe or member substitutions', async () => {
  const f = fixture(), review = (candidate: StudioDoc) => reviewedPairedElbowOutletPlaneEvidence(f.base, f.bodies, candidate, f.edit);
  assert.equal(await reviewedPairedElbowOutletPlaneEvidence(f.base, f.bodies, f.candidate, { ...f.edit, sourceRevision: 'stale' }), undefined);
  assert.equal(await reviewedPairedElbowOutletPlaneEvidence(document(-8), f.bodies, f.candidate, f.edit), undefined);
  assert.equal(await reviewedPairedElbowOutletPlaneEvidence(f.base, f.bodies.slice(0, 1), f.candidate, f.edit), undefined);
  assert.equal(await reviewedPairedElbowOutletPlaneEvidence(f.base, f.bodies.map(body => ({ ...body, ref: solid(3) })), f.candidate, f.edit), undefined);
  for (const mutate of [
    (doc: StudioDoc) => { doc.nextId! += 1; },
    (doc: StudioDoc) => { doc.outputs = { b5: solid(5) }; },
    (doc: StudioDoc) => { const node = doc.nodes[4]; if (node.kind === 'translate') node.offset[0] = -8; },
    (doc: StudioDoc) => { const node = doc.nodes[5]; if (node.kind === 'offset-face' && node.target) node.target.feature = 'n3'; },
    (doc: StudioDoc) => { const node = doc.nodes[5]; if (node.kind === 'offset-face' && node.target) node.target.face = 'n3.side1'; },
    (doc: StudioDoc) => { const node = doc.nodes[5]; if (node.kind === 'offset-face' && node.target) node.target.normal[0] *= -1; },
    (doc: StudioDoc) => { const node = doc.nodes[5]; if (node.kind === 'offset-face' && node.target) node.target.localAnchor[0] += 1; },
    (doc: StudioDoc) => { doc.nodes[5] = { id: doc.nodes[5].id, kind: 'offset-face', parent: solid(1), faces: ['n1.end'], distance: 4 }; },
  ]) {
    const changed = structuredClone(f.candidate); mutate(changed); assert.equal(await review(changed), undefined);
  }
  // Same native donor, but a nonparallel real face: classification alone cannot certify geometry.
  const nonparallel = pairedElbowOutletPlaneProposal(f.base, proposalFor(f.base, 'n3.top')); assert.ok(nonparallel);
  assert.equal(await reviewedPairedElbowOutletPlaneEvidence(f.base, f.bodies, f.candidate, nonparallel), undefined);
});
