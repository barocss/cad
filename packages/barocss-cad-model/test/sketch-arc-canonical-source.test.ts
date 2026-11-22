import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, compileCadModel, type Curve, type Surface } from '@barocss/cad';
import { part } from '../src/api';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { curvesSource, outlineCurve, type NurbsCurve } from '../src/engine/curveSource';
import { emptyDoc } from '../src/engine/doc';
import { directOps, emptyDirect, geometryOf, importSource } from '../src/engine/direct';
import { partBreps } from '../src/engine/evaluate';
import { tiltPlane, xyPlane } from '../src/sketch/plane';

const quarter = Math.tan(Math.PI / 8);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('a newly authored cardinal quarter retains exact endpoints, tangent pole and canonical weight through source', () => {
  const points: [number, number][] = [[30, 20], [20, 30]], before = structuredClone(points);
  const curve = outlineCurve(xyPlane(), points, [quarter], false), source = curvesSource('sketch', [curve]);
  assert.deepEqual(curve.points, [[30, 20, 0], [30, 30, 0], [20, 30, 0]]);
  assert.deepEqual(curve.weights, [1, Math.SQRT1_2, 1]);
  assert.match(source, /weights: \[1,0\.7071067811865476,1\]/);
  const compiled = compileCadModel(source, { sourceVersion: 0 }); assert.ok(compiled.ok);
  assert.equal(compiled.model.objects[0].kind, 'curve');
  const actual = compiled.model.objects[0] as Curve;
  assert.deepEqual(actual.controlPoints, curve.points); assert.deepEqual(actual.weights, curve.weights);
  assert.deepEqual(points, before);
});

test('signed dyadic quarter turns preserve a noncardinal tangent triangle on a translated XY plane', () => {
  for (const sign of [-1, 1]) {
    const curve = outlineCurve({ ...xyPlane(1.25), origin: [8, -3, 1.25] }, [[-.5, .25], [2.5, 4.25]], [sign * quarter], false);
    assert.deepEqual(curve.points[0], [7.5, -2.75, 1.25]);
    assert.deepEqual(curve.points[2], [10.5, 1.25, 1.25]);
    assert.deepEqual(curve.points[1], sign > 0 ? [11, -2.25, 1.25] : [7, .75, 1.25]);
    assert.deepEqual(curve.weights, [1, Math.SQRT1_2, 1]);
    assert.match(curvesSource('sketch', [curve]), /0\.7071067811865476/);
  }
});

test('uncertified curves retain legacy nine-decimal spelling', () => {
  const ordinary: NurbsCurve = { degree: 2, knots: [0, 0, 0, 1, 1, 1],
    points: [[30, 20, 0], [30, 30, 0], [20, 30, 0]], weights: [1, Math.SQRT1_2, 1] };
  assert.match(curvesSource('legacy', [ordinary]), /weights: \[1,0\.707106781,1\]/);
  const fallback = [
    outlineCurve(xyPlane(), [[30, 20], [20, 30]], [Math.round(quarter * 1e9) / 1e9], false),
    outlineCurve(xyPlane(), [[30, 20], [20, 30]], [Math.SQRT2 - 1], false),
    outlineCurve(xyPlane(), [[30.1, 20], [20, 30]], [quarter], false),
    outlineCurve(tiltPlane(xyPlane(), 45), [[30, 20], [20, 30]], [quarter], false),
    outlineCurve(xyPlane(), [[30, 20], [20, 30]], [quarter], true),
  ];
  for (const curve of fallback) assert.doesNotMatch(curvesSource('legacy', [curve]), /0\.7071067811865476/);
  const mutated = outlineCurve(xyPlane(), [[30, 20], [20, 30]], [quarter], false);
  mutated.points[1][0] = 30.123456789123;
  assert.match(curvesSource('legacy', [mutated]), /30\.123456789,/);
});

test('authored quarter source survives Duplicate, vertical Move, native Ruled and exact cylinder Thicken', () => {
  for (const sign of [-1, 1]) {
  const curve = outlineCurve(xyPlane(), [[30, 20], [20, 30]], [sign * quarter], false);
  const original = importSource(emptyDirect(), curvesSource('sketch', [curve]), 'Sketch curve 1'), saved = structuredClone(original);
  const first = original.objects[0].id, copied = directOps.duplicate(original, [first]), second = copied.objects.at(-1)!.id;
  const moved = directOps.move(copied, [second], [0, 0, 20]), ruled = directOps.ruledSurface(moved, first, second);
  const geometry = geometryOf(ruled, ruled.objects.at(-1)!); assert.equal(geometry.kind, 'surface');
  const surface = geometry as Surface;
  assert.deepEqual(surface.weights, [[1, 1], [Math.SQRT1_2, Math.SQRT1_2], [1, 1]]);
  const tangent = sign > 0 ? [30, 30] : [20, 20];
  assert.deepEqual(surface.controlPoints, [[[30, 20, 0], [30, 20, 20]], [[...tangent, 0], [...tangent, 20]], [[20, 30, 0], [20, 30, 20]]]);
  const { degreeU, degreeV, knotsU, knotsV, controlPoints, weights } = surface;
  const made = part().thicken({ degreeU, degreeV, knotsU, knotsV, controlPoints, weights }, { t: 2, side: 'both', mode: 'exact-cylinder' });
  const [{ brep }] = partBreps(made.doc);
  assert.equal(checkBrep(brep, { strict: true }).valid, true); assert.equal(brep.faces.length, 6);
  near(made.mass({ density: 1 }).volume, 200 * Math.PI);
  assert.deepEqual(original, saved); assert.equal(ruled.sources[original.objects[0].source], original.sources[original.objects[0].source]);
  }
});

test('authored signed semicircles retain both canonical quarters through Ruled and exact Thicken', () => {
  const railWeights = [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1];
  const railKnots = [0, 0, 0, 1, 1, 2, 2, 2];
  for (const sign of [-1, 1]) {
    const curve = outlineCurve(xyPlane(), [[30, 20], [10, 20]], [sign], false);
    const y = 20 + sign * 10;
    assert.deepEqual(curve.points, [[30, 20, 0], [30, y, 0], [20, y, 0], [10, y, 0], [10, 20, 0]]);
    assert.deepEqual(curve.weights, railWeights);
    assert.deepEqual(curve.knots, railKnots);
    const direct = importSource(emptyDirect(), curvesSource('sketch', [curve]), 'Semicircle');
    const first = direct.objects[0].id, copied = directOps.duplicate(direct, [first]), second = copied.objects[1].id;
    const moved = directOps.move(copied, [second], [0, 0, 12]);
    const ruled = directOps.ruledSurface(moved, first, second);
    const native = geometryOf(ruled, ruled.objects.at(-1)!);
    assert.equal(native.kind, 'surface');
    const { degreeU, degreeV, knotsU, knotsV, controlPoints, weights } = native as Surface;
    assert.deepEqual(knotsU, railKnots);
    assert.deepEqual(weights, railWeights.map(w => [w, w]));
    assert.deepEqual(controlPoints, curve.points.map(point => [point, [point[0], point[1], 12]]));
    const made = part().thicken({ degreeU, degreeV, knotsU, knotsV, controlPoints, weights },
      { t: 2, side: sign > 0 ? 'reverse' : 'normal', mode: 'exact-cylinder' });
    const [{ brep }] = partBreps(made.doc);
    assert.equal(checkBrep(brep, { strict: true }).valid, true);
    assert.equal(brep.faces.length, 6);
    near(made.mass({ density: 1 }).volume, 216 * Math.PI);
  }
});

test('the original rounded quarter source and saved document remain unchanged on native reopen', async () => {
  const curve = outlineCurve(xyPlane(), [[30, 20], [20, 30]], [Math.round(quarter * 1e9) / 1e9], false);
  const source = curvesSource('sketch', [curve]);
  assert.match(source, /29\.999999994,29\.999999994/);
  assert.match(source, /weights: \[1,0\.707106782,1\]/);
  const doc = { ...emptyDoc(), direct: importSource(emptyDirect(), source, 'Legacy sketch curve') };
  const opened = await readStudioFile(encodeStudioFile(doc)); assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, doc);
  assert.equal(Object.values(opened.doc.direct!.sources)[0], source);
});
