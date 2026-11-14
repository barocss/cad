import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkOutput, coedgeVertices, curveDomain, evaluateCadPart, evaluateCurve,
  loadCadPart, massPropertiesOf, reevaluate, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';
import { brepBounds } from '../dist/brep/brep-bounds.js';

const tolerance = 1e-7;
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, k) => a.map(x => k * x);
const dot = (a, b) => a.reduce((v, x, i) => v + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => scale(a, 1 / Math.hypot(...a));
const distance = (a, b) => Math.hypot(...sub(a, b));
const near = (actual, expected, limit = tolerance) => assert.ok(Math.abs(actual - expected) <= limit, `${actual} vs ${expected}, limit ${limit}`);
const pointNear = (actual, expected) => assert.ok(distance(actual, expected) <= tolerance, `${actual} vs ${expected}`);

const c = [13, -7, 4], u = [0.6, 0.8, 0], v = [0, 0, 1], R = 20, r = 2;
const sketch = { id: 's', kind: 'sketch', profile: 'circle', center: [50, -30], radius: r };
const path = { degree: 2, knots: [2, 2, 2, 7, 7, 7], controlPoints: [[25, 9, 4], [25, 9, 24], [13, -7, 24]], weights: [1, 0.707106781, 1] };
const document = (rail = path, section = sketch, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [section, { id: 'w', kind: 'sweep-curve', sketch: 's', path: rail, ...(mode === null ? {} : { mode }) }],
});
const parameters = [0, 0.17, 0.5, 0.81, 1];

function surfacePoint(face, u, v) {
  const { point, du, dv } = evaluateSurfaceD1(face.surface, u, v);
  return { point, normal: scale(unit(cross(du, dv)), face.sense === 'forward' ? 1 : -1) };
}

function inspectQuarter(output, centre, radial, tangent, expectedCaps, startRoll) {
  const { brep } = output, report = checkOutput(output);
  assert.equal(report.valid, true, report.issues.join('\n'));
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 });
  assert.equal(report.topology[0].genus, 0);
  assert.equal(brep.shells[0].closed, true);
  assert.ok(report.maximumEdgeSurfaceGap <= tolerance);

  // Pappus for volume. Integrating the radial moment over a disk gives the effective radius in the centroid.
  const expectedVolume = 40 * Math.PI ** 2;
  const expectedCentroid = add(centre, scale(add(radial, tangent), (R + r * r / (4 * R)) * 2 / Math.PI));
  for (const [measurement, method] of [[massPropertiesOf(output), 'closed-form'], [brepMassProperties(brep, 1), 'quadrature']]) {
    assert.equal(measurement.method, method);
    near(measurement.volume, expectedVolume, expectedVolume * 1e-9);
    pointNear(measurement.centroid, expectedCentroid);
  }

  const faces = new Map(brep.faces.map(f => [f.id, f]));
  const loops = new Map(brep.loops.map(l => [l.id, l]));
  const uses = new Map(brep.coedges.map(e => [e.id, e]));
  const edgeFaces = new Map(brep.edges.map(e => [e.id, []]));
  for (const loop of brep.loops) {
    assert.equal(loop.kind, 'outer');
    for (const [i, id] of loop.coedges.entries()) {
      const use = uses.get(id), twin = uses.get(use.twin), next = uses.get(use.next);
      assert.equal(use.loop, loop.id);
      assert.equal(use.next, loop.coedges[(i + 1) % loop.coedges.length]);
      assert.equal(next.prev, id);
      assert.equal(coedgeVertices(brep, use)[1], coedgeVertices(brep, next)[0]);
      assert.equal(twin.twin, id);
      assert.equal(twin.edge, use.edge);
      assert.notEqual(twin.sense, use.sense);
      assert.notEqual(loops.get(twin.loop).face, loop.face);
      edgeFaces.get(use.edge).push(faces.get(loop.face));
    }
  }
  const axis = cross(radial, tangent);
  const torusNormal = p => {
    const q = sub(p, centre), planar = sub(q, scale(axis, dot(q, axis)));
    const displacement = sub(q, scale(unit(planar), R));
    near(Math.hypot(...displacement), r);
    return unit(displacement);
  };
  for (const face of brep.faces) {
    const cap = expectedCaps.get(face.name), surface = face.surface;
    assert.equal(surface.kind, 'surface');
    assert.deepEqual([surface.degreeU, surface.degreeV], cap ? [1, 1] : [2, 2]);
    if (!cap) assert.equal(surface.controlPoints.length, 3, 'one longitudinal arc span');
    const { u: U, v: V } = surfaceDomain(surface);
    // The two exact quarter spans of a profile half share a repeated knot at V=0.5.
    for (const a of parameters) for (const b of [0, 0.17, 0.49, 0.51, 0.81, 1]) {
      const actual = surfacePoint(face, U[0] + a * (U[1] - U[0]), V[0] + b * (V[1] - V[0]));
      if (cap) {
        near(dot(sub(actual.point, cap.centre), cap.normal), 0);
        pointNear(actual.normal, cap.normal);
      } else pointNear(actual.normal, torusNormal(actual.point));
    }
  }
  let capEdges = 0, seams = 0;
  const seamStarts = [];
  for (const edge of brep.edges) {
    const adjacent = edgeFaces.get(edge.id);
    assert.equal(adjacent.length, 2);
    assert.equal(edge.curve.degree, 2);
    const cap = adjacent.map(face => expectedCaps.get(face.name)).find(Boolean);
    if (cap) capEdges++;
    else seams++;
    for (const t of parameters) {
      const p = evaluateCurve(edge.curve, t);
      if (cap) {
        near(distance(p, cap.centre), r);
        near(dot(sub(p, cap.centre), cap.normal), 0);
        continue;
      }
      if (t === 0) seamStarts.push(p);
      const normal = torusNormal(p);
      for (const face of adjacent) {
        const ends = surfaceDomain(face.surface).v;
        const boundary = ends.map(end => surfacePoint(face, t, end)).find(q => distance(q.point, p) <= tolerance);
        assert.ok(boundary, `${edge.name} belongs on ${face.name}`);
        pointNear(boundary.normal, normal);
      }
    }
  }
  assert.deepEqual([capEdges, seams], [4, 2]);
  const start = expectedCaps.get('w.start').centre;
  for (const sign of [-1, 1]) assert.ok(seamStarts.some(p => distance(p, add(start, scale(startRoll, sign * r))) <= tolerance));
}

test('exact disk sweep follows a selected world arc, with native caps, smooth shared seams and mass', () => {
  const caps = new Map([
    ['w.start', { centre: [25, 9, 4], normal: [0, 0, -1] }],
    ['w.end', { centre: [13, -7, 24], normal: [-0.6, -0.8, 0] }],
  ]);
  // X is parallel to the first tangent. The placed sketch's Y supplies the seam direction.
  const placed = { ...sketch, plane: { origin: [30, 40, 50], normal: [-1, 0, 0], xAxis: [0, 0, 1] } };
  const snapshot = evaluateCadPart(document(path, placed));
  inspectQuarter(snapshot.outputs[0], c, u, v, caps, [0, 1, 0]);
  const saved = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(saved.document, snapshot.document);
  assert.deepEqual(saved.outputs[0].brep, snapshot.outputs[0].brep);

  // Common weight rescaling preserves the source curve. Reversal exchanges the two cap roles.
  const reverse = { ...path, controlPoints: path.controlPoints.toReversed(), weights: scale(path.weights, 2) };
  const reversedCaps = new Map([['w.start', caps.get('w.end')], ['w.end', caps.get('w.start')]]);
  const reversed = reevaluate(snapshot, { document: document(reverse, placed) });
  inspectQuarter(reversed.outputs[0], c, u, v, reversedCaps, v);
});

test('a rounded oblique quarter arc keeps its native endpoints and single longitudinal span', () => {
  const centre = [13.647173838, -7.254836699571428, 4.372525523272728];
  const radial = unit([2, 1, 3]), tangent = unit([1, 4, -2]);
  // Decimal poles rounded to nine places imply a raw angle 4.85e-11 radians above π/2.
  const rounded = { ...path, controlPoints: [[24.337623514, -1.909611861, 20.408200038], [28.701981319, 15.547819358, 11.679484429], [18.011531643, 10.202594519, -4.356190086]] };
  const [start, , end] = rounded.controlPoints;
  const caps = new Map([
    ['w.start', { centre: start, normal: scale(tangent, -1) }],
    ['w.end', { centre: end, normal: scale(radial, -1) }],
  ]);
  const roll = unit(sub([1, 0, 0], scale(tangent, tangent[0])));
  inspectQuarter(evaluateCadPart(document(rounded)).outputs[0], centre, radial, tangent, caps, roll);
});

test('exact sweep refuses unsupported paths and section topology and keeps omitted mode faceted', () => {
  const line = { degree: 1, knots: [0, 0, 1, 1], controlPoints: [[0, 0, 0], [0, 0, 30]], weights: [1, 1] };
  const unequal = { ...path, weights: [1, path.weights[1], 1.00001] };
  const wrongHeight = { ...path, controlPoints: [[25, 9, 4], [31, 17, 34], [13, -7, 24]] };
  const misplaced = { ...path, controlPoints: [[25, 9, 4], [25, 9, 24.001], [13, -7, 24]] };
  const wrongWeight = { ...path, weights: [1, 0.7, 1] };
  const closed = { ...path, controlPoints: [path.controlPoints[0], path.controlPoints[1], path.controlPoints[0]] };
  const general = { degree: 3, knots: [0, 0, 0, 0, 1, 1, 1, 1], controlPoints: [[0, 0, 0], [0, 0, 10], [20, 2, 20], [20, 0, 30]], weights: [1, 1, 1, 1] };
  const refused = (doc, code, matches) => assert.throws(() => evaluateCadPart(doc), err => err instanceof CadPartError && err.code === code && err.feature === 'w' && matches.test(err.message));
  for (const rail of [line, unequal, wrongHeight, misplaced, wrongWeight, closed, general]) refused(document(rail), 'CAPABILITY', /one open circular arc/);
  refused(document(path, { ...sketch, radius: R }), 'PARAMETER', /path radius larger/);
  refused(document(path, { ...sketch, radius: R + 1 }), 'PARAMETER', /path radius larger/);
  const holed = { ...sketch, center: [0, 0], holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'ccw' }]] };
  refused(document(path, holed), 'CAPABILITY', /one outer profile without holes/);
  const rectangle = { id: 's', kind: 'sketch', profile: 'rectangle', min: [-1, -1], max: [1, 1] };
  const result = evaluateCadPart(document(path, rectangle)).outputs[0];
  assert.equal(checkOutput(result).valid, true);
  near(massPropertiesOf(result).volume, 4 * R * Math.PI / 2);
  refused(document(path, { ...rectangle, regions: [[{ kind: 'arc', start: [6, 0], center: [5, 0], direction: 'ccw' }]] }),
    'CAPABILITY', /without holes or separate regions/);
  refused(document(path, sketch, 'other'), 'INPUT', /sweep mode must be/);
  for (const legacy of [document(path, sketch, null), document(line, holed, null)]) {
    const output = evaluateCadPart(legacy).outputs[0];
    assert.deepEqual(output.brep.source, { family: 'mesh', id: 'w' });
    assert.ok(output.brep.faces.length > 4);
  }
});

const bendCentre = [13, -7, 4], bendNormal = [0, 0, 1];
const quarterRail = radius => ({ ...path,
  controlPoints: [[13 + radius, -7, 4], [13 + radius, -7 + radius, 4], [13, -7 + radius, 4]],
  weights: [1, Math.SQRT1_2, 1],
});
const dSection = back => ({ id: 's', kind: 'sketch', profile: 'loop',
  segments: [
    { kind: 'line', start: [back, 3] },
    { kind: 'arc', start: [12, 3], center: [12, 8], direction: 'ccw' },
    { kind: 'line', start: [12, 13] },
    { kind: 'line', start: [back, 13] },
  ],
  sideTags: { outer: ['base', 'round', 'roof', 'back'] },
});

function dMoments(back) {
  const width = 12 - back, rectangle = width * 10, semi = 12.5 * Math.PI, area = rectangle + semi;
  const mid = (12 + back) / 2, semiFirstMoment = 2 * 5 ** 3 / 3;
  const x = (rectangle * mid + semi * 12 + semiFirstMoment) / area;
  const x2 = (rectangle * (mid ** 2 + width ** 2 / 12) + semi * (12 ** 2 + 5 ** 2 / 4) + 24 * semiFirstMoment) / area;
  return { area, x, variance: x2 - x * x };
}

function checkQuarterSection(output, back, reversed) {
  const { area, x, variance } = dMoments(back), { brep } = output;
  const check = checkOutput(output);
  assert.equal(check.valid, true, check.issues.join('\n'));
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(check.topology[0].genus, 0);
  assert.ok(check.maximumEdgeSurfaceGap <= tolerance);
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.equal(output.representation, 'curved');

  const expectedVolume = area * R * Math.PI / 2;
  const radialCentroid = (R + variance / R) * 2 / Math.PI;
  const expectedCentroid = add(bendCentre, [radialCentroid, radialCentroid, 0]);
  for (const [mass, method] of [[massPropertiesOf(output), 'closed-form'], [brepMassProperties(brep, 1), 'quadrature']]) {
    assert.equal(mass.method, method);
    near(mass.volume, expectedVolume);
    pointNear(mass.centroid, expectedCentroid);
  }
  const bounds = brepBounds(brep), maxRadius = R + 17 - x;
  pointNear(bounds.min, add(bendCentre, [0, 0, -5]));
  pointNear(bounds.max, add(bendCentre, [maxRadius, maxRadius, 5]));

  const faces = new Map(brep.faces.map(face => [face.id, face]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const caps = { 'w.start': reversed ? 1 : 0, 'w.end': reversed ? 0 : 1 };
  const profileY = scale(bendNormal, reversed ? 1 : -1);
  const walls = {
    'w.side[base]': { degree: [1, 1], y: 3, normal: scale(profileY, -1) },
    'w.side[roof]': { degree: [1, 1], y: 13, normal: profileY },
    'w.side[back]': { degree: [2, 1], x: back },
    'w.side[round]': { degree: [2, 2] },
  };
  const inSection = point => {
    const q = sub(point, bendCentre), p = [q[0], q[1], 0], rad = Math.hypot(...p);
    return { px: x + rad - R, py: 8 + dot(q, profileY), radial: scale(p, 1 / rad) };
  };
  assert.deepEqual(new Set(brep.faces.map(face => face.name)), new Set([...Object.keys(caps), ...Object.keys(walls)]));
  for (const face of brep.faces) {
    const cap = caps[face.name], wall = walls[face.name], { u, v } = surfaceDomain(face.surface);
    assert.equal(face.surface.kind, 'surface');
    assert.deepEqual([face.surface.degreeU, face.surface.degreeV], wall?.degree ?? [1, 1]);
    const loop = loops.get(face.loops[0]);
    assert.equal(loop.kind, 'outer');
    assert.equal(loop.coedges.length, 4);
    for (const id of loop.coedges) {
      const use = uses.get(id), twin = uses.get(use.twin);
      assert.equal(twin.twin, id);
      assert.equal(twin.edge, use.edge);
      assert.notEqual(twin.sense, use.sense);
    }
    for (const a of [0.15, 0.5, 0.85]) for (const b of [0.125, 0.375, 0.625, 0.875]) {
      const { point, normal } = surfacePoint(face, u[0] + a * (u[1] - u[0]), v[0] + b * (v[1] - v[0]));
      if (cap !== undefined) {
        near(point[cap === 0 ? 1 : 0], bendCentre[cap === 0 ? 1 : 0]);
        pointNear(normal, cap === 0 ? [0, -1, 0] : [-1, 0, 0]);
      } else {
        const { px, py, radial } = inSection(point);
        if (wall.y !== undefined) {
          near(py, wall.y);
          pointNear(normal, wall.normal);
        } else if (wall.x !== undefined) {
          near(px, wall.x);
          pointNear(normal, scale(radial, -1));
        } else {
          near(Math.hypot(px - 12, py - 8), 5);
          assert.ok(px >= 12 - tolerance);
          pointNear(normal, scale(add(scale(radial, px - 12), scale(profileY, py - 8)), 1 / 5));
        }
      }
    }
  }
  for (const edge of brep.edges) {
    const adjacent = brep.coedges.filter(use => use.edge === edge.id).map(use => faces.get(loops.get(use.loop).face).name);
    const cap = adjacent.find(name => caps[name] !== undefined), wall = walls[adjacent.find(name => walls[name])];
    assert.equal(edge.curve.degree, cap && wall.degree[1] === 1 ? 1 : 2);
    const [t0, t1] = curveDomain(edge.curve);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const point = evaluateCurve(edge.curve, t0 + (t1 - t0) * t), { px, py } = inSection(point);
      if (cap) near(point[caps[cap] === 0 ? 1 : 0], bendCentre[caps[cap] === 0 ? 1 : 0]);
      if (wall.y !== undefined) near(py, wall.y);
      else if (wall.x !== undefined) near(px, wall.x);
      else near(Math.hypot(px - 12, py - 8), 5);
    }
  }
}

test('mixed exact circular-arc Sweep preserves its native section, world placement and tagged walls', () => {
  const rail = quarterRail(R);
  const first = evaluateCadPart(document(rail, dSection(2)));
  checkQuarterSection(first.outputs[0], 2, false);
  const edit = reevaluate(first, { document: document(rail, dSection(3)) });
  checkQuarterSection(edit.outputs[0], 3, false);
  const saved = loadCadPart(saveCadPart(edit));
  assert.deepEqual(saved.document, edit.document);
  assert.deepEqual(saved.outputs[0].brep, edit.outputs[0].brep);

  // At the reversed start, projected sketch X is parallel to the rail and sketch Y gives its roll.
  const reverse = { ...rail, controlPoints: rail.controlPoints.toReversed() };
  checkQuarterSection(evaluateCadPart(document(reverse, dSection(2))).outputs[0], 2, true);
});

test('mixed exact circular-arc Sweep rejects a wall or an interior arc extremum on the bend axis', () => {
  const original = dSection(2);
  const reflected = { ...original, segments: original.segments.map(s => {
    const start = [14 - s.start[0], s.start[1]];
    return s.kind === 'line' ? { ...s, start } : { ...s, start, center: [14 - s.center[0], s.center[1]], direction: 'cw' };
  }) };
  const cx = dMoments(2).x, wallTouch = cx - 2, arcTouch = 17 - cx;
  for (const [profile, limit] of [[original, wallTouch], [reflected, arcTouch]]) {
    for (const radius of [limit - 1e-4, limit, limit + 2e-8]) {
      assert.throws(() => evaluateCadPart(document(quarterRail(radius), profile)), err =>
        err instanceof CadPartError && err.code === 'PARAMETER' && /profile must stay clear of the bend axis/.test(err.message));
    }
    const accepted = evaluateCadPart(document(quarterRail(limit + 1e-5), profile)).outputs[0];
    const check = checkOutput(accepted);
    assert.equal(check.valid, true, check.issues.join('\n'));
    assert.equal(check.counts.faces, 6);
  }
});
