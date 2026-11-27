import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, outputOf, reevaluate, saveCadPart, loadCadPart, brepMassProperties, faceGeometry, checkBrep,
  splitTopologyEvolutionOf, resolveSplitTopologySource } from '../dist/index.js';

function document(options = {}) {
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { Cut: 9 }, features: [
    { id: 'sketch', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [24, 16] },
    { id: 'stock', kind: 'extrude', sketch: 'sketch', height: 10 },
    { id: 'split', kind: 'split', target: 'stock', axis: 'x', at: { parameter: 'Cut' }, ...options },
  ] };
}
const close = (actual, expected, label, tolerance = 1e-9) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} vs ${expected}`);
const sourceOf = (receipt, kind, name) => { const source = receipt.sources.find(entity => entity.kind === kind && entity.name === name); assert.ok(source, name); return source; };

test('ordinary native axis Split exposes actual face/edge evolution without changing geometry or the document', () => {
  const doc = document(), snapshot = evaluateCadPart(doc), saved = saveCadPart(snapshot), before = JSON.stringify(snapshot);
  const receipt = splitTopologyEvolutionOf(snapshot, 'split');
  assert.equal(JSON.stringify(snapshot), before); assert.equal(saveCadPart(snapshot), saved); assert.deepEqual(snapshot.document, doc);
  assert.deepEqual([receipt.schema, receipt.version, receipt.featureId, receipt.parent.outputId, receipt.plane, receipt.persistentNamingCertified],
    ['barocss-split-topology-evolution', 0, 'split', 'stock', { axis: 'x', at: 9 }, false]);
  const original = evaluateCadPart({ ...doc, features: doc.features.slice(0, 2) }).outputs[0].brep;
  assert.equal(receipt.parent.bodyId, original.bodies[0].id);
  assert.deepEqual(receipt.sources.filter(entity => entity.kind === 'face').map(entity => entity.id), original.faces.map(face => face.id));
  assert.deepEqual(receipt.sources.filter(entity => entity.kind === 'edge').map(entity => entity.id), original.edges.map(edge => edge.id));
  for (const [index, side] of receipt.sides.entries()) {
    const output = outputOf(snapshot, `split/${index}`), brep = output.brep, report = checkBrep(brep, { strict: true });
    assert.equal(side.side, index === 0 ? 'negative' : 'positive');
    assert.deepEqual(side.output, { outputId: output.id, bodyId: brep.bodies[0].id });
    assert.equal(report.valid, true, JSON.stringify(report.issues));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    const mass = brepMassProperties(brep, 1);
    close(mass.volume, index === 0 ? 1440 : 2400, 'independent Split volume', 1e-7);
    const center = [index === 0 ? 4.5 : 16.5, 8, 5];
    mass.centroid.forEach((value, axis) => close(value, center[axis], 'independent centroid'));
    const xs = index === 0 ? [0, 9] : [9, 24];
    for (const x of xs) for (const y of [0, 16]) for (const z of [0, 10])
      assert.equal(brep.vertices.filter(vertex => vertex.point.every((value, axis) => value === [x, y, z][axis])).length, 1);
    assert.equal(side.mappings.length, 18);
    assert.deepEqual(['retained', 'modified', 'deleted'].map(relation => side.mappings.filter(row => row.relation === relation).length), [5, 8, 5]);
    assert.deepEqual(['face', 'edge'].map(kind => side.generated.filter(entity => entity.kind === kind).length), [1, 4]);
    const allImages = [...side.mappings.flatMap(row => row.images), ...side.generated];
    assert.equal(new Set(allImages.map(image => `${image.kind}:${image.id}`)).size, 18);
    for (const image of allImages) {
      assert.equal(image.side, side.side); assert.equal(image.outputId, output.id); assert.equal(image.bodyId, brep.bodies[0].id);
      const native = (image.kind === 'face' ? brep.faces : brep.edges).filter(entity => entity.id === image.id);
      assert.equal(native.length, 1); assert.equal(image.name, native[0].name);
    }
    const cap = side.generated.find(entity => entity.kind === 'face'), nativeCap = brep.faces.find(face => face.id === cap.id), geometry = faceGeometry(nativeCap);
    assert.equal(geometry.kind, 'plane'); geometry.n.forEach((value, axis) => close(value, axis === 0 ? index === 0 ? 1 : -1 : 0, 'independent cap normal')); assert.equal(geometry.o[0], 9);
    for (const image of side.generated.filter(entity => entity.kind === 'edge')) {
      const edge = brep.edges.find(edge => edge.id === image.id);
      assert.ok(edge.curve.controlPoints.every(point => point[0] === 9));
      const incident = brep.coedges.filter(use => use.edge === edge.id).map(use => brep.loops.find(loop => loop.id === use.loop).face);
      assert.equal(incident.length, 2); assert.ok(incident.includes(cap.id));
    }
  }
});

test('face and edge resolution never chooses between two images, a deleted side or an unknown source', () => {
  const snapshot = evaluateCadPart(document()), receipt = splitTopologyEvolutionOf(snapshot, 'split');
  const top = sourceOf(receipt, 'face', 'stock.top'), left = sourceOf(receipt, 'face', 'stock.side3');
  const edge = sourceOf(receipt, 'edge', 'stock.side0|stock.top');
  for (const source of [top, edge]) {
    const all = resolveSplitTopologySource(receipt, source);
    assert.equal(all.status, 'ambiguous'); assert.equal(all.images.length, 2);
    assert.deepEqual(all.images.map(image => image.side), ['negative', 'positive']);
    for (const side of ['negative', 'positive']) {
      const resolved = resolveSplitTopologySource(receipt, source, side);
      assert.equal(resolved.status, 'unique'); assert.equal(resolved.image.side, side);
    }
  }
  assert.equal(resolveSplitTopologySource(receipt, left).status, 'unique');
  assert.deepEqual(resolveSplitTopologySource(receipt, left, 'positive'), { status: 'deleted' });
  assert.equal(resolveSplitTopologySource(receipt, left, 'negative').status, 'unique');
  assert.deepEqual(resolveSplitTopologySource(receipt, { kind: 'face', id: 'missing' }), { status: 'unmatched' });
  const retainedEdge = receipt.sides[0].mappings.find(row => row.source.kind === 'edge' && row.relation === 'retained').source;
  assert.deepEqual(resolveSplitTopologySource(receipt, retainedEdge, 'positive'), { status: 'deleted' });
  assert.deepEqual(resolveSplitTopologySource(receipt, { kind: 'edge', id: receipt.sides[0].generated.find(row => row.kind === 'edge').id }), { status: 'unmatched' });
});

test('both other coordinate axes and shifted original stock retain the same bounded mapping contract', () => {
  for (const [axis, at] of [['x', 3], ['y', 2], ['z', 7]]) {
    const doc = document({ axis, at });
    doc.features[0] = { ...doc.features[0], min: [-6, -4], max: [18, 12] }; doc.features[1].from = 3;
    const snapshot = evaluateCadPart(doc), receipt = splitTopologyEvolutionOf(snapshot, 'split');
    assert.deepEqual(receipt.plane, { axis, at });
    for (const side of receipt.sides) {
      assert.equal(side.mappings.filter(row => row.source.kind === 'face' && row.relation === 'modified').length, 4);
      assert.equal(side.mappings.filter(row => row.source.kind === 'edge' && row.relation === 'modified').length, 4);
      assert.equal(side.generated.length, 5);
    }
  }
});

test('Save and fresh Open reproduce the receipt, and parameter changes and downstream consumers use actual prefixes', () => {
  const snapshot = evaluateCadPart(document()), receipt = splitTopologyEvolutionOf(snapshot, 'split'), text = saveCadPart(snapshot);
  assert.ok(!text.includes('topology-evolution'));
  const opened = loadCadPart(text), reopenedReceipt = splitTopologyEvolutionOf(opened, 'split');
  assert.deepEqual(reopenedReceipt, receipt);
  assert.equal(resolveSplitTopologySource(reopenedReceipt, sourceOf(reopenedReceipt, 'face', 'stock.top')).status, 'ambiguous');
  const changed = reevaluate(snapshot, { parameters: { Cut: 12 } }), next = splitTopologyEvolutionOf(changed, 'split');
  assert.equal(next.plane.at, 12); assert.equal(receipt.plane.at, 9);
  for (const output of changed.outputs) close(brepMassProperties(output.brep, 1).volume, 1920, 'edited equal half', 1e-7);
  const downstreamDoc = document(); downstreamDoc.features.push({ id: 'moved', kind: 'translate', target: 'split/0', offset: [100, 0, 0] });
  const downstream = evaluateCadPart(downstreamDoc);
  assert.ok(!downstream.outputs.some(output => output.id === 'split/0'));
  assert.deepEqual(splitTopologyEvolutionOf(downstream, 'split'), receipt);
});

test('unsupported current Split inputs remain usable but have no bounded evolution receipt', () => {
  const reject = doc => {
    const snapshot = evaluateCadPart(doc), before = JSON.stringify(snapshot);
    assert.throws(() => splitTopologyEvolutionOf(snapshot, 'split'), error => error.code === 'CAPABILITY');
    assert.equal(JSON.stringify(snapshot), before);
  };
  reject(document({ normal: [1, 1, 0], at: 20 }));
  reject(document({ normal: [1, 0, 0], at: 9 }));
  const circle = document({ at: 1 }); circle.features[0] = { id: 'sketch', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 12 }; reject(circle);
  const drafted = document(); drafted.features[1].draft = 5; reject(drafted);
  const polygon = document(); polygon.features[0] = { id: 'sketch', kind: 'sketch', profile: 'polygon', points: [[0, 0], [24, 0], [24, 16], [0, 16]] }; reject(polygon);
  const moved = document(); moved.features.splice(2, 0, { id: 'moved', kind: 'translate', target: 'stock', offset: [1, 0, 0] }); moved.features.at(-1).target = 'moved'; reject(moved);
  const snapshot = evaluateCadPart(document());
  for (const feature of ['missing', 'stock']) assert.throws(() => splitTopologyEvolutionOf(snapshot, feature), error => error.code === 'REFERENCE');
});

test('actual native name and topology mismatch cannot be projected as valid source lineage', () => {
  const snapshot = evaluateCadPart(document()), native = snapshot.outputs[0].brep.faces[0], name = native.name;
  try {
    native.name = 'another-face';
    assert.throws(() => splitTopologyEvolutionOf(snapshot, 'split'), error => error.code === 'GEOMETRY');
  } finally { native.name = name; }
  const vertex = snapshot.outputs[0].brep.vertices[0], old = vertex.point[0];
  try {
    vertex.point[0] += 0.25;
    assert.throws(() => splitTopologyEvolutionOf(snapshot, 'split'), error => error.code === 'CAPABILITY');
  } finally { vertex.point[0] = old; }
  assert.equal(splitTopologyEvolutionOf(snapshot, 'split').sources.length, 18);
});

test('copied snapshots and synthetic or altered evolution claims are refused', () => {
  const snapshot = evaluateCadPart(document()), receipt = splitTopologyEvolutionOf(snapshot, 'split');
  assert.ok(Object.isFrozen(receipt) && Object.isFrozen(receipt.sides) && Object.isFrozen(receipt.sources[0]));
  assert.throws(() => splitTopologyEvolutionOf(structuredClone(snapshot), 'split'), error => error.code === 'INPUT');
  assert.throws(() => { receipt.sides[0].mappings[0].relation = 'deleted'; }, TypeError);
  const claimed = structuredClone(receipt); claimed.sides[0].mappings[0].relation = 'deleted';
  assert.throws(() => resolveSplitTopologySource(claimed, receipt.sources[0]), error => error.code === 'INPUT');
  assert.throws(() => resolveSplitTopologySource(receipt, { kind: 'vertex', id: 'missing' }), error => error.code === 'INPUT');
  assert.throws(() => resolveSplitTopologySource(receipt, receipt.sources[0], 'nearest'), error => error.code === 'INPUT');
});
