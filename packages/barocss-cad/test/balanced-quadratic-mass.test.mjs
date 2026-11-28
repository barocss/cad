import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, brepSurfaceArea, buildBrep, checkBrep, elevateBezierCurveDegree, exportStep, importStep, lineCurve, projectBrepHiddenLines, transformBrep } from '../dist/index.js';
import { balancedQuadraticRule } from '../dist/brep/balanced-quadratic-stations.js';
import { compressedChordRules } from '../dist/brep/compressed-edge-stations.js';
import { insertCurveKnotCoefficientsTrusted } from '../dist/nurbs/curves/curve-knot-insertion.js';
import { brepQuadratureIntegrals } from '../dist/brep/brep-mass-quadrature.js';

const unit = [0, 0, 1, 1], quadratic = [0, 0, 0, 1, 1, 1];
const points = { a: [0, 0, 0], b: [100, 0, 0], c: [0, 0, 15], d: [100, 0, 15] };
const arcPoles = [[50, 5, 0], [50, 5, 15]];
const plane = (id, controlPoints) => ({ kind: 'surface', id, degreeU: 1, degreeV: 1,
  knotsU: unit, knotsV: unit, controlPoints, weights: [[1, 1], [1, 1]] });

function archPrism(weights, transpose = false, represent = curve => curve) {
  const { a, b, c, d } = points;
  const source = represent({kind: 'curve', id: 'arch-base-curve', degree: 2, knots: quadratic, weights,
    controlPoints: [a, arcPoles[0], b]});
  const polesAt = z => source.controlPoints.map(([x, y]) => [x, y, z]);
  const edge = (id, vertices, arch) => {
    const [p, q] = vertices.map(vertex => points[vertex]);
    const curve = arch ? { ...source, id: id + '-curve', controlPoints: polesAt(p[2]) } : lineCurve(id + '-curve', p, q);
    return { id, name: id, curve, vertices };
  };
  const face = (id, surface, sense, loop) => ({
    id, name: id, surface, sense, loops: [{ kind: 'outer', uses: loop.map(([edge, sense]) => ({ edge, sense })) }],
  });
  const ruled = { kind: 'surface', id: 'arch-surface', degreeU: source.degree, degreeV: 1,
    knotsU: source.knots, knotsV: unit, controlPoints: source.controlPoints.map(([x,y]) => [[x,y,0],[x,y,15]]),
    weights: source.weights.map(w => [w,w]) };
  const side = transpose ? { ...ruled, degreeU: 1, degreeV: source.degree, knotsU: unit, knotsV: source.knots,
    controlPoints: [polesAt(0), polesAt(15)], weights: [source.weights, source.weights] } : ruled;
  return buildBrep({
    source: { family: 'weighted-arch-prism', id: 'arch' },
    vertices: Object.entries(points).map(([id, point]) => ({ id, point })),
    edges: [edge('arch-base', ['a', 'b'], true), edge('arch-top', ['c', 'd'], true),
      edge('chord-base', ['a', 'b']), edge('chord-top', ['c', 'd']), edge('rail-a', ['a', 'c']), edge('rail-b', ['b', 'd'])],
    bodies: [{ id: 'solid', kind: 'solid', shells: [{ id: 'closed', closed: true, faces: [
      face('base', plane('base-plane', [[a, [0, 5, 0]], [b, [100, 5, 0]]]), 'reversed', [['arch-base', 'forward'], ['chord-base', 'reversed']]),
      face('top', plane('top-plane', [[c, [0, 5, 15]], [d, [100, 5, 15]]]), 'forward', [['chord-top', 'forward'], ['arch-top', 'reversed']]),
      face('chord-side', plane('chord-plane', [[a, c], [b, d]]), 'forward',
        [['chord-base', 'forward'], ['rail-b', 'forward'], ['chord-top', 'reversed'], ['rail-a', 'reversed']]),
      face('arch-side', side, transpose ? 'forward' : 'reversed',
        [['arch-base', 'reversed'], ['rail-a', 'forward'], ['arch-top', 'forward'], ['rail-b', 'reversed']]),
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

test('the non-GP arch has the same correct mass with reversed weights, a transposed patch and STEP readback', () => {
  const weights = [2e-6, 1, 1e6];
  const source = archPrism(weights), original = JSON.stringify(source);
  const reopened = importStep(exportStep(source, { validationProperties: false }));
  const edges = reopened.edges.filter(edge => edge.curve.degree === 2);
  assert.equal(edges.length, 2);
  for (const edge of edges) assert.deepEqual(edge.curve.weights, weights);
  for (const brep of [source, archPrism([...weights].reverse(), true), reopened]) {
    const strict = checkBrep(brep, { strict: true });
    assert.ok(strict.valid, strict.issues.join('\n'));
    const mass = brepMassProperties(brep, 1);
    assert.equal(mass.method, 'quadrature');
    // Independent Simpson integration of y dx, y² dx / 2 and the profile's arc length.
    close(mass.volume, 2140.486225480854);
    mass.centroid.forEach((value, i) => close(value, [50, 0.8397946462803674, 7.5][i]));
    close(brepSurfaceArea(brep), 3287.244106546534);
  }
  assert.equal(JSON.stringify(source), original);
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

test('the complete elevated and inserted arch keeps all analytic moments on both surface axes', () => {
  for (const represent of [
    curve => elevateBezierCurveDegree(curve, {targetDegree:3}).elevated,
    curve => insertCurveKnotCoefficientsTrusted(curve, 1/8, 2).candidate,
  ]) {
    const source = archPrism([1e-6, 1, 1e6], false, represent);
    const transposed = archPrism([1e6, 1, 1e-6], true, represent);
    const reopened = importStep(exportStep(source, {validationProperties:false}));
    const coefficients = brep => brep.edges.filter(edge => edge.curve.degree > 1)
      .map(({curve}) => ({degree:curve.degree, knots:curve.knots, weights:curve.weights, points:curve.controlPoints}));
    assert.deepEqual(coefficients(reopened), coefficients(source));
    for (const brep of [source, transposed, reopened]) check(brep);
  }
});

test('an unrepresentable cubic quadrature station declines the whole change of coordinates', () => {
  const curve = archPrism([1e-6,1,1e6], false, source => elevateBezierCurveDegree(source, {targetDegree:3}).elevated).edges[0].curve;
  const rule = {x:[0.25,0.5,0.75], w:[1/3,1/3,1/3]};
  assert.ok(compressedChordRules(curve, rule));
  assert.equal(compressedChordRules({...curve, knots:curve.knots.map(k => k + 2**40)}, rule), null);
});

test('the elevated arch retains its sharp exposed rails in default and tangent views', () => {
  const source = archPrism([1e-6, 1, 1e6], false, curve => elevateBezierCurveDegree(curve, { targetDegree: 3 }).elevated);
  const original = JSON.stringify(source);
  check(source);
  // Every positive-weight source pole has Y >= 0. The front and iso rays leave this half-space.
  assert.ok(source.faces.every(face => face.surface.controlPoints.every(row => row.every(p => p[1] >= 0))));
  const views = [
    [{ toward: [0, -1, 0], up: [0, 0, 1] }, ['rail-a', 'rail-b']],
    [{ toward: [1, -1, 1], up: [0, 0, 1] }, ['rail-a', 'rail-b']],
    [{ toward: [1, 0, 0], up: [0, 0, 1] }, ['rail-b']],
    [{ toward: [0, 0, 1], up: [0, 1, 0] }, []],
  ];
  for (const tangentEdges of [false, true]) for (const [view, expected] of views) {
    const { edges } = projectBrepHiddenLines([source], view, { tangentEdges, segmentsPerQuarter: 12 });
    const rails = edges.filter(edge => /^rail-[ab]$/.test(edge.name));
    const visible = rails.filter(edge => edge.pieces.some(piece => piece.visible && piece.ink !== false));
    assert.deepEqual(visible.map(edge => edge.name).sort(), expected);
    assert.ok(rails.every(edge => edge.kind === 'line' && !edge.tangent));
    for (const edge of visible) {
      const x = edge.name === 'rail-a' ? 0 : 100;
      assert.deepEqual(edge.ends, [[x, 0, 0], [x, 0, 15]]);
      assert.equal(edge.pieces.length, 1);
      assert.equal(edge.pieces[0].curve.kind, 'line');
    }
  }
  assert.equal(JSON.stringify(source), original);
});
