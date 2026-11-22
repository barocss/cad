import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CadPartError, brepMassProperties, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, faceGeometry, loadCadPart,
  massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';
import { planHalfRingFillet, retainHalfRingFilletCharts, separateHalfRingFilletTools } from '../dist/brep/exact-ring-intersect.js';
import { setRingTrace } from '../dist/blend/rolling-ball.js';
import { curveReversed } from '../dist/nurbs/curves/curve-segment.js';

const R = 20, r = 2, w = Math.cos(Math.PI / 4);
const half = Math.PI ** 2 * R * r ** 2;
const target = ['box.side3#2|ring.side0#2', 'box.side3#2|ring.side1#2'];
const other = ['box.side3#1|ring.side0#1', 'box.side3#1|ring.side1#1'];
const doc = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });
const add = (a, b) => a.map((x, i) => x + b[i]);
const scale = (a, s) => a.map(x => x * s);
const sub = (a, b) => add(a, scale(b, -1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const near = (a, b, tolerance) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);

const stockFeatures = [
  { kind: 'sketch', id: 'disk', profile: 'circle', center: [0, 0], radius: r },
  { kind: 'sweep-curve', id: 'ring', sketch: 'disk', mode: 'exact', path: {
    degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    controlPoints: [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0], [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]],
    weights: [1, w, 1, w, 1, w, 1, w, 1],
  } },
  { kind: 'sketch', id: 'boxSketch', profile: 'rectangle', min: [0, -30], max: [30, 30] },
  { kind: 'extrude', id: 'box', sketch: 'boxSketch', from: -5, height: 10 },
  { kind: 'intersect', id: 'cut', target: 'ring', tool: 'box' },
];
const fillet = (radius, edges = target) => doc([...stockFeatures, { kind: 'fillet', id: 'f', target: 'cut', edges, radius }]);

function rollingBall(t, f) {
  const c = Math.cos(t), s = Math.sin(t), rho = R + (r - f) * c;
  const center = [f, Math.sqrt(rho * rho - f * f), (r - f) * s];
  const direction = [0, center[1] / rho * c, s];
  return { center, side: scale(direction, 1 / norm(direction)), angle: Math.acos(-f / rho * c), bend: Math.asin(f / rho) };
}

/** Integrate the ideal blend and old torus flux using the divergence field (X, 0, 0). The cap contributes zero. */
function materialRemoved(f) {
  const capNormal = [-1, 0, 0], n = 128, m = 64, h = 1e-4;
  const at = ({ center, side, angle }, u) => add(center, scale(add(scale(capNormal, Math.cos(angle * u)), scale(side, Math.sin(angle * u))), f));
  let oldFlux = 0, blendFlux = 0;
  for (let i = 0; i < n; i++) {
    const t = i * 2 * Math.PI / n, state = rollingBall(t, f), before = rollingBall(t - h, f), after = rollingBall(t + h, f);
    const rho = R + r * Math.cos(t), { bend, angle, side } = state;
    oldFlux += r * Math.cos(t) * rho ** 2 * (bend / 2 - Math.sin(2 * bend) / 4);
    for (let j = 0; j <= m; j++) {
      const u = j / m, swing = angle * u, x = at(state, u)[0];
      const du = scale(add(scale(capNormal, -Math.sin(swing)), scale(side, Math.cos(swing))), f * angle);
      const dt = scale(sub(at(after, u), at(before, u)), 1 / (2 * h));
      const weight = j === 0 || j === m ? 1 : j % 2 ? 4 : 2;
      blendFlux -= weight * x * Math.cos(swing) * norm(cross(dt, du)) / (3 * m);
    }
  }
  return (oldFlux - blendFlux) * 2 * Math.PI / n;
}

const chart = ({ degreeU, degreeV, knotsU, knotsV, weights, controlPoints }) => ({ degreeU, degreeV, knotsU, knotsV, weights, controlPoints });
const coefficients = ({ degree, knots, weights, controlPoints }) => ({ degree, knots, weights, controlPoints });

function inspectFillet(output, stock, radius) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology[0].genus, 0);
  assert.equal(check.counts.bodies, 1);
  assert.equal(check.counts.shells, 1);
  assert.ok(check.maximumPcurveGap < 1e-10);
  assert.ok(check.maximumEdgeSurfaceGap < 6e-7);
  assert.deepEqual([...output.filletTargets].sort(), target);
  assert.equal(output.fillet.length, 1);
  const [fit] = output.fillet;
  assert.deepEqual([...fit.edges].sort(), target);
  assert.ok(fit.patches > 1 && fit.stations > fit.patches);
  assert.ok(fit.contact < 2e-7 && fit.section < 2e-7 && fit.ball < 1e-8 && fit.normal < 3e-5);
  const expected = half - materialRemoved(radius);
  near(massPropertiesOf(output).volume, expected, 1e-6);
  near(brepMassProperties(brep, 1).volume, expected, 1e-6);
  assert.equal(massPropertiesOf(output).method, 'quadrature');

  const preserved = stock.edges.filter(edge => edge.curve.controlPoints.every(point => point[1] <= 1e-10));
  assert.equal(preserved.length, 6);
  for (const original of preserved) {
    const edge = brep.edges.find(candidate => candidate.name === original.name);
    assert.ok(edge);
    assert.deepEqual(coefficients(edge.curve), coefficients(original.curve));
    const report = measureBrepEdgeContinuity(brep, edge.id);
    assert.equal(report.status, 'measured', JSON.stringify(report));
    near(report.maximumAngleDegrees, edge.name.includes('box.side3#1') ? 90 : 0, 1e-8);
  }
  assert.equal(brep.coedges.filter(use => use.pcurve).length, 2 * preserved.length);
  assert.equal(brep.edges.some(edge => target.includes(edge.name)), false);
  const preservedFaces = stock.faces.filter(face => face.name === 'box.side3#1' || faceGeometry(face).kind !== 'plane');
  assert.equal(preservedFaces.length, 5);
  for (const original of preservedFaces) {
    const surviving = brep.faces.find(face => face.name === original.name);
    assert.ok(surviving);
    assert.deepEqual(chart(surviving.surface), chart(original.surface));
    assert.equal(surviving.sense, original.sense);
  }

  const facesByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face])));
  let capContacts = 0, torusContacts = 0;
  for (const edge of brep.edges) {
    const incident = brep.coedges.filter(use => use.edge === edge.id).map(use => facesByLoop.get(use.loop));
    if (!incident.some(face => face.name.startsWith('f.face'))) continue;
    const cap = incident.some(face => face.name === 'box.side3#2');
    const torus = incident.some(face => face.name.startsWith('ring.side'));
    if (!cap && !torus) continue;
    if (cap) capContacts++; else torusContacts++;
    assert.ok(brep.coedges.filter(use => use.edge === edge.id).every(use => !use.pcurve));
    const [lo, hi] = curveDomain(edge.curve);
    for (let i = 0; i <= 16; i++) {
      const [x, y, z] = evaluateCurve(edge.curve, lo + (hi - lo) * i / 16), rho = Math.hypot(x, y);
      assert.ok(y > 0 && x >= -1e-7 && x < 2 * radius);
      if (cap) {
        near(x, 0, 2e-7);
        near(Math.hypot(Math.hypot(y, radius) - R, z), r - radius, 2e-7);
      } else {
        near(Math.hypot(rho - R, z), r, 2e-7);
        near(x * (1 - radius * (rho - R) / (r * rho)), radius, 2e-7);
      }
    }
  }
  assert.ok(capContacts >= 2 && torusContacts >= 2);
}

test('rounding the complete transverse cap keeps the other cap and six exact measured edges across edits', () => {
  const stock = evaluateCadPart(doc(stockFeatures)).outputs[0].brep;
  const first = evaluateCadPart(fillet(.5, target.slice(0, 1)));
  inspectFillet(first.outputs[0], stock, .5);
  const next = reevaluate(first, { document: fillet(.75) });
  inspectFillet(next.outputs[0], stock, .75);
  const reopened = loadCadPart(saveCadPart(next));
  assert.deepEqual(reopened.document, next.document);
  assert.deepEqual(reopened.outputs[0].brep, next.outputs[0].brep);
});

test('the complete rim refuses singular and oversize radii including an auto-expanded single selection', () => {
  for (const radius of [2, 3]) for (const selected of [target, target.slice(0, 1)]) {
    assert.throws(() => evaluateCadPart(fillet(radius, selected)), error => error instanceof CadPartError
      && error.feature === 'f' && error.code === 'CONTACT_LEAVES_FACE'
      && /complete half-ring rim fillet needs a radius smaller than the 2 mm tube radius/.test(error.message));
  }
});

test('exact chart transfer honors a reversed canonical edge and skips an altered curve', () => {
  const stock = evaluateCadPart(doc(stockFeatures)).outputs[0].brep;
  const [{ brep }] = evaluateCadPart(fillet(.5)).outputs;
  const plan = planHalfRingFillet(stock, target);
  assert.ok(plan);
  const opposite = brep.edges.find(edge => edge.name === 'box.side3#1|ring.side0#1');
  const seam = brep.edges.find(edge => edge.name === 'ring.side0#1|ring.side1#1#1');
  const edges = brep.edges.map(edge => {
    if (edge === opposite) return { ...edge, vertices: [...edge.vertices].reverse(), curve: curveReversed(edge.curve) };
    if (edge === seam) {
      const controlPoints = edge.curve.controlPoints.map(([x, y, z], i) => i === 1 ? [x, y, z + 1e-9] : [x, y, z]);
      return { ...edge, curve: { ...edge.curve, controlPoints } };
    }
    return edge;
  });
  const coedges = brep.coedges.map(use => ({ ...use, pcurve: null,
    sense: use.edge === opposite.id ? use.sense === 'forward' ? 'reversed' : 'forward' : use.sense }));
  const result = retainHalfRingFilletCharts({ ...brep, edges, coedges }, plan);
  assert.ok(checkBrep(result, { strict: true }).valid);
  assert.equal(result.coedges.filter(use => use.pcurve).length, 10);
  for (const use of result.coedges.filter(use => use.edge === seam.id)) assert.equal(use.pcurve, null);
  const report = measureBrepEdgeContinuity(result, opposite.id);
  assert.equal(report.status, 'measured', JSON.stringify(report));
  near(report.maximumAngleDegrees, 90, 1e-8);
});

function inspectPairedFillets(output, stock, radius) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 22, loops: 22, coedges: 108, edges: 54, vertices: 34 });
  assert.equal(check.topology[0].genus, 0);
  assert.ok(check.maximumPcurveGap < 1e-10);
  assert.ok(check.maximumEdgeSurfaceGap < 6e-7);
  assert.deepEqual([...output.filletTargets].sort(), [...other, ...target].sort());
  assert.deepEqual(output.fillet.map(fit => [...fit.edges].sort().join(',')).sort(),
    [other.join(','), target.join(',')].sort());
  for (const fit of output.fillet) {
    assert.ok(fit.patches === 8 && fit.stations > fit.patches);
    assert.ok(fit.contact < 2e-7 && fit.section < 2e-7 && fit.ball < 1e-8 && fit.normal < 3e-5);
  }
  const expected = half - 2 * materialRemoved(radius), mass = massPropertiesOf(output);
  assert.equal(mass.method, 'quadrature');
  near(mass.volume, expected, 2e-6);
  near(brepMassProperties(brep, 1).volume, expected, 2e-6);
  near(mass.centroid[1], 0, 1e-8);
  near(mass.centroid[2], 0, 1e-8);

  const capNames = new Set(brep.faces.filter(face => faceGeometry(face).kind === 'plane').map(face => face.name));
  assert.deepEqual([...capNames].sort(), ['box.side3#1', 'box.side3#2']);
  for (const original of stock.faces.filter(face => faceGeometry(face).kind !== 'plane')) {
    const inherited = brep.faces.find(face => face.name === original.name);
    assert.ok(inherited);
    assert.equal(inherited.sense, original.sense);
    assert.deepEqual(chart(inherited.surface), chart(original.surface));
  }
  const originalSeams = stock.edges.filter(edge => edge.curve.controlPoints.every(point => Math.abs(point[1]) <= 1e-10));
  assert.equal(originalSeams.length, 2);
  assert.equal(brep.coedges.filter(use => use.pcurve).length, 4);
  for (const original of originalSeams) {
    const inherited = brep.edges.find(edge => edge.name === original.name);
    assert.ok(inherited);
    assert.deepEqual(coefficients(inherited.curve), coefficients(original.curve));
    const measured = measureBrepEdgeContinuity(brep, inherited.id);
    assert.equal(measured.status, 'measured', JSON.stringify(measured));
    near(measured.maximumAngleDegrees, 0, 1e-8);
  }

  const facesByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face])));
  const contacts = new Map([[-1, { cap: 0, torus: 0 }], [1, { cap: 0, torus: 0 }]]);
  for (const edge of brep.edges) {
    const uses = brep.coedges.filter(use => use.edge === edge.id), incident = uses.map(use => facesByLoop.get(use.loop));
    if (!incident.some(face => face.name.startsWith('f.face'))) continue;
    const cap = incident.find(face => capNames.has(face.name));
    if (!cap && !incident.some(face => face.name.startsWith('ring.side'))) continue;
    assert.ok(uses.every(use => !use.pcurve));
    const [lo, hi] = curveDomain(edge.curve);
    const side = Math.sign(evaluateCurve(edge.curve, (lo + hi) / 2)[1]);
    if (cap) {
      assert.equal(cap.name, side > 0 ? 'box.side3#2' : 'box.side3#1');
      contacts.get(side).cap++;
    } else contacts.get(side).torus++;
    for (let i = 0; i <= 16; i++) {
      const [x, y, z] = evaluateCurve(edge.curve, lo + (hi - lo) * i / 16);
      assert.ok(side * y > 0 && x >= -1e-7 && x < 2 * radius);
      if (cap) {
        near(x, 0, 2e-7);
        near(Math.hypot(Math.hypot(y, radius) - R, z), r - radius, 2e-7);
      } else {
        const rho = Math.hypot(x, y);
        near(Math.hypot(rho - R, z), r, 2e-7);
        near(x * (1 - radius * (rho - R) / (r * rho)), radius, 2e-7);
      }
    }
  }
  for (const end of contacts.values()) assert.ok(end.cap >= 2 && end.torus >= 2);
}

test('one constant fillet rounds both distinct half-ring rims and preserves the exact bend seams', () => {
  const stock = evaluateCadPart(doc(stockFeatures)).outputs[0].brep;
  const picks = [target[0], other[0]];
  const first = evaluateCadPart(fillet(.5, picks));
  inspectPairedFillets(first.outputs[0], stock, .5);
  const next = reevaluate(first, { document: fillet(.75, picks) });
  inspectPairedFillets(next.outputs[0], stock, .75);
  const reopened = loadCadPart(saveCadPart(next));
  assert.deepEqual(reopened.document, next.document);
  assert.deepEqual(reopened.outputs[0].brep, next.outputs[0].brep);
});

test('singular or oversize radii on two rims are refused before either rolling fit starts', () => {
  const stock = evaluateCadPart(doc(stockFeatures)).outputs[0].brep;
  const picks = [target[0], other[0]], explicit = [...target, ...other];
  assert.equal(planHalfRingFillet(stock, picks), undefined);
  assert.equal(planHalfRingFillet(stock, [...target, other[0], target[0]]), undefined);
  const plan = planHalfRingFillet(stock, explicit);
  assert.equal(plan?.rims.length, 2);
  // A matching report cannot authorize a tool whose hull crosses to the other end.
  const crossed = [target, other].map(edges => ({ brep: stock, convex: true, report: { edges } }));
  assert.equal(separateHalfRingFilletTools(plan, crossed), false);
  let fits = 0;
  setRingTrace(() => { fits++; });
  try {
    for (const radius of [2, 3]) for (const selected of [picks, explicit]) {
      assert.throws(() => evaluateCadPart(fillet(radius, selected)), error => error instanceof CadPartError
        && error.feature === 'f' && error.code === 'CONTACT_LEAVES_FACE'
        && /complete half-ring rim fillet needs a radius smaller than the 2 mm tube radius/.test(error.message));
    }
    assert.equal(fits, 0);
  } finally {
    setRingTrace(null);
  }
});
