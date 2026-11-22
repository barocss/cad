import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProfileLoop, checkBrep, faceGeometry } from '@barocss/cad';
import { emptyDoc, withNode } from '../src/engine/doc';
import { partSnapshot } from '../src/engine/part';
import { profileOf } from '../src/sketch/loops';
import { canDragOutlinePoint, dragOutlinePoint } from '../src/sketch/pointDrag';
import { arcOf, outlineSegments, type P2 } from '../src/sketch/profile';
import { outlinePolygon } from '../src/sketch/reopen';
import type { Polygon } from '../src/sketch/rules';
import { settleShape } from '../src/sketch/settle';

const rectangle = (): Polygon => ({ kind: 'polygon', closed: true,
  points: [[0, 0], [40, 0], [40, 30], [0, 30]], hv: { h: [0, 2], v: [1, 3] },
  lengths: { 0: 40 }, ids: ['e1', 'e2', 'e3', 'e4'] });
const rounded = (): Polygon => ({ kind: 'polygon', closed: true,
  points: [[0, 0], [40, 0], [40, 24], [34, 30], [0, 30]],
  bulges: [0, 0, Math.tan(Math.PI / 8), 0, 0], hv: { h: [0, 3], v: [1, 4] },
  lengths: { 0: 40 }, radii: { 2: 6 }, tangents: [2, 3], ids: ['e1', 'e2', 'round', 'e3', 'e4'] });
const near = (actual: number, expected: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
const vector = (a: P2, b: P2): P2 => [b[0] - a[0], b[1] - a[1]];

test('an off-axis pointer moves a one-DOF point and preserves the authored recipe and source', () => {
  const source = rectangle(), before = structuredClone(source);
  const moved = dragOutlinePoint(source, 2, [46, 40]);
  assert.ok(moved);
  near(moved.points[2][0], 40); near(moved.points[2][1], 40);
  near(moved.points[3][0], 0); near(moved.points[3][1], 40);
  assert.deepEqual(moved.lengths, source.lengths);
  assert.deepEqual(moved.rules, source.rules);
  assert.deepEqual(moved.hv, source.hv);
  assert.deepEqual(moved.ids, source.ids);
  assert.deepEqual(source, before);
  // Finishing/settling cannot retain the temporary target or add a fixed constraint.
  const settled = settleShape(moved, source);
  assert.equal(settled.error, null);
  assert.equal(settled.shape?.kind, 'polygon');
  if (settled.shape?.kind !== 'polygon') assert.fail('settled polygon');
  assert.deepEqual(settled.shape.points, moved.points); assert.deepEqual(settled.shape.rules, source.rules);
  assert.equal(dragOutlinePoint(source, 2, [46, 30]), source, 'projected no-motion clears a prior preview');
  const again = dragOutlinePoint(moved, 2, [48, 45]);
  assert.ok(again); near(again.points[2][1], 45);
  assert.deepEqual(again.rules, source.rules);
});

test('a free straight point follows an exact two-axis target; fixed points and invalid targets stay put', () => {
  const source: Polygon = { ...rectangle(), hv: { h: [], v: [] }, lengths: {} };
  const before = structuredClone(source), moved = dragOutlinePoint(source, 2, [45, 37]);
  assert.ok(moved); near(moved.points[2][0], 45); near(moved.points[2][1], 37);
  assert.equal(dragOutlinePoint(source, 0, [1, 1]), null);
  const fixed: Polygon = { ...source, rules: [{ kind: 'fix', point: 2, at: [40, 30] }] };
  assert.equal(dragOutlinePoint(fixed, 2, [45, 37]), null);
  for (const target of [[NaN, 1], [1, Infinity], [20000, 20]] as P2[])
    assert.equal(dragOutlinePoint(source, 2, target), null);
  for (const index of [-1, 4, 1.5]) assert.equal(dragOutlinePoint(source, index, [45, 37]), null);
  assert.deepEqual(source, before);
});

test('crossing, collapsed and reversed previews are refused without changing the last valid shape', () => {
  const source: Polygon = { ...rectangle(), hv: { h: [], v: [] }, lengths: {} };
  const valid = dragOutlinePoint(source, 2, [45, 37]);
  assert.ok(valid);
  const before = structuredClone(valid);
  for (const target of [[-5, 15], [40, 0], [0, -10]] as P2[])
    assert.equal(dragOutlinePoint(valid, 2, target), null);
  assert.deepEqual(valid, before);
  const anchored = rectangle();
  assert.equal(dragOutlinePoint(anchored, 2, [40, 0]), null);
  assert.equal(dragOutlinePoint(anchored, 2, [40, -10]), null);
});

test('a first-order tangent is not a finite motion certificate for a locked-length point', () => {
  const source: Polygon = { kind: 'polygon', closed: true, points: [[0, 0], [30, 0], [0, 40]],
    hv: { h: [], v: [] }, lengths: { 0: 30 } };
  assert.equal(canDragOutlinePoint(source), true);
  const before = structuredClone(source);
  assert.equal(dragOutlinePoint(source, 1, [30, 10]), null, 'the tangent target changes the locked length');
  const feasible = dragOutlinePoint(source, 1, [Math.sqrt(800), 10]);
  assert.ok(feasible);
  near(Math.hypot(...feasible.points[1]), 30);
  assert.deepEqual(source, before);
});

test('a saved R6 outline keeps both tangents, IDs and native cylindrical radius after point drag', () => {
  const profile = profileOf([rounded()]);
  if ('error' in profile || !profile.node.outline) assert.fail('fixture must save its authored outline');
  const source = { ...outlinePolygon(profile.node.outline), ids: rounded().ids }, before = structuredClone(source);
  const moved = dragOutlinePoint(source, 3, [40, 40]);
  assert.ok(moved);
  near(moved.points[3][0], 34); near(moved.points[3][1], 40);
  const arc = arcOf(moved.points[2], moved.points[3], moved.bulges![2]);
  near(arc.radius, 6); near(arc.sweep, Math.PI / 2, 1e-9);
  for (const [joint, other] of [[2, 1], [3, 4]]) {
    const radius = vector(arc.center, moved.points[joint]), carrier = vector(moved.points[joint], moved.points[other]);
    near((radius[0] * carrier[0] + radius[1] * carrier[1]) / Math.hypot(...carrier), 0);
  }
  assert.deepEqual(moved.radii, source.radii); assert.deepEqual(moved.tangents, source.tangents);
  assert.deepEqual(moved.rules, source.rules); assert.deepEqual(moved.ids, source.ids);
  assert.deepEqual(source, before);
  assert.ok(buildProfileLoop(outlineSegments(moved.points, moved.bulges)).area > 0);
  const finished = profileOf([moved]);
  if ('error' in finished) assert.fail(finished.error);
  const snapshot = partSnapshot(withNode(withNode(emptyDoc(), finished.node), { kind: 'extrude', sketch: 0, height: 2 }));
  assert.equal(snapshot.outputs.length, 1);
  const [body] = snapshot.outputs;
  assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
  const face = body.brep.faces.find(item => item.name === 'n1.side[round]');
  assert.ok(face);
  const geometry = faceGeometry(face);
  assert.equal(geometry.kind, 'cylinder'); near(geometry.r, 6);
});

test('admission refuses unsettled or unsupported ownership and unconstrained arc definitions', () => {
  const source = rounded();
  const failures: Polygon[] = [
    { ...source, closed: false }, { ...source, pending: true }, { ...source, construction: true },
    { ...source, fromSpline: true }, { ...source, fromEllipse: true },
    { ...source, circles: [{ c: [20, 10], r: 2 }] }, { ...source, circleIds: ['hole'] },
    { ...source, radii: {} }, { ...source, tangents: [2] },
    { ...source, points: source.points.map((p, i) => i === 2 ? [41, 24] : p) },
    { ...source, bulges: [0, 0, 1, 0, 0] },
    { ...source, bulges: [0, 0, NaN, 0, 0] },
    { ...source, bulges: [0, 0, Math.tan(Math.PI / 8)] },
    { ...source, lengths: { 2: 20 } },
  ];
  for (const shape of failures) {
    const before = structuredClone(shape);
    assert.equal(canDragOutlinePoint(shape), false);
    assert.equal(dragOutlinePoint(shape, 3, [40, 40]), null);
    assert.deepEqual(shape, before);
  }
  assert.equal(canDragOutlinePoint(null), false);
  assert.equal(canDragOutlinePoint({ kind: 'circle', c: [0, 0], r: 6 }), false);
});
