import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, faceGeometry } from '@barocss/cad';
import { emptyDoc, withNode } from '../src/engine/doc';
import { partSnapshot } from '../src/engine/part';
import { prepareStraightCornerBatch } from '../src/sketch/cornerBatch';
import { profileOf } from '../src/sketch/loops';
import { arcOf } from '../src/sketch/profile';
import type { Polygon } from '../src/sketch/rules';
import { settleShape } from '../src/sketch/settle';

const notch: Polygon = {
  kind: 'polygon', closed: true,
  points: [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]],
  ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'],
  lengths: { 0: 60 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
};

const operations = ['fillet', 'chamfer'] as const;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

for (const operation of operations) {
  test(`batch ${operation} uses one size on convex and reflex corners and keeps the native wall owners`, () => {
    const before = structuredClone(notch);
    const result = prepareStraightCornerBatch(notch, operation, [4, 3], 6);
    if ('error' in result) assert.fail(result.error);
    const { shape } = result;
    assert.deepEqual(result, prepareStraightCornerBatch(notch, operation, [3, 4], 6));
    assert.deepEqual(notch, before);
    assert.deepEqual(shape.ids, ['e1', 'e2', 'e3', 'e9', 'e4', 'e10', 'e5', 'e6', 'e7', 'e8']);
    assert.deepEqual(shape.points.slice(3, 7), [[44, 40], [38, 34], [38, 21], [32, 15]]);
    assert.deepEqual(shape.lengths, notch.lengths);
    assert.deepEqual(shape.rules, notch.rules);
    const applied = settleShape(shape, notch);
    assert.equal(applied.error, null);
    assert.deepEqual(applied.shape, shape);
    const profile = profileOf([shape]);
    if ('error' in profile) assert.fail(profile.error);
    assert.deepEqual(profile.node.sideTags?.outer, shape.ids);
    const [body] = partSnapshot(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })).outputs;
    assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
    for (const id of shape.ids!) assert.equal(body.brep.faces.filter(face => face.name === `n1.side[${id}]`).length, 1, id);
    for (const [index, id, x, y, sign] of [[3, 'e9', 44, 34, 1], [5, 'e10', 32, 21, -1]] as const) {
      const face = body.brep.faces.find(item => item.name === `n1.side[${id}]`);
      assert.ok(face);
      const geometry = faceGeometry(face);
      if (operation === 'chamfer') {
        assert.equal(geometry.kind, 'plane');
        assert.equal(shape.bulges![index], 0);
        continue;
      }
      const arc = arcOf(shape.points[index], shape.points[index + 1], shape.bulges![index]);
      near(arc.radius, 6);
      near(arc.sweep, sign * Math.PI / 2);
      assert.equal(geometry.kind, 'cylinder');
      near(geometry.c[0], x);
      near(geometry.c[1], y);
      near(Math.abs(geometry.a[2]), 1);
      near(geometry.r, 6);
    }
  });

  test(`batch ${operation} refuses shared-edge consumption and constrained or touching corners without changes`, () => {
    const constrained: Polygon = { ...notch, rules: [{ kind: 'fix', point: 4, at: [38, 15] }] };
    const crossed: Polygon = { kind: 'polygon', closed: true,
      points: [[0, 0], [10, 0], [10, 10], [8, 10], [8, 2], [2, 2], [2, 10], [0, 10]] };
    for (const [source, selected, value, error] of [
      [notch, [3, 4], 15, /shared edge/],
      [notch, [4, 3], 12.5, /shared edge/],
      [notch, [3, 4], 12.49998, /shared edge/],
      [constrained, [3, 4], 6, /constraint/],
      [crossed, [1, 6], 8, /touch/],
    ] as const) {
      const before = structuredClone(source);
      const result = prepareStraightCornerBatch(source, operation, selected, value);
      assert.ok('error' in result);
      assert.match(result.error, error);
      assert.deepEqual(source, before);
    }
  });
}

test('batch edits handle the wraparound side and allocate only missing and inserted IDs', () => {
  const source: Polygon = { ...notch, lengths: undefined, rules: undefined,
    ids: ['', 'e2', 'e3', 'shoulder', 'e5', 'e6', 'e7', 'e8'] };
  const result = prepareStraightCornerBatch(source, 'fillet', [7, 0, 7], 6, 25);
  if ('error' in result) assert.fail(result.error);
  assert.deepEqual(result.shape.ids, ['e26', 'e25', 'e2', 'e3', 'shoulder', 'e5', 'e6', 'e7', 'e27', 'e8']);
  assert.deepEqual(result.shape.points.slice(0, 2), [[0, 6], [6, 0]]);
  assert.deepEqual(result.shape.points.slice(-2), [[6, 40], [0, 34]]);
  assert.equal(source.ids![0], '');
  const exhausted = prepareStraightCornerBatch(source, 'fillet', [0, 7], 6, Number.MAX_SAFE_INTEGER - 2);
  assert.ok('error' in exhausted);
  assert.match(exhausted.error, /IDs/);
  const duplicate: Polygon = { ...source, ids: ['e2', ...source.ids!.slice(1)] };
  const ambiguous = prepareStraightCornerBatch(duplicate, 'chamfer', [0, 7], 6);
  assert.ok('error' in ambiguous);
  assert.match(ambiguous.error, /IDs/);
  const sparse: Polygon = { ...source, ids: Array<string>(8) };
  const missing = prepareStraightCornerBatch(sparse, 'chamfer', [0, 7], 6);
  assert.ok('error' in missing);
  assert.match(missing.error, /IDs/);
  const fresh = prepareStraightCornerBatch({ ...source, ids: undefined }, 'chamfer', [0, 7], 6);
  if ('error' in fresh) assert.fail(fresh.error);
  assert.deepEqual(fresh.shape.ids, ['e9', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e10', 'e8']);
});
