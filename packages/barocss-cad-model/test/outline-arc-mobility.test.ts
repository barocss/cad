import assert from 'node:assert/strict';
import test from 'node:test';
import { outlineMobility } from '../src/sketch/mobility';
import { solveShape, type Polygon } from '../src/sketch/rules';

function fixedArc(bulge = 0.5): Polygon {
 const points: Polygon['points'] = [[0, 0], [20, 0], [20, 20], [0, 20]];
 return { kind: 'polygon', closed: true, points, bulges: [bulge, 0, 0, 0], hv: { h: [], v: [] },
  ids: ['e1', 'e2', 'e3', 'e4'], rules: points.map((at, point) => ({ kind: 'fix', point, at })) };
}
function quarterArc(fixed = true): Polygon {
 const points: Polygon['points'] = [[0, 0], [10, 10], [10, 20], [-10, 20], [-10, 0]];
 return { kind: 'polygon', closed: true, points, bulges: [Math.tan(Math.PI / 8), 0, 0, 0, 0], hv: { h: [], v: [] },
  rules: fixed ? points.map((at, point) => ({ kind: 'fix', point, at })) : [] };
}
test('fixed arc endpoints do not conceal first-order center motion or expose helper points', () => {
 const shape = fixedArc(), snapshot = structuredClone(shape), result = outlineMobility(shape);
 assert.ok(result);
 assert.deepEqual(result.points, []); assert.deepEqual(result.directions, []); assert.deepEqual(result.edges, [0]);
 assert.deepEqual(shape, snapshot);
 const locked = outlineMobility({ ...shape, radii: { 0: 12.5 } });
 assert.ok(locked); assert.deepEqual(locked, { points: [], edges: [], directions: [] });
});
test('semicircle radius lock is first-order singular, not evidence of finite motion', () => {
 const shape = { ...fixedArc(1), radii: { 0: 10 } }, result = outlineMobility(shape);
 assert.ok(result); assert.deepEqual(result.points, []); assert.deepEqual(result.directions, []); assert.deepEqual(result.edges, [0]);
 // Two radius-10 circles about fixed endpoints distance 20 have only one common center.
 // Their first-order equations nevertheless have a vertical nullspace at that center.
 assert.equal(Math.sqrt(10 * 10 - (20 / 2) ** 2), 0);
});
test('near-singular radius constraints return unavailable rather than a confident direction', () => {
 for (const b of [1 - 1e-9, 1 - 1e-7]) {
  const centerY = 10 * (1 - b * b) / (2 * b);
  assert.equal(outlineMobility({ ...fixedArc(b), radii: { 0: Math.hypot(10, centerY) } }), null);
 }
});
test('line-arc tangency removes center-only mobility without changing authored solver results', () => {
 const shape = quarterArc();
 assert.deepEqual(outlineMobility(shape)?.edges, [0]);
 for (const tangents of [[0], [1], [0, 1]]) {
  const candidate = { ...shape, tangents }, snapshot = structuredClone(candidate);
  const before = solveShape(structuredClone(candidate));
  assert.ok(before.ok);
  assert.deepEqual(outlineMobility(candidate), { points: [], edges: [], directions: [] });
  assert.deepEqual(solveShape(structuredClone(candidate)), before);
  assert.deepEqual(candidate, snapshot);
 }
 const free = outlineMobility(quarterArc(false)); assert.ok(free);
 assert.deepEqual(free.points, [1, 2, 3, 4]); assert.deepEqual(free.edges, [0, 1, 2, 3, 4]);
 assert.ok(free.directions.every(p => p.point >= 0 && p.point < 5));
 assert.equal(free.directions.find(p => p.point === 1)?.motion?.dimension, 2);
});
test('arc admission refuses silently ignored or malformed constraint metadata', () => {
 const shape = fixedArc();
 const failures: Polygon[] = [
  { ...shape, bulges: [NaN, 0, 0, 0] }, { ...shape, bulges: [Infinity, 0, 0, 0] },
  { ...shape, bulges: [0.5] }, { ...shape, bulges: [0.5, 0, 0, 0, 0] },
  { ...shape, hv: { h: [0], v: [] } }, { ...shape, hv: { h: [], v: [0] } },
  { ...shape, lengths: { 0: 20 } }, { ...shape, radii: { 1: 12.5 } },
  { ...shape, radii: { 0: NaN } }, { ...shape, radii: { 0: 0 } },
  { ...shape, tangents: [-1] }, { ...shape, tangents: [4] }, { ...shape, tangents: [0.5] },
  { ...shape, tangents: [2] },
  { ...shape, radii: Object.fromEntries([['00',12.5]]) }, { ...shape, lengths: Object.fromEntries([['1e0',20]]) },
  ...(['parallel','perpendicular','equal'] as const).map(kind=>({...shape,rules:[{kind,a:0,b:1}]})),
  { ...shape, rules: [{kind:'angle',a:0,b:1,value:90}] },
  { ...shape, rules: [{kind:'symmetric',a:1,b:2,line:0}] },
 ];
 for (const candidate of failures) assert.equal(outlineMobility(candidate), null);
});
test('the extension does not admit multiple arcs, composite circles or spline/ellipse ownership', () => {
 const shape = fixedArc();
 const failures: Polygon[] = [
  { ...shape, bulges: [0.5, 0, 0.5, 0] }, { ...shape, circles: [{ c: [10, 10], r: 2 }] },
  { ...shape, circleIds: ['c1'] }, { ...shape, equalRadii: [[0, 2]] }, { ...shape, concentric: [[0, 2]] },
  { ...shape, fromSpline: true }, { ...shape, fromEllipse: true },
  { ...shape, closed: false }, { ...shape, pending: true }, { ...shape, construction: true },
 ];
 for (const candidate of failures) assert.equal(outlineMobility(candidate), null);
});
