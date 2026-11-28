import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewedTrapezoidalCavityEvidence, trapezoidalCavityProposal } from '../src/chat/trapezoidalCavityProposalReview';
import { emptyDoc, withNode, type Dim } from '../src/engine/doc';
import type { Proposal } from '../src/engine/schema/proposals';
import { digestOf } from '../src/util/digest';

function fixture() {
  const parameter = { parameter: 'VoidRight' }, corners: [Dim, Dim][] = [[.5, 2], [parameter, 2], [parameter, 4], [.5, 4]];
  const sketch = withNode({ ...emptyDoc(), parameters: { BaseWidth: 4, VoidRight: 1.5 } }, {
    kind: 'sketch', profile: 'polygon', points: [[0, 0], [{ parameter: 'BaseWidth' }, 0], [2, 6], [0, 6]],
    holes: [corners.map(start => ({ kind: 'line', start }))],
    sideTags: { outer: ['bottom', 'slope', 'top', 'inner'], holes: [['void-low', 'void-rim', 'void-high', 'void-inner']] },
  });
  const base = withNode(sketch, { kind: 'sweep-curve', sketch: 0, name: 'R20', mode: 'exact', path: {
    degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    controlPoints: [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0], [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]],
    weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
  } });
  const candidate = { ...base, parameters: { ...base.parameters, VoidRight: 2 } };
  const proposal: Proposal = {
    id: 'P1', title: 'Widen the sealed cavity', status: 'open', by: { agent: 'chat' }, at: '2026-11-29T00:00:00Z', base: 'test',
    ops: [{ tool: 'set_parameters', args: { set: { VoidRight: 2 } } }],
    risk: { level: 'medium', features_touched: 0, references_broken: 0, hard_requirements_changed: [], approval: [] }, summary: 'Widen cavity',
  };
  return { base, candidate, proposal };
}

test('pending sealed cavity evidence binds the changed native right wall and intact exterior', () => {
  const { base, candidate, proposal } = fixture(), unchanged = digestOf([base, candidate]);
  const edit = trapezoidalCavityProposal(base, proposal);
  assert.ok(edit);
  assert.equal(edit.revision, digestOf(proposal));
  const review = reviewedTrapezoidalCavityEvidence(base, candidate, edit);
  assert.ok(review);
  const { body, faces, before, after, parameter, exteriorSha256 } = review.trapezoidalCavityEdit;
  assert.deepEqual([body, parameter], ['b1', { name: 'VoidRight', before: 1.5, after: 2 }]);
  assert.deepEqual(faces, edit.innerTags.flatMap(tag => [1, 2].map(half => `n1.side[${tag}]#${half}`)));
  assert.match(exteriorSha256, /^[0-9a-f]{64}$/);
  assert.deepEqual([before.radialMM, after.radialMM, before.axialMM, after.axialMM], [1, 1.5, 2, 2]);
  for (const [actual, expected] of [[before.cavityVolumeMM3, 76], [after.cavityVolumeMM3, 115.5],
    [before.materialVolumeMM3, 628], [after.materialVolumeMM3, 588.5]]) {
    assert.ok(Math.abs(actual - expected * Math.PI) < 1e-8);
  }
  assert.equal(digestOf([base, candidate]), unchanged);
});

test('sealed cavity review refuses wrong operations, modified sources, touching walls and misbound tags', () => {
  const { base, candidate, proposal } = fixture();
  const edit = trapezoidalCavityProposal(base, proposal);
  assert.ok(edit);
  for (const set of [{ BaseWidth: 6 }, { VoidRight: 1.5 }, { VoidRight: 2, BaseWidth: 6 }]) {
    assert.equal(trapezoidalCavityProposal(base, { ...proposal, ops: [{ tool: 'set_parameters', args: { set } }] }), undefined);
  }
  const [sketch, sweep] = candidate.nodes;
  assert.ok(sweep.kind === 'sweep-curve');
  assert.equal(reviewedTrapezoidalCavityEvidence(base, { ...candidate, nodes: [sketch, { ...sweep, name: 'Changed rail' }] }, edit), undefined);
  assert.equal(reviewedTrapezoidalCavityEvidence(base, { ...candidate, parameters: { BaseWidth: 6, VoidRight: 2 } }, edit), undefined);
  assert.equal(reviewedTrapezoidalCavityEvidence(base, { ...candidate, parameters: { BaseWidth: 4, VoidRight: 3 } },
    { ...edit, value: 3 }), undefined);
  assert.equal(reviewedTrapezoidalCavityEvidence(base, candidate, { ...edit, innerTags: [...edit.innerTags].reverse() }), undefined);
});
