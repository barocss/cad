import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, massPropertiesOf, brepMassProperties, checkBrep, faceGeometry, saveCadPart, loadCadPart } from '../dist/index.js';

const movingFace = 'n1.side0', fixedEdge = 'n1.side0|n1.top';
const close = (a, b, label, tolerance = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const samePoint = (a, b) => a.every((value, axis) => Math.abs(value - b[axis]) <= 1e-9);

// Independent right-handed world coordinates: no kernel transform, mass or generated mesh is an oracle.
function pointAfter(point, features, direction = false) {
  let [x, y, z] = point;
  for (const feature of features) {
    if (feature.kind === 'translate') {
      if (!direction) { x += feature.offset[0]; y += feature.offset[1]; z += feature.offset[2]; }
      continue;
    }
    const [px, py, pz] = direction ? [0, 0, 0] : feature.pivot ?? [0, 0, 0];
    const angle = feature.angle * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    x -= px; y -= py; z -= pz;
    if (feature.axis === 'x') [y, z] = [c * y - s * z, s * y + c * z];
    else if (feature.axis === 'y') [x, z] = [c * x + s * z, -s * x + c * z];
    else [x, y] = [c * x - s * y, s * x + c * y];
    x += px; y += py; z += pz;
  }
  return [x, y, z];
}

function document(placements, angle = 12) {
  let target = 'n1';
  const transforms = placements.map((feature, index) => {
    const id = `m${index}`, node = { ...feature, id, target }; target = id; return node;
  });
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [4, -3], max: [44, 17] },
    { id: 'n1', kind: 'extrude', sketch: 'n0', from: 6, height: 12 },
    ...transforms, { id: 'pivot', kind: 'draft', target, faces: [movingFace], hingeEdge: fixedEdge, angle },
  ] };
}

function prove(input, placements) {
  const before = structuredClone(input), prefix = { ...input, features: input.features.slice(0, -1) };
  const source = evaluateCadPart(prefix), original = source.outputs[0].brep;
  const snapshot = evaluateCadPart(input), output = snapshot.outputs[0], brep = output.brep;
  const check = checkBrep(brep, { strict: true });
  assert.equal(check.valid, true, JSON.stringify(check.issues));
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(check.topology[0].genus, 0);
  assert.equal(brep.shells[0].closed, true);
  for (const key of ['bodies', 'shells', 'loops']) assert.deepEqual(brep[key], original[key]);
  assert.deepEqual(brep.faces.map(face => [face.id, face.name, face.loops]), original.faces.map(face => [face.id, face.name, face.loops]));
  assert.deepEqual(brep.edges.map(edge => [edge.id, edge.name, edge.curve.id, edge.vertices]), original.edges.map(edge => [edge.id, edge.name, edge.curve.id, edge.vertices]));
  const hinge = original.edges.find(edge => edge.name === fixedEdge);
  assert.ok(hinge);
  assert.deepEqual(brep.edges.find(edge => edge.name === fixedEdge), hinge, 'full current-world hinge record unchanged');
  const uses = b => b.coedges.filter(use => use.edge === hinge.id).map(use => [use.id, use.edge, use.sense, use.loop, use.next, use.prev]);
  assert.deepEqual(uses(brep), uses(original));
  for (const id of hinge.vertices) assert.deepEqual(brep.vertices.find(vertex => vertex.id === id), original.vertices.find(vertex => vertex.id === id));
  assert.equal(brep.vertices.filter(vertex => original.vertices.some(before => before.id === vertex.id
    && before.point.every((value, axis) => value === vertex.point[axis]))).length, 6, 'all six fixed corners retain their exact world coordinates');
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  for (const edge of brep.edges) {
    assert.equal(edge.curve.degree, 1);
    assert.deepEqual(edge.curve.controlPoints, edge.vertices.map(id => vertices.get(id)), 'native poles exactly equal ordered native endpoints');
  }

  const angle = input.features.at(-1).angle, t = Math.tan(angle * Math.PI / 180), width = 40, depth = 20, height = 12;
  const expectedPoints = [];
  for (const x of [4, 44]) for (const y of [-3, 17]) for (const z of [6, 18])
    expectedPoints.push(pointAfter([x, y === -3 ? y + (18 - z) * t : y, z], placements));
  for (const point of expectedPoints) assert.equal(brep.vertices.filter(vertex => samePoint(vertex.point, point)).length, 1, `world corner ${point}`);
  const volume = width * height * (depth - height * t / 2);
  const removed = width * height ** 2 * t / 2, originalVolume = width * depth * height;
  const centroid = pointAfter([24, (originalVolume * 7 - removed * (-3 + height * t / 3)) / volume,
    (originalVolume * 12 - removed * 10) / volume], placements);
  const mass = massPropertiesOf(output);
  close(mass.volume, volume, 'independent world volume', 1e-7);
  mass.centroid.forEach((value, axis) => close(value, centroid[axis], `independent world centroid ${axis}`));
  const nativeMass = brepMassProperties(brep, 1);
  close(nativeMass.volume, volume, 'native B-rep volume', 1e-7);
  const geometry = faceGeometry(brep.faces.find(face => face.name === movingFace));
  assert.equal(geometry.kind, 'plane');
  const normal = pointAfter([0, -1 / Math.hypot(1, t), -t / Math.hypot(1, t)], placements, true);
  normal.forEach((value, axis) => close(geometry.n[axis], value, `independent world normal ${axis}`));
  for (const id of hinge.vertices) close(vertices.get(id).reduce((gap, value, axis) => gap + (value - geometry.o[axis]) * normal[axis], 0), 0, 'fixed hinge on turned world support');
  assert.deepEqual(input, before, 'caller document unchanged');
  assert.deepEqual(reevaluate(source, { document: input }).outputs[0].brep, brep);
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  return brep;
}

test('omitted hinge pull derives original support after arbitrary X/Y/Z Rotate with Move on both sides', () => {
  for (const axis of ['x', 'y', 'z']) for (const turn of [31, -27, 90, 0]) for (const angle of [12, -12]) {
    const placements = [
      { kind: 'translate', offset: [-9, 11, 7] },
      { kind: 'rotate', axis, angle: turn, pivot: [3, -7, 13] },
      { kind: 'translate', offset: [80, -23, 14] },
    ];
    prove(document(placements, angle), placements);
  }
});

test('multiple authored Rotate axes retain the fixed world edge and an independent world shape', () => {
  const placements = [
    { kind: 'rotate', axis: 'z', angle: 23, pivot: [2, 3, -5] },
    { kind: 'translate', offset: [19, -11, 7] },
    { kind: 'rotate', axis: 'x', angle: -37, pivot: [-8, 5, 11] },
    { kind: 'rotate', axis: 'y', angle: 41, pivot: [9, -13, 17] },
  ];
  for (const angle of [12, -12]) prove(document(placements, angle), placements);
});

test('all six original pull-start supports derive the correct signed turn after oblique Rotate', () => {
  const placements = [
    { kind: 'rotate', axis: 'x', angle: 29, pivot: [3, -7, 13] },
    { kind: 'translate', offset: [19, -11, 7] },
    { kind: 'rotate', axis: 'y', angle: -41, pivot: [-8, 5, 11] },
  ];
  for (const [face, support, axis, boundary, normal, pullAxis, start, sign, length, thickness, hingeLength] of [
    ['n1.side0', 'n1.side3', 1, -3, -1, 0, 4, 1, 40, 20, 12],
    ['n1.side0', 'n1.side1', 1, -3, -1, 0, 44, -1, 40, 20, 12],
    ['n1.side1', 'n1.side0', 0, 44, 1, 1, -3, 1, 20, 40, 12],
    ['n1.side1', 'n1.side2', 0, 44, 1, 1, 17, -1, 20, 40, 12],
    ['n1.side1', 'n1.bottom', 0, 44, 1, 2, 6, 1, 12, 40, 20],
    ['n1.side1', 'n1.top', 0, 44, 1, 2, 18, -1, 12, 40, 20],
  ]) for (const angle of [12, -12]) {
    const input = document(placements, angle), recipe = input.features.at(-1);
    recipe.faces = [face]; recipe.hingeEdge = [face, support].sort().join('|');
    const original = evaluateCadPart({ ...input, features: input.features.slice(0, -1) }).outputs[0].brep;
    const output = evaluateCadPart(input).outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true });
    assert.equal(report.valid, true, JSON.stringify(report.issues));
    const hinge = original.edges.find(edge => edge.name === recipe.hingeEdge);
    assert.deepEqual(brep.edges.find(edge => edge.name === recipe.hingeEdge), hinge);
    for (const id of hinge.vertices) assert.deepEqual(brep.vertices.find(vertex => vertex.id === id), original.vertices.find(vertex => vertex.id === id));
    const t = Math.tan(angle * Math.PI / 180);
    for (const x of [4, 44]) for (const y of [-3, 17]) for (const z of [6, 18]) {
      const point = [x, y, z], station = (point[pullAxis] - start) * sign;
      if (point[axis] === boundary) point[axis] -= normal * station * t;
      const expected = pointAfter(point, placements);
      assert.equal(brep.vertices.filter(vertex => samePoint(vertex.point, expected)).length, 1, `${support}: ${expected}`);
    }
    close(brepMassProperties(brep, 1).volume, hingeLength * length * (thickness - length * t / 2), `support ${support} native volume`, 1e-7);
  }
});

test('new omitted-pull mode does not alter existing default or explicit world-axis behavior', () => {
  const rotation = [{ kind: 'rotate', axis: 'x', angle: 31, pivot: [3, -7, 13] }];
  const rotated = document(rotation);
  const explicit = structuredClone(rotated); explicit.features.at(-1).pull = '-z';
  assert.throws(() => evaluateCadPart(explicit), error => error.code === 'CAPABILITY' && /original rectangular extrusion/.test(error.message));
  const noRotation = document([{ kind: 'translate', offset: [9, -11, 7] }]);
  assert.throws(() => evaluateCadPart(noRotation), error => error.code === 'INPUT' && /explicit pull/.test(error.message));
  noRotation.features.at(-1).pull = '-z';
  assert.equal(checkBrep(evaluateCadPart(noRotation).outputs[0].brep, { strict: true }).valid, true);
  const ordinary = document([]); delete ordinary.features.at(-1).hingeEdge;
  const explicitDefault = structuredClone(ordinary); explicitDefault.features.at(-1).pull = 'z';
  assert.deepEqual(evaluateCadPart(ordinary).outputs[0].brep, evaluateCadPart(explicitDefault).outputs[0].brep);
});

test('rotated hinge mode refuses wrong edges, unsupported ancestry and collapse without mutating input', () => {
  const placements = [{ kind: 'rotate', axis: 'y', angle: 31, pivot: [3, -7, 13] }];
  const check = (input, code, message) => {
    const before = structuredClone(input);
    assert.throws(() => evaluateCadPart(input), error => error.code === code && message.test(error.message));
    assert.deepEqual(input, before);
  };
  const wrong = document(placements); wrong.features.at(-1).hingeEdge = 'n1.side2|n1.top';
  check(wrong, 'SELECTION', /belong to the selected original face/);
  const missing = document(placements); missing.features.at(-1).hingeEdge = 'missing';
  check(missing, 'REFERENCE', /missing or ambiguous/);
  const neutral = document(placements); neutral.features.at(-1).neutral = 0;
  check(neutral, 'INPUT', /needs one edge/);
  for (const unsupported of [
    { kind: 'scale', target: 'n1', factor: 1 },
    { kind: 'mirror', target: 'n1', plane: 'yz', keep: false },
    { kind: 'hole', target: 'n1', center: [24, 7], radius: 2 },
  ]) {
    const input = document(placements);
    input.features.splice(2, 0, { id: 'unsupported', ...unsupported });
    input.features[3].target = 'unsupported';
    check(input, 'INPUT', /explicit pull/);
  }
  const draftedRoot = document(placements); draftedRoot.features[1].draft = 2;
  check(draftedRoot, 'INPUT', /explicit pull/);
  const circular = document(placements); circular.features[0] = { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 20 };
  check(circular, 'INPUT', /explicit pull/);
  const collapsed = document(placements, 40); collapsed.features[0].max[1] = 1;
  check(collapsed, 'GEOMETRY', /closes a box wall/);
  const overflow = document([{ kind: 'rotate', axis: 'z', angle: 0 }, { kind: 'translate', offset: [0, -9990, 0] }], -40);
  check(overflow, 'PARAMETER', /modeling coordinate range/);
});
