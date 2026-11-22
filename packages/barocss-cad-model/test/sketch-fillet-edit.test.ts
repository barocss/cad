import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '../src/engine/doc';
import { partSnapshot } from '../src/engine/part';
import { roundStraightCornerForEdit } from '../src/sketch/corner';
import { prepareStraightCornerBatch } from '../src/sketch/cornerBatch';
import { editFilletRadius, savedFilletRadius } from '../src/sketch/filletEdit';
import { profileOf } from '../src/sketch/loops';
import { arcOf, type P2 } from '../src/sketch/profile';
import { sketchShapes } from '../src/sketch/reopen';
import { commitDimension, type Polygon } from '../src/sketch/rules';
import { settleShape } from '../src/sketch/settle';

const near = (a: number, b: number, tolerance = 2e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const nearPoint = (a: P2, b: P2) => { near(a[0], b[0]); near(a[1], b[1]); };
const rectangle = (): Polygon => ({ kind: 'polygon', closed: true,
  points: [[0, 0], [40, 0], [40, 30], [0, 30]], hv: { h: [0, 2], v: [1, 3] },
  lengths: { 0: 40 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }], ids: ['e1', 'e2', 'e3', 'e4'] });
function rounded(source = rectangle(), corner = 2) {
  const result = roundStraightCornerForEdit(source, corner, 6);
  if ('error' in result) assert.fail(result.error);
  return result.shape;
}
function resized(source: Polygon, edge: number, value: number) {
  const result = editFilletRadius(source, edge, value);
  if ('error' in result) assert.fail(result.error);
  return result.shape;
}
function native(source: Polygon, expectedVolume?: number) {
  const saved = profileOf([source]);
  if ('error' in saved) assert.fail(saved.error);
  const shape = sketchShapes(saved.node).shape;
  assert.equal(shape?.kind, 'polygon');
  const body = partSnapshot(withNode(withNode(emptyDoc(), saved.node), { kind: 'extrude', sketch: 0, height: 10 })).outputs[0];
  assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
  if (expectedVolume !== undefined) near(massPropertiesOf(body).volume, expectedVolume);
  assert.deepEqual(shape.rules, source.rules); assert.deepEqual(shape.radii, source.radii);
  assert.deepEqual(shape.tangents, source.tangents); assert.deepEqual(shape.lengths, source.lengths);
  for (const id of saved.node.sideTags!.outer) assert.equal(body.brep.faces.filter(face => face.name === `n1.side[${id}]`).length, 1);
  for (let i = 0; i < source.points.length; i++) {
    const expected = savedFilletRadius(source, i); if (expected === undefined) continue;
    const id: string = saved.node.sideTags!.outer[i];
    const face = body.brep.faces.find(item => item.name === `n1.side[${id}]`);
    assert.ok(face);
    const cylinder = faceGeometry(face); assert.equal(cylinder.kind, 'cylinder'); near(cylinder.r, expected);
    const arc = arcOf(source.points[i], source.points[(i + 1) % source.points.length], source.bulges![i]);
    nearPoint([cylinder.c[0], cylinder.c[1]], arc.center);
    const edgeIds = new Set(body.brep.coedges.filter(use => face.loops.includes(use.loop)).map(use => use.edge));
    const vertexIds = new Set(body.brep.edges.filter(edge => edgeIds.has(edge.id)).flatMap(edge => edge.vertices));
    const bottom = body.brep.vertices.filter(vertex => vertexIds.has(vertex.id) && Math.abs(vertex.point[2]) < 1e-8);
    assert.equal(bottom.length, 2);
    for (const end of [source.points[i], source.points[(i + 1) % source.points.length]])
      assert.ok(bottom.some(vertex => Math.hypot(vertex.point[0] - end[0], vertex.point[1] - end[1]) <= 2e-6));
  }
  return { shape, body };
}

test('saved R6 to R8 retains x40/y30 carriers, endpoints, constraints and native side IDs', () => {
  const source = native(rounded()).shape, before = structuredClone(source);
  const generic = commitDimension(source, 'rad2', 8); assert.ok(generic.ok);
  assert.ok(Math.abs(generic.shape.points[4][1] - 30) > 0.1, 'generic constraint editing remains distinct');
  const shape = resized(source, 2, 8);
  assert.deepEqual(shape.points, [[0, 0], [40, 0], [40, 22], [32, 30], [0, 30]]);
  assert.deepEqual(shape.ids, ['e1', 'e2', 'e5', 'e3', 'e4']);
  assert.deepEqual(shape.ids, source.ids); assert.deepEqual(shape.rules, source.rules);
  assert.deepEqual(shape.hv, source.hv); assert.deepEqual(shape.lengths, source.lengths);
  assert.deepEqual(shape.tangents, source.tangents); assert.deepEqual(shape.bulges, source.bulges);
  assert.deepEqual(shape.radii, { 2: 8 }); assert.deepEqual(source, before);
  assert.equal(resized(source, 2, 6), source, 'same radius creates no edit');
  const settled = settleShape(shape, source); assert.equal(settled.error, null); assert.deepEqual(settled.shape, shape);
  const { shape: reopened, body } = native(shape, 12000 - 640 * (1 - Math.PI / 4));
  assert.deepEqual(reopened.ids, source.ids); assert.equal(savedFilletRadius(reopened, 2), 8);
  const right = faceGeometry(body.brep.faces.find(face => face.name === 'n1.side[e2]')!);
  const top = faceGeometry(body.brep.faces.find(face => face.name === 'n1.side[e3]')!);
  assert.equal(right.kind, 'plane'); assert.equal(top.kind, 'plane'); near(right.o[0], 40); near(top.o[1], 30);
  const back = native(resized(reopened, 2, 6), 12000 - 360 * (1 - Math.PI / 4)).shape;
  assert.deepEqual(back.points, source.points); assert.deepEqual(back.ids, source.ids);
});

test('one batch Fillet changes while its adjacent opposite-turn sibling retains radius, support and IDs', () => {
  const source: Polygon = { kind: 'polygon', closed: true,
    points: [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]],
    lengths: { 0: 60 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
    ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'] };
  const result = prepareStraightCornerBatch(source, 'fillet', [3, 4], 6);
  if ('error' in result) assert.fail(result.error);
  const before = structuredClone(result.shape), shape = resized(result.shape, 3, 8);
  assert.deepEqual(shape.points.slice(3, 7), [[46, 40], [38, 32], [38, 21], [32, 15]]);
  assert.equal(savedFilletRadius(shape, 3), 8); assert.equal(savedFilletRadius(shape, 5), 6);
  assert.deepEqual(shape.ids, before.ids); assert.deepEqual(shape.rules, before.rules);
  assert.deepEqual(shape.bulges, before.bulges); assert.deepEqual(result.shape, before);
  const opened = native(shape, 20000 - 280 * (1 - Math.PI / 4)).shape;
  assert.equal(savedFilletRadius(opened, 5), 6);
  const reflex = resized(before, 5, 8);
  assert.deepEqual(reflex.points.slice(3, 7), [[44, 40], [38, 34], [38, 23], [30, 15]]);
  native(reflex, 20000 + 280 * (1 - Math.PI / 4));
  for (const value of [19, 20, 25]) assert.ok('error' in editFilletRadius(before, 3, value));
});

test('orthogonal Fillet resizing works clockwise and with rotated direct perpendicular constraints', () => {
  const clockwise = rounded({ ...rectangle(), points: rectangle().points.map(([x, y]) => [x, y ? -y : 0]) });
  const reflected = resized(clockwise, 2, 8);
  assert.deepEqual(reflected.points, [[0, 0], [40, 0], [40, -22], [32, -30], [0, -30]]);
  assert.ok(reflected.bulges![2] < 0); native(reflected, 12000 - 640 * (1 - Math.PI / 4));
  const rotate = ([x, y]: P2): P2 => [(3 * x - 4 * y) / 5, (4 * x + 3 * y) / 5];
  for (const [a, b] of [[1, 2], [2, 1]]) {
    const source = rounded({ ...rectangle(), points: rectangle().points.map(rotate), hv: { h: [], v: [] },
      rules: [{ kind: 'perpendicular', a, b }, { kind: 'parallel', a: 0, b: 2 }, { kind: 'parallel', a: 1, b: 3 }] });
    const shape = resized(source, 2, 8);
    nearPoint(shape.points[2], rotate([40, 22])); nearPoint(shape.points[3], rotate([32, 30]));
    assert.deepEqual(shape.rules, source.rules); assert.deepEqual(shape.hv, source.hv);
    native(shape, 12000 - 640 * (1 - Math.PI / 4));
  }
});

test('invalid, consumed, conflicting and anchor-moving edits refuse without source changes', () => {
  const source = rounded(), before = structuredClone(source);
  for (const value of [NaN, Infinity, -1, 0, 0.009, 30, 35, 40, 50]) {
    assert.ok('error' in editFilletRadius(source, 2, value), String(value)); assert.deepEqual(source, before);
  }
  const conflicts: Polygon[] = [
    { ...source, rules: [...source.rules!, { kind: 'fix' as const, point: 2, at: [...source.points[2]] as P2 }] },
    { ...source, lengths: { ...source.lengths, 1: 24 } },
    { ...source, rules: [...source.rules!, { kind: 'dy' as const, a: 0, b: 4, value: 31 }] },
    { ...source, circles: [{ c: [38, 27], r: 0.3 }] },
  ];
  for (const shape of conflicts) {
    const original = structuredClone(shape);
    assert.ok('error' in editFilletRadius(shape, 2, 8), JSON.stringify(shape)); assert.deepEqual(shape, original);
  }
  const anchored = rounded({ ...rectangle(), rules: [], lengths: {} }, 0), anchorBefore = structuredClone(anchored);
  assert.equal(savedFilletRadius(anchored, 0), 6);
  assert.match((editFilletRadius(anchored, 0, 8) as { error: string }).error, /anchor/);
  assert.deepEqual(anchored, anchorBefore);
});

test('ordinary or unlocked arcs and unsupported saved recipes do not offer Fillet resizing', () => {
  const source = rounded();
  const cases: Polygon[] = [rectangle(), { ...source, radii: {} }, { ...source, tangents: [2] },
    { ...source, construction: true }, { ...source, closed: false }, { ...source, pending: true },
    { ...source, hv: { h: [], v: [] } }, { ...source, ids: ['e1', 'e2', 'e2', 'e3', 'e4'] },
    { ...source, bulges: source.bulges!.map((b, i) => i === 1 ? 0.1 : b) },
    { ...source, bulges: source.bulges!.map((b, i) => i === 2 ? -b : b) },
    { ...source, points: source.points.map((p, i) => i === 3 ? [33, 30] : p) },
  ];
  for (const shape of cases) {
    const before = structuredClone(shape); assert.equal(savedFilletRadius(shape, 2), undefined);
    assert.ok('error' in editFilletRadius(shape, 2, 8)); assert.deepEqual(shape, before);
  }
  for (const index of [-1, 0.5, 10]) assert.equal(savedFilletRadius(source, index), undefined);
});

test('remote circles stay fixed, resolvable small radii work, and nonincident arc tangency is refused', () => {
  const source: Polygon = { ...rounded(), circles: [{ c: [10, 10], r: 2 }], circleIds: ['e6'] };
  for (const radius of [0.02, 7.0000004]) {
    const shape = resized(source, 2, radius);
    assert.equal(savedFilletRadius(shape, 2), radius);
    assert.deepEqual(shape.circles, source.circles); assert.deepEqual(shape.circleIds, source.circleIds);
    nearPoint(shape.points[2], [40, 30 - radius]); nearPoint(shape.points[3], [40 - radius, 30]);
    native(shape, 10 * (1200 - radius * radius * (1 - Math.PI / 4) - 4 * Math.PI));
  }
  const theta = 40 * Math.PI / 180;
  const touching: Polygon = { kind: 'polygon', closed: true, points: [
    [20, 0], [0, 0], [0, 20], [-10, 20], [-10, -10], [30, -10], [30, 20], [15, 20], [15, 14],
    [10 - 10 * Math.sin(theta), 10 - 10 * Math.cos(theta)], [15, 9], [20, 9],
  ] };
  const prepared = rounded(touching, 1);
  // Restore the authored sub-grid tip: ordinary settlement rounds it away from exact contact.
  const roundedSource = { ...prepared, points: prepared.points.map((p, i) => i === 10 ? touching.points[9] : p) };
  const before = structuredClone(roundedSource);
  assert.equal(savedFilletRadius(roundedSource, 1), 6);
  assert.match((editFilletRadius(roundedSource, 1, 10) as { error: string }).error, /touch|cross/);
  assert.deepEqual(roundedSource, before);
});
