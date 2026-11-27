import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { draftedExtrusion, evaluateCadPart, massPropertiesOf, saveCadPart, loadCadPart, checkBrep, evaluateCurve, evaluateSurface, tessellateBrep } from '../dist/index.js';

const profile = [{ kind: 'line', start: [-8, 6] }, { kind: 'arc', start: [8, 6], center: [0, 0], direction: 'ccw' }];
const input = draft => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'loop', segments: profile, sideTags: { outer: ['line', 'arc'] } },
  { id: 'e', kind: 'extrude', sketch: 's', height: 10, draft },
] });
const close = (a, b, label, e = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= e, `${label}: ${a} vs ${b}`);
function reference(angle, n) {
  const slope = Math.tan(angle * Math.PI / 180), sums = [0, 0, 0];
  for (let i = 0; i <= n; i++) {
    const z = 10 * i / n, d = slope * z, r = 10 - d, c = 6 + d, q = Math.sqrt(64 - 32 * d);
    const area = r * r * Math.acos(c / r) - c * q, w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
    [area, 2 * q ** 3 / 3, z * area].forEach((value, k) => { sums[k] += w * value; });
  }
  return sums.map(value => value * 10 / (3 * n));
}
function watertight(brep) {
  const m = tessellateBrep(brep, { segmentsPerQuarter: 32 }), P = m.positions, I = m.indices, edges = new Map();
  const key = i => `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`;
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const e = `${key(I[i + k])}>${key(I[i + (k + 1) % 3])}`; edges.set(e, (edges.get(e) ?? 0) + 1);
  }
  for (const [e, count] of edges) { const [a, b] = e.split('>'); assert.equal(edges.get(`${b}>${a}`), count, e); }
}
function topology(brep) {
  const r = checkBrep(brep, { strict: true }); assert.ok(r.valid, JSON.stringify(r.issues));
  assert.deepEqual(r.counts, { bodies: 1, shells: 1, faces: 5, loops: 5, coedges: 18, edges: 9, vertices: 6 });
  assert.equal(r.topology[0].genus, 0); watertight(brep);
}

for (const angle of [6, -10]) test(`cardinal circular segment Draft ${angle}° has exact shared parabolas and independent native volume`, () => {
  const snapshot = evaluateCadPart(input(angle)), output = snapshot.outputs[0], brep = output.brep, slope = Math.tan(angle * Math.PI / 180), d = 10 * slope;
  topology(brep);
  assert.deepEqual(brep.faces.map(f => f.name).sort(), ['e.bottom', 'e.top', 'e.side[line]', 'e.side[arc]#1', 'e.side[arc]#2'].sort());
  const q = Math.sqrt(64 - 32 * d), width = Math.max(8, q), flat = brep.faces.find(f => f.name === 'e.side[line]').surface;
  assert.equal(Math.max(...flat.controlPoints.flat().map(p => p[0])), width);
  const cap = brep.faces.find(f => f.name === 'e.top').surface;
  assert.equal(Math.max(...cap.controlPoints.flat().map(p => p[0])), q);
  for (const [i, name] of ['e.side[arc]#1', 'e.side[arc]#2'].entries()) {
    const surface = brep.faces.find(f => f.name === name).surface, seam = brep.edges.find(e => e.name === [name, 'e.side[line]'].sort().join('|')).curve;
    assert.deepEqual([seam.degree, seam.weights], [2, [1, 1, 1]]);
    close(surface.weights[1][0], Math.sqrt(16 / (2 * (angle > 0 ? 10 : 10 - d))), 'angular interval weight');
    for (const u of [0, 0.15, 0.4, 0.8, 1]) for (const v of [0, 0.3, 0.75, 1]) {
      const p = evaluateSurface(surface, u, v); close(Math.hypot(p[0], p[1]), 10 - slope * p[2], 'exact cone support');
    }
    for (let t = 0; t <= 20; t++) {
      const p = evaluateCurve(seam, t / 20); close(p[1], 6 + slope * p[2], 'chord plane'); close(p[0] ** 2, 64 - 32 * slope * p[2], 'parabolic joint');
      const wall = evaluateSurface(flat, (p[0] + width) / (2 * width), p[2] / 10); wall.forEach((v, k) => close(v, p[k], 'finite flat chart'));
      const target = Math.atan2(p[1], Math.abs(p[0])); let lo = 0, hi = 1;
      for (let n = 0; n < 56; n++) {
        const u = (lo + hi) / 2, probe = evaluateSurface(surface, i === 0 ? u : 1 - u, p[2] / 10);
        if (Math.atan2(probe[1], Math.abs(probe[0])) < target) lo = u; else hi = u;
      }
      const point = evaluateSurface(surface, i === 0 ? (lo + hi) / 2 : 1 - (lo + hi) / 2, p[2] / 10);
      point.forEach((v, k) => close(v, p[k], 'finite cone chart', 1e-9));
    }
  }
  const a = reference(angle, 4096), b = reference(angle, 8192); b.forEach((v, k) => close(v, a[k], 'integral convergence', 1e-8));
  const mass = massPropertiesOf(output); assert.equal(mass.method, 'quadrature'); close(mass.volume, b[0], 'independent volume', 1e-7);
  mass.centroid.forEach((v, k) => close(v, [0, b[1] / b[0], b[2] / b[0]][k], 'independent centroid', 1e-7));
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
});

test('minor segment preserves reversed authored tags in all four shifted cardinal orientations', () => {
  for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) for (const draft of [6, -10]) {
    const map = ([x, y]) => [17 + ux * x - uy * y, -11 + uy * x + ux * y], a = map([-8, 6]), b = map([8, 6]);
    const direct = [{ kind: 'line', start: a }, { kind: 'arc', start: b, center: [17, -11], direction: 'ccw' }];
    const reversed = [{ kind: 'arc', start: a, center: [17, -11], direction: 'cw' }, { kind: 'line', start: b }];
    const make = (profile, sideTags) => draftedExtrusion({ profile, sideTags, z0: 2, z1: 12, draft, tag: 'e' });
    const brep = make(direct, ['line', 'arc']); topology(brep); assert.deepEqual(make(reversed, ['arc', 'line']), brep);
    if (ux === 0 && uy === 1 && draft === -10) {
      const doc = input(draft); doc.features[0].segments = reversed; doc.features[0].sideTags.outer = ['arc', 'line']; doc.features[1].from = 2;
      const snapshot = evaluateCadPart(doc); assert.deepEqual(snapshot.outputs[0].brep, brep);
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
    }
    const slope = Math.tan(draft * Math.PI / 180);
    for (const edge of brep.edges.filter(e => /side\[line\]/.test(e.name) && /side\[arc\]/.test(e.name))) for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      const p = evaluateCurve(edge.curve, t), x = p[0] - 17, y = p[1] + 11;
      close(-uy * x + ux * y, 6 + slope * (p[2] - 2), 'placed chord'); close(Math.hypot(x, y), 10 - slope * (p[2] - 2), 'placed cone');
    }
  }
});

test('circular segment rejects collapse, noncardinal or asymmetric chords and native range overflow without snapping', () => {
  for (const angle of [Math.atan(0.2) * 180 / Math.PI, 12])
    assert.throws(() => evaluateCadPart(input(angle)), e => e.code === 'PARAMETER' && /closes the circular segment/.test(e.message));
  const rotate = ([x, y]) => [x * Math.cos(1e-6) - y * Math.sin(1e-6), x * Math.sin(1e-6) + y * Math.cos(1e-6)];
  const oblique = [{ kind: 'line', start: rotate([-8, 6]) }, { kind: 'arc', start: rotate([8, 6]), center: [0, 0], direction: 'ccw' }];
  assert.throws(() => draftedExtrusion({ profile: oblique, z0: 0, z1: 10, draft: 6, tag: 'e' }), /not tangent/);
  const asymmetric = [{ kind: 'line', start: [-8, 6] }, { kind: 'arc', start: [8, 6], center: [0.01, 0], direction: 'ccw' }];
  assert.throws(() => draftedExtrusion({ profile: asymmetric, z0: 0, z1: 10, draft: 6, tag: 'e' }), /not on one circle/);
  assert.throws(() => draftedExtrusion({ profile, z0: 0, z1: 1800, draft: -80, tag: 'e' }), /circular segment.*modeling coordinate range/);
});

test('outward segment reaching a major top arc has a full-radius cap and exact finite cone chart', () => {
  const draft = -35, brep = draftedExtrusion({ profile, sideTags: ['line', 'arc'], z0: 0, z1: 10, draft, tag: 'e' }); topology(brep);
  const d = 10 * Math.tan(draft * Math.PI / 180); assert.ok(6 + d < 0);
  const top = brep.faces.find(f => f.name === 'e.top').surface;
  assert.equal(Math.max(...top.controlPoints.flat().map(p => p[0])), 10 - d);
});

test('existing outward half-disk native bytes remain unchanged', () => {
  const half = [{ kind: 'line', start: [-10, 0] }, { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' }];
  const hashes = ['28a063f24cd5abdc27b3f84cabc65f0c3d64425d51a43fa03bc62c34882bc3a1', 'e71bcf35104ad62fafa790fcd56d6546e2cff41b0f998c445e2242d2f3a64c63'];
  for (const [i, draft] of [-10, -14].entries())
    assert.equal(createHash('sha256').update(JSON.stringify(draftedExtrusion({ profile: half, z0: 0, z1: 10, draft, tag: 'e' }))).digest('hex'), hashes[i]);
});
