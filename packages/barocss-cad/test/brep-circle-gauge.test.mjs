import test from 'node:test';
import assert from 'node:assert/strict';
import { booleanAnalytic, brepMassProperties, buildBrep, lineCurve, validateCurve, evaluateCurve, checkBrep, tessellateBrep, projectBrepHiddenLines, evaluateCadPart } from '../dist/index.js';
import { circleOf } from '../dist/brep/brep-tessellate.js';

const TOP = { toward: [0, 0, 1], up: [0, 1, 0] };
const OPTIONS = { segmentsPerQuarter: 12 };
const tolerance = 1e-9 * 6;
const wire = value => JSON.stringify(value);
const distance = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
const close = (a, b) => assert.ok(distance(a, b) <= tolerance, `${a} differs from ${b}`);
function circle(gauge = 1) {
  return { kind: 'curve', id: 'circle', degree: 2, knots: [2, 2, 2, 3, 3, 5, 5, 5],
    controlPoints: [[6, 0, 0], [6, 6, 0], [0, 6, 0], [-6, 6, 0], [-6, 0, 0]],
    weights: [gauge, gauge * Math.SQRT1_2, gauge, gauge * Math.SQRT1_2, gauge] };
}
function sheet(curve) {
  return buildBrep({ source: { family: 'circle-gauge-test', id: 'sheet' },
    vertices: [{ id: 'a', point: [6, 0, 0] }, { id: 'b', point: [-6, 0, 0] }],
    edges: [{ id: 'arc', name: 'arc', curve, vertices: ['a', 'b'] },
      { id: 'diameter', name: 'diameter', curve: lineCurve('diameter_curve', [-6, 0, 0], [6, 0, 0]), vertices: ['b', 'a'] }],
    bodies: [{ id: 'sheet', kind: 'sheet', shells: [{ id: 'open', closed: false, faces: [{ id: 'face', name: 'face', sense: 'forward',
      surface: { kind: 'surface', id: 'plane', degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1],
        controlPoints: [[[-6, -6, 0], [-6, 6, 0]], [[6, -6, 0], [6, 6, 0]]], weights: [[1, 1], [1, 1]] },
      loops: [{ kind: 'outer', uses: [{ edge: 'arc', sense: 'forward' }, { edge: 'diameter', sense: 'forward' }] }] }] }] }] });
}
function valid(body) {
  const report = checkBrep(body, { strict: true });
  assert.equal(report.valid, true, report.issues.join('\n'));
  assert.equal(body.bodies[0].kind, 'sheet');
  assert.equal(body.shells[0].closed, false); // An open sheet's fractional genus is not a solid failure.
  return report;
}
function sourcePoint(t) {
  const upper = t > 3, f = upper ? (t - 3) / 2 : t - 2;
  const points = upper ? [[0, 6, 0], [-6, 6, 0], [-6, 0, 0]] : [[6, 0, 0], [6, 6, 0], [0, 6, 0]];
  const factors = [(1 - f) ** 2, 2 * f * (1 - f) * Math.SQRT1_2, f * f], denominator = factors.reduce((s, x) => s + x, 0);
  return [0, 1, 2].map(k => factors.reduce((s, x, i) => s + x * points[i][k], 0) / denominator);
}
const visibleArcs = edge => edge.pieces.filter(p => p.visible && p.ink !== false).map(p => { assert.equal(p.curve.kind, 'arc'); return p.curve; });
function onArc(q, arc) {
  const x = q[0] - arc.center[0], y = q[1] - arc.center[1], det = arc.u[0] * arc.v[1] - arc.u[1] * arc.v[0];
  const co = (x * arc.v[1] - y * arc.v[0]) / det, si = (arc.u[0] * y - arc.u[1] * x) / det;
  if (Math.abs(Math.hypot(co, si) - 1) * 6 > tolerance) return false;
  const from = arc.t0, to = arc.t1, angle = Math.atan2(si, co);
  return [-2 * Math.PI, 0, 2 * Math.PI].some(offset => angle + offset >= from - tolerance / 6 && angle + offset <= to + tolerance / 6);
}

test('global positive gauges preserve the native circle and its nonuniform span parameters', () => {
  const canonical = circle(), reference = circleOf(canonical);
  assert.ok(reference); close(reference.c, [0, 0, 0]); assert.ok(Math.abs(reference.r - 6) <= tolerance);
  assert.deepEqual(reference.spans.map(s => [s.k0, s.k1]), [[2, 3], [3, 5]]);
  for (const gauge of [2, .5, 3, .001]) {
    const curve = circle(gauge), before = wire(curve); validateCurve(curve);
    const actual = circleOf(curve); assert.ok(actual, `gauge ${gauge}`);
    close(actual.c, [0, 0, 0]); assert.ok(Math.abs(actual.r - 6) <= tolerance);
    assert.deepEqual(actual.spans.map(s => [s.k0, s.k1]), [[2, 3], [3, 5]]);
    if (gauge === 2 || gauge === .5) assert.deepEqual(actual, reference, 'Power-of-two gauge retains the canonical frame bits.');
    for (const t of [2, 2.125, 2.5, 3, 3.5, 4.25, 5]) close(evaluateCurve(curve, t), sourcePoint(t));
    assert.equal(wire(curve), before);
  }
});

test('legacy unit and admitted near-unit weight arithmetic remains unchanged', () => {
  const canonical = circle(), before = wire(canonical), reference = circleOf(canonical);
  const nearUnit = circle(); for (let i = 0; i < nearUnit.weights.length; i += 2) nearUnit.weights[i] = 1 + 5e-13;
  validateCurve(nearUnit);
  assert.deepEqual(circleOf(nearUnit), reference, 'Legacy endpoint-weight allowance must not trigger renormalization.');
  assert.equal(wire(canonical), before);
});

test('new gauge recognition declines unequal endpoints, distorted poles, ellipses and non-Bezier knot spans', () => {
  const wrongEndpoint = circle(2); wrongEndpoint.weights[4] = 3;
  const wrongMiddle = circle(2); wrongMiddle.controlPoints[3][1] += 1;
  const outOfPlane = circle(2); outOfPlane.controlPoints[4][2] = 1e-5;
  const ellipse = circle(2); ellipse.controlPoints = ellipse.controlPoints.map(([x, y, z]) => [2 * x, y, z]);
  const nonBezier = circle(2); nonBezier.knots = [2, 2, 2, 3, 4, 5, 5, 5];
  const polynomial = circle(2); polynomial.weights.fill(2);
  const collinear = circle(2); collinear.controlPoints = collinear.controlPoints.map(([x]) => [x, 0, 0]);
  for (const curve of [wrongEndpoint, wrongMiddle, outOfPlane, ellipse, nonBezier, polynomial, collinear]) {
    validateCurve(curve); const before = wire(curve);
    assert.equal(circleOf(curve), null, 'Valid native data does not by itself certify a common-gauge circular Bezier chain.');
    assert.equal(wire(curve), before);
  }
});

test('global-gauge source binding admits rigid orientation and coherent native reversal', () => {
  const transformed = circle(2); transformed.controlPoints = transformed.controlPoints.map(([x, y, z]) => [x + 7, -z - 3, y + 4]);
  validateCurve(transformed); const frame = circleOf(transformed); assert.ok(frame); close(frame.c, [7, -3, 4]); assert.ok(Math.abs(frame.r - 6) <= tolerance);
  const reversed = circle(2); reversed.knots = [2, 2, 2, 4, 4, 5, 5, 5]; reversed.controlPoints.reverse(); reversed.weights.reverse();
  validateCurve(reversed); const reverseFrame = circleOf(reversed); assert.ok(reverseFrame);
  assert.deepEqual(reverseFrame.spans.map(s => [s.k0, s.k1]), [[2, 4], [4, 5]]);
  assert.equal(reverseFrame.sign, -circleOf(circle()).sign); close(reverseFrame.c, [0, 0, 0]);
});

test('the same native half-sheet edge gains analytic output with unchanged unit mesh and no source rewrite', () => {
  const unit = sheet(circle()), scaledCurve = circle(2), scaled = sheet(scaledCurve), before = wire(scaled);
  valid(unit); valid(scaled); assert.equal(scaled.edges.find(e => e.id === 'arc').curve, scaledCurve);
  assert.deepEqual(tessellateBrep(scaled, OPTIONS), tessellateBrep(unit, OPTIONS));
  const canonical = projectBrepHiddenLines([unit], TOP, OPTIONS), result = projectBrepHiddenLines([scaled], TOP, OPTIONS);
  assert.deepEqual(result, canonical);
  const arcs = visibleArcs(result.edges.find(e => e.name === 'arc')); assert.ok(arcs.length > 0);
  for (const t of [2.5, 3, 4]) assert.ok(arcs.some(a => onArc(sourcePoint(t), a)));
  assert.equal(wire(scaled), before);
});

test('analytic global-gauge recognition retains genuine foreground occlusion', () => {
  const box = evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-2, 3], max: [2, 7] }, { id: 'e', kind: 'extrude', sketch: 's', height: 2 },
  ] }).outputs[0].brep;
  assert.equal(checkBrep(box, { strict: true }).valid, true);
  const curve = circle(2), cap = sheet(curve), before = wire({ box, cap });
  const projection = projectBrepHiddenLines([box, cap], TOP, OPTIONS);
  const edge = projection.edges.find(e => e.name === 'arc'); assert.ok(edge);
  for (const [t, visible] of [[2.5, true], [3, false], [4, true]]) {
    assert.ok(edge.pieces.some(piece => piece.visible === visible && piece.ink !== false && piece.curve.kind === 'arc' && onArc(sourcePoint(t), piece.curve)), `native t=${t}, visible=${visible}`);
  }
  assert.equal(wire({ box, cap }), before);
});

function cylinder(id, radius, from, height) {
  return evaluateCadPart({format:'barocss-cad-part',version:1,units:'mm',parameters:{},features:[
    {id:id+'s',kind:'sketch',profile:'circle',center:[0,0],radius},
    {id,kind:'extrude',sketch:id+'s',from,height},
  ]}).outputs[0].brep;
}

test('one common gauge preserves cylindrical and native through-bore Boolean results', () => {
  const source = cylinder('stock', 6, 0, 8), scaled = structuredClone(source);
  for (const edge of scaled.edges) if (edge.curve.degree === 2) edge.curve.weights = edge.curve.weights.map(w => 2*w);
  for (const face of scaled.faces) if (face.surface.kind === 'surface' && face.surface.degreeU === 2)
    face.surface.weights = face.surface.weights.map(row => row.map(w => 2*w));
  const before = wire(scaled), tool = cylinder('cutter',2,-1,10);
  for (const input of [source,scaled]) {
    assert.ok(checkBrep(input,{strict:true}).valid);
    const cut = booleanAnalytic(input,tool,'difference');
    const strict = checkBrep(cut,{strict:true});
    assert.ok(strict.valid,strict.issues.join('\n'));
    assert.ok(Math.abs(brepMassProperties(cut,1).volume - 256*Math.PI) < 1e-7);
  }
  assert.equal(wire(scaled),before);
});
