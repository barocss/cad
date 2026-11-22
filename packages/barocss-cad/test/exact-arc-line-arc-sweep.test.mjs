import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, compileCadModel, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, scalar) => a.map(x => x * scalar);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const pointNear = (a, b, tolerance) => near(norm(sub(a, b)), 0, tolerance);

const disk = { id: 's', kind: 'sketch', profile: 'circle', center: [8, -4], radius: 2, sideTags: { outer: ['rim'] } };
const boreSection = (radius, center = disk.center, phase = [1, 0], direction = 'ccw') => ({
  ...disk, sideTags: { outer: ['rim'], holes: [['bore']] },
  holes: [[{ kind: 'arc', center, start: add(center, scale(phase, radius)), direction }]],
});
const boreWall = name => name.includes('[bore]') || name.includes('.hole0.side');
const pathOf = ({ degree, knots, controlPoints, weights }) => ({ degree, knots, controlPoints, weights });
const document = (path, section = disk, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [section, { id: 'w', kind: 'sweep-curve', sketch: 's', mode, path: pathOf(path) }],
});
const quadratic = (id, controlPoints, middleWeight = 1) => ({ kind: 'curve', id, degree: 2,
  knots: [0, 0, 0, 1, 1, 1], controlPoints, weights: [1, middleWeight, 1] });

function arc(id, start, tangent, inward, radius, degrees) {
  const angle = degrees * Math.PI / 180, c = degrees === 90 ? 0 : Math.cos(angle), s = Math.sin(angle);
  const end = add(start, scale(add(scale(tangent, s), scale(inward, 1 - c)), radius));
  const atExit = add(scale(tangent, c), scale(inward, s));
  const exitInward = sub(scale(inward, c), scale(tangent, s));
  const control = add(start, scale(tangent, degrees === 90 ? radius : radius * Math.tan(angle / 2)));
  return { start, tangent, inward, end, atExit, exitInward, radius, angle,
    center: add(start, scale(inward, radius)), axis: cross(tangent, inward),
    curve: quadratic(id, [start, control, end], Math.cos(angle / 2)) };
}

function rail({ firstAngle = 90, secondAngle = 90, firstRadius = 12, secondRadius = 18, length = 8,
  start = [0, 0, 0], tangent = [0, 1, 0], inward = [1, 0, 0],
  lineTangent, secondTangent, secondInward, sameTurn = false } = {}) {
  const first = arc('first', start, tangent, inward, firstRadius, firstAngle);
  const direction = lineTangent ?? first.atExit;
  const secondStart = add(first.end, scale(direction, length));
  const line = quadratic('line', [first.end, add(first.end, scale(direction, length / 2)), secondStart]);
  const second = arc('second', secondStart, secondTangent ?? first.atExit,
    secondInward ?? scale(first.exitInward, sameTurn ? 1 : -1), secondRadius, secondAngle);
  const curve = joinCurves(joinCurves(first.curve, line, { curveId: 'arcLine' }).curve, second.curve, { curveId: 'arcLineArc' }).curve;
  return { first, second, direction, length, curve, totalLength: firstRadius * first.angle + length + secondRadius * second.angle };
}

function sampleSection(curve, center, normal, radius) {
  const [lo, hi] = curveDomain(curve);
  for (const fraction of [0, .19, .5, .87, 1]) {
    const q = sub(evaluateCurve(curve, lo + (hi - lo) * fraction), center);
    near(dot(q, normal), 0);
    near(norm(q), radius);
  }
}

// At angle delta from either join, the bend's tangent projection is ±(R-u) sin(delta), |u| <= r.
// Since 0 <= delta <= 120° and r < R, the two bends occupy disjoint open half-spaces outside the line slab.
function verifyEnvelope(brep, path, radius) {
  const { first, second, direction, length } = path, binormal = unit(first.axis);
  const reach = bend => (bend.radius + radius) * Math.sin(Math.min(bend.angle, Math.PI / 2));
  const bounds = { first: [-reach(first), 0], line: [0, length], second: [length, length + reach(second)] };
  for (const [label, [lo, hi]] of Object.entries(bounds)) {
    for (const face of brep.faces.filter(face => face.name.startsWith(`w.${label}.`))) {
      const { u, v } = surfaceDomain(face.surface);
      for (const s of [0, .17, .5, .83, 1]) for (const t of [0, .24, .5, .69, 1]) {
        const point = evaluateSurface(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        const station = dot(sub(point, first.end), direction);
        assert.ok(station >= lo - 1e-8 && station <= hi + 1e-8, `${face.name}: ${station} outside [${lo}, ${hi}]`);
        assert.ok(Math.abs(dot(sub(point, first.start), binormal)) <= radius + 1e-8);
        if (label === 'first' && s < 1) assert.ok(station < 0);
        if (label === 'second' && s > 0) assert.ok(station > length);
      }
    }
  }
}

// Independent circular-section integration: dV = (1-u/R) du dv ds. Integrate sin, cos and their products analytically.
// The straight span has its own uniform cylinder moments. No native revolve, B-rep or mass producer supplies these values.
function independentCircularMass(path, radius, density, boreRadius = 0) {
  const area = Math.PI * (radius ** 2 - boreRadius ** 2), q = (radius ** 2 + boreRadius ** 2) / 4;
  const volume = area * path.totalLength;
  const first = [0, 0, 0], second = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (const bend of [path.first, path.second]) {
    const { angle: a, radius: R, center: C, inward: n, tangent: t } = bend, b = unit(bend.axis);
    const meanN = sub(scale(n, Math.sin(a) / a), scale(t, (1 - Math.cos(a)) / a));
    const cc = .5 + Math.sin(2 * a) / (4 * a), ss = 1 - cc, cs = Math.sin(a) ** 2 / (2 * a);
    const V = area * R * a, K = R + q / R;
    for (let i = 0; i < 3; i++) {
      first[i] += V * (C[i] - K * meanN[i]);
      for (let j = 0; j < 3; j++) {
        const meanNN = cc * n[i] * n[j] + ss * t[i] * t[j] - cs * (n[i] * t[j] + t[i] * n[j]);
        second[i][j] += V * (C[i] * C[j] - K * (C[i] * meanN[j] + meanN[i] * C[j])
          + (R ** 2 + 3 * q) * meanNN + q * b[i] * b[j]);
      }
    }
  }
  const d = path.direction, midpoint = add(path.first.end, scale(d, path.length / 2)), V = area * path.length;
  for (let i = 0; i < 3; i++) {
    first[i] += V * midpoint[i];
    for (let j = 0; j < 3; j++) second[i][j] += V * (midpoint[i] * midpoint[j]
      + path.length ** 2 / 12 * d[i] * d[j] + q * ((i === j ? 1 : 0) - d[i] * d[j]));
  }
  const centroid = scale(first, 1 / volume), mass = density * .001 * volume;
  const central = second.map((row, i) => row.map((entry, j) => entry - volume * centroid[i] * centroid[j]));
  const trace = central[0][0] + central[1][1] + central[2][2];
  const inertia = central.map((row, i) => row.map((entry, j) => density * .001 * ((i === j ? trace : 0) - entry)));
  return { volume, centroid, mass, inertia };
}

function checkIndependentCircularMass(output, path, radius, boreRadius = 0) {
  const density = 7.85, expected = independentCircularMass(path, radius, density, boreRadius), native = brepMassProperties(output.brep, density);
  assert.equal(native.method, 'quadrature');
  for (const actual of [massPropertiesOf(output, density), native]) {
    near(actual.volume, expected.volume, 2e-8 * expected.volume);
    near(actual.mass, expected.mass, 2e-8 * expected.mass);
    for (let i = 0; i < 3; i++) {
      near(actual.centroid[i], expected.centroid[i], 1e-7);
      for (let j = 0; j < 3; j++) near(actual.inertia[i][j], expected.inertia[i][j], 2e-8 * expected.mass * 1000);
    }
  }
}

function verify(output, path, radius, boreRadius = 0) {
  const { first, second, direction, totalLength } = path, { brep } = output;
  const check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, boreRadius ? 1 : 0);
  assert.deepEqual(check.counts, boreRadius
    ? { bodies: 1, shells: 1, faces: 14, loops: 16, coedges: 56, edges: 28, vertices: 16 }
    : { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 28, edges: 14, vertices: 8 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, check.counts.faces);
  const volume = Math.PI * (radius ** 2 - boreRadius ** 2) * totalLength, mass = massPropertiesOf(output);
  assert.equal(mass.method, 'closed-form');
  near(mass.volume, volume, 1e-10 * volume);
  near(brepMassProperties(brep, 1).volume, volume, 1e-8 * volume);
  verifyEnvelope(brep, path, radius);

  const caps = brep.faces.map(face => ({ face, plane: faceGeometry(face) })).filter(({ plane }) => plane.kind === 'plane');
  assert.deepEqual(caps.map(({ face }) => face.name).sort(), ['w.end', 'w.start']);
  for (const { face, plane } of caps) {
    const start = face.name === 'w.start', center = start ? first.start : second.end;
    const normal = start ? scale(first.tangent, -1) : second.atExit;
    pointNear(plane.n, normal);
    near(dot(sub(plane.o, center), normal), 0);
    const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), boreRadius ? ['inner', 'outer'] : ['outer']);
    for (const loop of loops) {
      const uses = brep.coedges.filter(use => use.loop === loop.id);
      assert.equal(uses.length, 2);
      for (const use of uses) {
        sampleSection(brep.edges.find(edge => edge.id === use.edge).curve, center, normal, loop.kind === 'inner' ? boreRadius : radius);
        const wallUse = brep.coedges.find(candidate => candidate.id === use.twin);
        const wall = brep.faces.find(candidate => candidate.loops.includes(wallUse.loop));
        assert.equal(boreWall(wall.name), loop.kind === 'inner');
      }
    }
  }

  for (const [label, support] of [['first', first], ['second', second], ['line', undefined]]) {
    const faces = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(faces.filter(face => !boreWall(face.name)).length, 2);
    assert.equal(faces.filter(face => boreWall(face.name)).length, boreRadius ? 2 : 0);
    for (const face of faces) {
      const inner = boreWall(face.name), wallRadius = inner ? boreRadius : radius;
      const { u, v } = surfaceDomain(face.surface);
      for (const s of [.17, .43, .83]) for (const t of [.24, .69]) {
        const d1 = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        let fromRail;
        if (support) {
          const p = sub(d1.point, support.center);
          const radial = unit(sub(p, scale(support.axis, dot(p, support.axis))));
          fromRail = sub(p, scale(radial, support.radius));
        } else {
          const p = sub(d1.point, first.end), station = dot(p, direction);
          assert.ok(station > 0 && station < path.length);
          fromRail = sub(p, scale(direction, station));
          assert.equal(faceGeometry(face).kind, 'cylinder');
        }
        near(norm(fromRail), wallRadius);
        const normal = scale(unit(cross(d1.du, d1.dv)), face.sense === 'forward' ? 1 : -1);
        pointNear(normal, scale(unit(fromRail), inner ? -1 : 1));
      }
    }
  }

  const jointIds = [];
  for (const [label, center, bend] of [['first', first.end, first], ['second', second.start, second]]) {
    const seams = brep.edges.filter(edge => edge.name?.includes(`w.${label}.`) && edge.name.includes('w.line.'));
    assert.equal(seams.filter(edge => !boreWall(edge.name)).length, 2);
    assert.equal(seams.filter(edge => boreWall(edge.name)).length, boreRadius ? 2 : 0);
    for (const edge of seams) {
      const inner = boreWall(edge.name), wallRadius = inner ? boreRadius : radius;
      jointIds.push(edge.id);
      assert.equal(edge.curve.degree, 2);
      assert.equal(edge.curve.controlPoints.length, 5);
      for (const [index, expected] of [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].entries())
        near(edge.curve.weights[index], expected, 4 * Number.EPSILON);
      sampleSection(edge.curve, center, direction, wallRadius);
      const uses = brep.coedges.filter(use => use.edge === edge.id);
      assert.equal(uses.length, 2);
      for (const [index, use] of uses.entries()) {
        assert.equal(use.twin, uses[1 - index].id);
        assert.notEqual(use.sense, uses[1 - index].sense);
        assert.ok(use.pcurve, `${edge.name}: missing native pcurve`);
        const domain = curveDomain(edge.curve), face = brep.faces.find(face => face.loops.includes(use.loop));
        assert.equal(boreWall(face.name), inner);
        assert.deepEqual(curveDomain(use.pcurve), domain);
        for (const fraction of [0, .19, .5, .87, 1]) {
          const t = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, t);
          pointNear(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, t));
        }
      }
      const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
      assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
      near(continuity.maximumAngleDegrees, 0);
      assert.equal(continuity.curvature.status, 'measured');
      assert.ok(continuity.curvature.maximumDifference > 1e-5);
      for (const sample of continuity.curvature.samples) {
        const inward = dot(sub(evaluateCurve(edge.curve, sample.parameter), center), label === 'first' ? first.exitInward : second.inward);
        const bendCurvature = (inner ? -1 : 1) * inward / (wallRadius * (bend.radius - inward));
        const expected = face => face.name.startsWith('w.line.') ? 0 : bendCurvature;
        near(sample.first, expected(continuity.faces[0]));
        near(sample.second, expected(continuity.faces[1]));
        near(sample.difference, Math.abs(bendCurvature));
      }
    }
  }
  assert.equal(new Set(jointIds).size, boreRadius ? 8 : 4);
  return mass;
}

test('Direct composite arc-line-arc keeps four native tangent joins through diameter edit and reopen', () => {
  const path = rail(), { curve } = path;
  assert.deepEqual(curve.controlPoints, [[0, 0, 0], [0, 12, 0], [12, 12, 0], [16, 12, 0], [20, 12, 0], [38, 12, 0], [38, 30, 0]]);
  assert.deepEqual(curve.knots, [0, 0, 0, 1, 1, 2, 2, 3, 3, 3]);
  assert.deepEqual(curve.weights, [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1]);
  // Direct geometry uses this compiler before copying the same raw path fields into the sweep feature.
  const compiled = compileCadModel(`@model rail { version: 0; length-unit: mm; @curve #path { type: nurbs; degree: 2;
    knots: ${JSON.stringify(curve.knots)}; control-points: ${JSON.stringify(curve.controlPoints)}; weights: ${JSON.stringify(curve.weights)}; } }`, { sourceVersion: 0 });
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  const decoded = compiled.model.objects.find(object => object.id === 'path');
  assert.deepEqual(pathOf(decoded), pathOf(curve));
  near(path.totalLength, 15 * Math.PI + 8);
  const snapshot = evaluateCadPart(document(decoded)), initial = verify(snapshot.outputs[0], path, 2);
  const edited = reevaluate(snapshot, { document: document(decoded, { ...disk, radius: 3 }) });
  const larger = verify(edited.outputs[0], path, 3);
  near(larger.volume / initial.volume, 9 / 4);
  assert.deepEqual(edited.outputs[0].brep.edges.map(edge => [edge.id, edge.name]), snapshot.outputs[0].brep.edges.map(edge => [edge.id, edge.name]));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
});

test('translated oblique 120° and 30° arcs keep the intervening line and independent mass near the bend axis', () => {
  const path = rail({ firstAngle: 120, secondAngle: 30, firstRadius: 10, secondRadius: 23, length: 4,
    start: [40, -30, 7], tangent: [.6, .8, 0], inward: [0, 0, 1] });
  verify(evaluateCadPart(document(path.curve, { ...disk, radius: 8 })).outputs[0], path, 8);
});

test('arc-line-arc refuses unsupported carriers, kinks, reversals, short lines, axis contact and other sections', () => {
  const { curve } = rail();
  const refused = (path, code, detail, section = disk, mode = 'exact') => assert.throws(() => evaluateCadPart(document(path, section, mode)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  refused(rail({ lineTangent: [0, 1, 0] }).curve, 'GEOMETRY', /common forward tangent at both joins/);
  refused(rail({ secondTangent: [0, 1, 0], secondInward: [1, 0, 0] }).curve, 'GEOMETRY', /common forward tangent at both joins/);
  refused(rail({ length: -8 }).curve, 'GEOMETRY', /common forward tangent at both joins/);
  refused(rail({ secondTangent: [-1, 0, 0] }).curve, 'GEOMETRY', /common forward tangent at both joins/);
  refused(rail({ secondInward: [0, 0, 1] }).curve, 'CAPABILITY', /two coplanar circular arcs separated/);
  refused(rail({ firstAngle: 29 }).curve, 'CAPABILITY', /two coplanar circular arcs/);
  refused(rail({ secondAngle: 121 }).curve, 'CAPABILITY', /two coplanar circular arcs/);
  refused(rail({ length: 0 }).curve, 'PARAMETER', /straight segment at least 0.0001 mm/);
  refused(rail({ length: .00001 }).curve, 'PARAMETER', /straight segment at least 0.0001 mm/);
  const bentLine = structuredClone(curve);
  bentLine.controlPoints[3][1] += .001;
  refused(bentLine, 'CAPABILITY', /two coplanar circular arcs/);
  refused({ ...curve, weights: [1, .7, 1, 1, 1, Math.SQRT1_2, 1] }, 'CAPABILITY', /two coplanar circular arcs/);
  refused({ ...curve, weights: [1, Math.SQRT1_2, 1, 1.01, 1, Math.SQRT1_2, 1] }, 'CAPABILITY', /one open circular arc from 30° to 120°/);
  refused({ ...curve, knots: [0, 0, 0, 1, 1.1, 2, 2, 3, 3, 3] }, 'CAPABILITY', /two coplanar circular arcs/);
  for (const [firstRadius, secondRadius] of [[2, 18], [12, 2], [1, 18], [12, 1]])
    refused(rail({ firstRadius, secondRadius }).curve, 'PARAMETER', /both path radii larger than the profile radius/);
  refused(curve, 'CAPABILITY', /one circular outer section/, { id: 's', kind: 'sketch', profile: 'rectangle', min: [-1, -1], max: [1, 1] });
  refused(curve, 'CAPABILITY', /one open straight segment/, disk, 'exact-straight');
});

test('same-turn quarter arcs and their straight span keep four native G1 seams, independent mass and edited reopen identity', () => {
  const path = rail({ sameTurn: true }), { curve } = path;
  assert.deepEqual(curve.controlPoints, [[0, 0, 0], [0, 12, 0], [12, 12, 0], [16, 12, 0], [20, 12, 0], [38, 12, 0], [38, -6, 0]]);
  const initial = evaluateCadPart(document(curve));
  const verifyDisk = (snapshot, radius) => {
    verify(snapshot.outputs[0], path, radius);
    checkIndependentCircularMass(snapshot.outputs[0], path, radius);
  };
  verifyDisk(initial, 2);
  const edited = reevaluate(initial, { document: document(curve, { ...disk, radius: 3 }) });
  verifyDisk(edited, 3);
  assert.deepEqual(edited.outputs[0].brep.edges.map(edge => [edge.id, edge.name]), initial.outputs[0].brep.edges.map(edge => [edge.id, edge.name]));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  verifyDisk(reopened, 3);
  const restored = reevaluate(reopened, { document: document(curve) });
  assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
  // The opposite-turn disk uses the same independent straight-plus-sectors oracle.
  const opposite = rail();
  checkIndependentCircularMass(evaluateCadPart(document(opposite.curve)).outputs[0], opposite, 2);
});

for (const [firstAngle, secondAngle, firstRadius, secondRadius, length] of [
  [30, 120, 23, 10, 8], [120, 30, 10, 23, 8], [120, 120, 23, 10, 8], [90, 90, 12, 12, .00011],
]) {
  test(`oblique same-turn ${firstAngle}°/${secondAngle}° R${firstRadius}/R${secondRadius} with ${length} mm line stays within disjoint native envelopes`, () => {
    const path = rail({ firstAngle, secondAngle, firstRadius, secondRadius, length, sameTurn: true,
      start: [40, -30, 7], tangent: [.6, .8, 0], inward: [0, 0, 1] });
    const output = evaluateCadPart(document(path.curve, { ...disk, radius: 8 })).outputs[0];
    verify(output, path, 8);
    checkIndependentCircularMass(output, path, 8);
  });
}

test('same-turn arc-line-arc refuses other sections, kinks, noncoplanarity, axis contact and unsupported carriers', () => {
  const refused = (options, code, detail, section = disk) => assert.throws(() => evaluateCadPart(document(rail({ sameTurn: true, ...options }).curve, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  refused({}, 'CAPABILITY', /one circular outer section/, { id: 's', kind: 'sketch', profile: 'polygon',
    points: [[-1, -1], [1, -1], [0, 1]] });
  refused({ lineTangent: [0, 1, 0] }, 'GEOMETRY', /common forward tangent at both joins/);
  refused({ secondTangent: [-1, 0, 0] }, 'GEOMETRY', /common forward tangent at both joins/);
  refused({ secondInward: [0, 0, 1] }, 'CAPABILITY', /two coplanar circular arcs separated/);
  refused({ length: -8 }, 'GEOMETRY', /common forward tangent at both joins/);
  refused({ length: .00001 }, 'PARAMETER', /straight segment at least 0.0001 mm/);
  for (const [firstRadius, secondRadius] of [[2, 18], [12, 2], [1, 18], [12, 1]])
    refused({ firstRadius, secondRadius }, 'PARAMETER', /both path radii larger than the profile radius/);
  refused({ firstAngle: 29 }, 'CAPABILITY', /two coplanar circular arcs/);
  refused({ secondAngle: 121 }, 'CAPABILITY', /two coplanar circular arcs/);
});

test('same-turn quarter arcs and their straight span preserve a concentric through bore, independent annulus mass and edited native charts', () => {
  const path = rail({ sameTurn: true }), initial = evaluateCadPart(document(path.curve, boreSection(1)));
  const verifyAnnulus = (snapshot, boreRadius) => {
    verify(snapshot.outputs[0], path, 2, boreRadius);
    checkIndependentCircularMass(snapshot.outputs[0], path, 2, boreRadius);
  };
  verifyAnnulus(initial, 1);
  const edited = reevaluate(initial, { document: document(path.curve, boreSection(1.5)) });
  verifyAnnulus(edited, 1.5);
  near(massPropertiesOf(edited.outputs[0]).volume / massPropertiesOf(initial.outputs[0]).volume, 7 / 12);
  const identity = snapshot => Object.fromEntries(['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices']
    .map(kind => [kind, snapshot.outputs[0].brep[kind].map(({ id, name }) => [id, name])]));
  assert.deepEqual(identity(edited), identity(initial));
  const outerCharts = snapshot => {
    const { brep } = snapshot.outputs[0], faces = brep.faces.filter(face => face.name.includes('.side[rim]'));
    const loopIds = new Set(faces.flatMap(face => face.loops));
    const coedges = brep.coedges.filter(use => loopIds.has(use.loop)), edgeIds = new Set(coedges.map(use => use.edge));
    const edges = brep.edges.filter(edge => edgeIds.has(edge.id)), vertexIds = new Set(edges.flatMap(edge => edge.vertices));
    return { faces, loops: brep.loops.filter(loop => loopIds.has(loop.id)), coedges, edges,
      vertices: brep.vertices.filter(vertex => vertexIds.has(vertex.id)) };
  };
  assert.deepEqual(outerCharts(edited), outerCharts(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  verifyAnnulus(reopened, 1.5);
  const restored = reevaluate(reopened, { document: document(path.curve, boreSection(1)) });
  assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
  verifyAnnulus(restored, 1);
});

for (const [firstAngle, secondAngle, firstRadius, secondRadius, length] of [
  [30, 120, 23, 10, 8], [120, 30, 10, 23, 8], [120, 120, 23, 10, 8], [90, 90, 12, 12, .00011],
]) {
  test(`oblique same-turn annulus ${firstAngle}°/${secondAngle}° R${firstRadius}/R${secondRadius} with ${length} mm line keeps its clockwise bore`, () => {
    const path = rail({ firstAngle, secondAngle, firstRadius, secondRadius, length, sameTurn: true,
      start: [40, -30, 7], tangent: [.6, .8, 0], inward: [0, 0, 1] });
    const section = { ...boreSection(1.5, disk.center, [.6, .8], 'cw'), radius: 8, sideTags: undefined };
    const output = evaluateCadPart(document(path.curve, section)).outputs[0];
    verify(output, path, 8, 1.5);
    checkIndependentCircularMass(output, path, 8, 1.5);
  });
}

test('same-turn annulus still refuses kinks, reversal, noncoplanarity and unsupported carriers', () => {
  const refused = (options, code, detail) => assert.throws(() => evaluateCadPart(document(rail({ sameTurn: true, ...options }).curve, boreSection(1))),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  refused({ lineTangent: [0, 1, 0] }, 'GEOMETRY', /common forward tangent at both joins/);
  refused({ secondTangent: [-1, 0, 0] }, 'GEOMETRY', /common forward tangent at both joins/);
  refused({ secondInward: [0, 0, 1] }, 'CAPABILITY', /two coplanar circular arcs separated/);
  refused({ length: -8 }, 'GEOMETRY', /common forward tangent at both joins/);
  refused({ length: .00001 }, 'PARAMETER', /straight segment at least 0.0001 mm/);
  refused({ firstAngle: 29 }, 'CAPABILITY', /two coplanar circular arcs/);
  refused({ firstAngle: 121 }, 'CAPABILITY', /two coplanar circular arcs/);
  refused({ secondAngle: 29 }, 'CAPABILITY', /two coplanar circular arcs/);
  refused({ secondAngle: 121 }, 'CAPABILITY', /two coplanar circular arcs/);
});

test('the spaced S-bend preserves an exact through bore, eight tangent seams and edited reopen identity', () => {
  const path = rail(), initial = evaluateCadPart(document(path.curve, boreSection(1)));
  const firstMass = verify(initial.outputs[0], path, 2, 1);
  const edited = reevaluate(initial, { document: document(path.curve, boreSection(1.5)) });
  const editedMass = verify(edited.outputs[0], path, 2, 1.5);
  checkIndependentCircularMass(initial.outputs[0], path, 2, 1);
  checkIndependentCircularMass(edited.outputs[0], path, 2, 1.5);
  near(editedMass.volume / firstMass.volume, 7 / 12);
  const outerWalls = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name.includes('.side[rim]'));
  assert.deepEqual(outerWalls(edited), outerWalls(initial));
  const edgeIdentity = snapshot => snapshot.outputs[0].brep.edges.map(edge => [edge.id, edge.name]);
  assert.deepEqual(edgeIdentity(edited), edgeIdentity(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  verify(reopened.outputs[0], path, 2, 1.5);
  const restored = reevaluate(reopened, { document: document(path.curve, boreSection(1)) });
  assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
});

test('an oblique spaced S-bend preserves an untagged clockwise bore with an authored seam phase', () => {
  const path = rail({ firstAngle: 120, secondAngle: 30, firstRadius: 10, secondRadius: 23, length: 4,
    start: [40, -30, 7], tangent: [.6, .8, 0], inward: [0, 0, 1] });
  const section = { ...boreSection(1.5, disk.center, [.6, .8], 'cw'), radius: 8, sideTags: undefined };
  verify(evaluateCadPart(document(path.curve, section)).outputs[0], path, 8, 1.5);
});

for (const sameTurn of [false, true]) test(`the ${sameTurn ? 'same-turn' : 'opposite-turn'} spaced annulus enforces concentricity and native wall clearance without admitting other sections`, () => {
  const path = rail({ sameTurn }), refused = (section, code, detail) => assert.throws(() => evaluateCadPart(document(path.curve, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  refused(boreSection(1, [8.25, -4]), 'GEOMETRY', /bore concentric/);
  for (const radius of [2 - 5e-7, 2, 2.1]) refused(boreSection(radius), 'GEOMETRY', /strictly positive wall clearance/);
  refused(boreSection(.005), 'PARAMETER', /hole radius of at least 0.01/);
  for (const [firstRadius, secondRadius] of [[2, 18], [12, 2]])
    assert.throws(() => evaluateCadPart(document(rail({ firstRadius, secondRadius, sameTurn }).curve, boreSection(1))),
      error => error instanceof CadPartError && error.feature === 'w' && error.code === 'PARAMETER' && /both path radii larger/.test(error.message));
  const twoHoles = [...boreSection(.2, [8.5, -4]).holes, ...boreSection(.2, [7.5, -4]).holes];
  refused({ ...disk, holes: twoHoles, sideTags: undefined }, 'CAPABILITY', /at most one circular hole/);
  const rectangle = [[7.5, -4.5], [8.5, -4.5], [8.5, -3.5], [7.5, -3.5]].map(start => ({ kind: 'line', start }));
  refused({ ...disk, holes: [rectangle], sideTags: undefined }, 'CAPABILITY', /at most one circular hole/);
  verify(evaluateCadPart(document(path.curve, boreSection(2 - 5e-6))).outputs[0], path, 2, 2 - 5e-6);
  // Above 10 * the basic tolerance, but inside the native gluer's matching margin and placement roundoff.
  const jointGap = 1e-6 + 2e-13;
  assert.ok(2 - (2 - jointGap) > 1e-6);
  refused(boreSection(2 - jointGap), 'GEOMETRY', /strictly positive wall clearance around the bore/);
});
