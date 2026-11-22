import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, faceGeometry, loadCadPart,
  massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';
import { booleanAnalyticTraced } from '../dist/brep/analytic-boolean.js';
import { circleOf } from '../dist/brep/brep-tessellate.js';
import { halfRingFilletReferenceRims } from '../dist/brep/exact-ring-intersect.js';

const R = 20;
const near = (actual, expected, tolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected} at tolerance ${tolerance}`);
const doc = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });

function features({ offset = 1, radius = 2, angle = 0, swapped = false } = {}) {
  const c = Math.cos(angle * Math.PI / 180), s = Math.sin(angle * Math.PI / 180), w = Math.cos(Math.PI / 4);
  const knots = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4];
  const ring = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
  const controlPoints = ring.map(([x, y]) => [R * (x * c - y * s), R * (x * s + y * c), 0]);
  return [
    { kind: 'sketch', id: 'disk', profile: 'circle', center: [0, 0], radius },
    { kind: 'sweep-curve', id: 'ring', sketch: 'disk', mode: 'exact',
      path: { degree: 2, knots, controlPoints, weights: [1, w, 1, w, 1, w, 1, w, 1] } },
    { kind: 'sketch', id: 'boxSketch', profile: 'rectangle', min: [offset, -30], max: [30, 30] },
    { kind: 'extrude', id: 'box', sketch: 'boxSketch', from: -5, height: 10 },
    { kind: 'intersect', id: 'cut', target: swapped ? 'box' : 'ring', tool: swapped ? 'ring' : 'box' },
  ];
}

/** Integrate the angular portion of each annular strip inside the circular tube section. */
function volume(offset, radius) {
  const n = 2048, h = Math.PI / n;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * h, rho = R + radius * Math.cos(t);
    sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * Math.sin(t) ** 2 * rho * Math.acos(offset / rho);
  }
  return 4 * radius ** 2 * sum * h / 3;
}

function verify(output, original, offset, radius) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology[0].genus, 0);
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, edges: 70, coedges: 140, vertices: 66 });
  assert.ok(check.maximumPcurveGap < 1e-10);
  assert.ok(brep.coedges.every(use => use.pcurve));
  assert.equal(halfRingFilletReferenceRims(brep), undefined);
  const expected = volume(offset, radius);
  near(massPropertiesOf(output).volume, expected, 1e-6);
  near(brepMassProperties(brep, 1).volume, expected, 1e-6);

  const capSigns = new Set(), caps = new Set(), facesByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face])));
  for (const face of brep.faces) {
    const plane = faceGeometry(face);
    if (plane.kind !== 'plane') {
      assert.deepEqual(face.surface, original.faces.find(candidate => candidate.surface.id === face.surface.id)?.surface);
      continue;
    }
    assert.deepEqual(plane.n, [-1, 0, 0]);
    near(plane.o[0], offset, 1e-10);
    assert.equal(face.loops.length, 1);
    const outer = brep.loops.find(loop => loop.id === face.loops[0]);
    assert.equal(outer.kind, 'outer');
    assert.equal(outer.coedges.length, 32);
    const uses = outer.coedges.map(id => brep.coedges.find(use => use.id === id));
    const edges = uses.map(use => brep.edges.find(edge => edge.id === use.edge));
    const samples = edges.flatMap(edge => {
      const [a, b] = curveDomain(edge.curve);
      return [a, (a + b) / 2, b].map(u => evaluateCurve(edge.curve, u));
    });
    const sign = Math.sign(samples[0][1]);
    assert.ok(samples.every(point => Math.sign(point[1]) === sign));
    near(Math.min(...samples.map(point => Math.abs(point[1]))), Math.sqrt((R - radius) ** 2 - offset ** 2), 1e-9);
    near(Math.max(...samples.map(point => Math.abs(point[1]))), Math.sqrt((R + radius) ** 2 - offset ** 2), 1e-9);
    capSigns.add(sign);
    caps.add(face.id);
  }
  assert.deepEqual([...capSigns].sort(), [-1, 1]);
  assert.equal(caps.size, 2);

  let fitted = 0, exact = 0;
  for (const edge of brep.edges) {
    const native = measureBrepEdgeContinuity(brep, edge.id);
    assert.equal(native.status, 'measured', JSON.stringify(native));
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    const rim = uses.some(use => caps.has(facesByLoop.get(use.loop).id));
    for (const use of uses) assert.deepEqual(curveDomain(use.pcurve), curveDomain(edge.curve));
    if (!rim) {
      assert.ok(circleOf(edge.curve));
      near(native.maximumAngleDegrees, 0, 1e-8);
      exact++;
      continue;
    }
    assert.equal(edge.curve.degree, 3);
    assert.equal(circleOf(edge.curve), null);
    const [a, b] = curveDomain(edge.curve);
    for (let i = 0; i <= 16; i++) {
      const [x, y, z] = evaluateCurve(edge.curve, a + (b - a) * i / 16);
      near(x, offset, 1e-9);
      near(Math.hypot(Math.hypot(x, y) - R, z), radius, 1e-8);
    }
    for (const { parameter, angleDegrees } of native.samples) {
      const [x, y] = evaluateCurve(edge.curve, parameter), rho = Math.hypot(x, y);
      const expectedAngle = Math.acos(-offset * (rho - R) / (radius * rho)) * 180 / Math.PI;
      near(angleDegrees, expectedAngle, 1e-7);
    }
    fitted++;
  }
  assert.equal(fitted, 64);
  assert.equal(exact, 6);
}

test('an offset box rebuilds both fitted rims and all six exact toroidal seams of the aligned ring', () => {
  const part = features();
  const ring = evaluateCadPart(doc(part.slice(0, 2))).outputs[0];
  verify(evaluateCadPart(doc(part)).outputs[0], ring.brep, 1, 2);
  const stock = evaluateCadPart(doc(part.slice(0, 4))).outputs;
  const traced = booleanAnalyticTraced(stock[0].brep, stock[1].brep, 'intersection', { id: 'cut' });
  assert.equal(traced.complete, true);
  assert.equal(traced.faceSources.size, 6);
});

test('a 29° authored rail retains both rim bindings through offset and diameter edits and a fresh open', () => {
  const first = features({ angle: 29 });
  const offset = features({ angle: 29, offset: 2 });
  const larger = features({ angle: 29, offset: 2, radius: 3 });
  const original = evaluateCadPart(doc(first.slice(0, 2))).outputs[0].brep;
  const enlarged = evaluateCadPart(doc(larger.slice(0, 2))).outputs[0].brep;
  const a = evaluateCadPart(doc(first));
  verify(a.outputs[0], original, 1, 2);
  const b = reevaluate(a, { document: doc(offset) });
  verify(b.outputs[0], original, 2, 2);
  const c = reevaluate(b, { document: doc(larger) });
  verify(c.outputs[0], enlarged, 2, 3);
  const d = reevaluate(c, { document: doc(features({ angle: 29, radius: 3 })) });
  verify(d.outputs[0], enlarged, 1, 3);
  const opened = loadCadPart(saveCadPart(d));
  assert.deepEqual(opened.document, d.document);
  assert.deepEqual(opened.outputs[0].brep, d.outputs[0].brep);
});

test('branch-crossing offset keeps the valid generic topology without claiming fitted bindings', () => {
  const [output] = evaluateCadPart(doc(features({ angle: -3 }))).outputs;
  assert.ok(checkBrep(output.brep, { strict: true }).valid);
  assert.ok(output.brep.coedges.every(use => !use.pcurve));
  assert.equal(halfRingFilletReferenceRims(output.brep), undefined);
});
