import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry, joinCurves, loadCadPart,
  massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';
import { brepQuadratureIntegrals } from '../dist/brep/brep-mass-quadrature.js';
import { circleOf } from '../dist/brep/brep-tessellate.js';
import { locateInRegion } from '../dist/brep/curved-arrangement.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, n) => a.map(x => x * n);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const pointNear = (a, b) => near(norm(sub(a, b)), 0);

const disk = { id: 's', kind: 'sketch', profile: 'circle', center: [50, -30], radius: 2 };
const annulus = (radius = 1, center = disk.center, phase = [1, 0], direction = 'ccw') => ({ ...disk,
  holes: [[{ kind: 'arc', center, start: add(center, scale(phase, radius)), direction }]],
  sideTags: { outer: ['rim'], holes: [['bore']] },
});
const pathOf = ({ degree, knots, controlPoints, weights }) => ({ degree, knots, controlPoints, weights });
const document = (path, section = disk, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    section, { id: 'w', kind: 'sweep-curve', sketch: 's', path: pathOf(path), mode },
  ],
});

function quarters(radius = 20, center = [0, 0, 0], e0 = [1, 0, 0], e1 = [0, 1, 0]) {
  const cardinal = [e0, e1, scale(e0, -1), scale(e1, -1), e0];
  return cardinal.slice(0, -1).map((axis, i) => ({ kind: 'curve', id: `q${i}`, degree: 2,
    knots: [0, 0, 0, 1, 1, 1], controlPoints: [axis, add(axis, cardinal[i + 1]), cardinal[i + 1]].map(direction => add(center, scale(direction, radius))),
    weights: [1, Math.SQRT1_2, 1] }));
}

function joinedCircle(...args) {
  return quarters(...args).reduce((curve, quarter, i) => joinCurves(curve, quarter, { curveId: `join${i}`, rightParameterEnd: i + 1 }).curve);
}

/** The four spans from Sketch's Circle and Make curves, at Direct source precision. */
function makerCircle(center, e0, e1, radius) {
  const round = n => Math.round(n * 1e9) / 1e9;
  const controlPoints = Array.from({ length: 9 }, (_, i) => {
    const a = i * Math.PI / 4, rho = i % 2 ? radius / Math.cos(Math.PI / 4) : radius;
    return add(center, add(scale(e0, rho * Math.cos(a)), scale(e1, rho * Math.sin(a)))).map(round);
  });
  return { degree: 2, controlPoints, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    weights: controlPoints.map((_, i) => i % 2 ? round(Math.cos(Math.PI / 4)) : 1) };
}

function shellBrep(brep, shell) {
  const faces = brep.faces.filter(face => shell.faces.includes(face.id)), faceIds = new Set(shell.faces);
  const loops = brep.loops.filter(loop => faceIds.has(loop.face)), loopIds = new Set(loops.map(loop => loop.id));
  const coedges = brep.coedges.filter(use => loopIds.has(use.loop)), edgeIds = new Set(coedges.map(use => use.edge));
  const edges = brep.edges.filter(edge => edgeIds.has(edge.id)), vertexIds = new Set(edges.flatMap(edge => edge.vertices));
  return { ...brep, bodies: [{ ...brep.bodies[0], shells: [shell.id] }], shells: [shell], faces, loops, coedges, edges,
    vertices: brep.vertices.filter(vertex => vertexIds.has(vertex.id)) };
}

function verify(output, center, normal, R, r, inner = 0) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  const count = inner ? 2 : 1;
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].genus, count);
  assert.deepEqual(report.counts, { bodies: 1, shells: count, faces: 4 * count, loops: 4 * count,
    coedges: 16 * count, edges: 8 * count, vertices: 4 * count });
  assert.ok(brep.coedges.every(use => use.pcurve));
  assert.ok(report.maximumPcurveGap < 1e-8);
  const analytic = massPropertiesOf(output), quadrature = brepMassProperties(brep, 1);
  assert.equal(analytic.method, 'closed-form');
  assert.equal(quadrature.method, 'quadrature');
  const volume = 2 * Math.PI ** 2 * R * (r ** 2 - inner ** 2), mass = volume * 1e-3;
  near(analytic.volume, volume, 1e-9 * volume);
  near(quadrature.volume, volume, 1e-9 * volume);
  pointNear(analytic.centroid, center);
  pointNear(quadrature.centroid, center);
  // Integrating a circular annulus about its swept centreline gives these centroidal principal moments.
  const axial = mass * (R ** 2 + .75 * (r ** 2 + inner ** 2));
  const transverse = mass * (.5 * R ** 2 + .625 * (r ** 2 + inner ** 2));
  for (const props of [analytic, quadrature]) {
    near(props.mass, mass, 1e-9 * mass);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      near(props.inertia[i][j], (i === j ? transverse : 0) + (axial - transverse) * normal[i] * normal[j], 1e-8 * axial);
  }

  for (const [index, shell] of brep.shells.entries()) {
    assert.equal(shell.closed, true);
    const isolated = shellBrep(brep, shell), topology = checkBrep(isolated, { strict: true });
    assert.ok(topology.valid, topology.issues.join('\n'));
    assert.equal(topology.topology[0].genus, 1);
    assert.equal(isolated.faces.length, 4);
    const integrals = brepQuadratureIntegrals(isolated, 8);
    assert.equal(integrals.meshed, false);
    // The cavity contributes negative signed volume, although both shells remain closed native B-reps.
    const signedVolume = (index === 0 ? 1 : -1) * 2 * Math.PI ** 2 * R * (index === 0 ? r : inner) ** 2;
    near(integrals.integrals[0], signedVolume, 1e-9 * Math.abs(signedVolume));
  }

  for (const face of brep.faces) {
    const inward = face.surface.id.startsWith('w_hole0_'), radius = inward ? inner : r;
    assert.ok(face.name.startsWith('w.side') || inward && face.name.startsWith('w_hole0.side'));
    assert.notEqual(faceGeometry(face).kind, 'plane');
    const { u, v } = surfaceDomain(face.surface);
    for (const s of [0, .15, .39, .63, .8, 1]) for (const t of [0, .11, .42, .66, 1]) {
      const actual = evaluateSurfaceD1(face.surface, u[0] + (u[1] - u[0]) * s, v[0] + (v[1] - v[0]) * t);
      const fromCenter = sub(actual.point, center), axial = dot(fromCenter, normal);
      const radial = unit(sub(fromCenter, scale(normal, axial))), displacement = sub(fromCenter, scale(radial, R));
      near(norm(displacement), radius);
      const outward = scale(unit(cross(actual.du, actual.dv)), face.sense === 'forward' ? 1 : -1);
      pointNear(outward, scale(unit(displacement), inward ? -1 : 1));
    }
  }
  for (const edge of brep.edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
    assert.equal(uses.length, 2);
    for (const [index, use] of uses.entries()) {
      assert.equal(use.twin, uses[1 - index].id);
      assert.notEqual(use.sense, uses[1 - index].sense);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      for (const fraction of [0, .19, .5, .87, 1]) {
        const t = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, t);
        pointNear(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, t));
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured');
    near(continuity.curvature.maximumDifference, 0);
  }
  return analytic;
}

test('four authored quarter arcs produce one exact closed torus with all eight measurable native edges', () => {
  const path = joinedCircle();
  assert.deepEqual(path.knots, [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
  const snapshot = evaluateCadPart(document(path)), [output] = snapshot.outputs;
  assert.equal(snapshot.outputs.length, 1);
  verify(output, [0, 0, 0], [0, 0, 1], 20, 2);
  const reopened = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(reopened.document, snapshot.document);
  assert.deepEqual(reopened.outputs[0].brep, output.brep);
});

test('rounded Make curves circle, close seam and reversed nonuniform parameterization preserve an oblique torus', () => {
  const center = [123.456789123, -2.125, 21.875], e0 = [.36, .48, .8], e1 = [-.8, .6, 0], normal = cross(e0, e1);
  const path = makerCircle(center, e0, e1, 20), section = { ...disk, sideTags: { outer: ['rim'] } };
  assert.equal(path.weights[1], .707106781);
  path.controlPoints[8][2] += 1e-9;
  path.knots = [-4, -4, -4, -2, -2, 1, 1, 2.25, 2.25, 3, 3, 3];
  const [forward] = evaluateCadPart(document(path, section)).outputs;
  const reverse = { ...path, controlPoints: path.controlPoints.toReversed(), weights: path.weights.toReversed().map(weight => 2 * weight),
    knots: path.knots.toReversed().map(knot => -knot) };
  const [backward] = evaluateCadPart(document(reverse, section)).outputs;
  const a = verify(forward, center, normal, 20, 2), b = verify(backward, center, normal, 20, 2);
  near(a.volume, b.volume);
  pointNear(a.centroid, b.centroid);
  assert.equal(forward.brep.faces.filter(face => face.name.startsWith('w.side[rim]#')).length, 4);
});

test('closed-circle sweep refuses an open seam, wrong turn, noncircular and non-quarter controls', () => {
  const circle = joinedCircle();
  const refused = (path, code, detail, section, mode) => assert.throws(() => evaluateCadPart(document(path, section, mode)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  const altered = points => ({ ...circle, controlPoints: circle.controlPoints.map((point, i) => points[i] ?? point) });
  refused(altered({ 8: [20, 8e-9, 0] }), 'GEOMETRY', /close with a common forward tangent/);
  refused(altered({ 7: [20, -20, 1.2e-8] }), 'GEOMETRY', /close with a common forward tangent/);
  refused(altered({ 6: [0, 20, 0] }), 'CAPABILITY', /four rational quarter spans/);
  refused(altered({ 3: [-20, 20, 1e-4] }), 'CAPABILITY', /four rational quarter spans/);
  const ellipse = { ...circle, controlPoints: circle.controlPoints.map(([x, y, z]) => [x, 1.1 * y, z]) };
  refused(ellipse, 'CAPABILITY', /four rational quarter spans/);
  const weights = [...circle.weights]; weights[3] = .71;
  refused({ ...circle, weights }, 'CAPABILITY', /four rational quarter spans/);
  refused({ ...circle, knots: [0, 0, 0, 1, 1, 2, 2.1, 3, 3, 4, 4, 4] }, 'CAPABILITY', /four rational quarter spans/);
  const fifth = joinCurves(circle, quarters()[0], { curveId: 'fiveQuarters' }).curve;
  refused(fifth, 'CAPABILITY', /one open circular arc/);
  refused(circle, 'CAPABILITY', /one open straight segment/, disk, 'exact-straight');
});

test('closed-circle sweep keeps the path accuracy cutoff and requires one disk clear of the axis', () => {
  const circle = joinedCircle();
  const refused = (path, code, detail, section) => assert.throws(() => evaluateCadPart(document(path, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  for (const radius of [20, 21]) refused(circle, 'PARAMETER', /larger than the profile radius/, { ...disk, radius });
  refused(circle, 'CAPABILITY', /a disk, an aligned rectangle, a straight triangle, or a radial trapezoid/,
    { id: 's', kind: 'sketch', profile: 'polygon', points: [[-1, -1], [1, -0.8], [2, 1], [-1, 1.2]] });
  refused(makerCircle([0, 0, 0], [1, 0, 0], [0, 1, 0], 3000), 'CAPABILITY', /four rational quarter spans/);
  const a = [1 / 3, -2 / 3, -2 / 3], b = [-2 / 3, 1 / 3, -2 / 3];
  const wide = joinedCircle(10100, [0, 0, 0], scale(add(a, b), Math.SQRT1_2), scale(sub(a, b), Math.SQRT1_2));
  assert.ok(wide.controlPoints.flat().every(value => Math.abs(value) < 10000));
  refused(wide, 'PARAMETER', /radius must be at most 10000/);
});

test('closed annular Sweep preserves separate outward and inward toroidal shells through ID/OD edits and native reopen', t => {
  const doc = document(joinedCircle(), annulus());
  doc.parameters = { OuterRadius: 2, BoreEdgeX: 51 };
  doc.features[0].radius = { parameter: 'OuterRadius' };
  doc.features[0].holes[0][0].start = [{ parameter: 'BoreEdgeX' }, -30];
  const initial = evaluateCadPart(doc), first = initial.outputs[0];
  const initialMass = verify(first, [0, 0, 0], [0, 0, 1], 20, 2, 1);
  const identity = snapshot => {
    const brep = snapshot.outputs[0].brep;
    return { bodies: brep.bodies, shells: brep.shells,
      faces: brep.faces.map(({ id, name, sense }) => ({ id, name, sense })), edges: brep.edges.map(({ id, name }) => ({ id, name })) };
  };
  const edited = reevaluate(initial, { parameters: { BoreEdgeX: 51.5 } });
  const editedMass = verify(edited.outputs[0], [0, 0, 0], [0, 0, 1], 20, 2, 1.5);
  near(editedMass.volume / initialMass.volume, 7 / 12);
  assert.deepEqual(identity(edited), identity(initial));
  const outerWalls = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name.startsWith('w.side[rim]'));
  assert.equal(outerWalls(initial).length, 4);
  assert.deepEqual(outerWalls(edited), outerWalls(initial));
  assert.equal(first.brep.faces.filter(face => face.name.startsWith('w.side[bore]#')).length, 4);
  const expanded = reevaluate(edited, { parameters: { OuterRadius: 3 } });
  verify(expanded.outputs[0], [0, 0, 0], [0, 0, 1], 20, 3, 1.5);
  assert.deepEqual(identity(expanded), identity(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { parameters: { OuterRadius: 3 } }).outputs[0].brep, expanded.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { parameters: { BoreEdgeX: 51 } }).outputs[0].brep, first.brep);
  t.diagnostic(JSON.stringify({ counts: checkBrep(first.brep, { strict: true }).counts,
    topology: checkBrep(first.brep, { strict: true }).topology, mass: initialMass,
    editedVolume: editedMass.volume, shellIdentityPreserved: true, reopenIdentical: true }));
});

test('native meridian section curves classify material, sealed bore, exterior and both boundaries on either side of the axis', () => {
  const { brep } = evaluateCadPart(document(joinedCircle(), annulus())).outputs[0];
  for (const station of [-20, 20]) {
    const rings = brep.shells.map(shell => {
      const section = shellBrep(brep, shell).edges.filter(edge => {
        const carrier = circleOf(edge.curve);
        return carrier && norm(sub(carrier.c, [station, 0, 0])) < 1e-8;
      });
      assert.equal(section.length, 2);
      return section.map(({ curve }) => {
        assert.ok(curve.controlPoints.every(point => Math.abs(point[1]) < 1e-8));
        const [t0, t1] = curveDomain(curve);
        // Read the actual native section curves; do not rebuild a circle from the authored radii.
        return { kind: 'curve', t0, t1, f: t => {
          const [x, , z] = evaluateCurve(curve, t); return [x - station, z];
        } };
      });
    });
    const region = { outer: rings[0], holes: [rings[1]] };
    for (const [point, expected] of [[[0, .3], 'out'], [[0, 1.5], 'in'], [[0, 2.5], 'out'],
      [[0, 1], 'boundary'], [[0, 2], 'boundary'], [[1.5, 0], 'in'], [[-1.5, 0], 'in']])
      assert.equal(locateInRegion(point, region, 1e-7), expected, `${station}: ${point}`);
  }
});

test('oblique reversed closed annular path keeps clockwise phased bore charts and translated mass moments', () => {
  const center = [123.456789123, -2.125, 21.875], e0 = [.36, .48, .8], e1 = [-.8, .6, 0], normal = cross(e0, e1);
  const path = makerCircle(center, e0, e1, 20);
  path.knots = [-4, -4, -4, -2, -2, 1, 1, 2.25, 2.25, 3, 3, 3];
  const reverse = { ...path, controlPoints: path.controlPoints.toReversed(), weights: path.weights.toReversed().map(weight => weight * 2),
    knots: path.knots.toReversed().map(knot => -knot) };
  for (const curve of [path, reverse]) for (const tags of [true, false]) {
    const section = { ...annulus(1.5, disk.center, [.6, .8], 'cw'), radius: 8, ...(tags ? {} : { sideTags: undefined }) };
    verify(evaluateCadPart(document(curve, section)).outputs[0], center, normal, 20, 8, 1.5);
  }
});

test('closed annular sweep refuses eccentric, thin, oversized and unsupported bores with feature-scoped errors', () => {
  const path = joinedCircle(), refused = (section, code, detail, curve = path) => assert.throws(() => evaluateCadPart(document(curve, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  for (const center of [[50.25, -30], [50 + 1e-10, -30]])
    refused(annulus(1, center), 'GEOMETRY', /closed-circle sweep needs the bore concentric/);
  refused(annulus(.005), 'PARAMETER', /hole radius of at least 0.01/);
  for (const radius of [2 - 5e-7, 2 - 1e-6, 2, 2.1])
    refused(annulus(radius), 'GEOMETRY', /strictly positive wall clearance around the bore/);
  verify(evaluateCadPart(document(path, annulus(2 - 5e-6))).outputs[0], [0, 0, 0], [0, 0, 1], 20, 2, 2 - 5e-6);
  verify(evaluateCadPart(document(path, { ...annulus(.01, [0, 0]), center: [0, 0] })).outputs[0], [0, 0, 0], [0, 0, 1], 20, 2, .01);
  for (const radius of [20, 21])
    refused({ ...annulus(), radius }, 'PARAMETER', /path radius larger than the profile radius/);
  refused({ ...annulus(.2), sideTags: undefined, holes: [...annulus(.2).holes, ...annulus(.2).holes] },
    'CAPABILITY', /accepts at most one circular hole/);
  const rectangle = [[49.5, -30.5], [50.5, -30.5], [50.5, -29.5], [49.5, -29.5]].map(start => ({ kind: 'line', start }));
  refused({ ...annulus(), sideTags: undefined, holes: [rectangle] }, 'CAPABILITY', /accepts at most one circular hole/);
  const wide = { ...path, controlPoints: path.controlPoints.map(([x, y, z]) => [x + 10000, y, z]) };
  refused(annulus(), 'PARAMETER', /path coordinates must be within/, wide);
});

const rectangle = { id: 's', kind: 'sketch', profile: 'rectangle', min: [5, -8], max: [9, -2],
  sideTags: { outer: ['south', 'east', 'north', 'west'] } };

function verifyRectangle(output, center = [0, 0, 0], normal = [0, 0, 1], R = 20, width = 4, height = 6, innerWidth = 0, innerHeight = 0) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  const count = innerWidth ? 2 : 1;
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].genus, count);
  assert.deepEqual(report.counts, { bodies: 1, shells: count, faces: 8 * count, loops: 8 * count,
    coedges: 32 * count, edges: 16 * count, vertices: 8 * count });
  const shells = brep.shells.map((shell, i) => {
    assert.equal(shell.closed, true);
    const isolated = shellBrep(brep, shell), topology = checkBrep(isolated, { strict: true });
    assert.ok(topology.valid, topology.issues.join('\n'));
    assert.equal(topology.topology[0].genus, 1);
    assert.equal(isolated.faces.length, 8);
    assert.equal(isolated.edges.filter(edge => edge.curve.degree === 2).length, 8);
    assert.equal(isolated.edges.filter(edge => edge.curve.degree === 1).length, 8);
    const integrals = brepQuadratureIntegrals(isolated, 8);
    assert.equal(integrals.meshed, false);
    const volume = (i ? -1 : 1) * 2 * Math.PI * R * (i ? innerWidth * innerHeight : width * height);
    near(integrals.integrals[0], volume, 1e-9 * Math.abs(volume));
    return { id: shell.id, genus: topology.topology[0].genus, signedVolume: integrals.integrals[0] };
  });
  assert.ok(report.maximumPcurveGap < 1e-8);
  assert.ok(!brep.faces.some(face => /\.(start|end)$/.test(face.name)));
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 8 * count);
  const geometry = brep.faces.map(face => faceGeometry(face));
  assert.equal(geometry.filter(face => face.kind === 'plane').length, 4 * count);
  assert.equal(geometry.filter(face => face.kind === 'cylinder').length, 4 * count);
  let normalResidual = 0, chartResidual = 0;
  for (const face of brep.faces) {
    const planar = faceGeometry(face).kind === 'plane', { u, v } = surfaceDomain(face.surface);
    const inward = face.surface.id.startsWith('w_hole0_');
    const radialWidth = inward ? innerWidth : width, axialHeight = inward ? innerHeight : height;
    for (const s of [.13, .47, .83]) for (const t of [.17, .61]) {
      const actual = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
      const offset = sub(actual.point, center), axial = dot(offset, normal);
      const radial = sub(offset, scale(normal, axial)), rho = norm(radial);
      let expected;
      if (planar) { near(Math.abs(axial), axialHeight / 2); expected = scale(normal, Math.sign(axial)); }
      else {
        near(Math.abs(rho - R), radialWidth / 2);
        assert.ok(Math.abs(axial) <= axialHeight / 2 + 1e-8);
        expected = scale(unit(radial), Math.sign(rho - R));
      }
      if (inward) expected = scale(expected, -1);
      const outward = scale(unit(cross(actual.du, actual.dv)), face.sense === 'forward' ? 1 : -1);
      normalResidual = Math.max(normalResidual, norm(sub(outward, expected)));
    }
  }
  near(normalResidual, 0);
  const corners = [], splits = [];
  for (const edge of brep.edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
    assert.equal(uses.length, 2);
    for (const [index, use] of uses.entries()) {
      assert.equal(use.twin, uses[1 - index].id);
      assert.notEqual(use.sense, uses[1 - index].sense);
      assert.ok(use.pcurve);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      for (const fraction of [0, .19, .5, .87, 1]) {
        const t = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, t);
        chartResidual = Math.max(chartResidual, norm(sub(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, t))));
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    const angle = edge.curve.degree === 2 ? 90 : 0;
    near(continuity.minimumAngleDegrees, angle, 1e-5);
    near(continuity.maximumAngleDegrees, angle, 1e-5);
    if (angle) {
      corners.push(edge.id);
      assert.deepEqual(continuity.curvature, { status: 'unavailable', reason: 'non-tangent' });
    } else {
      splits.push(edge.id);
      assert.equal(continuity.curvature.status, 'measured');
      near(continuity.curvature.maximumDifference, 0);
    }
  }
  near(chartResidual, 0);
  assert.equal(corners.length, 8 * count);
  assert.equal(splits.length, 8 * count);
  const density = 7.85, area = width * height, holeArea = innerWidth * innerHeight;
  const volume = 2 * Math.PI * R * (area - holeArea), mass = density * .001 * volume;
  const factor = density * .001 * 2 * Math.PI * R;
  const axialMoment = factor * (area * (R ** 2 + width ** 2 / 4) - holeArea * (R ** 2 + innerWidth ** 2 / 4));
  const transverseMoment = factor * (area * ((R ** 2 + width ** 2 / 4) / 2 + height ** 2 / 12)
    - holeArea * ((R ** 2 + innerWidth ** 2 / 4) / 2 + innerHeight ** 2 / 12));
  const analytic = massPropertiesOf(output, density), quadrature = brepMassProperties(brep, density);
  assert.equal(analytic.method, 'closed-form');
  assert.equal(quadrature.method, 'quadrature');
  for (const actual of [analytic, quadrature]) {
    near(actual.volume, volume, 1e-8 * volume);
    near(actual.mass, mass, 1e-8 * mass);
    pointNear(actual.centroid, center);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      near(actual.inertia[i][j], (i === j ? transverseMoment : 0) + (axialMoment - transverseMoment) * normal[i] * normal[j], 1e-8 * axialMoment);
  }
  return { counts: report.counts, topology: report.topology, pcurveGap: report.maximumPcurveGap,
    chartResidual, normalResidual, corners: corners.length, splits: splits.length, shells, analytic, quadrature };
}

test('R20 closed rectangular Sweep keeps all authored side tags, 90 degree corners and 0 degree split seams through width edit and native reopen', t => {
  const doc = document(joinedCircle(), rectangle);
  doc.parameters = { RightX: 9 };
  doc.features[0] = { ...rectangle, max: [{ parameter: 'RightX' }, -2] };
  const initial = evaluateCadPart(doc), diagnostic = verifyRectangle(initial.outputs[0]);
  for (const tag of rectangle.sideTags.outer)
    assert.equal(initial.outputs[0].brep.faces.filter(face => face.name.startsWith(`w.side[${tag}]#`)).length, 2);
  const identity = snapshot => {
    const brep = snapshot.outputs[0].brep;
    return { bodies: brep.bodies, shells: brep.shells,
      faces: brep.faces.map(({ id, name, sense }) => ({ id, name, sense })), edges: brep.edges.map(({ id, name }) => ({ id, name })) };
  };
  const edited = reevaluate(initial, { parameters: { RightX: 11 } });
  verifyRectangle(edited.outputs[0], [0, 0, 0], [0, 0, 1], 20, 6, 6);
  assert.deepEqual(identity(edited), identity(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { parameters: { RightX: 9 } }).outputs[0].brep, initial.outputs[0].brep);
  t.diagnostic(JSON.stringify(diagnostic));
});

test('closed rectangle supports radial-Y frame and a reversed oblique path while preserving the original profile axes', () => {
  const swapped = { ...rectangle, min: [4, -7], max: [10, -3],
    plane: { origin: [4, 5, 6], normal: [0, 1, 0], xAxis: [0, 0, 1] } };
  verifyRectangle(evaluateCadPart(document(joinedCircle(), swapped)).outputs[0]);
  const center = [32, 14, -18], e0 = [.36, .48, .8], e1 = [-.8, .6, 0], normal = cross(e0, e1);
  const path = joinedCircle(20, center, e0, e1);
  const section = { ...rectangle, plane: { origin: [1, 2, 3], normal: e1, xAxis: e0 } };
  for (const reverse of [false, true]) {
    const curve = reverse ? { ...path, controlPoints: path.controlPoints.toReversed(), weights: path.weights.toReversed(),
      knots: path.knots.toReversed().map(knot => -knot) } : path;
    verifyRectangle(evaluateCadPart(document(curve, section)).outputs[0], center, normal);
  }
});

test('native meridian line sections of the closed rectangular Sweep classify material, exterior and wall boundaries', () => {
  const { brep } = evaluateCadPart(document(joinedCircle(), rectangle)).outputs[0];
  for (const station of [-20, 20]) {
    const edges = brep.edges.filter(({ curve }) => curve.degree === 1
      && curve.controlPoints.every(([x, y]) => Math.abs(y) < 1e-8 && Math.sign(x) === Math.sign(station)));
    assert.equal(edges.length, 4);
    const region = { outer: edges.map(({ curve: { controlPoints: [a, b] } }) =>
      ({ kind: 'line', a: [a[0] - station, a[2]], b: [b[0] - station, b[2]] })), holes: [] };
    for (const [point, expected] of [[[0, 0], 'in'], [[1, 2], 'in'], [[2.5, 0], 'out'], [[0, 3.5], 'out'],
      [[2, 0], 'boundary'], [[0, 3], 'boundary']])
      assert.equal(locateInRegion(point, region, 1e-7), expected, `${station}: ${point}`);
  }
});

test('closed rectangular Sweep refuses axis contact, unsupported roll and a circular opening without changing the prior disk or annulus scope', () => {
  const refused = (section, code, detail, curve = joinedCircle()) => assert.throws(() => evaluateCadPart(document(curve, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  for (const halfWidth of [20 - 5e-8, 20, 21])
    refused({ ...rectangle, min: [-halfWidth, -3], max: [halfWidth, 3] }, 'PARAMETER', /radial half-width smaller than the path radius/);
  refused({ ...rectangle, plane: { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [Math.SQRT1_2, 0, Math.SQRT1_2] } },
    'CAPABILITY', /rectangle's original axes aligned to the bend radial and binormal/);
  refused({ ...rectangle, sideTags: undefined, holes: annulus(1, [7, -5]).holes },
    'CAPABILITY', /one centered rectangular opening aligned with the outer rectangle/);
  const tooWide = { ...joinedCircle(), controlPoints: joinedCircle().controlPoints.map(([x, y, z]) => [x + 10000, y, z]) };
  refused(rectangle, 'PARAMETER', /path coordinates must be within/, tooWide);
  const a = [1 / 3, -2 / 3, -2 / 3], b = [-2 / 3, 1 / 3, -2 / 3];
  const wide = joinedCircle(10100, [0, 0, 0], scale(add(a, b), Math.SQRT1_2), scale(sub(a, b), Math.SQRT1_2));
  assert.ok(wide.controlPoints.flat().every(value => Math.abs(value) < 10000));
  refused(rectangle, 'PARAMETER', /path radius must be at most 10000/, wide);
});

function rectangularDuct(width = 2, height = 4, clockwise = false, offset = [0, 0]) {
  const [x, y] = add([7, -5], offset);
  const corners = [[x - width / 2, y - height / 2], [x + width / 2, y - height / 2],
    [x + width / 2, y + height / 2], [x - width / 2, y + height / 2]];
  const ordered = clockwise ? [corners[0], corners[3], corners[2], corners[1]] : corners;
  return { ...rectangle, holes: [ordered.map(start => ({ kind: 'line', start }))], sideTags: { outer: rectangle.sideTags.outer,
    holes: [clockwise ? ['boreWest', 'boreNorth', 'boreEast', 'boreSouth'] : ['boreSouth', 'boreEast', 'boreNorth', 'boreWest']] } };
}

test('closed rectangular duct keeps two closed genus-1 shells and authored IDs through opening height edit and native reopen', t => {
  const section = rectangularDuct(2, 4, true), doc = document(joinedCircle(), section);
  doc.parameters = { OpeningLowY: -7, OpeningHighY: -3 };
  doc.features[0] = { ...section, holes: [section.holes[0].map(segment => ({ ...segment,
    start: [segment.start[0], { parameter: segment.start[1] === -7 ? 'OpeningLowY' : 'OpeningHighY' }] }))] };
  const initial = evaluateCadPart(doc), diagnostic = verifyRectangle(initial.outputs[0], [0, 0, 0], [0, 0, 1], 20, 4, 6, 2, 4);
  near(diagnostic.analytic.volume, 640 * Math.PI);
  const identity = snapshot => {
    const brep = snapshot.outputs[0].brep;
    return { bodies: brep.bodies, shells: brep.shells,
      faces: brep.faces.map(({ id, name, sense }) => ({ id, name, sense })), edges: brep.edges.map(({ id, name }) => ({ id, name })) };
  };
  for (const tag of [...section.sideTags.outer, ...section.sideTags.holes[0]])
    assert.equal(initial.outputs[0].brep.faces.filter(face => face.name.startsWith(`w.side[${tag}]#`)).length, 2);
  const edited = reevaluate(initial, { parameters: { OpeningLowY: -6, OpeningHighY: -4 } });
  const after = verifyRectangle(edited.outputs[0], [0, 0, 0], [0, 0, 1], 20, 4, 6, 2, 2);
  near(after.analytic.volume, 800 * Math.PI);
  assert.deepEqual(identity(edited), identity(initial));
  const outerWalls = snapshot => snapshot.outputs[0].brep.faces.filter(face => !face.surface.id.startsWith('w_hole0_'));
  assert.deepEqual(outerWalls(edited), outerWalls(initial));
  assert.throws(() => reevaluate(initial, { parameters: { OpeningHighY: -4 } }),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === 'CAPABILITY'
      && /one centered rectangular opening aligned with the outer rectangle/.test(error.message));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { parameters: { OpeningLowY: -7, OpeningHighY: -3 } }).outputs[0].brep, initial.outputs[0].brep);
  t.diagnostic(JSON.stringify({ ...diagnostic, editedVolume: after.analytic.volume, identityPreserved: true, reopenIdentical: true }));
});

test('closed rectangular duct keeps inward radial and binormal bounds in clockwise, reflected, swapped and reversed oblique aligned frames', () => {
  const path = joinedCircle(), normal = [0, 1, 0];
  for (const clockwise of [false, true]) {
    const section = rectangularDuct(2, 4, clockwise);
    verifyRectangle(evaluateCadPart(document(path, section)).outputs[0], [0, 0, 0], [0, 0, 1], 20, 4, 6, 2, 4);
    const reflected = { ...section, plane: { origin: [4, 5, 6], normal, xAxis: [-1, 0, 0] } };
    verifyRectangle(evaluateCadPart(document(path, reflected)).outputs[0], [0, 0, 0], [0, 0, 1], 20, 4, 6, 2, 4);
  }
  const swapped = { ...rectangularDuct(4, 2, true), min: [4, -7], max: [10, -3],
    plane: { origin: [4, 5, 6], normal, xAxis: [0, 0, 1] } };
  verifyRectangle(evaluateCadPart(document(path, swapped)).outputs[0], [0, 0, 0], [0, 0, 1], 20, 4, 6, 2, 4);
  const center = [32, 14, -18], e0 = [.36, .48, .8], e1 = [-.8, .6, 0], axis = cross(e0, e1);
  const curve = joinedCircle(20, center, e0, e1);
  const reverse = { ...curve, controlPoints: curve.controlPoints.toReversed(), weights: curve.weights.toReversed(),
    knots: curve.knots.toReversed().map(knot => -knot) };
  const section = { ...rectangularDuct(2, 4, true), plane: { origin: [1, 2, 3], normal: e1, xAxis: e0 } };
  verifyRectangle(evaluateCadPart(document(reverse, section)).outputs[0], center, axis, 20, 4, 6, 2, 4);
});

test('native closed-duct meridian sections distinguish the enclosed void, radial and binormal material, exterior and four boundaries', () => {
  const { brep } = evaluateCadPart(document(joinedCircle(), rectangularDuct(2, 4, true))).outputs[0];
  for (const station of [-20, 20]) {
    const rings = brep.shells.map(shell => {
      const edges = shellBrep(brep, shell).edges.filter(({ curve }) => curve.degree === 1
        && curve.controlPoints.every(([x, y]) => Math.abs(y) < 1e-8 && Math.sign(x) === Math.sign(station)));
      assert.equal(edges.length, 4);
      return edges.map(({ curve: { controlPoints: [a, b] } }) =>
        ({ kind: 'line', a: [a[0] - station, a[2]], b: [b[0] - station, b[2]] }));
    });
    const region = { outer: rings[0], holes: [rings[1]] };
    for (const [point, expected] of [[[0, 0], 'out'], [[1.5, 0], 'in'], [[0, 2.5], 'in'], [[2.5, 0], 'out'], [[0, 3.5], 'out'],
      [[1, 0], 'boundary'], [[0, 2], 'boundary'], [[2, 0], 'boundary'], [[0, 3], 'boundary']])
      assert.equal(locateInRegion(point, region, 1e-7), expected, `${station}: ${point}`);
  }
});

test('closed rectangular duct refuses off-center, touching, thin, nonrectangular and multiple openings with the established duct errors', () => {
  const refused = (section, code, detail) => assert.throws(() => evaluateCadPart(document(joinedCircle(), section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  for (const offset of [[.1, 0], [0, .1], [1e-10, 0]])
    refused(rectangularDuct(2, 4, false, offset), 'CAPABILITY', /one centered rectangular opening aligned with the outer rectangle/);
  for (const [width, height] of [[4, 4], [4.1, 4], [4 - 1e-6, 4], [2, 6], [2, 6.1], [2, 6 - 1e-6]])
    refused(rectangularDuct(width, height), 'GEOMETRY', /strictly positive wall clearance around the opening/);
  verifyRectangle(evaluateCadPart(document(joinedCircle(), rectangularDuct(4 - 1e-5, 4))).outputs[0],
    [0, 0, 0], [0, 0, 1], 20, 4, 6, 4 - 1e-5, 4);
  const two = rectangularDuct();
  refused({ ...two, sideTags: undefined, holes: [...two.holes, ...two.holes, ...two.holes] },
    'CAPABILITY', /two axis-aligned rectangular cavities/);
  const diamond = [[7, -7], [8, -5], [7, -3], [6, -5]].map(start => ({ kind: 'line', start }));
  refused({ ...two, sideTags: undefined, holes: [diamond] }, 'CAPABILITY', /one centered rectangular opening aligned with the outer rectangle/);
  refused({ ...two, plane: { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [Math.SQRT1_2, 0, Math.SQRT1_2] } },
    'CAPABILITY', /rectangle's original axes aligned to the bend radial and binormal/);
});

function pairedCavities(intervals = [[-3, -1], [1, 3]], widths = [2, 2], clockwise = [true, false]) {
  return { id: 's', kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5],
    holes: intervals.map(([low, high], i) => {
      const x = widths[i] / 2, corners = [[-x, low], [x, low], [x, high], [-x, high]];
      const ordered = clockwise[i] ? [corners[0], corners[3], corners[2], corners[1]] : corners;
      return ordered.map(start => ({ kind: 'line', start }));
    }), sideTags: { outer: ['south', 'east', 'north', 'west'],
      holes: [['lowerA', 'lowerB', 'lowerC', 'lowerD'], ['upperA', 'upperB', 'upperC', 'upperD']] } };
}

function verifyPaired(output, intervals = [[-3, -1], [1, 3]], axialSign = -1, widths = [2, 2]) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 3, faces: 24, loops: 24, coedges: 96, edges: 48, vertices: 24 });
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].genus, 3);
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 24);
  assert.ok(!brep.faces.some(face => /\.(start|end)$/.test(face.name)));
  const density = 7.85, R = 20;
  const parts = [{ sign: 1, width: 4, height: 10, h: 0 }, ...intervals.map(([low, high], i) =>
    ({ sign: -1, width: widths[i], height: high - low, h: axialSign * (low + high) / 2 }))];
  const volumes = parts.map(part => part.sign * 2 * Math.PI * R * part.width * part.height);
  const volume = volumes.reduce((sum, value) => sum + value, 0), mass = density * .001 * volume;
  const centroid = parts.reduce((sum, part, i) => sum + volumes[i] * part.h, 0) / volume;
  const axialInertia = parts.reduce((sum, part, i) => sum + density * .001 * volumes[i] * (R ** 2 + part.width ** 2 / 4), 0);
  const transverseInertia = parts.reduce((sum, part, i) => sum + density * .001 * volumes[i]
    * ((R ** 2 + part.width ** 2 / 4) / 2 + part.height ** 2 / 12 + (part.h - centroid) ** 2), 0);
  const shellVolumes = [];
  let chartResidual = 0, normalResidual = 0;
  for (const [i, shell] of brep.shells.entries()) {
    const isolated = shellBrep(brep, shell), check = checkBrep(isolated, { strict: true });
    assert.equal(shell.closed, true);
    assert.ok(check.valid, check.issues.join('\n'));
    assert.equal(check.topology[0].genus, 1);
    assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 32, edges: 16, vertices: 8 });
    const quadrature = brepQuadratureIntegrals(isolated, 8);
    assert.equal(quadrature.meshed, false);
    near(quadrature.integrals[0], volumes[i], 1e-8);
    shellVolumes.push(quadrature.integrals[0]);
    const part = parts[i], planes = isolated.faces.filter(face => faceGeometry(face).kind === 'plane');
    assert.equal(planes.length, 4);
    assert.equal(isolated.faces.filter(face => faceGeometry(face).kind === 'cylinder').length, 4);
    for (const face of isolated.faces) {
      const planar = faceGeometry(face).kind === 'plane', { u, v } = surfaceDomain(face.surface);
      for (const s of [.13, .47, .83]) for (const t of [.17, .61]) {
        const actual = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        const [x, y, z] = actual.point, rho = Math.hypot(x, y);
        let expected;
        if (planar) { near(Math.abs(z - part.h), part.height / 2); expected = [0, 0, Math.sign(z - part.h)]; }
        else {
          near(Math.abs(rho - R), part.width / 2);
          assert.ok(Math.abs(z - part.h) <= part.height / 2 + 1e-8);
          expected = scale([x / rho, y / rho, 0], Math.sign(rho - R));
        }
        if (i) expected = scale(expected, -1);
        const outward = scale(unit(cross(actual.du, actual.dv)), face.sense === 'forward' ? 1 : -1);
        normalResidual = Math.max(normalResidual, norm(sub(outward, expected)));
      }
    }
    let sharp = 0, smooth = 0;
    for (const edge of isolated.edges) {
      const uses = isolated.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
      assert.equal(uses.length, 2);
      for (const [index, use] of uses.entries()) {
        assert.equal(use.twin, uses[1 - index].id);
        assert.notEqual(use.sense, uses[1 - index].sense);
        assert.ok(use.pcurve);
        assert.deepEqual(curveDomain(use.pcurve), domain);
        const face = isolated.faces.find(face => face.loops.includes(use.loop));
        for (const fraction of [0, .19, .5, .87, 1]) {
          const at = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, at);
          chartResidual = Math.max(chartResidual, norm(sub(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, at))));
        }
      }
      const continuity = measureBrepEdgeContinuity(isolated, edge.id, { curvature: true });
      assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
      const angle = edge.curve.degree === 2 ? 90 : 0;
      near(continuity.minimumAngleDegrees, angle, 1e-5);
      near(continuity.maximumAngleDegrees, angle, 1e-5);
      if (angle) {
        sharp++;
        assert.deepEqual(continuity.curvature, { status: 'unavailable', reason: 'non-tangent' });
      } else {
        smooth++;
        assert.equal(continuity.curvature.status, 'measured');
        near(continuity.curvature.maximumDifference, 0);
      }
    }
    assert.equal(sharp, 8);
    assert.equal(smooth, 8);
  }
  near(chartResidual, 0);
  near(normalResidual, 0);
  const analytic = massPropertiesOf(output, density), quadrature = brepMassProperties(brep, density);
  assert.equal(analytic.method, 'closed-form');
  assert.equal(quadrature.method, 'quadrature');
  for (const actual of [analytic, quadrature]) {
    near(actual.volume, volume, 1e-8 * volume);
    near(actual.mass, mass, 1e-8 * mass);
    pointNear(actual.centroid, [0, 0, centroid]);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      near(actual.inertia[i][j], i === j ? i === 2 ? axialInertia : transverseInertia : 0, 1e-8 * axialInertia);
  }
  return { counts: report.counts, topology: report.topology, shellVolumes, analytic, quadrature,
    pcurveGap: report.maximumPcurveGap, chartResidual, normalResidual };
}

test('two radially centered closed rectangular cavities keep three shells, both signed offsets and their tags through height edit and native reopen', t => {
  const section = pairedCavities(), doc = document(joinedCircle(), section);
  doc.parameters = { FirstLowY: -3, FirstHighY: -1 };
  doc.features[0] = { ...section, holes: [section.holes[0].map(segment => ({ ...segment,
    start: [segment.start[0], { parameter: segment.start[1] === -3 ? 'FirstLowY' : 'FirstHighY' }] })), section.holes[1]] };
  const initial = evaluateCadPart(doc), diagnostic = verifyPaired(initial.outputs[0]);
  near(diagnostic.analytic.volume, 1280 * Math.PI);
  const identity = snapshot => {
    const brep = snapshot.outputs[0].brep;
    return { bodies: brep.bodies, shells: brep.shells,
      faces: brep.faces.map(({ id, name, sense }) => ({ id, name, sense })), edges: brep.edges.map(({ id, name }) => ({ id, name })) };
  };
  for (const tag of [...section.sideTags.outer, ...section.sideTags.holes.flat()])
    assert.equal(initial.outputs[0].brep.faces.filter(face => face.name.startsWith(`w.side[${tag}]#`)).length, 2);
  const edited = reevaluate(initial, { parameters: { FirstLowY: -2.5, FirstHighY: -1.5 } });
  const after = verifyPaired(edited.outputs[0], [[-2.5, -1.5], [1, 3]]);
  near(after.analytic.volume, 1360 * Math.PI);
  near(after.analytic.centroid[2], 2 / 17);
  assert.deepEqual(identity(edited), identity(initial));
  const unchanged = snapshot => snapshot.outputs[0].brep.faces.filter(face => !face.surface.id.startsWith('w_hole0_'));
  assert.deepEqual(unchanged(edited), unchanged(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { parameters: { FirstLowY: -3, FirstHighY: -1 } }).outputs[0].brep, initial.outputs[0].brep);
  const reverse = joinedCircle();
  reverse.controlPoints = reverse.controlPoints.toReversed(); reverse.weights = reverse.weights.toReversed();
  verifyPaired(evaluateCadPart(document(reverse, pairedCavities([[-2.5, -1.5], [1, 3]], [2, 2], [false, true]))).outputs[0],
    [[-2.5, -1.5], [1, 3]], 1);
  const reordered = [[1, 3], [-3, -1]];
  verifyPaired(evaluateCadPart(document(joinedCircle(), pairedCavities(reordered))).outputs[0], reordered);
  t.diagnostic(JSON.stringify({ initial: diagnostic, edited: after, shellIdentityPreserved: true, reopenIdentical: true }));
});

test('native meridian sections keep both sealed cavities, their axial web and outer cover distinct', () => {
  for (const edited of [false, true]) {
    const intervals = edited ? [[-2.5, -1.5], [1, 3]] : [[-3, -1], [1, 3]];
    const { brep } = evaluateCadPart(document(joinedCircle(), pairedCavities(intervals))).outputs[0];
    for (const station of [-20, 20]) {
      const rings = brep.shells.map(shell => {
        const edges = shellBrep(brep, shell).edges.filter(({ curve }) => curve.degree === 1
          && curve.controlPoints.every(([x, y]) => Math.abs(y) < 1e-8 && Math.sign(x) === Math.sign(station)));
        assert.equal(edges.length, 4);
        return edges.map(({ curve: { controlPoints: [a, b] } }) =>
          ({ kind: 'line', a: [a[0] - station, a[2]], b: [b[0] - station, b[2]] }));
      });
      const region = { outer: rings[0], holes: rings.slice(1) };
      for (const [point, expected] of [[[0, 0], 'in'], [[0, 2], 'out'], [[0, -2], 'out'], [[1.5, 2], 'in'],
        [[0, 4], 'in'], [[0, -4], 'in'], [[2.5, 0], 'out'], [[0, 5.5], 'out'], [[2, 0], 'boundary'],
        [[0, 5], 'boundary'], [[1, -2], 'boundary'], [[0, -1], 'boundary'], [[0, -3], 'boundary'],
        [[0, edited ? 1.5 : 1], 'boundary'], [[0, edited ? 2.5 : 3], 'boundary'], [[0, 1.25], edited ? 'in' : 'out']])
        assert.equal(locateInRegion(point, region, 1e-7), expected, `${station}: ${point}`);
    }
  }
});

test('paired closed rectangle admission enforces radial centering, cover, axial web and the two-rectangle limit and keeps single offset openings unsupported', () => {
  const refused = (section, code, detail, path = joinedCircle()) => assert.throws(() => evaluateCadPart(document(path, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  const eccentric = pairedCavities();
  eccentric.holes[0] = eccentric.holes[0].map(segment => ({ ...segment, start: [segment.start[0] + .1, segment.start[1]] }));
  refused(eccentric, 'GEOMETRY', /both cavities centered on the radial axis/);
  for (const widths of [[4, 2], [4.1, 2], [4 - 1e-6, 2]])
    refused(pairedCavities(undefined, widths), 'GEOMETRY', /strictly positive cover around each cavity/);
  for (const intervals of [[[-5, -1], [1, 3]], [[-5 + 5e-7, -1], [1, 3]], [[-3, -1], [1, 5]]])
    refused(pairedCavities(intervals), 'GEOMETRY', /strictly positive cover around each cavity/);
  for (const intervals of [[[-3, 0], [0, 3]], [[-3, .1], [0, 3]], [[-3, 3], [-1, 1]], [[-3, 0], [5e-7, 3]]])
    refused(pairedCavities(intervals), 'GEOMETRY', /strictly positive axial web clearance between the cavities/);
  const narrowWeb = [[-3, -2.5e-6], [2.5e-6, 3]];
  verifyPaired(evaluateCadPart(document(joinedCircle(), pairedCavities(narrowWeb))).outputs[0], narrowWeb);
  verifyPaired(evaluateCadPart(document(joinedCircle(), pairedCavities(undefined, [4 - 1e-5, 2]))).outputs[0], undefined, -1, [4 - 1e-5, 2]);
  const three = pairedCavities();
  refused({ ...three, sideTags: undefined, holes: [...three.holes, three.holes[0]] }, 'CAPABILITY', /two axis-aligned rectangular cavities/);
  const circleHole = { ...pairedCavities(), sideTags: undefined };
  circleHole.holes[0] = [{ kind: 'arc', center: [0, -2], start: [.5, -2], direction: 'ccw' }];
  refused(circleHole, 'CAPABILITY', /two axis-aligned rectangular cavities/);
  const lead = { kind: 'curve', id: 'lead', degree: 2, knots: [0, 0, 0, 1, 1, 1],
    controlPoints: [[20, -10, 0], [20, -5, 0], [20, 0, 0]], weights: [1, 1, 1] };
  const openElbow = joinCurves(lead, quarters()[0], { curveId: 'openElbow' }).curve;
  const openReport = checkBrep(evaluateCadPart(document(openElbow, pairedCavities())).outputs[0].brep, { strict: true });
  assert.ok(openReport.valid, openReport.issues.join('\n'));
  assert.equal(openReport.topology[0].genus, 2);
  const oneOffset = { ...pairedCavities(), sideTags: undefined, holes: [pairedCavities().holes[0]] };
  refused(oneOffset, 'CAPABILITY', /one centered rectangular opening aligned with the outer rectangle/);
});

const triangle = { id: 's', kind: 'sketch', profile: 'polygon', points: [[-2, -3], [2, -3], [-2, 3]],
  sideTags: { outer: ['radial-wall', 'sloping-wall', 'axial-wall'] } };

test('a closed circular Sweep carries the bounds centre of a straight triangle', () => {
  for (const travel of [1, -1]) {
    const center = [7, -4, 9], rail = joinedCircle(20, center, [1, 0, 0], [0, travel, 0]);
    const source = document(rail, triangle);
    const snapshot = evaluateCadPart(source), [body] = snapshot.outputs;
    const { brep } = body, report = checkBrep(brep, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.equal(body.representation, 'curved');
    assert.equal(report.topology[0].genus, 1);
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, edges: 12, vertices: 6, coedges: 24 });
    // Area 12 and section centroid radius 20 - 2/3 give 464π by Pappus.
    near(massPropertiesOf(body).volume, 464 * Math.PI);
    near(brepMassProperties(brep, 1).volume, 464 * Math.PI);
    pointNear(massPropertiesOf(body).centroid, [7, -4, 9 + travel * 30 / 29]);
    const smooth = brep.edges.map(edge => measureBrepEdgeContinuity(brep, edge.id));
    assert.ok(smooth.every(edge => edge.status === 'measured'));
    assert.equal(smooth.filter(edge => edge.maximumAngleDegrees < 1e-5).length, 6);
    for (const face of brep.faces) {
      const tag = triangle.sideTags.outer.find(name => face.name.includes(`[${name}]`));
      assert.ok(tag, face.name);
      const loop = brep.loops.find(item => item.face === face.id);
      const uses = brep.coedges.filter(use => use.loop === loop.id);
      assert.equal(uses.length, 4);
      for (const use of uses) {
        const curve = brep.edges.find(edge => edge.id === use.edge).curve;
        assert.ok(use.pcurve);
        const [start, end] = curveDomain(curve);
        for (const t of [0, 0.23, 0.67, 1]) {
          const p = start + (end - start) * t, point = evaluateCurve(curve, p);
          const [u, v] = evaluateCurve(use.pcurve, p);
          pointNear(evaluateSurface(face.surface, u, v), point);
          const [x, y, z] = sub(point, center), radius = Math.hypot(x, y), sectionV = -travel * z;
          if (tag === 'radial-wall') near(sectionV, -3);
          if (tag === 'sloping-wall') near(sectionV + 1.5 * (radius - 20), 0);
          if (tag === 'axial-wall') near(radius, 18);
        }
      }
    }
    const translated = { ...triangle, points: triangle.points.map(([x, y]) => [x + 11, y - 8]) };
    assert.deepEqual(evaluateCadPart(document(rail, translated)).outputs[0].brep, brep);
    const reopened = loadCadPart(saveCadPart(snapshot));
    assert.deepEqual(reopened.document, snapshot.document);
    assert.deepEqual(reopened.outputs[0].brep, brep);
  }
});

test('the triangle keeps the authored radial-Y frame and side IDs', () => {
  const section = { ...triangle, points: triangle.points.map(([x, y]) => [y, x]),
    plane: { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [0, 0, 1] } };
  const [body] = evaluateCadPart(document(joinedCircle(), section)).outputs;
  const report = checkBrep(body.brep, { strict: true });
  assert.ok(report.valid);
  near(massPropertiesOf(body).volume, 464 * Math.PI);
  pointNear(massPropertiesOf(body).centroid, [0, 0, -30 / 29]);
  for (const tag of triangle.sideTags.outer) assert.equal(body.brep.faces.filter(face => face.name.includes(`[${tag}]`)).length, 2);
});

test('a closed triangular section refuses axis contact, unaligned roll and a circular hole', () => {
  const circle = joinedCircle();
  const refused = (code, detail, section) => assert.throws(() => evaluateCadPart(document(circle, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  refused('PARAMETER', /triangular sweep needs strictly positive radial clearance/,
    { ...triangle, points: [[-20, -3], [20, -3], [-20, 3]] });
  refused('CAPABILITY', /triangular sweep needs the sketch axes aligned/,
    { ...triangle, plane: { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [Math.SQRT1_2, 0, Math.SQRT1_2] } });
  refused('CAPABILITY', /triangular sweep accepts one axis-aligned rectangular cavity/,
    { ...triangle, sideTags: { ...triangle.sideTags, holes: [['bore']] },
      holes: [[{ kind: 'arc', center: [-1, -2], start: [-0.5, -2], direction: 'cw' }]] });
});

const radialTrapezoid = (width = 4) => ({ id: 's', kind: 'sketch', profile: 'polygon',
  points: [[0, 0], [width, 0], [2, 6], [0, 6]],
  sideTags: { outer: ['lower-radial-wall', 'sloping-wall', 'upper-radial-wall', 'axial-wall'] } });

test('closed radial trapezoid preserves the original unequal sides through native replay', () => {
  for (const width of [4, 6]) {
    const profile = radialTrapezoid(width), path = joinedCircle();
    const shiftedOrder = { ...profile, points: [profile.points[1], profile.points[2], profile.points[3], profile.points[0]],
      sideTags: { outer: [...profile.sideTags.outer.slice(1), profile.sideTags.outer[0]] } };
    const clockwise = { ...profile, points: [profile.points[0], ...profile.points.slice(1).reverse()],
      sideTags: { outer: [...profile.sideTags.outer].reverse() } };
    for (const section of [profile, shiftedOrder, clockwise]) {
      const snapshot = evaluateCadPart(document(path, section)), [output] = snapshot.outputs;
      const { brep } = output, report = checkBrep(brep, { strict: true });
      const expected = Math.PI * (118 * width + 248 - width * width);
      assert.ok(report.valid, report.issues.join('\n'));
      assert.equal(report.topology[0].genus, 1);
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, edges: 16, vertices: 8, coedges: 32 });
      near(massPropertiesOf(output).volume, expected);
      near(brepMassProperties(brep, 1).volume, expected);
      pointNear(massPropertiesOf(output).centroid, [0, 0, 126 * (width - 2) / (118 * width + 248 - width * width)]);
      const joints = brep.edges.map(edge => measureBrepEdgeContinuity(brep, edge.id));
      assert.ok(joints.every(joint => joint.status === 'measured'));
      assert.equal(joints.filter(joint => joint.maximumAngleDegrees < 1e-5).length, 8);
      for (const face of brep.faces) {
        const tag = profile.sideTags.outer.find(name => face.name.includes(`[${name}]`));
        assert.ok(tag);
        for (const use of brep.coedges.filter(use => face.loops.includes(use.loop))) {
          const { curve } = brep.edges.find(edge => edge.id === use.edge);
          assert.ok(use.pcurve);
          const [start, end] = curveDomain(curve);
          for (const t of [start, (start + end) / 2, end]) {
            const point = evaluateCurve(curve, t), [x, y, z] = point, radius = Math.hypot(x, y);
            const [u, v] = evaluateCurve(use.pcurve, t);
            pointNear(evaluateSurface(face.surface, u, v), point);
            if (tag === 'lower-radial-wall') near(z, 3);
            if (tag === 'upper-radial-wall') near(z, -3);
            if (tag === 'axial-wall') near(radius, 20 - width / 2);
            if (tag === 'sloping-wall') near(radius, 21 + (width - 2) * z / 6);
          }
        }
      }
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
    }
  }
});

test('closed trapezoid supports a radial-Y frame and refuses false trapezoids, curved holes and axis contact', () => {
  const path = joinedCircle(), profile = radialTrapezoid();
  const [turned] = evaluateCadPart(document(path, { ...profile, points: profile.points.map(([x,y]) => [y,x]),
    plane: { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [0, 0, 1] } })).outputs;
  assert.ok(checkBrep(turned.brep, { strict: true }).valid);
  pointNear(massPropertiesOf(turned).centroid, [0, 0, -63 / 176]);
  near(massPropertiesOf(turned).volume, 704 * Math.PI);

  const refuse = (section, code, detail) => assert.throws(() => evaluateCadPart(document(path, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  refuse(radialTrapezoid(40), 'PARAMETER', /trapezoidal sweep needs strictly positive radial clearance/);
  refuse({ ...profile, points: [[0, 0], [4, 0], [2, 6.00000001], [0, 6]] }, 'CAPABILITY', /or a radial trapezoid/);
  refuse({ ...profile, points: profile.points.map(([x,y]) => [-y,x]) }, 'CAPABILITY', /or a radial trapezoid/);
  refuse({ ...profile, sideTags: { ...profile.sideTags, holes: [['bore']] },
    holes: [[{ kind: 'arc', center: [1, 2], start: [1.5, 2], direction: 'cw' }]] },
    'CAPABILITY', /trapezoidal sweep accepts one axis-aligned rectangular cavity/);
});

const lines = points => points.map(start => ({ kind: 'line', start }));
const voidLoop = (left = .5, right = 1.5, top = 4) => lines([[left, 2], [right, 2], [right, top], [left, top]]);
const voidTags = ['void-lower', 'void-outer', 'void-upper', 'void-inner'];
const hollowTrapezoid = width => {
  const section = radialTrapezoid(width);
  return { ...section, holes: [voidLoop()], sideTags: { ...section.sideTags, holes: [voidTags] } };
};

test('closed radial trapezoid binds an offset rectangular cavity with its original side names', () => {
  const path = joinedCircle();
  for (const width of [4, 6]) {
    const section = hollowTrapezoid(width), [hole] = section.holes;
    const clockwise = { ...section, holes: [[hole[0], ...hole.slice(1).reverse()]],
      sideTags: { ...section.sideTags, holes: [[...voidTags].reverse()] } };
    const radialY = { ...section, points: section.points.map(([x, y]) => [y, x]),
      holes: [lines(hole.map(({ start: [x, y] }) => [y, x]))],
      plane: { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [0, 0, 1] } };
    for (const profile of [section, clockwise, radialY]) {
      const snapshot = evaluateCadPart(document(path, profile)), [output] = snapshot.outputs;
      const { brep } = output, report = checkBrep(brep, { strict: true });
      assert.ok(report.valid, report.issues.join('\n'));
      assert.equal(report.topology[0].genus, 2);
      assert.deepEqual(report.counts, { bodies: 1, shells: 2, faces: 16, loops: 16, edges: 32, vertices: 16, coedges: 64 });
      assert.ok(report.maximumPcurveGap < 1e-8);
      const outerFactor = 118 * width + 248 - width * width, voidFactor = 84 - 2 * width;
      const expected = Math.PI * (outerFactor - voidFactor);
      near(massPropertiesOf(output).volume, expected);
      near(brepMassProperties(brep, 1).volume, expected);
      const z = 126 * (width - 2) / (outerFactor - voidFactor);
      pointNear(massPropertiesOf(output).centroid, [0, 0, profile === radialY ? -z : z]);
      for (const [i, shell] of brep.shells.entries()) {
        const isolated = shellBrep(brep, shell), quadrature = brepQuadratureIntegrals(isolated, 8);
        assert.equal(quadrature.meshed, false);
        near(quadrature.integrals[0], Math.PI * (i ? -voidFactor : outerFactor));
        const tags = i ? voidTags : section.sideTags.outer;
        for (const face of isolated.faces) {
          const tag = tags.find(name => face.name.includes(`[${name}]`));
          assert.ok(tag, face.name);
          for (const use of isolated.coedges.filter(use => face.loops.includes(use.loop))) {
            assert.ok(use.pcurve);
            const { curve } = isolated.edges.find(edge => edge.id === use.edge);
            const [start, end] = curveDomain(curve), t = (start + end) / 2;
            const point = evaluateCurve(curve, t), [u, v] = evaluateCurve(use.pcurve, t);
            pointNear(evaluateSurface(face.surface, u, v), point);
            if (!i) continue;
            const [x, y, axial] = point, radius = Math.hypot(x, y), z = profile === radialY ? -axial : axial;
            if (tag === 'void-lower') near(z, 1);
            if (tag === 'void-upper') near(z, -1);
            if (tag === 'void-inner') near(radius, 20.5 - width / 2);
            if (tag === 'void-outer') near(radius, 21.5 - width / 2);
          }
        }
      }
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
    }
  }
});

test('closed trapezoid cavity requires clearance from the true sloped wall', () => {
  const path = joinedCircle(), section = hollowTrapezoid(4);
  const refuse = (profile, code, detail) => assert.throws(() => evaluateCadPart(document(path, profile)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  const withHoles = holes => ({ ...section, holes, sideTags: { outer: section.sideTags.outer,
    holes: holes.map((loop, i) => loop.map((_, j) => `void-${i}-${j}`)) } });
  for (const hole of [voidLoop(.5, 3), voidLoop(.5, 3, 3), voidLoop(1e-8)]) {
    refuse(withHoles([hole]), 'GEOMETRY', /trapezoidal sweep needs strictly positive wall clearance/);
  }
  for (const holes of [[voidLoop(), voidLoop(1.6, 1.8)], [lines([[.5, 2], [1.5, 2], [1, 4]])],
    [lines([[.5, 2], [1.5, 4], [1.5, 2], [.5, 4]])], [lines([[.5, 3], [1, 2], [1.5, 3], [1, 4]])]]) {
    refuse(withHoles(holes), 'CAPABILITY', /trapezoidal sweep accepts one axis-aligned rectangular cavity/);
  }
  refuse(hollowTrapezoid(40), 'PARAMETER', /trapezoidal sweep needs strictly positive radial clearance/);
});

const triangleVoid = (left, right) => lines([[left, -2], [right, -2], [right, -1], [left, -1]]);
const hollowTriangle = holes => ({ ...triangle, holes, sideTags: { ...triangle.sideTags,
  holes: holes.map((_, i) => i ? voidTags.map(tag => tag + i) : voidTags) } });

test('closed triangular Sweep preserves the six outer and eight rectangular cavity faces', () => {
  const path = joinedCircle(), hole = triangleVoid(-1.5, -.5), section = hollowTriangle([hole]);
  const reversed = { ...section, points: [...section.points].reverse(), holes: [[...hole].reverse()],
    sideTags: { outer: ['sloping-wall', 'radial-wall', 'axial-wall'], holes: [['void-upper', 'void-outer', 'void-lower', 'void-inner']] } };
  const radialY = { ...section, points: section.points.map(([x, y]) => [y, x]),
    holes: [lines(hole.map(({ start: [x, y] }) => [y, x]))],
    plane: { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [0, 0, 1] } };
  for (const profile of [section, reversed, radialY]) {
    const snapshot = evaluateCadPart(document(path, profile)), [output] = snapshot.outputs;
    const { brep } = output, report = checkBrep(brep, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.equal(output.representation, 'curved');
    assert.equal(report.topology[0].genus, 2);
    assert.deepEqual(report.counts, { bodies: 1, shells: 2, faces: 14, loops: 14, edges: 28, vertices: 14, coedges: 56 });
    assert.deepEqual(brep.shells.map(shell => shell.faces.length), [6, 8]);
    assert.ok(report.maximumPcurveGap < 1e-8);
    assert.ok(brep.coedges.every(use => use.pcurve));
    // Independently revolve area 12 at radius 20 - 2/3, less area 1 at radius 19.
    const z = (480 - 57) / 426 * (profile === radialY ? -1 : 1);
    for (const properties of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
      near(properties.volume, 426 * Math.PI);
      pointNear(properties.centroid, [0, 0, z]);
    }
    for (const [i, shell] of brep.shells.entries()) {
      const isolated = shellBrep(brep, shell), quadrature = brepQuadratureIntegrals(isolated, 8);
      assert.equal(quadrature.meshed, false);
      near(quadrature.integrals[0], (i ? -38 : 464) * Math.PI);
      for (const tag of i ? voidTags : triangle.sideTags.outer)
        assert.equal(isolated.faces.filter(face => face.name.includes(`[${tag}]`)).length, 2);
    }
    assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  }
});

test('closed triangular cavity rejects contact, crossing and unsupported apertures', () => {
  const path = joinedCircle();
  const refuse = (holes, code, detail) => assert.throws(() => evaluateCadPart(document(path, hollowTriangle(holes))),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  for (const hole of [triangleVoid(-2, -.5), triangleVoid(-2 + 1e-8, -.5), triangleVoid(.5, 1.5)])
    refuse([hole], 'GEOMETRY', /triangular sweep needs strictly positive wall clearance/);
  const valid = triangleVoid(-1.5, -.5);
  refuse([valid, triangleVoid(-1.9, -1.6)], 'CAPABILITY', /accepts one axis-aligned rectangular cavity/);
  refuse([lines([[-1.5, -2], [-1, -2.5], [-.5, -2], [-1, -1.5]])], 'CAPABILITY', /accepts one axis-aligned rectangular cavity/);
});
