import assert from 'node:assert/strict';
import test from 'node:test';
import { rectangularDuctIntersectionProposal, reviewedRectangularDuctIntersectionEvidence } from '../src/chat/rectangularDuctIntersectionProposalReview';
import { emptyDoc, withNode, type BodyRef, type StudioDoc } from '../src/engine/doc';
import type { Proposal } from '../src/engine/schema/proposals';
import { digestOf } from '../src/util/digest';
import { revisionOf } from '../src/util/revision';

const duct: BodyRef = { node: 1, side: 'solid' };
const box: BodyRef = { node: 3, side: 'solid' };

function fixture(offset = 1, upperY = 30, paired = false) {
  const profile = (low: number, high: number) =>
    ([[-1, low], [-1, high], [1, high], [1, low]] as [number, number][]).map(start => ({ kind: 'line' as const, start }));
  const halfHeight = paired ? 5 : 3;
  const section = withNode(emptyDoc(), {
    kind: 'sketch', profile: 'rectangle', min: [-2, -halfHeight], max: [2, halfHeight],
    holes: paired ? [profile(-2.5, -1.5), profile(1, 3)] : [profile(-2, 2)],
    sideTags: { outer: ['e1', 'e2', 'e3', 'e4'], holes: paired
      ? [['a1', 'a2', 'a3', 'a4'], ['b1', 'b2', 'b3', 'b4']] : [['e5', 'e6', 'e7', 'e8']] },
  });
  const swept = withNode(section, {
    kind: 'sweep-curve', sketch: 0, mode: 'exact', name: 'Closed ring',
    path: { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], controlPoints: [
      [20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0], [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0],
    ], weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1] },
  });
  const boxProfile = withNode(swept, { kind: 'sketch', profile: 'rectangle', min: [offset, -30], max: [offset + 30, upperY] });
  return withNode(boxProfile, { kind: 'extrude', sketch: 2, from: -(halfHeight + 2), height: 2 * (halfHeight + 2) });
}

function proposal(doc: StudioDoc, bodies = ['b1', 'b3']): Proposal {
  return {
    id: 'P1', title: 'Clip the closed duct', status: 'open', by: { agent: 'chat' }, at: '2026-11-23T03:00:00.000Z', base: 'test',
    ops: [{ tool: 'run_command', args: { command: 'intersect', bodies, expectedRevision: revisionOf(doc) } }],
    risk: { level: 'low', features_touched: 1, references_broken: 0, hard_requirements_changed: [], approval: [] }, summary: '1 added',
  };
}

test('one pinned exact offset duct Intersect reviews both native apertures and accepts either operand order', () => {
  const base = fixture(), before = structuredClone(base);
  for (const swap of [false, true]) {
    const proposed = proposal(base, swap ? ['b3', 'b1'] : ['b1', 'b3']);
    const edit = rectangularDuctIntersectionProposal(base, proposed);
    assert.ok(edit);
    assert.equal(edit.revision, digestOf(proposed));
    const candidate = withNode(base, { kind: 'intersect', left: swap ? box : duct, right: swap ? duct : box });
    const review = reviewedRectangularDuctIntersectionEvidence(base, candidate, edit);
    assert.ok(review);
    const evidence = review.rectangularDuctIntersection;
    assert.deepEqual([evidence.body, evidence.duct, evidence.box, evidence.offset], ['b4', 'b1', 'b3', 1]);
    assert.equal(evidence.caps.length, 2);
    assert.ok(Math.abs(evidence.volume.native - 973.2961147758438) < 1e-7);
    assert.ok(evidence.caps.every(cap => 'inner' in cap && cap.outer.edges.length === 4 && cap.inner?.edges.length === 4));
    assert.equal(reviewedRectangularDuctIntersectionEvidence(base, candidate, { ...edit, swap: !swap }), undefined);
    assert.equal(reviewedRectangularDuctIntersectionEvidence(base, { ...candidate, nextId: 99 }, edit), undefined);
  }
  assert.deepEqual(base, before);
});

test('offset duct review rejects wrong ownership, stale revisions and a box that introduces another cut', () => {
  const base = fixture(), proposed = proposal(base);
  const edit = rectangularDuctIntersectionProposal(base, proposed);
  assert.ok(edit);
  const candidate = withNode(base, { kind: 'intersect', left: duct, right: box });
  assert.equal(rectangularDuctIntersectionProposal(base, { ...proposed, status: 'accepted' }), undefined);
  assert.equal(rectangularDuctIntersectionProposal(base, proposal(base, ['b1', 'b1'])), undefined);
  const changed = fixture(2);
  assert.equal(rectangularDuctIntersectionProposal(changed, proposed), undefined);
  assert.equal(reviewedRectangularDuctIntersectionEvidence(changed, candidate, edit), undefined);
  const centered = fixture(0);
  assert.equal(rectangularDuctIntersectionProposal(centered, proposal(centered)), undefined);
  const small = fixture(1, 15);
  const smallEdit = rectangularDuctIntersectionProposal(small, proposal(small));
  assert.ok(smallEdit);
  assert.equal(reviewedRectangularDuctIntersectionEvidence(small, withNode(small, { kind: 'intersect', left: duct, right: box }), smallEdit), undefined);
});

test('centered paired cut review binds four apertures to separate authored cavities for either operand order', () => {
  const base = fixture(0, 30, true), before = structuredClone(base);
  for (const swap of [false, true]) {
    const proposed = proposal(base, swap ? ['b3', 'b1'] : ['b1', 'b3']);
    const edit = rectangularDuctIntersectionProposal(base, proposed);
    assert.ok(edit);
    const candidate = withNode(base, { kind: 'intersect', left: swap ? box : duct, right: swap ? duct : box });
    const review = reviewedRectangularDuctIntersectionEvidence(base, candidate, edit);
    assert.ok(review);
    const evidence = review.rectangularDuctIntersection;
    assert.deepEqual([evidence.body, evidence.duct, evidence.box, evidence.offset], ['b4', 'b1', 'b3', 0]);
    assert.ok(Math.abs(evidence.volume.native - 680 * Math.PI) < 1e-7);
    assert.equal(evidence.measuredEdges, 36);
    assert.equal(evidence.caps.length, 2);
    for (const cap of evidence.caps) {
      assert.ok('cavities' in cap && cap.cavities);
      assert.equal(cap.cavities.length, 2);
      for (const [index, aperture] of cap.cavities.entries()) {
        const expected = index ? [-3, -1] : [1.5, 2.5], tag = index ? 'b' : 'a';
        aperture.z.forEach((bound, axis) => assert.ok(Math.abs(bound - expected[axis]) < 1e-7));
        assert.equal(aperture.owner, cap.name);
        assert.ok(aperture.walls.every(name => name.includes(`[${tag}`)));
      }
    }
    assert.equal(reviewedRectangularDuctIntersectionEvidence(base, candidate, { ...edit, swap: !swap }), undefined);
  }
  assert.deepEqual(base, before);
  const negative = fixture(-1, 30, true);
  assert.equal(rectangularDuctIntersectionProposal(negative, proposal(negative)), undefined);
  const secondaryCut = fixture(0, 15, true);
  const edit = rectangularDuctIntersectionProposal(secondaryCut, proposal(secondaryCut));
  assert.ok(edit);
  assert.equal(reviewedRectangularDuctIntersectionEvidence(secondaryCut, withNode(secondaryCut, { kind: 'intersect', left: duct, right: box }), edit), undefined);
});

test('positive paired cut review binds actual opening widths and non-right native joints to the candidate', () => {
  const base = fixture(1, 30, true), before = structuredClone(base);
  const proposed = proposal(base, ['b3', 'b1']);
  const edit = rectangularDuctIntersectionProposal(base, proposed);
  assert.ok(edit);
  const candidate = withNode(base, { kind: 'intersect', left: box, right: duct });
  const review = reviewedRectangularDuctIntersectionEvidence(base, candidate, edit);
  assert.ok(review);
  const evidence = review.rectangularDuctIntersection;
  assert.deepEqual([evidence.body, evidence.offset], ['b4', 1]);
  const segment = (radius: number) => radius * radius * Math.acos(1 / radius) - Math.sqrt(radius * radius - 1);
  const volume = 10 * (segment(22) - segment(18)) - 3 * (segment(21) - segment(19));
  assert.ok(Math.abs(evidence.volume.native - volume) < 1e-7);
  assert.ok('capCylinderJointAngles' in evidence && evidence.capCylinderJointAngles);
  const joints = evidence.capCylinderJointAngles;
  const apertureWidth = Math.sqrt(21 ** 2 - 1) - Math.sqrt(19 ** 2 - 1);
  assert.equal(new Set(joints.map(joint => joint.edge)).size, 12);
  assert.ok(joints.every(joint => Math.abs(joint.expectedAngleDegrees - 90) > 1 &&
    Math.abs(joint.minimumAngleDegrees - joint.expectedAngleDegrees) < 1e-7 &&
    Math.abs(joint.maximumAngleDegrees - joint.expectedAngleDegrees) < 1e-7));
  for (const cap of evidence.caps) {
    assert.ok('cavities' in cap && cap.cavities);
    assert.ok(cap.cavities.every(aperture => Math.abs(aperture.width - apertureWidth) < 1e-7));
  }
  const moved = fixture(2, 30, true);
  assert.equal(rectangularDuctIntersectionProposal(moved, proposed), undefined);
  assert.equal(reviewedRectangularDuctIntersectionEvidence(moved, candidate, edit), undefined);
  assert.deepEqual(base, before);
});
