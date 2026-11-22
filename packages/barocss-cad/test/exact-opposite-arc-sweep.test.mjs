import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry, joinCurves,
  loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart, surfaceDomain,
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
const pointNear = (a, b) => near(norm(sub(a, b)), 0);

const circle = { id: 's', kind: 'sketch', profile: 'circle', center: [8, -4], radius: 2, sideTags: { outer: ['rim'] } };
const boreSection = (r, center = circle.center, phase = [1, 0], direction = 'ccw') => ({
  ...circle, sideTags: { outer: ['rim'], holes: [['bore']] },
  holes: [[{ kind: 'arc', center, start: add(center, scale(phase, r)), direction }]],
});
const boreWall = name => name.includes('[bore]') || name.includes('.hole0.side');
const pathOf = ({ degree, knots, controlPoints, weights }) => ({ degree, knots, controlPoints, weights });
const document = (path, section = circle, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [section, { id: 'w', kind: 'sweep-curve', sketch: 's', mode, path: pathOf(path) }],
});

function arc(id, start, tangent, inward, radius, degrees) {
  const angle = degrees * Math.PI / 180, c = degrees === 90 ? 0 : Math.cos(angle), s = Math.sin(angle);
  const end = add(start, scale(add(scale(tangent, s), scale(inward, 1 - c)), radius));
  const atExit = add(scale(tangent, c), scale(inward, s));
  const exitInward = add(scale(inward, c), scale(tangent, -s));
  const control = add(start, scale(tangent, degrees === 90 ? radius : radius * Math.tan(angle / 2)));
  return { start, tangent, end, atExit, exitInward, radius, angle, length: radius * angle, axis: cross(tangent, inward),
    center: add(start, scale(inward, radius)),
    curve: { kind: 'curve', id, degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [start, control, end],
      weights: [1, Math.cos(angle / 2), 1] } };
}

function pair({ a = 90, b = 90, R1 = 12, R2 = 18, start = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0], turn = -1 } = {}) {
  const first = arc('first', start, tangent, inward, R1, a);
  const second = arc('second', first.end, first.atExit, scale(first.exitInward, turn), R2, b);
  const curve = joinCurves(first.curve, second.curve, { curveId: turn === 1 ? 'sameTurnArcs' : 'oppositeArcs' }).curve;
  return { first, second, curve };
}

function sampleRim(curve, center, normal, radius) {
  const [lo, hi] = curveDomain(curve);
  for (const fraction of [0, .27, .59, .84, 1]) {
    const p = sub(evaluateCurve(curve, lo + (hi - lo) * fraction), center);
    near(dot(p, normal), 0);
    near(norm(p), radius);
  }
}

function verify(output, first, second, r, boreRadius = 0) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology.length, 1);
  assert.equal(check.topology[0].genus, boreRadius ? 1 : 0);
  assert.deepEqual(check.counts, boreRadius
    ? { bodies: 1, shells: 1, faces: 10, loops: 12, coedges: 40, edges: 20, vertices: 12 }
    : { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 20, edges: 10, vertices: 6 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, check.counts.faces);
  const mass = massPropertiesOf(output), volume = Math.PI * (r ** 2 - boreRadius ** 2) * (first.length + second.length);
  assert.equal(mass.method, 'closed-form');
  near(mass.volume, volume, 1e-10 * volume);
  near(brepMassProperties(brep, 1).volume, volume, 1e-8 * volume);

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
      const rim = brep.coedges.filter(use => use.loop === loop.id);
      assert.equal(rim.length, 2);
      for (const use of rim) {
        const edge = brep.edges.find(candidate => candidate.id === use.edge);
        sampleRim(edge.curve, center, normal, loop.kind === 'inner' ? boreRadius : r);
        const wallUse = brep.coedges.find(candidate => candidate.id === use.twin);
        const wall = brep.faces.find(candidate => candidate.loops.includes(wallUse.loop));
        assert.equal(boreWall(wall.name), loop.kind === 'inner');
      }
    }
  }

  for (const [label, original] of [['first', first], ['second', second]]) {
    const faces = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(faces.filter(face => !boreWall(face.name)).length, 2);
    assert.equal(faces.filter(face => boreWall(face.name)).length, boreRadius ? 2 : 0);
    for (const face of faces) {
      const inner = boreWall(face.name), radius = inner ? boreRadius : r;
      const { u, v } = surfaceDomain(face.surface);
      for (const s of [.17, .43, .83]) for (const t of [.24, .69]) {
        const d1 = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        const p = sub(d1.point, original.center);
        const radial = unit(sub(p, scale(original.axis, dot(p, original.axis))));
        const fromCircle = sub(p, scale(radial, original.radius));
        near(norm(fromCircle), radius);
        const materialNormal = scale(unit(fromCircle), inner ? -1 : 1);
        pointNear(scale(unit(cross(d1.du, d1.dv)), face.sense === 'forward' ? 1 : -1), materialNormal);
      }
    }
  }

  const seams = brep.edges.filter(edge => edge.name.includes('w.first.') && edge.name.includes('w.second.'));
  assert.equal(seams.filter(edge => !boreWall(edge.name)).length, 2);
  assert.equal(seams.filter(edge => boreWall(edge.name)).length, boreRadius ? 2 : 0);
  for (const edge of seams) {
    const inner = boreWall(edge.name), radius = inner ? boreRadius : r;
    assert.equal(edge.curve.degree, 2);
    assert.equal(edge.curve.controlPoints.length, 5);
    assert.deepEqual(edge.curve.weights, [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1]);
    sampleRim(edge.curve, first.end, first.atExit, radius);
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(uses.length, 2);
    for (const [index, use] of uses.entries()) {
      assert.equal(use.twin, uses[1 - index].id);
      assert.notEqual(use.sense, uses[1 - index].sense);
      assert.ok(use.pcurve, `${edge.name}: missing native pcurve`);
      const domain = curveDomain(edge.curve);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
      for (const fraction of [0, .19, .5, .87, 1]) {
        const t = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, t);
        pointNear(evaluateSurface(surface, u, v), evaluateCurve(edge.curve, t));
      }
    }
    const report = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(report.status, 'measured', JSON.stringify(report));
    near(report.maximumAngleDegrees, 0);
    assert.equal(report.curvature.status, 'measured');
    assert.ok(report.curvature.maximumDifference > 1e-5);
    assert.ok(report.faces.every(face => boreWall(face.name) === inner));
    for (const sample of report.curvature.samples) {
      const inward = dot(sub(evaluateCurve(edge.curve, sample.parameter), first.end), first.exitInward);
      // The longitudinal curvature of each torus is the radial normal component divided by its local orbit radius.
      const outward = inner ? -1 : 1;
      const firstCurvature = outward * inward / (radius * (first.radius - inward));
      const turn = Math.sign(dot(first.exitInward, second.center.map((x, i) => x - first.end[i])));
      const secondCurvature = turn * outward * inward / (radius * (second.radius - turn * inward));
      const expected = face => face.name.startsWith('w.first.') ? firstCurvature : secondCurvature;
      near(sample.first, expected(report.faces[0]));
      near(sample.second, expected(report.faces[1]));
      near(sample.difference, Math.abs(firstCurvature - secondCurvature));
      if (turn === 1 && Math.abs(inward) > 1e-5) assert.ok(sample.first * sample.second > 0);
    }
  }
  return mass;
}

test('joined authored arcs sweep an exact solid and retain both supports through a diameter edit and reopen', () => {
  const { first, second, curve } = pair();
  assert.deepEqual(curve.controlPoints, [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [30, 30, 0]]);
  assert.deepEqual(curve.knots, [0, 0, 0, 1, 1, 2, 2, 2]);
  const snapshot = evaluateCadPart(document(curve));
  verify(snapshot.outputs[0], first, second, 2);
  const edited = reevaluate(snapshot, { document: document(curve, { ...circle, radius: 3 }) });
  verify(edited.outputs[0], first, second, 3);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
});

test('the join plane also separates a translated oblique 120° and 30° pair close to the bend axis', () => {
  const { first, second, curve } = pair({ a: 120, b: 30, R1: 10, R2: 23, start: [40, -30, 7], tangent: [.6, .8, 0], inward: [0, 0, 1] });
  const section = { ...circle, radius: 8 };
  verify(evaluateCadPart(document(curve, section)).outputs[0], first, second, 8);
});

test('exact two-arc sweep refuses a kink, reversal, nonplanarity and axis contact', () => {
  const { first, curve } = pair();
  const refused = (rail, code, detail, section, mode) => assert.throws(() => evaluateCadPart(document(rail, section, mode)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  const joinedWith = (tangent, inward) => joinCurves(first.curve, arc('changed', first.end, tangent, inward, 18, 90).curve,
    { curveId: 'changedPair' }).curve;
  refused(joinedWith([1, 0, 0], [0, 1, 0]), 'GEOMETRY', /common forward tangent/);
  refused(joinedWith(scale(first.atExit, -1), [1, 0, 0]), 'GEOMETRY', /common forward tangent/);
  refused(joinedWith(first.atExit, [0, 0, 1]), 'CAPABILITY', /two coplanar circular arcs/);
  refused(pair({ a: 29 }).curve, 'CAPABILITY', /30° to 120°/);
  refused(pair({ b: 121 }).curve, 'CAPABILITY', /30° to 120°/);
  refused({ ...curve, knots: [0, 0, 0, 1, 1.1, 2, 2, 2] }, 'CAPABILITY', /30° to 120°/);
  for (const radius of [12, 13]) refused(curve, 'PARAMETER', /both path radii larger/, { ...circle, radius });
  refused(curve, 'CAPABILITY', /one circular outer section or one bend-aligned rectangular section/,
    { id: 's', kind: 'sketch', profile: 'polygon', points: [[0, 0], [3, 0], [0, 2]] });
  refused(curve, 'CAPABILITY', /one open straight segment/, circle, 'exact-straight');
});

test('two joined spans of the same circle still use the one-arc sweep', () => {
  const a = arc('a', [0, 0, 0], [1, 0, 0], [0, 1, 0], 12, 45);
  const b = arc('b', a.end, a.atExit, a.exitInward, 12, 45);
  const rail = joinCurves(a.curve, b.curve, { curveId: 'sameCircle' }).curve;
  const [out] = evaluateCadPart(document(rail)).outputs;
  assert.ok(checkBrep(out.brep, { strict: true }).valid);
  assert.equal(out.brep.faces.length, 4);
  near(massPropertiesOf(out).volume, Math.PI * 4 * (a.length + b.length));
});

test('the concentric bore keeps annular end caps, both wall families and stable joints across ID edits and reopen', () => {
  const { first, second, curve } = pair();
  const initial = evaluateCadPart(document(curve, boreSection(1)));
  verify(initial.outputs[0], first, second, 2, 1);
  const edited = reevaluate(initial, { document: document(curve, boreSection(1.5)) });
  verify(edited.outputs[0], first, second, 2, 1.5);
  const outerWalls = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name.includes('.side[rim]'));
  assert.deepEqual(outerWalls(edited), outerWalls(initial));
  const edgeNames = snapshot => snapshot.outputs[0].brep.edges.map(edge => edge.name);
  assert.deepEqual(edgeNames(edited), edgeNames(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  const replayed = reevaluate(reopened, { document: document(curve, boreSection(1)) });
  assert.deepEqual(replayed.outputs[0].brep, initial.outputs[0].brep);
});

test('an oblique exact S-bend preserves an untagged clockwise concentric opening', () => {
  const { first, second, curve } = pair({ a: 120, b: 30, R1: 10, R2: 23, start: [40, -30, 7], tangent: [.6, .8, 0], inward: [0, 0, 1] });
  const section = { ...boreSection(1.5, circle.center, [.6, .8], 'cw'), sideTags: undefined };
  verify(evaluateCadPart(document(curve, section)).outputs[0], first, second, 2, 1.5);
});

test('the exact S-bend refuses an eccentric bore, thin or touching rim, two bores and axis contact', () => {
  const { curve } = pair();
  const refused = (section, code, detail) => assert.throws(() => evaluateCadPart(document(curve, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  refused(boreSection(1, [8.25, -4]), 'GEOMETRY', /bore concentric/);
  for (const r of [2 - 5e-7, 2, 2.1]) refused(boreSection(r), 'GEOMETRY', /strictly positive wall clearance/);
  refused(boreSection(.005), 'PARAMETER', /hole radius of at least 0.01/);
  refused({ ...boreSection(1), radius: 12 }, 'PARAMETER', /both path radii larger/);
  const twoHoles = [...boreSection(.2, [8.5, -4]).holes, ...boreSection(.2, [7.5, -4]).holes];
  refused({ ...circle, holes: twoHoles, sideTags: undefined }, 'CAPABILITY', /at most one circular hole/);
});


// Independent circular-section integration in centerline coordinates: dV = (1 - u/R) du dv ds.
// A disk or annulus has mean u² = mean v² = (outer² + inner²)/4. No native revolve or surface integral is used.
function circularSectionIntegralMass(arcs, radius, boreRadius, density) {
  const area = Math.PI * (radius ** 2 - boreRadius ** 2);
  const volume = area * arcs.reduce((sum, arc) => sum + arc.length, 0);
  const first = [0, 0, 0], second = Array.from({ length: 3 }, () => [0, 0, 0]);
  const q = (radius ** 2 + boreRadius ** 2) / 4, steps = 1024;
  for (const arc of arcs) {
    const inward = unit(sub(arc.center, arc.start)), binormal = unit(arc.axis);
    for (let station = 0; station <= steps; station++) {
      const theta = arc.angle * station / steps, c = Math.cos(theta), s = Math.sin(theta);
      const n = add(scale(inward, c), scale(arc.tangent, -s));
      const point = sub(arc.center, scale(n, arc.radius));
      const weight = area * arc.length / (3 * steps) * (station === 0 || station === steps ? 1 : station % 2 ? 4 : 2);
      for (let i = 0; i < 3; i++) {
        first[i] += weight * (point[i] - q * n[i] / arc.radius);
        for (let j = 0; j < 3; j++) second[i][j] += weight * (point[i] * point[j]
          + q * (n[i] * n[j] + binormal[i] * binormal[j])
          - q / arc.radius * (point[i] * n[j] + n[i] * point[j]));
      }
    }
  }
  const centroid = scale(first, 1 / volume), mass = density * .001 * volume;
  const central = second.map((row, i) => row.map((entry, j) => entry - volume * centroid[i] * centroid[j]));
  const trace = central[0][0] + central[1][1] + central[2][2];
  const inertia = central.map((row, i) => row.map((entry, j) => density * .001 * ((i === j ? trace : 0) - entry)));
  return { volume, centroid, mass, inertia };
}

function checkIndependentCircularMass(output, first, second, radius, boreRadius = 0) {
  const density = 7.85, expected = circularSectionIntegralMass([first, second], radius, boreRadius, density);
  const native = brepMassProperties(output.brep, density);
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

test('unequal same-turn quarter arcs keep native tangent seams, both caps, independent mass and edit/reopen identity', () => {
  const { first, second, curve } = pair({ turn: 1 });
  assert.deepEqual(curve.controlPoints, [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [-6, 30, 0]]);
  const initial = evaluateCadPart(document(curve));
  const verifyDisk = (snapshot, radius) => {
    verify(snapshot.outputs[0], first, second, radius);
    checkIndependentCircularMass(snapshot.outputs[0], first, second, radius);
  };
  verifyDisk(initial, 2);
  const edited = reevaluate(initial, { document: document(curve, { ...circle, radius: 3 }) });
  verifyDisk(edited, 3);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  const restored = reevaluate(reopened, { document: document(curve) });
  assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
});

for (const [a, b, R1, R2] of [[30, 120, 23, 10], [120, 30, 10, 23], [120, 120, 23, 10]]) {
  test(`oblique same-turn ${a}°/${b}° unequal carriers retain a strict disk solid near the smaller bend axis`, () => {
    const { first, second, curve } = pair({ a, b, R1, R2, turn: 1,
      start: [40, -30, 7], tangent: [.6, .8, 0], inward: [0, 0, 1] });
    const output = evaluateCadPart(document(curve, { ...circle, radius: 8 })).outputs[0];
    verify(output, first, second, 8);
    checkIndependentCircularMass(output, first, second, 8);
  });
}

test('unequal same-turn quarter arcs preserve one concentric bore, independent annulus mass and exact edited reopen', () => {
  const { first, second, curve } = pair({ turn: 1 });
  assert.deepEqual(curve.controlPoints, [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [-6, 30, 0]]);
  const initial = evaluateCadPart(document(curve, boreSection(1)));
  const verifyAnnulus = (snapshot, boreRadius) => {
    verify(snapshot.outputs[0], first, second, 2, boreRadius);
    checkIndependentCircularMass(snapshot.outputs[0], first, second, 2, boreRadius);
  };
  verifyAnnulus(initial, 1);
  const edited = reevaluate(initial, { document: document(curve, boreSection(1.5)) });
  verifyAnnulus(edited, 1.5);
  const outerWalls = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name.includes('.side[rim]'));
  assert.deepEqual(outerWalls(edited), outerWalls(initial));
  const edgeNames = snapshot => snapshot.outputs[0].brep.edges.map(edge => edge.name);
  assert.deepEqual(edgeNames(edited), edgeNames(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  const restored = reevaluate(reopened, { document: document(curve, boreSection(1)) });
  assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
});

for (const [a, b, R1, R2] of [[30, 120, 23, 10], [120, 30, 10, 23], [120, 120, 23, 10]]) {
  test(`oblique same-turn ${a}°/${b}° unequal carriers preserve a clockwise bore near the smaller bend axis`, () => {
    const { first, second, curve } = pair({ a, b, R1, R2, turn: 1,
      start: [40, -30, 7], tangent: [.6, .8, 0], inward: [0, 0, 1] });
    const section = { ...boreSection(1.5, circle.center, [.6, .8], 'cw'), radius: 8, sideTags: undefined };
    const output = evaluateCadPart(document(curve, section)).outputs[0];
    verify(output, first, second, 8, 1.5);
    checkIndependentCircularMass(output, first, second, 8, 1.5);
  });
}

test('the same-turn annulus admits a safe thin wall and refuses a wall inside the native joint matching margin', () => {
  const { first, second, curve } = pair({ turn: 1 });
  const withGap = gap => boreSection(2 - gap);
  verify(evaluateCadPart(document(curve, withGap(5e-6))).outputs[0], first, second, 2, 2 - 5e-6);
  // Above the basic 10 * 1e-7 mm margin, but inside the native gluer's matching tolerance plus placement roundoff.
  const jointGap = 1e-6 + 2e-13;
  assert.ok(2 - (2 - jointGap) > 1e-6);
  assert.throws(() => evaluateCadPart(document(curve, withGap(jointGap))), error => error instanceof CadPartError
    && error.feature === 'w' && error.code === 'GEOMETRY' && /strictly positive wall clearance around the bore/.test(error.message));
});

test('same-turn pair refuses eccentric, thin, touching, multiple and noncircular bores', () => {
  const { curve } = pair({ turn: 1 });
  const refused = (section, code, detail) => assert.throws(() => evaluateCadPart(document(curve, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  refused(boreSection(1, [8.25, -4]), 'GEOMETRY', /bore concentric/);
  for (const radius of [2 - 5e-7, 2, 2.1]) refused(boreSection(radius), 'GEOMETRY', /strictly positive wall clearance/);
  refused(boreSection(.005), 'PARAMETER', /hole radius of at least 0.01/);
  for (const [R1, R2] of [[12, 18], [18, 12]]) {
    assert.throws(() => evaluateCadPart(document(pair({ R1, R2, turn: 1 }).curve, { ...boreSection(1), radius: 12 })),
      error => error instanceof CadPartError && error.feature === 'w' && error.code === 'PARAMETER' && /both path radii larger/.test(error.message));
  }
  const twoHoles = [...boreSection(.2, [8.5, -4]).holes, ...boreSection(.2, [7.5, -4]).holes];
  refused({ ...circle, holes: twoHoles, sideTags: undefined }, 'CAPABILITY', /at most one circular hole/);
  const rectangle = [[7.5, -4.5], [8.5, -4.5], [8.5, -3.5], [7.5, -3.5]].map(start => ({ kind: 'line', start }));
  refused({ ...circle, holes: [rectangle], sideTags: undefined }, 'CAPABILITY', /at most one circular hole/);
});

test('same-turn pair refuses either axis contact, kink, reversal, nonplanarity and unsupported span angles', () => {
  const { first } = pair({ turn: 1 });
  const refused = (path, code, detail, section = circle) => assert.throws(() => evaluateCadPart(document(path, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  const joinedWith = (tangent, inward) => joinCurves(first.curve, arc('changed', first.end, tangent, inward, 18, 90).curve,
    { curveId: 'changedPair' }).curve;
  for (const [R1, R2] of [[12, 18], [18, 12]]) for (const radius of [12, 13])
    refused(pair({ R1, R2, turn: 1 }).curve, 'PARAMETER', /both path radii larger/, { ...circle, radius });
  refused(joinedWith([1, 0, 0], [0, 1, 0]), 'GEOMETRY', /common forward tangent/);
  refused(joinedWith(scale(first.atExit, -1), [-1, 0, 0]), 'GEOMETRY', /common forward tangent/);
  refused(joinedWith(first.atExit, [0, 0, 1]), 'CAPABILITY', /two coplanar circular arcs/);
  for (const angles of [{ a: 29 }, { b: 121 }]) refused(pair({ ...angles, turn: 1 }).curve, 'CAPABILITY', /30° to 120°/);
});

test('same-carrier angle limits and omitted-mode faceted Sweep keep the existing route', () => {
  const sameCarrier = pair({ a: 90, b: 90, R1: 12, R2: 12, turn: 1 }).curve;
  assert.throws(() => evaluateCadPart(document(sameCarrier)),
    error => error instanceof CadPartError && error.code === 'CAPABILITY' && /one open circular arc from 30° to 120°/.test(error.message));
  const facetedDocument = document(pair({ turn: 1 }).curve);
  delete facetedDocument.features[1].mode;
  const legacy = evaluateCadPart(facetedDocument).outputs[0];
  assert.deepEqual(legacy.brep.source, { family: 'mesh', id: 'w' });
  assert.ok(legacy.brep.faces.length > 6);
});
