import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, massPropertiesOf, surfaceAreaOf, checkBrep, evaluateSurface, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { faceGeometry } from '../dist/brep/analytic-boolean.js';

const points = [[0, 0], [40, 0], [40, 16], [16, 16], [16, 30], [0, 30]];
const documentOf = (floorThickness = 3, extra = {}) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'polygon', points },
    { id: 'e', kind: 'extrude', sketch: 's', height: 20 },
    { id: 'sh', kind: 'shell', target: 'e', thickness: 2, open: ['e.top'], ...(floorThickness === undefined ? {} : { floorThickness }), ...extra },
  ],
});
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const category = error => error.details?.category ?? error.code;
const delta = 4 - Math.PI, area = 600 + delta;
const volume = floor => 864 * 20 - area * (20 - floor);
function output(source) { return evaluateCadPart(source).outputs[0]; }
function materialAt(mesh, point) {
  const hits = [], P = mesh.positions, I = mesh.indices;
  for (let i = 0; i < I.length; i += 3) {
    const a = [...P.slice(I[i] * 3, I[i] * 3 + 3)], b = [...P.slice(I[i + 1] * 3, I[i + 1] * 3 + 3)], c = [...P.slice(I[i + 2] * 3, I[i + 2] * 3 + 3)];
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - a[0], c[1] - a[1]], det = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(det) < 1e-12) continue;
    const x = point[0] - a[0], y = point[1] - a[1], s = (x * v[1] - y * v[0]) / det, t = (u[0] * y - u[1] * x) / det;
    if (s < -1e-10 || t < -1e-10 || s + t > 1 + 1e-10) continue;
    const z = a[2] + s * (b[2] - a[2]) + t * (c[2] - a[2]);
    if (z > point[2] + 1e-9 && !hits.some(h => Math.abs(h - z) < 1e-8)) hits.push(z);
  }
  return hits.length % 2 === 1;
}
function watertight(mesh) {
  const P = mesh.positions, I = mesh.indices, uses = new Map(), key = i => `${P[i * 3]},${P[i * 3 + 1]},${P[i * 3 + 2]}`;
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const edge = `${key(I[i + k])}>${key(I[i + (k + 1) % 3])}`; uses.set(edge, (uses.get(edge) ?? 0) + 1);
  }
  for (const [edge, n] of uses) { const [a, b] = edge.split('>'); assert.equal(uses.get(`${b}>${a}`), n, edge); }
}

test('original top-open Round L has independent floor, mass, supports, native trims and physical witnesses', () => {
  const source = documentOf(), before = structuredClone(source), snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep;
  assert.deepEqual(source, before);
  const report = checkBrep(brep, { strict: true }); assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 16, loops: 17, coedges: 78, edges: 39, vertices: 26 });
  assert.equal(report.topology[0].genus, 0); assert.ok(brep.shells[0].closed && brep.coedges.every(use => use.pcurve));
  const mass = massPropertiesOf(result); close(mass.volume, volume(3), 'independent Round volume');
  const cavityMoment = 16 * delta - 4 / 3;
  close(mass.centroid[0], (14592 * 20 - (9984 + cavityMoment) * 17) / volume(3), 'X centroid');
  close(mass.centroid[1], (10272 * 20 - (6984 + cavityMoment) * 17) / volume(3), 'Y centroid');
  close(mass.centroid[2], (172800 - area * 17 * 11.5) / volume(3), 'Z centroid');
  close(surfaceAreaOf(result), 6568 + 17 * Math.PI, 'independent surface area', 1e-6);
  const named = name => brep.faces.find(face => face.name === name);
  for (const [name, z, sign, loops] of [['e.bottom', 0, -1, 1], ['e.top', 20, 1, 2], ['sh.floor', 3, 1, 1]]) {
    const face = named(name), g = face && faceGeometry(face); assert.ok(face && g.kind === 'plane', name);
    close(g.o[2], z, name); assert.equal(g.n[2], sign); assert.equal(face.loops.length, loops);
  }
  const cylinder = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder'); assert.equal(cylinder.length, 1);
  for (const u of [0, .2, .5, .8, 1]) for (const v of [0, .3, 1]) {
    const p = evaluateSurface(cylinder[0].surface, u, v); close((p[0] - 16) ** 2 + (p[1] - 16) ** 2, 4, 'Round cylinder radius');
    assert.ok(p[2] >= 3 - 1e-9 && p[2] <= 20 + 1e-9);
  }
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 32 }); watertight(mesh);
  for (const z of [.5, 2.5]) assert.equal(materialAt(mesh, [5, 5, z]), true, 'floor remains solid');
  for (const z of [3.5, 10, 19.5, 21]) assert.equal(materialAt(mesh, [5, 5, z]), false, 'cavity opens only through top');
  assert.equal(materialAt(mesh, [1, 5, 10]), true); assert.equal(materialAt(mesh, [3, 5, 10]), false);
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  assert.deepEqual(output(structuredClone(source)).brep, brep);
  const edited = output(documentOf(4)); close(massPropertiesOf(edited).volume - mass.volume, area, 'one millimetre floor edit');
  assert.deepEqual(edited.brep.faces.map(face => face.name), brep.faces.map(face => face.name));
});

test('equal floor preserves incumbent default native bytes; reversed and tagged original loops retain their ownership', () => {
  const legacy = documentOf(); delete legacy.features[2].floorThickness;
  assert.deepEqual(output(documentOf(2)).brep, output(legacy).brep);
  for (const reversed of [false, true]) {
    const source = documentOf(3), p = reversed ? points.toReversed() : points;
    source.features[0] = { id: 's', kind: 'sketch', profile: 'loop', segments: p.map(start => ({ kind: 'line', start })), sideTags: { outer: p.map((_, i) => `wall${i}`) } };
    source.features[1].from = 3;
    const result = output(source); close(massPropertiesOf(result).volume, volume(3), 'tagged/reversed volume');
    assert.ok(p.every((_, i) => result.brep.faces.some(face => face.name === `e.side[wall${i}]`)));
    assert.ok(result.brep.faces.some(face => { const g = faceGeometry(face); return face.name === 'sh.floor' && g.kind === 'plane' && g.o[2] === 6; }));
  }
});

test('independent L floor refuses nonliteral, collapsed, wrong-opening and unsupported ancestry without changing inputs', () => {
  for (const value of [0, -1, NaN, Infinity, '3', { param: 'f' }, 20, 19.999999999]) {
    const source = documentOf(value), before = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), error => category(error) === 'PARAMETER'); assert.deepEqual(source, before);
  }
  for (const thickness of [8, 7.999999999, .000001]) assert.throws(() => output(documentOf(3, { thickness })), error => category(error) === 'PARAMETER');
  for (const extra of [{ open: [] }, { open: ['e.bottom'] }, { open: ['e.side0'] }, { open: ['e.top', 'e.bottom'] }, { open: ['e.top#1'] }, { join: 'arc' }, { join: 'sharp' }])
    assert.throws(() => output(documentOf(3, extra)), error => category(error) === 'CAPABILITY');
  for (const change of [
    source => { source.features[0] = { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] }; },
    source => { source.features[1].draft = 2; },
    source => { source.features[0].plane = { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }; },
    source => { source.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'e', offset: [1, 0, 0] }); source.features.at(-1).target = 'm'; source.features.at(-1).open = ['e.top']; },
  ]) { const source = documentOf(); change(source); assert.throws(() => output(source), error => category(error) === 'CAPABILITY'); }
});
