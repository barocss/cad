import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { patchValues, shownFields, type Ctx } from '../src/app/commands';
import { editSavedExtrudeEndFaceCommand, canEditSavedExtrudeEndFace } from '../src/app/extrudeEndFaceEdit';
import { extrudeCommand } from '../src/app/profileCommands';
import { evaluateDoc } from '../src/engine/evaluate';
import { bodyNodes, deleteFeature, deleteFeatures, duplicateBody, featureDependents, moveFeature, renumber } from '../src/chat/features';
import { dispatchTool } from '../src/chat/tools';
import { parentsOf, prefixDoc, usesOf, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { readStudioDoc } from '../src/engine/migrate';
import { currentFaceEndDistance, toPartDocument } from '../src/engine/part';
import { detachFaceEndExtrude, isFaceEndExtrudeSketch } from '../src/engine/faceEndExtrude';
import { revisionOf } from '../src/util/revision';

const recipe = {
  id: 'n3', kind: 'face-end-extrude', sketch: 2,
  target: { body: { node: 1, side: 'solid' }, feature: 'n1', face: 'n1.bottom' },
} as const;
const documentAt = (from: number): StudioDoc => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-5, -5], max: [15, 15] },
    { id: 'n1', kind: 'extrude', sketch: 0, from, height: 5 },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] },
    recipe,
  ],
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } }, nextId: 4,
});

const downwardDocument = (height = 5): StudioDoc => ({
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 4,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 20] },
    { id: 'n1', kind: 'extrude', sketch: 0, height },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [2, -6], max: [8, -2],
      plane: { origin: [0, 0, 20], normal: [0, 0, -1], xAxis: [1, 0, 0] } },
    { ...recipe, target: { ...recipe.target, face: 'n1.top' } },
  ],
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } },
});

test('an exact downward XY rectangle reaches the original upper rectangular cap with positive local height', () => {
  for (const height of [5, 8]) {
    const doc = downwardDocument(height), before = structuredClone(doc), travel = 20 - height;
    const opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened); assert.deepEqual(opened.doc, doc);
    const part = toPartDocument(doc);
    assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: travel });
    assert.equal(currentFaceEndDistance(doc, 3), travel);
    const outputs = evaluateCadPart(part).outputs;
    assert.deepEqual(outputs.map(output => output.id), ['n1', 'n3']);
    assert.ok(outputs.every(output => checkOutput(output).valid));
    const [target, source] = outputs;
    assert.equal(source.brep.faces.length, 6); assert.equal(source.brep.vertices.length, 8);
    for (const x of [2, 8]) for (const y of [2, 6]) for (const z of [height, 20]) {
      assert.ok(source.brep.vertices.some(vertex => vertex.point.every((value, axis) => value === [x, y, z][axis])));
    }
    const mass = massPropertiesOf(source);
    assert.ok(Math.abs(mass.volume - 24 * travel) < 1e-8);
    mass.centroid.forEach((value, axis) => assert.ok(Math.abs(value - [5, 4, (height + 20) / 2][axis]) < 1e-8));
    assert.ok(Math.abs(massPropertiesOf(target).volume - 400 * height) < 1e-8);
    for (const [body, name, level, direction] of [
      [target, 'n1.top', height, 1], [source, 'n3.bottom', 20, 1], [source, 'n3.top', height, -1],
    ] as const) {
      const face = faceGeometry(body.brep.faces.find(face => face.name === name)!);
      assert.ok(face.kind === 'plane');
      assert.equal(face.o[2], level);
      face.n.forEach((value, axis) => assert.ok(Math.abs(value - (axis === 2 ? direction : 0)) < 1e-8));
    }
    const node = doc.nodes[3]; assert.ok(node.kind === 'face-end-extrude');
    const detached = { ...doc, nodes: doc.nodes.map((current, index) => index === 3 ? detachFaceEndExtrude(node, travel) : current) };
    assert.deepEqual(evaluateCadPart(toPartDocument(detached)).outputs[1].brep, source.brep);
    assert.deepEqual(doc, before);
  }
  const doc = downwardDocument(), target = doc.nodes[1]; assert.ok(target.kind === 'extrude');
  const parameterized = { ...doc, parameters: { targetHeight: 8 },
    nodes: doc.nodes.map((node, index) => index === 1 ? { ...target, height: { parameter: 'targetHeight' } } : node) };
  assert.equal(currentFaceEndDistance(parameterized, 3), 12);
});

test('downward XY containment uses reflected world Y and preserves the target authored upper end', () => {
  const doc = downwardDocument(), targetSketch = doc.nodes[0], target = doc.nodes[1];
  assert.ok(targetSketch.kind === 'sketch' && targetSketch.profile === 'rectangle' && target.kind === 'extrude');
  // The unreflected local Y interval fits this target, but the actual world footprint does not.
  const outside = { ...doc, nodes: doc.nodes.map((node, index) => index === 0
    ? { ...targetSketch, min: [0, -8], max: [20, -1] } : node) } as StudioDoc;
  assert.throws(() => toPartDocument(outside), /entire projected profile/);
  for (const height of [-5, 0]) assert.throws(() => toPartDocument(downwardDocument(height)), /stay forward.*authored end cap/);
  const reversed = { ...doc, parameters: { targetHeight: -5 }, nodes: doc.nodes.map((node, index) => index === 1
    ? { ...target, height: { parameter: 'targetHeight' } } : node) };
  assert.throws(() => toPartDocument(reversed), /stay forward.*authored end cap/);
  for (const height of [20, 21]) assert.throws(() => toPartDocument(downwardDocument(height)), /positive extrusion direction/);
});

test('downward XY admission stays on the supported literal profiles and original upright upper caps', () => {
  const doc = downwardDocument(), sketch = doc.nodes[2], target = doc.nodes[1], end = doc.nodes[3];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'rectangle' && sketch.plane && target.kind === 'extrude' && end.kind === 'face-end-extrude');
  for (const plane of [
    { ...sketch.plane, normal: [0, 0, -2] }, { ...sketch.plane, normal: [0, 1e-13, -1] },
    { ...sketch.plane, xAxis: [2, 0, 0] }, { ...sketch.plane, xAxis: [-1, 0, 0] },
  ]) assert.equal(isFaceEndExtrudeSketch({ ...sketch, plane } as ModelNode), false);
  for (const profile of [
    { id: 'n2', kind: 'sketch', profile: 'circle', center: [5, -4], radius: { parameter: 'r' }, plane: sketch.plane },
    { id: 'n2', kind: 'sketch', profile: 'polygon', points: [[2, -6], [8, -6], [5, -2]], plane: sketch.plane },
  ] as const) assert.equal(isFaceEndExtrudeSketch(profile as unknown as ModelNode), false);
  for (const changed of [
    { ...target, draft: 1 }, { ...target, held: 'stale target' },
  ]) assert.throws(() => toPartDocument({ ...doc, nodes: doc.nodes.map((node, index) => index === 1 ? changed : node) }), /forward upright rectangular/);
  assert.throws(() => toPartDocument({ ...doc, nodes: doc.nodes.map((node, index) => index === 3
    ? { ...end, target: { ...end.target, face: 'n1.bottom' } } : node) }), /original upper cap/);
  assert.throws(() => toPartDocument({ ...doc, nodes: doc.nodes.map((node, index) => index === 0
    ? { id: 'n0', kind: 'sketch', profile: 'circle', center: [10, 10], radius: 10 } : node) }), /entire projected profile/);
});

function circularTarget(from = 20, radius = 12): StudioDoc {
  const doc = documentAt(from);
  return { ...doc, nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [5, 5], radius }, ...doc.nodes.slice(1)] };
}

function annularTarget(from = 20): StudioDoc {
  return {
    format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
    nodes: [
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 12 },
      { id: 'n1', kind: 'extrude', sketch: 0, from, height: 5 },
      { id: 'n2', kind: 'hole', parent: { node: 1, side: 'solid' }, center: [0, 0], radius: 3 },
      { id: 'n3', kind: 'sketch', profile: 'rectangle', min: [4, -2], max: [8, 2] },
      { id: 'n4', kind: 'face-end-extrude', sketch: 3,
        target: { body: { node: 2, side: 'solid' }, feature: 'n2', face: 'n1.bottom' } },
    ],
    outputs: { b2: { node: 2, side: 'solid' }, b4: { node: 4, side: 'solid' } }, nextId: 5,
  };
}

const replaceNode = (doc: StudioDoc, index: number, next: ModelNode): StudioDoc => ({
  ...doc, nodes: doc.nodes.map((node, i) => i === index ? next : node),
});

function downwardCircleToDisk(height = 5, localX = 10): StudioDoc {
  const doc = replaceNode(downwardDocument(height), 0, {
    id: 'n0', kind: 'sketch', profile: 'circle', center: [10, 10], radius: 10,
  });
  return replaceNode(doc, 2, {
    id: 'n2', kind: 'sketch', profile: 'circle', center: [localX, -8], radius: 8,
    plane: { origin: [1, 2, 20], normal: [0, 0, -1], xAxis: [1, 0, 0] },
  });
}

test('a translated downward circle reaches an original upper disk with a radially contained footprint', () => {
  // World centre (11,10), radius 8: the disk fits in R10, although its bounding corners do not.
  assert.ok(Math.hypot(9, 8) > 10);
  for (const height of [5, 8]) {
    const doc = downwardCircleToDisk(height), travel = 20 - height;
    const opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened); assert.deepEqual(opened.doc, doc);
    const part = toPartDocument(opened.doc), { outputs } = evaluateCadPart(part);
    assert.equal(currentFaceEndDistance(doc, 3), travel);
    assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: travel });
    assert.deepEqual(outputs.map(output => output.id), ['n1', 'n3']);
    assert.ok(outputs.every(output => checkOutput(output).valid));
    const [stock, source] = outputs, mass = massPropertiesOf(source);
    assert.deepEqual(stock.brep, evaluateCadPart(toPartDocument(prefixDoc(doc, 3))).outputs[0].brep);
    assert.ok(Math.abs(massPropertiesOf(stock).volume - 100 * Math.PI * height) < 1e-8);
    assert.ok(Math.abs(mass.volume - 64 * Math.PI * travel) < 1e-8);
    mass.centroid.forEach((value, i) => assert.ok(Math.abs(value - [11, 10, (20 + height) / 2][i]) < 1e-8));
    for (const [output, name, z, direction] of [
      [stock, 'n1.top', height, 1], [source, 'n3.top', height, -1], [source, 'n3.bottom', 20, 1],
    ] as const) {
      const support = faceGeometry(output.brep.faces.find(face => face.name === name)!);
      assert.ok(support.kind === 'plane');
      assert.equal(support.o[2], z);
      assert.deepEqual(support.n.map(value => value || 0), [0, 0, direction]);
    }
  }
});

test('a downward circle refuses disk contact, reversed travel and changes in original target scope', () => {
  assert.equal(currentFaceEndDistance(downwardCircleToDisk(5, 11 - 1e-6), 3), 15);
  for (const x of [11, 11 + 1e-6])
    assert.throws(() => toPartDocument(downwardCircleToDisk(5, x)), /entire projected profile/);
  for (const height of [-5, 0])
    assert.throws(() => toPartDocument(downwardCircleToDisk(height)), /stay forward.*authored end cap/);
  for (const height of [20, 21])
    assert.throws(() => toPartDocument(downwardCircleToDisk(height)), /positive extrusion direction/);
  const doc = downwardCircleToDisk(), [disk, stock, sketch, end] = doc.nodes;
  assert.ok(disk.kind === 'sketch' && disk.profile === 'circle' && stock.kind === 'extrude'
    && sketch.kind === 'sketch' && end.kind === 'face-end-extrude');
  for (const changed of [
    { ...stock, draft: 1 }, { ...stock, held: 'stale' }, { ...stock, kind: 'translate', parent: end.target.body, offset: [0, 0, 0] },
  ] as ModelNode[]) assert.throws(() => toPartDocument(replaceNode(doc, 1, changed)), /original upper cap/);
  assert.throws(() => toPartDocument(replaceNode(doc, 3, { ...end, target: { ...end.target, face: 'n1.bottom' } })), /original upper cap/);
  assert.throws(() => toPartDocument(replaceNode(doc, 0, { ...disk, plane: sketch.plane })), /original upper cap/);
});

function downwardRectangleToDisk(height = 5, width = 5): StudioDoc {
  const doc = downwardCircleToDisk(height);
  return replaceNode(doc, 2, {
    id: 'n2', kind: 'sketch', profile: 'rectangle', min: [9, -16], max: [9 + width, -12],
    plane: { origin: [1, 2, 20], normal: [0, 0, -1], xAxis: [1, 0, 0] },
  });
}

test('a translated downward rectangle reaches the original upper disk with its reflected corners', () => {
  for (const height of [5, 8]) {
    const doc = downwardRectangleToDisk(height), travel = 20 - height;
    const opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened); assert.deepEqual(opened.doc, doc);
    const part = toPartDocument(opened.doc), { outputs } = evaluateCadPart(part);
    assert.equal(currentFaceEndDistance(doc, 3), travel);
    assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: travel });
    assert.deepEqual(outputs.map(output => output.id), ['n1', 'n3']);
    assert.ok(outputs.every(output => checkOutput(output).valid));
    const [target, source] = outputs, mass = massPropertiesOf(source);
    assert.deepEqual(target.brep, evaluateCadPart(toPartDocument(prefixDoc(doc, 3))).outputs[0].brep);
    assert.equal(source.brep.vertices.length, 8);
    for (const x of [10, 15]) for (const y of [14, 18]) for (const z of [height, 20])
      assert.ok(source.brep.vertices.some(vertex => vertex.point.every((value, axis) => value === [x, y, z][axis])));
    assert.ok(Math.abs(mass.volume - 20 * travel) < 1e-8);
    mass.centroid.forEach((value, axis) => assert.ok(Math.abs(value - [12.5, 16, (20 + height) / 2][axis]) < 1e-8));
    const cap = faceGeometry(source.brep.faces.find(face => face.name === 'n3.top')!);
    assert.ok(cap.kind === 'plane' && cap.o[2] === height && cap.n[2] === -1);
  }
});

test('a downward rectangle refuses radial corner contact, out-of-disk corners and unreflected coordinates', () => {
  assert.equal(currentFaceEndDistance(downwardRectangleToDisk(5, 6 - 1e-6), 3), 15);
  // The far corner at width 6 has distance hypot(6, 8) = 10 inside the disk bounding square.
  for (const width of [6, 6 + 1e-6, 7])
    assert.throws(() => toPartDocument(downwardRectangleToDisk(5, width)), /entire projected profile/);
  const doc = downwardRectangleToDisk(), source = doc.nodes[2], end = doc.nodes[3];
  assert.ok(source.kind === 'sketch' && source.profile === 'rectangle' && end.kind === 'face-end-extrude');
  assert.throws(() => toPartDocument(replaceNode(doc, 2, { ...source, min: [9, 3], max: [14, 7] })), /entire projected profile/);
  assert.throws(() => toPartDocument(replaceNode(doc, 3, { ...end, target: { ...end.target, face: 'n1.bottom' } })), /original upper cap/);
  for (const height of [-5, 0])
    assert.throws(() => toPartDocument(downwardRectangleToDisk(height)), /stay forward.*authored end cap/);
  for (const height of [20, 21])
    assert.throws(() => toPartDocument(downwardRectangleToDisk(height)), /positive extrusion direction/);
});

function circleSourceTarget(center: [number, number] = [5, 5], radius = 9, from = 20): StudioDoc {
  return replaceNode(circularTarget(from), 2, { id: 'n2', kind: 'sketch', profile: 'circle', center, radius });
}

function annularPolygonTarget(points: [number, number][], from = 20, origin: [number, number, number] = [0, 0, 0]): StudioDoc {
  const doc = annularTarget(from);
  return { ...doc, nodes: doc.nodes.map((node, i): ModelNode => {
    if (node.kind === 'sketch' && node.profile === 'circle') return { ...node, center: [origin[0], origin[1]] };
    if (node.kind === 'hole') return { ...node, center: [origin[0], origin[1]], radius: 4 };
    return i === 3 ? { id: 'n3', kind: 'sketch', profile: 'polygon', points,
      ...(origin.every(value => value === 0) ? {} : { plane: { origin, normal: [0, 0, 1], xAxis: [1, 0, 0] } }) } : node;
  }) };
}

test('a literal XY rectangle reaches the original lower annulus of one current coaxial through Hole', () => {
  const original = annularTarget(), saved = structuredClone(original);
  for (const from of [20, 30, 40]) {
    const doc = annularTarget(from), opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, doc);
    const part = toPartDocument(opened.doc);
    assert.deepEqual(part.features[4], { id: 'n4', kind: 'extrude', sketch: 'n3', height: from });
    assert.equal(currentFaceEndDistance(doc, 4), from);
    const { outputs } = evaluateCadPart(part), [tube, post] = outputs;
    assert.deepEqual(outputs.map(output => output.id), ['n2', 'n4']);
    assert.ok(outputs.every(output => checkOutput(output).valid));
    assert.equal(tube.brep.faces.length, 6); assert.equal(post.brep.faces.length, 6);
    assert.ok(Math.abs(massPropertiesOf(tube).volume - Math.PI * (12 ** 2 - 3 ** 2) * 5) < 1e-7);
    assert.ok(Math.abs(massPropertiesOf(post).volume - 16 * from) < 1e-8);
    assert.ok(massPropertiesOf(post).centroid.every((value, i) => Math.abs(value - [6, 0, from / 2][i]) < 1e-9));
    const end = faceGeometry(tube.brep.faces.find(face => face.name === 'n1.bottom')!);
    const reached = faceGeometry(post.brep.faces.find(face => face.name === 'n4.top')!);
    assert.ok(end.kind === 'plane' && reached.kind === 'plane');
    assert.equal(end.o[2], from); assert.equal(reached.o[2], from);
    assert.deepEqual(end.n, [0, 0, -1]); assert.deepEqual(reached.n, [0, 0, 1]);
    assert.deepEqual(tube.brep, evaluateCadPart(toPartDocument(prefixDoc(doc, 4))).outputs[0].brep);
    assert.deepEqual(doc.nodes[4], original.nodes[4], 'the saved reference has no cached height');
    assert.deepEqual(usesOf(doc.nodes[4]), [3, 2]);
  }
  assert.deepEqual(original, saved);
  const target = original.nodes[1];
  assert.ok(target.kind === 'extrude');
  const parameterized = { ...replaceNode(original, 1, { ...target, from: { parameter: 'Start' }, height: { parameter: 'Height' } }),
    parameters: { Start: 28, Height: 6 } };
  assert.equal(currentFaceEndDistance(parameterized, 4), 28);
});

test('annular containment proves the entire rectangle, including edge and interior bore overlap', () => {
  const doc = annularTarget(), source = doc.nodes[3];
  assert.ok(source.kind === 'sketch' && source.profile === 'rectangle');
  // Both fixtures have every corner strictly outside R3. Their edge/interior is not material.
  for (const [min, max] of [
    [[-4, 2], [4, 4]], [[-4, -4], [4, 4]], [[3, -1], [5, 1]], [[3 - 1e-9, -1], [5, 1]],
  ] as const) {
    const candidate = replaceNode(doc, 3, { ...source, min: [...min], max: [...max] });
    assert.throws(() => toPartDocument(candidate), /entire projected profile clear of its bore/i);
  }
  assert.equal(currentFaceEndDistance(replaceNode(doc, 3, { ...source, min: [3 + 1e-6, -1], max: [5, 1] }), 4), 20);
  for (const maxX of [Math.sqrt(143), Math.sqrt(143) + 1e-9, 12]) {
    assert.throws(() => toPartDocument(replaceNode(doc, 3, { ...source, min: [8, -1], max: [maxX, 1] })), /entire projected profile/i);
  }
  assert.equal(currentFaceEndDistance(replaceNode(doc, 3, { ...source, min: [8, -1], max: [Math.sqrt(143) - 1e-6, 1] }), 4), 20);
  // XY centre comes from native cylindrical supports, not the cap's material anchor.
  const translated: StudioDoc = { ...doc, nodes: doc.nodes.map((node): ModelNode =>
    node.kind === 'sketch' && node.profile === 'circle' ? { ...node, center: [50, -20] }
      : node.kind === 'hole' ? { ...node, center: [50, -20] }
        : node.kind === 'sketch' && node.profile === 'rectangle' ? { ...node, min: [54, -22], max: [58, -18] } : node) };
  assert.equal(currentFaceEndDistance(translated, 4), 20);
  const planeSource = replaceNode(translated, 3, { ...source, plane: { origin: [50, -20, 5], normal: [0, 0, 1], xAxis: [1, 0, 0] } });
  assert.equal(currentFaceEndDistance(planeSource, 4), 15);
});

test('an annular target contains the entire convex triangle although its bounding box covers the bore', () => {
  const points: [number, number][] = [[0, 7], [7, 0], [8, 8]];
  for (const reverse of [false, true]) for (const from of [20, 28]) for (const origin of [[0, 0, 0], [50, -20, 5], [-50.25, 20.125, -2]] as [number, number, number][]) {
    const doc = annularPolygonTarget(reverse ? [...points].reverse() : points, from, origin), saved = structuredClone(doc);
    const opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, saved);
    const part = toPartDocument(opened.doc), height = from - origin[2];
    assert.deepEqual(part.features[4], { id: 'n4', kind: 'extrude', sketch: 'n3', height });
    assert.equal(currentFaceEndDistance(doc, 4), height);
    const { outputs } = evaluateCadPart(part), [tube, post] = outputs;
    assert.deepEqual(outputs.map(output => output.id), ['n2', 'n4']);
    assert.ok(outputs.every(output => checkOutput(output).valid));
    // The authored triangle has area 31.5 and centroid (5,5), independently of its winding.
    const mass = massPropertiesOf(post), expectedCentre = [origin[0] + 5, origin[1] + 5, (origin[2] + from) / 2];
    assert.ok(Math.abs(mass.volume - 31.5 * height) < 1e-7);
    mass.centroid.forEach((value, axis) => assert.ok(Math.abs(value - expectedCentre[axis]) < 1e-8));
    assert.ok(Math.abs(massPropertiesOf(tube).volume - Math.PI * (12 ** 2 - 4 ** 2) * 5) < 1e-7);
    assert.deepEqual(tube.brep, evaluateCadPart(toPartDocument(prefixDoc(doc, 4))).outputs[0].brep);
    const end = faceGeometry(tube.brep.faces.find(face => face.name === 'n1.bottom')!);
    const reached = faceGeometry(post.brep.faces.find(face => face.name === 'n4.top')!);
    assert.ok(end.kind === 'plane' && reached.kind === 'plane');
    assert.equal(end.o[2], from); assert.equal(reached.o[2], from);
    assert.deepEqual(end.n, [0, 0, -1]); assert.deepEqual(reached.n, [0, 0, 1]);
    assert.deepEqual(doc, saved);
  }
});

test('annular polygon containment refuses edge crossings, an enclosed bore and strict boundary contact', () => {
  const cases: [number, number][][] = [
    [[0, 5], [5, 0], [8, 8]], // Every vertex is on material; the first edge crosses R4.
    [[-8, -6], [8, -6], [0, 10]], // Even every edge clears R4, but the interior encloses it.
    [[-6, 0], [6, 0], [0, 10]], // The bore centre is exactly on the polygon boundary.
    [[4, -1], [6, 0], [4, 1]], // Edge tangent to the bore.
    [[4, 0], [6, -1], [6, 1]], // Vertex tangent to the bore; nearest point is an endpoint.
    [[4 + 1e-14, -1], [6, 0], [4 + 1e-14, 1]], // Below the retained native support margin.
  ];
  for (const points of cases) for (const reverse of [false, true]) for (const origin of [[0, 0, 0], [50, -20, 5]] as [number, number, number][]) {
    const doc = annularPolygonTarget(reverse ? [...points].reverse() : points, 20, origin), saved = structuredClone(doc);
    assert.throws(() => toPartDocument(doc), /entire projected profile clear of its bore/i);
    assert.deepEqual(doc, saved);
  }
  assert.equal(currentFaceEndDistance(annularPolygonTarget([[4 + 1e-6, -1], [6, 0], [4 + 1e-6, 1]]), 4), 20);
  assert.throws(() => toPartDocument(annularPolygonTarget([[0, 7], [7, 0], [9, 9]])), /entire projected profile/i);
});

test('annular targets retain admitted convex four, six and eight point sources and endpoint clearance', () => {
  const cases: { points: [number, number][]; area: number }[] = [
    { points: [[6, -1], [8, -1], [8, 1], [6, 1]], area: 4 },
    { points: [[5, 0], [6, -2], [8, -2], [9, 0], [8, 2], [6, 2]], area: 12 },
    { points: [[5, -1], [6, -2], [8, -2], [9, -1], [9, 1], [8, 2], [6, 2], [5, 1]], area: 14 },
    { points: [[5, 0], [7, 0], [5, 2]], area: 2 },
  ];
  for (const { points, area } of cases) for (const reverse of [false, true]) {
    const doc = annularPolygonTarget(reverse ? [...points].reverse() : points), opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened); assert.deepEqual(opened.doc, doc);
    const post = evaluateCadPart(toPartDocument(opened.doc)).outputs[1];
    assert.ok(checkOutput(post).valid);
    assert.ok(Math.abs(massPropertiesOf(post).volume - area * 20) < 1e-7);
    assert.equal(post.brep.faces.length, points.length + 2);
  }
  // Previously excluded solely because it was a polygon; this footprint clears the existing R3 fixture.
  const old = replaceNode(annularTarget(), 3, { id: 'n3', kind: 'sketch', profile: 'polygon', points: [[4, -2], [8, -2], [6, 2]] });
  assert.equal(currentFaceEndDistance(old, 4), 20);
});

test('annular polygon support preserves original target identity, forward distance and XY-only admission', () => {
  const doc = annularPolygonTarget([[0, 7], [7, 0], [8, 8]]), stock = doc.nodes[1], hole = doc.nodes[2], source = doc.nodes[3];
  assert.ok(stock.kind === 'extrude' && hole.kind === 'hole' && source.kind === 'sketch' && source.profile === 'polygon');
  for (const candidate of [
    replaceNode(doc, 1, { ...stock, id: 'n9' }), replaceNode(doc, 1, { ...stock, height: -5 }),
    replaceNode(doc, 2, { ...hole, id: 'n9' }), replaceNode(doc, 2, { ...hole, depth: 2 }),
    replaceNode(doc, 2, { ...hole, center: [0.01, 0] }),
    replaceNode(doc, 3, { ...source, plane: { origin: [0, 0, 0], normal: [1, 0, 0], xAxis: [0, 1, 0] } }),
    replaceNode(doc, 3, { ...source, plane: { origin: [0, 0, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] } }),
  ]) assert.throws(() => toPartDocument(candidate));
  assert.throws(() => toPartDocument(annularPolygonTarget([[0, 7], [7, 0], [8, 8]], 0)), /positive extrusion direction/i);
});

test('annular saved bindings retain stock and source identity and refuse reversed parent extrusion', () => {
  const doc = annularTarget(), stock = doc.nodes[1], bound = doc.nodes[4];
  assert.ok(stock.kind === 'extrude' && bound.kind === 'face-end-extrude');
  for (const height of [-5, 0, { parameter: 'Height' }]) {
    const candidate = { ...replaceNode(doc, 1, { ...stock, height }), parameters: { Height: -5 } };
    const opened = readStudioDoc(JSON.stringify(candidate));
    assert.ok('error' in opened); assert.match(opened.error, /must stay forward.*authored start cap/i);
    assert.throws(() => toPartDocument(candidate), /must stay forward.*authored start cap/i);
  }
  for (const candidate of [
    replaceNode(doc, 1, { ...stock, id: 'n9' }),
    replaceNode(doc, 0, { ...doc.nodes[0], id: undefined }),
    replaceNode(doc, 3, { ...doc.nodes[3], id: 'n0' }),
    replaceNode(doc, 2, { ...doc.nodes[2], id: 'n9' }),
    replaceNode(doc, 4, { ...bound, target: { ...bound.target, feature: 'n1' } }),
  ]) {
    const opened = readStudioDoc(JSON.stringify(candidate));
    assert.ok('error' in opened); assert.match(opened.error, /identity/i);
    assert.throws(() => toPartDocument(candidate), /identity/i);
  }
  for (const face of ['n1.top', 'n2.bottom', 'n1.bottom#1', 'n1.side0#2', 'n1.missing']) {
    assert.throws(() => toPartDocument(replaceNode(doc, 4, { ...bound, target: { ...bound.target, face } })),
      /normal must oppose|identity|persistent native face|missing or ambiguous/i);
  }
  assert.throws(() => toPartDocument(annularTarget(0)), /positive extrusion direction/i);
});

test('annular support remains bounded to a direct upright single through Hole and untrimmed source', () => {
  const doc = annularTarget(), hole = doc.nodes[2], stock = doc.nodes[1], circle = doc.nodes[0], source = doc.nodes[3];
  assert.ok(hole.kind === 'hole' && stock.kind === 'extrude' && circle.kind === 'sketch' && circle.profile === 'circle'
    && source.kind === 'sketch' && source.profile === 'rectangle');
  for (const candidate of [
    replaceNode(doc, 2, { ...hole, center: [0.01, 0] }),
    replaceNode(doc, 2, { ...hole, held: 'old hole' }),
    replaceNode(doc, 1, { ...stock, held: 'old stock' }),
    replaceNode(doc, 0, { ...circle, held: 'old source' }),
    replaceNode(doc, 2, { ...hole, depth: 2 }),
    replaceNode(doc, 2, { ...hole, pattern: { count: 1, step: [1, 0] } }),
    replaceNode(doc, 2, { ...hole, thread: 'M6' }),
    replaceNode(doc, 2, { ...hole, face: 'n1.top' }),
    replaceNode(doc, 2, { ...hole, countersink: 8 }),
    replaceNode(doc, 1, { ...stock, draft: 2 }),
    replaceNode(doc, 0, { ...circle, plane: { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] } }),
    replaceNode(doc, 3, { id: 'n3', kind: 'sketch', profile: 'circle', center: [6, 0], radius: 1,
      holes: [[{ kind: 'arc', start: [6.25, 0], center: [6, 0], direction: 'ccw' }]] }),
  ]) assert.throws(() => toPartDocument(candidate));
  const bound = doc.nodes[4]; assert.ok(bound.kind === 'face-end-extrude');
  const consumed: StudioDoc = { ...doc, nodes: [...doc.nodes.slice(0, 4),
    { id: 'n5', kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] }, bound], nextId: 6 };
  assert.throws(() => toPartDocument(consumed), /one current exact solid/i);
  const transformed: StudioDoc = { ...consumed, nodes: consumed.nodes.map((node, i) => i === 5
    ? { ...bound, target: { body: { node: 4, side: 'solid' }, feature: 'n5', face: 'n1.bottom' } } : node) };
  assert.throws(() => toPartDocument(transformed), /convex straight trim.*without holes/i);
});

test('the local Agent puts one explicit sketch and original cap into the same To face command', async () => {
  const evaluate = async (doc: StudioDoc) => evaluateDoc(doc, 1);
  const noEvaluation = async () => assert.fail('Refuse before evaluating a candidate');
  for (const make of [documentAt, circularTarget]) {
    const expected = make(20), doc = { ...prefixDoc(expected, 3), nextId: 3 }, stock = evaluateDoc(doc, 0);
    assert.ok(stock.ok);
    const state = { doc, bodies: stock.bodies };
    const request = { action: 'command', command: 'extrude', expectedRevision: revisionOf(doc),
      values: { depth: 'to-face', sketch: 'n2' }, faces: ['n1.bottom'] };
    const originalFace = stock.bodies[0].mesh.faces.find(face => face.name === 'n1.bottom');
    assert.ok(originalFace);
    for (const [args, detail] of [
      [{ ...request, expectedRevision: undefined }, /current expectedRevision/],
      [{ ...request, expectedRevision: revisionOf(prefixDoc(make(30), 3)) }, /part changed/],
      [{ ...request, values: { ...request.values, h: 20 } }, /only values.depth and values.sketch/],
      [{ ...request, values: { ...request.values, sketch: 'n9' } }, /active finished sketch/],
      [{ ...request, faces: ['n1.bottom', 'n1.top'] }, /one exact native face name/],
      [{ ...request, faces: [originalFace.id + '-unknown'] }, /unique original native face/],
    ] as const) {
      const refused = await dispatchTool(state, 'features', args, noEvaluation);
      assert.ok(refused.isError && !refused.changed);
      assert.match(refused.content, detail);
      assert.equal(refused.state.doc, doc);
    }
    const wrongCap = await dispatchTool(state, 'features', { ...request, faces: ['n1.top'] }, evaluate);
    assert.ok(wrongCap.isError && !wrongCap.changed);
    assert.match(JSON.parse(wrongCap.content).detail, /normal must oppose/);
    assert.equal(wrongCap.state.doc, doc);
    const reviewed = await dispatchTool(state, 'features', request, evaluate);
    assert.ok(!reviewed.isError && reviewed.changed, reviewed.content);
    assert.deepEqual(reviewed.state.doc, expected);
  }
});

test('a literal XY rectangle reaches the current original lower disk of an intact circular Extrude', () => {
  for (const from of [20, 30, 40]) {
    const doc = circularTarget(from), saved = structuredClone(doc), opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, doc);
    const part = toPartDocument(doc);
    assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: from });
    assert.equal(currentFaceEndDistance(doc, 3), from);
    const { outputs } = evaluateCadPart(part), target = outputs[0], result = outputs[1];
    assert.deepEqual(outputs.map(output => output.id), ['n1', 'n3']);
    assert.ok(outputs.every(output => checkOutput(output).valid));
    assert.equal(target.brep.faces.length, 4); assert.equal(result.brep.faces.length, 6);
    assert.ok(Math.abs(massPropertiesOf(target).volume - Math.PI * 12 ** 2 * 5) < 1e-7);
    assert.ok(Math.abs(massPropertiesOf(result).volume - 100 * from) < 1e-8);
    assert.ok(massPropertiesOf(result).centroid.every((value, i) => Math.abs(value - [5, 5, from / 2][i]) < 1e-9));
    const bottom = target.brep.faces.find(face => face.name === 'n1.bottom'), top = result.brep.faces.find(face => face.name === 'n3.top');
    assert.ok(bottom && top);
    const end = faceGeometry(bottom), reached = faceGeometry(top);
    assert.ok(end.kind === 'plane' && reached.kind === 'plane');
    assert.equal(end.o[2], from); assert.equal(reached.o[2], from);
    assert.deepEqual(end.n, [0, 0, -1]); assert.deepEqual(reached.n, [0, 0, 1]);
    const original = evaluateCadPart(toPartDocument(prefixDoc(doc, 3))).outputs[0];
    assert.deepEqual(target.brep, original.brep, 'the target is read from the same current native solid and is not rebuilt or modified');
    assert.deepEqual(doc, saved);
  }
});

test('circular target containment checks the farthest rectangle corner rather than its bounding square', () => {
  // R6's bounding square [-1,11]² contains [0,10]², but every corner is sqrt(50) from the disk centre.
  for (const radius of [6, Math.sqrt(50), Math.sqrt(50) - 1e-9]) {
    assert.throws(() => toPartDocument(circularTarget(20, radius)), /entire projected profile/i);
  }
  assert.equal(currentFaceEndDistance(circularTarget(20, Math.sqrt(50) + 1e-6), 3), 20);
  const behind = circularTarget(0);
  assert.throws(() => toPartDocument(behind), /positive extrusion direction/i);
});

test('a represented R9 circle reaches an original R12 disk although its bounding square does not fit', () => {
  assert.ok(Math.hypot(9, 9) > 12);
  for (const from of [20, 28]) {
    const doc = circleSourceTarget([5, 5], 9, from), saved = structuredClone(doc), opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened); assert.deepEqual(opened.doc, saved);
    const part = toPartDocument(opened.doc);
    assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: from });
    assert.equal(part.features.length, 4);
    assert.equal(currentFaceEndDistance(doc, 3), from);
    const { outputs } = evaluateCadPart(part), [target, post] = outputs;
    assert.deepEqual(outputs.map(output => output.id), ['n1', 'n3']);
    assert.ok(outputs.every(output => checkOutput(output).valid));
    const mass = massPropertiesOf(post);
    assert.ok(Math.abs(mass.volume - Math.PI * 81 * from) < 1e-7);
    mass.centroid.forEach((value, axis) => assert.ok(Math.abs(value - [5, 5, from / 2][axis]) < 1e-8));
    assert.equal(post.brep.faces.length, 4);
    const end = faceGeometry(target.brep.faces.find(face => face.name === 'n1.bottom')!);
    const reached = faceGeometry(post.brep.faces.find(face => face.name === 'n3.top')!);
    assert.ok(end.kind === 'plane' && reached.kind === 'plane');
    assert.equal(end.o[2], from); assert.equal(reached.o[2], from);
    assert.deepEqual(end.n, [0, 0, -1]); assert.deepEqual(reached.n, [0, 0, 1]);
    assert.deepEqual(target.brep, evaluateCadPart(toPartDocument(prefixDoc(doc, 3))).outputs[0].brep);
    assert.deepEqual(evaluateCadPart(toPartDocument(doc)).outputs, outputs);
    assert.deepEqual(doc, saved);
  }
  const legacy = circleSourceTarget();
  legacy.nodes[2] = { kind: 'sketch', profile: 'circle', center: [5, 5], radius: 9 };
  assert.equal(currentFaceEndDistance(legacy, 3), 20);
});

test('circle-to-disk containment accepts a shifted interior and strictly refuses tangency and outside material', () => {
  for (const [x, radius] of [[7, 9], [8 - 1e-6, 9], [5, 12 - 1e-6]])
    assert.equal(currentFaceEndDistance(circleSourceTarget([x, 5], radius), 3), 20);
  for (const [x, radius] of [[8, 9], [8 + 1e-6, 9], [5, 12], [5, 12 + 1e-6], [5, 12 - 1e-14]]) {
    const doc = circleSourceTarget([x, 5], radius), saved = structuredClone(doc);
    assert.throws(() => toPartDocument(doc), /entire projected profile/i);
    assert.deepEqual(doc, saved);
  }
});

test('circle-to-disk proof uses native endpoint radius normalization and translated source and target supports', () => {
  const local: [number, number] = [0.1, 0.2], radius = 0.2, representedRadius = (local[0] + radius) - local[0];
  assert.notEqual(representedRadius, radius);
  for (const origin of [[0, 0, 0], [50, -20, 5], [-50.25, 20.125, -2]] as [number, number, number][]) {
    let doc = circleSourceTarget(local, radius);
    doc = replaceNode(doc, 0, { id: 'n0', kind: 'sketch', profile: 'circle', center: [origin[0] + local[0], origin[1] + local[1]], radius: 1 });
    doc = replaceNode(doc, 2, { id: 'n2', kind: 'sketch', profile: 'circle', center: local, radius,
      plane: { origin, normal: [0, 0, 1], xAxis: [1, 0, 0] } });
    const saved = structuredClone(doc), opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened); assert.deepEqual(opened.doc, saved);
    const part = toPartDocument(opened.doc), height = 20 - origin[2], { outputs } = evaluateCadPart(part), post = outputs[1];
    assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height });
    assert.ok(outputs.every(output => checkOutput(output).valid));
    const cylinders = post.brep.faces.map(face => faceGeometry(face)).filter(face => face.kind === 'cylinder');
    assert.equal(cylinders.length, 2);
    for (const cylinder of cylinders) {
      assert.ok(Math.abs(cylinder.r - representedRadius) < 1e-12);
      assert.ok(Math.abs(cylinder.c[0] - (origin[0] + local[0])) < 1e-12);
      assert.ok(Math.abs(cylinder.c[1] - (origin[1] + local[1])) < 1e-12);
    }
    const mass = massPropertiesOf(post), centre = [origin[0] + local[0], origin[1] + local[1], (origin[2] + 20) / 2];
    assert.ok(Math.abs(mass.volume - Math.PI * representedRadius ** 2 * height) < 1e-9);
    mass.centroid.forEach((value, axis) => assert.ok(Math.abs(value - centre[axis]) < 1e-8));
    assert.deepEqual(outputs[0].brep, evaluateCadPart(toPartDocument(prefixDoc(doc, 3))).outputs[0].brep);
    assert.deepEqual(doc, saved);
  }
  // An arbitrary 1 mm probe would exceed the coordinate limit; the actual short depth is valid.
  let nearLimit = circleSourceTarget([5, 5], 9, 9999.875);
  nearLimit = replaceNode(nearLimit, 1, { id: 'n1', kind: 'extrude', sketch: 0, from: 9999.875, height: 0.0625 });
  nearLimit = replaceNode(nearLimit, 2, { id: 'n2', kind: 'sketch', profile: 'circle', center: [5, 5], radius: 9,
    plane: { origin: [0, 0, 9999.75], normal: [0, 0, 1], xAxis: [1, 0, 0] } });
  assert.equal(currentFaceEndDistance(nearLimit, 3), 0.125);
  assert.ok(evaluateCadPart(toPartDocument(nearLimit)).outputs.every(output => checkOutput(output).valid));
});

function annularCircle(center: [number, number], radius = 3, from = 20): StudioDoc {
  const doc = annularTarget(from), bore = doc.nodes[2];
  assert.ok(bore.kind === 'hole');
  return replaceNode(replaceNode(doc, 2, { ...bore, radius: 4 }), 3,
    { id: 'n3', kind: 'sketch', profile: 'circle', center, radius });
}

test('an exact round profile fits the lower annular cap even when its square bounds extend outside it', () => {
  assert.ok(Math.hypot(6, 6) + 3 < 12 && Math.hypot(6, 6) - 3 > 4);
  assert.ok(Math.hypot(9, 9) > 12);
  const original = annularCircle([6, 6]);
  for (const z of [20, 28, 36]) {
    const doc = annularCircle([6, 6], 3, z), opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened); assert.deepEqual(opened.doc, doc);
    assert.deepEqual(doc.nodes[4], original.nodes[4]);
    assert.equal(currentFaceEndDistance(opened.doc, 4), z);
    const { outputs } = evaluateCadPart(toPartDocument(opened.doc));
    assert.deepEqual(outputs.map(output => output.id), ['n2', 'n4']);
    assert.ok(outputs.every(output => checkOutput(output).valid));
    const [tube, post] = outputs;
    assert.deepEqual(tube.brep, evaluateCadPart(toPartDocument(prefixDoc(doc, 4))).outputs[0].brep);
    const native = massPropertiesOf(post);
    assert.ok(Math.abs(native.volume - 9 * Math.PI * z) < 1e-8);
    native.centroid.forEach((value, axis) => assert.ok(Math.abs(value - [6, 6, z / 2][axis]) < 1e-8));
    const plane = faceGeometry(post.brep.faces.find(face => face.name === 'n4.top')!);
    assert.ok(plane.kind === 'plane');
    assert.equal(plane.o[2], z);
    assert.deepEqual(plane.n, [0, 0, 1]);
  }
});

test('circle-to-annulus refuses crossing or tangent contact at the bore and outer trim', () => {
  for (const [x, radius] of [[0, 5], [5.5, 2], [6, 2], [9, 3], [9.5, 3]]) {
    const doc = annularCircle([x, 0], radius), before = structuredClone(doc);
    assert.throws(() => toPartDocument(doc), /bore|entire projected profile/i);
    assert.deepEqual(doc, before);
  }
  for (const [x, radius] of [[6 + 1e-6, 2], [9 - 1e-6, 3]])
    assert.equal(currentFaceEndDistance(annularCircle([x, 0], radius), 4), 20);
});

test('circle-to-disk support retains original target and source limits and circle-to-rectangle behavior', () => {
  const doc = circleSourceTarget(), source = doc.nodes[2], target = doc.nodes[1];
  assert.ok(source.kind === 'sketch' && source.profile === 'circle' && target.kind === 'extrude');
  for (const candidate of [
    replaceNode(doc, 1, { ...target, id: 'n9' }), replaceNode(doc, 1, { ...target, height: -5 }),
    replaceNode(doc, 1, { ...target, held: 'old target' }),
    replaceNode(doc, 0, { id: 'n0', kind: 'sketch', profile: 'circle', center: [5, 5], radius: 12,
      plane: { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] } }),
    replaceNode(doc, 2, { ...source, outline: { points: [] } }),
    replaceNode(doc, 2, { ...source, plane: { origin: [0, 0, 0], normal: [1, 0, 0], xAxis: [0, 1, 0] } }),
    replaceNode(doc, 2, { ...source, plane: { origin: [0, 0, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] } }),
  ]) assert.throws(() => toPartDocument(candidate));
  assert.throws(() => toPartDocument(circleSourceTarget([5, 5], 9, 0)), /positive extrusion direction/i);
  const flat = replaceNode(documentAt(20), 2, { id: 'n2', kind: 'sketch', profile: 'circle', center: [5, 5], radius: 4 });
  const flatPost = evaluateCadPart(toPartDocument(flat)).outputs[1];
  assert.ok(checkOutput(flatPost).valid);
  assert.ok(Math.abs(massPropertiesOf(flatPost).volume - Math.PI * 16 * 20) < 1e-7);
});

test('circular target admission keeps the direction, authored identity and saved-format guards', () => {
  const doc = circularTarget(), target = doc.nodes[1];
  const edit = (index: number, next: ModelNode): StudioDoc => ({ ...doc, nodes: doc.nodes.map((node, i) => i === index ? next : node) });
  assert.throws(() => toPartDocument(edit(3, { ...recipe, target: { ...recipe.target, face: 'n1.top' } })), /face normal must oppose/i);
  assert.throws(() => toPartDocument(edit(3, { ...recipe, target: { ...recipe.target, face: 'n1.side0#1' } })), /persistent native face name/i);
  assert.throws(() => toPartDocument(edit(1, { ...target, held: 'old circle' })), /convex straight trim|current exact solid/i);
  const changedId = edit(1, { ...target, id: 'n9' }), read = readStudioDoc(JSON.stringify(changedId));
  assert.ok('error' in read);
  assert.match(read.error, /target feature identity/i);
  assert.throws(() => toPartDocument(changedId), /target feature identity/i);
  assert.ok(target.kind === 'extrude');
  const reversed = edit(1, { ...target, height: -5 });
  assert.throws(() => toPartDocument(reversed), /target extrusion must stay forward/i);
  const staleRecipe = { ...recipe, height: 20 };
  const unknown = readStudioDoc(JSON.stringify(edit(3, staleRecipe)));
  assert.ok('error' in unknown);
  assert.match(unknown.error, /unknown field/i);
  assert.deepEqual(doc.nodes[3], recipe);
});

test('circular target scope excludes annular, oblique and transformed caps and other source profiles', () => {
  const doc = circularTarget(), circle = doc.nodes[0];
  assert.ok(circle.kind === 'sketch' && circle.profile === 'circle');
  const annular: StudioDoc = { ...doc, nodes: [{ ...circle, holes: [[{ kind: 'arc', start: [6, 5], center: [5, 5], direction: 'ccw' }]] }, ...doc.nodes.slice(1)] };
  assert.throws(() => toPartDocument(annular), /convex straight trim.*without holes/i);
  const oblique: StudioDoc = { ...doc, nodes: [{ ...circle, plane: { origin: [0, 0, 0], normal: [0, 1, 1], xAxis: [1, 0, 0] } }, ...doc.nodes.slice(1)] };
  assert.throws(() => toPartDocument(oblique), /plane parallel to the sketch/i);
  const transformed: StudioDoc = { ...doc, nodes: [
    ...doc.nodes.slice(0, 2), { id: 'n2', kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [0, 0, 0] },
    { ...doc.nodes[2], id: 'n3' }, { ...recipe, id: 'n4', sketch: 3, target: { body: { node: 2, side: 'solid' }, feature: 'n2', face: 'n1.bottom' } },
  ], outputs: { b2: { node: 2, side: 'solid' }, b4: { node: 4, side: 'solid' } }, nextId: 5 };
  assert.throws(() => toPartDocument(transformed), /convex straight trim|named target face/i);
  for (const source of [
    { id: 'n2', kind: 'sketch', profile: 'polygon', points: [[0, 0], [10, 0], [5, 10]] },
  ] as ModelNode[]) {
    assert.throws(() => toPartDocument({ ...doc, nodes: [...doc.nodes.slice(0, 2), source, recipe] }), /convex straight trim/i);
  }
});

test('a named native end face changes only the derived height on a target edit', () => {
  for (const from of [20, 30, 40]) {
    const doc = documentAt(from);
    const opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, doc);
    const part = toPartDocument(doc);
    assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: from });
    const results = evaluateCadPart(part).outputs;
    assert.deepEqual(results.map(output => output.id), ['n1', 'n3']);
    for (const [index, bottom, top, volume] of [[0, from, from + 5, 2000], [1, 0, from, 100 * from]]) {
      const output = results[index];
      assert.ok(checkOutput(output).valid);
      assert.equal(output.brep.vertices.length, 8);
      assert.deepEqual([...new Set(output.brep.vertices.map(vertex => vertex.point[2]))].sort((a, b) => a - b), [bottom, top]);
      assert.ok(Math.abs(massPropertiesOf(output).volume - volume) < 1e-8);
    }
  }
});

test('a saved target is one current exact rectangular cap that contains the source', () => {
  const base = documentAt(20);
  const edited = (index: number, next: ModelNode) => ({ ...base, nodes: base.nodes.map((node, i) => i === index ? next : node) });
  const targetSketch = base.nodes[0];
  assert.ok(targetSketch.kind === 'sketch' && targetSketch.profile === 'rectangle');
  assert.throws(() => toPartDocument(edited(0, { ...targetSketch, max: [3, 15] })), /entire projected profile/i);
  assert.throws(() => toPartDocument(documentAt(0)), /positive extrusion direction/i);
  assert.throws(() => toPartDocument(documentAt(-20)), /positive extrusion direction/i);
  assert.throws(() => toPartDocument(edited(3, { ...recipe, target: { ...recipe.target, face: 'n1.unknown' } })), /missing or ambiguous/i);
  assert.throws(() => toPartDocument(edited(3, { ...recipe, target: { ...recipe.target, face: 'n1.top' } })), /normal must oppose/i);
  assert.throws(() => toPartDocument(edited(3, { ...recipe, target: { ...recipe.target, face: 'n1.side0' } })), /plane parallel to the sketch/i);
  assert.throws(() => toPartDocument(edited(1, { ...base.nodes[1], suppressed: true })), /missing or suppressed/i);
  const consumed: StudioDoc = { ...base, nodes: [...base.nodes.slice(0, 3),
    { id: 'n4', kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [0, 0, 5] }, recipe], nextId: 5 };
  assert.throws(() => toPartDocument(consumed), /one current exact solid/i);
  const source = base.nodes[2];
  assert.ok(source.kind === 'sketch' && source.profile === 'rectangle');
  assert.throws(() => toPartDocument(edited(2, { ...source, min: [{ parameter: 'p' }, 0] })), /literal rectangle/i);
});

test('saved recipes refuse ambiguous identity and a second authored height', () => {
  const base = documentAt(20);
  for (const [node, expected] of [
    [{ ...recipe, height: 20 }, /unknown field/i],
    [{ ...recipe, target: { ...recipe.target, feature: 'n4' } }, /feature identity/i],
    [{ ...recipe, target: { ...recipe.target, body: { node: 3, side: 'solid' } } }, /preceding solid/i],
    [{ ...recipe, target: { ...recipe.target, face: 'n1.bottom+n1.top' } }, /persistent native face name/i],
    [{ ...recipe, target: { ...recipe.target, face: 'n1.bottom#2' } }, /persistent native face name/i],
  ] as const) {
    const doc = { ...base, nodes: [...base.nodes.slice(0, 3), node] };
    const opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('error' in opened);
    assert.match(opened.error, expected);
    assert.throws(() => toPartDocument(doc), expected);
  }
  const duplicatedId = { ...base, nodes: [base.nodes[0], base.nodes[1], { ...base.nodes[2], id: 'n1' }, recipe] };
  assert.throws(() => toPartDocument(duplicatedId), /ambiguous/i);
});

test('a reversed target cannot give the binding to the other cap with the same native name', () => {
  const base = documentAt(20), target = base.nodes[1];
  assert.equal(target.kind, 'extrude');
  const withTarget = (height: typeof target.height, parameters = {}): StudioDoc => ({
    ...base, parameters, nodes: [base.nodes[0], { ...target, height }, ...base.nodes.slice(2)],
  });
  const reversed = withTarget(-5);
  const unbound = prefixDoc(reversed, 2);
  const [output] = evaluateCadPart(toPartDocument(unbound)).outputs;
  assert.ok(checkOutput(output).valid);
  assert.deepEqual([...new Set(output.brep.vertices.map(vertex => vertex.point[2]))].sort((a, b) => a - b), [15, 20]);
  const bottom = output.brep.faces.find(face => face.name === 'n1.bottom');
  assert.ok(bottom);
  const plane = faceGeometry(bottom);
  assert.ok(plane.kind === 'plane');
  assert.equal(plane.o[2], 15);

  for (const doc of [reversed, withTarget(0), withTarget({ parameter: 'pull' }, { pull: -5 })]) {
    assert.throws(() => toPartDocument(doc), { code: 'BAD_REFERENCE', message: /must stay forward.*authored start cap/i });
    const opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('error' in opened);
    assert.match(opened.error, /\[BAD_REFERENCE\].*must stay forward.*authored start cap/i);
  }
  const forward = withTarget({ parameter: 'pull' }, { pull: 5 });
  assert.equal(currentFaceEndDistance(forward, 3), 20);
  assert.ok('doc' in readStudioDoc(JSON.stringify(forward)));
});

test('the direct lower cap guard preserves existing translated, drafted and rotated targets', () => {
  const base = documentAt(20);
  const translated = {
    ...base,
    nodes: [base.nodes[0], base.nodes[1], { kind: 'translate', id: 'n4', parent: { node: 1, side: 'solid' }, offset: [0, 0, 5] },
      base.nodes[2], { ...recipe, sketch: 3, target: { ...recipe.target, body: { node: 2, side: 'solid' }, feature: 'n4' } }],
    outputs: { b4: { node: 2, side: 'solid' }, b3: { node: 4, side: 'solid' } }, nextId: 5,
  } satisfies StudioDoc;
  const target = base.nodes[1];
  assert.equal(target.kind, 'extrude');
  const drafted = { ...base, nodes: [base.nodes[0], { ...target, draft: 5 }, base.nodes[2],
    recipe] } satisfies StudioDoc;
  const draftedReverse = { ...drafted, nodes: [base.nodes[0], { ...target, draft: 5, height: -5 }, base.nodes[2],
    { ...recipe, target: { ...recipe.target, face: 'n1.top' } }] } satisfies StudioDoc;
  const rotated = { ...base, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-5, -15], max: [15, 5],
      plane: { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [0, 1, 0] } },
    target, base.nodes[2], recipe,
  ] } satisfies StudioDoc;
  for (const [doc, index, height] of [[translated, 4, 25], [drafted, 3, 20], [draftedReverse, 3, 15], [rotated, 3, 20]] as const) {
    const opened = readStudioDoc(JSON.stringify(doc));
    assert.ok('doc' in opened);
    assert.equal(currentFaceEndDistance(opened.doc, index), height);
  }
});

test('the target is a history dependency and stays outside the new body ownership chain', () => {
  const doc = documentAt(20);
  assert.deepEqual(parentsOf(recipe), [2]);
  assert.deepEqual(usesOf(recipe), [2, 1]);
  assert.deepEqual(bodyNodes(doc.nodes, 3), [3, 2]);
  assert.deepEqual(prefixDoc(doc, 4).outputs, doc.outputs);
  assert.deepEqual(renumber(recipe, index => index + 2), { ...recipe, sketch: 4, target: { ...recipe.target, body: { node: 3, side: 'solid' } } });
  const moved = moveFeature(doc, 1, 1);
  assert.ok('error' in moved);
  assert.match(moved.error, /cannot come first/i);
  assert.throws(() => duplicateBody(doc, { node: 3, side: 'solid' }, [5, 0, 0]), /duplicating a body with a bound end face/i);
});

test('the Extrude command binds a picked native cap and resets the pick when depth mode changes', () => {
  const doc = { ...prefixDoc(documentAt(20), 3), nextId: 3 };
  const evaluated = evaluateDoc(doc, 0);
  assert.ok(evaluated.ok);
  const ctx: Ctx = { doc, viewportEndFace: true, bodies: evaluated.bodies, selection: { sketches: [2], faces: [], edges: [], bodies: [] } };
  const cmd = extrudeCommand, defaults = cmd.defaults!(ctx);
  const depth = cmd.fields!(ctx).find(field => field.key === 'depth');
  assert.ok(depth?.kind === 'choice');
  assert.deepEqual(depth.options.map(option => option.value), ['distance', 'to-face']);
  const withoutViewport: Ctx = { doc, bodies: ctx.bodies, selection: ctx.selection };
  assert.deepEqual(cmd.fields!(withoutViewport).map(field => field.key), ['h', 'draft']);
  assert.deepEqual(cmd.fields!({ ...ctx, bodies: [] }).map(field => field.key), ['h', 'draft']);
  const legacy = cmd.build!(ctx, { ...defaults, h: 11, draft: 3 });
  assert.deepEqual(legacy.nodes[3], { id: 'n3', kind: 'extrude', sketch: 2, height: 11, draft: 3 });
  assert.equal(cmd.handles!(ctx, defaults).length, 1);

  const targetMode = patchValues(cmd, ctx, { ...defaults, h: 11, draft: 3 }, { depth: 'to-face' });
  assert.deepEqual(shownFields(cmd.fields!(ctx), targetMode).map(field => field.key), ['depth']);
  assert.deepEqual(cmd.handles!(ctx, targetMode), []);
  assert.throws(() => cmd.build!(ctx, targetMode), /original planar face/i);
  const bottom = ctx.bodies[0].mesh.faces.find(face => face.name === 'n1.bottom')!;
  const picked = cmd.onPick!(ctx, targetMode, { face: { body: 0, face: bottom.index }, edge: null });
  assert.ok(picked && !('error' in picked));
  const bound = cmd.build!(ctx, picked);
  assert.deepEqual(bound.nodes[3], recipe);
  assert.deepEqual(bound.outputs, documentAt(20).outputs);
  assert.throws(() => cmd.build!(ctx, { ...picked, op: 'cut' }), /new body/i);

  const back = patchValues(cmd, ctx, picked, { depth: 'distance' });
  assert.equal(back.endBody, undefined);
  assert.equal(back.endFace, undefined);
  assert.deepEqual(cmd.build!(ctx, back), legacy);

  const face = { body: 0, face: bottom.index };
  const attached: Ctx = { ...ctx, selection: { faces: [face], edges: [], bodies: [] } };
  const attachedDepth = cmd.fields!(attached).find(field => field.key === 'depth');
  assert.ok(attachedDepth?.kind === 'choice');
  assert.deepEqual(attachedDepth.options.map(option => option.value), ['distance', 'through']);
  assert.throws(() => cmd.build!(attached, picked), /supported finished profile/i);
});

test('a pinned Agent detach uses the native distance and retains downstream feature identity', async () => {
  const source = downwardDocument(8);
  const follower: ModelNode = { id: 'n4', kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [12, 0, 0] };
  const doc: StudioDoc = { ...source, nodes: [...source.nodes, follower],
    outputs: { b1: source.outputs.b1, b4: { node: 4, side: 'solid' } }, nextId: 5 };
  const original = evaluateDoc(doc, 0);
  assert.ok(original.ok);
  const state = { doc, bodies: original.bodies };
  const request = { action: 'edit', index: 3, expectedRevision: revisionOf(doc), values: { detachToDistance: true } };
  const noEvaluation = async () => assert.fail('Invalid detach requests must refuse before evaluating a candidate');
  for (const [args, reason] of [
    [{ ...request, expectedRevision: undefined }, /expectedRevision/],
    [{ ...request, expectedRevision: revisionOf(downwardDocument()) }, /part changed/],
    [{ ...request, index: 4 }, /active Extrude to face/],
    [{ ...request, values: { detachToDistance: true, height: 15 } }, /only values.detachToDistance/],
    [{ ...request, values: { detachToDistance: 12 } }, /set to true/],
    [{ ...request, sketchRound: {} }, /only values.detachToDistance/],
  ] as const) {
    const denied = await dispatchTool(state, 'features', args, noEvaluation);
    assert.equal(denied.isError, true, denied.content);
    assert.match(denied.content, reason);
    assert.equal(denied.state.doc, doc);
  }
  const evaluate = async (candidate: StudioDoc) => evaluateDoc(candidate, 1);
  const result = await dispatchTool(state, 'features', request, evaluate);
  assert.ok(!result.isError && result.changed, result.content);
  assert.deepEqual(result.state.doc.nodes[3], { kind: 'extrude', id: 'n3', sketch: 2, height: 12 });
  assert.deepEqual(result.state.doc.nodes[4], follower);
  assert.deepEqual(toPartDocument(result.state.doc), toPartDocument(doc));
});

test('detaching keeps the exact current distance and the feature identity used by later nodes', () => {
  const base = documentAt(30), downstream = {
    id: 'n4', kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 12],
  } as const;
  const bound: StudioDoc = {
    ...base, nodes: [...base.nodes, { ...downstream, offset: [...downstream.offset] }],
    outputs: { b1: base.outputs.b1, b4: { node: 4, side: 'solid' } }, nextId: 5,
  };
  assert.equal(currentFaceEndDistance(bound, 3), 30);
  assert.throws(() => currentFaceEndDistance(bound, 4), /active Extrude to face/i);
  assert.throws(() => currentFaceEndDistance(documentAt(-20), 3), /positive extrusion direction/i);
  assert.throws(() => detachFaceEndExtrude(recipe, NaN), /current exact distance/i);
  assert.throws(() => detachFaceEndExtrude(recipe, 0), /current exact distance/i);
  assert.throws(() => detachFaceEndExtrude({ ...recipe, suppressed: true }, 30), /current exact distance/i);
  const detached = detachFaceEndExtrude({ ...recipe, bought: false, held: 'old target' }, currentFaceEndDistance(bound, 3));
  assert.deepEqual(detached, { id: 'n3', kind: 'extrude', sketch: 2, height: 30, bought: false });
  assert.deepEqual(usesOf(detached), [2]);
  const replaced = { ...bound, nodes: bound.nodes.map((node, i) => i === 3 ? detached : node) };
  assert.deepEqual(toPartDocument(replaced), toPartDocument(bound));
  const moved = { ...replaced, nodes: replaced.nodes.map((node, i) => i === 1 && node.kind === 'extrude' ? { ...node, from: 40 } : node) };
  const part = toPartDocument(moved), outputs = evaluateCadPart(part).outputs;
  assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: 30 });
  assert.equal(outputs.find(output => output.id === 'n4')?.brep.vertices.length, 8);
  assert.ok(Math.abs(massPropertiesOf(outputs.find(output => output.id === 'n4')!).volume - 3000) < 1e-8);
});

function translatedDocument(origin: [number, number, number], travel: number): StudioDoc {
  const [x, y, z] = origin, doc = documentAt(z + travel);
  const [targetProfile, target, source] = doc.nodes;
  assert.ok(targetProfile.kind === 'sketch' && targetProfile.profile === 'rectangle');
  assert.ok(source.kind === 'sketch' && source.profile === 'rectangle');
  return {
    ...doc,
    nodes: [
      { ...targetProfile, min: [x - 5, y - 5], max: [x + 15, y + 15] }, target,
      { ...source, plane: { origin, normal: [0, 0, 1], xAxis: [1, 0, 0] } }, recipe,
    ],
  };
}

test('a common XY-plane translation preserves signed travel and the two native box oracles', () => {
  for (const origin of [[0, 0, 0], [12, -7, -100], [-25, 19, 15], [12, -7, -20]] as [number, number, number][]) {
    for (const travel of [20, 30]) {
      const [x, y, z] = origin, doc = translatedDocument(origin, travel), part = toPartDocument(doc);
      assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: travel });
      assert.equal(currentFaceEndDistance(doc, 3), travel);
      const { outputs } = evaluateCadPart(part);
      assert.deepEqual(outputs.map(output => output.id), ['n1', 'n3']);
      for (const [index, extent, lo, hi, volume, centerZ, cap, normalZ] of [
        [0, [-5, 15], travel, travel + 5, 2000, z + travel + 2.5, 'n1.bottom', -1],
        [1, [0, 10], 0, travel, 100 * travel, z + travel / 2, 'n3.top', 1],
      ] as const) {
        const output = outputs[index], mass = massPropertiesOf(output);
        assert.ok(checkOutput(output).valid);
        assert.equal(output.brep.faces.length, 6);
        assert.equal(output.brep.vertices.length, 8);
        const points = extent.flatMap(dx => extent.flatMap(dy => [lo, hi].map(dz => [x + dx, y + dy, z + dz])));
        assert.ok(points.every(point => output.brep.vertices.some(vertex => vertex.point.every((v, i) => v === point[i]))));
        const faces = output.brep.faces.filter(face => face.name === cap);
        assert.equal(faces.length, 1);
        const plane = faceGeometry(faces[0]);
        assert.ok(plane.kind === 'plane');
        assert.ok(Math.abs(plane.o[2] - (z + travel)) < 1e-8);
        assert.ok(Math.abs(plane.n[0]) < 1e-8 && Math.abs(plane.n[1]) < 1e-8 && Math.abs(plane.n[2] - normalZ) < 1e-8);
        assert.ok(Math.abs(mass.volume - volume) < 1e-8);
        assert.ok(mass.centroid.every((value, i) => Math.abs(value - [x + 5, y + 5, centerZ][i]) < 1e-8));
      }
    }
  }
});

test('the translated end uses world trim, exact raw axes and positive local travel', () => {
  const doc = translatedDocument([0, 0, 30], 20), source = doc.nodes[2];
  assert.ok(source.kind === 'sketch' && source.profile === 'rectangle' && source.plane);
  const plane = source.plane;
  const movedSource = (next: typeof plane) => ({ ...doc, nodes: doc.nodes.map((node, i) => i === 2 ? { ...source, plane: next } : node) });
  assert.throws(() => toPartDocument(movedSource({ ...plane, origin: [25, 0, 30] })), /entire projected profile/i);
  assert.throws(() => toPartDocument(movedSource({ ...plane, origin: [9998, 0, 30] })), /native coordinate range/i);
  assert.throws(() => toPartDocument(movedSource({ ...plane, origin: [10001, 0, 30] })), /translated XY plane/i);
  for (const next of [
    { ...plane, xAxis: [0, 1, 0] }, { ...plane, xAxis: [-1, 0, 0] }, { ...plane, xAxis: [2, 0, 0] },
    { ...plane, normal: [0, 1e-10, 1] },
  ] as (typeof plane)[]) assert.throws(() => toPartDocument(movedSource(next)), /translated XY plane/i);
  assert.throws(() => toPartDocument(movedSource({ ...plane, normal: [0, 0, -1] })), /original upper cap/i);
  for (const travel of [0, -10, 1e-8]) assert.throws(() => toPartDocument(translatedDocument([0, 0, 30], travel)), /positive extrusion direction/i);
});

test('a fractional translated source reaches the native cap within the linear tolerance', () => {
  const origin: [number, number, number] = [12.125, -7.25, -73.4], travel = 23.7;
  const doc = translatedDocument(origin, travel), part = toPartDocument(doc);
  const lowered = part.features[3];
  assert.ok(lowered.kind === 'extrude' && typeof lowered.height === 'number');
  assert.ok(Math.abs(lowered.height - travel) <= 1e-7);
  assert.ok(Math.abs(origin[2] + lowered.height - (origin[2] + travel)) <= 1e-7);
  const { outputs } = evaluateCadPart(part);
  assert.ok(outputs.every(output => checkOutput(output).valid));
  const cap = (output: typeof outputs[number], name: string) => {
    const face = output.brep.faces.find(face => face.name === name)!;
    const plane = faceGeometry(face);
    assert.ok(plane.kind === 'plane');
    return plane.o[2];
  };
  assert.ok(Math.abs(cap(outputs[0], 'n1.bottom') - cap(outputs[1], 'n3.top')) <= 1e-7);
  assert.ok(Math.abs(massPropertiesOf(outputs[1]).volume - 100 * travel) < 1e-8);
});

function cardinalDocument(travel: number): StudioDoc {
  const doc = documentAt(travel), [targetProfile, target, source] = doc.nodes;
  const plane = { origin: [-100, 12, -7], normal: [1, 0, 0], xAxis: [0, 1, 0] } as const;
  assert.ok(targetProfile.kind === 'sketch' && targetProfile.profile === 'rectangle');
  assert.ok(source.kind === 'sketch' && source.profile === 'rectangle');
  const sketchPlane = { origin: [...plane.origin], normal: [...plane.normal], xAxis: [...plane.xAxis] } as NonNullable<typeof source.plane>;
  return { ...doc, nodes: [{ ...targetProfile, plane: sketchPlane }, target, { ...source, plane: sketchPlane }, recipe] };
}

test('a common cardinal rotation preserves two strict native bodies and their opposing end faces', () => {
  for (const travel of [20, 30, 40]) {
    const doc = cardinalDocument(travel), part = toPartDocument(doc);
    assert.deepEqual(part.features[3], { id: 'n3', kind: 'extrude', sketch: 'n2', height: travel });
    assert.equal(currentFaceEndDistance(doc, 3), travel);
    const { outputs } = evaluateCadPart(part);
    assert.deepEqual(outputs.map(output => output.id), ['n1', 'n3']);
    for (const [index, extent, lo, hi, volume, centerX, cap, sense] of [
      [0, [-5, 15], travel, travel + 5, 2000, -100 + travel + 2.5, 'n1.bottom', -1],
      [1, [0, 10], 0, travel, 100 * travel, -100 + travel / 2, 'n3.top', 1],
    ] as const) {
      const output = outputs[index], mass = massPropertiesOf(output);
      assert.ok(checkOutput(output).valid);
      assert.equal(output.brep.faces.length, 6);
      assert.equal(output.brep.vertices.length, 8);
      const points = extent.flatMap(y => extent.flatMap(z => [lo, hi].map(x => [x - 100, y + 12, z - 7])));
      assert.ok(points.every(point => output.brep.vertices.some(vertex => vertex.point.every((v, i) => v === point[i]))));
      const faces = output.brep.faces.filter(face => face.name === cap);
      assert.equal(faces.length, 1);
      const plane = faceGeometry(faces[0]);
      assert.ok(plane.kind === 'plane');
      assert.ok(Math.abs(plane.o[0] - (travel - 100)) < 1e-8);
      assert.ok(plane.n.every((value, i) => Math.abs(value - (i === 0 ? sense : 0)) < 1e-8));
      assert.ok(Math.abs(mass.volume - volume) < 1e-8);
      assert.ok(mass.centroid.every((value, i) => Math.abs(value - [centerX, 17, -2][i]) < 1e-8));
    }
  }
});

test('the cardinal end maps asymmetric YZ trim and refuses wrong axes, faces and travel', () => {
  const doc = cardinalDocument(20), target = doc.nodes[0], source = doc.nodes[2];
  assert.ok(target.kind === 'sketch' && target.profile === 'rectangle');
  assert.ok(source.kind === 'sketch' && source.profile === 'rectangle' && source.plane);
  const plane = source.plane;
  const changed = (index: number, next: ModelNode) => ({ ...doc, nodes: doc.nodes.map((node, i) => i === index ? next : node) });
  for (const next of [
    { ...plane, xAxis: [0, 0, 1] }, { ...plane, xAxis: [0, -1, 0] },
    { ...plane, normal: [-1, 0, 0] }, { ...plane, normal: [1, 1e-13, 0] },
  ] as (typeof plane)[]) assert.throws(() => toPartDocument(changed(2, { ...source, plane: next })), /supported \+X-normal YZ plane/i);
  assert.throws(() => toPartDocument(changed(3, { ...recipe, target: { ...recipe.target, face: 'n1.top' } })), /normal must oppose/i);
  assert.throws(() => toPartDocument(changed(3, { ...recipe, target: { ...recipe.target, face: 'n1.side0' } })), /plane parallel to the sketch/i);
  for (const travel of [0, -10, 1e-8]) assert.throws(() => toPartDocument(cardinalDocument(travel)), /positive extrusion direction/i);

  const asymmetric = {
    ...doc,
    nodes: doc.nodes.map((node, index): ModelNode => index === 0 ? { ...target, min: [-1, -1], max: [11, 7] }
      : index === 2 ? { ...source, max: [10, 6] } : node),
  };
  const native = evaluateCadPart(toPartDocument(asymmetric)).outputs[1];
  assert.ok(checkOutput(native).valid);
  assert.ok(Math.abs(massPropertiesOf(native).volume - 1200) < 1e-8);
  const narrow = { ...asymmetric, nodes: asymmetric.nodes.map((node, index): ModelNode => index === 0 ? { ...target, min: [-1, -1], max: [11, 5] } : node) };
  assert.throws(() => toPartDocument(narrow), /entire projected profile/i);
});

test('a saved Distance converts in place to an earlier current end face and keeps downstream references', () => {
  const bound = documentAt(30);
  const fixed: ModelNode = { kind: 'extrude', id: 'n3', sketch: 2, height: 20, bought: false };
  const translate: ModelNode = { kind: 'translate', id: 'n4', parent: { node: 3, side: 'solid' }, offset: [20, 0, 0] };
  const doc: StudioDoc = {
    ...bound, nodes: [...bound.nodes.slice(0, 3), fixed, translate],
    outputs: { b1: bound.outputs.b1, b4: { node: 4, side: 'solid' } }, nextId: 5,
  };
  const command = editSavedExtrudeEndFaceCommand(doc, 3);
  assert.ok(command && command.onPick && command.build && command.defaults);
  const result = evaluateDoc(doc, 0);
  assert.ok(result.ok);
  const ctx: Ctx = { doc, bodies: result.bodies, selection: { faces: [], edges: [], bodies: [] } };
  const [target, downstream] = ctx.bodies;
  const pick = (body: number, name: string) => ({ face: { body, face: ctx.bodies[body].mesh.faces.find(face => face.name === name)!.index }, edge: null });
  const defaults = command.defaults(ctx);
  assert.equal(target.key, 'b1');
  assert.equal(downstream.key, 'b4');
  assert.throws(() => command.build!(ctx, defaults), /earlier current solid/i);
  const downstreamFace = downstream.mesh.faces.find(face => face.kind === 'plane')!;
  assert.match(String(command.onPick(ctx, defaults, pick(1, downstreamFace.name))?.error), /earlier current solid/i);
  const picked = command.onPick(ctx, defaults, pick(0, 'n1.bottom'));
  assert.ok(picked && !('error' in picked));
  assert.throws(() => command.build!({ ...ctx, doc: { ...doc } }, picked), /current extrusion feature/i);
  const candidate = command.build(ctx, picked);
  assert.deepEqual(candidate.nodes[3], { ...recipe, bought: false });
  assert.equal(candidate.nodes[4], translate);
  assert.equal(candidate.outputs, doc.outputs);
  assert.equal(candidate.nextId, doc.nextId);
  const { outputs } = evaluateCadPart(toPartDocument(candidate));
  assert.deepEqual(outputs.map(output => output.id), ['n1', 'n4']);
  assert.ok(outputs.every(output => checkOutput(output).valid));
  assert.ok(Math.abs(massPropertiesOf(outputs[1]).volume - 3000) < 1e-8);
  assert.deepEqual(usesOf(candidate.nodes[3]), [2, 1]);
});

test('saved Distance conversion requires a plain non-drafted, unshifted literal extrusion', () => {
  const bound = documentAt(20);
  const fixed: ModelNode = { kind: 'extrude', id: 'n3', sketch: 2, height: 12 };
  const draft = (node: ModelNode) => ({ ...bound, nodes: [...bound.nodes.slice(0, 3), node] });
  assert.equal(canEditSavedExtrudeEndFace(draft(fixed), 3), true);
  assert.equal(canEditSavedExtrudeEndFace(draft(fixed), 1), false);
  for (const node of [
    { ...fixed, height: { parameter: 'Height' } }, { ...fixed, draft: 5 }, { ...fixed, from: 1 },
    { ...fixed, from: { parameter: 'Start' } }, { ...fixed, suppressed: true },
  ] as ModelNode[]) assert.equal(editSavedExtrudeEndFaceCommand(draft(node), 3), null);
});

test('an existing bound end changes its sole target dependency without replacing its feature identity', () => {
  const first = documentAt(20);
  const targetA = recipe.target;
  const targetB = { body: { node: 3, side: 'solid' }, feature: 'n3', face: 'n3.bottom' } as const;
  const doc: StudioDoc = {
    ...first,
    nodes: [
      ...first.nodes.slice(0, 2),
      { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [-10, -10], max: [20, 20] },
      { id: 'n3', kind: 'extrude', sketch: 2, from: 30, height: 5 },
      { id: 'n4', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] },
      { id: 'n5', kind: 'face-end-extrude', sketch: 4, target: targetA },
    ],
    outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' }, b5: { node: 5, side: 'solid' } }, nextId: 6,
  };
  const command = editSavedExtrudeEndFaceCommand(doc, 5);
  assert.ok(command?.build && command.onPick && command.defaults);
  assert.equal(command.label, 'Change end face');
  const evaluated = evaluateDoc(doc, 0);
  assert.ok(evaluated.ok);
  const ctx: Ctx = { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [], bodies: [] } };
  const defaults = command.defaults(ctx);
  const face = (body: number, name: string) => ({ body, face: ctx.bodies[body].mesh.faces.find(face => face.name === name)!.index });
  const previous = command.onPick(ctx, defaults, { face: face(0, 'n1.bottom'), edge: null });
  assert.match(String(previous?.error), /already the end face/i);
  assert.throws(() => command.build!(ctx, { ...defaults, endBody: 0, endFace: 'n1.bottom' }), /already the end face/i);
  const picked = command.onPick(ctx, defaults, { face: face(1, 'n3.bottom'), edge: null });
  assert.ok(picked && !('error' in picked));
  const changed = command.build(ctx, picked);
  assert.deepEqual(changed.nodes[5], { id: 'n5', kind: 'face-end-extrude', sketch: 4, target: targetB });
  assert.deepEqual(usesOf(changed.nodes[5]), [4, 3]);
  assert.equal(changed.outputs, doc.outputs);
  assert.equal(changed.nextId, 6);
  assert.equal(currentFaceEndDistance(changed, 5), 30);
  const move = (source: StudioDoc, index: number, from: number): StudioDoc => ({
    ...source, nodes: source.nodes.map((node, i) => i === index && node.kind === 'extrude' ? { ...node, from } : node),
  });
  assert.equal(currentFaceEndDistance(move(changed, 1, 24), 5), 30);
  const moved = move(changed, 3, 40);
  assert.equal(currentFaceEndDistance(moved, 5), 40);
  const output = evaluateCadPart(toPartDocument(moved)).outputs.find(output => output.id === 'n5');
  assert.ok(output && checkOutput(output).valid);
  assert.ok(Math.abs(massPropertiesOf(output).volume - 4000) < 1e-8);
});

test('the bound end refuses a holed cap even when its bounds and the four source corners pass', () => {
  const doc = documentAt(20), target = doc.nodes[0];
  assert.ok(target.kind === 'sketch' && target.profile === 'rectangle');
  const withHole: StudioDoc = { ...doc, nodes: [
    { ...target, holes: [[{ kind: 'arc', start: [12, 5], center: [9, 5], direction: 'ccw' }]] },
    ...doc.nodes.slice(1),
  ] };
  const { outputs } = evaluateCadPart(toPartDocument(prefixDoc(withHole, 3)));
  const cap = outputs[0].brep.faces.find(face => face.name === 'n1.bottom');
  assert.ok(cap && checkOutput(outputs[0]).valid);
  assert.equal(cap.loops.length, 2);
  assert.ok(Math.abs(massPropertiesOf(outputs[0]).volume - (2000 - 45 * Math.PI)) < 1e-8);
  assert.throws(() => toPartDocument(withHole), /one convex straight trim .* without holes/i);
});

test('nonfinite profile input and a deleted target cannot use a fallback height or another face', () => {
  const doc = documentAt(20), source = doc.nodes[2];
  assert.ok(source.kind === 'sketch' && source.profile === 'rectangle');
  for (const bad of [NaN, Infinity, -Infinity]) {
    const malformed: StudioDoc = { ...doc, nodes: [doc.nodes[0], doc.nodes[1], { ...source, min: [bad, 0] }, recipe] };
    assert.throws(() => toPartDocument(malformed), /literal rectangle|finite|coordinate/i);
  }
  const direct = deleteFeature(doc, 1);
  assert.ok('error' in direct);
  assert.match(direct.error, /used by feature 3/i);
  assert.deepEqual(featureDependents(doc, 1), [3]);
  const explicit = deleteFeatures(doc, [1, 3]);
  assert.ok('doc' in explicit);
  assert.deepEqual(explicit.doc.nodes, []);
  assert.deepEqual(explicit.doc.outputs, {});

  const missing: StudioDoc = { ...doc, nodes: [doc.nodes[0], { ...doc.nodes[1], id: 'n9' }, source, recipe] };
  const read = readStudioDoc(JSON.stringify(missing));
  assert.ok('error' in read);
  assert.match(read.error, /target feature identity is missing, changed or ambiguous/i);
  assert.throws(() => toPartDocument(missing), /target feature identity is missing, changed or ambiguous/i);
  assert.deepEqual(doc.nodes[3], recipe);
});
