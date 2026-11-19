import assert from 'node:assert/strict';
import test from 'node:test';
import type { SketchNode } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import { commitDimension, type Polygon } from '@barocss/cad-model/sketch/rules';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { ownsPanelDrivingLength, studioSketchViewportActions } from '../src/viewport/studioSketchViewportActions';

const rectangle: Polygon = {
  kind: 'polygon', closed: true, points: [[0, 0], [40, 0], [40, 20], [0, 20]],
  hv: { h: [0, 2], v: [1, 3] }, lengths: { 0: 40, 1: 20, 2: 40 },
};
const draft = (shape: Polygon): SketchState => ({ shape, tool: 'select', plane: xyPlane() });

function harness(source: Polygon, sketch = draft(source), live: SketchShape = source, stored?: SketchNode) {
  const shapes: (SketchShape | null)[] = [], errors: string[] = [];
  const conflicts: { reason: string; shape: Polygon; ids: readonly string[] }[] = [];
  const recoveredLengths = new WeakSet<Polygon>();
  const actions = studioSketchViewportActions({
    liveShape: { current: live }, sketch, currentSketchSource: () => stored ? { source: stored, recoveredLengths } : undefined,
    updateShape: shape => { shapes.push(shape); },
    setSketch: () => assert.fail('panel edit should not directly replace the draft'),
    clearOutlinePickIssue: () => undefined, updateCircleDiameter: () => undefined, trimSketch: () => undefined,
    setSketchError: reason => { errors.push(reason); },
    setConstraintConflict: (reason, shape, ids) => { conflicts.push({ reason, shape, ids }); },
  });
  return { actions, shapes, errors, conflicts, recoveredLengths };
}

test('panel refuses a proven opposite width conflict without mutating the source or publishing geometry', () => {
  const source = structuredClone(rectangle), original = structuredClone(source);
  const { actions, shapes, errors, conflicts } = harness(source);
  const native = commitDimension(source, 'len0', 42);
  assert.ok(!native.ok);
  assert.equal(actions.recoverPanelLength(source, 0, 42), true);
  assert.deepEqual(conflicts, [{ reason: native.reason, shape: source, ids: ['len:2'] }]);
  assert.equal(conflicts[0].shape, source);
  assert.deepEqual({ shapes, errors }, { shapes: [], errors: [] });
  assert.deepEqual(source, original);
});

test('panel routing requires the current document, rendered sketch generation and exact active outline', () => {
  const source = structuredClone(rectangle), owner = draft(source), doc = {};
  assert.equal(ownsPanelDrivingLength(doc, doc, owner, owner, 1, 1), true);
  assert.equal(ownsPanelDrivingLength(doc, {}, owner, owner, 1, 1), false);
  assert.equal(ownsPanelDrivingLength(doc, doc, owner, owner, 1, 2), false);
  assert.equal(ownsPanelDrivingLength(doc, doc, owner, { ...owner }, 1, 1), false);
  assert.equal(ownsPanelDrivingLength(doc, doc, null, null, 1, 1), false);
  for (const state of [harness(source, owner, { ...source }), harness(source, draft({ ...source }), source)]) {
    assert.equal(state.actions.recoverPanelLength(source, 0, 42), true);
    assert.deepEqual({ shapes: state.shapes, conflicts: state.conflicts, errors: state.errors }, { shapes: [], conflicts: [], errors: [] });
  }
});

test('unproven or successful ordinary panel lengths keep their original route', () => {
  const missing: Polygon = { ...rectangle, lengths: { 0: 40, 1: 20 } };
  const unproven: Polygon = { ...rectangle, hv: { h: [0, 2], v: [1] } };
  const arc: Polygon = { ...rectangle, bulges: [0, 0, 0.2, 0] };
  const originals: [Polygon, number, number][] = [
    [missing, 0, 42], [unproven, 0, 42], [arc, 0, 42],
    [rectangle, 0, 40.0000001], [rectangle, 0, 30000], [rectangle, 1, 21],
  ];
  assert.equal(commitDimension(rectangle, 'len1', 21).ok, true);
  for (const [source, edge, value] of originals) {
    const original = structuredClone(source), state = harness(source);
    assert.equal(state.actions.recoverPanelLength(source, edge, value), false);
    assert.deepEqual({ shapes: state.shapes, conflicts: state.conflicts, errors: state.errors }, { shapes: [], conflicts: [], errors: [] });
    assert.deepEqual(source, original);
  }
});

test('reopened verified fixed triangle still recovers only its third edge', () => {
  const source: Polygon = {
    kind: 'polygon', closed: true, points: [[0, 0], [4, 0], [130.35031249999975, 20.484104353190723]],
    hv: { h: [], v: [] }, lengths: { 1: 128, 2: 131.95 },
    rules: [{ kind: 'fix', point: 1, at: [4, 0] }], ids: ['e1', 'e2', 'e3'],
  };
  const node = {
    kind: 'sketch', profile: 'polygon', points: source.points,
    outline: { points: source.points, hv: source.hv, lengths: source.lengths, rules: source.rules },
    sideTags: { outer: source.ids! },
  } satisfies SketchNode;
  const sketch = { ...draft(source), editNode: 0 };
  const state = harness(source, sketch, source, node);
  assert.equal(state.actions.recoverPanelLength(source, 1, 124.05), false);
  assert.equal(state.actions.recoverPanelLength(source, 2, 124.05), true);
  assert.equal(state.shapes.length, 1);
  const next = state.shapes[0];
  assert.ok(next?.kind === 'polygon' && state.recoveredLengths.has(next));
  assert.equal(next.lengths?.[2], 124.05);
  assert.deepEqual(next.points.slice(0, 2), source.points.slice(0, 2));
  assert.deepEqual(state.conflicts, []);
  assert.deepEqual(state.errors, []);
});
