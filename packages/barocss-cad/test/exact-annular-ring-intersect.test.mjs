import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry,
  loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';
import { circleOf } from '../dist/brep/brep-tessellate.js';

const R = 20;
const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} at tolerance ${tolerance}`);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const pointNear = (a, b, tolerance = 1e-10) => near(norm(sub(a, b)), 0, tolerance);

function document({ angle = 0, swapped = false, minX = 0, phase = [1, 0], direction = 'ccw' } = {}) {
  const c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180);
  const poles = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
  const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    controlPoints: poles.map(([x, y]) => [R * (x * c - y * s), R * (x * s + y * c), 0]),
    weights: poles.map((_, i) => i % 2 ? Math.SQRT1_2 : 1) };
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { OuterRadius: 2, InnerRadius: 1 }, features: [
    { kind: 'sketch', id: 'annulus', profile: 'circle', center: [0, 0], radius: { parameter: 'OuterRadius' },
      holes: [[{ kind: 'arc', center: [0, 0], start: [phase[0] === 1 ? { parameter: 'InnerRadius' } : phase[0], phase[1]], direction }]] },
    { kind: 'sweep-curve', id: 'ring', sketch: 'annulus', path, mode: 'exact' },
    { kind: 'sketch', id: 'boxSketch', profile: 'rectangle', min: [minX, -30], max: [30, 30] },
    { kind: 'extrude', id: 'box', sketch: 'boxSketch', from: -5, height: 10 },
    { kind: 'intersect', id: 'cut', target: swapped ? 'box' : 'ring', tool: swapped ? 'ring' : 'box' },
  ] };
}

function verify(snapshot, outer = 2, inner = 1, walls = 8) {
  const [output] = snapshot.outputs, { brep } = output, report = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'analytic-boolean', id: 'cut' });
  assert.ok(report.valid, report.issues.join('\n'));
  const faces = walls + 2;
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces, loops: faces + 2, coedges: 4 * faces, edges: 2 * faces, vertices: faces + 2 });
  assert.equal(report.topology[0].genus, 1);
  assert.ok(report.maximumPcurveGap < 1e-10);
  assert.ok(report.maximumVertexGap < 1e-10);
  const volume = Math.PI ** 2 * R * (outer ** 2 - inner ** 2);
  near(massPropertiesOf(output).volume, volume, 2e-7);
  near(brepMassProperties(brep, 1).volume, volume, 2e-7);
  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane'), capIds = new Set(caps.map(face => face.id));
  assert.equal(caps.length, 2);
  const stations = [];
  for (const cap of caps) {
    pointNear(faceGeometry(cap).n, [-1, 0, 0]);
    const loops = cap.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    let station;
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 2);
      let sweep = 0;
      for (const id of loop.coedges) {
        const use = brep.coedges.find(candidate => candidate.id === id), edge = brep.edges.find(candidate => candidate.id === use.edge);
        const circle = circleOf(edge.curve);
        assert.ok(circle);
        assert.equal(edge.curve.degree, 2);
        assert.equal(edge.curve.controlPoints.length, 5);
        assert.equal(use.pcurve.degree, 2);
        assert.deepEqual(use.pcurve.weights, edge.curve.weights);
        assert.deepEqual(use.pcurve.knots, edge.curve.knots);
        near(circle.r, loop.kind === 'inner' ? inner : outer);
        near(circle.c[0], 0); near(circle.c[2], 0); near(Math.abs(circle.c[1]), R);
        if (station !== undefined) near(circle.c[1], station);
        station = circle.c[1];
        sweep += circle.spans.reduce((sum, span) => sum + span.phi, 0);
      }
      near(sweep, 2 * Math.PI);
    }
    stations.push(Math.sign(station));
  }
  assert.deepEqual(stations.sort(), [-1, 1]);
  let inward = 0, outward = 0, rims = 0;
  for (const face of brep.faces.filter(face => !capIds.has(face.id))) {
    const d = evaluateSurfaceD1(face.surface, .25, .25), radial = unit([d.point[0], d.point[1], 0]);
    const delta = sub(d.point, scale(radial, R)), radius = norm(delta);
    const isInner = Math.abs(radius - inner) < 1e-9;
    near(radius, isInner ? inner : outer);
    const normal = scale(unit(cross(d.du, d.dv)), face.sense === 'forward' ? 1 : -1);
    pointNear(normal, scale(unit(delta), isInner ? -1 : 1));
    if (isInner) inward++; else outward++;
  }
  assert.equal(inward, walls / 2); assert.equal(outward, walls / 2);
  for (const edge of brep.edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
    assert.equal(uses.length, 2); assert.notEqual(uses[0].sense, uses[1].sense);
    for (const use of uses) {
      assert.ok(use.pcurve);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      for (const f of [0, .17, .5, .77, 1]) {
        const t = domain[0] + (domain[1] - domain[0]) * f, point = evaluateCurve(edge.curve, t), [u, v] = evaluateCurve(use.pcurve, t);
        assert.ok(point[0] >= -1e-10);
        pointNear(evaluateSurface(face.surface, u, v), point);
      }
    }
    const measured = measureBrepEdgeContinuity(brep, edge.id);
    assert.equal(measured.status, 'measured', JSON.stringify(measured));
    const rim = measured.faces.some(face => capIds.has(face.id));
    if (rim) rims++;
    near(measured.maximumAngleDegrees, rim ? 90 : 0, 1e-8);
  }
  assert.equal(rims, 8);
  return brep;
}

test('centered annular Intersect retains both rational cap rims, inward walls, and every native edge binding', () => {
  for (const [angle, walls, direction, phase] of [[0, 8, 'ccw', [1, 0]], [29, 8, 'ccw', [1, 0]],
    [90, 4, 'ccw', [1, 0]], [0, 8, 'cw', [1, 0]], [90, 4, 'cw', [-1, 0]]]) {
    const snapshot = evaluateCadPart(document({ angle, direction, phase })), brep = verify(snapshot, 2, 1, walls);
    const reopened = loadCadPart(saveCadPart(snapshot));
    assert.deepEqual(reopened.document, snapshot.document);
    assert.deepEqual(reopened.outputs[0].brep, brep);
    verify(reopened, 2, 1, walls);
  }
});

test('annular ID/OD edits, clockwise bore, swapped operands and native reopen keep their exact bindings', () => {
  const initial = evaluateCadPart(document({ angle: 29, direction: 'cw', swapped: true }));
  verify(initial);
  const edited = reevaluate(initial, { parameters: { InnerRadius: 1.5 } });
  verify(edited, 2, 1.5);
  const expanded = reevaluate(edited, { parameters: { OuterRadius: 3 } });
  verify(expanded, 3, 1.5);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { parameters: { OuterRadius: 3 } }).outputs[0].brep, expanded.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { parameters: { InnerRadius: 1 } }).outputs[0].brep, initial.outputs[0].brep);
});

test('offset annular and phased bore cuts do not acquire the centered cardinal-profile certificate', () => {
  for (const options of [{ minX: 3 }, { phase: [.6, .8], direction: 'cw' }]) {
    const [{ brep }] = evaluateCadPart(document(options)).outputs;
    assert.ok(checkBrep(brep, { strict: true }).valid);
    assert.ok(brep.coedges.every(use => !use.pcurve));
  }
});

test('annular quarter-knot measurement refuses unqualified bodies, bad cap loops and unequal one-sided tangents', () => {
  const [{ brep }] = evaluateCadPart(document()).outputs;
  const use = brep.coedges.find(candidate => candidate.pcurve?.degree === 1
    && candidate.pcurve.controlPoints.every(point => point[0] === .5));
  assert.ok(use);
  const face = brep.faces.find(candidate => candidate.loops.includes(use.loop));
  assert.throws(() => evaluateSurfaceD1(face.surface, .5, .25), /exact C0 interior knot/);
  assert.equal(measureBrepEdgeContinuity(brep, use.edge).status, 'measured');
  assert.equal(measureBrepEdgeContinuity({ ...brep, source: { family: 'manual', id: 'cut' } }, use.edge).reason, 'derivative-unavailable');
  const cap = brep.faces.find(candidate => candidate.loops.length === 2);
  const innerLoop = brep.loops.find(loop => cap.loops.includes(loop.id) && loop.kind === 'inner');
  const loops = brep.loops.map(loop => loop === innerLoop ? { ...loop, kind: 'outer' } : loop);
  assert.equal(measureBrepEdgeContinuity({ ...brep, loops }, use.edge).reason, 'derivative-unavailable');
  const controlPoints = face.surface.controlPoints.map((row, i) => i === 1 ? row.map(([x, y, z]) => [x, y, z + .01]) : row);
  const faces = brep.faces.map(candidate => candidate === face ? { ...face, surface: { ...face.surface, controlPoints } } : candidate);
  assert.equal(measureBrepEdgeContinuity({ ...brep, faces }, use.edge).reason, 'derivative-unavailable');
});
