import test from 'node:test';
import assert from 'node:assert/strict';
import { part } from '../dist/api/index.js';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, massPropertiesOf, brepMassProperties, checkBrep, faceGeometry, CadPartError } from '../dist/index.js';
import { fillCutSnapshot, fillCutPlacements } from '../dist/features/fill-cut-pattern.js';

const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-7, `${actual} vs ${expected}`);
const mask = (left = 25, right = 27, high = 20) => ({ points: [[left, 0], [right, 0], [right, high], [left, high]] });
const options = () => ({ region: mask(), anchor: [10, 9], spacing: 16, count: 2, spacing2: 8, count2: 2 });
const document = () => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { olderRight: 12, newerRight: 14, pitchX: 16, pitchY: 8 }, features: [
  { id: 'stockSketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
  { id: 'stock', kind: 'extrude', sketch: 'stockSketch', height: 10 },
  { id: 'olderSketch', kind: 'sketch', profile: 'rectangle', min: [8, 8], max: [{ parameter: 'olderRight' }, 10], sideTags: { outer: ['a', 'b', 'c', 'd'] } },
  { id: 'olderTool', kind: 'extrude', sketch: 'olderSketch', height: 10 },
  { id: 'first', kind: 'difference', target: 'stock', tool: 'olderTool' },
  { id: 'newerSketch', kind: 'sketch', profile: 'rectangle', min: [8, 26], max: [{ parameter: 'newerRight' }, 28], sideTags: { outer: ['p', 'q', 'r', 's'] } },
  { id: 'newerTool', kind: 'extrude', sketch: 'newerSketch', height: 10 },
  { id: 'second', kind: 'difference', target: 'first', tool: 'newerTool' },
  { id: 'repeat', kind: 'fill-feature-pattern', target: 'second', source: 'first', ...options(), spacing: { parameter: 'pitchX' }, spacing2: { parameter: 'pitchY' } },
] });
const baseCells = [[0, 0], [1, 0], [1, 1]];
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };
const selected = (doc) => {
  const node = doc.features.at(-1), own = fillCutSnapshot(node.region, node.anchor, fail);
  const number = value => typeof value === 'number' ? value : doc.parameters[value.parameter];
  return fillCutPlacements(own.region, own.anchor, number(node.spacing), node.count, number(node.spacing2), node.count2).map(placement => placement.suffix);
};
const newerWalls = brep => brep.faces.filter(face => face.name?.startsWith('newerTool.side')).map(face => ({ name: face.name, geometry: faceGeometry(face) })).sort((a, b) => a.name.localeCompare(b.name));

function loopBounds(brep, loop) {
  const points = loop.coedges.flatMap(id => {
    const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge);
    return edge.curve.controlPoints;
  });
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])), Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
function verify(snapshot, cells = baseCells, { olderRight = 12, newerRight = 14, pitchX = 16, pitchY = 8 } = {}) {
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n')); assert.equal(output.id, 'repeat'); assert.equal(output.bodyCount, 1);
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1); assert.equal(report.topology[0].genus, cells.length + 1);
  const cavities = [[8, 26, newerRight, 28]], removed = [{ volume: (newerRight - 8) * 2 * 10, center: [(8 + newerRight) / 2, 27, 5] }];
  const names = brep.faces.map(face => face.name);
  for (const [i, j] of cells) {
    const x = 8 + i * pitchX, y = 8 + j * pitchY, width = olderRight - 8;
    cavities.push([x, y, x + width, y + 2]); removed.push({ volume: width * 2 * 10, center: [x + width / 2, y + 1, 5] });
    for (const tag of ['a', 'b', 'c', 'd']) assert.ok(names.includes(`olderTool.side[${tag}]${i || j ? `@${i},${j}` : ''}`));
  }
  for (const tag of ['p', 'q', 'r', 's']) {
    assert.ok(names.includes(`newerTool.side[${tag}]`)); assert.ok(!names.some(name => name?.startsWith(`newerTool.side[${tag}]@`)));
  }
  const expectedCopies = cells.filter(([i, j]) => i || j).map(([i, j]) => `@${i},${j}`).sort();
  assert.deepEqual([...new Set(names.flatMap(name => name?.startsWith('olderTool.side') && name.includes('@') ? [name.slice(name.indexOf('@'))] : []))].sort(), expectedCopies);
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

test('earlier Fill source keeps the original outside its narrow mask and makes two full native copies with exact 23640 material', () => {
  const doc = document(), before = structuredClone(doc);
  assert.deepEqual(selected(doc), ['@1,0', '@1,1']);
  const initial = evaluateCadPart(doc), output = verify(initial), mass = brepMassProperties(output.brep, 1);
  assert.deepEqual(checkBrep(output.brep, { strict: true }).counts,
    { bodies: 1, shells: 1, faces: 22, loops: 30, coedges: 120, edges: 60, vertices: 40 });
  near(mass.volume, 23640); near(mass.centroid[0], 713720 / 23640); near(mass.centroid[1], 473960 / 23640); near(mass.centroid[2], 5);
  const current = document(); current.features.pop();
  assert.deepEqual(newerWalls(output.brep), newerWalls(evaluateCadPart(current).outputs[0].brep));
  assert.deepEqual(initial.document.features, before.features); assert.deepEqual(doc, before);
  const reopened = loadCadPart(saveCadPart(initial)); assert.deepEqual(reopened.document, initial.document); assert.deepEqual(verify(reopened).brep, output.brep);
});

test('captured mask holes and boundary rules select references without clipping original or replicated rectangular tools', () => {
  for (const left of [25.5, 26]) {
    const doc = document(); doc.features.at(-1).region.holes = [[[left, 16], [26.5, 16], [26.5, 18], [left, 18]]];
    assert.deepEqual(selected(doc), ['@1,0']);
    const initial = evaluateCadPart(doc), output = verify(initial, [[0, 0], [1, 0]]), mass = brepMassProperties(output.brep, 1);
    near(mass.volume, 23720); near(mass.centroid[0], 715800 / 23720); near(mass.centroid[1], 475320 / 23720);
    assert.deepEqual(verify(loadCadPart(saveCadPart(initial)), [[0, 0], [1, 0]]).brep, output.brep);
  }
  const boundary = document(); boundary.features.at(-1).region = mask(26, 27);
  assert.deepEqual(selected(boundary), ['@1,0', '@1,1']); verify(evaluateCadPart(boundary));
  const reversed = document(); reversed.features.at(-1).region.points.reverse();
  assert.deepEqual(selected(reversed), ['@1,0', '@1,1']); verify(evaluateCadPart(reversed));
});

test('earlier size, newer size, selected pitch and mask changes remain independent across edit, refusal, restore and reopen', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial), names = initial.outputs[0].brep.faces.map(face => face.name).sort();
  for (const parameters of [{ olderRight: 14 }, { newerRight: 16 }, { pitchY: 10 }]) {
    const edited = reevaluate(initial, { parameters }), output = verify(edited, baseCells, parameters);
    assert.deepEqual(output.brep.faces.map(face => face.name).sort(), names);
    assert.deepEqual(verify(loadCadPart(saveCadPart(edited)), baseCells, parameters).brep, output.brep);
  }
  const fewer = reevaluate(initial, { parameters: { pitchY: 12 } }); verify(fewer, [[0, 0], [1, 0]], { pitchY: 12 });
  const changed = document(); changed.features.at(-1).region.holes = [[[25.5, 16], [26.5, 16], [26.5, 18], [25.5, 18]]];
  verify(reevaluate(initial, { document: changed }), [[0, 0], [1, 0]]);
  assert.deepEqual(verify(reevaluate(fewer, { document: document() })).brep, initial.outputs[0].brep); assert.equal(saveCadPart(initial), saved);
});

test('only selected offsets receive physical admission so unsafe masked-out overlap and exterior candidates remain harmless', () => {
  const overlap = document(); overlap.parameters.pitchY = 18; overlap.features.at(-1).region = mask(25, 27, 30);
  assert.deepEqual(selected(overlap), ['@1,0', '@1,1']); verify(evaluateCadPart(overlap), baseCells, { pitchY: 18 });
  overlap.features.at(-1).region = mask(9, 27, 30);
  assert.throws(() => evaluateCadPart(overlap), error => error instanceof CadPartError && error.feature === 'repeat' && error.code === 'GEOMETRY' && /disjoint from the newer cut/.test(error.message));
  const exterior = document(); exterior.parameters.pitchX = 30; Object.assign(exterior.features.at(-1), { count: 3, count2: 1, region: mask(39, 41) });
  assert.deepEqual(selected(exterior), ['@1,0']); verify(evaluateCadPart(exterior), [[0, 0], [1, 0]], { pitchX: 30 });
  exterior.features.at(-1).region = mask(39, 71);
  assert.throws(() => evaluateCadPart(exterior), error => error instanceof CadPartError && error.code === 'GEOMETRY' && /strictly inside/.test(error.message));
});

test('zero extras still prove original source while omitted source retains existing current-tool and public API behavior', () => {
  for (const extra of [{ count: 1, count2: 1 }, { region: mask(100, 101) }]) {
    const doc = document(); Object.assign(doc.features.at(-1), extra); const initial = evaluateCadPart(doc);
    verify(initial, [[0, 0]]); near(brepMassProperties(initial.outputs[0].brep, 1).volume, 23800);
    const bad = structuredClone(doc); bad.features.at(-1).source = 'second'; assert.throws(() => evaluateCadPart(bad), CadPartError);
    const blind = structuredClone(doc); blind.features.find(feature => feature.id === 'olderTool').height = 5;
    assert.throws(() => evaluateCadPart(blind), error => error instanceof CadPartError && error.code === 'CAPABILITY' && /fill feature pattern source/.test(error.message));
  }
  const doc = document(); delete doc.features.at(-1).source;
  const output = evaluateCadPart(doc).outputs[0]; near(brepMassProperties(output.brep, 1).volume, 23560);
  assert.equal(checkBrep(output.brep, { strict: true }).topology[0].genus, 4);
  assert.ok(output.brep.faces.some(face => face.name === 'newerTool.side[p]@1,1'));
  assert.ok(!output.brep.faces.some(face => face.name?.startsWith('olderTool.side[a]@')));
  doc.features.pop(); const facade = part('current Fill control', doc), before = facade.doc, accepted = facade.fillFeaturePattern(options());
  assert.equal(accepted.doc.features.at(-1).source, undefined); near(brepMassProperties(evaluateCadPart(accepted.doc).outputs[0].brep, 1).volume, 23560);
  assert.deepEqual(facade.doc, before);
});

test('invalid source chains, unsupported native tools, masks and selected overlapping or boundary cells refuse atomically', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  const refused = (change, code, message) => {
    const doc = document(); change(doc); const before = structuredClone(doc);
    assert.throws(() => reevaluate(initial, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat' && error.code === code && (!message || message.test(error.message)));
    assert.deepEqual(doc, before); assert.equal(saveCadPart(initial), saved);
  };
  for (const source of ['missing', 'second', 'stock', 'olderTool', 'first/0', null, 4]) refused(doc => { doc.features.at(-1).source = source; }, 'REFERENCE');
  refused(doc => { doc.features.find(feature => feature.id === 'first').suppressed = true; }, 'REFERENCE', /fill feature pattern source/);
  refused(doc => { doc.features.splice(-1, 0, { id: 'moved', kind: 'translate', target: 'second', offset: [0, 0, 1] }); }, 'REFERENCE', /must still be active/);
  refused(doc => { doc.features.splice(-1, 0, { id: 'foreign', kind: 'difference', target: 'stock', tool: 'olderTool' }); doc.features.at(-1).source = 'foreign'; }, 'REFERENCE', /direct earlier/);
  for (const id of ['olderTool', 'newerTool']) refused(doc => { doc.features.find(feature => feature.id === id).height = 5; }, 'CAPABILITY', /fill feature pattern source/);
  refused(doc => { Object.assign(doc.features.find(feature => feature.id === 'olderSketch'), { profile: 'circle', center: [10, 9], radius: 1, sideTags: { outer: ['a'] } }); }, 'CAPABILITY');
  refused(doc => { doc.features.splice(4, 0, { id: 'movedTool', kind: 'translate', target: 'olderTool', offset: [0, 0, 0] }); doc.features.find(feature => feature.id === 'first').tool = 'movedTool'; }, 'CAPABILITY');
  refused(doc => { doc.parameters.pitchX = 1; Object.assign(doc.features.at(-1), { count2: 1, region: mask(10.5, 11.5, 10) }); }, 'GEOMETRY', /disjoint/);
  refused(doc => { doc.parameters.pitchX = -8; doc.features.at(-1).region = mask(1, 3); }, 'GEOMETRY', /strictly inside/);
  refused(doc => { doc.parameters.pitchX = 4 + 5e-7; Object.assign(doc.features.at(-1), { count2: 1, region: mask(13, 15) }); }, 'GEOMETRY', /disjoint/);
  refused(doc => { doc.features.at(-1).region = { points: [[0, 0], [1, 0], [0, 1]], holes: [] }; }, 'INPUT');
  refused(doc => { doc.features.at(-1).region = null; doc.features.at(-1).count = 65; }, 'INPUT', /count/);
  assert.deepEqual(verify(initial).brep, verify(loadCadPart(saved)).brep);
});
