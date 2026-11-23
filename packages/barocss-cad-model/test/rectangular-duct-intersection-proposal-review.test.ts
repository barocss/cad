import assert from 'node:assert/strict';
import test from 'node:test';
import { rectangularDuctIntersectionProposal, reviewedRectangularDuctIntersectionEvidence } from '../src/chat/rectangularDuctIntersectionProposalReview';
import { emptyDoc, withNode, type BodyRef, type StudioDoc } from '../src/engine/doc';
import type { Proposal } from '../src/engine/schema/proposals';
import { digestOf } from '../src/util/digest';
import { revisionOf } from '../src/util/revision';

const duct: BodyRef = { node: 1, side: 'solid' };
const box: BodyRef = { node: 3, side: 'solid' };

function fixture(offset = 1, upperY = 30) {
  const section = withNode(emptyDoc(), {
    kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3],
    holes: [[[-1, -2], [-1, 2], [1, 2], [1, -2]].map(start => ({ kind: 'line' as const, start: start as [number, number] }))],
    sideTags: { outer: ['e1', 'e2', 'e3', 'e4'], holes: [['e5', 'e6', 'e7', 'e8']] },
  });
  const swept = withNode(section, {
    kind: 'sweep-curve', sketch: 0, mode: 'exact', name: 'Closed ring',
    path: { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], controlPoints: [
      [20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0], [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0],
    ], weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1] },
  });
  const boxProfile = withNode(swept, { kind: 'sketch', profile: 'rectangle', min: [offset, -30], max: [offset + 30, upperY] });
  return withNode(boxProfile, { kind: 'extrude', sketch: 2, from: -5, height: 10 });
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
    assert.ok(evidence.caps.every(cap => cap.outer.edges.length === 4 && cap.inner.edges.length === 4));
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
