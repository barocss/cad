import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '../src/engine/doc';
import { partSnapshot } from '../src/engine/part';
import { canChamferWithTwoSetbacks, chamferCorner } from '../src/sketch/corner';
import { prepareStraightCornerBatch } from '../src/sketch/cornerBatch';
import { profileOf } from '../src/sketch/loops';
import { dragOutlinePoint } from '../src/sketch/pointDrag';
import { sketchShapes } from '../src/sketch/reopen';
import { solveShape, type Polygon } from '../src/sketch/rules';
import { settleShape } from '../src/sketch/settle';
import { ruleTerms } from '../src/sketch/terms';

const near = (a: number, b: number, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const rectangle = (): Polygon => ({ kind: 'polygon', closed: true,
  points: [[0, 0], [40, 0], [40, 30], [0, 30]], hv: { h: [0, 2], v: [1, 3] },
  lengths: { 2: 40 }, ids: ['e1', 'e2', 'e3', 'e4'] });
const notch = (): Polygon => ({ kind: 'polygon', closed: true,
  points: [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]],
  lengths: { 0: 60 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
  ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'] });

function created(source: Polygon, corner: number): Polygon {
  const result = chamferCorner(source, corner, 6);
  if ('error' in result) assert.fail(result.error);
  return result.shape;
}

test('two orthogonal Chamfer setbacks are measured in outline order and survive sketch serialization', () => {
  const source = rectangle(), before = structuredClone(source);
  assert.ok(canChamferWithTwoSetbacks(source, 1));
  for (const [first, second] of [[3, 4], [4, 3]]) {
    const result = chamferCorner(source, 1, first, second);
    if ('error' in result) assert.fail(result.error);
    assert.deepEqual(result.shape.points, [[0, 0], [40 - first, 0], [40, second], [40, 30], [0, 30]]);
    assert.equal(result.shape.lengths?.[1], 5);
    const saved = profileOf([result.shape]);
    if ('error' in saved) assert.fail(saved.error);
    const opened = sketchShapes(saved.node).shape;
    assert.equal(opened?.kind, 'polygon');
    assert.deepEqual(opened.lengths, result.shape.lengths);
    assert.deepEqual(opened.rules, result.shape.rules);
    const body = partSnapshot(withNode(withNode(emptyDoc(), saved.node), { kind: 'extrude', sketch: 0, height: 10 })).outputs[0];
    assert.ok(checkBrep(body.brep, { strict: true }).valid);
    near(massPropertiesOf(body).volume, 11940);
  }
  assert.deepEqual(source, before);
  assert.deepEqual(chamferCorner(source, 1, 5, 5), chamferCorner(source, 1, 5));
  assert.match(JSON.stringify(chamferCorner(source, 1, 3, 30)), /shorter than its edge/);
  assert.match(JSON.stringify(chamferCorner({ ...source, lengths: { 0: 40 } }, 1, 3, 4)), /trimmed lengths/);
  const unconstrained = { ...source, hv: { h: [], v: [] } };
  assert.equal(canChamferWithTwoSetbacks(unconstrained, 1), false);
  assert.match(JSON.stringify(chamferCorner(unconstrained, 1, 3, 4)), /perpendicular/);
});

test('two setbacks keep the same cyclic ownership at reflex and clockwise wraparound corners', () => {
  const reversed: Polygon = { kind: 'polygon', closed: true, points: [[0, 0], [0, 30], [40, 30], [40, 0]],
    hv: { h: [1, 3], v: [0, 2] } };
  for (const [source, corner, tips] of [
    [notch(), 4, [[38, 18], [34, 15]]],
    [reversed, 0, [[3, 0], [0, 4]]],
  ] as const) {
    const result = chamferCorner(source, corner, 3, 4);
    if ('error' in result) assert.fail(result.error);
    assert.deepEqual(result.shape.points.slice(corner, corner + 2), tips);
    const angle = result.shape.rules!.find(rule => rule.kind === 'angle');
    assert.ok(angle?.kind === 'angle');
    near(angle.value, 180 - Math.atan2(4, 3) * 180 / Math.PI);
    const term = ruleTerms([angle], result.shape.points, result.shape.bulges!).constraints[0];
    assert.equal(term.kind, 'signed-angle');
    if (term.kind === 'signed-angle') near(term.angle, -Math.atan2(4, 3));
  }
});

function nativeBevels(shape: Polygon, corners: readonly [number, number][], expectedVolume?: number) {
  const saved = profileOf([shape]);
  if ('error' in saved) assert.fail(saved.error);
  const opened = sketchShapes(saved.node).shape;
  assert.equal(opened?.kind, 'polygon');
  assert.deepEqual(opened.lengths, shape.lengths);
  assert.deepEqual(opened.rules, shape.rules);
  const body = partSnapshot(withNode(withNode(emptyDoc(), saved.node), { kind: 'extrude', sketch: 0, height: 2 })).outputs[0];
  assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
  if (expectedVolume !== undefined) near(massPropertiesOf(body).volume, expectedVolume, 1e-6);
  const ids = saved.node.sideTags!.outer;
  for (const id of ids) assert.equal(body.brep.faces.filter(face => face.name === `n1.side[${id}]`).length, 1);
  const nativeBottom = (i: number) => {
    const face = body.brep.faces.find(face => face.name === `n1.side[${ids[i]}]`);
    assert.ok(face); assert.equal(faceGeometry(face).kind, 'plane');
    const edgeIds = new Set(body.brep.coedges.filter(use => face.loops.includes(use.loop)).map(use => use.edge));
    const vertexIds = new Set(body.brep.edges.filter(edge => edgeIds.has(edge.id)).flatMap(edge => edge.vertices));
    const bottom = body.brep.vertices.filter(vertex => vertexIds.has(vertex.id) && Math.abs(vertex.point[2]) < 1e-8);
    assert.equal(bottom.length, 2);
    return bottom.map(vertex => vertex.point);
  };
  for (const [i, sign] of corners) {
    const bottom = nativeBottom(i), n = shape.points.length;
    const [p, end] = nativeBottom((i - 1 + n) % n), [q, other] = nativeBottom((i + 1) % n);
    const u = [end[0] - p[0], end[1] - p[1]], v = [other[0] - q[0], other[1] - q[1]];
    const cross = u[0] * v[1] - u[1] * v[0]; assert.ok(Math.abs(cross) > 1e-7);
    const along = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / cross;
    const support = [p[0] + along * u[0], p[1] + along * u[1]];
    // Reconstruct the sharp support intersection from native carrier walls, in any rotation.
    for (const point of bottom) near(Math.hypot(point[0] - support[0], point[1] - support[1]), 6, 2e-6);
    for (let j = 0; j < 2; j++) assert.ok(bottom.some(point => Math.hypot(
      point[0] - shape.points[i + j][0], point[1] - shape.points[i + j][1]) < 1e-7));
    const a = shape.points[(i - 1 + n) % n], b = shape.points[i], c = shape.points[i + 1];
    const incoming = [b[0] - a[0], b[1] - a[1]], bevel = [c[0] - b[0], c[1] - b[1]];
    near(Math.atan2(incoming[0] * bevel[1] - incoming[1] * bevel[0], incoming[0] * bevel[0] + incoming[1] * bevel[1]), sign * Math.PI / 4);
  }
  return opened;
}

test('orthogonal Chamfer holds both setbacks through legal Select drag and refuses isolated tip writes', () => {
  const source = rectangle(), before = structuredClone(source), shape = created(source, 1);
  assert.deepEqual(source, before);
  assert.deepEqual(shape.lengths, { 1: 6 * Math.SQRT2, 3: 40 });
  assert.deepEqual(shape.rules, [{ kind: 'angle', a: 0, b: 1, value: 135 }]);
  const solved = solveShape(shape); assert.ok(solved.ok); assert.equal(solved.rows - solved.rank, 0);
  for (const [i, target] of [[1, [28, 0]], [2, [40, 12]], [2, [40, 0]], [3, [40, -10]]] as const)
    assert.equal(dragOutlinePoint(shape, i, [...target]), null);
  const moved = dragOutlinePoint(shape, 3, [46, 40]); assert.ok(moved);
  assert.deepEqual(moved.points, [[0, 0], [34, 0], [40, 6], [40, 40], [0, 40]]);
  for (const key of ['ids', 'lengths', 'rules', 'hv'] as const) assert.deepEqual(moved[key], shape[key]);
  assert.equal(settleShape(moved, shape).error, null);
  const reopened = nativeBevels(moved, [[1, 1]], 3164);
  assert.equal(dragOutlinePoint(reopened, 2, [40, 12]), null);
  const again = dragOutlinePoint(reopened, 3, [42, 45]); assert.ok(again);
  nativeBevels(again, [[1, 1]], 3564);
});

test('reflex Chamfer and adjacent convex/reflex group retain signed setbacks after two-axis Select drag', () => {
  const single = created(notch(), 4), before = structuredClone(single);
  const moved = dragOutlinePoint(single, 4, [42, 26]); assert.ok(moved);
  near(moved.points[4][0], 42); near(moved.points[4][1], 26);
  nativeBevels(moved, [[4, -1]]);
  assert.deepEqual(single, before);
  const grouped = prepareStraightCornerBatch(notch(), 'chamfer', [3, 4], 6);
  if ('error' in grouped) assert.fail(grouped.error);
  const group = grouped.shape, groupBefore = structuredClone(group);
  const dragged = dragOutlinePoint(group, 3, [50, 44]); assert.ok(dragged);
  assert.equal(dragOutlinePoint(group, 3, [60, 44]), null, 'the incoming carrier would collapse');
  assert.equal(dragOutlinePoint(dragged, 3, [60, 44]), null);
  near(dragged.points[3][0], 50); near(dragged.points[3][1], 44);
  assert.deepEqual(dragged.ids, ['e1', 'e2', 'e3', 'e9', 'e4', 'e10', 'e5', 'e6', 'e7', 'e8']);
  assert.deepEqual(dragged.rules, [...notch().rules!, { kind: 'angle', a: 2, b: 3, value: 135 }, { kind: 'angle', a: 4, b: 5, value: 135 }]);
  nativeBevels(dragged, [[3, 1], [5, -1]]);
  assert.deepEqual(group, groupBefore);
});

test('clockwise and wraparound groups preserve carrier ownership and the opposite native angle sign', () => {
  const clockwise: Polygon = { kind: 'polygon', closed: true,
    points: [[0, 0], [0, 30], [40, 30], [40, 0]], ids: ['e4', 'e3', 'e2', 'e1'],
    hv: { h: [1, 3], v: [0, 2] } };
  const shape = created(clockwise, 0);
  assert.deepEqual(shape.rules, [{ kind: 'angle', a: 4, b: 0, value: 135 }]);
  const term = ruleTerms(shape.rules!, shape.points, shape.bulges!).constraints[0];
  assert.equal(term.kind, 'signed-angle'); if (term.kind === 'signed-angle') near(term.angle, -Math.PI / 4);
  const moved = dragOutlinePoint(shape, 2, [5, 40]); assert.ok(moved);
  nativeBevels(moved, [[0, -1]]);
  const grouped = prepareStraightCornerBatch({ ...notch(), lengths: undefined, rules: undefined }, 'chamfer', [0, 7], 6);
  if ('error' in grouped) assert.fail(grouped.error);
  assert.deepEqual(grouped.shape.rules, [{ kind: 'angle', a: 9, b: 0, value: 135 }, { kind: 'angle', a: 7, b: 8, value: 135 }]);
  const dragged = dragOutlinePoint(grouped.shape, 7, [26, 45]); assert.ok(dragged);
  nativeBevels(dragged, [[0, 1], [8, 1]]);
});

test('Chamfer keeps authored bindings and preserves the existing arbitrary-angle scope', () => {
  const source: Polygon = { ...rectangle(), rules: [{ kind: 'fix', point: 0, at: [0, 0] },
    { kind: 'dy', a: 0, b: 3, value: 30 }] };
  const shape = created(source, 1);
  assert.deepEqual(shape.rules, [{ kind: 'fix', point: 0, at: [0, 0] },
    { kind: 'dy', a: 0, b: 4, value: 30 }, { kind: 'angle', a: 0, b: 1, value: 135 }]);
  assert.deepEqual(shape.ids, ['e1', '', 'e2', 'e3', 'e4']);
  const oblique: Polygon = { kind: 'polygon', closed: true, points: [[0, 0], [20, 0], [0, 20]],
    hv: { h: [0], v: [2] }, ids: ['a', 'b', 'c'] };
  const result = chamferCorner(oblique, 1, 5); if ('error' in result) assert.fail(result.error);
  assert.deepEqual(result.shape.lengths, undefined); assert.deepEqual(result.shape.rules, undefined);
  const freeAxes = created({ ...rectangle(), hv: { h: [], v: [] } }, 1);
  assert.deepEqual(freeAxes.lengths, { 3: 40 }); assert.deepEqual(freeAxes.rules, undefined);
});

test('authored equal carriers and anchored dimensions retain their previous redundancy and bindings', () => {
  const dimensions: Record<number, number>[] = [{}, { 2: 40 }, { 3: 40 }, { 2: 40, 3: 40 }];
  for (const lengths of dimensions) {
    const source: Polygon = { ...rectangle(), points: [[0, 0], [40, 0], [40, 40], [0, 40]],
      lengths, rules: [{ kind: 'equal', a: 0, b: 1 }] };
    const before = structuredClone(source), shape = created(source, 1);
    assert.deepEqual(source, before);
    assert.deepEqual(shape.rules, [{ kind: 'equal', a: 0, b: 2 }, { kind: 'angle', a: 0, b: 1, value: 135 }]);
    const previous = solveShape(source), after = solveShape(shape);
    assert.ok(previous.ok && after.ok);
    assert.equal(after.rows - after.rank, previous.rows - previous.rank);
    nativeBevels(shape, [[1, 1]], 3164);
  }
});

test('a later Chamfer remaps a trimmed carrier already used by a bevel angle', () => {
  const first = created(rectangle(), 1), before = structuredClone(first), second = created(first, 0);
  assert.deepEqual(first, before);
  assert.deepEqual(second.rules, [{ kind: 'angle', a: 1, b: 2, value: 135 }, { kind: 'angle', a: 5, b: 0, value: 135 }]);
  assert.deepEqual(second.lengths, { 0: 6 * Math.SQRT2, 2: 6 * Math.SQRT2, 4: 40 });
  assert.deepEqual(second.ids, ['', 'e1', '', 'e2', 'e3', 'e4']);
  const moved = dragOutlinePoint(second, 4, [44, 40]); assert.ok(moved);
  nativeBevels(moved, [[0, 1], [2, 1]], 3128);
});

test('an authored perpendicular pair keeps both native setbacks after rotated drag and reopen without HV locks', () => {
  const rotate = ([x, y]: readonly [number, number]): [number, number] => [(3 * x - 4 * y) / 5, (4 * x + 3 * y) / 5];
  for (const [a, b] of [[0, 1], [1, 0]]) {
    const source: Polygon = { ...rectangle(), points: rectangle().points.map(rotate), hv: { h: [], v: [] },
      rules: [{ kind: 'perpendicular', a, b }, { kind: 'parallel', a: 0, b: 2 }, { kind: 'parallel', a: 1, b: 3 }] };
    const before = structuredClone(source), shape = created(source, 1);
    assert.deepEqual(source, before);
    assert.deepEqual(shape.hv, { h: [], v: [] });
    assert.deepEqual(shape.rules, [{ kind: 'perpendicular', a: a === 0 ? 0 : 2, b: b === 0 ? 0 : 2 },
      { kind: 'parallel', a: 0, b: 3 }, { kind: 'parallel', a: 2, b: 4 }, { kind: 'angle', a: 0, b: 1, value: 135 }]);
    assert.deepEqual(shape.lengths, { 1: 6 * Math.SQRT2, 3: 40 });
    const moved = dragOutlinePoint(shape, 3, rotate([40, 40])); assert.ok(moved);
    near(moved.points[3][0], -8); near(moved.points[3][1], 56);
    assert.deepEqual(moved.rules, shape.rules); assert.deepEqual(moved.ids, shape.ids);
    const reopened = nativeBevels(moved, [[1, 1]], 3164);
    assert.deepEqual(reopened.hv, { h: [], v: [] });
    const again = dragOutlinePoint(reopened, 3, rotate([40, 45])); assert.ok(again);
    near(again.points[3][0], -12); near(again.points[3][1], 59);
    nativeBevels(again, [[1, 1]], 3564);
  }
});
