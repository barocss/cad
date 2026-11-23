import test from 'node:test';
import assert from 'node:assert/strict';
import { part, BarocssError } from '../dist/api/index.js';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, massPropertiesOf, brepMassProperties, checkBrep, faceGeometry, CadPartError } from '../dist/index.js';

const near = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-7, `${actual} vs ${expected}`);
const document = () => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {
  olderLeft: 8, olderRight: 12, olderBottom: 8, olderTop: 10, newerRight: 14, pitch: 16,
}, features: [
  { id: 'stockSketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [60, 40] },
  { id: 'stock', kind: 'extrude', sketch: 'stockSketch', height: 10 },
  { id: 'olderSketch', kind: 'sketch', profile: 'rectangle', min: [{ parameter: 'olderLeft' }, { parameter: 'olderBottom' }],
    max: [{ parameter: 'olderRight' }, { parameter: 'olderTop' }], sideTags: { outer: ['a', 'b', 'c', 'd'] } },
  { id: 'olderTool', kind: 'extrude', sketch: 'olderSketch', height: 10 },
  { id: 'first', kind: 'difference', target: 'stock', tool: 'olderTool' },
  { id: 'newerSketch', kind: 'sketch', profile: 'rectangle', min: [8, 26], max: [{ parameter: 'newerRight' }, 28], sideTags: { outer: ['p', 'q', 'r', 's'] } },
  { id: 'newerTool', kind: 'extrude', sketch: 'newerSketch', height: 10 },
  { id: 'second', kind: 'difference', target: 'first', tool: 'newerTool' },
  { id: 'repeat', kind: 'linear-feature-pattern', target: 'second', source: 'first', axis: 'x', spacing: { parameter: 'pitch' }, count: 2 },
] });

function loopBounds(brep, loop) {
  const points = loop.coedges.flatMap(id => {
    const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge);
    return edge.curve.controlPoints;
  });
  return [Math.min(...points.map(p => p[0])), Math.min(...points.map(p => p[1])),
    Math.max(...points.map(p => p[0])), Math.max(...points.map(p => p[1]))];
}
const newerWalls = brep => brep.faces.filter(face => face.name?.startsWith('newerTool.side')).map(face => ({ name: face.name, geometry: faceGeometry(face) })).sort((a, b) => a.name.localeCompare(b.name));

function verify(snapshot, { axis = 'x', count = 2, pitch = 16, olderLeft = 8, olderRight = 12, olderBottom = 8, olderTop = 10, newerRight = 14 } = {}) {
  assert.equal(snapshot.outputs.length, 1);
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n')); assert.equal(output.id, 'repeat'); assert.equal(output.bodyCount, 1);
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1); assert.equal(report.topology[0].genus, count + 1);
  const cavities = [[8, 26, newerRight, 28]], removed = [{ volume: (newerRight - 8) * 2 * 10, center: [(8 + newerRight) / 2, 27, 5] }];
  const names = brep.faces.map(face => face.name);
  for (let k = 0; k < count; k++) {
    const x = olderLeft + (axis === 'x' ? k * pitch : 0), y = olderBottom + (axis === 'y' ? k * pitch : 0);
    const width = olderRight - olderLeft, depth = olderTop - olderBottom;
    cavities.push([x, y, x + width, y + depth]);
    removed.push({ volume: width * depth * 10, center: [x + width / 2, y + depth / 2, 5] });
    for (const tag of ['a', 'b', 'c', 'd']) assert.ok(names.includes(`olderTool.side[${tag}]${k ? `@${k}` : ''}`));
  }
  for (const tag of ['p', 'q', 'r', 's']) {
    assert.ok(names.includes(`newerTool.side[${tag}]`));
    assert.ok(!names.some(name => name?.startsWith(`newerTool.side[${tag}]@`)));
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

test('the earlier linear cut keeps the current two-cut stock with 23720 volume and three exact native through openings', () => {
  const input = document(), before = structuredClone(input), initial = evaluateCadPart(input), output = verify(initial);
  assert.deepEqual(checkBrep(output.brep, { strict: true }).counts,
    { bodies: 1, shells: 1, faces: 18, loops: 24, coedges: 96, edges: 48, vertices: 32 });
  const mass = brepMassProperties(output.brep, 1); near(mass.volume, 23720);
  near(mass.centroid[0], 715800 / 23720); near(mass.centroid[1], 475320 / 23720); near(mass.centroid[2], 5);
  assert.deepEqual(input, before); assert.deepEqual(initial.document.features, before.features);
  const current = document(); current.features.pop();
  assert.deepEqual(newerWalls(output.brep), newerWalls(evaluateCadPart(current).outputs[0].brep));
  const reopened = loadCadPart(saveCadPart(initial));
  assert.deepEqual(reopened.document, initial.document); assert.deepEqual(verify(reopened).brep, output.brep);
});

test('both XY directions and either finite spacing sign use original seed positions with stable linear cell ownership', () => {
  for (const [axis, pitch, parameters] of [['x', 16, {}], ['x', -16, { olderLeft: 40, olderRight: 44 }],
    ['y', 6, {}], ['y', -6, { olderBottom: 20, olderTop: 22 }]]) {
    const doc = document(); Object.assign(doc.features.at(-1), { axis, count: 3 }); Object.assign(doc.parameters, { pitch, ...parameters });
    const initial = evaluateCadPart(doc), output = verify(initial, { axis, count: 3, pitch, ...parameters });
    near(brepMassProperties(output.brep, 1).volume, 23640);
    assert.deepEqual(verify(loadCadPart(saveCadPart(initial)), { axis, count: 3, pitch, ...parameters }).brep, output.brep);
  }
});

test('earlier size, later size, pitch and count remain independent dependencies across edit, refusal, restore and reopen', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial), names = initial.outputs[0].brep.faces.map(face => face.name).sort();
  for (const parameters of [{ olderRight: 14 }, { newerRight: 16 }, { pitch: 20 }]) {
    const edited = reevaluate(initial, { parameters }), output = verify(edited, parameters);
    assert.deepEqual(output.brep.faces.map(face => face.name).sort(), names);
    assert.deepEqual(verify(loadCadPart(saveCadPart(edited)), parameters).brep, output.brep);
  }
  const more = document(); more.features.at(-1).count = 3;
  const edited = reevaluate(initial, { document: more }); verify(edited, { count: 3 });
  assert.deepEqual(verify(reevaluate(edited, { document: document() })).brep, initial.outputs[0].brep);
  assert.equal(saveCadPart(initial), saved); verify(reevaluate(initial, { parameters: {} }));
});

test('count one and omitted source preserve the old Kernel contract without extending the fluent API', () => {
  for (const source of [true, false]) {
    const doc = document(); doc.features.at(-1).count = 1; if (!source) delete doc.features.at(-1).source;
    const output = evaluateCadPart(doc).outputs[0];
    near(brepMassProperties(output.brep, 1).volume, 23800); assert.equal(checkBrep(output.brep, { strict: true }).topology[0].genus, 2);
    assert.ok(!output.brep.faces.some(face => face.name?.includes('@')));
    if (source) verify(evaluateCadPart(doc), { count: 1 });
    else {
      doc.features.at(-1).axis = 'z'; near(brepMassProperties(evaluateCadPart(doc).outputs[0].brep, 1).volume, 23800);
    }
  }
  const current = document(); current.features.pop(); const facade = part('ordinary current cut', current), before = facade.doc;
  for (const options of [{ axis: 'x', spacing: 16, count: 1 }, { axis: 'x', spacing: -16, count: 2 }])
    assert.throws(() => facade.linearFeaturePattern(options), error => error instanceof BarocssError && error.code === 'VALUE');
  const accepted = facade.linearFeaturePattern({ axis: 'x', spacing: 16, count: 2 });
  assert.equal(accepted.doc.features.at(-1).source, undefined); assert.deepEqual(facade.doc, before);
  const brep = evaluateCadPart(accepted.doc).outputs[0].brep;
  near(brepMassProperties(brep, 1).volume, 23680);
  assert.ok(brep.faces.some(face => face.name === 'newerTool.side[p]@1'));
  assert.ok(!brep.faces.some(face => face.name?.startsWith('olderTool.side[a]@')));
});

test('bad chain, unsupported source geometry, invalid values and unsafe cells refuse without changing accepted native history', () => {
  const initial = evaluateCadPart(document()), saved = saveCadPart(initial);
  const refused = (change, code, message) => {
    const doc = document(); change(doc); const before = structuredClone(doc);
    assert.throws(() => reevaluate(initial, { document: doc }), error => error instanceof CadPartError && error.feature === 'repeat'
      && error.code === code && (!message || message.test(error.message)));
    assert.deepEqual(doc, before); assert.equal(saveCadPart(initial), saved);
  };
  for (const source of ['missing', 'second', 'stock', 'olderTool', 'first/0', null, 4])
    refused(doc => { doc.features.at(-1).source = source; }, 'REFERENCE');
  refused(doc => { doc.features.find(feature => feature.id === 'first').suppressed = true; }, 'REFERENCE', /linear feature pattern source/);
  refused(doc => { doc.features.splice(-1, 0, { id: 'moved', kind: 'translate', target: 'second', offset: [0, 0, 1] }); }, 'REFERENCE', /must still be active/);
  refused(doc => { doc.features.splice(-1, 0, { id: 'foreign', kind: 'difference', target: 'stock', tool: 'olderTool' }); doc.features.at(-1).source = 'foreign'; }, 'REFERENCE', /direct earlier unsuppressed difference/);
  for (const id of ['olderTool', 'newerTool']) refused(doc => { doc.features.find(feature => feature.id === id).height = 5; }, 'CAPABILITY', /linear feature pattern source/);
  refused(doc => {
    Object.assign(doc.features.find(feature => feature.id === 'olderSketch'), { profile: 'circle', center: [10, 9], radius: 1, sideTags: { outer: ['a'] } });
  }, 'CAPABILITY', /linear feature pattern source/);
  refused(doc => { doc.features.splice(4, 0, { id: 'movedTool', kind: 'translate', target: 'olderTool', offset: [0, 0, 0] }); doc.features.find(feature => feature.id === 'first').tool = 'movedTool'; }, 'CAPABILITY', /linear feature pattern source/);
  for (const count of [0, 65, 2.5, NaN, Infinity]) refused(doc => { doc.features.at(-1).count = count; }, 'INPUT');
  for (const spacing of [0, NaN, Infinity, -Infinity, 10001, -10001]) refused(doc => { doc.features.at(-1).spacing = spacing; }, 'PARAMETER');
  refused(doc => { doc.features.at(-1).axis = 'q'; }, 'INPUT');
  for (const count of [1, 2]) refused(doc => { Object.assign(doc.features.at(-1), { axis: 'z', count }); }, 'CAPABILITY', /linear feature pattern source.*one XY line/);
  for (const pitch of [2, 4, 50, -8]) refused(doc => { doc.parameters.pitch = pitch; }, 'GEOMETRY', /linear feature pattern source/);
  refused(doc => { Object.assign(doc.features.at(-1), { axis: 'y' }); doc.parameters.pitch = 18; }, 'GEOMETRY', /disjoint from the newer cut/);
  assert.deepEqual(verify(initial).brep, verify(loadCadPart(saved)).brep);
});
