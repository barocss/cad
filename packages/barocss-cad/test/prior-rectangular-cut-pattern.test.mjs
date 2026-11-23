import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, massPropertiesOf, brepMassProperties, checkBrep, faceGeometry, CadPartError } from '../dist/index.js';

const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-7, `${actual} vs ${expected}`);
const pattern = () => ({ id: 'repeat', kind: 'rectangular-feature-pattern', target: 'second', source: 'first',
  axis: 'x', spacing: { parameter: 'pitchX' }, count: 2, axis2: 'y', spacing2: { parameter: 'pitchY' }, count2: 2 });
const document = () => ({ format: 'barocss-cad-part', version: 1, units: 'mm',
  parameters: { olderRight: 12, newerRight: 14, pitchX: 16, pitchY: 8 }, features: [
    { id: 'stockSketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
    { id: 'stock', kind: 'extrude', sketch: 'stockSketch', height: 10 },
    { id: 'olderSketch', kind: 'sketch', profile: 'rectangle', min: [8, 8], max: [{ parameter: 'olderRight' }, 10],
      sideTags: { outer: ['a', 'b', 'c', 'd'] } },
    { id: 'olderTool', kind: 'extrude', sketch: 'olderSketch', height: 10 },
    { id: 'first', kind: 'difference', target: 'stock', tool: 'olderTool' },
    { id: 'newerSketch', kind: 'sketch', profile: 'rectangle', min: [8, 26], max: [{ parameter: 'newerRight' }, 28],
      sideTags: { outer: ['p', 'q', 'r', 's'] } },
    { id: 'newerTool', kind: 'extrude', sketch: 'newerSketch', height: 10 },
    { id: 'second', kind: 'difference', target: 'first', tool: 'newerTool' }, pattern(),
  ] });

function loopBounds(brep, loop) {
  const points = loop.coedges.flatMap(id => {
    const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge);
    return edge.curve.controlPoints;
  });
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}

function verify(snapshot, { olderRight = 12, newerRight = 14, pitchX = 16, pitchY = 8, count = 2, count2 = 2 } = {}) {
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(output.bodyCount, 1); assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1);
  assert.equal(report.topology[0].genus, count * count2 + 1);
  const cavities = [[8, 26, newerRight, 28]], removed = [{ volume: (newerRight - 8) * 2 * 10, center: [(8 + newerRight) / 2, 27, 5] }];
  const names = brep.faces.map(face => face.name);
  for (let j = 0; j < count2; j++) for (let i = 0; i < count; i++) {
    const x = 8 + i * pitchX, y = 8 + j * pitchY, width = olderRight - 8;
    cavities.push([x, y, x + width, y + 2]);
    removed.push({ volume: width * 2 * 10, center: [x + width / 2, y + 1, 5] });
    for (const tag of ['a', 'b', 'c', 'd']) assert.ok(names.includes(`olderTool.side[${tag}]${i || j ? `@${i},${j}` : ''}`));
  }
  for (const tag of ['p', 'q', 'r', 's']) {
    assert.ok(names.includes(`newerTool.side[${tag}]`));
    assert.ok(!names.some(name => name?.startsWith(`newerTool.side[${tag}]@`)));
  }
  for (const z of [0, 10]) {
    const cap = brep.faces.filter(face => { const g = faceGeometry(face); return g.kind === 'plane' && Math.abs(g.n[2]) === 1 && g.o[2] === z; });
    assert.equal(cap.length, 1);
    const loops = cap[0].loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.equal(loops.filter(loop => loop.kind === 'outer').length, 1);
    const actual = loops.filter(loop => loop.kind === 'inner').map(loop => loopBounds(brep, loop)).sort();
    assert.deepEqual(actual, [...cavities].sort());
  }
  const volume = 24000 - removed.reduce((sum, cut) => sum + cut.volume, 0);
  const centroid = [30, 20, 5].map((center, axis) => (24000 * center - removed.reduce((sum, cut) => sum + cut.volume * cut.center[axis], 0)) / volume);
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume); mass.centroid.forEach((value, axis) => near(value, centroid[axis]));
  }
  return output;
}

test('the earlier consumed rectangular cut repeats on the current two-cut stock with independent 23560 volume and five through cavities', () => {
  const input = document(), before = structuredClone(input), initial = evaluateCadPart(input), output = verify(initial);
  assert.deepEqual(checkBrep(output.brep, { strict: true }).counts,
    { bodies: 1, shells: 1, faces: 26, loops: 36, coedges: 144, edges: 72, vertices: 48 });
  near(brepMassProperties(output.brep, 1).volume, 23560);
  const centroid = brepMassProperties(output.brep, 1).centroid;
  near(centroid[0], 712920 / 23560); near(centroid[1], 472600 / 23560); near(centroid[2], 5);
  assert.deepEqual(initial.document.features, before.features); assert.deepEqual(input, before);
  const reopened = loadCadPart(saveCadPart(initial));
  assert.deepEqual(reopened.document, initial.document); assert.deepEqual(verify(reopened).brep, output.brep);
  const current = document(); current.features.pop();
  const newerWalls = brep => brep.faces.filter(face => face.name?.startsWith('newerTool.side')).map(face => ({ name: face.name, geometry: faceGeometry(face) })).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(newerWalls(output.brep), newerWalls(evaluateCadPart(current).outputs[0].brep));
});

test('source size, newer cut size and each pitch remain independent dependencies through edit, restore and fresh reopen', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial), originalNames = initial.outputs[0].brep.faces.map(face => face.name).sort();
  for (const [parameters, expected] of [[{ olderRight: 14 }, { olderRight: 14 }], [{ newerRight: 16 }, { newerRight: 16 }],
    [{ pitchX: 20 }, { pitchX: 20 }], [{ pitchY: 10 }, { pitchY: 10 }]]) {
    const edited = reevaluate(initial, { parameters }), output = verify(edited, expected);
    assert.deepEqual(output.brep.faces.map(face => face.name).sort(), originalNames);
    assert.deepEqual(verify(loadCadPart(saveCadPart(edited)), expected).brep, output.brep);
  }
  assert.equal(saveCadPart(initial), saved); verify(reevaluate(initial, { parameters: {} }));
  const swapped = document(); Object.assign(swapped.features.at(-1), { axis: 'y', spacing: 8, axis2: 'x', spacing2: 16 });
  const normal = verify(initial), other = evaluateCadPart(swapped).outputs[0];
  near(brepMassProperties(other.brep, 1).volume, brepMassProperties(normal.brep, 1).volume);
  const single = document(); Object.assign(single.features.at(-1), { count: 1, count2: 1 });
  verify(evaluateCadPart(single), { count: 1, count2: 1 });
});

test('omitting source retains the existing current-tool pattern and repeats only the newer cutter', () => {
  const doc = document(); delete doc.features.at(-1).source;
  const snapshot = evaluateCadPart(doc), brep = snapshot.outputs[0].brep;
  near(brepMassProperties(brep, 1).volume, 23440);
  assert.equal(checkBrep(brep, { strict: true }).topology[0].genus, 5);
  const names = brep.faces.map(face => face.name);
  assert.ok(names.includes('newerTool.side[p]@1,1'));
  assert.ok(!names.some(name => name?.startsWith('olderTool.side[a]@')));
});

test('invalid earlier sources and unsupported producer chains refuse without changing accepted history or native output', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  const refused = (change, code = 'REFERENCE') => {
    const doc = document(); change(doc); const before = structuredClone(doc);
    assert.throws(() => reevaluate(initial, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat' && error.code === code);
    assert.deepEqual(doc, before); assert.equal(saveCadPart(initial), saved);
  };
  for (const source of ['missing', 'second', 'stock', 'olderTool', 'first/0', null, 4]) refused(doc => { doc.features.at(-1).source = source; });
  refused(doc => { doc.features.find(feature => feature.id === 'first').suppressed = true; });
  refused(doc => { doc.features.splice(-1, 0, { id: 'moved', kind: 'translate', target: 'second', offset: [0, 0, 1] }); });
  refused(doc => { doc.features.splice(-1, 0, { id: 'unrelated', kind: 'difference', target: 'stock', tool: 'olderTool' }); doc.features.at(-1).source = 'unrelated'; });
  refused(doc => { doc.features.find(feature => feature.id === 'olderTool').height = 5; }, 'CAPABILITY');
  refused(doc => { doc.features.find(feature => feature.id === 'newerTool').height = 5; }, 'CAPABILITY');
  refused(doc => {
    Object.assign(doc.features.find(feature => feature.id === 'olderSketch'), { profile: 'circle', center: [10, 9], radius: 1, sideTags: { outer: ['a'] } });
  }, 'CAPABILITY');
  refused(doc => { doc.features.splice(4, 0, { id: 'movedTool', kind: 'translate', target: 'olderTool', offset: [0, 0, 0] }); doc.features.find(feature => feature.id === 'first').tool = 'movedTool'; }, 'CAPABILITY');
  refused(doc => { doc.features.at(-1).axis2 = 'z'; }, 'CAPABILITY');
  verify(initial);
});

test('all explicit source cells must stay interior and disjoint from the fixed newer cut and one another', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  for (const parameters of [{ pitchY: 18 }, { pitchX: 2 }, { pitchY: 1 }, { pitchX: 50 }, { pitchY: -8 }]) {
    assert.throws(() => reevaluate(initial, { parameters }), error => error instanceof CadPartError && error.feature === 'repeat' && error.code === 'GEOMETRY');
    assert.equal(saveCadPart(initial), saved);
  }
  const changed = document(); changed.features.at(-1).source = 'second'; const before = structuredClone(changed);
  assert.throws(() => evaluateCadPart(changed), CadPartError); assert.deepEqual(changed, before);
  assert.deepEqual(verify(initial).brep, verify(loadCadPart(saved)).brep);
});
