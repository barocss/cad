import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep } from '@barocss/cad';
import { part, Location, type RawNurbsPath } from '../src/api';
import { partBreps } from '../src/engine/evaluate';
import { importSource, geometryOf } from '../src/engine/direct';
import { resolveCurveFeaturePatternPath, curvePatternPathLength } from '../src/engine/curveFeaturePattern';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';

type P = [number, number, number];
const source = () => part('stock').box({ w: 60, d: 40, h: 10 })
 .subtract(p => p.box({ w: 4, d: 2, h: 10, x: 0, y: 8 }).moved(Location.at([8, 0, 0])));
const raw = (points: P[]): RawNurbsPath => ({ degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2], controlPoints: points, weights: [1, 1, 1, 1, 1] });
function linked(points: P[]) {
 const value = raw(points), doc = source().doc;
 // Test source must retain binary64 inputs; the authoring curvesSource formatter rounds to 1e-9.
 const decimal = (n: number): string => {
  const text = String(n); if (!text.includes('e')) return text;
  const [mantissa, exponent] = text.split('e'), negative = mantissa.startsWith('-');
  const unsigned = negative ? mantissa.slice(1) : mantissa, digits = unsigned.replace('.', '');
  const point = (unsigned.includes('.') ? unsigned.indexOf('.') : unsigned.length) + Number(exponent);
  return (negative ? '-' : '') + (point <= 0 ? '0.' + '0'.repeat(-point) + digits : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point));
 };
 const text = `@model rail {version:0; length-unit:mm; @curve #c1 {type:nurbs; degree:2; knots:[0,0,0,1,1,2,2,2]; control-points:[${points.map(p => '[' + p.map(decimal).join(',') + ']').join(',')}]; weights:[1,1,1,1,1];}}`;
 doc.direct = importSource({ sources: {}, objects: [] }, text, 'Path');
 const geometry = geometryOf(doc.direct, doc.direct.objects[0]);
 assert.ok(geometry.kind === 'curve');
 if (geometry.kind !== 'curve') throw new Error('curve source');
 assert.deepEqual(geometry.controlPoints, points, 'source compiler must preserve the exact tested coordinates');
 return { value, doc, path: { objectId: doc.direct.objects[0].id } };
}
const diagonal: P[] = [[0, 0, 0], [3, 4, 0], [12, 16, 0], [15, 20, 0], [24, 32, 0]];

test('linked non-midpoint oblique spans become temporary linear paths without rewriting their sources', () => {
 const cases: P[][] = [diagonal,
  [[24, 32, 48], [21, 28, 42], [12, 16, 24], [9, 12, 18], [0, 0, 0]],
  [[-12, -16, -24], [-9, -12, -18], [0, 0, 0], [3, 4, 6], [12, 16, 24]],
  [[0, 0, 0], [0, 0, 0], [12, 16, 0], [24, 32, 0], [24, 32, 0]],
 ];
 for (const points of cases) {
  const f = linked(points), snapshot = structuredClone(f.doc);
  const result = resolveCurveFeaturePatternPath(f.doc, f.path);
  assert.deepEqual(result, { degree: 1, knots: [0, 0, 1, 2, 2], weights: [1, 1, 1], controlPoints: [points[0], points[2], points[4]] });
  assert.throws(() => curvePatternPathLength(f.value), /exact endpoint midpoint/);
  assert.deepEqual(f.doc, snapshot);
 }
});
test('raw exact-midpoint and existing linked axis-segment contracts remain distinct', () => {
 const midpoint = raw([[0, 0, 0], [6, 8, 0], [12, 16, 0], [18, 24, 0], [24, 32, 0]]);
 assert.equal(curvePatternPathLength(midpoint), 40);
 const axis = linked([[0, 0, 0], [3, 0, 0], [12, 0, 0], [15, 0, 0], [24, 0, 0]]);
 assert.equal(resolveCurveFeaturePatternPath(axis.doc, axis.path).degree, 1);
 assert.throws(() => curvePatternPathLength(axis.value), /exact endpoint midpoint/);
});
test('one-ULP off-line, middle backtracking and zero chords are not approximated into straight spans', () => {
 const invalid: P[][] = [
  [[0, 0, 0], [3, 4 + Number.EPSILON * 4, 0], [12, 16, 0], [15, 20, 0], [24, 32, 0]],
  [[-1, -1, 0], [0, Number.MIN_VALUE, 0], [1, 1, 0], [1.5, 1.5, 0], [3, 3, 0]],
  [[0, 0, 0], [-3, -4, 0], [12, 16, 0], [15, 20, 0], [24, 32, 0]],
  [[0, 0, 0], [15, 20, 0], [12, 16, 0], [15, 20, 0], [24, 32, 0]],
  [[0, 0, 0], [0, 0, 0], [0, 0, 0], [3, 4, 0], [12, 16, 0]],
 ];
 for (const points of invalid) {
  const f = linked(points), snapshot = structuredClone(f.doc);
  assert.throws(() => resolveCurveFeaturePatternPath(f.doc, f.path));
  assert.deepEqual(f.doc, snapshot);
 }
});
test('oblique linked cut placement follows distance, preserves native geometry and reopens unchanged', async () => {
 const f = linked(diagonal), snapshot = structuredClone(f.doc);
 const result = part('linked diagonal', f.doc).curveFeaturePattern({ path: f.path, spacing: 8, count: 5 });
 function verify(doc: typeof result.doc) {
  const native = partBreps(doc); assert.equal(native.length, 1);
  assert.equal(native[0].brep.bodies.length, 1);
  const checked = checkBrep(native[0].brep); assert.ok(checked.valid, checked.issues.join('\n'));
  assert.ok(Math.abs(part('verify', doc).mass({ density: 1 }).volume - 23600) < 1e-7);
  for (let i = 0; i < 5; i++) for (const dx of [0, 4]) for (const dy of [0, 2]) for (const z of [0, 10]) {
   const expected = [8 + 4.8 * i + dx, 8 + 6.4 * i + dy, z];
   assert.equal(native[0].brep.vertices.filter(v => expected.every((c, k) => Math.abs(c - v.point[k]) < 1e-8)).length, 1);
  }
 }
 verify(result.doc); assert.deepEqual(f.doc, snapshot); assert.deepEqual(result.doc.direct, f.doc.direct);
 const opened = await readStudioFile(encodeStudioFile(result.doc)); assert.ok('doc' in opened);
 if (!('doc' in opened)) return;
 assert.deepEqual(opened.doc, result.doc); verify(opened.doc);
 assert.throws(() => part('too short', f.doc).curveFeaturePattern({ path: f.path, spacing: 11, count: 5 }));
 assert.deepEqual(f.doc, snapshot);
});
