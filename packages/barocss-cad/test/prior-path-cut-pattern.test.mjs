import test from 'node:test';
import assert from 'node:assert/strict';
import { part } from '../dist/api/index.js';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, massPropertiesOf, brepMassProperties, checkBrep, faceGeometry, CadPartError } from '../dist/index.js';
import { curveCutOffsets } from '../dist/features/curve-cut-pattern.js';

const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-7, `${actual} vs ${expected}`);
const path = (degree = 2, turn = 16) => degree === 1
  ? { degree: 1, knots: [0, 0, 1, 2, 2], controlPoints: [[0, 0, 2], [turn, 0, 2], [turn, 24, 2]], weights: [1, 1, 1] }
  : { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2], controlPoints: [[0, 0, 2], [turn / 2, 0, 2], [turn, 0, 2], [turn, 12, 2], [turn, 24, 2]], weights: [1, 1, 1, 1, 1] };
const document = (raw = path()) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { olderRight: 12, newerRight: 14, pitch: 16 }, features: [
  { id: 'stockSketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
  { id: 'stock', kind: 'extrude', sketch: 'stockSketch', height: 10 },
  { id: 'olderSketch', kind: 'sketch', profile: 'rectangle', min: [8, 8], max: [{ parameter: 'olderRight' }, 10], sideTags: { outer: ['a', 'b', 'c', 'd'] } },
  { id: 'olderTool', kind: 'extrude', sketch: 'olderSketch', height: 10 },
  { id: 'first', kind: 'difference', target: 'stock', tool: 'olderTool' },
  { id: 'newerSketch', kind: 'sketch', profile: 'rectangle', min: [8, 26], max: [{ parameter: 'newerRight' }, 28], sideTags: { outer: ['p', 'q', 'r', 's'] } },
  { id: 'newerTool', kind: 'extrude', sketch: 'newerSketch', height: 10 },
  { id: 'second', kind: 'difference', target: 'first', tool: 'newerTool' },
  { id: 'repeat', kind: 'curve-feature-pattern', target: 'second', source: 'first', path: raw, spacing: { parameter: 'pitch' }, count: 3 },
] });
const baseOffsets = [[0, 0], [16, 0], [16, 16]];
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const newerWalls = brep => brep.faces.filter(face => face.name?.startsWith('newerTool.side')).map(face => ({ name: face.name, geometry: faceGeometry(face) })).sort((a, b) => a.name.localeCompare(b.name));

function loopBounds(brep, loop) {
  const points = loop.coedges.flatMap(id => {
    const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge);
    return edge.curve.controlPoints;
  });
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
function verify(snapshot, offsets = baseOffsets, { olderRight = 12, newerRight = 14 } = {}) {
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n')); assert.equal(output.id, 'repeat'); assert.equal(output.bodyCount, 1);
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1); assert.equal(report.topology[0].genus, offsets.length + 1);
  const cavities = [[8, 26, newerRight, 28]], removed = [{ volume: (newerRight - 8) * 2 * 10, center: [(8 + newerRight) / 2, 27, 5] }];
  const names = brep.faces.map(face => face.name);
  for (const [k, [dx, dy]] of offsets.entries()) {
    const x = 8 + dx, y = 8 + dy, width = olderRight - 8;
    cavities.push([x, y, x + width, y + 2]); removed.push({ volume: width * 2 * 10, center: [x + width / 2, y + 1, 5] });
    for (const tag of ['a', 'b', 'c', 'd']) assert.ok(names.includes(`olderTool.side[${tag}]${k ? `@${k}` : ''}`));
  }
  for (const tag of ['p', 'q', 'r', 's']) {
    assert.ok(names.includes(`newerTool.side[${tag}]`)); assert.ok(!names.some(name => name?.startsWith(`newerTool.side[${tag}]@`)));
  }
  for (const z of [0, 10]) {
    const caps = brep.faces.filter(face => { const g = faceGeometry(face); return g.kind === 'plane' && Math.abs(g.n[2]) === 1 && g.o[2] === z; });
    assert.equal(caps.length, 1);
    const loops = caps[0].loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.equal(loops.filter(loop => loop.kind === 'outer').length, 1);
    assert.deepEqual(loops.filter(loop => loop.kind === 'inner').map(loop => loopBounds(brep, loop)).sort(), [...cavities].sort());
  }
  const volume = 24000 - removed.reduce((sum, cut) => sum + cut.volume, 0);
  const centroid = [30, 20, 5].map((center, axis) => (24000 * center - removed.reduce((sum, cut) => sum + cut.volume * cut.center[axis], 0)) / volume);
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume); mass.centroid.forEach((value, axis) => near(value, centroid[axis]));
  }
  return output;
}

test('the earlier source follows an orthogonal XY Path in both literal encodings with fixed-orientation native openings and 23640 material', () => {
  let original;
  for (const degree of [1, 2]) {
    const doc = document(path(degree)), before = structuredClone(doc), initial = evaluateCadPart(doc), output = verify(initial);
    assert.deepEqual(checkBrep(output.brep, { strict: true }).counts,
      { bodies: 1, shells: 1, faces: 22, loops: 30, coedges: 120, edges: 60, vertices: 40 });
    const mass = brepMassProperties(output.brep, 1); near(mass.volume, 23640);
    near(mass.centroid[0], 713720 / 23640); near(mass.centroid[1], 473320 / 23640); near(mass.centroid[2], 5);
    if (original) assert.deepEqual(output.brep, original); else original = output.brep;
    const current = document(path(degree)); current.features.pop();
    assert.deepEqual(newerWalls(output.brep), newerWalls(evaluateCadPart(current).outputs[0].brep));
    assert.deepEqual(initial.document.features, before.features); assert.deepEqual(doc, before);
    const reopened = loadCadPart(saveCadPart(initial)); assert.deepEqual(reopened.document, initial.document); assert.deepEqual(verify(reopened).brep, output.brep);
  }
});

test('translated paths and nonuniform knots preserve offsets while original size, later size, spacing, count and turn edits remain independent', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial), names = initial.outputs[0].brep.faces.map(face => face.name).sort();
  for (const degree of [1, 2]) {
    const raw = path(degree); raw.controlPoints = raw.controlPoints.map(point => point.map((value, axis) => value + [100, -200, 7][axis]));
    raw.knots = degree === 1 ? [-10, -10, -9, 20, 20] : [-10, -10, -10, -9, -9, 20, 20, 20];
    assert.deepEqual(verify(evaluateCadPart(document(raw))).brep, initial.outputs[0].brep);
  }
  for (const parameters of [{ olderRight: 14 }, { newerRight: 16 }]) {
    const edited = reevaluate(initial, { parameters }), output = verify(edited, baseOffsets, parameters);
    assert.deepEqual(output.brep.faces.map(face => face.name).sort(), names);
    assert.deepEqual(verify(loadCadPart(saveCadPart(edited)), baseOffsets, parameters).brep, output.brep);
  }
  const moved = reevaluate(initial, { parameters: { pitch: 14 } }), shifted = [[0, 0], [14, 0], [16, 12]], output = verify(moved, shifted);
  const mass = brepMassProperties(output.brep, 1); near(mass.volume, 23640); near(mass.centroid[0], 713880 / 23640); near(mass.centroid[1], 473640 / 23640);
  assert.deepEqual(output.brep.faces.map(face => face.name).sort(), names); assert.deepEqual(verify(loadCadPart(saveCadPart(moved)), shifted).brep, output.brep);
  const turn = document(path(2, 20)); verify(reevaluate(initial, { document: turn }), [[0, 0], [16, 0], [20, 12]]);
  const fewer = document(); fewer.features.at(-1).count = 2; verify(reevaluate(initial, { document: fewer }), baseOffsets.slice(0, 2));
  assert.deepEqual(verify(reevaluate(moved, { document: document() })).brep, initial.outputs[0].brep); assert.equal(saveCadPart(initial), saved);
});

test('explicit source admission rejects nonlevel poles and unsupported paths even at count one', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  const refused = (raw, code, message) => {
    const doc = document(raw); doc.features.at(-1).count = 1; const before = structuredClone(doc);
    assert.throws(() => reevaluate(initial, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat' && error.code === code && (!message || message.test(error.message)));
    assert.deepEqual(doc, before); assert.equal(saveCadPart(initial), saved);
  };
  for (const degree of [1, 2]) {
    const nonlevel = path(degree); nonlevel.controlPoints[1][2] = 2 + 2 * Number.EPSILON;
    refused(nonlevel, 'CAPABILITY', /one exact constant authored Z/);
  }
  const curved = path(); curved.controlPoints[1][1] = 1e-12; refused(curved, 'CAPABILITY', /exact straight-span midpoints/);
  refused({ degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [[0, 0, 2], [8, 6, 2], [16, 0, 2]], weights: [1, 2, 1] }, 'CAPABILITY', /weights must all be 1/);
  const smooth = path(); smooth.knots[4] = 1.1; refused(smooth, 'CAPABILITY', /double interior knots/);
  const weighted = path(1); weighted.weights[1] = 2; refused(weighted, 'CAPABILITY', /weights must all be 1/);
  const closed = path(1); closed.controlPoints[2] = [...closed.controlPoints[0]]; refused(closed, 'CAPABILITY', /open path/);
  const collapsed = path(1); collapsed.controlPoints[1] = [...collapsed.controlPoints[0]]; refused(collapsed, 'INPUT', /positive length/);
});

test('the earlier-source planner owns every numeric field before validation and never invokes raw or nested getters', () => {
  let invoked = 0; const variants = [];
  for (const field of ['degree', 'knots', 'controlPoints', 'weights']) {
    const raw = path(1); Object.defineProperty(raw, field, { enumerable: true, get() { invoked++; return path(1)[field]; } }); variants.push(raw);
  }
  const row = path(); Object.defineProperty(row.controlPoints, '1', { get() { invoked++; return [8, 0, 2]; } }); variants.push(row);
  const coordinate = path(); Object.defineProperty(coordinate.controlPoints[1], '2', { get() { invoked++; return 2; } }); variants.push(coordinate);
  const weight = path(); Object.defineProperty(weight.weights, '1', { get() { invoked++; return 1; } }); variants.push(weight);
  const sparse = path(); delete sparse.weights[1]; variants.push(sparse);
  const symbol = path(); symbol[Symbol('extra')] = 1; variants.push(symbol);
  const inherited = Object.assign(Object.create({ extra: 1 }), path()); variants.push(inherited);
  for (const raw of variants) assert.throws(() => curveCutOffsets(raw, 16, 3, 10000, fail, 'prior-xy-linear'), error => error.code === 'INPUT');
  assert.equal(invoked, 0);
  const raw = path(), before = structuredClone(raw), offsets = curveCutOffsets(raw, 16, 3, 10000, fail, 'prior-xy-linear');
  assert.deepEqual(offsets, [[0, 0, 0], [16, 0, 0], [16, 16, 0]]); assert.deepEqual(raw, before);
  raw.controlPoints[1][0] = 999; raw.weights[1] = 2;
  assert.deepEqual(offsets, [[0, 0, 0], [16, 0, 0], [16, 16, 0]]);
});

test('count one still proves the earlier source while no-source curved, three-dimensional and fluent Path routes keep prior behavior', () => {
  const single = document(); single.features.at(-1).count = 1; verify(evaluateCadPart(single), [[0, 0]]);
  const invalidSource = structuredClone(single); invalidSource.features.at(-1).source = 'second'; assert.throws(() => evaluateCadPart(invalidSource), CadPartError);
  const curved = { degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [[0, 0, 2], [8, 6, 2], [16, 0, 2]], weights: [1, 1, 1] };
  const spatial = path(1); spatial.controlPoints[1][2] = 3;
  for (const raw of [curved, spatial]) {
    const doc = document(raw); delete doc.features.at(-1).source; doc.features.at(-1).count = 1;
    near(brepMassProperties(evaluateCadPart(doc).outputs[0].brep, 1).volume, 23800);
  }
  const current = document(); current.features.pop(); const facade = part('current Path control', current), before = facade.doc;
  const accepted = facade.curveFeaturePattern({ path: path(), spacing: 16, count: 3 });
  assert.equal(accepted.doc.features.at(-1).source, undefined); assert.deepEqual(facade.doc, before);
  const brep = evaluateCadPart(accepted.doc).outputs[0].brep;
  near(brepMassProperties(brep, 1).volume, 23680); assert.ok(brep.faces.some(face => face.name === 'newerTool.side[p]@1'));
  assert.ok(!brep.faces.some(face => face.name?.startsWith('olderTool.side[a]@')));
});

test('bad source ownership, unsupported cutters and unsafe native offsets refuse before copying without changing accepted history', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  const refused = (change, code, message) => {
    const doc = document(); change(doc); const before = structuredClone(doc);
    assert.throws(() => reevaluate(initial, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat' && error.code === code && (!message || message.test(error.message)));
    assert.deepEqual(doc, before); assert.equal(saveCadPart(initial), saved);
  };
  for (const source of ['missing', 'second', 'stock', 'olderTool', 'first/0', null, 4]) refused(doc => { doc.features.at(-1).source = source; }, 'REFERENCE');
  refused(doc => { doc.features.find(feature => feature.id === 'first').suppressed = true; }, 'REFERENCE', /path feature pattern source/);
  refused(doc => { doc.features.splice(-1, 0, { id: 'moved', kind: 'translate', target: 'second', offset: [0, 0, 1] }); }, 'REFERENCE', /must still be active/);
  refused(doc => { doc.features.splice(-1, 0, { id: 'foreign', kind: 'difference', target: 'stock', tool: 'olderTool' }); doc.features.at(-1).source = 'foreign'; }, 'REFERENCE', /direct Difference chain/);
  for (const id of ['olderTool', 'newerTool']) refused(doc => { doc.features.find(feature => feature.id === id).height = 5; }, 'CAPABILITY', /path feature pattern source/);
  refused(doc => { Object.assign(doc.features.find(feature => feature.id === 'olderSketch'), { profile: 'circle', center: [10, 9], radius: 1, sideTags: { outer: ['a'] } }); }, 'CAPABILITY');
  for (const [end, spacing, message] of [[[0, 18, 2], 18, /disjoint/], [[4, 0, 2], 4, /disjoint/], [[-8, 0, 2], 8, /strictly inside/], [[60, 0, 2], 60, /strictly inside/]])
    refused(doc => { Object.assign(doc.features.at(-1), { path: { degree: 1, knots: [0, 0, 1, 1], controlPoints: [[0, 0, 2], end], weights: [1, 1] }, spacing, count: 2 }); }, 'GEOMETRY', message);
  refused(doc => { doc.features.at(-1).count = 4; }, 'PARAMETER', /exceeds the open path length/);
  refused(doc => { doc.features.at(-1).count = 65; }, 'INPUT');
  for (const spacing of [0, -1, NaN, Infinity, 10001]) refused(doc => { doc.features.at(-1).spacing = spacing; }, 'PARAMETER');
  assert.deepEqual(verify(initial).brep, verify(loadCadPart(saved)).brep);
});
