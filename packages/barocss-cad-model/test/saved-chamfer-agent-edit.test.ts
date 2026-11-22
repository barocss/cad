import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptProposal, dispatchTool, previewProposal, type ChatState } from '../src/chat/tools';
import { outputSchemaOf, validate } from '../src/chat/contract';
import { emptyDoc, withNode, type LoopSegment, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { prepareStraightCornerBatch } from '../src/sketch/cornerBatch';
import { profileOf } from '../src/sketch/loops';
import { sketchShapes } from '../src/sketch/reopen';
import { savedChamferSetback } from '../src/sketch/chamferEdit';
import { revisionOf } from '../src/util/revision';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
const neverEvaluate = async (): Promise<never> => assert.fail('Reads, refusals and same-size edits must not evaluate.');

function fixture() {
  const result = prepareStraightCornerBatch({ kind: 'polygon', closed: true,
    points: [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]],
    lengths: { 0: 60 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
    ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
  }, 'chamfer', [3, 4], 6);
  assert.ok('shape' in result);
  const profile = profileOf([result.shape]);
  assert.ok('node' in profile);
  return withNode(withNode(emptyDoc(), { ...profile.node,
    plane: { origin: [0, 0, 4], normal: [0, 0, 1], xAxis: [1, 0, 0] },
    construction: [{ kind: 'circle', c: [12, 8], r: 2, construction: true, ids: ['e11'] }],
  }), { kind: 'extrude', sketch: 0, height: 2 });
}

async function stateOf(doc = fixture()): Promise<ChatState> {
  const built = await evaluate(doc);
  assert.ok(built.ok);
  return { doc, bodies: built.bodies };
}

const argsOf = (doc: StudioDoc, distance = 8) => ({ action: 'edit', index: 0,
  expectedRevision: revisionOf(doc), sketchChamfer: { sketch: 'n0', bevel: 'e9', distance } });
const propose = (state: ChatState, args: ReturnType<typeof argsOf>, run = evaluate) =>
  dispatchTool(state, 'proposals', { action: 'propose', title: 'Resize saved Chamfer', ops: [{ tool: 'features', args }] }, run);

test('saved-bevel discovery is opt-in and a pinned e9 resize keeps e10 and exact metadata', async () => {
  const before = await stateOf(), original = structuredClone(before.doc);
  const ordinary = await dispatchTool(before, 'query', { action: 'edit_fields', index: 0 }, neverEvaluate);
  assert.equal(JSON.parse(ordinary.content).sketchChamfers, undefined);
  const read = await dispatchTool(before, 'query', { action: 'edit_fields', index: 0, includeSketchCorners: true }, neverEvaluate);
  assert.equal(read.state, before);
  const fields = JSON.parse(read.content);
  assert.deepEqual(validate(outputSchemaOf('list_feature_edit_fields')!, fields), []);
  assert.equal(fields.revision, revisionOf(before.doc));
  assert.deepEqual(fields.sketchChamfers, [{ bevel: 'e9', distance: 6 }, { bevel: 'e10', distance: 6 }]);
  const changed = await dispatchTool(before, 'features', argsOf(before.doc), evaluate);
  assert.ok(changed.changed && !changed.isError, changed.content);
  const saved = before.doc.nodes[0], sketch = changed.state.doc.nodes[0];
  assert.ok(saved.kind === 'sketch' && saved.profile === 'loop' && sketch.kind === 'sketch' && sketch.profile === 'loop');
  const points = saved.outline!.points.map((p, i) => i === 3 ? [46, 40] : i === 4 ? [38, 32] : p);
  const segments = saved.segments.map((segment, i) => ({ ...segment, start: points[i] }));
  assert.deepEqual(sketch, { ...saved, segments, outline: { ...saved.outline!, points,
    lengths: { ...saved.outline!.lengths, 3: 8 * Math.SQRT2 } } });
  assert.deepEqual(sketch.sideTags?.outer, ['e1', 'e2', 'e3', 'e9', 'e4', 'e10', 'e5', 'e6', 'e7', 'e8']);
  const reopened = sketchShapes(sketch).shape;
  assert.ok(reopened?.kind === 'polygon');
  assert.equal(savedChamferSetback(reopened, 3), 8);
  assert.equal(savedChamferSetback(reopened, 5), 6);
  assert.ok(Math.abs(changed.state.bodies[0].volume! - 3972) < 1e-7);
  assert.deepEqual(changed.state.doc.nodes[1], before.doc.nodes[1]);
  assert.deepEqual(before.doc, original);

  const pending = await propose(before, argsOf(before.doc));
  assert.ok(pending.changed && !pending.isError, pending.content);
  assert.equal(pending.state.doc.proposals?.length, 1);
  assert.equal(pending.state.doc.nodes, before.doc.nodes, 'propose leaves source geometry unapplied');
  const preview = await previewProposal(pending.state, pending.state.doc.proposals![0].id, evaluate);
  assert.ok('doc' in preview);
  assert.deepEqual(preview.doc.nodes, changed.state.doc.nodes);
  const accepted = await acceptProposal(pending.state, pending.state.doc.proposals![0].id, evaluate);
  assert.ok('state' in accepted);
  assert.deepEqual(accepted.state.doc.nodes, changed.state.doc.nodes);
});

test('saved-bevel rejects stale, mixed, wrong-ID, invalid and same-size edits without evaluation or orphan proposals', async () => {
  const before = await stateOf(), args = argsOf(before.doc);
  const cases = [
    [{ ...args, expectedRevision: '0000000000000000' }, 'EDIT_STALE'],
    [{ ...args, expectedRevision: undefined }, 'EDIT_INPUT'],
    [{ ...args, values: {} }, 'EDIT_INPUT'],
    [{ ...args, sketchRound: { sketch: 'n0', sides: ['e1', 'e2'], radius: 2 } }, 'EDIT_INPUT'],
    ...[ { sides: ['e3', 'e4'] }, { corners: [['e3', 'e4'], ['e4', 'e5']] }, { extra: true } ].map(extra =>
      [{ ...args, sketchChamfer: { ...args.sketchChamfer, ...extra } }, 'EDIT_INPUT']),
    ...['missing', 'e3', 'e11'].map(bevel => [{ ...args, sketchChamfer: { ...args.sketchChamfer, bevel } }, 'EDIT_SKETCH_CHAMFER_BEVEL']),
    [{ ...args, sketchChamfer: { ...args.sketchChamfer, sketch: 'n1' } }, 'EDIT_SKETCH_CHAMFER_SOURCE'],
    ...[0, -1, 19].map(distance => [{ ...args, sketchChamfer: { ...args.sketchChamfer, distance } }, 'EDIT_SKETCH_CHAMFER_GEOMETRY']),
    ...[NaN, Infinity].map(distance => [{ ...args, sketchChamfer: { ...args.sketchChamfer, distance } }, 'EDIT_INPUT']),
    [argsOf(before.doc, 6), 'EDIT_INPUT'],
  ] as const;
  for (const [input, code] of cases) {
    const refused = await dispatchTool(before, 'features', input, neverEvaluate);
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state.doc, before.doc);
    assert.equal(refused.state.bodies, before.bodies);
    assert.equal(JSON.parse(refused.content).code, code);
  }
  for (const args of [argsOf(before.doc, 6), argsOf(before.doc, 19)]) {
    const refused = await propose(before, args, neverEvaluate);
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state.doc, before.doc);
    assert.equal(refused.state.bodies, before.bodies);
    assert.equal(refused.state.doc.proposals, undefined);
  }
});

test('saved-bevel keeps the shared binding refusal and rejects an unsupported source', async () => {
  const doc = fixture(), sketch = doc.nodes[0];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'loop');
  const bound = await stateOf({ ...doc, parameters: { W: 60 }, nodes: [
    { ...sketch, segments: sketch.segments.map<LoopSegment>((segment, i) => i === 1
      ? { ...segment, start: [{ parameter: 'W' }, segment.start[1]] } : segment) }, doc.nodes[1],
  ] });
  // The existing rebindDims policy requires the whole bound loop to keep its unbound coordinates.
  const blocked = await dispatchTool(bound, 'features', argsOf(bound.doc), neverEvaluate);
  assert.equal(blocked.state, bound);
  assert.equal(JSON.parse(blocked.content).code, 'EDIT_SKETCH_CHAMFER_BINDING');
  const moved = await stateOf({ ...doc, parameters: { X: 44 }, nodes: [
    { ...sketch, segments: sketch.segments.map<LoopSegment>((segment, i) => i === 3
      ? { ...segment, start: [{ parameter: 'X' }, segment.start[1]] } : segment) }, doc.nodes[1],
  ] });
  const denied = await dispatchTool(moved, 'features', argsOf(moved.doc), neverEvaluate);
  assert.equal(denied.state, moved);
  assert.equal(JSON.parse(denied.content).code, 'EDIT_SKETCH_CHAMFER_BINDING');
  const unsupported = await stateOf({ ...doc, nodes: [{ ...sketch, sideTags: undefined }, doc.nodes[1]] });
  const refused = await dispatchTool(unsupported, 'features', argsOf(unsupported.doc), neverEvaluate);
  assert.equal(refused.state, unsupported);
  assert.equal(JSON.parse(refused.content).code, 'EDIT_SKETCH_CHAMFER_SOURCE');
  const read = await dispatchTool(unsupported, 'query', { action: 'edit_fields', index: 0, includeSketchCorners: true }, neverEvaluate);
  assert.equal(JSON.parse(read.content).sketchChamfers, undefined);
});

test('saved-bevel discovery and resize do not require allocation of another side ID', async () => {
  const doc = fixture(), sketch = doc.nodes[0];
  assert.ok(sketch.kind === 'sketch');
  const before = await stateOf({ ...doc, nodes: [{ ...sketch,
    construction: [{ kind: 'circle', c: [12, 8], r: 2, construction: true, ids: ['e9007199254740992'] }],
  }, doc.nodes[1]] });
  const read = await dispatchTool(before, 'query', { action: 'edit_fields', index: 0, includeSketchCorners: true }, neverEvaluate);
  assert.deepEqual(JSON.parse(read.content).sketchChamfers, [{ bevel: 'e9', distance: 6 }, { bevel: 'e10', distance: 6 }]);
  const changed = await dispatchTool(before, 'features', argsOf(before.doc), evaluate);
  assert.ok(changed.changed && !changed.isError, changed.content);
  const after = changed.state.doc.nodes[0];
  assert.ok(after.kind === 'sketch');
  assert.deepEqual(after.sideTags, sketch.sideTags);
  assert.deepEqual(after.construction, (before.doc.nodes[0] as typeof after).construction);
});
