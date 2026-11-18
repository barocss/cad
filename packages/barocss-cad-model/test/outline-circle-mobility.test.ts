import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineMobility } from '../src/sketch/mobility';
import { solveShape, type Polygon } from '../src/sketch/rules';
import { settledOutlinePointMobility } from '../src/sketch/profile';
import { constraintsOf } from '../src/sketch/rules';
function fixture(): Polygon {
 const points: Polygon['points'] = [[0, 0], [40, 0], [40, 30], [0, 30]];
 return { kind: 'polygon', closed: true, points, hv: { h: [], v: [] }, circles: [{ c: [3, 4], r: 1 }], circleIds: ['e5'],
  rules: points.map((at, point) => ({ kind: 'fix', point, at })) };
}
function withRules(rules: NonNullable<Polygon['rules']>): Polygon { const s = fixture(); return { ...s, rules: [...s.rules!, ...rules] }; }
test('one free attached centre reports two directions without exposing solver helpers', () => {
 const s = fixture(), result = outlineMobility(s); assert.ok(result);
 assert.deepEqual(result, { points: [], edges: [], directions: [], circleDirections: [{ circle: 0, motion: { dimension: 2 } }] });
 assert.deepEqual(settledOutlinePointMobility(s.points, constraintsOf(s)), []);
});
test('circle X/Y distances and radial distance give independent first-order mathematical directions', () => {
 for (const [kind, value, expected] of [['cdx', 3, [0, 1]], ['cdy', 4, [1, 0]], ['cdist', 5, [0.8, -0.6]]] as const) {
  const s = withRules([{ kind, a: 0, circle: 0, value }]), result = outlineMobility(s); assert.ok(result);
  assert.deepEqual(result.points, []); assert.deepEqual(result.edges, []); assert.deepEqual(result.directions, []);
  assert.equal(result.circleDirections?.length, 1);
  const motion = result.circleDirections![0].motion; assert.ok(motion?.dimension === 1);
  if (motion?.dimension !== 1) return;
  assert.ok(Math.abs(motion.direction[0] * expected[1] - motion.direction[1] * expected[0]) < 1e-12);
  assert.ok(Math.abs(Math.hypot(...motion.direction) - 1) < 1e-12);
 }
 const locked = withRules([{ kind: 'cdx', a: 0, circle: 0, value: 3 }, { kind: 'cdy', a: 0, circle: 0, value: 4 }]);
 assert.deepEqual(outlineMobility(locked), { points: [], edges: [], directions: [], circleDirections: [] });
});
test('zero-distance singularity and unsatisfied residuals are unavailable', () => {
 const zero = withRules([{ kind: 'cdist', a: 0, circle: 0, value: 0 }]); zero.circles = [{ c: [0, 0], r: 1 }];
 assert.equal(outlineMobility(zero), null);
 assert.equal(outlineMobility(withRules([{ kind: 'cdist', a: 0, circle: 0, value: 6 }])), null);
});
test('circle diagnosis does not alter source, radius or ordinary solver results', () => {
 for (const rules of [[], [{ kind: 'cdx' as const, a: 0, circle: 0, value: 3 }], [{ kind: 'cdist' as const, a: 0, circle: 0, value: 5 }]]) {
  const s = withRules(rules), snapshot = structuredClone(s), before = solveShape(structuredClone(s)); assert.ok(before.ok);
  assert.ok(outlineMobility(s)); assert.deepEqual(s, snapshot);
  assert.deepEqual(solveShape(structuredClone(s)), before);
 }
});
test('malformed circles, IDs and unsupported compound constraints refuse rather than ignore data', () => {
 const s = fixture();
 const failures: Polygon[] = [
  ...[0, -1, NaN, Infinity].map(r => ({ ...s, circles: [{ c: [3, 4] as [number, number], r }] })),
  { ...s, circles: [{ c: [NaN, 4], r: 1 }] }, { ...s, circles: [{ c: [3, Infinity], r: 1 }] },
  { ...s, circleIds: [] }, { ...s, circleIds: [''] }, { ...s, circleIds: ['a', 'b'] },
  { ...s, circles: [...s.circles!, { c: [8, 8], r: 1 }] },
  { ...s, bulges: [0.5, 0, 0, 0] }, { ...s, fromSpline: true }, { ...s, fromEllipse: true },
  withRules([{ kind: 'cdx', a: 4, circle: 0, value: 3 }]), withRules([{ kind: 'cdx', a: 0.5, circle: 0, value: 3 }]),
  withRules([{ kind: 'cdx', a: 0, circle: 1, value: 3 }]), withRules([{ kind: 'cdx', a: 0, circle: 0, value: NaN }]),
  withRules([{ kind: 'cdist', a: 0, circle: 0, value: -5 }]),
  withRules([{ kind: 'ctan', edge: 0, circle: 0 }]), withRules([{ kind: 'cedge', edge: 0, circle: 0, axis: 1, value: 4 }]),
  withRules([{ kind: 'cconc', a: 0, b: 0 }]),
 ];
 for (const candidate of failures) assert.equal(outlineMobility(candidate), null);
});
test('circle-free straight and arc results retain the prior public object shape', () => {
 const s = fixture(); delete s.circles; delete s.circleIds;
 assert.deepEqual(outlineMobility(s), { points: [], edges: [], directions: [] });
 const arc = { ...s, bulges: [0.5, 0, 0, 0] };
 assert.deepEqual(outlineMobility(arc), { points: [], edges: [0], directions: [] });
});
