import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateCadPart, reevaluate, massPropertiesOf, surfaceAreaOf, checkBrep, evaluateCurve, evaluateSurface, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { faceGeometry } from '../dist/brep/analytic-boolean.js';

const documentOf = (ceilingThickness = 3, thickness = 2) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'circle', center: [14, 9], radius: 15 },
    { id: 'e', kind: 'extrude', sketch: 's', from: 3, height: 20 },
    { id: 'sh', kind: 'shell', target: 'e', thickness, open: ['e.bottom'], ceilingThickness },
  ],
});
const output = source => evaluateCadPart(source).outputs[0];
const category = error => error.details?.category ?? error.code;
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const volume = (ceiling, wall = 2, r = 15) => Math.PI * (r ** 2 * 20 - (r - wall) ** 2 * (20 - ceiling));
const counts = { bodies: 1, shells: 1, faces: 7, loops: 8, coedges: 24, edges: 12, vertices: 8 };
function refuses(source, expected, message) {
  const before = structuredClone(source);
  assert.throws(() => output(source), error => category(error) === expected && (!message || error.message === message));
  assert.deepEqual(source, before, 'refusal preserves input');
}

// Independent vertical parity rays through the actual native triangulation.
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

test('original cylinder bottom opening retains an independent ceiling, original rim and exact native walls', () => {
  const source = documentOf(), before = structuredClone(source), snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep;
  assert.deepEqual(source, before);
  const report = checkBrep(brep, { strict: true }); assert.ok(report.valid, report.issues.join('\n')); assert.deepEqual(report.counts, counts);
  assert.equal(report.topology[0].genus, 0); assert.equal(brep.bodies[0].kind, 'solid'); assert.equal(brep.bodies[0].shells.length, 1);
  assert.ok(brep.shells[0].closed && brep.coedges.every(use => use.pcurve)); assert.equal(new Set(brep.faces.map(face => face.name)).size, 7);
  assert.ok(!brep.faces.some(face => face.name === 'sh.floor'));
  const mass = massPropertiesOf(result); close(mass.volume, 1627 * Math.PI, 'independent volume'); close(mass.centroid[0], 14, 'center X'); close(mass.centroid[1], 9, 'center Y'); close(mass.centroid[2], 50921 / 3254, 'independent center Z'); close(surfaceAreaOf(result), 1492 * Math.PI, 'analytic total area', 1e-6);
  const original = output({ ...source, features: source.features.slice(0, 2) }).brep;
  for (const face of original.faces) {
    const current = brep.faces.filter(candidate => candidate.name === face.name); assert.equal(current.length, 1);
    const a = faceGeometry(face), b = faceGeometry(current[0]); assert.equal(a.kind, b.kind);
    if (a.kind === 'plane') { assert.deepEqual(a.n, b.n); close(a.o[2], b.o[2], 'original axial datum'); }
    else { assert.equal(a.kind, 'cylinder'); close(a.r, b.r, 'original outer cylinder'); assert.deepEqual(a.a, b.a); assert.equal(a.out, b.out); close(a.c[0], b.c[0], 'outer X'); close(a.c[1], b.c[1], 'outer Y'); }
  }
  const loops = new Map(brep.loops.map(loop => [loop.id, loop])), uses = new Map(brep.coedges.map(use => [use.id, use])), edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  for (const [name, station, normal, number] of [['e.top', 23, 1, 1], ['e.bottom', 3, -1, 2], ['sh.ceiling', 20, -1, 1]]) {
    const face = brep.faces.find(candidate => candidate.name === name), g = faceGeometry(face); assert.equal(g.kind, 'plane'); close(g.o[2], station, name); assert.deepEqual(g.n, [0, 0, normal]); assert.equal(face.loops.length, number);
    if (number === 2) assert.deepEqual(face.loops.map(id => loops.get(id).kind).sort(), ['inner', 'outer']);
    for (const id of face.loops) {
      const loop = loops.get(id), radius = name === 'sh.ceiling' || loop.kind === 'inner' ? 13 : 15; assert.equal(loop.coedges.length, 2);
      for (const useId of loop.coedges) {
        const edge = edges.get(uses.get(useId).edge); assert.equal(edge.curve.degree, 2);
        for (const t of [0, .2, .5, .8, 1]) { const p = evaluateCurve(edge.curve, t); close(p[2], station, 'native circular trim datum'); close((p[0] - 14) ** 2 + (p[1] - 9) ** 2, radius ** 2, 'native circular trim radius'); }
      }
    }
  }
  for (const [normal, radius, lo, hi] of [[1, 15, 3, 23], [-1, 13, 3, 20]]) {
    const walls = brep.faces.filter(face => { const g = faceGeometry(face); return g.kind === 'cylinder' && g.out === normal; }); assert.equal(walls.length, 2);
    for (const face of walls) {
      const g = faceGeometry(face); close(g.r, radius, 'wall support'); assert.equal(face.loops.length, 1);
      const zs = face.surface.controlPoints.flat().map(p => p[2]); close(Math.min(...zs), lo, 'wall start'); close(Math.max(...zs), hi, 'wall ends at the retained ceiling or original top');
      for (const u of [0, .3, .7, 1]) for (const v of [0, .5, 1]) { const p = evaluateSurface(face.surface, u, v); close((p[0] - 14) ** 2 + (p[1] - 9) ** 2, radius ** 2, 'native wall'); }
    }
  }
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 16 });
  assert.equal(materialAt(mesh, [14.7, 9.3, 20.2]), true); assert.equal(materialAt(mesh, [14.7, 9.3, 22]), true);
  for (const z of [2, 3.2, 12, 19.8, 24]) assert.equal(materialAt(mesh, [14.7, 9.3, z]), false, 'cavity opens through original bottom');
  for (const z of [4, 12, 22.8]) assert.equal(materialAt(mesh, [28, 9.3, z]), true, 'radial wall is material');
  const saved = saveCadPart(snapshot); assert.equal(JSON.parse(saved).features.at(-1).ceilingThickness, 3); assert.ok(!Object.hasOwn(JSON.parse(saved).features.at(-1), 'floorThickness'));
  assert.deepEqual(loadCadPart(saved).outputs[0].brep, brep); assert.deepEqual(output(structuredClone(source)).brep, brep);
});

test('ceiling and wall edits retain original ownership and cache isolation', () => {
  const source = documentOf(), snapshot = evaluateCadPart(source), before = structuredClone(snapshot.outputs[0].brep), initialMass = massPropertiesOf(snapshot.outputs[0]);
  for (const [ceiling, wall] of [[4, 2], [2, 2], [3, 3], [3, 10], [.001, .1]]) {
    const doc = documentOf(ceiling, wall), result = reevaluate(snapshot, { document: doc }).outputs[0]; close(massPropertiesOf(result).volume, volume(ceiling, wall), 'independent edited volume'); assert.deepEqual(result.brep, output(doc).brep); assert.deepEqual(result.brep.faces.map(face => face.name), before.faces.map(face => face.name));
    if (ceiling === 4) close(massPropertiesOf(result).volume - initialMass.volume, 169 * Math.PI, 'one millimetre ceiling change');
  }
  assert.deepEqual(snapshot.outputs[0].brep, before);
});

test('four millimetre ceiling has independent cap station, mass moment and volume change', () => {
  const initial = output(documentOf()), result = output(documentOf(4)), mass = massPropertiesOf(result);
  close(mass.volume, 1796 * Math.PI, 'ceiling four volume'); close(mass.centroid[2], 7189 / 449, 'ceiling four physical centroid');
  close(surfaceAreaOf(result), 1466 * Math.PI, 'ceiling four total area', 1e-6);
  close(mass.volume - massPropertiesOf(initial).volume, 169 * Math.PI, 'one millimetre cap addition');
  const cap = faceGeometry(result.brep.faces.find(face => face.name === 'sh.ceiling')); assert.equal(cap.kind, 'plane'); close(cap.o[2], 19, 'ceiling four datum'); assert.deepEqual(cap.n, [0, 0, -1]);
});

test('bottom-open ceiling retains omitted datum, negative datum, fractional source and side tags', () => {
  for (const from of [undefined, -17, 3]) {
    const source = documentOf(), center = [-25.37, 31.13], radius = 15.19;
    source.features[0].center = center; source.features[0].radius = radius; source.features[0].sideTags = { outer: ['wall'] };
    if (from === undefined) delete source.features[1].from; else source.features[1].from = from;
    const result = output(source), mass = massPropertiesOf(result), z = from ?? 0; close(mass.volume, volume(3, 2, radius), 'fractional translated volume'); close(mass.centroid[0], center[0], 'translated X'); close(mass.centroid[1], center[1], 'translated Y');
    for (const [name, station] of [['e.top', z + 20], ['e.bottom', z], ['sh.ceiling', z + 17]]) close(faceGeometry(result.brep.faces.find(face => face.name === name)).o[2], station, 'translated station');
    assert.equal(result.brep.faces.filter(face => face.name?.startsWith('e.side[wall]#')).length, 2); assert.equal(result.brep.faces.filter(face => face.name?.startsWith('sh.in.e.side[wall]#')).length, 2);
  }
});

test('ceiling and radial collapse produce distinct typed refusals', () => {
  for (const ceiling of [20, 21, 19.99995]) refuses(documentOf(ceiling), 'PARAMETER', 'sh: The Shell ceiling thickness leaves no cavity height.');
  for (const wall of [15, 16, 14.999, .00005]) refuses(documentOf(3, wall), 'PARAMETER', 'sh: The Shell wall thickness leaves no supported cylindrical cavity.');
  for (const ceiling of [0, -1, null, NaN, Infinity, '3', { parameter: 'ceiling' }]) refuses(documentOf(ceiling), 'PARAMETER');
});

test('independent cylindrical ceiling requires just its exact original bottom opening and no join', () => {
  for (const open of [[], ['e.top'], ['e.bottom', 'e.top'], ['e.bottom', 'e.bottom'], ['e.side0'], ['e.bottom#1']]) { const source = documentOf(); source.features.at(-1).open = open; refuses(source, 'CAPABILITY'); }
  for (const join of ['sharp', 'arc']) { const source = documentOf(); source.features.at(-1).join = join; refuses(source, 'CAPABILITY', 'sh: Independent cylindrical Shell caps do not support an explicit join.'); }
  const both = documentOf(); both.features.at(-1).floorThickness = 5; refuses(both, 'INPUT');
  const floor = documentOf(); delete floor.features.at(-1).ceilingThickness; floor.features.at(-1).floorThickness = 3; refuses(floor, 'CAPABILITY');
});

test('bottom-open ceiling retains original literal and upright source boundaries', () => {
  const mutations = [
    source => { source.features[0].plane = { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }; },
    source => { source.parameters.r = 15; source.features[0].radius = { parameter: 'r' }; },
    source => { source.parameters.x = 14; source.features[0].center[0] = { parameter: 'x' }; },
    source => { source.parameters.h = 20; source.features[1].height = { parameter: 'h' }; },
    source => { source.parameters.z = 3; source.features[1].from = { parameter: 'z' }; },
    source => { source.features[1].height = -20; },
    source => { source.features[1].draft = 5; },
    source => { source.features.at(-1).target = 'e/0'; },
    source => { source.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'e', offset: [1, 0, 0] }); source.features.at(-1).target = 'm'; },
    source => { source.features[0].holes = [[{ kind: 'arc', start: [18, 9], center: [14, 9], direction: 'cw' }]]; },
    source => { source.features[0] = { id: 's', kind: 'sketch', profile: 'loop', segments: [{ kind: 'arc', start: [29, 9], center: [14, 9], direction: 'ccw' }] }; },
  ];
  for (const mutate of mutations) { const source = documentOf(); mutate(source); refuses(source, 'CAPABILITY'); }
});

test('mirrored cap reuse preserves closed, D2231 top-open and ordinary bottom-open native bytes', () => {
  const hash = source => createHash('sha256').update(JSON.stringify(output(source).brep)).digest('hex');
  const closed = documentOf(); delete closed.features.at(-1).open; closed.features.at(-1).floorThickness = 3; closed.features.at(-1).ceilingThickness = 5;
  assert.equal(hash(closed), '7641721886db9116f0c2a2a9a832a1ef8f0e5da459f02f10bba8af4d4da86bd4');
  const top = documentOf(); delete top.features.at(-1).ceilingThickness; top.features.at(-1).floorThickness = 3; top.features.at(-1).open = ['e.top'];
  assert.equal(hash(top), 'e8464ac3afcddf74863a227625a58652a067e2b629dee05fef7426f30ad21a0a');
  const ordinary = documentOf(); delete ordinary.features.at(-1).ceilingThickness;
  assert.equal(hash(ordinary), 'b006111c79856500c6ca2ae2fad0e664faf35e007fdfe0611113e0d1c054819b');
});
