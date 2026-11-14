import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  brepFromPrismatic, brepFromTriangles, brepMassProperties, checkBrep, evaluateCurveD1,
  evaluateSurfaceD1, finishBrepEdges, lineCurve, measureBrepEdgeContinuity, prismaticFromProfile,
} from '../dist/index.js';

const capsule = [
  { kind: 'line', start: [0, -4] },
  { kind: 'arc', start: [20, -4], center: [20, 0], direction: 'ccw' },
  { kind: 'line', start: [20, 4] },
  { kind: 'arc', start: [0, 4], center: [0, 0], direction: 'ccw' },
];
const skewBox = [[0, 0], [6, 0], [9, 4], [3, 4]].map(start => ({ kind: 'line', start }));

function prism(outer, height = 6) {
  const brep = brepFromPrismatic(prismaticFromProfile({ outer, height, tag: 'stock' }), { id: 'stock' });
  assert.deepEqual(checkBrep(brep).issues, []);
  return brep;
}

function edgeNamed(brep, name) {
  const edge = brep.edges.find(edge => edge.name === name);
  assert.ok(edge, name);
  return edge;
}

function assertMeasured(brep, edgeName, expectedDegrees) {
  const edge = edgeNamed(brep, edgeName);
  const result = measureBrepEdgeContinuity(brep, edge.id);
  assert.equal(result.status, 'measured', JSON.stringify(result));
  assert.equal(result.edgeId, edge.id);
  assert.equal(result.edgeName, edge.name);
  assert.notEqual(result.faces[0].id, result.faces[1].id);
  assert.deepEqual(result.faces.map(face => face.name).sort(), edgeName.split('|'));
  assert.equal(result.sampleCount, 8);
  assert.equal(result.sampleCount, result.samples.length);
  for (const [i, sample] of result.samples.entries()) {
    assert.equal(sample.parameter, (i + 0.5) / 8);
    assert.ok(Math.abs(sample.angleDegrees - expectedDegrees) <= 1e-10, JSON.stringify(sample));
  }
  const angles = result.samples.map(sample => sample.angleDegrees);
  assert.equal(result.minimumAngleDegrees, Math.min(...angles));
  assert.equal(result.maximumAngleDegrees, Math.max(...angles));
}

function curvatureAt(brep, edgeName) {
  const edge = edgeNamed(brep, edgeName);
  const { curvature, ...angle } = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
  assert.equal(angle.status, 'measured', JSON.stringify(angle));
  assert.deepEqual(angle, measureBrepEdgeContinuity(brep, edge.id));
  assert.deepEqual(angle, measureBrepEdgeContinuity(brep, edge.id, { curvature: false }));
  assert.ok(curvature);
  return { angle, curvature };
}

function assertCurvature(brep, edgeName, expectedByFace) {
  const { angle, curvature } = curvatureAt(brep, edgeName);
  assert.equal(curvature.status, 'measured', JSON.stringify(curvature));
  assert.equal(curvature.unit, '1/mm');
  assert.deepEqual(curvature.samples.map(sample => sample.parameter), angle.samples.map(sample => sample.parameter));
  const [first, second] = angle.faces.map(face => expectedByFace[face.name]);
  for (const sample of curvature.samples) {
    assert.ok(Math.abs(sample.first - first) <= 1e-10, JSON.stringify(sample));
    assert.ok(Math.abs(sample.second - second) <= 1e-10, JSON.stringify(sample));
    assert.ok(Math.abs(sample.difference - Math.abs(first - second)) <= 1e-10, JSON.stringify(sample));
  }
  assert.equal(curvature.maximumDifference, Math.max(...curvature.samples.map(sample => sample.difference)));
}

test('samples a sharp planar joint using oriented normals, including an obtuse angle', () => {
  const brep = prism(skewBox);
  // The profile goes east at one wall and follows the 3–4–5 slope at the next.
  // On the opposite side that slope is reversed. The outward unit normals have dots +3/5 and -3/5.
  assertMeasured(brep, 'stock.side0|stock.side1', Math.acos(3 / 5) * 180 / Math.PI);
  assertMeasured(brep, 'stock.side0|stock.side3', Math.acos(-3 / 5) * 180 / Math.PI);
});

test('samples a tangent plane–cylinder joint and a perpendicular cylinder rim', () => {
  const brep = prism(capsule);
  // At (20,-4,z) the radial normal of the cylinder centered at (20,0) and the wall normal both point along -Y.
  assertMeasured(brep, 'stock.side0|stock.side1', 0);
  // At the cylinder rim its radial normals are horizontal and the top cap normal points along +Z.
  assertMeasured(brep, 'stock.side1|stock.top', 90);
});

test('reports curvature unavailable on sharp planar and cylindrical joins while preserving the angle report', () => {
  for (const [brep, name] of [
    [prism(skewBox), 'stock.side0|stock.side1'],
    [prism(capsule), 'stock.side1|stock.top'],
  ]) {
    assert.deepEqual(curvatureAt(brep, name).curvature, { status: 'unavailable', reason: 'non-tangent' });
  }
});

test('measures signed transverse curvature in oblique charts and follows face order and sense', () => {
  const brep = prism(capsule);
  const name = 'stock.side0|stock.side1';
  const edge = edgeNamed(brep, name);
  const firstFace = brep.faces.find(face => face.name === 'stock.side0');
  const secondFace = brep.faces.find(face => face.name === 'stock.side1');
  const uses = brep.coedges.filter(use => use.edge === edge.id);
  // Replace the two local supports with Y = -4 + c(X - 20)², keeping the selected edge and its native tangent.
  // S(u,v) = (20 + u - v, -4 + c(u - v)², 6(u + v)). On u=v, the normal points along -Y.
  // The physical transverse curvature is -2c. Both chart derivatives contribute along X.
  for (const [face, c] of [[firstFace, 2], [secondFace, -3]]) {
    const indices = [0, 1, 2];
    Object.assign(face.surface, {
      degreeU: 2, degreeV: 2, knotsU: [0, 0, 0, 1, 1, 1], knotsV: [0, 0, 0, 1, 1, 1],
      weights: indices.map(() => [1, 1, 1]),
      controlPoints: indices.map(i => indices.map(j => [
        20 + (i - j) / 2,
        -4 + c * (Number(i === 2) - i * j / 2 + Number(j === 2)),
        3 * (i + j),
      ])),
    });
  }
  for (const use of uses) use.pcurve = lineCurve(use.pcurve.id, [0, 0, 0], [0.5, 0.5, 0]);
  assertCurvature(brep, name, { 'stock.side0': -4, 'stock.side1': 6 });

  brep.coedges.reverse();
  const { angle } = curvatureAt(brep, name);
  assert.deepEqual(angle.faces.map(face => face.name), ['stock.side1', 'stock.side0']);
  assertCurvature(brep, name, { 'stock.side0': -4, 'stock.side1': 6 });

  firstFace.sense = secondFace.sense = 'reversed';
  assertCurvature(brep, name, { 'stock.side0': 4, 'stock.side1': -6 });
});

test('keeps the tangent angle samples when a C1 interior knot prevents native D2 evaluation', () => {
  const brep = prism(capsule);
  const name = 'stock.side0|stock.side1';
  const face = brep.faces.find(face => face.name === 'stock.side0');
  const firstSample = 1 / 16;
  // Degree two with a simple knot gives C1 admission. The Greville poles preserve the original planar chart.
  const { surface } = face;
  surface.degreeV = 2;
  surface.knotsV = [0, 0, 0, firstSample, 1, 1, 1];
  surface.controlPoints = surface.controlPoints.map(([start, end]) => [0, firstSample / 2, (1 + firstSample) / 2, 1]
    .map(t => start.map((coordinate, axis) => coordinate + t * (end[axis] - coordinate))));
  surface.weights = surface.controlPoints.map(() => [1, 1, 1, 1]);
  assertMeasured(brep, name, 0);
  assert.deepEqual(curvatureAt(brep, name).curvature, { status: 'unavailable', reason: 'derivative-unavailable' });
});

test('declines mesh-derived planar faces and a same-face seam from a valid cylinder', () => {
  const mesh = brepFromTriangles([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1], [
    0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3,
  ]);
  const meshEdge = mesh.edges[0].id;
  assert.deepEqual(measureBrepEdgeContinuity(mesh, meshEdge), { status: 'unsupported', edgeId: meshEdge, reason: 'faceted-geometry' });

  const cylinder = JSON.parse(readFileSync(new URL('./fixtures/legacy-inputs/brep-cylinder.json', import.meta.url), 'utf8'));
  assert.deepEqual(checkBrep(cylinder).issues, []);
  const loopFaces = new Map(cylinder.loops.map(loop => [loop.id, loop.face]));
  const seam = cylinder.edges.find(edge => {
    const uses = cylinder.coedges.filter(use => use.edge === edge.id);
    return uses.length === 2 && loopFaces.get(uses[0].loop) === loopFaces.get(uses[1].loop);
  });
  assert.ok(seam);
  assert.deepEqual(measureBrepEdgeContinuity(cylinder, seam.id), { status: 'unsupported', edgeId: seam.id, reason: 'same-face-seam' });
});

test('bounds inspection to a native shared edge with valid pcurve binding and available derivatives', () => {
  const original = prism(skewBox, 0.01);
  const edge = edgeNamed(original, 'stock.side0|stock.side1');
  const refused = (reason, change) => {
    const brep = structuredClone(original);
    const use = brep.coedges.find(use => use.edge === edge.id);
    const nativeEdge = brep.edges.find(candidate => candidate.id === edge.id);
    change(use, nativeEdge, brep);
    assert.deepEqual(measureBrepEdgeContinuity(brep, edge.id), { status: 'unsupported', edgeId: edge.id, reason });
  };
  assert.equal(measureBrepEdgeContinuity(original, 'stock.side0|stock.side1').reason, 'edge-not-found');
  refused('invalid-incidence', use => { use.twin = null; });
  refused('missing-pcurve', use => { use.pcurve = null; });
  refused('binding-mismatch', use => { use.pcurve.knots = [2, 2, 3, 3]; });
  refused('binding-mismatch', use => { use.pcurve.controlPoints.reverse(); });
  refused('binding-mismatch', use => {
    // Stay within positional tolerance along the edge but change the canonical parameter speed.
    use.pcurve.controlPoints[1][1] -= 1e-6;
  });
  refused('derivative-unavailable', (_use, nativeEdge, brep) => {
    // The geometric edge is still exactly the same line and has the same parameterization.
    // The native D1 evaluator refuses an exact C0 knot in its representation.
    const firstSample = 1 / 16;
    const curve = nativeEdge.curve;
    const [start, end] = curve.controlPoints;
    curve.controlPoints.splice(1, 0, start.map((coordinate, i) => coordinate + (end[i] - coordinate) * firstSample));
    curve.knots = [0, 0, firstSample, 1, 1];
    curve.weights = [1, 1, 1];
    assert.deepEqual(checkBrep(brep).issues, []);
  });
});

function boxFillet() {
  const outer = [[0, 0], [30, 0], [30, 20], [0, 20]].map(start => ({ kind: 'line', start }));
  const stock = prism(outer, 12);
  return finishBrepEdges(stock, ['stock.side0|stock.top'], 2, 'fillet', 'round');
}

test('recovers both straight tangent bindings of a constant-radius box edge fillet', () => {
  const brep = boxFillet();
  const before = structuredClone(brep);
  assert.deepEqual(checkBrep(brep, { strict: true }).issues, []);
  assert.deepEqual([brep.vertices.length, brep.edges.length, brep.faces.length], [10, 15, 7]);
  const volume = 30 * (20 * 12 - 2 ** 2 * (1 - Math.PI / 4));
  const beforeMass = brepMassProperties(brep, 1);
  assert.ok(Math.abs(beforeMass.volume - volume) <= 1e-9);

  const blend = brep.faces.find(face => face.name === 'round.face');
  for (const [adjacent, u, startX, endX, y, z, normal] of [
    ['stock.side0', 1, 30, 0, 0, 10, [0, -1, 0]],
    ['stock.top', 0, 0, 30, 2, 12, [0, 0, 1]],
  ]) {
    const name = `round.face|${adjacent}`;
    const edge = edgeNamed(brep, name);
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.deepEqual(uses.map(use => use.pcurve), [null, null]);
    assertMeasured(brep, name, 0);
    // The plane has zero curvature. The outward-oriented, 2 mm cylinder has normal curvature -1/R.
    assertCurvature(brep, name, { 'round.face': -0.5, [adjacent]: 0 });
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8;
      const x = startX + (endX - startX) * t;
      const world = evaluateCurveD1(edge.curve, t);
      assert.ok(Math.hypot(world.point[0] - x, world.point[1] - y, world.point[2] - z) <= 1e-12);
      assert.ok(Math.hypot(world.derivative[0] - (endX - startX), world.derivative[1], world.derivative[2]) <= 1e-12);
      const { point, du, dv } = evaluateSurfaceD1(blend.surface, u, x / 30);
      assert.ok(Math.hypot(point[0] - x, point[1] - y, point[2] - z) <= 1e-12);
      const nativeNormal = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const length = Math.hypot(...nativeNormal);
      // The quadrant is centered at (y,z)=(2,10), so its radial and the authored plane normal coincide.
      assert.deepEqual([0, (y - 2) / 2, (z - 10) / 2], normal);
      assert.ok(Math.hypot(...nativeNormal.map((component, axis) => component / length - normal[axis])) <= 1e-12);
    }
  }
  assert.deepEqual(brep, before);
  assert.deepEqual(brepMassProperties(brep, 1), beforeMass);
});

test('refuses other missing bindings and never replaces an invalid stored fillet binding', () => {
  const brep = boxFillet();
  for (const name of ['round.face|stock.side1', 'round.face|stock.side3', 'stock.bottom|stock.side0']) {
    const edge = edgeNamed(brep, name);
    assert.deepEqual(measureBrepEdgeContinuity(brep, edge.id), { status: 'unsupported', edgeId: edge.id, reason: 'missing-pcurve' });
  }

  const original = edgeNamed(brep, 'round.face|stock.top');
  const refused = (reason, change) => {
    const copy = structuredClone(brep);
    const edge = copy.edges.find(edge => edge.id === original.id);
    const blend = copy.faces.find(face => face.name === 'round.face');
    change(copy, edge, blend.surface);
    assert.deepEqual(measureBrepEdgeContinuity(copy, edge.id), { status: 'unsupported', edgeId: edge.id, reason });
  };
  refused('missing-pcurve', (_copy, _edge, surface) => {
    // A translated noncircular profile retains both boundary generators.
    for (const pole of surface.controlPoints[1]) pole[1] += 1e-6;
  });
  refused('missing-pcurve', (_copy, _edge, surface) => {
    // Unequal axial weights retain a line but change the chart's speed along it.
    surface.weights[0][1] *= 1.01;
  });
  refused('missing-pcurve', (_copy, edge) => { edge.curve.weights[1] *= 1.01; });
  refused('missing-pcurve', (_copy, edge) => { edge.curve.controlPoints[0][2] += 1e-8; });
  refused('missing-pcurve', (copy, _edge, _surface) => {
    const plane = copy.faces.find(face => face.name === 'stock.top').surface;
    plane.controlPoints[1][1][0] += 1e-6;
  });
  refused('binding-mismatch', (copy, edge) => {
    copy.coedges.find(use => use.edge === edge.id).pcurve = lineCurve('invalid', [0, 0, 0], [0, 1, 0]);
  });
});
