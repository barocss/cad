import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry, loadCadPart, massPropertiesOf,
  measureBrepEdgeContinuity, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';
import { circleOf } from '../dist/brep/brep-tessellate.js';

const R = 20, baseRadius = 2, quarterWeight = Math.cos(Math.PI / 4);
const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} at tolerance ${tolerance}`);
const pointNear = (a, b, tolerance) => near(Math.hypot(...a.map((x, i) => x - b[i])), 0, tolerance);
const doc = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });

function features({ angle = 0, radius = baseRadius, minX = 0, swapped = false } = {}) {
  const c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180);
  const knots = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4];
  const quarterPoles = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
  const controlPoints = quarterPoles.map(([x, y]) => [R * (x * c - y * s), R * (x * s + y * c), 0]);
  const path = { degree: 2, knots, controlPoints, weights: controlPoints.map((_, i) => i % 2 ? quarterWeight : 1) };
  return [
    { kind: 'sketch', id: 'disk', profile: 'circle', center: [0, 0], radius },
    { kind: 'sweep-curve', id: 'ring', sketch: 'disk', path, mode: 'exact' },
    { kind: 'sketch', id: 'boxSketch', profile: 'rectangle', min: [minX, -30], max: [30, 30] },
    { kind: 'extrude', id: 'box', sketch: 'boxSketch', from: -5, height: 10 },
    { kind: 'intersect', id: 'cut', target: swapped ? 'box' : 'ring', tool: swapped ? 'ring' : 'box' },
  ];
}

function verifyTrim(output, ring, radius, wallCount) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'analytic-boolean', id: 'cut' });
  assert.ok(report.valid, report.issues.join('\n'));
  const faceCount = wallCount + 2, edgeCount = 2 * faceCount - 2;
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: faceCount, loops: faceCount,
    edges: edgeCount, coedges: 2 * edgeCount, vertices: faceCount });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumPcurveGap < 1e-10);
  assert.ok(report.maximumVertexGap < 1e-10);
  const volume = Math.PI ** 2 * R * radius ** 2;
  near(massPropertiesOf(output).volume, volume, 2e-7);
  near(brepMassProperties(brep, 1).volume, volume, 2e-7);

  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane');
  assert.equal(caps.length, 2);
  const circles = [];
  for (const face of caps) {
    const plane = faceGeometry(face);
    pointNear(plane.n, [-1, 0, 0]);
    near(plane.o[0], 0, 1e-10);
    assert.equal(face.loops.length, 1);
    const loop = brep.loops.find(candidate => candidate.id === face.loops[0]);
    assert.equal(loop.kind, 'outer');
    assert.equal(loop.coedges.length, 2);
    let sideSign = 0, sweep = 0;
    for (const id of loop.coedges) {
      const use = brep.coedges.find(candidate => candidate.id === id);
      const { curve } = brep.edges.find(edge => edge.id === use.edge);
      const circle = circleOf(curve);
      assert.ok(circle, 'cap needs two rational half circles');
      assert.equal(curve.degree, 2);
      assert.equal(curve.controlPoints.length, 5);
      near(circle.r, radius, 1e-10);
      near(Math.abs(circle.c[1]), R, 1e-10);
      near(circle.c[0], 0, 1e-10);
      near(circle.c[2], 0, 1e-10);
      const sign = Math.sign(circle.c[1]);
      if (sideSign) assert.equal(sign, sideSign);
      sideSign = sign;
      sweep += circle.spans.reduce((sum, span) => sum + span.phi, 0);
    }
    near(sweep, 2 * Math.PI, 1e-10);
    circles.push(sideSign);
  }
  assert.deepEqual(circles.sort(), [-1, 1]);
  assert.ok(2 * (R - radius) > 0);

  const original = new Map(ring.faces.map(face => [face.surface.id, face.surface]));
  for (const face of brep.faces.filter(candidate => !caps.includes(candidate))) {
    assert.deepEqual(face.surface, original.get(face.surface.id));
    const { u, v } = surfaceDomain(face.surface);
    for (const a of [.125, .33, .74]) for (const b of [.13, .58, .9]) {
      const [x, y, z] = evaluateSurface(face.surface, u[0] + (u[1] - u[0]) * a, v[0] + (v[1] - v[0]) * b);
      near(Math.hypot(Math.hypot(x, y) - R, z), radius, 1e-10);
    }
  }

  const capIds = new Set(caps.map(cap => cap.id));
  let rims = 0;
  for (const edge of brep.edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    const domain = curveDomain(edge.curve);
    assert.equal(uses.length, 2);
    for (const use of uses) {
      assert.ok(use.pcurve, `missing canonical binding for ${edge.name}`);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
      for (const fraction of [0, .17, .5, .77, 1]) {
        const t = domain[0] + (domain[1] - domain[0]) * fraction, point = evaluateCurve(edge.curve, t);
        const [u, v] = evaluateCurve(use.pcurve, t);
        assert.ok(point[0] >= -1e-10);
        pointNear(evaluateSurface(surface, u, v), point, 1e-10);
      }
    }
    const measured = measureBrepEdgeContinuity(brep, edge.id);
    assert.equal(measured.status, 'measured', JSON.stringify(measured));
    const capRim = measured.faces.some(face => capIds.has(face.id));
    if (capRim) rims++;
    near(measured.maximumAngleDegrees, capRim ? 90 : 0, 1e-8);
  }
  assert.equal(rims, 4);
  return brep;
}

test('a centered box Intersect retains the exact half ring with canonical seam and rim charts', () => {
  for (const [angle, wallCount] of [[0, 4], [90, 2], [29, 4]]) {
    const authored = features({ angle });
    const ring = evaluateCadPart(doc(authored.slice(0, 2))).outputs[0].brep;
    const snapshot = evaluateCadPart(doc(authored)), [output] = snapshot.outputs;
    const cut = verifyTrim(output, ring, baseRadius, wallCount);
    const reopened = loadCadPart(saveCadPart(snapshot));
    assert.deepEqual(reopened.document, snapshot.document);
    assert.deepEqual(reopened.outputs[0].brep, cut);
  }
});

test('an upstream radius edit and swapped box operands preserve the measured half ring', () => {
  const radius = 3, authored = features({ angle: 29, radius, swapped: true });
  const ring = evaluateCadPart(doc(authored.slice(0, 2))).outputs[0].brep;
  const [output] = evaluateCadPart(doc(authored)).outputs;
  verifyTrim(output, ring, radius, 4);
});

test('quarter-knot measurement needs the qualified half-ring geometry and matching one-sided derivatives', () => {
  const [{ brep }] = evaluateCadPart(doc(features())).outputs;
  const use = brep.coedges.find(candidate => candidate.pcurve?.degree === 1
    && candidate.pcurve.controlPoints.every(point => point[0] === .5));
  assert.ok(use);
  const face = brep.faces.find(candidate => candidate.loops.includes(use.loop));
  assert.throws(() => evaluateSurfaceD1(face.surface, .5, .25), /exact C0 interior knot/);
  assert.equal(measureBrepEdgeContinuity(brep, use.edge).status, 'measured');
  const unqualified = { ...brep, source: { family: 'manual', id: 'cut' } };
  assert.equal(measureBrepEdgeContinuity(unqualified, use.edge).reason, 'derivative-unavailable');

  // Keep the shared row and pcurve, but change the tangent approaching the knot on one side.
  const controlPoints = face.surface.controlPoints.map((row, i) => i === 1 ? row.map(([x, y, z]) => [x, y, z + .01]) : row);
  const faces = brep.faces.map(candidate => candidate === face
    ? { ...face, surface: { ...face.surface, controlPoints } } : candidate);
  assert.equal(measureBrepEdgeContinuity({ ...brep, faces }, use.edge).reason, 'derivative-unavailable');
});

test('a box tangent to the inner orbit does not acquire a transverse chart certificate', () => {
  const [{ brep }] = evaluateCadPart(doc(features({ minX: 17, radius: 3 }))).outputs;
  assert.ok(checkBrep(brep, { strict: true }).valid);
  assert.ok(brep.coedges.every(use => !use.pcurve));
});
