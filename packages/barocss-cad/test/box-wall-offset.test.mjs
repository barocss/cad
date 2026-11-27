import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, checkBrep, faceGeometry, brepMassProperties } from '../dist/index.js';
import { boxWallOffsetFrame, offsetBoxWallIfAdmitted, boxCapOffsetFrame, offsetBoxCapIfAdmitted } from '../dist/features/drafted-cap-offset.js';

const roles = [['box.side0', 1, 0], ['box.side1', 0, 1], ['box.side2', 1, 1], ['box.side3', 0, 0]];
const document = (face = 'box.side0', distance = 2, shifted = false) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'profile', kind: 'sketch', profile: 'rectangle', min: shifted ? [-7, 11] : [0, 0], max: shifted ? [33, 41] : [40, 30] },
    { id: 'box', kind: 'extrude', sketch: 'profile', height: 20, from: shifted ? -5 : 0 },
    { id: 'offset', kind: 'offset-face', target: 'box', face, distance },
  ],
});
const close = (a, b, label, epsilon = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= epsilon, `${label}: ${a} vs ${b}`);
const owners = brep => ({ source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
  faces: brep.faces.map(({ surface, ...face }) => ({ ...face, surface: surface.id })),
  edges: brep.edges.map(({ curve, ...edge }) => ({ ...edge, curve: curve.id })),
  coedges: brep.coedges.map(({ pcurve, ...use }) => ({ ...use, pcurve: pcurve?.id })),
  vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex) });

function prove(face, axis, end, distance, shifted = false) {
  const input = document(face, distance, shifted), beforeDoc = structuredClone(input), prefix = evaluateCadPart({ ...input, features: input.features.slice(0, 2) });
  const original = prefix.outputs[0].brep, before = structuredClone(original), snapshot = reevaluate(prefix, { document: input }), output = snapshot.outputs[0], brep = output.brep;
  const bounds = shifted ? [[-7, 33], [11, 41], [-5, 15]] : [[0, 40], [0, 30], [0, 20]], sign = end === 0 ? -1 : 1;
  const current = bounds.map(pair => [...pair]); current[axis][end] += sign * distance;
  const volume = current.reduce((v, [low, high]) => v * (high - low), 1), center = current.map(([low, high]) => (low + high) / 2);
  assert.equal(input.features.length, 3); assert.deepEqual(snapshot.outputs.map(o => [o.id, o.feature]), [['offset', 'offset']]);
  const report = checkBrep(brep, { strict: true, pcurveSamples: 7 }); assert.ok(report.valid, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0); assert.equal(brep.coedges.filter(use => use.pcurve).length, 24);
  assert.deepEqual(owners(brep), owners(original));
  assert.equal(brep.vertices.filter((v, i) => v === original.vertices[i]).length, 4);
  assert.equal(brep.edges.filter((e, i) => e === original.edges[i]).length, 4);
  const selected = original.faces.find(f => f.name === face), fixed = original.faces.find(f => { const g = faceGeometry(f); return g.n[axis] === -sign; });
  assert.deepEqual(brep.faces.find(f => f.id === fixed.id), fixed);
  for (const loopId of fixed.loops) for (const useId of original.loops.find(loop => loop.id === loopId).coedges)
    assert.equal(brep.coedges.find(use => use.id === useId), original.coedges.find(use => use.id === useId));
  const pointById = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  for (const edge of brep.edges) assert.deepEqual(edge.curve.controlPoints, edge.vertices.map(id => pointById.get(id)));
  for (const vertex of original.vertices) {
    const expected = [...vertex.point]; if (expected[axis] === bounds[axis][end]) expected[axis] = current[axis][end];
    assert.deepEqual(brep.vertices.find(v => v.id === vertex.id).point, expected);
  }
  for (const originalFace of original.faces) {
    const g = faceGeometry(originalFace), actual = brep.faces.find(f => f.id === originalFace.id), support = faceGeometry(actual);
    assert.equal(support.kind, 'plane'); assert.deepEqual(support.n, g.n);
    for (const point of actual.surface.controlPoints.flat()) close(point.reduce((s, x, k) => s + (x - g.o[k]) * g.n[k], 0), originalFace === selected ? distance : 0, 'exact fixed/offset support');
  }
  const frame = boxWallOffsetFrame(original, face), anchor = bounds.map(([a, b]) => (a + b) / 2), normal = [0, 0, 0];
  anchor[axis] = bounds[axis][end]; normal[axis] = sign; assert.deepEqual(frame.anchor, anchor);
  frame.normal.forEach((value, k) => close(value, normal[k], 'exact outward frame normal', 0));
  assert.equal(boxCapOffsetFrame(original, face), undefined); assert.equal(offsetBoxCapIfAdmitted(original, face, distance), undefined);
  assert.deepEqual(offsetBoxWallIfAdmitted(original, face, distance), brep);
  const mass = brepMassProperties(brep, 1); close(mass.volume, volume, 'independent box volume', 1e-7); mass.centroid.forEach((v, k) => close(v, center[k], 'independent center'));
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep); assert.deepEqual(evaluateCadPart(input).outputs[0].brep, brep);
  assert.deepEqual(input, beforeDoc); assert.deepEqual(original, before);
  return snapshot;
}

test('four original rectangular walls have one native signed Offset with all original owners and complete trims', () => {
  for (const [face, axis, end] of roles) for (const distance of [2, -2]) {
    prove(face, axis, end, distance); prove(face, axis, end, distance, true);
  }
});

test('wall offset refuses the first collapse, crossing, range, nonfinite and nonmoving distance', () => {
  for (const [face, axis, end] of roles) {
    const width = axis === 0 ? 40 : 30, accepted = prove(face, axis, end, 2), saved = saveCadPart(accepted);
    prove(face, axis, end, -width + 0.001);
    for (const distance of [-width, -width - 1, -width + 5e-8])
      assert.throws(() => reevaluate(accepted, { document: document(face, distance) }), error => error.code === 'GEOMETRY' && /opposite wall/.test(error.message));
    assert.equal(saveCadPart(accepted), saved);
    const original = evaluateCadPart({ ...document(), features: document().features.slice(0, 2) }).outputs[0].brep;
    for (const value of [0, NaN, Infinity, 10001]) assert.throws(() => offsetBoxWallIfAdmitted(original, face, value), error => error.code === 'INPUT');
    if (end === 1) assert.throws(() => offsetBoxWallIfAdmitted(original, face, 10000), error => error.code === 'GEOMETRY' && /modeling range/.test(error.message));
    else {
      const negative = document(); negative.features[0].min = [-10, -10]; negative.features[0].max = [30, 20];
      const source = evaluateCadPart({ ...negative, features: negative.features.slice(0, 2) }).outputs[0].brep;
      assert.throws(() => offsetBoxWallIfAdmitted(source, face, 10000), error => error.code === 'GEOMETRY' && /modeling range/.test(error.message));
    }
  }
  const shifted = document('box.side0', 2, true), original = evaluateCadPart({ ...shifted, features: shifted.features.slice(0, 2) }).outputs[0].brep;
  assert.throws(() => offsetBoxWallIfAdmitted(original, 'box.side0', Number.EPSILON), /too small/);
});

test('native wall admission refuses missing pcurves, wrong ownership, ambiguous names and inexact supports', () => {
  const d = document(), original = evaluateCadPart({ ...d, features: d.features.slice(0, 2) }).outputs[0].brep;
  assert.equal(boxWallOffsetFrame(original, 'box.top'), undefined); assert.equal(offsetBoxWallIfAdmitted(original, 'missing', 2), undefined);
  const missing = structuredClone(original); missing.coedges[0].pcurve = null;
  const owner = structuredClone(original); owner.bodies[0].shells = ['foreign-shell'];
  const duplicate = structuredClone(original); duplicate.faces[0].name = duplicate.faces[1].name;
  const inexact = structuredClone(original); inexact.faces.find(f => f.name === 'box.side0').surface.controlPoints[0][0][1] += 5e-15;
  for (const input of [missing, owner, duplicate, inexact]) {
    const before = structuredClone(input); assert.equal(boxWallOffsetFrame(input, 'box.side0'), undefined);
    assert.equal(offsetBoxWallIfAdmitted(input, 'box.side0', 2), undefined); assert.deepEqual(input, before);
  }
});

test('the native API restricts this wall route to the original rectangular Extrude, including cache edits', () => {
  const input = document(); input.parameters.Width = 40; input.features[0].max = [{ parameter: 'Width' }, 30];
  const snapshot = evaluateCadPart(input), changed = reevaluate(snapshot, { parameters: { Width: 50 } });
  close(brepMassProperties(changed.outputs[0].brep, 1).volume, 50 * 32 * 20, 'cache-edited source width', 1e-7);
  assert.deepEqual(changed.outputs[0].brep, evaluateCadPart({ ...input, parameters: { Width: 50 } }).outputs[0].brep);
  const polygon = document(); polygon.features[0] = { id: 'profile', kind: 'sketch', profile: 'polygon', points: [[0, 0], [40, 0], [40, 30], [0, 30]] };
  assert.throws(() => evaluateCadPart(polygon));
  for (const change of [
    { id: 'change', kind: 'translate', target: 'box', offset: [5, 0, 0] },
    { id: 'change', kind: 'rotate', target: 'box', axis: 'z', angle: 90 },
    { id: 'change', kind: 'offset-face', target: 'box', face: 'box.top', distance: 2 },
    { id: 'change', kind: 'offset-face', target: 'box', face: 'box.side0', distance: 2 },
  ]) {
    const d = document(); d.features.splice(2, 0, change); d.features.at(-1).target = 'change';
    assert.doesNotThrow(() => evaluateCadPart({ ...d, features: d.features.slice(0, -1) }));
    assert.throws(() => evaluateCadPart(d), error => ['GEOMETRY', 'CAPABILITY'].includes(error.code));
  }
  const d = document(); d.features.splice(2, 0,
    { id: 'outside', kind: 'sketch', profile: 'rectangle', min: [50, 0], max: [52, 2] },
    { id: 'tool', kind: 'extrude', sketch: 'outside', height: 20 }, { id: 'cut', kind: 'difference', target: 'box', tool: 'tool' });
  d.features.at(-1).target = 'cut'; assert.doesNotThrow(() => evaluateCadPart({ ...d, features: d.features.slice(0, -1) }));
  assert.throws(() => evaluateCadPart(d), error => ['GEOMETRY', 'CAPABILITY'].includes(error.code));
});

test('legacy cap native bytes, cap refusal strings and tilted Replace remain unchanged', () => {
  // Native JSON captured before adding the wall route. These are old cap/Replace outputs, not the new producer's oracle.
  const hashes = ['c83c4bded2898d2ad2790a74fa23ffd0acaa2d9e43b79341b0a868790793300b', '7dad1e4f5c4b448e564f0fc43b6f75843a98d1ccaa0b28da4d3befa12faa1f4d',
    '472a77b1dbba4eb18020a01f736103b72f088b3bb5c4fd2a75126274470b055b', '4586fcd89022b9b92db04d96d4869729084f66edf80287be4ec64fd54621dc68'];
  let k = 0;
  for (const face of ['box.top', 'box.bottom']) for (const distance of [2, -2])
    assert.equal(createHash('sha256').update(JSON.stringify(evaluateCadPart(document(face, distance)).outputs[0].brep)).digest('hex'), hashes[k++]);
  const d = document(); d.features[2] = { id: 'replace', kind: 'replace-face', target: 'box', face: 'box.side1', plane: { origin: [37, 60, 0], normal: [2, 0, -1] } };
  assert.equal(createHash('sha256').update(JSON.stringify(evaluateCadPart(d).outputs[0].brep)).digest('hex'), '3aafcef78607168ae49b82758facc7c9b701d657a0f59a8c506bd18aeca23519');
  const original = evaluateCadPart({ ...d, features: d.features.slice(0, 2) }).outputs[0].brep;
  assert.throws(() => offsetBoxCapIfAdmitted(original, 'box.top', -20), error => error.message === 'B-rep: box cap offset: the offset would reach or cross the opposite cap');
  assert.throws(() => offsetBoxCapIfAdmitted(original, 'box.top', 0), error => error.message === 'B-rep: box cap offset: distance must be nonzero and within the modeling range');
});

test('a standard downstream coordinate Split consumes the native front Offset and persists both exact children', () => {
  const input = document(); input.features.push({ id: 'split', kind: 'split', target: 'offset', axis: 'x', at: 9 });
  const snapshot = evaluateCadPart(input); assert.equal(snapshot.outputs.length, 2);
  for (const [i, output] of snapshot.outputs.entries()) {
    assert.equal(checkBrep(output.brep, { strict: true, pcurveSamples: 7 }).valid, true);
    const mass = brepMassProperties(output.brep, 1);
    close(mass.volume, (i === 0 ? 9 : 31) * 32 * 20, 'independent downstream cuboid volume', 1e-7);
    mass.centroid.forEach((v, k) => close(v, [i === 0 ? 4.5 : 24.5, 14, 10][k], 'downstream center'));
  }
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs.map(o => o.brep), snapshot.outputs.map(o => o.brep));
});
