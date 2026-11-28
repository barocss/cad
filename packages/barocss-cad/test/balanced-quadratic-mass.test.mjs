import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, buildBrep, checkBrep, exportStep, importStep, lineCurve, transformBrep } from '../dist/index.js';
import { balancedQuadraticRule } from '../dist/brep/balanced-quadratic-stations.js';
import { brepQuadratureIntegrals } from '../dist/brep/brep-mass-quadrature.js';

const unit = [0, 0, 1, 1], quadratic = [0, 0, 0, 1, 1, 1];
const points = { a: [0, 0, 0], b: [100, 0, 0], c: [0, 0, 15], d: [100, 0, 15] };
const arcPoles = [[50, 5, 0], [50, 5, 15]];
const plane = (id, controlPoints) => ({ kind: 'surface', id, degreeU: 1, degreeV: 1,
  knotsU: unit, knotsV: unit, controlPoints, weights: [[1, 1], [1, 1]] });

function archPrism(weights, transpose = false) {
  const { a, b, c, d } = points;
  const edge = (id, vertices, arch) => {
    const [p, q] = vertices.map(vertex => points[vertex]);
    const curve = arch ? { kind: 'curve', id: id + '-curve', degree: 2, knots: quadratic, weights,
      controlPoints: [p, p[2] === 0 ? arcPoles[0] : arcPoles[1], q] } : lineCurve(id + '-curve', p, q);
    return { id, name: id, curve, vertices };
  };
  const face = (id, surface, sense, loop) => ({
    id, name: id, surface, sense, loops: [{ kind: 'outer', uses: loop.map(([edge, sense]) => ({ edge, sense })) }],
  });
  const ruled = { kind: 'surface', id: 'arch-surface', degreeU: 2, degreeV: 1,
    knotsU: quadratic, knotsV: unit, controlPoints: [[a, c], arcPoles, [b, d]], weights: weights.map(w => [w, w]) };
  const side = transpose ? { ...ruled, degreeU: 1, degreeV: 2, knotsU: unit, knotsV: quadratic,
    controlPoints: [[a, arcPoles[0], b], [c, arcPoles[1], d]], weights: [weights, weights] } : ruled;
  return buildBrep({
    source: { family: 'weighted-arch-prism', id: 'arch' },
    vertices: Object.entries(points).map(([id, point]) => ({ id, point })),
    edges: [edge('arch-base', ['a', 'b'], true), edge('arch-top', ['c', 'd'], true),
      edge('chord-base', ['a', 'b']), edge('chord-top', ['c', 'd']), edge('rail-a', ['a', 'c']), edge('rail-b', ['b', 'd'])],
    bodies: [{ id: 'solid', kind: 'solid', shells: [{ id: 'closed', closed: true, faces: [
      face('base', plane('base-plane', [[a, [0, 5, 0]], [b, [100, 5, 0]]]), 'reverse', [['arch-base', 'forward'], ['chord-base', 'reverse']]),
      face('top', plane('top-plane', [[c, [0, 5, 15]], [d, [100, 5, 15]]]), 'forward', [['chord-top', 'forward'], ['arch-top', 'reverse']]),
      face('chord-side', plane('chord-plane', [[a, c], [b, d]]), 'forward',
        [['chord-base', 'forward'], ['rail-b', 'forward'], ['chord-top', 'reverse'], ['rail-a', 'reverse']]),
      face('arch-side', side, transpose ? 'forward' : 'reverse',
        [['arch-base', 'reverse'], ['rail-a', 'forward'], ['arch-top', 'forward'], ['rail-b', 'reverse']]),
    ] }] }],
  });
}

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 5e-9 * Math.max(1, Math.abs(expected)), `${actual} vs ${expected}`);
// Integrate 0 <= y <= 10(x/100)(1-x/100) and 0 <= z <= 15, with Cartesian moments.
const expected = [2500, 125000, 2500, 18750, 7500000, 25000 / 7, 187500, 125000, 937500, 18750];
const area = 2 * (100 * 5 / 3) + 15 * (100 + 50 * (Math.hypot(1, 0.1) + Math.asinh(0.1) / 0.1));
function check(brep) {
  const original = JSON.stringify(brep), report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  const quadrature = brepQuadratureIntegrals(brep, 24);
  assert.equal(quadrature.meshed, false);
  expected.forEach((value, i) => close(quadrature.integrals[i], value));
  close(quadrature.integrals[10], area);
  const mass = brepMassProperties(brep, 1);
  assert.equal(mass.method, 'quadrature');
  close(mass.volume, 2500);
  mass.centroid.forEach((value, i) => close(value, [50, 1, 7.5][i]));
  assert.equal(JSON.stringify(brep), original);
}

test('quadrature integrates the same closed arch in ordinary, compressed and transposed native charts', () => {
  check(archPrism([1, 1, 1]));
  check(archPrism([1e-6, 1, 1e6]));
  check(archPrism([1e6, 1, 1e-6], true));
  check(archPrism([2e-6, 1, 500000]));
});

test('the weighted arch retains exact boundary weights and analytic mass after STEP readback', () => {
  const source = archPrism([1e-6, 1, 1e6]);
  const step = exportStep(source, { validationProperties: false });
  const reopened = importStep(step);
  const edges = reopened.edges.filter(edge => edge.curve.degree === 2);
  assert.equal(edges.length, 2);
  for (const edge of edges) assert.deepEqual(edge.curve.weights, [1e-6, 1, 1e6]);
  check(reopened);
});

test('the balanced solid mass retains its translated centroid and density scale', () => {
  const source = archPrism([1e-6, 1, 1e6]);
  const moved = transformBrep(source, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [37, -22, 6] });
  const result = brepMassProperties(moved, 3);
  assert.equal(result.method, 'quadrature');
  close(result.volume, 2500);
  close(result.mass, 7.5);
  result.centroid.forEach((value, i) => close(value, [87, -21, 13.5][i]));
});

test('quadrature declines a compressed chart whose interior stations cannot be represented', () => {
  const curve = { degree: 2, weights: [1e-6, 1, 1e6],
    knots: [...Array(3).fill(2 ** 40), ...Array(3).fill(2 ** 40 + 1)] };
  assert.equal(balancedQuadraticRule(curve, { x: [0.25, 0.5, 0.75], w: [1 / 3, 1 / 3, 1 / 3] }), null);
});
