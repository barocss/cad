import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, brepSurfaceArea, CadPartError, checkOutput, coedgeVertices, curveDomain, evaluateCadPart, evaluateCurve,
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
    holes: [[{ kind: 'arc', start: [21, 21], center: [20, 21], direction: 'ccw' }]] }),
    'GEOMETRY', /hole must lie strictly inside/);
  const legacy = evaluateCadPart(document(linear(), sketch, null)).outputs[0];
  assert.equal(legacy.brep.source.family, 'mesh');
  refuse(document(linear(), sketch, 'exact'), 'CAPABILITY', /one open circular arc/);
});

const mixedStart = [13, -7, 4], mixedEnd = [13, 5, 20];
const xAxis = [1, 0, 0], yAxis = [0, 0.8, -0.6], tangent = [0, 0.6, 0.8];
const outerArea = 100 + 12.5 * Math.PI;
const outerCentre = [(700 + 12.5 * Math.PI * (12 + 20 / (3 * Math.PI))) / outerArea, 8];
const holeCentre = [8, 7];
const circularHole = (r, [x, y] = holeCentre) => [{ kind: 'arc', start: [x + r, y], center: [x, y], direction: 'cw' }];
const outer = [
  { kind: 'line', start: [2, 3] },
  { kind: 'arc', start: [12, 3], center: [12, 8], direction: 'ccw' },
  { kind: 'line', start: [12, 13] },
  { kind: 'line', start: [2, 13] },
];
const section = (r = 1) => ({ id: 's', kind: 'sketch', profile: 'loop', segments: outer, holes: [circularHole(r)],
  sideTags: { outer: ['base', 'round', 'roof', 'back'], holes: [['bore']] } });
const mixedDocument = (profile = section(), path = linear(mixedStart, mixedEnd), mode = 'exact-straight') => document(path, profile, mode);
const local = point => {
  const q = sub(point, mixedStart);
  return [outerCentre[0] + dot(q, xAxis), outerCentre[1] + dot(q, yAxis), dot(q, tangent)];
};

function checkMixedSection(output, radius) {
  const { brep } = output, checked = checkOutput(output);
  assert.equal(checked.valid, true, checked.issues.join('\n'));
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.deepEqual(checked.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 });
  assert.equal(checked.topology[0].genus, 1);
  near(checked.maximumEdgeSurfaceGap, 0);

  const holeArea = Math.PI * radius ** 2, area = outerArea - holeArea;
  const centre = add(add(mixedStart, scale(tangent, 10)),
    add(scale(xAxis, holeArea * (outerCentre[0] - holeCentre[0]) / area),
      scale(yAxis, holeArea * (outerCentre[1] - holeCentre[1]) / area)));
  const analytic = massPropertiesOf(output), native = brepMassProperties(brep, 1);
  assert.equal(analytic.method, 'closed-form');
  assert.equal(native.method, 'quadrature');
  for (const mass of [analytic, native]) {
    near(mass.volume, 20 * area);
    pointNear(mass.centroid, centre);
  }
  near(brepSurfaceArea(brep), 2 * area + 20 * (30 + 5 * Math.PI + 2 * Math.PI * radius));
  const bounds = brepBounds(brep);
  pointNear(bounds.min, add(mixedStart, [2 - outerCentre[0], -4, -3]));
  pointNear(bounds.max, add(mixedEnd, [17 - outerCentre[0], 4, 3]));

  const sides = new Map([
    ['w.side[base]', [1, [0, -1, 0]]],
    ['w.side[roof]', [1, [0, 1, 0]]],
    ['w.side[back]', [1, [-1, 0, 0]]],
    ['w.side[round]', [2, [12, 8, 5]]],
    ['w.side[bore]#1', [2, [...holeCentre, radius]]],
    ['w.side[bore]#2', [2, [...holeCentre, radius]]],
  ]);
  assert.deepEqual(new Set(brep.faces.map(face => face.name)), new Set(['w.start', 'w.end', ...sides.keys()]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  for (const face of brep.faces) {
    const side = sides.get(face.name), bore = face.name.includes('[bore]'), end = face.name === 'w.end';
    assert.equal(face.surface.kind, 'surface');
    assert.deepEqual([face.surface.degreeU, face.surface.degreeV], [side?.[0] ?? 1, 1]);
    const faceLoops = face.loops.map(id => loops.get(id));
    assert.deepEqual(faceLoops.map(loop => loop.kind), side ? ['outer'] : ['outer', 'inner']);
    const { u, v } = surfaceDomain(face.surface);
    // The two rational spans meet at u=0.5. Check derivatives on both sides of that knot.
    for (const a of [0.125, 0.375, 0.625, 0.875]) for (const b of [0.125, 0.5, 0.875]) {
      const { point, du, dv } = evaluateSurfaceD1(face.surface, u[0] + a * (u[1] - u[0]), v[0] + b * (v[1] - v[0]));
      const n = scale(unit(cross(du, dv)), face.sense === 'forward' ? 1 : -1);
      const [x, y, z] = local(point);
      if (!side) {
        near(z, end ? 20 : 0);
        pointNear(n, scale(tangent, end ? 1 : -1));
      } else if (side[0] === 2) {
        const [cx, cy, r] = side[1];
        near(Math.hypot(x - cx, y - cy), r);
        if (!bore) assert.ok(x >= 12 - tolerance);
        pointNear(n, scale(add(scale(xAxis, x - cx), scale(yAxis, y - cy)), (bore ? -1 : 1) / r));
      } else {
        const [nx, ny] = side[1];
        pointNear(n, add(scale(xAxis, nx), scale(yAxis, ny)));
        if (nx) near(x, 2);
        else near(y, ny > 0 ? 13 : 3);
      }
    }
    if (!side) assert.deepEqual(faceLoops.map(loop => loop.coedges.length), [4, 2]);
    for (const loop of faceLoops) for (const id of loop.coedges) {
      const use = uses.get(id), twin = uses.get(use.twin), edge = edges.get(use.edge);
      assert.equal(twin.twin, id);
      assert.equal(twin.edge, use.edge);
      assert.notEqual(twin.sense, use.sense);
      assert.ok(use.pcurve);
      const [lo, hi] = curveDomain(edge.curve);
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const t = lo + (hi - lo) * fraction, point = evaluateCurve(edge.curve, t);
        const [s, v] = evaluateCurve(use.pcurve, t);
        pointNear(evaluateSurface(face.surface, s, v), point);
        if (loop.kind === 'inner') {
          const [x, y] = local(point);
          near(Math.hypot(x - holeCentre[0], y - holeCentre[1]), radius);
        }
      }
    }
  }
}

test('exact straight Sweep carries mixed outer walls and an offset circular through-hole', () => {
  const first = evaluateCadPart(mixedDocument());
  checkMixedSection(first.outputs[0], 1);
  const edited = evaluateCadPart(mixedDocument(section(1.5), quadratic(mixedStart, mixedEnd)));
  checkMixedSection(edited.outputs[0], 1.5);
  const saved = loadCadPart(saveCadPart(edited));
  assert.deepEqual(saved.document, edited.document);
  assert.deepEqual(saved.outputs[0].brep, edited.outputs[0].brep);
  const annulus = evaluateCadPart(document(linear(), { ...sketch, sideTags: { outer: ['disk'], holes: [['bore']] },
    holes: [circularHole(1, [18, 21])] })).outputs[0];
  assert.equal(checkOutput(annulus).topology[0].genus, 1);
  near(massPropertiesOf(annulus).volume, 3 * Math.PI * distance(a, b));
});

test('exact straight Sweep refuses inexact or unsupported hole topology', () => {
  const base = section(), refuse = (profile, code, message, mode = 'exact-straight') =>
    assert.throws(() => evaluateCadPart(mixedDocument(profile, undefined, mode)), err =>
      err instanceof CadPartError && err.code === code && err.feature === 'w' && message.test(err.message));
  for (const hole of [circularHole(1, [8, 4]), circularHole(1, [8, 3.5]), circularHole(1, [-1, 7]),
    circularHole(1, [16, 8]), circularHole(1, [16 + 1e-8, 8])])
    refuse({ ...base, holes: [hole] }, 'GEOMETRY', /hole must lie strictly inside/);
  refuse({ ...base, holes: [circularHole(0.009)] }, 'PARAMETER', /hole radius of at least 0.01/);
  refuse({ ...base, sideTags: undefined, holes: [circularHole(1), circularHole(1, [6, 9])] },
    'CAPABILITY', /at most one circular hole/);
  refuse({ ...base, sideTags: undefined, holes: [[[6, 6], [7, 6], [7, 7], [6, 7]].map(start => ({ kind: 'line', start }))] },
    'CAPABILITY', /at most one circular hole/);
  refuse({ ...base, sideTags: undefined, regions: [circularHole(1, [30, 30])] },
    'CAPABILITY', /without separate regions/);
  refuse(base, 'CAPABILITY', /one circular profile without holes/, 'exact');
});
