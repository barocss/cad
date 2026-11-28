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
  for (const extra of [{ open: [] }, { open: ['e.bottom'] }, { open: ['e.side0'] }, { open: ['e.top', 'e.bottom'] }, { open: ['e.top#1'] }])
    assert.throws(() => output(documentOf(3, extra)), error => category(error) === 'CAPABILITY');
  for (const change of [
    source => { source.features[0] = { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] }; },
    source => { source.features[1].draft = 2; },
    source => { source.features[0].plane = { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }; },
    source => { source.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'e', offset: [1, 0, 0] }); source.features.at(-1).target = 'm'; source.features.at(-1).open = ['e.top']; },
  ]) { const source = documentOf(); change(source); assert.throws(() => output(source), error => category(error) === 'CAPABILITY'); }
});

for (const join of ['sharp', 'arc']) test(`independent L floor with explicit ${join} retains exact topology, mass, supports and physical corner`, () => {
  const source = documentOf(3, { join }), before = structuredClone(source), snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep;
  assert.deepEqual(source, before);
  const sharp = join === 'sharp', cavityArea = sharp ? 600 : area, expectedVolume = 17280 - cavityArea * 17;
  const report = checkBrep(brep, { strict: true }); assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, sharp
    ? { bodies: 1, shells: 1, faces: 15, loops: 16, coedges: 72, edges: 36, vertices: 24 }
    : { bodies: 1, shells: 1, faces: 16, loops: 17, coedges: 78, edges: 39, vertices: 26 });
  assert.equal(report.topology[0].genus, 0); assert.ok(brep.shells[0].closed && brep.coedges.every(use => use.pcurve));
  const mass = massPropertiesOf(result), extraMoment = sharp ? 0 : 16 * delta - 4 / 3;
  close(mass.volume, expectedVolume, 'independent volume');
  close(mass.centroid[0], (14592 * 20 - (9984 + extraMoment) * 17) / expectedVolume, 'X centroid');
  close(mass.centroid[1], (10272 * 20 - (6984 + extraMoment) * 17) / expectedVolume, 'Y centroid');
  close(mass.centroid[2], (172800 - cavityArea * 17 * 11.5) / expectedVolume, 'Z centroid');
  close(surfaceAreaOf(result), sharp ? 6636 : 6568 + 17 * Math.PI, 'surface area', 1e-6);
  const original = output({ ...source, features: source.features.slice(0, 2) }).brep;
  for (const face of original.faces) {
    const matches = brep.faces.filter(candidate => candidate.name === face.name), old = faceGeometry(face);
    assert.equal(matches.length, 1, `one retained ${face.name}`);
    const current = faceGeometry(matches[0]); assert.equal(old.kind, 'plane'); assert.equal(current.kind, 'plane');
    assert.deepEqual(current.n, old.n);
    close(old.n.reduce((sum, value, axis) => sum + value * (current.o[axis] - old.o[axis]), 0), 0, 'original outer support');
    if (old.n[2] !== 0) continue;
    const inner = brep.faces.filter(candidate => candidate.name?.replace(/#\d+$/, '') === `sh.in.${face.name}`)
      .map(faceGeometry).filter(support => support.kind === 'plane');
    assert.equal(inner.length, 1);
    const [support] = inner;
    for (let axis = 0; axis < 3; axis++) close(support.n[axis], -old.n[axis], 'opposing inner normal');
    close(old.n.reduce((sum, value, axis) => sum + value * (support.o[axis] - old.o[axis]), 0), -2, 'side wall thickness');
  }
  const floor = brep.faces.find(face => face.name === 'sh.floor'), rim = brep.faces.find(face => face.name === 'e.top');
  assert.ok(floor && rim); close(faceGeometry(floor).o[2], 3, 'independent floor support'); assert.equal(floor.loops.length, 1);
  assert.equal(rim.loops.length, 2);
  const innerRim = rim.loops.map(id => brep.loops.find(loop => loop.id === id)).find(loop => loop.kind === 'inner');
  assert.equal(innerRim.coedges.length, sharp ? 6 : 7);
  const cylinders = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder'); assert.equal(cylinders.length, sharp ? 0 : 1);
  if (!sharp) for (const u of [0, .2, .5, .8, 1]) for (const v of [0, .3, 1]) {
    const p = evaluateSurface(cylinders[0].surface, u, v); close((p[0] - 16) ** 2 + (p[1] - 16) ** 2, 4, 'exact Round radius');
    assert.ok(p[2] >= 3 - 1e-9 && p[2] <= 20 + 1e-9);
  }
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 32 }); watertight(mesh);
  for (const z of [.5, 2.5]) assert.equal(materialAt(mesh, [5, 5, z]), true, 'full independent floor');
  for (const z of [3.5, 10, 19.5, 21]) assert.equal(materialAt(mesh, [5, 5, z]), false, 'open cavity');
  assert.equal(materialAt(mesh, [14.4, 14.4, 10]), sharp, 'Sharp square and Round quarter disc differ');
  assert.equal(materialAt(mesh, [14.8, 14.8, 10]), true); assert.equal(materialAt(mesh, [13.5, 13.5, 10]), false);
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  assert.deepEqual(output(structuredClone(source)).brep, brep);
  for (const floorThickness of [1, 4]) {
    const edited = output(documentOf(floorThickness, { join }));
    close(massPropertiesOf(edited).volume - mass.volume, cavityArea * (floorThickness - 3), 'independent floor edit');
    assert.deepEqual(edited.brep.faces.map(face => face.name), brep.faces.map(face => face.name));
  }
});

test('explicit Round with independent floor preserves default native bytes, including equal wall and floor', () => {
  for (const floorThickness of [1, 2, 3, 4]) assert.deepEqual(output(documentOf(floorThickness, { join: 'arc' })).brep, output(documentOf(floorThickness)).brep);
});

for (const join of ['sharp', 'arc']) test(`independent ${join} floor retains reflected, reversed and translated original tagged L ownership`, () => {
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const reversed of [false, true]) {
    let p = points.map(([x, y]) => [17 + sx * x, -11 + sy * y]); if (reversed) p = p.toReversed();
    const source = documentOf(3, { join });
    source.features[0] = { id: 's', kind: 'sketch', profile: 'loop', segments: p.map(start => ({ kind: 'line', start })), sideTags: { outer: p.map((_, i) => `wall${i}`) } };
    source.features[1].from = 3;
    const result = output(source), mass = massPropertiesOf(result), cavityArea = join === 'sharp' ? 600 : area;
    const expectedVolume = 17280 - cavityArea * 17, extraMoment = join === 'sharp' ? 0 : 16 * delta - 4 / 3;
    close(mass.volume, expectedVolume, 'placed volume');
    close(mass.centroid[0], 17 + sx * (14592 * 20 - (9984 + extraMoment) * 17) / expectedVolume, 'translated X centroid');
    close(mass.centroid[1], -11 + sy * (10272 * 20 - (6984 + extraMoment) * 17) / expectedVolume, 'translated Y centroid');
    close(mass.centroid[2], 3 + (172800 - cavityArea * 17 * 11.5) / expectedVolume, 'translated Z centroid');
    assert.ok(p.every((_, i) => result.brep.faces.some(face => face.name === `e.side[wall${i}]`)));
    close(faceGeometry(result.brep.faces.find(face => face.name === 'sh.floor')).o[2], 6, 'original from plus floor');
  }
});

for (const join of ['sharp', 'arc']) test(`independent ${join} floor keeps collapse, opening and original-stock admission boundaries`, () => {
  for (const floorThickness of [0, -1, NaN, Infinity, '3', { param: 'f' }, 20, 19.999999999])
    assert.throws(() => output(documentOf(floorThickness, { join })), error => category(error) === 'PARAMETER');
  for (const thickness of [8, 7.999999999, .000001])
    assert.throws(() => output(documentOf(3, { join, thickness })), error => category(error) === 'PARAMETER');
  for (const open of [[], ['e.bottom'], ['e.side0'], ['e.top', 'e.bottom'], ['e.top', 'e.top'], ['e.top#1']])
    assert.throws(() => output(documentOf(3, { join, open })), error => category(error) === 'CAPABILITY');
  for (const change of [
    source => { source.features[0] = { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] }; },
    source => { source.features[1].draft = 2; },
    source => { source.features[0].plane = { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }; },
    source => { source.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'e', offset: [1, 0, 0] }); source.features.at(-1).target = 'm'; },
  ]) {
    const source = documentOf(3, { join }); change(source);
    const edited = structuredClone(source); assert.throws(() => output(source), error => category(error) === 'CAPABILITY');
    assert.deepEqual(source, edited);
  }
});
