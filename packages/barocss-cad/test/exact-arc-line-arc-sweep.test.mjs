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
  refused(rail({ secondInward: [0, 0, 1] }).curve, 'CAPABILITY', /two coplanar circular arcs of opposite curvature/);
  refused(rail({ sameTurn: true }).curve, 'CAPABILITY', /two coplanar circular arcs of opposite curvature/);
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

test('the spaced S-bend preserves an exact through bore, eight tangent seams and edited reopen identity', () => {
  const path = rail(), initial = evaluateCadPart(document(path.curve, boreSection(1)));
  const firstMass = verify(initial.outputs[0], path, 2, 1);
  const edited = reevaluate(initial, { document: document(path.curve, boreSection(1.5)) });
  const editedMass = verify(edited.outputs[0], path, 2, 1.5);
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

test('the spaced annulus enforces concentricity and native wall clearance without admitting other sections', () => {
  const path = rail(), refused = (section, code, detail) => assert.throws(() => evaluateCadPart(document(path.curve, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  refused(boreSection(1, [8.25, -4]), 'GEOMETRY', /bore concentric/);
  for (const radius of [2 - 5e-7, 2, 2.1]) refused(boreSection(radius), 'GEOMETRY', /strictly positive wall clearance/);
  refused(boreSection(.005), 'PARAMETER', /hole radius of at least 0.01/);
  for (const [firstRadius, secondRadius] of [[2, 18], [12, 2]])
    assert.throws(() => evaluateCadPart(document(rail({ firstRadius, secondRadius }).curve, boreSection(1))),
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
