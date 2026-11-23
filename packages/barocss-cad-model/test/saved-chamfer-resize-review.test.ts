import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, faceGeometry } from '@barocss/cad';
import { reviewedChamferResizeEvidence, savedChamferResizeProposal } from '../src/chat/cornerProposalReview';
import { dispatchTool, previewProposal } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import type { Proposal } from '../src/engine/schema/proposals';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import { prepareStraightCornerBatch } from '../src/sketch/cornerBatch';
import { profileOf } from '../src/sketch/loops';
import { digestOf } from '../src/util/digest';
import { revisionOf } from '../src/util/revision';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

function fixture(corners = [3, 4], rotate = false) {
  const result = prepareStraightCornerBatch({ kind: 'polygon', closed: true,
    points: [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]],
    lengths: { 0: 60 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
    ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
  }, 'chamfer', corners, 6);
  assert.ok('shape' in result);
  const profile = profileOf([result.shape]);
  assert.ok('node' in profile);
  return withNode(withNode(emptyDoc(), { ...profile.node,
    plane: { origin: [3, -2, 4], normal: rotate ? [0, -0.8, 0.6] : [0, 0, 1], xAxis: [1, 0, 0] },
    construction: [{ kind: 'circle', c: [12, 8], r: 2, construction: true, ids: ['e11'] }],
  }), { kind: 'extrude', sketch: 0, height: 2 });
}

function mixedFixture() {
  const turn = Math.atan2(3, 4);
  const profile = profileOf([{ kind: 'polygon', closed: true,
    points: [[50, 15], [50, 45], [0, 45], [0, 6], [6, 0], [24, 0], [34.8, .6 * 6]],
    ids: ['e3', 'e4', 'e5', 'e6', 'e1', 'e7', 'e2'], hv: { h: [1, 4], v: [0, 2] },
    lengths: { 3: 6 * Math.SQRT2, 5: 12 * Math.cos(turn / 2) }, rules: [
      { kind: 'fix', point: 2, at: [0, 45] },
      { kind: 'angle', a: 4, b: 6, value: turn * 180 / Math.PI },
      { kind: 'angle', a: 2, b: 3, value: 135 },
      { kind: 'angle', a: 4, b: 5, value: 180 - turn * 90 / Math.PI },
    ],
  }]);
  assert.ok('node' in profile);
  return withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 });
}

async function pending(base = fixture(), bevel: string | string[] = 'e9', distance = 8) {
  const built = await evaluate(base);
  assert.ok(built.ok);
  const proposal = await dispatchTool({ doc: base, bodies: built.bodies }, 'proposals', {
    action: 'propose', title: 'Resize saved Chamfer', ops: [{ tool: 'features', args: {
      action: 'edit', index: 0, expectedRevision: revisionOf(base), sketchChamfer: {
        sketch: 'n0', ...(Array.isArray(bevel) ? { bevels: bevel } : { bevel }), distance,
      },
    } }],
  }, evaluate);
  assert.ok(!proposal.isError, proposal.content);
  const plan = proposal.state.doc.proposals!.at(-1)!;
  const edit = savedChamferResizeProposal(proposal.state.doc, plan);
  assert.ok(edit);
  const preview = await previewProposal(proposal.state, plan.id, evaluate);
  assert.ok('doc' in preview, 'error' in preview ? preview.error : 'Expected a proposal preview');
  return { base: proposal.state.doc, candidate: preview.doc, plan, edit };
}

test('exact e9 C6 to C8 review measures native setbacks and its unchanged shared-carrier e10 C6', async () => {
  const { base, candidate, plan, edit } = await pending();
  assert.equal(edit.revision, digestOf(plan));
  const before = structuredClone(base), after = structuredClone(candidate);
  const evidence = reviewedChamferResizeEvidence(base, candidate, edit);
  assert.ok(evidence);
  assert.ok(checkBrep(evidence.brep, { strict: true }).valid);
  const { chamferResize } = evidence;
  assert.equal(JSON.stringify(chamferResize), '{"body":"b1","sketch":"n0","bevel":"e9","faces":[{"name":"n1.side[e9]","sides":["e3","e4"],"before":6,"after":8},{"name":"n1.side[e10]","sides":["e4","e5"],"before":6,"after":6}]}');
  assert.equal(digestOf(chamferResize), 'b376438eb76ddb50fb9409fd593039938eef4da58a88b351e963e550a76ac94b');
  assert.deepEqual([chamferResize.body, chamferResize.sketch, chamferResize.bevel], ['b1', 'n0', 'e9']);
  assert.deepEqual(chamferResize.faces.map(({ name, sides }) => ({ name, sides })), [
    { name: 'n1.side[e9]', sides: ['e3', 'e4'] }, { name: 'n1.side[e10]', sides: ['e4', 'e5'] },
  ]);
  for (const [index, expected] of [8, 6].entries()) {
    near(chamferResize.faces[index].before, 6);
    near(chamferResize.faces[index].after, expected);
  }
  near(brepMassProperties(evidence.brep, 1).volume, 3972);
  assert.deepEqual(base, before);
  assert.deepEqual(candidate, after);
});

test('reflex resize reports the selected bevel first and retains the convex neighbor', async () => {
  const { base, candidate, edit } = await pending(fixture(), 'e10');
  const evidence = reviewedChamferResizeEvidence(base, candidate, edit);
  assert.ok(evidence);
  assert.deepEqual(evidence.chamferResize.faces.map(face => face.name), ['n1.side[e10]', 'n1.side[e9]']);
  near(evidence.chamferResize.faces[0].after, 8);
  near(evidence.chamferResize.faces[1].after, 6);
  near(brepMassProperties(evidence.brep, 1).volume, 4028);
});

test('single saved bevel needs no invented sibling', async () => {
  const { base, candidate, edit } = await pending(fixture([3]));
  const evidence = reviewedChamferResizeEvidence(base, candidate, edit);
  assert.ok(evidence);
  assert.equal(evidence.chamferResize.faces.length, 1);
  near(evidence.chamferResize.faces[0].before, 6);
  near(evidence.chamferResize.faces[0].after, 8);
  near(brepMassProperties(evidence.brep, 1).volume, 3936);
});

test('mixed right and oblique saved pair reports both native setbacks in either requested order', async () => {
  for (const bevels of [['e6', 'e7'], ['e7', 'e6']]) {
    const { base, candidate, plan, edit } = await pending(mixedFixture(), bevels);
    const before = structuredClone(base), after = structuredClone(candidate);
    const evidence = reviewedChamferResizeEvidence(base, candidate, edit);
    assert.ok(evidence);
    assert.equal(edit.revision, digestOf(plan));
    assert.deepEqual(Object.keys(evidence.chamferResize), ['body', 'sketch', 'bevels', 'faces']);
    assert.deepEqual(evidence.chamferResize.bevels, bevels);
    assert.deepEqual(evidence.chamferResize.faces.map(face => face.name), bevels.map(id => `n1.side[${id}]`));
    for (const face of evidence.chamferResize.faces) { near(face.before, 6); near(face.after, 8); }
    assert.ok(checkBrep(evidence.brep, { strict: true }).valid);
    near(brepMassProperties(evidence.brep, 1).volume, 20488);
    assert.equal(digestOf(evidence.brep), '82d6d8538085e3a22ed5de24387a49b95dc050212b6a150b150047c1eed81c58');
    const original = partBreps(base)[0].brep;
    for (const id of ['e1', 'e2', 'e5', 'e6', 'e7']) {
      const a = faceGeometry(original.faces.find(face => face.name === `n1.side[${id}]`)!);
      const b = faceGeometry(evidence.brep.faces.find(face => face.name === `n1.side[${id}]`)!);
      assert.ok(a.kind === 'plane' && b.kind === 'plane');
      a.n.forEach((value, axis) => near(b.n[axis], value));
      if (!bevels.includes(id)) near(a.n.reduce((sum, value, axis) => sum + value * (b.o[axis] - a.o[axis]), 0), 0);
    }
    const saved = base.nodes[0], resized = candidate.nodes[0];
    assert.ok(saved.kind === 'sketch' && resized.kind === 'sketch');
    assert.deepEqual(resized.outline!.rules, saved.outline!.rules);
    assert.deepEqual(resized.sideTags, saved.sideTags);
    near(resized.outline!.points[5][0] - resized.outline!.points[4][0], 14);
    assert.deepEqual(base, before);
    assert.deepEqual(candidate, after);
  }
});

test('right and reflex saved pair measures both changes and retains a third adjacent bevel', async () => {
  for (const bevels of [['e10', 'e11'], ['e11', 'e10']]) {
    const { base, candidate, edit } = await pending(fixture([2, 3, 4]), bevels);
    const evidence = reviewedChamferResizeEvidence(base, candidate, edit);
    assert.ok(evidence);
    assert.deepEqual(evidence.chamferResize.bevels, bevels);
    assert.deepEqual(evidence.chamferResize.faces.map(face => face.name), [...bevels, 'e9'].map(id => `n1.side[${id}]`));
    for (const [index, face] of evidence.chamferResize.faces.entries()) {
      near(face.before, 6); near(face.after, index === 2 ? 6 : 8);
    }
    const neighbor = await pending(candidate, 'e9', 8);
    assert.equal(reviewedChamferResizeEvidence(base, neighbor.candidate, edit), undefined);
  }
});

test('an adjacent pair can retain one selected bevel already at the common target', async () => {
  const partial = await pending(mixedFixture(), 'e6');
  const { base, candidate, edit } = await pending(partial.candidate, ['e6', 'e7']);
  const evidence = reviewedChamferResizeEvidence(base, candidate, edit);
  assert.ok(evidence);
  near(evidence.chamferResize.faces[0].before, 8);
  near(evidence.chamferResize.faces[0].after, 8);
  near(evidence.chamferResize.faces[1].before, 6);
  near(evidence.chamferResize.faces[1].after, 8);
  near(brepMassProperties(evidence.brep, 1).volume, 20488);
});

test('group recognition refuses stale, duplicate, nonadjacent, extra and unchanged scope', async () => {
  const { base, plan } = await pending(mixedFixture(), ['e6', 'e7']);
  const op = plan.ops[0], args = op.args!, input = args.sketchChamfer as Record<string, unknown>;
  const withInput = (changes: Record<string, unknown>): Proposal => ({ ...plan, ops: [{ ...op,
    args: { ...args, sketchChamfer: { ...input, ...changes } },
  }] });
  for (const invalid of [
    { ...plan, status: 'accepted' as const }, { ...plan, ops: [...plan.ops, op] },
    { ...plan, ops: [{ ...op, args: { ...args, expectedRevision: '0000000000000000' } }] },
    ...[undefined, null, [], ['e6'], ['e6', 'e6'], ['e6', 'e7', 'e2'], ['e6', 'e2'], ['e6', 'missing'], ['e6', 7]]
      .map(bevels => withInput({ bevels })),
    ...[0, -1, NaN, Infinity, 6].map(distance => withInput({ distance })),
    ...[{ bevel: 'e6' }, { sides: ['e5', 'e1'] }, { corners: [['e5', 'e1'], ['e1', 'e2']] }, { extra: true }, { sketch: 'n1' }]
      .map(withInput),
  ]) assert.equal(savedChamferResizeProposal(base, invalid), undefined);
  const separated = fixture([2, 4]), [sketch] = separated.nodes;
  assert.ok(sketch.kind === 'sketch');
  assert.equal(savedChamferResizeProposal(separated, { ...plan, ops: [{ ...op, args: { ...args,
    expectedRevision: revisionOf(separated), sketchChamfer: { sketch: sketch.id, bevels: ['e9', 'e10'], distance: 8 },
  } }] }), undefined);
});

test('group evidence refuses forged scopes, partial edits and overlap without changing source geometry', async () => {
  const { base, candidate, plan, edit } = await pending(mixedFixture(), ['e6', 'e7']);
  const before = structuredClone(base), after = structuredClone(candidate);
  const partial = await pending(base, 'e6');
  assert.equal(reviewedChamferResizeEvidence(base, partial.candidate, edit), undefined);
  for (const forged of [
    { ...edit, bevel: 'e6' }, { ...edit, bevels: ['e7', 'e6'] }, { ...edit, bevels: ['e6', 'e6'] },
    { ...edit, bevels: ['e6', 'e7', 'e2'] }, { ...edit, sourceRevision: '0000000000000000' },
    { ...edit, source: '' }, { ...edit, distance: 16 }, { ...edit, faces: edit.faces.slice(0, 1) },
    { ...edit, faces: edit.faces.map(face => ({ ...face, before: 5 })) },
    { ...edit, faces: edit.faces.map(face => ({ ...face, sides: ['e1', 'e2'] as [string, string] })) },
  ]) assert.equal(reviewedChamferResizeEvidence(base, candidate, forged as typeof edit), undefined);
  for (const distance of [15, 16]) {
    const op = plan.ops[0];
    const overlapping = { ...plan, ops: [{ ...op, args: { ...op.args!,
      sketchChamfer: { sketch: 'n0', bevels: ['e6', 'e7'], distance },
    } }] };
    const recognized = savedChamferResizeProposal(base, overlapping);
    assert.ok(recognized);
    assert.equal(reviewedChamferResizeEvidence(base, candidate, recognized), undefined);
  }
  assert.deepEqual(base, before);
  assert.deepEqual(candidate, after);
});

test('recognition rejects stale, nullable, mixed, wrong-source and non-resize payloads', async () => {
  const { base, plan } = await pending();
  const op = plan.ops[0], args = op.args!, input = args.sketchChamfer as Record<string, unknown>;
  const withArgs = (next: Record<string, unknown>): Proposal => ({ ...plan, ops: [{ ...op, args: next }] });
  for (const invalid of [
    { ...plan, status: 'accepted' as const }, { ...plan, ops: [...plan.ops, op] },
    { ...plan, ops: [{ ...op, tool: 'features' }] },
    ...[undefined, null, 'bad', '0000000000000000'].map(expectedRevision => withArgs({ ...args, expectedRevision })),
    withArgs({ ...args, index: 1 }), withArgs({ ...args, part: 'p1' }), withArgs({ ...args, values: {} }),
    ...[0, -1, NaN, Infinity, 6].map(distance => withArgs({ ...args, sketchChamfer: { ...input, distance } })),
    ...['missing', 'e3', 'e11'].map(bevel => withArgs({ ...args, sketchChamfer: { ...input, bevel } })),
    withArgs({ ...args, sketchChamfer: { ...input, sketch: 'n1' } }),
    ...[{ corners: [['e3', 'e4'], ['e4', 'e5']] }, { sides: ['e3', 'e4'] }, { extra: true }]
      .map(extra => withArgs({ ...args, sketchChamfer: { ...input, ...extra } })),
  ]) assert.equal(savedChamferResizeProposal(base, invalid), undefined);
  assert.equal(savedChamferResizeProposal(withNode(base, { kind: 'extrude', sketch: 0, height: 2 }), plan), undefined);
  const tilted = fixture([3, 4], true);
  assert.equal(savedChamferResizeProposal(tilted, withArgs({ ...args, expectedRevision: revisionOf(tilted) })), undefined,
    'Tilted placement emits a generic native source ID and cannot supply this review pin.');
  const sketch = base.nodes[0];
  assert.ok(sketch.kind === 'sketch');
  for (const changed of [{ ...sketch, sideTags: undefined }, { ...sketch, on: { body: 'b1', face: 'n1.top' } }]) {
    const doc = { ...base, nodes: [changed, base.nodes[1]] } as StudioDoc;
    assert.equal(savedChamferResizeProposal(doc, withArgs({ ...args, expectedRevision: revisionOf(doc) })), undefined);
  }
});

test('evidence rejects forged plans, unchanged bodies and stale source snapshots', async () => {
  const { base, candidate, edit } = await pending();
  assert.equal(reviewedChamferResizeEvidence(base, base, edit), undefined);
  for (const changed of [
    { ...edit, source: '' }, { ...edit, sourceRevision: '0000000000000000' }, { ...edit, distance: 7 },
    { ...edit, bevel: 'e10' }, { ...edit, faces: edit.faces.slice(0, 1) },
    { ...edit, faces: edit.faces.map((face, index) => index ? { ...face, after: 8 } : face) },
    { ...edit, faces: edit.faces.map(face => ({ ...face, before: 5 })) },
    { ...edit, faces: edit.faces.map(face => ({ ...face, sides: ['e1', 'e2'] as [string, string] })) },
  ]) assert.equal(reviewedChamferResizeEvidence(base, candidate, changed as typeof edit), undefined);
  assert.equal(reviewedChamferResizeEvidence({ ...base, parameters: { changed: 1 } }, candidate, edit), undefined);
});

test('evidence refuses unrelated geometry, native/hint mismatch, metadata and neighboring bevel changes', async () => {
  const { base, candidate, edit } = await pending();
  const [sketch, extrude] = candidate.nodes;
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'loop' && extrude.kind === 'extrude');
  const changedNeighbor = await pending(candidate, 'e10', 8);
  assert.equal(reviewedChamferResizeEvidence(base, changedNeighbor.candidate, edit), undefined);
  for (const changed of [
    { ...sketch, name: 'Altered' }, { ...sketch, construction: [] },
    { ...sketch, plane: { ...sketch.plane!, origin: [0, 0, 9] as [number, number, number] } },
    { ...sketch, segments: sketch.segments.map((segment, at) => at === 3 ? { ...segment, start: [47, 40] as [number, number] } : segment) },
    { ...sketch, outline: { ...sketch.outline!, lengths: { ...sketch.outline!.lengths, 5: 8 * Math.SQRT2 } } },
    { ...sketch, sideTags: { ...sketch.sideTags!, outer: [...sketch.sideTags!.outer].reverse() } },
  ]) assert.equal(reviewedChamferResizeEvidence(base, { ...candidate, nodes: [changed, extrude] }, edit), undefined);
  assert.equal(reviewedChamferResizeEvidence(base, { ...candidate, parameters: { new: 1 } }, edit), undefined);
  assert.equal(reviewedChamferResizeEvidence(base, { ...candidate, nodes: [sketch, { ...extrude, height: 3 }] }, edit), undefined);
});
