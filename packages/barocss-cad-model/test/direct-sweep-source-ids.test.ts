import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCurve, evaluateSurface } from '@barocss/cad';
import { analyzeSurface, directOps, emptyDirect, geometryOf, importSource } from '../src/engine/direct';
const source = (points: number[][], degree = 1, weights = points.map(() => 1)) => `@model rail { version:0; length-unit:mm; @curve #c1 {type:nurbs; degree:${degree}; knots:${JSON.stringify([...Array(degree + 1).fill(0), ...Array(degree + 1).fill(1)])}; control-points:${JSON.stringify(points)}; weights:${JSON.stringify(weights)};}}`;
test('separate source-local c1 curves sweep without renaming or moving their originals', () => {
  let d = importSource(emptyDirect(), source([[10, 10, 0], [30, 10, 0]]), 'profile');
  d = importSource(d, source([[45, 10, 0], [45, 30, 0]]), 'path');
  assert.deepEqual(d.objects.map(o => o.geometry), ['c1', 'c1']);
  const before = structuredClone(d), [a, b] = d.objects;
  const swept = directOps.sweep(d, a.id, b.id), result = swept.objects.at(-1)!;
  assert.deepEqual(d, before); assert.deepEqual(swept.objects.slice(0, 2), before.objects);
  for (const [key, text] of Object.entries(before.sources)) assert.equal(swept.sources[key], text);
  const inspection = analyzeSurface(swept, result.id, .5, .5);
  assert.deepEqual(inspection.point, [20, 20, 0]); assert.deepEqual(inspection.normal, [0, 0, 1]);
  const again = directOps.sweep(swept, a.id, b.id);
  assert.notEqual(again.objects.at(-1)!.geometry, result.geometry);
  assert.deepEqual(analyzeSurface(again, again.objects.at(-1)!.id, .5, .5).point, [20, 20, 0]);
  assert.throws(() => directOps.sweep(d, 'missing', b.id));
  assert.throws(() => directOps.sweep(swept, result.id, b.id));
  assert.throws(() => directOps.sweep(d, a.id, a.id), /different profile and path/);
  assert.deepEqual(d, before);
});
test('temporary composition aliases preserve unequal-degree rational geometry samples', () => {
  let d = importSource(emptyDirect(), source([[0, 0, 0], [10, 10, 0], [20, 0, 0]], 2, [1, .75, 1]), 'profile');
  d = importSource(d, source([[0, 0, 5], [0, 0, 15]]), 'path');
  const before = structuredClone(d), [a, b] = d.objects;
  const profile = geometryOf(d, a), path = geometryOf(d, b);
  assert.ok(profile.kind === 'curve' && path.kind === 'curve');
  const swept = directOps.sweep(d, a.id, b.id), surface = geometryOf(swept, swept.objects.at(-1)!);
  assert.ok(surface.kind === 'surface');
  const origin = evaluateCurve(path, 0);
  for (const u of [0, .2, .5, .8, 1]) for (const v of [0, .3, .7, 1]) {
    const p = evaluateCurve(profile, u), r = evaluateCurve(path, v), actual = evaluateSurface(surface, u, v);
    p.forEach((value, axis) => assert.ok(Math.abs(actual[axis] - (value + r[axis] - origin[axis])) < 1e-9));
  }
  assert.deepEqual(d, before);
});
