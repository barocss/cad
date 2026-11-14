import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, brepSurfaceArea, CadPartError, checkOutput, coedgeVertices, evaluateCadPart, evaluateCurve,
  evaluateSurface, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { brepBounds } from '../dist/brep/brep-bounds.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';

const tolerance = 1e-7;
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, k) => a.map(x => x * k);
const dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const magnitude = a => Math.hypot(...a);
const unit = a => scale(a, 1 / magnitude(a));
const distance = (a, b) => magnitude(sub(a, b));
const near = (actual, expected, limit = tolerance) => assert.ok(Math.abs(actual - expected) <= limit, `${actual} vs ${expected}, limit ${limit}`);
const pointNear = (actual, expected) => assert.ok(distance(actual, expected) <= tolerance, `${actual} vs ${expected}`);

const a = [13, -7, 4], b = [25, 9, 30], r = 2;
const axis = unit(sub(b, a));
const roll = unit(cross([0, 0, 1], axis));
const sketch = { id: 's', kind: 'sketch', profile: 'circle', center: [18, 21], radius: r,
  plane: { origin: [41, 31, 27], normal: unit(cross(axis, roll)), xAxis: axis }, sideTags: { outer: ['disk'] } };
const linear = (start = a, end = b) => ({ degree: 1, knots: [0, 0, 1, 1], controlPoints: [start, end], weights: [1, 1] });
const quadratic = (start = a, end = b, middle = scale(add(start, end), 0.5)) => ({
  degree: 2, knots: [4, 4, 4, 9, 9, 9], controlPoints: [start, middle, end], weights: [1, 1, 1],
});
const document = (path = linear(), section = sketch, mode = 'exact-straight') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [section, { id: 'w', kind: 'sweep-curve', sketch: 's', path, ...(mode === null ? {} : { mode }) }],
});

function checkCylinder(output, start, end) {
  const { brep } = output, report = checkOutput(output), length = distance(start, end), tangent = unit(sub(end, start));
  assert.equal(report.valid, true, report.issues.join('\n'));
  assert.equal(report.topology[0].genus, 0);
  assert.equal(brep.shells[0].closed, true);
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 });
  assert.ok(report.maximumEdgeSurfaceGap <= tolerance);

  const volume = Math.PI * r * r * length;
  for (const [mass, method] of [[massPropertiesOf(output), 'closed-form'], [brepMassProperties(brep, 1), 'quadrature']]) {
    assert.equal(mass.method, method);
    near(mass.volume, volume, 1e-9 * volume);
    pointNear(mass.centroid, scale(add(start, end), 0.5));
  }
  const area = 2 * Math.PI * r * (length + r);
  near(brepSurfaceArea(brep), area, 1e-9 * area);
  const bounds = brepBounds(brep), reach = tangent.map(t => r * Math.sqrt(1 - t * t));
  pointNear(bounds.min, start.map((x, i) => Math.min(x, end[i]) - reach[i]));
  pointNear(bounds.max, start.map((x, i) => Math.max(x, end[i]) + reach[i]));

  const caps = new Map([['w.start', { centre: start, normal: scale(tangent, -1) }], ['w.end', { centre: end, normal: tangent }]]);
  const sides = brep.faces.filter(f => !caps.has(f.name));
  assert.equal(sides.length, 2);
  const faces = new Map(brep.faces.map(f => [f.id, f]));
  const loops = new Map(brep.loops.map(l => [l.id, l]));
  const uses = new Map(brep.coedges.map(e => [e.id, e]));
  const edges = new Map(brep.edges.map(e => [e.id, e]));
  const edgeFaces = new Map(brep.edges.map(e => [e.id, []]));
  const samples = [0, 0.125, 0.375, 0.625, 0.875, 1];
  const radialAt = point => {
    const offset = sub(point, start);
    return sub(offset, scale(tangent, dot(offset, tangent)));
  };
  for (const face of brep.faces) {
    const cap = caps.get(face.name), { surface } = face;
    assert.equal(surface.kind, 'surface');
    assert.deepEqual([surface.degreeU, surface.degreeV], cap ? [1, 1] : [2, 1]);
    const { u, v } = surfaceDomain(surface);
    for (const p of samples) for (const q of samples) {
      const { point, du, dv } = evaluateSurfaceD1(surface, u[0] + p * (u[1] - u[0]), v[0] + q * (v[1] - v[0]));
      const normal = scale(unit(cross(du, dv)), face.sense === 'forward' ? 1 : -1);
      if (cap) {
        near(dot(sub(point, cap.centre), cap.normal), 0);
        pointNear(normal, cap.normal);
      } else {
        const axial = dot(sub(point, start), tangent);
        assert.ok(axial >= -tolerance && axial <= length + tolerance);
        const radial = radialAt(point);
        near(magnitude(radial), r);
        pointNear(normal, unit(radial));
      }
    }
  }
  for (const loop of brep.loops) {
    assert.equal(loop.kind, 'outer');
    const face = faces.get(loop.face);
    for (const [i, id] of loop.coedges.entries()) {
      const use = uses.get(id), twin = uses.get(use.twin), next = uses.get(use.next);
      assert.equal(use.loop, loop.id);
      assert.equal(use.next, loop.coedges[(i + 1) % loop.coedges.length]);
      assert.equal(next.prev, id);
      assert.equal(coedgeVertices(brep, use)[1], coedgeVertices(brep, next)[0]);
      assert.equal(twin.twin, id);
      assert.equal(twin.edge, use.edge);
      assert.notEqual(twin.sense, use.sense);
      assert.notEqual(loops.get(twin.loop).face, face.id);
      edgeFaces.get(use.edge).push(face);
      assert.ok(use.pcurve);
      for (const t of samples) {
        const [u, v] = evaluateCurve(use.pcurve, t);
        pointNear(evaluateCurve(edges.get(use.edge).curve, t), evaluateSurface(face.surface, u, v));
      }
    }
  }
  const seams = [], rims = [];
  for (const edge of brep.edges) {
    const adjacent = edgeFaces.get(edge.id);
    assert.equal(adjacent.length, 2);
    const cap = adjacent.map(face => caps.get(face.name)).find(Boolean);
    assert.equal(edge.curve.degree, cap ? 2 : 1);
    if (cap) {
      rims.push(edge);
      for (const t of samples) {
        const p = evaluateCurve(edge.curve, t);
        near(distance(p, cap.centre), r);
        near(dot(sub(p, cap.centre), cap.normal), 0);
      }
    } else seams.push(edge);
    const continuity = measureBrepEdgeContinuity(brep, edge.id);
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.minimumAngleDegrees, cap ? 90 : 0);
    near(continuity.maximumAngleDegrees, cap ? 90 : 0);
  }
  assert.deepEqual([seams.length, rims.length], [2, 4]);
  for (const sign of [-1, 1]) {
    const d = scale(roll, r * sign);
    const seam = seams.find(edge => distance(evaluateCurve(edge.curve, 0), add(start, d)) <= tolerance);
    assert.ok(seam, `seam at ${add(start, d)}`);
    for (const t of samples) pointNear(evaluateCurve(seam.curve, t), add(add(start, d), scale(sub(end, start), t)));
  }
}

test('both Studio straight path encodings build the same tilted native cylinder and round-trip', () => {
  const line = evaluateCadPart(document());
  checkCylinder(line.outputs[0], a, b);
  // Decimal formatting can move a midpoint after all three poles round independently.
  const midpoint = add(scale(add(a, b), 0.5), [3e-9, -2e-9, 1e-9]);
  const encoded = quadratic(a, b, midpoint);
  const bezier = evaluateCadPart(document(encoded));
  assert.deepEqual(bezier.outputs[0].brep, line.outputs[0].brep);
  assert.deepEqual(bezier.document.features[1].path, encoded);
  const saved = loadCadPart(saveCadPart(bezier));
  assert.deepEqual(saved.document, bezier.document);
  assert.deepEqual(saved.outputs[0].brep, line.outputs[0].brep);

  const reverse = { ...quadratic(b, a), weights: [2, 2, 2] };
  checkCylinder(evaluateCadPart(document(reverse)).outputs[0], b, a);
});

test('exact straight sweep bounds the full span and refuses paths or sections outside its scope', () => {
  const x = [0, 0, 0], y = [0, 16, 0];
  const admitted = quadratic(x, y, [1.9e-7, 8, 0]);
  const justOutside = quadratic(x, y, [2.1e-7, 8, 0]);
  const centre = evaluateCadPart(document(linear(x, y))).outputs[0].brep;
  assert.deepEqual(evaluateCadPart(document(admitted)).outputs[0].brep, centre);
  const refuse = (doc, code, message) => assert.throws(() => evaluateCadPart(doc), err =>
    err instanceof CadPartError && err.code === code && err.feature === 'w' && message.test(err.message));
  const unsupported = /one open straight segment/;
  const polyline = { degree: 1, knots: [0, 0, 0.5, 1, 1], controlPoints: [x, [0, 8, 0], y], weights: [1, 1, 1] };
  for (const path of [justOutside, quadratic(x, y, [0, 18, 0]), { ...quadratic(), weights: [1, 0.9, 1] },
    { ...linear(), weights: [1, 2] }, polyline]) refuse(document(path), 'CAPABILITY', unsupported);
  for (const path of [linear(x, x), linear(x, [0, 9e-5, 0]), quadratic(x, x, [0, 0, 0])])
    refuse(document(path), 'PARAMETER', /path at least 0\.0001 mm/);
  refuse(document(linear(x, [0, 10001, 0])), 'PARAMETER', /path coordinates/);
  refuse(document(linear(), { ...sketch, radius: 0.009 }), 'PARAMETER', /profile radius of at least 0\.01 mm/);
  refuse(document(linear(), { ...sketch, sideTags: { ...sketch.sideTags, holes: [['bore']] },
    holes: [[{ kind: 'arc', start: [19, 21], center: [18, 21], direction: 'ccw' }]] }),
    'CAPABILITY', /one circular profile without holes/);
  const legacy = evaluateCadPart(document(linear(), sketch, null)).outputs[0];
  assert.equal(legacy.brep.source.family, 'mesh');
  refuse(document(linear(), sketch, 'exact'), 'CAPABILITY', /one open circular arc/);
});
