import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBrep, checkBrep, elevateBezierCurveDegree, evaluateCurve, lineCurve, projectBrepHiddenLines, tessellateBrep, validateCurve } from '../dist/index.js';
import { balancedQuadraticStations } from '../dist/brep/balanced-quadratic-stations.js';
import { rationalEdgeStations } from '../dist/brep/compressed-edge-stations.js';
import { insertCurveKnotCoefficientsTrusted } from '../dist/nurbs/curves/curve-knot-insertion.js';
import { planarScaleSliver } from '../dist/brep/brep-check-geometry.js';

function cap(weights, height = 0.01, domain = [0, 1], transform = curve => curve) {
  const a = [0, 0, 0], b = [1, 0, 0];
  const curve = transform({ kind: 'curve', id: 'arch-curve', degree: 2,
    knots: [...Array(3).fill(domain[0]), ...Array(3).fill(domain[1])],
    controlPoints: [a, [0.5, height, 0], b], weights });
  const brep = buildBrep({
    source: { family: 'rational-cap', id: 'cap' },
    vertices: [{ id: 'a', point: a }, { id: 'b', point: b }],
    edges: [
      { id: 'arch', name: 'arch', curve, vertices: ['a', 'b'] },
      { id: 'chord', curve: lineCurve('line', a, b), vertices: ['a', 'b'] },
    ],
    bodies: [{ id: 'sheet', kind: 'sheet', shells: [{ id: 'open', closed: false, faces: [{
      id: 'cap', sense: 'forward',
      surface: { kind: 'surface', id: 'plane', degreeU: 1, degreeV: 1,
        knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1],
        controlPoints: [[a, [0, height, 0]], [b, [1, height, 0]]], weights: [[1, 1], [1, 1]] },
      loops: [{ kind: 'outer', uses: [{ edge: 'arch', sense: 'reversed' }, { edge: 'chord', sense: 'forward' }] }],
    }] }] }],
  });
  return { brep, curve };
}

test('balanced rational cap stations preserve the original coefficients and the physical bend', () => {
  for (const [weights, domain] of [
    [[1e-6, 1, 1e6], [0, 1]], [[1e6, 1, 1e-6], [0, 1]],
    [[1e-6, 0.5, 250000], [-2, 5]], [[2e-6, 1, 500000], [-2, 5]],
  ]) {
    const { brep, curve } = cap(weights, 0.01, domain);
    const original = JSON.stringify(brep);
    const strict = checkBrep(brep, { strict: true });
    assert.ok(strict.valid, strict.issues.join('\n'));
    assert.equal(planarScaleSliver(brep), undefined);
    const stations = balancedQuadraticStations(curve, 9);
    assert.deepEqual([stations[0], stations.at(-1)], domain);
    for (const [i, t] of stations.entries()) {
      const u = i / (stations.length - 1);
      const actual = evaluateCurve(curve, t);
      assert.ok(Math.abs(actual[0] - u) < 1e-9);
      assert.ok(Math.abs(actual[1] - 0.02 * u * (1 - u)) < 1e-11);
    }
    const mesh = tessellateBrep(brep, { segmentsPerQuarter: 12 });
    const arch = mesh.edges.find(edge => edge.edgeId === 'arch').points;
    assert.equal(arch.length, 9);
    assert.ok(Math.abs(arch[3] - 0.5) < 1e-9 && Math.abs(arch[4] - 0.005) < 1e-11);
    assert.equal(mesh.indices.length, 3);
    const top = projectBrepHiddenLines([brep], { toward: [0, 0, 1], up: [0, 1, 0] }, { segmentsPerQuarter: 12 });
    const ink = top.edges.find(edge => edge.name === 'arch')?.pieces.filter(piece => piece.visible && piece.ink !== false);
    assert.ok(ink?.some(({ curve: drawing }) => drawing.kind === 'line'
      ? [drawing.a, drawing.b].some(p => Math.abs(p[1] - 0.005) < 1e-11)
      : drawing.kind === 'polyline' && drawing.points.some(p => Math.abs(p[1] - 0.005) < 1e-11)));
    assert.equal(JSON.stringify(brep), original);
  }
});

test('bounded non-GP weights preserve the native cap through strict checks, mesh and projection', () => {
  for (const [weights, domain] of [
    [[2e-6, 1, 1e6], [0, 1]], [[1e6, 1, 2e-6], [0, 1]],
    [[4e-6, 1.5, 250000], [-2, 5]],
  ]) {
    const { brep, curve } = cap(weights, 0.01, domain);
    const original = JSON.stringify(brep);
    validateCurve(curve);
    const strict = checkBrep(brep, { strict: true });
    assert.ok(strict.valid, strict.issues.join('\n'));
    assert.equal(planarScaleSliver(brep), undefined);
    const t = Math.sqrt(weights[0]) / (Math.sqrt(weights[0]) + Math.sqrt(weights[2]));
    const denominator = weights[0] * (1 - t) ** 2 + 2 * weights[1] * t * (1 - t) + weights[2] * t ** 2;
    const peak = 0.02 * weights[1] * t * (1 - t) / denominator;
    const native = evaluateCurve(curve, domain[0] + (domain[1] - domain[0]) * t);
    assert.ok(Math.abs(native[0] - 0.5) < 1e-9 && Math.abs(native[1] - peak) < 1e-11);
    const mesh = tessellateBrep(brep, { segmentsPerQuarter: 12 });
    const arch = mesh.edges.find(edge => edge.edgeId === 'arch').points;
    assert.equal(arch.length, 9);
    assert.ok(Math.abs(arch[3] - 0.5) < 1e-9 && Math.abs(arch[4] - peak) < 1e-11);
    assert.equal(mesh.indices.length, 3);
    const top = projectBrepHiddenLines([brep], { toward: [0, 0, 1], up: [0, 1, 0] }, { segmentsPerQuarter: 12 });
    const ink = top.edges.find(edge => edge.name === 'arch').pieces.filter(piece => piece.visible && piece.ink !== false);
    assert.ok(ink.some(({ curve: drawing }) => (drawing.kind === 'line' ? [drawing.a, drawing.b] : drawing.points)
      ?.some(point => Math.abs(point[0] - 0.5) < 1e-9 && Math.abs(point[1] - peak) < 1e-11)));
    assert.equal(JSON.stringify(brep), original);
  }
});

test('a genuine sliver stays invalid with either ordinary or compressed quadratic weights', () => {
  for (const weights of [[1, 1, 1], [1e-6, 1, 1e6], [2e-6, 1, 1e6]]) {
    const { brep } = cap(weights, 1e-8);
    const strict = checkBrep(brep, { strict: true });
    assert.equal(strict.valid, false);
    assert.ok(strict.issues.some(issue => issue.includes('is a sliver')));
    assert.match(planarScaleSliver(brep), /is a sliver/);
  }
});

test('quadratic balancing leaves other weight patterns and unresolved native stations alone', () => {
  assert.equal(balancedQuadraticStations(cap([2, 2, 2]).curve, 9), undefined);
  assert.equal(balancedQuadraticStations(cap([1e-6, 0.3, 1e6]).curve, 9), undefined);
  assert.equal(balancedQuadraticStations(cap([1e-6, 2.5, 1e6]).curve, 9), undefined);
  assert.equal(balancedQuadraticStations(cap([1, 2, 3]).curve, 9), undefined);
  const { curve } = cap([1e-6, 1, 1e6]);
  const narrowDomain = [2 ** 40, 2 ** 40 + 1];
  const knots = [...Array(3).fill(narrowDomain[0]), ...Array(3).fill(narrowDomain[1])];
  assert.equal(balancedQuadraticStations({ ...curve, knots }, 9), undefined);
});


const represented = [
  ['elevated cubic', curve => elevateBezierCurveDegree(curve, {targetDegree:3}).elevated, 3, 4],
  ['C0 inserted quadratic', curve => insertCurveKnotCoefficientsTrusted(curve, 1/8, 2).candidate, 2, 5],
];

for (const [name, transform, degree, poles] of represented) {
  test(name + ' keeps the full native arch through checking, tessellation and hidden lines', () => {
    const {brep, curve} = cap([1e-6, 1, 1e6], 0.01, [0,1], transform);
    const input = JSON.stringify(brep);
    assert.equal(curve.degree, degree);
    assert.equal(curve.controlPoints.length, poles);
    assert.equal(curve.knots.length, 8);
    assert.equal(curve.knots[0], 0);
    assert.equal(curve.knots.at(-1), 1);
    validateCurve(curve);
    const stations = rationalEdgeStations(curve, 9);
    assert.ok(stations.length <= 17);
    assert.equal(stations[0], 0);
    assert.equal(stations.at(-1), 1);
    assert.ok(stations.slice(1).every((t, i) => t > stations[i]));
    if (degree === 2) assert.ok(stations.includes(1/8));

    const strict = checkBrep(brep, {strict:true});
    assert.ok(strict.valid, strict.issues.join('\n'));
    assert.equal(planarScaleSliver(brep), undefined);
    const nativePeak = evaluateCurve(curve, 1/(1 + 1e6));
    assert.ok(Math.hypot(nativePeak[0] - 0.5, nativePeak[1] - 0.005, nativePeak[2]) < 1e-12);
    const atPeak = point => Math.hypot(point[0] - 0.5, point[1] - 0.005) < 4e-6;
    const mesh = tessellateBrep(brep, {segmentsPerQuarter:12});
    const arch = mesh.edges.find(edge => edge.edgeId === 'arch').points;
    assert.ok(stations.some((t,i) => atPeak(arch.slice(3*i, 3*i+3))));
    const top = projectBrepHiddenLines([brep], {toward:[0,0,1], up:[0,1,0]}, {segmentsPerQuarter:12});
    const ink = top.edges.find(edge => edge.name === 'arch').pieces.filter(piece => piece.visible && piece.ink !== false);
    assert.ok(ink.some(({curve}) => (curve.kind === 'polyline' ? curve.points : [curve.a, curve.b]).some(atPeak)));
    assert.equal(JSON.stringify(brep), input);
  });

  test(name + ' retains a real sliver refusal and reversed native stations', () => {
    const {brep} = cap([1e-6, 1, 1e6], 1e-8, [0,1], transform);
    assert.match(planarScaleSliver(brep), /is a sliver/);
    assert.ok(checkBrep(brep, {strict:true}).issues.some(issue => issue.includes('is a sliver')));
    const reflected = transform(cap([1e6, 1, 1e-6]).curve);
    const stations = rationalEdgeStations(reflected, 9);
    assert.ok(stations.slice(1).every((t,i) => stations[i] < t));
    assert.equal(stations[0], 0);
    assert.equal(stations.at(-1), 1);
    assert.ok(stations.map(t => evaluateCurve(reflected, t)).some(point => point[1] > 0.00495));
  });
}

test('the compressed edge sampler declines unsupported representations and unresolved stations', () => {
  assert.equal(rationalEdgeStations(represented[0][1](cap([1,1,1]).curve), 9), undefined);
  const cubic = represented[0][1](cap([1e-6,1,1e6]).curve);
  const poles = cubic.controlPoints.map(point => [...point]);
  poles[1][0] = -0.1;
  assert.equal(rationalEdgeStations({...cubic, controlPoints:poles}, 9), undefined);
  assert.equal(rationalEdgeStations({...cubic, knots:cubic.knots.map(k => k + 2**40)}, 9), undefined);
});
