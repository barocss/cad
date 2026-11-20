import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart } from '../dist/index.js';
import { oracle } from '../scripts/rb/fuzz-oracle.mjs';

const walls = [
  { face: 'stock.side0', axis: 1, sign: -1 },
  { face: 'stock.side1', axis: 0, sign: 1 },
  { face: 'stock.side2', axis: 1, sign: 1 },
  { face: 'stock.side3', axis: 0, sign: -1 },
];
const seed = 0x1457a11;
const samples = 16;

function drawCases() {
  let state = seed;
  const pick = n => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return Math.floor(state * n / 0x100000000);
  };
  return Array.from({ length: samples }, (_, index) => {
    const min = [-6 + pick(49) / 4, -6 + pick(49) / 4];
    const width = 36 + pick(41) / 4, depth = 28 + pick(41) / 4, height = 8 + pick(41) / 4;
    const max = [min[0] + width, min[1] + depth];
    const bores = [
      { center: [min[0] + 8 + pick(13) / 4, min[1] + 8 + pick(13) / 4], radius: 1.5 + pick(7) / 4 },
      { center: [max[0] - 8 - pick(13) / 4, max[1] - 8 - pick(13) / 4], radius: 1.5 + pick(7) / 4 },
    ].slice(0, (index >>> 2) % 2 + 1);
    const distance = (index < samples / 2 ? 1 : -1) * (1 + pick(13) / 4);
    return { min, max, height, bores, distance, wall: walls[index % walls.length] };
  });
}

function plateDoc({ min, max, height, bores }) {
  const features = [
    { id: 'sketch', kind: 'sketch', profile: 'rectangle', min, max },
    { id: 'stock', kind: 'extrude', sketch: 'sketch', height },
  ];
  for (const [index, bore] of bores.entries()) {
    features.push({ id: 'bore' + index, kind: 'hole', target: features.at(-1).id, face: 'stock.top', ...bore });
  }
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features };
}

function checkIndependentVolume(brep, min, max, height, bores) {
  const dimensions = max.map((value, k) => value - min[k]);
  let tree = { leaf: { kind: 'box', w: dimensions[0], d: dimensions[1], h: height, move: [...min, 0] } };
  for (const { center, radius } of bores) {
    tree = { op: 'subtract', a: tree, b: { leaf: { kind: 'cyl', r: radius, h: height, move: [...center, 0] } } };
  }
  const expected = (dimensions[0] * dimensions[1] - bores.reduce((area, { radius }) => area + Math.PI * radius ** 2, 0)) * height;
  const actual = brepMassProperties(brep, 1).volume;
  assert.ok(Math.abs(actual - expected) < 1e-7, `analytic volume ${actual} != ${expected}`);
  const rays = oracle(tree, 128, 8), error = Math.abs(actual - rays.volumeMM3);
  assert.ok(error <= rays.e, `ray volume error ${error} exceeds ${rays.e}`);
  return error / rays.e;
}

test('seeded signed outer-wall moves and their inverse retain volume, names and exact topology', t => {
  let maximumRayBoundUse = 0;
  for (const [index, input] of drawCases().entries()) {
    const { min, max, height, bores, distance, wall: { face, axis, sign } } = input;
    const doc = plateDoc(input), target = doc.features.at(-1).id, baseline = structuredClone(doc);
    const move = { id: 'move', kind: 'offset-face', target, face, distance };
    const reverse = { ...move, id: 'reverse', target: 'move', distance: -distance };
    const evaluate = (...edits) => evaluateCadPart({ ...doc, features: [...doc.features, ...edits] }).outputs[0].brep;
    const source = evaluate(), moved = evaluate(move), restored = evaluate(move, reverse);
    const movedMin = [...min], movedMax = [...max];
    (sign === 1 ? movedMax : movedMin)[axis] += sign * distance;
    for (const shape of [source, moved, restored]) {
      const check = checkBrep(shape, { strict: true });
      assert.ok(check.valid, `case ${index}: ${check.issues.join(', ')}`);
      assert.equal(check.topology[0].genus, bores.length);
      assert.deepEqual(shape.faces.map(({ id, name }) => [id, name]), source.faces.map(({ id, name }) => [id, name]));
    }
    assert.deepEqual(restored, source, `case ${index}: exact inverse`);
    assert.deepEqual(doc, baseline);
    maximumRayBoundUse = Math.max(maximumRayBoundUse,
      checkIndependentVolume(moved, movedMin, movedMax, height, bores),
      checkIndependentVolume(restored, min, max, height, bores));
  }
  t.diagnostic(`seed=${seed}, samples=${samples}, ray comparisons=${2 * samples}, max fraction of ray bound=${maximumRayBoundUse}`);
});
