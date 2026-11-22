import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (a, s) => a.map(x => s * x);
const sub = (a, b) => add(a, scale(b, -1));
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const pointNear = (a, b, tolerance = 1e-8) => near(norm(sub(a, b)), 0, tolerance);
const section = { id: 's', kind: 'sketch', profile: 'rectangle', min: [48, -33], max: [52, -27] };
const document = ({ degree, knots, controlPoints, weights }, sketch = section) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    sketch, { kind: 'sweep-curve', id: 'w', sketch: 's', mode: 'exact', path: { degree, knots, controlPoints, weights } },
  ],
});

function arc(id, start, tangent, inward, radius, degrees) {
  const angle = degrees * Math.PI / 180, c = degrees === 90 ? 0 : Math.cos(angle), s = Math.sin(angle);
  const end = add(start, scale(add(scale(tangent, s), scale(inward, 1 - c)), radius));
  const terminal = add(scale(tangent, c), scale(inward, s)), exitInward = sub(scale(inward, c), scale(tangent, s));
  return { start, end, tangent, inward, terminal, exitInward, radius, angle, axis: cross(tangent, inward),
    center: add(start, scale(inward, radius)), length: radius * angle,
    curve: { kind: 'curve', id, degree: 2, knots: [0, 0, 0, 1, 1, 1], weights: [1, Math.cos(angle / 2), 1],
      controlPoints: [start, add(start, scale(tangent, degrees === 90 ? radius : radius * Math.tan(angle / 2))), end] } };
}

function rail({ firstAngle = 90, secondAngle = 90, firstRadius = 12, secondRadius = 18, length = 8,
  start = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0], turn = 1,
  lineTangent, secondTangent, secondInward } = {}) {
  const first = arc('first', start, tangent, inward, firstRadius, firstAngle), direction = lineTangent ?? first.terminal;
  const secondStart = add(first.end, scale(direction, length));
  const line = { kind: 'curve', id: 'line', degree: 2, knots: [0, 0, 0, 1, 1, 1], weights: [1, 1, 1],
    controlPoints: [first.end, add(first.end, scale(direction, length / 2)), secondStart] };
  const second = arc('second', secondStart, secondTangent ?? first.terminal,
    secondInward ?? scale(first.exitInward, turn), secondRadius, secondAngle);
  return { first, second, direction, length,
    path: joinCurves(joinCurves(first.curve, line, { curveId: 'arcLine' }).curve, second.curve, { curveId: 'arcLineArc' }).curve };
}

function verifySection(edges, center, radial, axis, halfWidth, halfHeight) {
  assert.equal(edges.length, 4);
  const corners = new Set();
  for (const { curve } of edges) {
    assert.equal(curve.degree, 1);
    for (const point of curve.controlPoints) {
      const q = sub(point, center), x = dot(q, radial), y = dot(q, axis);
      near(dot(q, cross(radial, axis)), 0);
      near(Math.abs(x), halfWidth);
      near(Math.abs(y), halfHeight);
      corners.add(`${Math.sign(x)}:${Math.sign(y)}`);
    }
  }
  assert.equal(corners.size, 4);
}

function verify(output, { first, second, direction, length }, halfWidth = 2, halfHeight = 3) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, 0);
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 14, loops: 14, coedges: 56, edges: 28, vertices: 16 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 14);
  const geometry = new Map(brep.faces.map(face => [face.id, faceGeometry(face)]));
  for (const [label, bend] of [['first', first], ['second', second]]) {
    const walls = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(walls.length, 4);
    const cylinders = walls.map(face => geometry.get(face.id)).filter(g => g.kind === 'cylinder');
    assert.equal(cylinders.length, 2);
    assert.deepEqual(cylinders.map(g => g.out).sort(), [-1, 1]);
    for (const cylinder of cylinders) {
      near(Math.abs(dot(cylinder.a, bend.axis)), 1);
      near(norm(cross(sub(cylinder.c, bend.center), bend.axis)), 0);
      near(cylinder.r, bend.radius + cylinder.out * halfWidth);
    }
    const planes = walls.map(face => geometry.get(face.id)).filter(g => g.kind === 'plane');
    assert.equal(planes.length, 2);
    for (const plane of planes) {
      near(Math.abs(dot(plane.n, bend.axis)), 1);
      near(dot(sub(plane.o, bend.start), plane.n), halfHeight);
    }
  }
  const lineWalls = brep.faces.filter(face => face.name.startsWith('w.line.'));
  assert.equal(lineWalls.length, 4);
  for (const face of lineWalls) assert.equal(geometry.get(face.id).kind, 'plane');
  for (const face of brep.faces.filter(face => face.name === 'w.start' || face.name === 'w.end')) {
    const start = face.name === 'w.start', bend = start ? first : second;
    const center = start ? first.start : second.end, normal = start ? scale(first.tangent, -1) : second.terminal;
    const plane = geometry.get(face.id);
    assert.equal(plane.kind, 'plane');
    pointNear(plane.n, normal);
    near(dot(sub(plane.o, center), normal), 0);
    assert.equal(face.loops.length, 1);
    const edges = brep.coedges.filter(use => face.loops.includes(use.loop)).map(use => brep.edges.find(edge => edge.id === use.edge));
    verifySection(edges, center, start ? first.inward : second.exitInward, bend.axis, halfWidth, halfHeight);
  }
  assert.equal(brep.faces.filter(face => face.name === 'w.start' || face.name === 'w.end').length, 2);

  const jointIds = new Set();
  for (const [label, center, bend, radial] of [['first', first.end, first, first.exitInward], ['second', second.start, second, second.inward]]) {
    const seams = brep.edges.filter(edge => edge.name?.includes(`w.${label}.`) && edge.name.includes('w.line.'));
    verifySection(seams, center, radial, first.axis, halfWidth, halfHeight);
    let flat = 0, curved = 0;
    for (const edge of seams) {
      jointIds.add(edge.id);
      const domain = curveDomain(edge.curve), uses = brep.coedges.filter(use => use.edge === edge.id);
      assert.equal(uses.length, 2);
      assert.equal(uses[0].twin, uses[1].id);
      assert.equal(uses[1].twin, uses[0].id);
      assert.notEqual(uses[0].sense, uses[1].sense);
      for (const use of uses) {
        assert.ok(use.pcurve, `${edge.name}: missing native pcurve`);
        assert.deepEqual(curveDomain(use.pcurve), domain);
        const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
        for (const fraction of [0, .19, .5, .87, 1]) {
          const t = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, t);
          pointNear(evaluateSurface(surface, u, v), evaluateCurve(edge.curve, t));
        }
      }
      const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
      assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
      near(continuity.maximumAngleDegrees, 0, 1e-7);
      assert.equal(continuity.curvature.status, 'measured');
      const wall = geometry.get(continuity.faces.find(face => face.name.startsWith(`w.${label}.`)).id);
      const expected = wall.kind === 'plane' ? 0 : -wall.out / wall.r;
      if (wall.kind === 'plane') flat++;
      else {
        curved++;
        assert.equal(wall.kind, 'cylinder');
        const middle = evaluateCurve(edge.curve, (domain[0] + domain[1]) / 2);
        near(wall.r, bend.radius - dot(sub(middle, center), radial));
      }
      near(continuity.curvature.maximumDifference, Math.abs(expected), 1e-10);
      for (const sample of continuity.curvature.samples) {
        const a = continuity.faces[0].name.startsWith('w.line.') ? 0 : expected;
        const b = continuity.faces[1].name.startsWith('w.line.') ? 0 : expected;
        near(sample.first, a, 1e-10);
        near(sample.second, b, 1e-10);
        near(sample.difference, Math.abs(expected), 1e-10);
      }
    }
    assert.equal(flat, 2);
    assert.equal(curved, 2);
  }
  assert.equal(jointIds.size, 8);

  // Each bend stays in its own half-space outside the straight slab. Check native surfaces against
  // the authored rectangular carrier, including radial clearance from each bend's own axis.
  for (const face of brep.faces) {
    const label = ['first', 'second', 'line'].find(label => face.name.startsWith(`w.${label}.`));
    if (!label) continue;
    const { surface } = face, samples = [];
    const [u0, u1] = [surface.knotsU[surface.degreeU], surface.knotsU[surface.controlPoints.length]];
    const [v0, v1] = [surface.knotsV[surface.degreeV], surface.knotsV[surface.controlPoints[0].length]];
    // A planar annular sector's affine chart extends beyond its trims. Sample its exact boundary;
    // cylinder charts have their full rectangular domain on the native wall.
    if (geometry.get(face.id).kind === 'plane') {
      for (const use of brep.coedges.filter(use => face.loops.includes(use.loop))) {
        const { curve } = brep.edges.find(edge => edge.id === use.edge), [lo, hi] = curveDomain(curve);
        for (const fraction of [0, .19, .5, .87, 1]) samples.push(evaluateCurve(curve, lo + fraction * (hi - lo)));
      }
    } else for (const u of [0, .19, .5, .87, 1]) for (const v of [0, .23, .61, 1])
      samples.push(evaluateSurface(surface, u0 + u * (u1 - u0), v0 + v * (v1 - v0)));
    for (const point of samples) {
      const station = dot(sub(point, first.end), direction);
      if (label === 'line') assert.ok(station >= -1e-8 && station <= length + 1e-8);
      else {
        const bend = label === 'first' ? first : second;
        assert.ok(label === 'first' ? station <= 1e-8 : station >= length - 1e-8);
        const q = sub(point, bend.center), axial = dot(q, bend.axis), radial = norm(sub(q, scale(bend.axis, axial)));
        assert.ok(radial >= bend.radius - halfWidth - 1e-8 && radial <= bend.radius + halfWidth + 1e-8);
        assert.ok(Math.abs(axial) <= halfHeight + 1e-8);
      }
    }
  }
}

// Independent exact moments of dV = (1-u/R) du dv R dtheta. The radial second moment is a²/3;
// integrate n(theta), n(theta)n(theta)^T with trigonometric antiderivatives, and the straight by polynomials.
function checkAnalyticMass(output, { first, second, direction, length }, halfWidth, halfHeight) {
  const density = 7.85, area = 4 * halfWidth * halfHeight, q = halfWidth ** 2 / 3, v = halfHeight ** 2 / 3;
  const volume = area * (first.length + length + second.length), moment = [0, 0, 0];
  const raw = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (const bend of [first, second]) {
    const { angle, inward: n, tangent: t, axis: b, center: c, radius: r } = bend;
    const N = sub(scale(n, Math.sin(angle)), scale(t, 1 - Math.cos(angle)));
    const cc = angle / 2 + Math.sin(2 * angle) / 4, ss = angle / 2 - Math.sin(2 * angle) / 4;
    const cs = Math.sin(angle) ** 2 / 2, k = r + q / r;
    for (let i = 0; i < 3; i++) {
      moment[i] += area * r * (c[i] * angle - k * N[i]);
      for (let j = 0; j < 3; j++) {
        const NN = n[i] * n[j] * cc + t[i] * t[j] * ss - (n[i] * t[j] + t[i] * n[j]) * cs;
        raw[i][j] += area * r * (c[i] * c[j] * angle - k * (c[i] * N[j] + N[i] * c[j])
          + (r * r + 3 * q) * NN + v * b[i] * b[j] * angle);
      }
    }
  }
  const p = first.end, n = first.exitInward, b = first.axis, t = direction;
  for (let i = 0; i < 3; i++) {
    moment[i] += area * (length * p[i] + length ** 2 / 2 * t[i]);
    for (let j = 0; j < 3; j++) raw[i][j] += area * (length * p[i] * p[j]
      + length ** 2 / 2 * (p[i] * t[j] + t[i] * p[j]) + length ** 3 / 3 * t[i] * t[j]
      + length * (q * n[i] * n[j] + v * b[i] * b[j]));
  }
  const centroid = scale(moment, 1 / volume), mass = density * .001 * volume;
  const central = raw.map((row, i) => row.map((entry, j) => entry - volume * centroid[i] * centroid[j]));
  const trace = central[0][0] + central[1][1] + central[2][2];
  const inertia = central.map((row, i) => row.map((entry, j) => density * .001 * ((i === j ? trace : 0) - entry)));
  const exact = massPropertiesOf(output, density), native = brepMassProperties(output.brep, density);
  assert.equal(exact.method, 'closed-form');
  assert.equal(native.method, 'quadrature');
  for (const actual of [exact, native]) {
    near(actual.volume, volume, 2e-8 * volume);
    near(actual.mass, mass, 2e-8 * mass);
    pointNear(actual.centroid, centroid, 1e-7);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) near(actual.inertia[i][j], inertia[i][j], 2e-8 * mass * 1000);
  }
}

test('same-turn spaced rectangle keeps eight native G1 seams, exact moments and edit/reopen identity', () => {
  const path = rail(), tagged = { ...section, sideTags: { outer: ['south', 'east', 'north', 'west'] } };
  assert.deepEqual(path.path.controlPoints, [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 16, 0], [12, 20, 0], [12, 38, 0], [-6, 38, 0]]);
  const initial = evaluateCadPart(document(path.path, tagged));
  verify(initial.outputs[0], path);
  checkAnalyticMass(initial.outputs[0], path, 2, 3);
  near(massPropertiesOf(initial.outputs[0]).volume, 360 * Math.PI + 192);
  for (const tag of tagged.sideTags.outer) assert.deepEqual(initial.outputs[0].brep.faces
    .filter(face => face.name.endsWith(`.side[${tag}]`)).map(face => face.name).sort(),
  [`w.first.side[${tag}]`, `w.line.side[${tag}]`, `w.second.side[${tag}]`]);
  const edited = reevaluate(initial, { document: document(path.path, { ...tagged, min: [46, -33], max: [54, -27] }) });
  verify(edited.outputs[0], path, 4, 3);
  checkAnalyticMass(edited.outputs[0], path, 4, 3);
  near(massPropertiesOf(edited.outputs[0]).volume, 720 * Math.PI + 384);
  const identity = snapshot => Object.fromEntries(['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices']
    .map(kind => [kind, snapshot.outputs[0].brep[kind].map(({ id, name }) => [id, name])]));
  assert.deepEqual(identity(edited), identity(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  verify(reopened.outputs[0], path, 4, 3);
  const restored = reevaluate(reopened, { document: document(path.path, tagged) });
  assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
});

for (const [firstAngle, secondAngle, firstRadius, secondRadius, length] of [
  [30, 120, 7, 4, 8], [120, 30, 4, 7, 8], [120, 120, 7, 4, 8], [90, 90, 12, 12, .00011],
]) test(`oblique radial-Y rectangle ${firstAngle}°/${secondAngle}° keeps both joins and its large binormal extent`, () => {
  const path = rail({ firstAngle, secondAngle, firstRadius, secondRadius, length,
    start: [42, -17, 8], tangent: [.6, .8, 0], inward: [.8, -.6, 0] });
  const sketch = { ...section, min: [40, -32], max: [60, -28],
    plane: { origin: [5, 4, 3], normal: path.first.tangent, xAxis: path.first.axis } };
  const output = evaluateCadPart(document(path.path, sketch)).outputs[0];
  verify(output, path, 2, 10);
  checkAnalyticMass(output, path, 2, 10);
});

test('spaced rectangle refuses holes, roll, either axis contact, opposite turns and invalid rails without state changes', () => {
  const path = rail(), initial = evaluateCadPart(document(path.path)), before = structuredClone(initial);
  const refused = (changedRail, sketch, code, message) => {
    assert.throws(() => reevaluate(initial, { document: document(changedRail.path, sketch) }),
      error => error instanceof CadPartError && error.feature === 'w' && error.code === code && message.test(error.message));
    assert.deepEqual(initial, before);
  };
  refused(path, { ...section, plane: { origin: [0, 0, 0], normal: path.first.tangent, xAxis: [0, Math.SQRT1_2, Math.SQRT1_2] } },
    'CAPABILITY', /rectangle's original axes aligned to the bend radial and binormal/);
  const rectangle = [[49, -32], [51, -32], [51, -28], [49, -28]].map(start => ({ kind: 'line', start }));
  const circle = [{ kind: 'arc', start: [51, -30], center: [50, -30], direction: 'ccw' }];
  for (const holes of [[rectangle], [circle], [rectangle, circle]]) refused(path, { ...section, holes },
    'CAPABILITY', /one solid section without holes/);
  for (const radius of [2, 1.99]) for (const radii of [{ firstRadius: radius }, { secondRadius: radius }])
    refused(rail(radii), section, 'PARAMETER', /rectangular arc-line-arc sweep needs radial half-width smaller than both path radii/);
  refused(rail({ turn: -1 }), section, 'CAPABILITY', /one circular outer section/);
  for (const options of [{ lineTangent: [1, 0, 0] }, { secondTangent: [0, -1, 0] }, { length: -8 }])
    refused(rail(options), section, 'GEOMETRY', /common forward tangent at both joins/);
  refused(rail({ secondInward: [0, 0, 1] }), section, 'CAPABILITY', /two coplanar circular arcs/);
  for (const options of [{ firstAngle: 29 }, { secondAngle: 121 }])
    refused(rail(options), section, 'CAPABILITY', /two coplanar circular arcs/);
  refused(rail({ length: .00001 }), section, 'PARAMETER', /straight segment at least 0.0001 mm/);
  const triangle = { id: 's', kind: 'sketch', profile: 'polygon', points: [[-1, -1], [1, -1], [0, 1]] };
  refused(path, triangle, 'CAPABILITY', /one circular outer section/);
  const reopened = loadCadPart(saveCadPart(initial));
  assert.deepEqual(reopened.document, initial.document);
  assert.deepEqual(reopened.outputs[0].brep, initial.outputs[0].brep);
});
