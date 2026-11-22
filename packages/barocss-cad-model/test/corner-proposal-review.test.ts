import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties } from '@barocss/cad';
import { cornerBatchProposal, reviewedCornerBatchEvidence } from '../src/chat/cornerProposalReview';
import { dispatchTool, previewProposal } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { profileOf } from '../src/sketch/loops';
import { digestOf } from '../src/util/digest';
import { revisionOf } from '../src/util/revision';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);

for (const operation of ['fillet', 'chamfer'] as const) {
  test(`one mixed convex and reflex ${operation} proposal certifies both exact native walls`, async () => {
    const profile = profileOf([{
      kind: 'polygon', closed: true,
      points: [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]],
      ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'], lengths: { 0: 60 },
    }]);
    assert.ok('node' in profile);
    const base = withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 });
    const evaluated = await evaluate(base);
    assert.ok(evaluated.ok);
    const state = { doc: base, bodies: evaluated.bodies };
    const field = operation === 'fillet' ? 'sketchRound' : 'sketchChamfer';
    const size = operation === 'fillet' ? 'radius' : 'distance';
    const input = { sketch: 'n0', corners: [['e5', 'e4'], ['e3', 'e4']], [size]: 6 };
    const args = { action: 'edit', index: 0, expectedRevision: revisionOf(base), [field]: input };
    const pending = await dispatchTool(state, 'proposals', {
      action: 'propose', title: 'Edit both corners', ops: [{ tool: 'features', args }],
    }, evaluate);
    assert.ok(!pending.isError, pending.content);
    const [proposal] = pending.state.doc.proposals!;
    const planned = cornerBatchProposal(pending.state.doc, proposal);
    assert.equal(planned?.revision, digestOf(proposal));
    assert.ok(planned);
    const preview = await previewProposal(pending.state, proposal.id, evaluate);
    assert.ok('doc' in preview, 'error' in preview ? preview.error : 'Expected a proposal preview');
    const evidence = reviewedCornerBatchEvidence(pending.state.doc, preview.doc, planned);
    assert.ok(evidence);
    const { brep, cornerBatch } = evidence;
    assert.deepEqual([cornerBatch.body, cornerBatch.sketch, cornerBatch.operation, cornerBatch.size], ['b1', 'n0', operation, 6]);
    assert.deepEqual(cornerBatch.faces.map(face => [face.name, face.sides]), [
      ['n1.side[e10]', ['e4', 'e5']], ['n1.side[e9]', ['e3', 'e4']],
    ]);
    for (const [face, center, sign] of [[cornerBatch.faces[0], [32, 21], -1], [cornerBatch.faces[1], [44, 34], 1]] as const) {
      if (operation === 'chamfer') {
        assert.equal(face.geometry.kind, 'plane');
      } else {
        assert.equal(face.geometry.kind, 'cylinder');
        assert.equal(face.geometry.out, sign);
        assert.ok(Math.abs(face.geometry.r - 6) < 1e-8);
        assert.ok(Math.hypot(face.geometry.c[0] - center[0], face.geometry.c[1] - center[1]) < 1e-8);
      }
    }
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 20000) < 1e-7);
    assert.equal(pending.state.doc.nodes, base.nodes);
    assert.equal(reviewedCornerBatchEvidence(pending.state.doc, base, planned), undefined);
    assert.equal(reviewedCornerBatchEvidence(pending.state.doc, preview.doc, { ...planned, size: 5 }), undefined);
    assert.equal(reviewedCornerBatchEvidence(pending.state.doc, preview.doc, { ...planned, pairs: [['e1', 'e2'], ['e3', 'e4']] }), undefined);
    assert.equal(reviewedCornerBatchEvidence({ ...pending.state.doc, parameters: { changed: 1 } }, preview.doc, planned), undefined);
    const [sketch, extrude] = preview.doc.nodes;
    assert.equal(extrude.kind, 'extrude');
    assert.equal(reviewedCornerBatchEvidence(pending.state.doc, { ...preview.doc, nodes: [sketch, { ...extrude, height: 11 }] }, planned), undefined);
    assert.equal(cornerBatchProposal(withNode(base, { kind: 'extrude', sketch: 0, height: 5 }), proposal), undefined);
    assert.equal(cornerBatchProposal(base, { ...proposal, ops: [{ ...proposal.ops[0], args: { ...proposal.ops[0].args, part: 'p1' } }] }), undefined);
    assert.equal(cornerBatchProposal(base, { ...proposal, ops: [{ ...proposal.ops[0], args: {
      ...proposal.ops[0].args, [field]: { ...input, corners: [['e4', 'e5'], ['e5', 'e4']] },
    } }] }), undefined);
  });
}
