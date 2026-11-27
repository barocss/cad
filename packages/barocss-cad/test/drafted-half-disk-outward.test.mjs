import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { draftedExtrusion, evaluateCadPart, checkBrep, evaluateCurve, evaluateSurface, tessellateBrep, massPropertiesOf, saveCadPart, loadCadPart } from '../dist/index.js';

const pi = Math.PI, profile = [{ kind: 'line', start: [-10, 0] }, { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' }];
const close = (a, b, label, e = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= e, `${label}: ${a} vs ${b}`);
const input = draft => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'loop', segments: profile, sideTags: { outer: ['line', 'arc'] } },
  { id: 'e', kind: 'extrude', sketch: 's', height: 10, draft },
] });

// Independent circular-segment sections, including the major segment when d is negative.
function reference(angle, n) {
  const slope = Math.tan(angle * pi / 180), sums = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    const z = 10 * i / n, d = z * slope, r = 10 - d, q = Math.sqrt(100 - 20 * d);
    const area = r * r * Math.acos(d / r) - d * q, yMoment = 2 * q ** 3 / 3, weight = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    [area, yMoment, z * area].forEach((value, k) => { sums[k] += weight * value; });
  }
  return sums.map(value => value * 10 / (3 * n));
}

function watertight(brep) {
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 32 }), P = mesh.positions, I = mesh.indices, uses = new Map();
  const key = i => `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`;
  for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = key(I[t + k]), b = key(I[t + (k + 1) % 3]), edge = `${a}>${b}`;
    uses.set(edge, (uses.get(edge) ?? 0) + 1);
  }
  assert.ok(uses.size > 0);
  for (const [edge, count] of uses) { const [a, b] = edge.split('>'); assert.equal(uses.get(`${b}>${a}`), count, edge); }
}

function onConeChart(surface, point, left, height) {
  const angle = p => { const a = Math.atan2(p[1], p[0]); return left && a < 0 ? a + 2 * pi : a; };
  const target = angle(point), v = point[2] / height;
  let lo = 0, hi = 1;
  for (let i = 0; i < 56; i++) { const u = (lo + hi) / 2; if (angle(evaluateSurface(surface, u, v)) < target) lo = u; else hi = u; }
  const actual = evaluateSurface(surface, (lo + hi) / 2, v);
  actual.forEach((value, k) => close(value, point[k], 'finite cone chart membership', 1e-9));
}

for (const angle of [-10, -14]) test(`outward half-disk ${angle}° has exact major arcs and parabolic joints with independent native mass`, () => {
  const doc = input(angle), snapshot = evaluateCadPart(doc), output = snapshot.outputs[0], brep = output.brep;
  const slope = Math.tan(angle * pi / 180), d = 10 * slope, rt = 10 - d, q = Math.sqrt(100 - 20 * d);
  const report = checkBrep(brep, { strict: true }); assert.ok(report.valid, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 5, loops: 5, coedges: 18, edges: 9, vertices: 6 });
  assert.equal(report.topology[0].genus, 0);
  assert.deepEqual(brep.faces.map(face => face.name).sort(), ['e.bottom', 'e.top', 'e.side[line]', 'e.side[arc]#1', 'e.side[arc]#2'].sort());
  const cap = brep.faces.find(face => face.name === 'e.top').surface, flat = brep.faces.find(face => face.name === 'e.side[line]').surface;
  assert.equal(Math.min(...cap.controlPoints.flat().map(p => p[0])), -rt); assert.equal(Math.max(...cap.controlPoints.flat().map(p => p[0])), rt);
  assert.ok(q < rt); assert.equal(Math.max(...flat.controlPoints.flat().map(p => p[0])), q);
  for (const [i, name] of ['e.side[arc]#1', 'e.side[arc]#2'].entries()) {
    const surface = brep.faces.find(face => face.name === name).surface, sign = i === 0 ? 1 : -1;
    assert.deepEqual([surface.degreeU, surface.degreeV], [2, 1]);
    close(surface.weights[1][0], Math.sqrt(10 / (2 * rt)), 'exact rational angular weight');
    assert.ok(surface.weights[1][0] < Math.SQRT1_2);
    const endpoint = evaluateSurface(surface, i === 0 ? 0 : 1, 1); endpoint.forEach((v, k) => close(v, [sign * q, d, 10][k], 'major arc chart endpoint'));
    for (const u of [0, 0.13, 0.4, 0.7, 1]) for (const v of [0, 0.2, 0.6, 1]) {
      const p = evaluateSurface(surface, u, v); close(Math.hypot(p[0], p[1]), 10 - slope * p[2], 'exact conical support');
    }
    const seam = brep.edges.find(edge => edge.name === [name, 'e.side[line]'].sort().join('|')).curve;
    assert.deepEqual([seam.degree, seam.weights], [2, [1, 1, 1]]);
    for (let k = 0; k <= 20; k++) {
      const p = evaluateCurve(seam, k / 20); close(p[1], slope * p[2], 'parabola on plane');
      close(p[0] ** 2, 100 - 20 * slope * p[2], 'independent exact parabola');
      onConeChart(surface, p, i === 1, 10);
      const wallPoint = evaluateSurface(flat, (p[0] + q) / (2 * q), p[2] / 10);
      wallPoint.forEach((v, axis) => close(v, p[axis], 'full fixed-width planar chart'));
    }
  }
  watertight(brep);
  const coarse = reference(angle, 4096), fine = reference(angle, 8192); fine.forEach((v, k) => close(v, coarse[k], 'independent integral convergence', 1e-8));
  const mass = massPropertiesOf(output); assert.equal(mass.method, 'quadrature'); close(mass.volume, fine[0], 'independent major-segment volume', 1e-7);
  mass.centroid.forEach((v, k) => close(v, [0, fine[1] / fine[0], fine[2] / fine[0]][k], 'independent centroid', 1e-7));
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
});

test('outward half-disk retains reversed authored tags in a translated cardinal orientation', () => {
  const reversed = [{ kind: 'arc', start: [4, -13], center: [4, -3], direction: 'cw' }, { kind: 'line', start: [4, 7] }];
  const brep = draftedExtrusion({ profile: reversed, sideTags: ['arc', 'line'], z0: 2, z1: 12, draft: -14, tag: 'e' }), slope = Math.tan(-14 * pi / 180);
  assert.ok(checkBrep(brep, { strict: true }).valid); watertight(brep);
  const seams = brep.edges.filter(edge => /side\[line\]/.test(edge.name) && /side\[arc\]/.test(edge.name)); assert.equal(seams.length, 2);
  for (const { curve } of seams) for (const t of [0, 0.13, 0.5, 0.83, 1]) {
    const [x, y, z] = evaluateCurve(curve, t), d = slope * (z - 2);
    close(4 - x, d, 'placed planar support'); close(Math.hypot(x - 4, y + 3), 10 - d, 'placed cone');
  }
});

test('outward half-disk keeps exact source/angle/range refusals and checks the expanded support poles', () => {
  const make = (cy, h = 10, draft = -10) => draftedExtrusion({ profile: [{ kind: 'line', start: [-10, cy] },
    { kind: 'arc', start: [10, cy], center: [0, cy], direction: 'ccw' }], z0: 0, z1: h, draft, tag: 'e' });
  const rt = 10 - 10 * Math.tan(-10 * pi / 180), limit = make(10000 - rt);
  assert.ok(checkBrep(limit, { strict: true }).valid); assert.ok(limit.vertices.some(vertex => vertex.point[1] === 10000));
  assert.throws(() => make(10000 - rt + 0.001), /modeling coordinate range/);
  assert.throws(() => make(0, 1800, -80), /modeling coordinate range/);
  assert.throws(() => make(0, 10, -89), /below 89/);
  assert.throws(() => make(0, 10, -Number.EPSILON), /too small/);
  const nearHalf = [{ ...profile[0] }, { ...profile[1], center: [0, -0.01] }];
  assert.throws(() => draftedExtrusion({ profile: nearHalf, z0: 0, z1: 10, draft: -10, tag: 'e' }), /not tangent/);
});

test('inward half-disk native bytes stay unchanged, including translated reversed tags', () => {
  const expected = ['c3b77387f439cc1297917a21c510f56cb165f5d57556095f8443c53d696cba19', '129c98da3251ac8ed74c867e13be6b15594597fb34a3b23b0815a373ecaf2a23'];
  for (const [i, draft] of [10, 14].entries()) {
    const brep = draftedExtrusion({ profile, z0: 0, z1: 10, draft, tag: 'e' });
    assert.equal(createHash('sha256').update(JSON.stringify(brep)).digest('hex'), expected[i]);
  }
  const brep = draftedExtrusion({ profile: [{ kind: 'arc', start: [4, -13], center: [4, -3], direction: 'cw' }, { kind: 'line', start: [4, 7] }],
    sideTags: ['arc', 'line'], z0: 2, z1: 12, draft: 10, tag: 'e' });
  assert.equal(createHash('sha256').update(JSON.stringify(brep)).digest('hex'), '466424037840826f2c884b6448bd6cf650f5d8159de0a55b5b236bda71774e54');
});
