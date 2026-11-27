import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateCadPart, massPropertiesOf, checkBrep, evaluateCurve, evaluateSurface, transformBrep, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { draftCircularWallIfAdmitted, circularWallOffsetFrame } from '../dist/features/bored-cap-offset.js';

const halves = ['e.side0#1', 'e.side0#2'], origin = [10, 20, 30];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const doc = (angle = 10, pull = 'x', neutral = 21) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'circle', center: [12, -7], radius: 10, plane: { origin, normal: [1, 0, 0], xAxis: [0, 1, 0] } },
  { id: 'e', kind: 'extrude', sketch: 's', from: 3, height: 20 },
  { id: 'd', kind: 'draft', target: 'e', faces: halves, angle, pull, neutral },
] });
const close = (a, b, label, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const frustum = (angle, sign, lo, hi, neutral) => {
  const k = sign * Math.tan(angle * Math.PI / 180), a = 10 - k * (lo - neutral), b = 10 - k * (hi - neutral), D = a * a + a * b + b * b;
  return { k, volume: Math.PI * (hi - lo) * D / 3, station: lo + (hi - lo) * (a * a + 2 * a * b + 3 * b * b) / (4 * D) };
};
function ownership(brep) {
  return { source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops, coedges: brep.coedges,
    faces: brep.faces.map(({ surface, ...face }) => ({ ...face, surface: { ...surface, controlPoints: undefined } })),
    edges: brep.edges.map(({ curve, ...edge }) => ({ ...edge, curve: { ...curve, controlPoints: undefined } })),
    vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex) };
}
function strict(brep) {
  const report = checkBrep(brep, { strict: true, pcurveSamples: 7 }); assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 12, edges: 6, vertices: 4 }); assert.equal(report.topology[0].genus, 0);
}
function watertight(brep) {
  const m = tessellateBrep(brep, { segmentsPerQuarter: 24 }), P = m.positions, I = m.indices, edges = new Map();
  const key = i => `${P[3 * i]},${P[3 * i + 1]},${P[3 * i + 2]}`;
  for (let i = 0; i < I.length; i += 3) for (let j = 0; j < 3; j++) {
    const e = `${key(I[i + j])}>${key(I[i + (j + 1) % 3])}`; edges.set(e, (edges.get(e) ?? 0) + 1);
  }
  for (const [e, n] of edges) { const [a, b] = e.split('>'); assert.equal(edges.get(`${b}>${a}`), n, e); }
}
function bindings(brep) {
  const faces = new Map(brep.faces.map(f => [f.id, f])), loops = new Map(brep.loops.map(l => [l.id, l])), edges = new Map(brep.edges.map(e => [e.id, e]));
  for (const use of brep.coedges) for (const t of [0, .2, .5, .8, 1]) {
    assert.ok(use.pcurve); const p = evaluateCurve(edges.get(use.edge).curve, t), uv = evaluateCurve(use.pcurve, t);
    evaluateSurface(faces.get(loops.get(use.loop).face).surface, uv[0], uv[1]).forEach((v, i) => close(v, p[i], 'original pcurve binds actual world edge'));
  }
}

for (const pull of ['x', '-x']) for (const angle of [10, -10]) test(`authored YZ circular Draft ${angle}°/${pull} retains world records, caps and independent frustum geometry`, () => {
  const source = evaluateCadPart({ ...doc(), features: doc().features.slice(0, 2) }).outputs[0].brep;
  for (const neutral of [13, 21, 33]) {
    const input = doc(angle, pull, neutral), before = structuredClone(input), snapshot = evaluateCadPart(input), output = snapshot.outputs[0], brep = output.brep;
    const ref = frustum(angle, pull === 'x' ? 1 : -1, 13, 33, neutral);
    assert.deepEqual(input, before); strict(brep); bindings(brep); watertight(brep); assert.deepEqual(ownership(brep), ownership(source));
    const mass = massPropertiesOf(output); close(mass.volume, ref.volume, 'independent frustum volume', 1e-7);
    mass.centroid.forEach((v, i) => close(v, [ref.station, 32, 23][i], 'independent world centroid', 1e-7));
    for (const face of brep.faces.filter(f => halves.includes(f.name))) for (const u of [0, .2, .5, .8, 1]) for (const v of [0, .25, .6, 1]) {
      const p = evaluateSurface(face.surface, u, v); close(Math.hypot(p[1] - 32, p[2] - 23), 10 - ref.k * (p[0] - neutral), 'native world X cone');
    }
    if (neutral !== 21) {
      const cap = source.faces.find(f => f.name === (neutral === 13 ? 'e.bottom' : 'e.top'));
      assert.deepEqual(brep.faces.find(f => f.id === cap.id), cap, 'fixed world cap record including its exact chart');
      for (const edge of source.edges.filter(e => e.curve.controlPoints.every(p => p[0] === neutral))) assert.deepEqual(brep.edges.find(e => e.id === edge.id), edge);
      for (const vertex of source.vertices.filter(v => v.point[0] === neutral)) assert.deepEqual(brep.vertices.find(v => v.id === vertex.id), vertex);
    } else {
      assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
      const reverse = structuredClone(input); reverse.features.at(-1).faces.reverse(); assert.deepEqual(evaluateCadPart(reverse).outputs[0].brep, brep);
    }
  }
});

test('all sixteen exact non-XY source frames retain signed placement and native trim ownership', () => {
  let count = 0;
  for (const axis of [0, 1]) for (const sign of [1, -1]) for (const tangent of [0, 1, 2].filter(i => i !== axis)) for (const tangentSign of [1, -1]) for (const pullSign of [1, -1]) for (const angle of [10, -10]) {
    const n = [0, 0, 0], x = [0, 0, 0]; n[axis] = sign; x[tangent] = tangentSign; const y = cross(n, x);
    const input = doc(angle); input.features[0].plane = { origin, normal: n, xAxis: x };
    input.features.at(-1).pull = (sign * pullSign === 1 ? '' : '-') + (axis === 0 ? 'x' : 'y'); input.features.at(-1).neutral = origin[axis] + sign * 11;
    const source = evaluateCadPart({ ...input, features: input.features.slice(0, 2) }).outputs[0].brep, output = evaluateCadPart(input).outputs[0], ref = frustum(angle, pullSign, 3, 23, 11);
    strict(output.brep); assert.deepEqual(ownership(output.brep), ownership(source)); bindings(output.brep);
    close(massPropertiesOf(output).volume, ref.volume, 'permutation-invariant volume', 1e-7);
    const centre = origin.map((o, i) => o + x[i] * 12 - y[i] * 7 + n[i] * ref.station);
    massPropertiesOf(output).centroid.forEach((v, i) => close(v, centre[i], 'permuted world centroid', 1e-7)); count++;
  }
  assert.equal(count, 64);
});

test('default pull stays world Z, signed default cap stays in world coordinates, and raw near-axis frames are refused', () => {
  const absent = doc(); delete absent.features.at(-1).pull;
  for (const input of [absent, doc(10, 'z'), doc(10, 'y')]) assert.throws(() => evaluateCadPart(input), e => e.code === 'SELECTION' && /world X pull/.test(e.message));
  for (const pull of ['x', '-x']) {
    const implicit = doc(10, pull); delete implicit.features.at(-1).neutral;
    assert.deepEqual(evaluateCadPart(implicit).outputs[0].brep, evaluateCadPart(doc(10, pull, pull === 'x' ? 13 : 33)).outputs[0].brep);
  }
  for (const [normal, xAxis] of [[[1, 1e-13, 0], [0, 1, 0]], [[1, 0, 0], [1e-13, 1, 0]], [[1, 0, 1e-6], [0, 1, 0]], [[1, 0, 0], [0, 3, 4]]]) {
    const input = doc(); input.features[0].plane.normal = normal; input.features[0].plane.xAxis = xAxis;
    assert.throws(() => evaluateCadPart(input), e => e.code === 'CAPABILITY' && /exact cardinal non-XY sketch frame/.test(e.message));
  }
  const scaledAxes = doc(); scaledAxes.features[0].plane.normal = [2, 0, 0]; scaledAxes.features[0].plane.xAxis = [0, 3, 0];
  assert.deepEqual(evaluateCadPart(scaledAxes).outputs[0].brep, evaluateCadPart(doc()).outputs[0].brep);
  for (const neutral of [12, 34]) assert.throws(() => evaluateCadPart(doc(10, 'x', neutral)), e => e.code === 'SELECTION' && /within the original caps/.test(e.message));
  assert.throws(() => evaluateCadPart(doc(44)), e => e.code === 'GEOMETRY' && /cylinder axis/.test(e.message));
  const half = doc(); half.features.at(-1).faces = [halves[0]]; assert.throws(() => evaluateCadPart(half), e => e.code === 'CAPABILITY');
});

test('cardinal trim arithmetic qualification preserves stored pcurves without widening the exact Offset reader', () => {
  const input = doc(), world = evaluateCadPart({ ...input, features: input.features.slice(0, 2) }).outputs[0].brep;
  const local = transformBrep(world, { matrix: [0, 1, 0, 0, 0, 1, 1, 0, 0] });
  assert.equal(circularWallOffsetFrame(local, halves[0]), undefined);
  assert.equal(draftCircularWallIfAdmitted(local, halves, .1, 'z', 21), undefined, 'incumbent exact trim comparison remains unchanged');
  const accepted = draftCircularWallIfAdmitted(local, halves, .1, 'z', 21, true); assert.ok(accepted); assert.deepEqual(accepted.coedges, local.coedges);
  const nearMiss = structuredClone(local), cap = new Set(nearMiss.faces.filter(f => /\.(?:bottom|top)$/.test(f.name)).flatMap(f => f.loops));
  nearMiss.coedges.find(c => cap.has(c.loop)).pcurve.controlPoints[2][0] += 1e-10;
  assert.equal(draftCircularWallIfAdmitted(nearMiss, halves, .1, 'z', 21, true), undefined, 'an actual UV coefficient change exceeds the placement-only arithmetic bound');
});

test('incumbent unplaced world-Z circular Draft native bytes remain unchanged', () => {
  const hashes = ['9c81425e5605f9c56d588257adfbd872d7dc0514ff92aa84651d5d7b8d3e46ed', 'f4ce9b1b2f93fdb1f101e4e4ffe51ec3b5970c0b5e5004de19be5209d9db4fab'];
  for (const [i, angle] of [10, -10].entries()) {
    const input = doc(angle, 'z', 11); delete input.features[0].plane;
    const brep = evaluateCadPart(input).outputs[0].brep;
    assert.equal(createHash('sha256').update(JSON.stringify(brep)).digest('hex'), hashes[i]);
  }
});
