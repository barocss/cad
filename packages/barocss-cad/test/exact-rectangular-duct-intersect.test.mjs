import assert from 'node:assert/strict';
import test from 'node:test';
import {
  booleanAnalytic, brepMassProperties, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, outputOf, reevaluate, saveCadPart,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';
import { locateInRegion } from '../dist/brep/curved-arrangement.js';
import { bindHalfRectangularDuctIntersection } from '../dist/brep/exact-rectangular-duct-intersect.js';

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} at tolerance ${tolerance}`);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const pointNear = (a, b, tolerance = 1e-10) => near(norm(sub(a, b)), 0, tolerance);
const withoutBindings = brep => ({ ...brep, coedges: brep.coedges.map(use => ({ ...use, pcurve: null })) });

function document(clockwise = true) {
  const poles = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
  const corners = [[-1, -2], [1, -2], [1, 2], [-1, 2]], ordered = clockwise ? corners.toReversed() : corners;
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { OuterLowX: -2, OuterHighX: 2, OpeningLowY: -2, OpeningHighY: 2 }, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [{ parameter: 'OuterLowX' }, -3], max: [{ parameter: 'OuterHighX' }, 3],
      holes: [ordered.map(([x, y]) => ({ kind: 'line', start: [x, { parameter: y < 0 ? 'OpeningLowY' : 'OpeningHighY' }] }))] },
    { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path: { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
      controlPoints: poles.map(([x, y]) => [20 * x, 20 * y, 0]), weights: poles.map((_, i) => i % 2 ? Math.SQRT1_2 : 1) } },
    { id: 'bs', kind: 'sketch', profile: 'rectangle', min: [0, -30], max: [30, 30] },
    { id: 'b', kind: 'extrude', sketch: 'bs', from: -5, height: 10 },
    { id: 'cut', kind: 'intersect', target: 'w', tool: 'b' },
  ] };
}

function nativeCapRegion(brep, cap, station) {
  const rings = cap.loops.map(id => {
    const loop = brep.loops.find(loop => loop.id === id);
    return { kind: loop.kind, segments: loop.coedges.map(id => {
      const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge), [lo, hi] = curveDomain(edge.curve);
      assert.equal(edge.curve.degree, 1);
      const p = evaluateCurve(edge.curve, use.sense === 'forward' ? lo : hi), q = evaluateCurve(edge.curve, use.sense === 'forward' ? hi : lo);
      near(p[0], 0); near(q[0], 0);
      return { kind: 'line', a: [p[1] - station, p[2]], b: [q[1] - station, q[2]] };
    }) };
  });
  return { outer: rings.find(ring => ring.kind === 'outer').segments, holes: [rings.find(ring => ring.kind === 'inner').segments] };
}

function verify(snapshot, outerWidth = 4, openingHeight = 4) {
  const [output] = snapshot.outputs, { brep } = output, report = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'analytic-boolean', id: 'cut' });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 10, loops: 12, edges: 24, coedges: 48, vertices: 16 });
  assert.equal(report.topology[0].genus, 1);
  assert.ok(report.maximumPcurveGap < 1e-10);
  const outerArea = outerWidth * 6, innerArea = 2 * openingHeight, area = outerArea - innerArea;
  const volume = area * 20 * Math.PI;
  near(massPropertiesOf(output).volume, volume, 2e-7);
  near(brepMassProperties(brep, 1).volume, volume, 2e-7);
  const radialMoment = (outerArea * (outerWidth / 2) ** 2 - innerArea) / 3;
  const centroid = [2 / Math.PI * (20 + radialMoment / (20 * area)), 0, 0];
  pointNear(massPropertiesOf(output).centroid, centroid, 1e-8);

  const caps = brep.faces.filter(face => face.loops.length === 2), capIds = new Set(caps.map(cap => cap.id));
  assert.equal(caps.length, 2);
  const stations = [];
  for (const cap of caps) {
    pointNear(faceGeometry(cap).n, [-1, 0, 0]);
    const loops = cap.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    assert.ok(loops.every(loop => loop.coedges.length === 4));
    const firstUse = brep.coedges.find(use => use.id === loops[0].coedges[0]), firstEdge = brep.edges.find(edge => edge.id === firstUse.edge);
    const station = Math.sign(firstEdge.curve.controlPoints[0][1]) * 20;
    stations.push(station);
    const region = nativeCapRegion(brep, cap, station);
    // Read native oriented loops: each cap has an open aperture and a material frame.
    for (const [point, expected] of [[[0, 0], 'out'], [[(1 + outerWidth / 2) / 2, 0], 'in'],
      [[0, (openingHeight / 2 + 3) / 2], 'in'], [[outerWidth / 2 + .5, 0], 'out'], [[1, 0], 'boundary']])
      assert.equal(locateInRegion(point, region, 1e-8), expected);
  }
  assert.deepEqual(stations.sort((a, b) => a - b), [-20, 20]);
  const cylinders = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder');
  assert.equal(cylinders.length, 4);
  const expectedRadii = [20 - outerWidth / 2, 19, 21, 20 + outerWidth / 2];
  const radii = cylinders.map(face => faceGeometry(face).r).sort((a, b) => a - b);
  radii.forEach((radius, i) => near(radius, expectedRadii[i]));
  for (const face of brep.faces.filter(face => !capIds.has(face.id))) {
    const d = evaluateSurfaceD1(face.surface, .25, .25), normal = scale(unit(cross(d.du, d.dv)), face.sense === 'forward' ? 1 : -1);
    const rho = Math.hypot(d.point[0], d.point[1]), axial = Math.abs(d.point[2]);
    const inner = Math.abs(rho - 19) < 1e-8 || Math.abs(rho - 21) < 1e-8 || Math.abs(axial - openingHeight / 2) < 1e-8;
    const geometry = faceGeometry(face), expected = geometry.kind === 'cylinder'
      ? scale(unit([d.point[0], d.point[1], 0]), Math.sign(rho - 20) * (inner ? -1 : 1))
      : [0, 0, Math.sign(d.point[2]) * (inner ? -1 : 1)];
    pointNear(normal, expected);
  }
  let arcs = 0, lines = 0;
  for (const edge of brep.edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
    assert.equal(uses.length, 2);
    assert.equal(uses[0].twin, uses[1].id); assert.equal(uses[1].twin, uses[0].id); assert.notEqual(uses[0].sense, uses[1].sense);
    if (edge.curve.degree === 2) arcs++; else lines++;
    for (const use of uses) {
      assert.ok(use.pcurve);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      for (const fraction of [0, .17, .5, .77, 1]) {
        const t = domain[0] + fraction * (domain[1] - domain[0]), p = evaluateCurve(edge.curve, t), [u, v] = evaluateCurve(use.pcurve, t);
        assert.ok(p[0] >= -1e-10);
        pointNear(evaluateSurface(face.surface, u, v), p);
      }
      if (edge.curve.degree === 2 && faceGeometry(face).kind === 'plane') {
        assert.equal(use.pcurve.degree, 2);
        assert.deepEqual(use.pcurve.knots, edge.curve.knots); assert.deepEqual(use.pcurve.weights, edge.curve.weights);
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id);
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.minimumAngleDegrees, 90, 1e-8); near(continuity.maximumAngleDegrees, 90, 1e-8);
  }
  assert.equal(arcs, 8); assert.equal(lines, 16);
  return brep;
}

test('centered rectangular duct Intersect binds both four-edge apertures and all 24 native 90 degree joints', () => {
  for (const clockwise of [false, true]) {
    const snapshot = evaluateCadPart(document(clockwise)), brep = verify(snapshot);
    const operands = evaluateCadPart({ ...snapshot.document, features: snapshot.document.features.slice(0, 4) });
    const source = outputOf(operands, 'w').brep, box = outputOf(operands, 'b').brep;
    const original = booleanAnalytic(source, box, 'intersection', { id: 'cut', exactEdges: false });
    assert.ok(original.coedges.every(use => !use.pcurve));
    assert.deepEqual(withoutBindings(brep), withoutBindings(original), 'only native coedge chart bindings can change');
    const reopened = loadCadPart(saveCadPart(snapshot));
    assert.deepEqual(reopened.document, snapshot.document); assert.deepEqual(reopened.outputs[0].brep, brep);
  }
});

test('centered opening and outer width edits retain native aperture dimensions, volume and saved bindings', () => {
  const initial = evaluateCadPart(document()), edited = reevaluate(initial, { parameters: { OpeningLowY: -1, OpeningHighY: 1 } });
  verify(edited, 4, 2);
  const expanded = reevaluate(edited, { parameters: { OuterLowX: -3, OuterHighX: 3 } });
  verify(expanded, 6, 2);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { parameters: { OuterLowX: -3, OuterHighX: 3 } }).outputs[0].brep, expanded.outputs[0].brep);
  assert.deepEqual(reevaluate(reopened, { parameters: { OpeningLowY: -2, OpeningHighY: 2 } }).outputs[0].brep, initial.outputs[0].brep);
});

test('duct binding refuses missing source charts, wrong source family, offset boxes, malformed apertures and deformed cylinders', () => {
  const snapshot = evaluateCadPart(document()), operands = evaluateCadPart({ ...snapshot.document, features: snapshot.document.features.slice(0, 4) });
  const source = outputOf(operands, 'w').brep, box = outputOf(operands, 'b').brep;
  const result = snapshot.outputs[0].brep, tolerance = 1e-6;
  assert.equal(bindHalfRectangularDuctIntersection(withoutBindings(source), box, result, tolerance), undefined);
  assert.equal(bindHalfRectangularDuctIntersection({ ...source, source: { family: 'manual', id: 'w' } }, box, result, tolerance), undefined);
  const offset = evaluateCadPart({ ...document(), features: document().features.slice(0, 4).map(feature => feature.id === 'bs' ? { ...feature, min: [1, -30] } : feature) });
  assert.equal(bindHalfRectangularDuctIntersection(source, outputOf(offset, 'b').brep, result, tolerance), undefined);
  const loop = result.loops.find(loop => loop.kind === 'inner'), loops = result.loops.map(candidate => candidate === loop ? { ...loop, kind: 'outer' } : candidate);
  assert.equal(bindHalfRectangularDuctIntersection(source, box, { ...result, loops }, tolerance), undefined);
  const face = result.faces.find(face => faceGeometry(face).kind === 'cylinder');
  const controlPoints = face.surface.controlPoints.map((row, i) => i === 1 ? row.map(([x, y, z]) => [x + .01, y, z]) : row);
  const faces = result.faces.map(candidate => candidate === face ? { ...face, surface: { ...face.surface, controlPoints } } : candidate);
  assert.equal(bindHalfRectangularDuctIntersection(source, box, { ...result, faces }, tolerance), undefined);
  const swapped = document(); swapped.features[4] = { ...swapped.features[4], target: 'b', tool: 'w' };
  verify(evaluateCadPart(swapped));
});
