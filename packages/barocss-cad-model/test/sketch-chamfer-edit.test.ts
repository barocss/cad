import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '../src/engine/doc';
import { partSnapshot } from '../src/engine/part';
import { editChamferSetback, editChamferSetbacks, savedChamferSetback } from '../src/sketch/chamferEdit';
import { chamferCorner } from '../src/sketch/corner';
import { prepareStraightCornerBatch } from '../src/sketch/cornerBatch';
import { profileOf } from '../src/sketch/loops';
import { dragOutlinePoint } from '../src/sketch/pointDrag';
import { sketchShapes } from '../src/sketch/reopen';
import { type Polygon } from '../src/sketch/rules';
import { settleShape } from '../src/sketch/settle';

const near = (a: number, b: number, tolerance = 2e-6) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const rectangle = (): Polygon => ({ kind: 'polygon', closed: true,
  points: [[0, 0], [40, 0], [40, 30], [0, 30]], hv: { h: [0, 2], v: [1, 3] },
  lengths: { 2: 40 }, ids: ['e1', 'e2', 'e3', 'e4'] });
const notch = (): Polygon => ({ kind: 'polygon', closed: true,
  points: [[0, 0], [60, 0], [60, 40], [38, 40], [38, 15], [22, 15], [22, 40], [0, 40]],
  lengths: { 0: 60 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
  ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'] });
function bevel(source = rectangle(), corner = 1) {
  const result = chamferCorner(source, corner, 6);
  if ('error' in result) assert.fail(result.error);
  return result.shape;
}
function resized(source: Polygon, edge: number, value: number) {
  const result = editChamferSetback(source, edge, value);
  if ('error' in result) assert.fail(result.error);
  return result.shape;
}
function native(source: Polygon, expectedVolume?: number, height = 2) {
  const saved = profileOf([source]);
  if ('error' in saved) assert.fail(saved.error);
  const shape = sketchShapes(saved.node).shape;
  assert.equal(shape?.kind, 'polygon');
  const body = partSnapshot(withNode(withNode(emptyDoc(), saved.node), { kind: 'extrude', sketch: 0, height })).outputs[0];
  assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
  if (expectedVolume !== undefined) near(massPropertiesOf(body).volume, expectedVolume);
  for (const id of saved.node.sideTags!.outer) assert.equal(body.brep.faces.filter(face => face.name === `n1.side[${id}]`).length, 1);
  const bottom = (i: number) => {
    const id = saved.node.sideTags!.outer[i];
    const face = body.brep.faces.find(item => item.name === `n1.side[${id}]`); assert.ok(face);
    const edgeIds = new Set(body.brep.coedges.filter(use => face.loops.includes(use.loop)).map(use => use.edge));
    const vertexIds = new Set(body.brep.edges.filter(edge => edgeIds.has(edge.id)).flatMap(edge => edge.vertices));
    const points = body.brep.vertices.filter(vertex => vertexIds.has(vertex.id) && Math.abs(vertex.point[2]) < 1e-8);
    assert.equal(points.length, 2);
    return points.map(vertex => vertex.point);
  };
  for (let i = 0; i < source.points.length; i++) {
    const expected = savedChamferSetback(source, i); if (expected === undefined) continue;
    const n = source.points.length, ends = bottom(i), [p, end] = bottom((i - 1 + n) % n), [q, other] = bottom((i + 1) % n);
    const u = [end[0] - p[0], end[1] - p[1]], v = [other[0] - q[0], other[1] - q[1]];
    const along = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / (u[0] * v[1] - u[1] * v[0]);
    const support = [p[0] + along * u[0], p[1] + along * u[1]];
    for (const point of ends) near(Math.hypot(point[0] - support[0], point[1] - support[1]), expected);
  }
  assert.deepEqual(shape.rules, source.rules); assert.deepEqual(shape.lengths, source.lengths);
  return { shape, body };
}
const reopened = (source: Polygon, expectedVolume?: number) => native(source, expectedVolume).shape;

test('saved orthogonal Chamfer edits one setback, keeps bindings and settles to the preview', () => {
  const source = bevel({ ...rectangle(), rules: [{ kind: 'dy', a: 0, b: 3, value: 30 }] });
  const before = structuredClone(source), shape = resized(source, 1, 8);
  near(savedChamferSetback(source, 1)!, 6); near(savedChamferSetback(shape, 1)!, 8);
  assert.deepEqual(shape.points, [[0, 0], [32, 0], [40, 8], [40, 30], [0, 30]]);
  assert.deepEqual(shape.ids, source.ids); assert.deepEqual(shape.rules, source.rules);
  assert.deepEqual(shape.lengths, { ...source.lengths, 1: 8 * Math.SQRT2 });
  assert.deepEqual(source, before);
  assert.equal(resized(source, 1, savedChamferSetback(source, 1)!), source, 'unchanged setback creates no candidate');
  const settled = settleShape(shape, source);
  assert.equal(settled.error, null); assert.deepEqual(settled.shape, shape);
  const opened = reopened(shape, 2336);
  near(savedChamferSetback(opened, 1)!, 8);
  const restored = resized(opened, 1, 6);
  near(savedChamferSetback(reopened(restored, 2364), 1)!, 6);
});

test('grouped notch C6 to C8 changes only e9 and keeps its adjacent opposite-turn sibling C6', () => {
  const result = prepareStraightCornerBatch(notch(), 'chamfer', [3, 4], 6);
  if ('error' in result) assert.fail(result.error);
  const source = result.shape, before = structuredClone(source), shape = resized(source, 3, 8);
  assert.equal(shape.ids?.[3], 'e9'); assert.equal(shape.ids?.[5], 'e10');
  assert.deepEqual(source.points.slice(3, 7), [[44, 40], [38, 34], [38, 21], [32, 15]]);
  assert.deepEqual(shape.points.slice(3, 7), [[46, 40], [38, 32], [38, 21], [32, 15]]);
  near(savedChamferSetback(shape, 3)!, 8); near(savedChamferSetback(shape, 5)!, 6);
  assert.deepEqual(shape.rules, source.rules); assert.deepEqual(shape.ids, source.ids);
  // Original area 2000; convex C8 removes 32 and reflex C6 adds 18 mm².
  const opened = reopened(shape, 3972);
  near(savedChamferSetback(opened, 3)!, 8); near(savedChamferSetback(opened, 5)!, 6);
  assert.deepEqual(opened.ids, shape.ids);
  assert.deepEqual(source, before);
  const reflex = resized(source, 5, 8);
  assert.deepEqual(reflex.points.slice(3, 7), [[44, 40], [38, 34], [38, 23], [30, 15]]);
  near(savedChamferSetback(reflex, 3)!, 6); near(savedChamferSetback(reflex, 5)!, 8);
  reopened(reflex, 4028);
  for (const value of [19, 20, 25]) {
    assert.ok('error' in editChamferSetback(source, 3, value));
    assert.deepEqual(source, before);
  }
  const moved = dragOutlinePoint(source, 3, [50, 44]); assert.ok(moved);
  const afterDrag = resized(moved, 3, 8);
  near(savedChamferSetback(afterDrag, 3)!, 8); near(savedChamferSetback(afterDrag, 5)!, 6);
  for (let i = 0; i < source.points.length; i++) if (i !== 3 && i !== 4) assert.deepEqual(afterDrag.points[i], moved.points[i]);
  reopened(afterDrag);
});

function adjacentChamfers() {
  const result = prepareStraightCornerBatch(notch(), 'chamfer', [3, 4], 6);
  if ('error' in result) assert.fail(result.error);
  return result.shape;
}

test('mixed convex C4 and reflex C14 reach shared C12 in either selection order with native planar bevel proof', () => {
  // Original area 2000; convex C4 removes 8 and reflex C14 adds 98 mm².
  const source = native(resized(resized(adjacentChamfers(), 3, 4), 5, 14), 20900, 10).shape;
  const before = structuredClone(source);
  assert.ok('error' in editChamferSetback(source, 3, 12), 'growing first consumes the shared 25 mm carrier');
  let previous: Polygon | undefined;
  for (const edges of [[3, 5], [5, 3]]) {
    const selection = [...edges], result = editChamferSetbacks(source, edges, 12);
    if ('error' in result) assert.fail(result.error);
    const shape = result.shape;
    assert.deepEqual(edges, selection, 'internal edit order does not change the selected handle order');
    assert.deepEqual(shape.points.slice(3, 7), [[50, 40], [38, 28], [38, 27], [26, 15]]);
    near(Math.hypot(shape.points[4][0] - shape.points[5][0], shape.points[4][1] - shape.points[5][1]), 1);
    near(savedChamferSetback(shape, 3)!, 12); near(savedChamferSetback(shape, 5)!, 12);
    assert.deepEqual(shape.lengths, { ...source.lengths, 3: 12 * Math.SQRT2, 5: 12 * Math.SQRT2 });
    for (const key of ['ids', 'rules', 'hv', 'bulges'] as const)
      assert.deepEqual(shape[key], source[key], key);
    assert.deepEqual(shape.tangents ?? [], source.tangents ?? []);
    assert.deepEqual(shape.radii ?? {}, source.radii ?? {});
    for (const i of [0, 1, 2, 7, 8, 9]) assert.deepEqual(shape.points[i], source.points[i]);
    if (previous) assert.deepEqual(shape, previous);
    previous = shape;
    const { shape: opened, body } = native(shape, 20000, 10);
    assert.deepEqual(opened.ids, source.ids);
    assert.equal(body.brep.faces.length, shape.points.length + 2, 'only the ten original side walls and two caps remain');
    const bottom = (id: string) => {
      const face = body.brep.faces.find(item => item.name === `n1.side[${id}]`); assert.ok(face);
      assert.equal(faceGeometry(face).kind, 'plane');
      const edgeIds = new Set(body.brep.coedges.filter(use => face.loops.includes(use.loop)).map(use => use.edge));
      const vertexIds = new Set(body.brep.edges.filter(edge => edgeIds.has(edge.id)).flatMap(edge => edge.vertices));
      return body.brep.vertices.filter(vertex => vertexIds.has(vertex.id) && Math.abs(vertex.point[2]) < 1e-8)
        .map(vertex => vertex.point.slice(0, 2)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    };
    assert.equal(source.ids?.[3], 'e9'); assert.equal(source.ids?.[5], 'e10');
    assert.deepEqual(bottom('e9'), [[38, 28], [50, 40]]);
    assert.deepEqual(bottom('e10'), [[26, 15], [38, 27]]);
    assert.deepEqual(bottom(source.ids![4]), [[38, 27], [38, 28]], 'native shared wall retains the 1 mm carrier at x38');
    assert.deepEqual(source, before);
  }
});

test('shared Chamfer resizing retains same-size history, no-op identity and atomic refusal', () => {
  const equal = adjacentChamfers(), current = savedChamferSetback(equal, 3)!;
  for (const edges of [[3, 5], [5, 3]]) {
    const expected = edges.reduce((shape, edge) => resized(shape, edge, 8), equal);
    const result = editChamferSetbacks(equal, edges, 8);
    if ('error' in result) assert.fail(result.error);
    assert.deepEqual(result.shape, expected, 'equal-size edits keep the historical sequential result');
    const unchanged = editChamferSetbacks(equal, edges, current);
    if ('error' in unchanged) assert.fail(unchanged.error);
    assert.equal(unchanged.shape, equal);
  }
  const source = resized(resized(equal, 3, 4), 5, 14), before = structuredClone(source);
  const shrunk = resized(source, 5, 13);
  assert.ok('error' in editChamferSetback(shrunk, 3, 13), 'a later growth can refuse after a valid shrink');
  for (const edges of [[3, 5], [5, 3]]) {
    for (const value of [13, 25, NaN, Infinity, -1, 0, 1e-7]) {
      assert.ok('error' in editChamferSetbacks(source, edges, value), String(value));
      assert.deepEqual(source, before);
    }
  }
  for (const edges of [[], [3, 4], [3, -1], [3, 0.5], [3, 10]]) {
    assert.ok('error' in editChamferSetbacks(source, edges, 12)); assert.deepEqual(source, before);
  }
  const unlocked: Polygon = { ...source, lengths: { ...source.lengths } };
  delete unlocked.lengths![5];
  const unlockedBefore = structuredClone(unlocked);
  assert.ok('error' in editChamferSetbacks(unlocked, [3, 5], 12)); assert.deepEqual(unlocked, unlockedBefore);
  const duplicated = editChamferSetbacks(source, [3, 5, 3], 12);
  const unique = editChamferSetbacks(source, [3, 5], 12);
  assert.deepEqual(duplicated, unique);
});

test('saved direct perpendicular recipe edits in rotation, in either authored order, and resaves', () => {
  const rotate = ([x, y]: readonly [number, number]): [number, number] => [(3 * x - 4 * y) / 5, (4 * x + 3 * y) / 5];
  for (const [a, b] of [[0, 1], [1, 0]]) {
    const source = bevel({ ...rectangle(), points: rectangle().points.map(rotate), hv: { h: [], v: [] },
      rules: [{ kind: 'perpendicular', a, b }, { kind: 'parallel', a: 0, b: 2 }, { kind: 'parallel', a: 1, b: 3 }] });
    const shape = resized(source, 1, 8);
    near(shape.points[1][0], 19.2); near(shape.points[1][1], 25.6);
    near(shape.points[2][0], 17.6); near(shape.points[2][1], 36.8);
    assert.deepEqual(shape.rules, source.rules); assert.deepEqual(shape.hv, { h: [], v: [] });
    const opened = reopened(shape, 2336);
    near(savedChamferSetback(opened, 1)!, 8);
    near(savedChamferSetback(reopened(resized(opened, 1, 7), 2351), 1)!, 7);
  }
});

test('ordinary oblique, unlocked, duplicate-angle and unsupported saved edges stay uneditable', () => {
  const source = bevel();
  const cases: Polygon[] = [rectangle(), { ...source, lengths: {} }, { ...source, rules: [] },
    { ...source, construction: true },
    { ...source, hv: { h: [], v: [] } }, { ...source, rules: [...source.rules!, ...source.rules!] },
    { ...source, ids: ['e1', 'e2', 'e2', 'e3', 'e4'] },
    { ...source, rules: [...source.rules!, { kind: 'angle', a: 1, b: 2, value: 135 }] },
    { ...source, bulges: source.points.map((_, i) => i === 1 ? 0.1 : 0) },
    { ...source, points: source.points.map((p, i) => i === 2 ? [p[0], 7] : p) }];
  for (const shape of cases) {
    const before = structuredClone(shape);
    assert.equal(savedChamferSetback(shape, 1), undefined);
    assert.ok('error' in editChamferSetback(shape, 1, 8)); assert.deepEqual(shape, before);
  }
  for (const index of [-1, 0.5, 10]) assert.equal(savedChamferSetback(source, index), undefined);
});

test('invalid, collapsing, crossing and conflicting values are refused without changing the source', () => {
  const source = bevel(), before = structuredClone(source);
  for (const value of [NaN, Infinity, -1, 0, 1e-7, 30, 35, 40, 50]) {
    assert.ok('error' in editChamferSetback(source, 1, value), String(value));
    assert.deepEqual(source, before);
  }
  const fixed: Polygon = { ...source, rules: [...source.rules!, { kind: 'fix', point: 1, at: [...source.points[1]] }] };
  const fixedBefore = structuredClone(fixed);
  assert.ok('error' in editChamferSetback(fixed, 1, 8)); assert.deepEqual(fixed, fixedBefore);
  const circle: Polygon = { ...source, circles: [{ c: [35, 4], r: 0.2 }] };
  const circleBefore = structuredClone(circle);
  assert.ok('error' in editChamferSetback(circle, 1, 12)); assert.deepEqual(circle, circleBefore);
});

test('clockwise recipe retains sign; a wraparound bevel cannot silently move the implicit anchor', () => {
  const clockwise: Polygon = { kind: 'polygon', closed: true, points: [[0, 0], [0, 30], [40, 30], [40, 0]],
    hv: { h: [1, 3], v: [0, 2] }, ids: ['e4', 'e3', 'e2', 'e1'] };
  const source = bevel(clockwise, 1), shape = resized(source, 1, 8);
  near(savedChamferSetback(shape, 1)!, 8); reopened(shape, 2336);
  const wrap = bevel(clockwise, 0), before = structuredClone(wrap);
  near(savedChamferSetback(wrap, 0)!, 6);
  assert.ok('error' in editChamferSetback(wrap, 0, 8)); assert.deepEqual(wrap, before);
});

function savedObliqueChamfer(reflex = false, reflected = false, reversedRules = false): Polygon {
  // The convex record matches the native D6 file created by Studio, including its stored length.
  const points: Polygon['points'] = reflex
    ? [[0, 0], [60, 0], [60, 45], [40, 45], [40, 26], [35.2, 16.4], [20, 5], [0, 5]]
    : [[0, 0], [24, 0], [34.8, 3.6], [50, 15], [50, 45], [0, 45]];
  if (reflected) for (const point of points) point[1] = point[1] ? -point[1] : 0;
  const edge = reflex ? 4 : 1, angle = Math.atan2(reflex ? 4 : 3, reflex ? 3 : 4) * 180 / Math.PI;
  return { kind: 'polygon', closed: true, points, bulges: points.map(() => 0),
    lengths: { [edge]: reflex ? 10.73312629199899 : 11.384199576606163 },
    hv: reflex ? { h: [0, 2, 6], v: [1, 3, 7] } : { h: [0, 4], v: [3, 5] },
    ids: reflex ? ['e1', 'e2', 'e3', 'e4', 'e8', 'e5', 'e6', 'e7'] : ['e1', 'e6', 'e2', 'e3', 'e4', 'e5'],
    rules: [...(reflex ? [0, 3, 6] : [0, 3]).map(point => ({ kind: 'fix' as const, point, at: [...points[point]] as [number, number] })),
      { kind: 'angle', a: reversedRules ? edge + 1 : edge - 1, b: reversedRules ? edge - 1 : edge + 1, value: angle },
      { kind: 'angle', a: reversedRules ? edge : edge - 1, b: reversedRules ? edge - 1 : edge, value: 180 - angle / 2 },
    ] };
}

function retainedObliqueChamfer(source: Polygon, shape: Polygon, edge: number) {
  for (const key of ['ids', 'rules', 'hv', 'bulges'] as const) assert.deepEqual(shape[key], source[key], key);
  for (const [i, point] of source.points.entries()) if (i !== edge && i !== edge + 1) assert.deepEqual(shape.points[i], point);
  for (const [i, value] of Object.entries(source.lengths!)) if (+i !== edge) assert.equal(shape.lengths![+i], value);
}

test('saved authored oblique D6 to D9 preserves carriers, angle rules and native side IDs', () => {
  for (const reflected of [false, true]) for (const reversedRules of [false, true]) {
    const source = native(savedObliqueChamfer(false, reflected, reversedRules), 20892, 10).shape;
    const before = structuredClone(source), sign = reflected ? -1 : 1;
    assert.equal(savedChamferSetback(source, 1), 6, 'binary recovery noise does not change the shown dimension');
    assert.equal(resized(source, 1, 6), source, 're-entering the shown D6 is an exact no-op');
    const shape = resized(source, 1, 9);
    assert.deepEqual(shape.points, [[0, 0], [21, 0], [37.2, 5.4 * sign], [50, 15 * sign], [50, 45 * sign], [0, 45 * sign]]);
    near(shape.lengths![1], 9 * 3 * Math.sqrt(10) / 5, 1e-12);
    retainedObliqueChamfer(source, shape, 1); assert.equal(savedChamferSetback(shape, 1), 9);
    const { shape: opened, body } = native(shape, 10 * (2100 - 9 * 9 * 0.6 / 2), 10);
    assert.equal(resized(opened, 1, 9), opened);
    for (const [id, x, y, offset] of [['e1', 0, 1, 0], ['e6', 1, -3 * sign, 21], ['e2', 3, -4 * sign, 90]] as const) {
      const wall = faceGeometry(body.brep.faces.find(face => face.name === `n1.side[${id}]`)!);
      assert.equal(wall.kind, 'plane'); near(x * wall.o[0] + y * wall.o[1], offset);
    }
    const restored = resized(opened, 1, 6); assert.deepEqual(restored.points, source.points);
    retainedObliqueChamfer(source, restored, 1); native(restored, 20892, 10); assert.deepEqual(source, before);
  }
});

test('oblique recovery keeps precise setback edits and both reflected reflex branches', () => {
  const source = savedObliqueChamfer(), before = structuredClone(source);
  for (const value of [6.0000004, 6.0000000004]) {
    const shape = resized(source, 1, value); assert.notEqual(shape, source);
    near(savedChamferSetback(shape, 1)!, value, 1e-12);
    near(shape.lengths![1], value * 3 * Math.sqrt(10) / 5, 1e-12);
    retainedObliqueChamfer(source, shape, 1);
    native(shape, 10 * (2100 - value * value * 0.6 / 2), 10);
  }
  assert.deepEqual(source, before);
  for (const reflected of [false, true]) {
    const reflex = native(savedObliqueChamfer(true, reflected), 12644, 10).shape, original = structuredClone(reflex);
    const shape = resized(reflex, 4, 9), sign = reflected ? -1 : 1;
    assert.deepEqual(shape.points.slice(4, 6), [[40, 29 * sign], [32.8, 14.6 * sign]]);
    near(shape.lengths![4], 9 * 4 / Math.sqrt(5), 1e-12);
    assert.equal(savedChamferSetback(shape, 4), 9); retainedObliqueChamfer(reflex, shape, 4);
    native(shape, 10 * (1250 + 9 * 9 * 0.8 / 2), 10); assert.deepEqual(reflex, original);
  }
});

test('oblique discovery rejects wrong carrier and joint recipes without changing saved data', () => {
  const source = savedObliqueChamfer();
  const angleRules = source.rules!.filter(rule => rule.kind === 'angle');
  const cases: Polygon[] = [
    { ...source, rules: source.rules!.filter(rule => rule !== angleRules[0]) },
    { ...source, rules: [...source.rules!, angleRules[1]] },
    { ...source, lengths: { 1: source.lengths![1] + 1 } },
    ...[NaN, Infinity, 0, 90, 180, 45].map(value => ({ ...source, rules: source.rules!.map(rule => rule === angleRules[0] ? { ...angleRules[0], value } : rule) })),
    ...[NaN, Infinity, 135, 160, 180].map(value => ({ ...source, rules: source.rules!.map(rule => rule === angleRules[1] ? { ...angleRules[1], value } : rule) })),
    { ...source, rules: source.rules!.map(rule => rule === angleRules[0] ? { kind: 'angle' as const, a: 0, b: 3, value: angleRules[0].value } : rule) },
    { ...source, rules: source.rules!.map(rule => rule === angleRules[1] ? { kind: 'angle' as const, a: 1, b: 2, value: angleRules[1].value } : rule) },
    { ...source, points: source.points.map((point, i) => i === 2 ? [point[0], point[1] + 0.1] : point) },
  ];
  for (const shape of cases) {
    const before = structuredClone(shape); assert.equal(savedChamferSetback(shape, 1), undefined);
    assert.ok('error' in editChamferSetback(shape, 1, 9)); assert.deepEqual(shape, before);
  }
});

test('oblique oversized, conflicting and anchor-moving setback edits refuse atomically', () => {
  const source = savedObliqueChamfer(), before = structuredClone(source);
  for (const value of [NaN, Infinity, -1, 0, 1e-7, 25, 26, 30]) {
    assert.ok('error' in editChamferSetback(source, 1, value)); assert.deepEqual(source, before);
  }
  const conflicts: Polygon[] = [
    { ...source, lengths: { ...source.lengths, 0: 24 } },
    { ...source, rules: [...source.rules!, { kind: 'fix', point: 1, at: [24, 0] }] },
    { ...source, rules: [...source.rules!, { kind: 'distance', a: 1, b: 3, value: Math.hypot(26, 15) }] },
    { ...source, circles: [{ c: [29, 2.65], r: 0.1 }], circleIds: ['e7'] },
  ];
  for (const shape of conflicts) {
    const original = structuredClone(shape); assert.ok('error' in editChamferSetback(shape, 1, 9)); assert.deepEqual(shape, original);
  }
  const shift = (i: number) => (i + 5) % 6;
  const wrap: Polygon = { ...source, points: [...source.points.slice(1), source.points[0]], ids: [...source.ids!.slice(1), source.ids![0]],
    lengths: { 0: source.lengths![1] }, hv: { h: source.hv!.h.map(shift), v: source.hv!.v.map(shift) },
    rules: source.rules!.map(rule => rule.kind === 'fix' ? { ...rule, point: shift(rule.point) }
      : rule.kind === 'angle' ? { ...rule, a: shift(rule.a), b: shift(rule.b) } : rule) };
  const original = structuredClone(wrap); assert.equal(savedChamferSetback(wrap, 0), 6);
  assert.match((editChamferSetback(wrap, 0, 9) as { error: string }).error, /anchor/); assert.deepEqual(wrap, original);
});
