import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { draftedExtrusion, evaluateCadPart, massPropertiesOf, saveCadPart, loadCadPart, checkBrep, evaluateCurve, evaluateSurface, tessellateBrep } from '../dist/index.js';
import { buildProfileLoop } from '../dist/features/extruded-profile-solid.js';

const families = [
  { name: 'major', a: [48, 14], b: [0, -50], chord: -30, halfWidth: 40, angles: [10, -10] },
  { name: 'minor', a: [0, 50], b: [-48, -14], chord: 30, halfWidth: 40, angles: [6, -10] },
  { name: 'diameter', a: [30, 40], b: [-30, -40], chord: 0, halfWidth: 50, angles: [10, -10] },
];
const shift = ([x, y]) => [20 + x, -10 + y];
const profileOf = f => [{ kind: 'line', start: shift(f.b) }, { kind: 'arc', start: shift(f.a), center: [20, -10], direction: 'ccw' }];
const input = (family, draft) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'loop', segments: profileOf(family), sideTags: { outer: ['line', 'arc'] } },
  { id: 'e', kind: 'extrude', sketch: 's', height: 50, draft },
] });
const close = (a, b, label, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const local = p => { const x = p[0] - 20, y = p[1] + 10; return [.6 * x + .8 * y, -.8 * x + .6 * y, p[2]]; };
function reference(chord, angle, n) {
  const slope = Math.tan(angle * Math.PI / 180), sums = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    const z = 50 * i / n, d = slope * z, radius = 50 - d, c = chord + d, q = Math.sqrt((50 + chord) * (50 - chord - 2 * d));
    const area = radius ** 2 * Math.acos(c / radius) - c * q, weight = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    [area, 2 * q ** 3 / 3, z * area].forEach((v, k) => { sums[k] += weight * v; });
  }
  return sums.map(v => v * 50 / (3 * n));
}
function topology(brep) {
  const report = checkBrep(brep, { strict: true }); assert.ok(report.valid, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 5, loops: 5, coedges: 18, edges: 9, vertices: 6 });
  assert.equal(report.topology[0].genus, 0);
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 32 }), P = mesh.positions, I = mesh.indices, edges = new Map();
  const key = i => `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`;
  for (let i = 0; i < I.length; i += 3) for (let j = 0; j < 3; j++) {
    const keyOfEdge = `${key(I[i + j])}>${key(I[i + (j + 1) % 3])}`; edges.set(keyOfEdge, (edges.get(keyOfEdge) ?? 0) + 1);
  }
  for (const [keyOfEdge, count] of edges) { const [a, b] = keyOfEdge.split('>'); assert.equal(edges.get(`${b}>${a}`), count, keyOfEdge); }
}
function capCharts(brep) {
  for (const name of ['e.bottom', 'e.top']) {
    const s = brep.faces.find(f => f.name === name).surface, origin = s.controlPoints[0][0];
    const u = s.controlPoints[1][0].map((v, k) => v - origin[k]), v = s.controlPoints[0][1].map((v, k) => v - origin[k]), det = u[0] * v[1] - u[1] * v[0];
    assert.ok(Number.isFinite(det) && det !== 0);
    for (const edge of brep.edges.filter(e => e.name.includes(name))) for (let j = 0; j <= 20; j++) {
      const p = evaluateCurve(edge.curve, j / 20), x = p[0] - origin[0], y = p[1] - origin[1];
      const a = (x * v[1] - y * v[0]) / det, b = (u[0] * y - u[1] * x) / det;
      assert.ok(a >= -2e-12 && a <= 1 + 2e-12 && b >= -2e-12 && b <= 1 + 2e-12, 'finite cap UV enclosure including arithmetic roundoff');
      evaluateSurface(s, Math.max(0, Math.min(1, a)), Math.max(0, Math.min(1, b))).forEach((v, k) => close(v, p[k], 'finite cap support'));
    }
  }
}

for (const family of families) for (const angle of family.angles) test(`oblique ${family.name} segment Draft ${angle}° preserves exact source endpoints and independent geometry`, () => {
  const snapshot = evaluateCadPart(input(family, angle)), output = snapshot.outputs[0], brep = output.brep;
  topology(brep); capCharts(brep);
  for (const [id, original] of [['b0', shift(family.a)], ['b2', shift(family.b)]]) {
    const expected = [...original, 0]; assert.deepEqual(brep.vertices.find(v => v.id === id).point, expected);
    for (const edge of brep.edges) for (const [i, vertex] of edge.vertices.entries()) if (vertex === id)
      assert.deepEqual(edge.curve.controlPoints[i === 0 ? 0 : edge.curve.controlPoints.length - 1], expected);
  }
  const slope = Math.tan(angle * Math.PI / 180), d = 50 * slope, q = Math.sqrt((50 + family.chord) * (50 - family.chord - 2 * d));
  const width = Math.max(family.halfWidth, q), flat = brep.faces.find(f => f.name === 'e.side[line]').surface;
  for (const [i, name] of ['e.side[arc]#1', 'e.side[arc]#2'].entries()) {
    const surface = brep.faces.find(f => f.name === name).surface, seam = brep.edges.find(e => e.name === [name, 'e.side[line]'].sort().join('|')).curve;
    assert.deepEqual([seam.degree, seam.weights], [2, [1, 1, 1]]);
    for (let n = 0; n <= 20; n++) {
      const p = evaluateCurve(seam, n / 20), [x, y, z] = local(p);
      close(y, family.chord + slope * z, 'signed world plane'); close(Math.hypot(x, y), 50 - slope * z, 'exact cone');
      close(x * x, family.halfWidth ** 2 - 2 * (50 + family.chord) * slope * z, 'parabolic joint');
      // The inward diameter keeps the established full-radius flat chart.
      const flatWidth = family.chord === 0 && angle > 0 ? 50 : width;
      const flatU = (x + flatWidth) / (2 * flatWidth), flatV = z / 50;
      assert.ok(flatU >= -2e-12 && flatU <= 1 + 2e-12 && flatV >= -2e-12 && flatV <= 1 + 2e-12, 'finite flat UV enclosure including arithmetic roundoff');
      evaluateSurface(flat, Math.max(0, Math.min(1, flatU)), Math.max(0, Math.min(1, flatV))).forEach((v, k) => close(v, p[k], 'finite flat chart'));
      let lo = 0, hi = 1; const target = Math.atan2(y, Math.abs(x));
      for (let j = 0; j < 56; j++) {
        const u = (lo + hi) / 2, probe = local(evaluateSurface(surface, i === 0 ? u : 1 - u, z / 50));
        if (Math.atan2(probe[1], Math.abs(probe[0])) < target) lo = u; else hi = u;
      }
      evaluateSurface(surface, i === 0 ? (lo + hi) / 2 : 1 - (lo + hi) / 2, z / 50).forEach((v, k) => close(v, p[k], 'finite cone chart'));
    }
  }
  const coarse = reference(family.chord, angle, 4096), fine = reference(family.chord, angle, 8192);
  fine.forEach((v, k) => close(v, coarse[k], 'integral convergence', 1e-6));
  const mass = massPropertiesOf(output), cy = fine[1] / fine[0];
  close(mass.volume, fine[0], 'independent volume', 1e-5);
  mass.centroid.forEach((v, k) => close(v, [20 - .8 * cy, -10 + .6 * cy, fine[2] / fine[0]][k], 'independent world centroid', 1e-7));
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
});

test('oblique families retain reversed tags and exact integer-circle endpoints with an irrational frame', () => {
  for (const family of families) for (const draft of family.angles) {
    const direct = profileOf(family), reversed = [{ kind: 'arc', start: shift(family.b), center: [20, -10], direction: 'cw' }, { kind: 'line', start: shift(family.a) }];
    const make = (profile, sideTags) => draftedExtrusion({ profile, sideTags, z0: 2, z1: 52, draft, tag: 'e' });
    assert.deepEqual(make(reversed, ['arc', 'line']), make(direct, ['line', 'arc']));
  }
  const profile = [{ kind: 'line', start: [6, 8] }, { kind: 'arc', start: [-8, 6], center: [0, 0], direction: 'ccw' }];
  const brep = draftedExtrusion({ profile, z0: 0, z1: 10, draft: 10, tag: 'e' }); topology(brep);
  assert.deepEqual(brep.vertices.find(v => v.id === 'b0').point, [-8, 6, 0]); assert.deepEqual(brep.vertices.find(v => v.id === 'b2').point, [6, 8, 0]);
});

test('oblique admission rejects actual off-circle binary64 inputs accepted by the loose profile check, plus collapse and range', () => {
  const rational = [{ kind: 'line', start: [0, -10] }, { kind: 'arc', start: [9.6, 2.8], center: [0, 0], direction: 'ccw' }];
  assert.equal(Math.hypot(9.6, 2.8), 10); // Rounded radius equality alone must not admit this input.
  const offCircle = [{ kind: 'line', start: [6, 8 + 1e-10] }, { kind: 'arc', start: [-8, 6], center: [0, 0], direction: 'ccw' }];
  for (const profile of [rational, offCircle]) {
    assert.doesNotThrow(() => buildProfileLoop(profile));
    assert.throws(() => draftedExtrusion({ profile, z0: 0, z1: 10, draft: 10, tag: 'e' }), /not tangent/);
  }
  for (const [family, slope] of [[families[0], .8], [families[1], .2], [families[2], .5]])
    assert.throws(() => evaluateCadPart(input(family, Math.atan(slope) * 180 / Math.PI)), e => e.code === 'PARAMETER' && /closes the (?:circular segment|half-disk)/.test(e.message));
  assert.throws(() => draftedExtrusion({ profile: profileOf(families[0]), z0: 0, z1: 1800, draft: -80, tag: 'e' }), /modeling coordinate range/);
});

test('existing cardinal major segment native bytes remain unchanged', () => {
  const profile = [{ kind: 'line', start: [-8, -6] }, { kind: 'arc', start: [8, -6], center: [0, 0], direction: 'ccw' }];
  const hashes = ['d1b65ba53528a41dd30156dfa5c8d8cc83b4fbcc26dfc67d1539c381db2ebe58', '7422621fa6e6a3fb450804a0552a15c061a29d7b93ec24a6fe519ed809f7b506', 'c47588cb5de48c9ff68c424d8e0c5ceb18b29b72271d1457e55b12ef1274b96a'];
  for (const [i, draft] of [10, -10, 35].entries())
    assert.equal(createHash('sha256').update(JSON.stringify(draftedExtrusion({ profile, z0: 0, z1: 10, draft, tag: 'e' }))).digest('hex'), hashes[i]);
});
