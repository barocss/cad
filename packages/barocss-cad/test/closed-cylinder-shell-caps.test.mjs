import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, massPropertiesOf, surfaceAreaOf, checkBrep, evaluateCurve, evaluateSurface, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { faceGeometry } from '../dist/brep/analytic-boolean.js';

const documentOf = (floorThickness = 3, ceilingThickness = 5, thickness = 2) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'circle', center: [14, 9], radius: 15 },
    { id: 'e', kind: 'extrude', sketch: 's', from: 3, height: 20 },
    { id: 'sh', kind: 'shell', target: 'e', thickness, floorThickness, ceilingThickness },
  ],
});
const output = source => evaluateCadPart(source).outputs[0];
const category = error => error.details?.category ?? error.code;
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const volume = (floor, ceiling, wall = 2) => Math.PI * (15 ** 2 * 20 - (15 - wall) ** 2 * (20 - floor - ceiling));
const counts = { bodies: 1, shells: 2, faces: 8, loops: 8, coedges: 24, edges: 12, vertices: 8 };
const radialMessage = 'sh: The Shell wall thickness leaves no supported cylindrical cavity.';
const axialMessage = 'sh: The Shell floor and ceiling thicknesses leave no supported cavity height.';
function refuses(source, expected, message) {
  const before = structuredClone(source);
  assert.throws(() => output(source), error => category(error) === expected && (!message || error.message === message));
  assert.deepEqual(source, before, 'refusal preserves the input');
}

// Vertical ray parity uses only the actual native tessellation, independently of stored mass.
function materialAt(mesh, point) {
  const hits = [], P = mesh.positions, I = mesh.indices;
  for (let i = 0; i < I.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map(k => [...P.slice(I[i + k] * 3, I[i + k] * 3 + 3)]);
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - a[0], c[1] - a[1]], det = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(det) < 1e-12) continue;
    const x = point[0] - a[0], y = point[1] - a[1], s = (x * v[1] - y * v[0]) / det, t = (u[0] * y - u[1] * x) / det;
    if (s < -1e-10 || t < -1e-10 || s + t > 1 + 1e-10) continue;
    const z = a[2] + s * (b[2] - a[2]) + t * (c[2] - a[2]);
    if (z > point[2] + 1e-9 && !hits.some(hit => Math.abs(hit - z) < 1e-8)) hits.push(z);
  }
  return hits.length % 2 === 1;
}

test('closed original cylinder retains exact outer supports and one independently capped native cavity', () => {
  const source = documentOf(), before = structuredClone(source), snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep;
  assert.deepEqual(source, before);
  const report = checkBrep(brep, { strict: true }); assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, counts); assert.equal(report.topology[0].genus, 0);
  assert.equal(brep.bodies[0].kind, 'solid'); assert.ok(brep.shells.every(shell => shell.closed));
  assert.ok(brep.coedges.every(use => use.pcurve));
  const [outer, cavity] = brep.bodies[0].shells; assert.notEqual(outer, cavity);
  assert.equal(brep.faces.filter(face => face.shell === outer).length, 4);
  assert.equal(brep.faces.filter(face => face.shell === cavity).length, 4);
  const mass = massPropertiesOf(result);
  close(mass.volume, 2472 * Math.PI, 'independent analytic volume');
  close(mass.centroid[0], 14, 'centroid X'); close(mass.centroid[1], 9, 'centroid Y'); close(mass.centroid[2], 2847 / 206, 'unequal-cap centroid Z');
  close(surfaceAreaOf(result), 1700 * Math.PI, 'outer and inner analytic surface area', 1e-6);
  const original = output({ ...source, features: source.features.slice(0, 2) }).brep;
  for (const face of original.faces) {
    const matches = brep.faces.filter(candidate => candidate.name === face.name); assert.equal(matches.length, 1); assert.equal(matches[0].shell, outer);
    const a = faceGeometry(face), b = faceGeometry(matches[0]); assert.equal(a.kind, b.kind);
    if (a.kind === 'plane') { assert.deepEqual(a.n, b.n); close(a.o[2], b.o[2], 'original cap datum'); }
    else { assert.equal(a.kind, 'cylinder'); close(a.r, b.r, 'original outer radius'); assert.deepEqual(a.a, b.a); close(a.c[0], b.c[0], 'original center X'); close(a.c[1], b.c[1], 'original center Y'); assert.equal(a.out, b.out); }
  }
  const loops = new Map(brep.loops.map(loop => [loop.id, loop])), uses = new Map(brep.coedges.map(use => [use.id, use])), edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  for (const [name, shell, z, normal, r] of [['e.bottom', outer, 3, -1, 15], ['e.top', outer, 23, 1, 15], ['sh.floor', cavity, 6, 1, 13], ['sh.ceiling', cavity, 18, -1, 13]]) {
    const face = brep.faces.find(candidate => candidate.name === name), g = face && faceGeometry(face);
    assert.ok(face && g.kind === 'plane', name); assert.equal(face.shell, shell); assert.equal(face.loops.length, 1);
    close(g.o[2], z, name); assert.deepEqual(g.n, [0, 0, normal]);
    const loop = loops.get(face.loops[0]); assert.equal(loop.coedges.length, 2);
    for (const id of loop.coedges) {
      const edge = edges.get(uses.get(id).edge); assert.equal(edge.curve.degree, 2);
      for (const t of [0, .2, .5, .8, 1]) {
        const p = evaluateCurve(edge.curve, t); close(p[2], z, 'circular native trim station'); close((p[0] - 14) ** 2 + (p[1] - 9) ** 2, r * r, 'circular native trim radius');
      }
    }
  }
  for (const [shell, radius, lo, hi, normal] of [[outer, 15, 3, 23, 1], [cavity, 13, 6, 18, -1]]) {
    const walls = brep.faces.filter(face => face.shell === shell && faceGeometry(face).kind === 'cylinder'); assert.equal(walls.length, 2);
    for (const face of walls) {
      const g = faceGeometry(face); close(g.r, radius, 'wall support radius'); assert.equal(g.out, normal);
      for (const u of [0, .2, .5, .8, 1]) for (const v of [0, .3, 1]) {
        const p = evaluateSurface(face.surface, u, v); close((p[0] - 14) ** 2 + (p[1] - 9) ** 2, radius ** 2, 'native cylindrical wall'); assert.ok(p[2] >= lo - 1e-9 && p[2] <= hi + 1e-9);
      }
      const zs = face.surface.controlPoints.flat().map(p => p[2]); close(Math.min(...zs), lo, 'wall first station'); close(Math.max(...zs), hi, 'wall last station');
    }
  }
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 16 });
  for (const z of [4, 5.5, 18.5, 22]) assert.equal(materialAt(mesh, [14.7, 9.3, z]), true, 'retained cap is material');
  for (const z of [2, 6.5, 12, 17.5, 24]) assert.equal(materialAt(mesh, [14.7, 9.3, z]), false, 'cavity and exterior are empty');
  assert.equal(materialAt(mesh, [28, 9.3, 12]), true, 'two millimetre radial wall');
  assert.equal(materialAt(mesh, [26, 9.3, 12]), false, 'inside radial wall');
  const saved = saveCadPart(snapshot); assert.equal(JSON.parse(saved).features.at(-1).floorThickness, 3); assert.equal(JSON.parse(saved).features.at(-1).ceilingThickness, 5);
  assert.deepEqual(loadCadPart(saved).outputs[0].brep, brep); assert.deepEqual(output(structuredClone(source)).brep, brep);
  const explicit = structuredClone(source); explicit.features.at(-1).open = []; assert.deepEqual(output(explicit).brep, brep);
});

test('closed cylindrical caps change independently and cached rebuilds preserve native ownership', () => {
  const source = documentOf(), snapshot = evaluateCadPart(source), before = structuredClone(snapshot.outputs[0].brep), baseMass = massPropertiesOf(snapshot.outputs[0]);
  for (const [floor, ceiling, wall] of [[4, 5, 2], [3, 6, 2], [5, 3, 2], [4, 4, 2], [3, 5, 3], [3, 5, 10]]) {
    const doc = documentOf(floor, ceiling, wall), result = reevaluate(snapshot, { document: doc }).outputs[0], mass = massPropertiesOf(result);
    close(mass.volume, volume(floor, ceiling, wall), 'edited physical volume'); assert.deepEqual(result.brep, output(doc).brep);
    assert.deepEqual(result.brep.faces.map(face => face.name), before.faces.map(face => face.name));
    if (floor + ceiling === 9) close(mass.volume - baseMass.volume, 169 * Math.PI, 'one millimetre cap adds cavity cross section');
    if (floor === 5 && ceiling === 3) close(mass.centroid[2] + baseMass.centroid[2], 26, 'swapped caps reflect the center of mass');
    if (floor === ceiling) close(mass.centroid[2], 13, 'equal caps center the mass');
  }
  assert.deepEqual(snapshot.outputs[0].brep, before);
});

test('literal cylinder caps retain omitted from, negative datum, translations and authored side names', () => {
  for (const from of [undefined, -17, 3]) {
    const source = documentOf(); if (from === undefined) delete source.features[1].from; else source.features[1].from = from;
    source.features[0].center = [-25, 31]; source.features[0].sideTags = { outer: ['wall'] };
    const result = output(source), mass = massPropertiesOf(result), z = from ?? 0;
    close(mass.volume, 2472 * Math.PI, 'translated volume'); close(mass.centroid[0], -25, 'translated center X'); close(mass.centroid[1], 31, 'translated center Y'); close(mass.centroid[2], z + 2847 / 206 - 3, 'translated center Z');
    for (const [name, station] of [['e.bottom', z], ['e.top', z + 20], ['sh.floor', z + 3], ['sh.ceiling', z + 15]]) close(faceGeometry(result.brep.faces.find(f => f.name === name)).o[2], station, name);
    assert.equal(result.brep.faces.filter(f => f.name?.startsWith('e.side[wall]#')).length, 2);
    assert.equal(result.brep.faces.filter(f => f.name?.startsWith('sh.in.e.side[wall]#')).length, 2);
  }
});

test('literal fractional circle data retains the authored analytic supports within floating point roundoff', () => {
  const source = documentOf(), center = [14.37, -9.13], radius = 15.19;
  source.features[0].center = center; source.features[0].radius = radius;
  const result = output(source), mass = massPropertiesOf(result), report = checkBrep(result.brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n')); assert.deepEqual(report.counts, counts);
  close(mass.volume, Math.PI * (radius ** 2 * 20 - (radius - 2) ** 2 * 12), 'fractional exact physical volume');
  close(mass.centroid[0], center[0], 'fractional center X'); close(mass.centroid[1], center[1], 'fractional center Y');
  for (const face of result.brep.faces) {
    const g = faceGeometry(face); if (g.kind !== 'cylinder') continue;
    close(g.r, g.out === 1 ? radius : radius - 2, 'fractional native radius'); close(g.c[0], center[0], 'fractional native X'); close(g.c[1], center[1], 'fractional native Y');
  }
});

test('closed cylinder cap and radial collapse return typed refusals without changing source', () => {
  for (const value of [0, -1, NaN, Infinity, null, '3', { parameter: 'f' }]) {
    const floor = documentOf(); floor.features.at(-1).floorThickness = value; refuses(floor, 'PARAMETER');
    const ceiling = documentOf(); ceiling.features.at(-1).ceilingThickness = value; refuses(ceiling, 'PARAMETER');
  }
  for (const [floor, ceiling] of [[3, 17], [20, 5], [3, 18], [3, 16.99995]]) refuses(documentOf(floor, ceiling), 'PARAMETER', axialMessage);
  for (const wall of [15, 16, 14.999, .00005]) refuses(documentOf(3, 5, wall), 'PARAMETER', radialMessage);
  const thin = output(documentOf(.001, .002, .1)); close(massPropertiesOf(thin).volume, volume(.001, .002, .1), 'small positive caps remain independent');
});

test('independent cylinder caps refuse openings, explicit joins and partial cap requests', () => {
  const opened = documentOf(); opened.features.at(-1).open = ['e.top']; refuses(opened, 'INPUT');
  for (const join of ['sharp', 'arc']) { const source = documentOf(); source.features.at(-1).join = join; refuses(source, 'CAPABILITY', 'sh: Independent cylindrical Shell caps do not support an explicit join.'); }
  for (const field of ['floorThickness', 'ceilingThickness']) { const source = documentOf(); delete source.features.at(-1)[field]; refuses(source, 'CAPABILITY'); }
});

test('independent cylinder admission stays bound to original unplaced literal solid circle stock', () => {
  const mutations = [
    source => { source.features[0].plane = { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }; },
    source => { source.parameters.r = 15; source.features[0].radius = { parameter: 'r' }; },
    source => { source.parameters.x = 14; source.features[0].center[0] = { parameter: 'x' }; },
    source => { source.parameters.h = 20; source.features[1].height = { parameter: 'h' }; },
    source => { source.parameters.z = 3; source.features[1].from = { parameter: 'z' }; },
    source => { source.features[1].height = -20; },
    source => { source.features[1].draft = 5; },
    source => { source.features.at(-1).target = 'e/0'; },
    source => { source.features[0].holes = [[{ kind: 'arc', start: [18, 9], center: [14, 9], direction: 'cw' }]]; },
    source => { source.features[0] = { id: 's', kind: 'sketch', profile: 'loop', segments: [{ kind: 'arc', start: [29, 9], center: [14, 9], direction: 'ccw' }] }; },
  ];
  for (const mutate of mutations) { const source = documentOf(); mutate(source); refuses(source, 'CAPABILITY'); }
});

test('ordinary uniform cylinder Shell keeps its existing native path and exact physical result', () => {
  const source = documentOf(); delete source.features.at(-1).floorThickness; delete source.features.at(-1).ceilingThickness;
  const result = output(source), brep = structuredClone(result.brep); close(massPropertiesOf(result).volume, 1796 * Math.PI, 'uniform legacy volume');
  assert.deepEqual(checkBrep(brep, { strict: true }).counts, counts);
  for (const [name, z] of [['sh.floor', 5], ['sh.ceiling', 21]]) close(faceGeometry(brep.faces.find(face => face.name === name)).o[2], z, 'legacy uniform station');
  const independent = output(documentOf(2, 2)); close(massPropertiesOf(independent).volume, massPropertiesOf(result).volume, 'matching literal depths have matching physical volume');
  assert.deepEqual(output(source).brep, brep, 'independent evaluation does not mutate ordinary result');
});
