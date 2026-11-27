import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { draftedExtrusion, evaluateCadPart, massPropertiesOf, saveCadPart, loadCadPart, checkBrep, evaluateCurve, evaluateSurface, tessellateBrep } from '../dist/index.js';

const profile = [{ kind: 'line', start: [-8, -6] }, { kind: 'arc', start: [8, -6], center: [0, 0], direction: 'ccw' }];
const input = draft => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'loop', segments: profile, sideTags: { outer: ['line', 'arc'] } },
  { id: 'e', kind: 'extrude', sketch: 's', height: 10, draft },
] });
const close = (a, b, label, tolerance = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
function reference(angle, n) {
  const slope = Math.tan(angle * Math.PI / 180), sums = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    const z = 10 * i / n, d = slope * z, radius = 10 - d, chord = -6 + d, q = Math.sqrt(64 - 8 * d);
    const area = radius ** 2 * Math.acos(chord / radius) - chord * q, weight = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    [area, 2 * q ** 3 / 3, z * area].forEach((value, k) => { sums[k] += weight * value; });
  }
  return sums.map(value => value * 10 / (3 * n));
}
function topology(brep) {
  const report = checkBrep(brep, { strict: true }); assert.ok(report.valid, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 5, loops: 5, coedges: 18, edges: 9, vertices: 6 });
  assert.equal(report.topology[0].genus, 0);
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 32 }), P = mesh.positions, I = mesh.indices, edges = new Map();
  const key = i => `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`;
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const edge = `${key(I[i + k])}>${key(I[i + (k + 1) % 3])}`; edges.set(edge, (edges.get(edge) ?? 0) + 1);
  }
  for (const [edge, count] of edges) { const [a, b] = edge.split('>'); assert.equal(edges.get(`${b}>${a}`), count, edge); }
}

for (const angle of [10, -10, 35]) test(`major circular segment Draft ${angle}° has exact finite charts and independent native mass`, () => {
  const snapshot = evaluateCadPart(input(angle)), output = snapshot.outputs[0], brep = output.brep;
  const slope = Math.tan(angle * Math.PI / 180), d = 10 * slope, radius = 10 - d, q = Math.sqrt(64 - 8 * d);
  topology(brep);
  assert.deepEqual(brep.faces.map(f => f.name).sort(), ['e.bottom', 'e.top', 'e.side[line]', 'e.side[arc]#1', 'e.side[arc]#2'].sort());
  for (const [name, extent] of [['e.bottom', 10], ['e.top', -6 + d < 0 ? radius : q]]) {
    const face = brep.faces.find(f => f.name === name), points = face.surface.controlPoints.flat(), xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    assert.equal(Math.min(...xs), -extent); assert.equal(Math.max(...xs), extent);
    for (const edge of brep.edges.filter(e => e.name.includes(name))) for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const p = evaluateCurve(edge.curve, t);
      assert.ok(p[0] >= -extent - 1e-9 && p[0] <= extent + 1e-9 && p[1] >= Math.min(...ys) - 1e-9 && p[1] <= Math.max(...ys) + 1e-9, 'cap trim inside its finite chart');
    }
  }
  if (angle === 35) assert.ok(-6 + d > 0, 'the top has crossed from a major to a minor arc');
  const width = Math.max(8, q), flat = brep.faces.find(f => f.name === 'e.side[line]').surface;
  assert.equal(Math.max(...flat.controlPoints.flat().map(p => p[0])), width);
  for (const [i, name] of ['e.side[arc]#1', 'e.side[arc]#2'].entries()) {
    const surface = brep.faces.find(f => f.name === name).surface, seam = brep.edges.find(e => e.name === [name, 'e.side[line]'].sort().join('|')).curve;
    assert.deepEqual([seam.degree, seam.weights], [2, [1, 1, 1]]);
    close(surface.weights[1][0], Math.sqrt(4 / (2 * (angle > 0 ? 10 : radius))), 'major angular weight');
    for (const u of [0, 0.2, 0.5, 0.8, 1]) for (const v of [0, 0.25, 0.7, 1]) {
      const p = evaluateSurface(surface, u, v); close(Math.hypot(p[0], p[1]), 10 - slope * p[2], 'exact cone support');
    }
    for (let n = 0; n <= 20; n++) {
      const p = evaluateCurve(seam, n / 20); close(p[1], -6 + slope * p[2], 'flat support'); close(p[0] ** 2, 64 - 8 * slope * p[2], 'exact parabola');
      evaluateSurface(flat, (p[0] + width) / (2 * width), p[2] / 10).forEach((v, k) => close(v, p[k], 'finite flat chart'));
      let lo = 0, hi = 1; const target = Math.atan2(p[1], Math.abs(p[0]));
      for (let j = 0; j < 56; j++) {
        const u = (lo + hi) / 2, probe = evaluateSurface(surface, i === 0 ? u : 1 - u, p[2] / 10);
        if (Math.atan2(probe[1], Math.abs(probe[0])) < target) lo = u; else hi = u;
      }
      evaluateSurface(surface, i === 0 ? (lo + hi) / 2 : 1 - (lo + hi) / 2, p[2] / 10).forEach((v, k) => close(v, p[k], 'finite cone chart'));
    }
  }
  const coarse = reference(angle, 4096), fine = reference(angle, 8192); fine.forEach((v, k) => close(v, coarse[k], 'integral convergence', 1e-8));
  const mass = massPropertiesOf(output); assert.equal(mass.method, 'quadrature'); close(mass.volume, fine[0], 'independent volume', 1e-7);
  mass.centroid.forEach((v, k) => close(v, [0, fine[1] / fine[0], fine[2] / fine[0]][k], 'independent centroid', 1e-7));
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
});

test('major segment preserves cardinal placement and reversed authored tags', () => {
  for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) for (const draft of [10, -10]) {
    const map = ([x, y]) => [17 + ux * x - uy * y, -11 + uy * x + ux * y], a = map([-8, -6]), b = map([8, -6]);
    const direct = [{ kind: 'line', start: a }, { kind: 'arc', start: b, center: [17, -11], direction: 'ccw' }];
    const reversed = [{ kind: 'arc', start: a, center: [17, -11], direction: 'cw' }, { kind: 'line', start: b }];
    const make = (profile, sideTags) => draftedExtrusion({ profile, sideTags, z0: 2, z1: 12, draft, tag: 'e' });
    const brep = make(direct, ['line', 'arc']); topology(brep); assert.deepEqual(make(reversed, ['arc', 'line']), brep);
    const slope = Math.tan(draft * Math.PI / 180);
    for (const edge of brep.edges.filter(e => /side\[line\]/.test(e.name) && /side\[arc\]/.test(e.name))) for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const p = evaluateCurve(edge.curve, t), x = p[0] - 17, y = p[1] + 11;
      close(-uy * x + ux * y, -6 + slope * (p[2] - 2), 'placed flat support'); close(Math.hypot(x, y), 10 - slope * (p[2] - 2), 'placed cone support');
    }
  }
});

test('major segment refuses first collapse and unsupported chords without snapping', () => {
  for (const angle of [Math.atan(0.8) * 180 / Math.PI, 39])
    assert.throws(() => evaluateCadPart(input(angle)), e => e.code === 'PARAMETER' && /closes the circular segment/.test(e.message));
  const rotate = ([x, y]) => [x * Math.cos(1e-6) - y * Math.sin(1e-6), x * Math.sin(1e-6) + y * Math.cos(1e-6)];
  const oblique = [{ kind: 'line', start: rotate([-8, -6]) }, { kind: 'arc', start: rotate([8, -6]), center: [0, 0], direction: 'ccw' }];
  assert.throws(() => draftedExtrusion({ profile: oblique, z0: 0, z1: 10, draft: 10, tag: 'e' }), /not tangent/);
  const asymmetric = [{ kind: 'line', start: [-8, -6] }, { kind: 'arc', start: [8, -6], center: [0.01, 0], direction: 'ccw' }];
  assert.throws(() => draftedExtrusion({ profile: asymmetric, z0: 0, z1: 10, draft: 10, tag: 'e' }), /not on one circle/);
  assert.throws(() => draftedExtrusion({ profile, z0: 0, z1: 1800, draft: -80, tag: 'e' }), /circular segment.*modeling coordinate range/);
});

test('existing minor segment native bytes remain unchanged in both directions and across the major top transition', () => {
  const minor = [{ kind: 'line', start: [-8, 6] }, { kind: 'arc', start: [8, 6], center: [0, 0], direction: 'ccw' }];
  const hashes = ['045594023c9653ef176c99ee21d0fe4ba7ff79fd7f9cd3f56ec74b737ce3fcbc', '4514692ba40f60533d312769154f2ad2fddb24271f9b3ba5f1ce42933bc84cfc', '227c6fced0653a2c63d43bceba91d4ad4a2e611697d052a11014d35972cfbe6e'];
  for (const [i, draft] of [6, -10, -35].entries())
    assert.equal(createHash('sha256').update(JSON.stringify(draftedExtrusion({ profile: minor, z0: 0, z1: 10, draft, tag: 'e' }))).digest('hex'), hashes[i]);
});
