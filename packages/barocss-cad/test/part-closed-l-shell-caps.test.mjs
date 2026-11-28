import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateCadPart, reevaluate, massPropertiesOf, surfaceAreaOf, checkBrep, evaluateCurve, evaluateSurface, tessellateBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { faceGeometry } from '../dist/brep/analytic-boolean.js';

const points = [[0, 0], [40, 0], [40, 16], [16, 16], [16, 30], [0, 30]];
const documentOf = (join, floorThickness = 3, ceilingThickness = 4, thickness = 2) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'polygon', points },
    { id: 'e', kind: 'extrude', sketch: 's', height: 20 },
    { id: 'sh', kind: 'shell', target: 'e', thickness, floorThickness, ceilingThickness, ...(join === undefined ? {} : { join }) },
  ],
});
const category = error => error.details?.category ?? error.code;
const close = (actual, expected, label, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const output = source => evaluateCadPart(source).outputs[0];
const cavityArea = (join, t = 2) => (40 - 2 * t) * (16 - 2 * t) + (16 - 2 * t) * (30 - 2 * t) - (16 - 2 * t) ** 2
  + (join === 'sharp' ? 0 : t * t * (1 - Math.PI / 4));
const expectedVolume = (join, floor = 3, ceiling = 4, t = 2) => 17280 - cavityArea(join, t) * (20 - floor - ceiling);

// Independent vertical parity rays through the native mesh, merging only coincident shared-edge hits.
function materialAt(mesh, point) {
  const hits = [], P = mesh.positions, I = mesh.indices;
  for (let i = 0; i < I.length; i += 3) {
    const a = [...P.slice(I[i] * 3, I[i] * 3 + 3)], b = [...P.slice(I[i + 1] * 3, I[i + 1] * 3 + 3)], c = [...P.slice(I[i + 2] * 3, I[i + 2] * 3 + 3)];
    const u = [b[0] - a[0], b[1] - a[1]], v = [c[0] - a[0], c[1] - a[1]], det = u[0] * v[1] - u[1] * v[0];
    if (Math.abs(det) < 1e-12) continue;
    const x = point[0] - a[0], y = point[1] - a[1], s = (x * v[1] - y * v[0]) / det, t = (u[0] * y - u[1] * x) / det;
    if (s < -1e-10 || t < -1e-10 || s + t > 1 + 1e-10) continue;
    const z = a[2] + s * (b[2] - a[2]) + t * (c[2] - a[2]);
    if (z > point[2] + 1e-9 && !hits.some(hit => Math.abs(hit - z) < 1e-8)) hits.push(z);
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

for (const join of [undefined, 'sharp', 'arc']) test(`closed original L has independent caps and one exact ${join ?? 'default Round'} cavity`, () => {
  const source = documentOf(join), before = structuredClone(source), snapshot = evaluateCadPart(source), result = snapshot.outputs[0], brep = result.brep;
  assert.deepEqual(source, before);
  const report = checkBrep(brep, { strict: true }); assert.ok(report.valid, report.issues.join('\n'));
  const sharp = join === 'sharp';
  assert.deepEqual(report.counts, sharp
    ? { bodies: 1, shells: 2, faces: 16, loops: 16, coedges: 72, edges: 36, vertices: 24 }
    : { bodies: 1, shells: 2, faces: 17, loops: 17, coedges: 78, edges: 39, vertices: 26 });
  assert.equal(report.topology[0].genus, 0); assert.equal(brep.bodies[0].kind, 'solid');
  assert.ok(brep.shells.every(shell => shell.closed) && brep.coedges.every(use => use.pcurve));
  const [outerShell, cavityShell] = brep.bodies[0].shells; assert.notEqual(outerShell, cavityShell);
  assert.equal(brep.faces.filter(face => face.shell === outerShell).length, 8);
  assert.equal(brep.faces.filter(face => face.shell === cavityShell).length, sharp ? 8 : 9);
  const mass = massPropertiesOf(result), area = cavityArea(join), volume = expectedVolume(join), delta = sharp ? 0 : 4 - Math.PI;
  const extraMoment = sharp ? 0 : 16 * delta - 4 / 3;
  close(mass.volume, volume, 'independent closed volume');
  close(mass.centroid[0], (14592 * 20 - (9984 + extraMoment) * 13) / volume, 'X centroid');
  close(mass.centroid[1], (10272 * 20 - (6984 + extraMoment) * 13) / volume, 'Y centroid');
  close(mass.centroid[2], (172800 - area * 13 * 9.5) / volume, 'Z centroid');
  close(surfaceAreaOf(result), sharp ? 7340 : 7296 + 11 * Math.PI, 'independent total surface area', 1e-6);
  const original = output({ ...source, features: source.features.slice(0, 2) }).brep;
  for (const face of original.faces) {
    const matches = brep.faces.filter(candidate => candidate.name === face.name), old = faceGeometry(face);
    assert.equal(matches.length, 1, `original ${face.name}`); assert.equal(matches[0].shell, outerShell); assert.equal(matches[0].loops.length, 1);
    const current = faceGeometry(matches[0]); assert.equal(old.kind, 'plane'); assert.equal(current.kind, 'plane'); assert.deepEqual(current.n, old.n);
    close(old.n.reduce((sum, value, axis) => sum + value * (current.o[axis] - old.o[axis]), 0), 0, 'original outer support');
    if (old.n[2] !== 0) continue;
    const inner = brep.faces.filter(candidate => candidate.name?.replace(/#\d+$/, '') === `sh.in.${face.name}` && faceGeometry(candidate).kind === 'plane');
    assert.equal(inner.length, 1); assert.equal(inner[0].shell, cavityShell);
    const g = faceGeometry(inner[0]); for (let axis = 0; axis < 3; axis++) close(g.n[axis], -old.n[axis], 'opposing side normal');
    close(old.n.reduce((sum, value, axis) => sum + value * (g.o[axis] - old.o[axis]), 0), -2, 'two millimetre side wall');
  }
  for (const [name, shell, z, normal] of [['e.bottom', outerShell, 0, -1], ['e.top', outerShell, 20, 1], ['sh.floor', cavityShell, 3, 1], ['sh.ceiling', cavityShell, 16, -1]]) {
    const face = brep.faces.find(candidate => candidate.name === name), g = face && faceGeometry(face);
    assert.ok(face && g.kind === 'plane', name); assert.equal(face.shell, shell); assert.equal(face.loops.length, 1);
    close(g.o[2], z, name); assert.equal(g.n[2], normal);
  }
  const cylinders = brep.faces.filter(face => faceGeometry(face).kind === 'cylinder'); assert.equal(cylinders.length, sharp ? 0 : 1);
  if (!sharp) {
    assert.equal(cylinders[0].shell, cavityShell);
    for (const u of [0, .2, .5, .8, 1]) for (const v of [0, .3, 1]) {
      const p = evaluateSurface(cylinders[0].surface, u, v); close((p[0] - 16) ** 2 + (p[1] - 16) ** 2, 4, 'native Round cylinder');
      assert.ok(p[2] >= 3 - 1e-9 && p[2] <= 16 + 1e-9);
    }
    const edges = new Map(brep.edges.map(edge => [edge.id, edge])), uses = new Map(brep.coedges.map(use => [use.id, use]));
    for (const [name, z] of [['sh.floor', 3], ['sh.ceiling', 16]]) {
      const face = brep.faces.find(candidate => candidate.name === name), loop = brep.loops.find(candidate => candidate.id === face.loops[0]);
      const arc = loop.coedges.map(id => edges.get(uses.get(id).edge)).find(edge => edge.curve.degree === 2); assert.ok(arc);
      for (const t of [0, .2, .5, .8, 1]) {
        const p = evaluateCurve(arc.curve, t); close(p[2], z, 'native cavity trim station'); close((p[0] - 16) ** 2 + (p[1] - 16) ** 2, 4, 'native cavity trim radius');
      }
    }
  }
  const mesh = tessellateBrep(brep, { segmentsPerQuarter: 32 }); watertight(mesh);
  for (const z of [1, 2.5, 16.5, 19.5]) assert.equal(materialAt(mesh, [5, 5, z]), true, 'independent floor or ceiling is material');
  for (const z of [-1, 3.5, 10, 15.5, 21]) assert.equal(materialAt(mesh, [5, 5, z]), false, 'one closed interior cavity or exterior is empty');
  assert.equal(materialAt(mesh, [1, 5, 10]), true); assert.equal(materialAt(mesh, [3, 5, 10]), false);
  assert.equal(materialAt(mesh, [14.4, 14.4, 10]), sharp, 'independent Sharp/Round corner witness');
  assert.equal(materialAt(mesh, [14.8, 14.8, 10]), true); assert.equal(materialAt(mesh, [13.5, 13.5, 10]), false);
  const saved = saveCadPart(snapshot), feature = JSON.parse(saved).features.at(-1);
  assert.equal(feature.floorThickness, 3); assert.equal(feature.ceilingThickness, 4); assert.equal(Object.hasOwn(feature, 'open'), false);
  assert.deepEqual(loadCadPart(saved).outputs[0].brep, brep); assert.deepEqual(output(structuredClone(source)).brep, brep);
  const explicitClosed = structuredClone(source); explicitClosed.features.at(-1).open = []; assert.deepEqual(output(explicitClosed).brep, brep);
});

for (const join of ['sharp', 'arc']) test(`closed ${join} caps retain independent edits, reflection and native cache ownership`, () => {
  const source = documentOf(join), snapshot = evaluateCadPart(source), original = structuredClone(snapshot.outputs[0].brep), originalMass = massPropertiesOf(snapshot.outputs[0]);
  for (const [floor, ceiling] of [[4, 4], [3, 5], [4, 3]]) {
    const doc = documentOf(join, floor, ceiling), rebuilt = reevaluate(snapshot, { document: doc }), result = rebuilt.outputs[0];
    close(massPropertiesOf(result).volume, expectedVolume(join, floor, ceiling), 'independent edited volume');
    assert.deepEqual(result.brep, output(doc).brep, 'cached and cold native results agree');
    assert.deepEqual(result.brep.faces.map(face => face.name), original.faces.map(face => face.name), 'cap edit preserves native face names');
    if (floor + ceiling === 8) close(massPropertiesOf(result).volume - originalMass.volume, cavityArea(join), 'one millimetre independent volume change');
    if (floor === 4 && ceiling === 3) close(massPropertiesOf(result).centroid[2] + originalMass.centroid[2], 20, 'swapped unequal cap centroid oracle');
  }
  assert.deepEqual(snapshot.outputs[0].brep, original, 'rebuild never changes the original snapshot');
  const equal = output(documentOf(join, 3, 3)); close(massPropertiesOf(equal).centroid[2], 10, 'equal caps are centered in Z');
});

for (const join of ['sharp', 'arc']) test(`closed ${join} caps preserve reversed/reflected tagged originals and their from datum`, () => {
  const delta = join === 'sharp' ? 0 : 4 - Math.PI, extraMoment = join === 'sharp' ? 0 : 16 * delta - 4 / 3, area = cavityArea(join), volume = expectedVolume(join);
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const reversed of [false, true]) {
    let p = points.map(([x, y]) => [17 + sx * x, -11 + sy * y]); p = p.slice(2).concat(p.slice(0, 2)); if (reversed) p = p.toReversed();
    const source = documentOf(join);
    source.features[0] = { id: 's', kind: 'sketch', profile: 'loop', segments: p.map(start => ({ kind: 'line', start })), sideTags: { outer: p.map((_, i) => `wall${i}`) } };
    source.features[1].from = 3;
    const result = output(source), mass = massPropertiesOf(result); close(mass.volume, volume, 'translated volume');
    close(mass.centroid[0], 17 + sx * (14592 * 20 - (9984 + extraMoment) * 13) / volume, 'translated X centroid');
    close(mass.centroid[1], -11 + sy * (10272 * 20 - (6984 + extraMoment) * 13) / volume, 'translated Y centroid');
    close(mass.centroid[2], 3 + (172800 - area * 13 * 9.5) / volume, 'translated Z centroid');
    assert.ok(p.every((_, i) => result.brep.faces.some(face => face.name === `e.side[wall${i}]`)));
    for (const [name, z] of [['e.bottom', 3], ['e.top', 23], ['sh.floor', 6], ['sh.ceiling', 19]])
      close(faceGeometry(result.brep.faces.find(face => face.name === name)).o[2], z, 'original and interior datums');
  }
});

test('closed independent caps support actual separated thin spans and default Round is explicit Round', () => {
  for (const [floor, ceiling, thickness] of [[3, 4, 2], [3, 16.9998, 2], [.001, .002, 2], [10, 9.8, .1]]) {
    const base = output(documentOf(undefined, floor, ceiling, thickness));
    assert.deepEqual(base.brep, output(documentOf('arc', floor, ceiling, thickness)).brep);
    for (const join of ['sharp', 'arc']) {
      const source = documentOf(join, floor, ceiling, thickness), result = output(source), report = checkBrep(result.brep, { strict: true });
      assert.ok(report.valid, report.issues.join('\n')); close(massPropertiesOf(result).volume, expectedVolume(join, floor, ceiling, thickness), 'thin span volume');
    }
  }
});

for (const join of [undefined, 'sharp', 'arc']) test(`closed ${join ?? 'default Round'} independent caps reject invalid values and unsupported source without mutation`, () => {
  const refuses = (source, expected, message) => {
    const before = structuredClone(source);
    assert.throws(() => output(source), error => category(error) === expected && (!message || error.message === message)); assert.deepEqual(source, before);
  };
  for (const value of [0, -1, NaN, Infinity, '3', null, { parameter: 'f' }]) {
    const floor = documentOf(join); floor.features.at(-1).floorThickness = value; refuses(floor, 'PARAMETER');
    const ceiling = documentOf(join); ceiling.features.at(-1).ceilingThickness = value; refuses(ceiling, 'PARAMETER');
  }
  for (const [floor, ceiling] of [[3, 17], [3, 18], [20, 4], [3, 16.99995]])
    refuses(documentOf(join, floor, ceiling), 'PARAMETER', 'sh: The Shell floor and ceiling thicknesses leave no supported cavity height.');
  for (const thickness of [8, 7.999999999, .000001]) refuses(documentOf(join, 3, 4, thickness), 'PARAMETER');
  for (const open of [['e.top'], ['e.bottom'], ['e.side0'], ['e.top', 'e.bottom'], ['e.top', 'e.top']]) {
    const source = documentOf(join); source.features.at(-1).open = open; refuses(source, 'INPUT');
  }
  for (const missing of ['floorThickness', 'ceilingThickness']) { const source = documentOf(join); delete source.features.at(-1)[missing]; refuses(source, 'CAPABILITY'); }
  for (const change of [
    source => { source.features[0] = { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] }; },
    source => { source.features[1].draft = 2; },
    source => { source.features[0].plane = { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }; },
    source => { source.features[0].points = structuredClone(points); source.parameters.x = 40; source.features[0].points[1][0] = { parameter: 'x' }; },
    source => { source.features.splice(2, 0, { id: 'm', kind: 'translate', target: 'e', offset: [1, 0, 0] }); source.features.at(-1).target = 'm'; },
  ]) { const source = documentOf(join); change(source); refuses(source, 'CAPABILITY'); }
});

test('prior uniform closed and original top/bottom archives retain their exact native bytes', () => {
  const priorPoints = [[0, 0], [40, 0], [40, 10], [10, 10], [10, 30], [0, 30]];
  for (const [join, open, digest] of [
    [undefined, undefined, '9cc2472669ce5fe0b86ab453a7640d3ae08b5d41437426e0282dfd86dd49d0e5'],
    ['sharp', undefined, '8a2d2c1830b6821b371bf90dc662af9afca09564d72f52316db6801f308bd671'],
    ['arc', undefined, 'e9bf66b028838c414e7001b5efb68f77bbf849606792a211be93acc2da3d740e'],
    [undefined, ['e.top'], 'e747d5358749205a8388f76b2507e00c57c3eb7746b1ab373c67be4ecd5f702f'],
    ['sharp', ['e.top'], '2088292e2c6f73a79be6c0cbbf0df1cffb27ba6e4c6fd7ea4436dccd7f55d718'],
    ['arc', ['e.top'], '7d0ef7cf6ca1ac3f678f6544f0ca06f12ca96b9434554672c18bec277c9ebd50'],
    [undefined, ['e.bottom'], 'cd72822000d3ff9ebaa995d645a20246037a776b23c102552f7a3019f3e518e3'],
  ]) {
    const source = documentOf(join); source.features[0].points = priorPoints;
    delete source.features.at(-1).floorThickness; delete source.features.at(-1).ceilingThickness;
    if (open !== undefined) source.features.at(-1).open = open;
    const snapshot = evaluateCadPart(source), result = snapshot.outputs[0];
    assert.equal(createHash('sha256').update(JSON.stringify(result.brep)).digest('hex'), digest);
    const feature = JSON.parse(saveCadPart(snapshot)).features.at(-1);
    assert.equal(Object.hasOwn(feature, 'floorThickness'), false); assert.equal(Object.hasOwn(feature, 'ceilingThickness'), false);
  }
});
