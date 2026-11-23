import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProfileLoop, checkBrep, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode, type DocPlane } from '../src/engine/doc';
import { partBreps } from '../src/engine/evaluate';
import { partSnapshot } from '../src/engine/part';
import { chamferCorner, roundCorner, roundStraightCornerForEdit } from '../src/sketch/corner';
import { planPinnedLineArcRadiusEdit } from '../src/sketch/internal/pinnedLineArcRound';
import { profileOf } from '../src/sketch/loops';
import { arcOf, outlineSegments, type P2 } from '../src/sketch/profile';
import { sketchShapes } from '../src/sketch/reopen';
import { applyConstraint, checkEdit, commitDimension, constraintOptions, commitInlineDimension, removeConstraint, type Polygon } from '../src/sketch/rules';
import { settleShape } from '../src/sketch/settle';
import { arcMeetsOtherOutline } from '../src/sketch/trim';

test('rounding a corner: an arc tangent to both edges, ends cut back, constraints renumbered', () => {
  const sq = { kind: 'polygon' as const, points: [[0, 0], [20, 0], [20, 10], [0, 10]] as [number, number][], closed: true, bulges: [0, 0, 0, 0], lengths: { 0: 20, 1: 10, 2: 20 }, hv: { h: [0, 2], v: [1, 3] } };
  const r = roundCorner(sq, 1, 3);
  assert.ok('shape' in r);
  assert.deepEqual(r.shape.points, [[0, 0], [17, 0], [20, 3], [20, 10], [0, 10]]);
  const arc = arcOf(r.shape.points[1], r.shape.points[2], r.shape.bulges![1]);
  assert.deepEqual([Math.round(arc.center[0] * 1e6) / 1e6, Math.round(arc.center[1] * 1e6) / 1e6, Math.round(arc.radius * 1e6) / 1e6], [17, 3, 3]);
  assert.deepEqual([r.shape.lengths, r.shape.radii, r.shape.tangents, r.shape.hv], [{ 3: 20 }, { 1: 3 }, [1, 2], { h: [0, 3], v: [2, 4] }]);
  assert.ok('error' in roundCorner(sq, 1, 11), 'R11 does not fit the 10 mm edge');
  assert.ok('error' in roundCorner(r.shape, 2, 1), 'next to the arc');
});

const rectangle: Polygon = {
  kind: 'polygon', closed: true, points: [[0, 0], [40, 0], [40, 30], [0, 30]],
  ids: ['e1', 'e2', 'e3', 'e4'], hv: { h: [0, 2], v: [1, 3] },
  lengths: { 2: 40 }, rules: [{ kind: 'fix', point: 0, at: [0, 0] }],
};

test('a saved straight-corner round keeps its carriers and driving inputs in either direction', () => {
  const reversed: Polygon = {
    kind: 'polygon', closed: true, points: [[40, 0], [0, 0], [0, 30], [40, 30]],
    ids: ['e1', 'e4', 'e3', 'e2'], hv: { h: [0, 2], v: [1, 3] },
    lengths: { 2: 40 }, rules: [{ kind: 'fix', point: 1, at: [0, 0] }],
  };
  for (const [source, i, sign] of [[rectangle, 1, 1], [reversed, 0, -1]] as const) {
    const before = structuredClone(source);
    const result = roundStraightCornerForEdit(source, i, 6);
    assert.ok('shape' in result, 'error' in result ? result.error : '');
    const { shape } = result;
    assert.deepEqual(source, before);
    assert.deepEqual(shape.ids?.filter(Boolean), source.ids);
    assert.equal(shape.ids?.[i], '');
    assert.deepEqual(shape.lengths, { 3: 40 });
    assert.deepEqual(shape.points.slice(i, i + 2), sign > 0 ? [[34, 0], [40, 6]] : [[40, 6], [34, 0]]);
    const arc = arcOf(shape.points[i], shape.points[i + 1], shape.bulges![i]);
    assert.ok(Math.hypot(arc.center[0] - 34, arc.center[1] - 6) < 1e-8);
    assert.ok(Math.abs(arc.radius - 6) < 1e-8 && Math.abs(arc.sweep - sign * Math.PI / 2) < 1e-8);
  }
  const locked = { ...rectangle, lengths: { 0: 40, 2: 40 } };
  const legacy = roundCorner(locked, 1, 6);
  assert.ok('shape' in legacy);
  assert.deepEqual(legacy.shape.lengths, { 3: 40 });
  assert.deepEqual(roundStraightCornerForEdit(locked, 1, 6), {
    error: 'The round would remove a constraint on the original corner or its trimmed edges.',
  });
  assert.ok('error' in roundStraightCornerForEdit(rectangle, 0, 6), 'the fixed corner would disappear');
  assert.ok('error' in roundStraightCornerForEdit(rectangle, 1, 0.009));
});

test('a saved reflex Round detects contact with a nonincident tip on its circle', () => {
  const theta = 40 * Math.PI / 180;
  const source: Polygon = { kind: 'polygon', closed: true, points: [
    [0, 0], [0, 20], [-10, 20], [-10, -10], [30, -10], [30, 20], [15, 20], [15, 14],
    [10 - 10 * Math.sin(theta), 10 - 10 * Math.cos(theta)], [15, 9], [20, 9], [20, 0],
  ] };
  const before = structuredClone(source);
  const legacy = roundCorner(source, 0, 10);
  assert.ok('shape' in legacy);
  assert.doesNotThrow(() => buildProfileLoop(outlineSegments(legacy.shape.points, legacy.shape.bulges)));
  assert.deepEqual(roundStraightCornerForEdit(source, 0, 10), { error: 'The round would touch another edge.' });
  assert.deepEqual(source, before);
  const result = roundStraightCornerForEdit(source, 0, 9);
  assert.ok('shape' in result, 'error' in result ? result.error : '');
});

test('finite arc contact includes interior tangency and excludes separated arcs', () => {
  const quarter = Math.tan(Math.PI / 8);
  const outline = (separation: number): Polygon => {
    const offset = separation / Math.sqrt(2);
    return { kind: 'polygon', closed: true, points: [
      [0, -1], [1, 0], [offset, 1 - offset], [offset - 1, -offset], [0, -2], [-2, -2], [-2, 0],
    ], bulges: [quarter, 0, quarter, 0, 0, 0, 0] };
  };
  assert.equal(arcMeetsOtherOutline(outline(2), 0), true);
  assert.equal(arcMeetsOtherOutline(outline(2.001), 0), false);
});

test('chamfer splits a corner and preserves the survivors, constraints and native wall owners', () => {
  const before = structuredClone(rectangle);
  const r = chamferCorner(rectangle, 1, 6);
  assert.ok('shape' in r, 'error' in r ? r.error : '');
  assert.deepEqual(rectangle, before);
  assert.deepEqual(r.shape.points, [[0, 0], [34, 0], [40, 6], [40, 30], [0, 30]]);
  assert.deepEqual(r.shape.ids, ['e1', '', 'e2', 'e3', 'e4']);
  assert.deepEqual(r.shape.hv, { h: [0, 3], v: [2, 4] });
  assert.deepEqual(r.shape.lengths, { 1: 6 * Math.SQRT2, 3: 40 });
  assert.deepEqual(r.shape.rules, [...rectangle.rules!, { kind: 'angle', a: 0, b: 1, value: 135 }]);
  assert.ok(r.shape.bulges?.every(b => b === 0));
  const profile = profileOf([r.shape]);
  assert.ok('node' in profile);
  assert.deepEqual(profile.node.sideTags?.outer, ['e1', 'e5', 'e2', 'e3', 'e4']);
  const [body] = partSnapshot(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })).outputs;
  assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
  assert.ok(Math.abs(massPropertiesOf(body).volume - 11820) < 1e-8);
  for (const id of ['e1', 'e2', 'e3', 'e4', 'e5'])
    assert.equal(body.brep.faces.filter(face => face.name === `n1.side[${id}]`).length, 1);
});

test('chamfer measures oblique setbacks after settling and handles the wraparound side IDs', () => {
  const source: Polygon = { kind: 'polygon', closed: true, points: [[0, 0], [20, 0], [0, 20]],
    ids: ['e1', 'e2', 'e3'], hv: { h: [0], v: [2] } };
  const r = chamferCorner(source, 1, 5);
  assert.ok('shape' in r, 'error' in r ? r.error : '');
  const [a, b] = r.shape.points.slice(1, 3);
  for (const point of [a, b]) assert.ok(Math.abs(Math.hypot(point[0] - 20, point[1]) - 5) < 2e-6);
  assert.deepEqual(a, [15, 0]);
  assert.ok(Math.hypot(b[0] - (20 - 5 / Math.sqrt(2)), b[1] - 5 / Math.sqrt(2)) < 1e-6);
  const reversed: Polygon = { kind: 'polygon', closed: true, points: [[0, 0], [0, 30], [40, 30], [40, 0]],
    ids: ['e4', 'e3', 'e2', 'e1'], hv: { h: [1, 3], v: [0, 2] } };
  const wrap = chamferCorner(reversed, 0, 6);
  assert.ok('shape' in wrap, 'error' in wrap ? wrap.error : '');
  assert.deepEqual(wrap.shape.points, [[6, 0], [0, 6], [0, 30], [40, 30], [40, 0]]);
  assert.deepEqual(wrap.shape.ids, ['', 'e4', 'e3', 'e2', 'e1']);
});

test('chamfer keeps a remote circular arc and can add the local triangle at a reflex corner', () => {
  const arc: Polygon = { ...rectangle, bulges: [0, 0, Math.SQRT2 - 1, 0], lengths: {}, hv: { h: [0], v: [1, 3] } };
  const mixed = chamferCorner(arc, 1, 6);
  assert.ok('shape' in mixed, 'error' in mixed ? mixed.error : '');
  assert.ok(Math.abs(mixed.shape.bulges![3] - arc.bulges![2]) < 1e-9);
  const concave: Polygon = { kind: 'polygon', closed: true,
    points: [[0, 0], [40, 0], [40, 15], [20, 15], [20, 30], [0, 30]],
    ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'], hv: { h: [0, 2, 4], v: [1, 3, 5] } };
  const r = chamferCorner(concave, 3, 3);
  assert.ok('shape' in r, 'error' in r ? r.error : '');
  assert.deepEqual(r.shape.points.slice(3, 5), [[23, 15], [20, 18]]);
  const profile = profileOf([r.shape]);
  assert.ok('node' in profile);
  const [body] = partSnapshot(withNode(withNode(emptyDoc(), profile.node), { kind: 'extrude', sketch: 0, height: 10 })).outputs;
  assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
  assert.ok(Math.abs(massPropertiesOf(body).volume - 9045) < 1e-8);
});

test('chamfer refuses non-finite and full-side distances, lost constraints, arcs and boundary contact atomically', () => {
  const crossed: Polygon = { kind: 'polygon', closed: true,
    points: [[0, 0], [10, 0], [10, 10], [8, 10], [8, 2], [2, 2], [2, 10], [0, 10]] };
  const cases: [Polygon, number, number, RegExp][] = [
    [rectangle, 1, Infinity, /positive/],
    [rectangle, 1, 0, /positive/],
    [rectangle, 1, 30, /shorter/],
    [{ ...rectangle, lengths: { 0: 40 } }, 1, 6, /constraints/],
    [{ ...rectangle, rules: [{ kind: 'fix', point: 1, at: [40, 0] }] }, 1, 6, /constraints/],
    [{ ...rectangle, bulges: [0, 0.2, 0, 0] }, 1, 6, /straight/],
    [{ ...rectangle, points: [[0, 0], [20, 0], [40, 0], [0, 30]] }, 1, 6, /usable corner/],
    [{ ...rectangle, circles: [{ c: [39, 1], r: 0.1 }] }, 1, 6, /circle/],
    [crossed, 1, 8, /touch/],
    [{ kind: 'polygon', closed: true, points: [[-100, 0], [0, 0], [100, 0.00011], [100, 10], [-100, 10]],
      hv: { h: [0, 3], v: [2, 4] } }, 1, 0.1, /distinct corners/],
    [{ kind: 'polygon', closed: true, points: [[-100, -20], [0, 0], [100, 20.00011], [100, 100], [-100, 100]],
      hv: { h: [3], v: [2, 4] } }, 1, 0.1, /distinct corners/],
  ];
  for (const [shape, corner, distance, reason] of cases) {
    const before = structuredClone(shape);
    const result = chamferCorner(shape, corner, distance);
    assert.ok('error' in result);
    assert.match(result.error, reason);
    assert.deepEqual(shape, before);
  }
});

const pinned = (): Polygon => ({
  kind: 'polygon', closed: true, points: [[0, 20], [40, 20], [20, 40], [0, 40]],
  bulges: [0, Math.tan(Math.PI / 8), 0, 0], ids: ['e1', 'e2', 'e3', 'e4'],
  hv: { h: [0, 2], v: [3] }, radii: { 1: 20 }, tangents: [2], rules: [{ kind: 'fix', point: 2, at: [20, 40] }],
});
const reversedPinned = (): Polygon => ({
  ...pinned(), points: [[0, 20], [0, 40], [20, 40], [40, 20]],
  bulges: [0, 0, -Math.tan(Math.PI / 8), 0], ids: ['e4', 'e3', 'e2', 'e1'],
  hv: { h: [1, 3], v: [0] }, radii: { 2: 20 },
});
const near = (actual: number, expected: number, tolerance = 1e-7) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
};
const nearPoint = (actual: P2, expected: P2) => { near(actual[0], expected[0]); near(actual[1], expected[1]); };
const xzPlane: DocPlane = { origin: [0, 5, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] };

function checkRoundedGeometry(shape: Polygon, r: number, direction: 1 | -1 = 1, R = 20, datum = 20, reverse = false) {
  // In the fixture's inward coordinates the fixed end is (20,20). Subtract
  // the squared vertical offset from the inner radius squared and factor:
  // (R − r)² − (R + r − 20)² = (20 − 2r)(2R − 20).
  const ordinate = (v: number) => datum + direction * v;
  const x = Math.sqrt((20 - 2 * r) * (2 * R - 20)), y = R + r - 20;
  const center: P2 = [20 + x, ordinate(r)], sourceCenter: P2 = [20, ordinate(20 - R)];
  const line: P2 = [20 + x, datum], join: P2 = [20 + R * x / (R - r), ordinate(20 - R + R * y / (R - r))];
  const theta = Math.atan2(y, x), roundSweep = Math.PI / 2 + theta, sourceSweep = Math.PI / 2 - theta;
  const [a, p, q, b, d] = reverse ? [shape.points[0], ...shape.points.slice(1).reverse()] : shape.points;
  nearPoint(a, [0, datum]);
  nearPoint(b, [20, ordinate(20)]);
  nearPoint(d, [0, ordinate(20)]);
  nearPoint(p, line);
  nearPoint(q, join);
  const sharpX = 20 + Math.sqrt(40 * (R - 10)), inward = direction * (q[1] - datum);
  assert.ok(p[0] > 0 && p[0] < sharpX && q[0] > 20 && inward > 0 && inward < 20);
  const fillet = reverse ? arcOf(q, p, shape.bulges![3]) : arcOf(p, q, shape.bulges![1]);
  const source = reverse ? arcOf(b, q, shape.bulges![2]) : arcOf(q, b, shape.bulges![2]);
  nearPoint(fillet.center, center);
  nearPoint(source.center, sourceCenter);
  near(fillet.radius, r);
  near(source.radius, R);
  const authoredDirection = reverse ? -direction : direction;
  near(fillet.sweep, authoredDirection * roundSweep, 1e-9);
  near(source.sweep, authoredDirection * sourceSweep, 1e-9);
  const tangentAtJoin = ([cx, cy]: P2) => Math.atan2(direction * (q[0] - cx), direction * (cy - q[1]));
  near(tangentAtJoin(fillet.center), tangentAtJoin(source.center), 1e-9);
  near(fillet.center[0], p[0]);

  const construction = { kind: 'polygon' as const, points: [[2, 24], [3, 24]] as P2[], closed: false, construction: true as const, ids: ['e7', 'e6'] };
  const profile = profileOf([shape, construction]);
  assert.ok('node' in profile);
  const filletId = shape.ids?.[reverse ? 3 : 1] || 'e8';
  const ids = reverse ? ['e4', 'e3', 'e2', filletId, 'e1'] : ['e1', filletId, 'e2', 'e3', 'e4'];
  assert.deepEqual(profile.node.sideTags?.outer, ids);
  assert.deepEqual(construction.ids, ['e7', 'e6']);
  const node = direction === -1 ? { ...profile.node, plane: xzPlane } : profile.node;
  const doc = withNode(withNode(emptyDoc(), node), { kind: 'extrude', sketch: 0, height: 10 });
  const [body] = partBreps(doc);
  assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
  for (const id of ids) {
    assert.equal(body.brep.faces.filter(face => face.name === `n1.side[${id}]`).length, 1, id);
  }
  if (direction === -1 || reverse) {
    const axis = direction === -1 ? 1 : 2, ordinateAxis = direction === -1 ? 2 : 1;
    for (const [id, point, radius] of [[filletId, center, r], ['e2', sourceCenter, R]] as const) {
      const face = body.brep.faces.find(f => f.name === `n1.side[${id}]`);
      assert.ok(face);
      const cylinder = faceGeometry(face);
      assert.equal(cylinder.kind, 'cylinder');
      nearPoint([cylinder.c[0], cylinder.c[ordinateAxis]], [point[0], point[1]]);
      near(cylinder.a[0], 0);
      near(cylinder.a[axis], 1);
      near(cylinder.a[ordinateAxis], 0);
      near(cylinder.r, radius);
    }
    for (const [name, sign] of [['bottom', 1], ['top', -1]] as const) {
      const face = body.brep.faces.find(f => f.name === `n1.${name}`);
      assert.ok(face);
      const cap = faceGeometry(face);
      assert.equal(cap.kind, 'plane');
      near(cap.o[axis], direction === -1 ? 5 * sign : sign > 0 ? 0 : 10);
      near(cap.n[0], 0);
      near(cap.n[axis], direction === -1 ? sign : -sign);
      near(cap.n[ordinateAxis], 0);
    }
  }
  const points = [a, line, join, b, d];
  const polygonArea = points.reduce((sum, [x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % points.length];
    return sum + (x0 * y1 - y0 * x1) / 2;
  }, 0);
  const area = direction * polygonArea + r * r * (roundSweep - Math.sin(roundSweep)) / 2
    + R * R * (sourceSweep - Math.sin(sourceSweep)) / 2;
  const mass = massPropertiesOf(partSnapshot(doc).outputs[0], 1);
  near(mass.volume, 10 * area, 1e-5);
}

test('pinned line–arc Round creates R3 and the radius editor settles R4 then R5 on the same carriers', () => {
  const source = pinned(), original = structuredClone(source);
  const rounded = roundCorner(source, 1, 3);
  if ('error' in rounded) assert.fail(rounded.error);
  assert.deepEqual(source, original);
  const first = rounded.shape;
  assert.deepEqual(first.ids, ['e1', '', 'e2', 'e3', 'e4']);
  assert.deepEqual(first.hv, { h: [0, 3], v: [4] });
  assert.deepEqual(first.tangents, [1, 2, 3]);
  assert.deepEqual(first.rules, [{ kind: 'fix', point: 3, at: [20, 40] }]);
  assert.deepEqual(first.radii, { 1: 3, 2: 20 });
  checkRoundedGeometry(first, 3);

  let current = first;
  for (const r of [4, 5]) {
    const locked = settleShape({ ...current, radii: { ...current.radii, 1: r } }, current);
    assert.equal(locked.error, null);
    const edited = commitDimension(current, 'rad1', r);
    if (!edited.ok) assert.fail(edited.reason);
    const settled = settleShape(edited.shape, current);
    assert.equal(settled.error, null);
    assert.equal(settled.shape?.kind, 'polygon');
    assert.deepEqual(settled.shape.ids, first.ids);
    assert.deepEqual(settled.shape.radii, { 1: r, 2: 20 });
    assert.deepEqual(locked.shape, settled.shape);
    checkRoundedGeometry(settled.shape, r);
    current = settled.shape;
  }
  const before = structuredClone(current);
  for (const invalid of [9.99999999, 10, 11, 12]) {
    const oversized = commitDimension(current, 'rad1', invalid);
    assert.ok(!oversized.ok, `R${invalid} leaves no finite retained arc`);
    assert.match(oversized.reason, /does not fit on both finite sides/);
    const locked = settleShape({ ...current, radii: { ...current.radii, 1: invalid } }, current);
    assert.equal(locked.shape, current);
    assert.match(locked.error ?? '', /does not fit on both finite sides/);
  }
  assert.deepEqual(current, before);
});

test('pinned line–arc Round preserves off-grid radius and refuses invalid or oversized creation', () => {
  const radius = 3.0000004, source = pinned();
  const rounded = roundCorner(source, 1, radius);
  if ('error' in rounded) assert.fail(rounded.error);
  assert.equal(rounded.shape.radii?.[1], radius);
  checkRoundedGeometry(rounded.shape, radius);
  for (const invalid of [NaN, Infinity, -1, 0, 0.0005, 10, 11, 20]) assert.ok('error' in roundCorner(source, 1, invalid), String(invalid));
});

test('clockwise line–arc Round preserves reflected XZ geometry through both radius edit routes and reopen', () => {
  const source: Polygon = {
    ...pinned(), points: [[0, 20], [40, 20], [20, 0], [0, 0]], bulges: [0, -Math.tan(Math.PI / 8), 0, 0],
    rules: [{ kind: 'fix', point: 2, at: [20, 0] }],
  };
  const before = structuredClone(source), rounded = roundCorner(source, 1, 3);
  if ('error' in rounded) assert.fail(rounded.error);
  assert.deepEqual(source, before);
  let current = rounded.shape;
  assert.deepEqual(current.ids, ['e1', '', 'e2', 'e3', 'e4']);
  assert.deepEqual(current.rules, [{ kind: 'fix', point: 3, at: [20, 0] }]);
  assert.deepEqual(current.hv, { h: [0, 3], v: [4] });
  assert.deepEqual(current.tangents, [1, 2, 3]);
  checkRoundedGeometry(current, 3, -1);

  for (const radius of [4, 5]) {
    const locked = settleShape({ ...current, radii: { ...current.radii, 1: radius } }, current);
    assert.equal(locked.error, null);
    const edited = commitDimension(current, 'rad1', radius);
    if (!edited.ok) assert.fail(edited.reason);
    const settled = settleShape(edited.shape, current);
    assert.equal(settled.error, null);
    assert.equal(settled.shape?.kind, 'polygon');
    assert.deepEqual(settled.shape, locked.shape);
    assert.deepEqual(settled.shape.ids, current.ids);
    assert.deepEqual(settled.shape.radii, { 1: radius, 2: 20 });
    checkRoundedGeometry(settled.shape, radius, -1);
    const profile = profileOf([settled.shape]);
    assert.ok('node' in profile);
    const { shape } = sketchShapes({ ...profile.node, plane: xzPlane });
    assert.equal(shape?.kind, 'polygon');
    assert.deepEqual(shape.ids, ['e1', 'e5', 'e2', 'e3', 'e4']);
    current = shape;
  }

  assert.ok('error' in roundCorner(source, 1, 10));
  const oversized = commitDimension(current, 'rad1', 10);
  assert.ok(!oversized.ok);
  assert.match(oversized.reason, /does not fit on both finite sides/);
  const locked = settleShape({ ...current, radii: { ...current.radii, 1: 10 } }, current);
  assert.equal(locked.shape, current);
  assert.match(locked.error ?? '', /does not fit on both finite sides/);

  const bulges = [...current.bulges!];
  bulges[2] = -bulges[2];
  const mixed = settleShape({ ...current, bulges, radii: { ...current.radii, 1: 4 } }, current);
  assert.equal(mixed.shape, current);
  assert.match(mixed.error ?? '', /keep both arcs in their original direction/);
});

test('pinned source-radius edits replan both tangencies and refuse the exact finite limit in both windings', () => {
  for (const direction of [1, -1] as const) {
    const datum = direction === 1 ? 0 : 20, endY = datum + direction * 20;
    const source: Polygon = {
      ...pinned(), points: [[0, datum], [40, datum], [20, endY], [0, endY]],
      bulges: [0, direction * Math.tan(Math.PI / 8), 0, 0], rules: [{ kind: 'fix', point: 2, at: [20, endY] }],
    };
    const rounded = roundCorner(source, 1, 4);
    if ('error' in rounded) assert.fail(rounded.error);
    const before = structuredClone(rounded.shape);
    const panel = settleShape({ ...rounded.shape, radii: { 1: 4, 2: 16 } }, rounded.shape);
    assert.equal(panel.error, null);
    assert.equal(panel.shape?.kind, 'polygon');
    assert.deepEqual(rounded.shape, before);
    assert.deepEqual(panel.shape.radii, { 1: 4, 2: 16 });
    assert.deepEqual(panel.shape.ids, rounded.shape.ids);
    assert.deepEqual(panel.shape.rules, [{ kind: 'fix', point: 3, at: [20, endY] }]);
    assert.deepEqual(panel.shape.hv, { h: [0, 3], v: [4] });
    assert.deepEqual(panel.shape.tangents, [1, 2, 3]);
    checkRoundedGeometry(panel.shape, 4, direction, 16, datum);

    const unlocked = checkEdit({ ...panel.shape, radii: { 1: 4 } }, panel.shape);
    if (!unlocked.ok) assert.fail(unlocked.reason);
    assert.deepEqual(unlocked.shape.radii, { 1: 4 });
    const beforeRelock = structuredClone(unlocked.shape);
    const invalidRelock = commitDimension(unlocked.shape, 'rad2', 10);
    assert.ok(!invalidRelock.ok);
    assert.match(invalidRelock.reason, /does not fit on both finite sides/);
    const refusedRelock = settleShape({ ...unlocked.shape, radii: { 1: 4, 2: 10 } }, unlocked.shape);
    assert.equal(refusedRelock.shape, unlocked.shape);
    assert.match(refusedRelock.error ?? '', /does not fit on both finite sides/);
    assert.deepEqual(unlocked.shape, beforeRelock);
    const relocked = settleShape({ ...unlocked.shape, radii: { 1: 4, 2: 18 } }, unlocked.shape);
    assert.equal(relocked.error, null);
    assert.equal(relocked.shape?.kind, 'polygon');
    assert.deepEqual(relocked.shape.radii, { 1: 4, 2: 18 });
    assert.deepEqual(relocked.shape.ids, unlocked.shape.ids);
    checkRoundedGeometry(relocked.shape, 4, direction, 18, datum);

    const profile = profileOf([panel.shape]);
    assert.ok('node' in profile);
    const { shape: opened } = sketchShapes(profile.node);
    assert.equal(opened?.kind, 'polygon');
    const ids = ['e1', 'e5', 'e2', 'e3', 'e4'];
    assert.deepEqual(opened.ids, ids);
    for (const radius of [10, 9]) {
      const invalid = commitDimension(opened, 'rad2', radius);
      assert.ok(!invalid.ok);
      assert.match(invalid.reason, /does not fit on both finite sides/);
      const refused = settleShape({ ...opened, radii: { 1: 4, 2: radius } }, opened);
      assert.equal(refused.shape, opened);
      assert.match(refused.error ?? '', /does not fit on both finite sides/);
    }

    const edited = commitDimension(opened, 'rad2', 18);
    if (!edited.ok) assert.fail(edited.reason);
    const final = settleShape(edited.shape, opened);
    assert.equal(final.error, null);
    assert.equal(final.shape?.kind, 'polygon');
    assert.deepEqual(final.shape.ids, ids);
    assert.deepEqual(final.shape.radii, { 1: 4, 2: 18 });
    assert.deepEqual(final.shape.rules, opened.rules);
    checkRoundedGeometry(final.shape, 4, direction, 18, datum);
  }
});

test('reverse pinned arc–line Round preserves authored order, radii and native wall names', () => {
  const source = reversedPinned();
  const before = structuredClone(source), rounded = roundCorner(source, 3, 3);
  if ('error' in rounded) assert.fail(rounded.error);
  const first = rounded.shape;
  assert.deepEqual(source, before);
  assert.deepEqual(first.ids, ['e4', 'e3', 'e2', '', 'e1']);
  assert.deepEqual(first.rules, source.rules);
  assert.deepEqual(first.hv, { h: [1, 4], v: [0] });
  assert.deepEqual(first.tangents, [2, 3, 4]);
  assert.deepEqual(first.radii, { 2: 20, 3: 3 });
  checkRoundedGeometry(first, 3, 1, 20, 20, true);
  assert.ok('error' in roundCorner(source, 3, 10));
  assert.ok('error' in roundCorner({ ...source, lengths: { 3: 40 } }, 3, 3));
  assert.ok('error' in roundCorner({ ...source, hv: { h: [0, 2], v: [3] } }, 3, 3));

  const panel = settleShape({ ...first, radii: { 2: 20, 3: 4 } }, first);
  assert.equal(panel.error, null);
  assert.equal(panel.shape?.kind, 'polygon');
  const profile = profileOf([panel.shape]);
  assert.ok('node' in profile);
  const { shape: opened } = sketchShapes(profile.node);
  assert.equal(opened?.kind, 'polygon');
  const ids = ['e4', 'e3', 'e2', 'e5', 'e1'];
  assert.deepEqual(opened.ids, ids);
  checkRoundedGeometry(opened, 4, 1, 20, 20, true);

  for (const index of [2, 3]) {
    const invalid = commitDimension(opened, `rad${index}`, 10);
    assert.ok(!invalid.ok);
    assert.match(invalid.reason, /does not fit on both finite sides/);
    const locked = settleShape({ ...opened, radii: { ...opened.radii, [index]: 10 } }, opened);
    assert.equal(locked.shape, opened);
    assert.match(locked.error ?? '', /does not fit on both finite sides/);
  }
  const filletEdit = commitDimension(opened, 'rad3', 5);
  if (!filletEdit.ok) assert.fail(filletEdit.reason);
  const r5 = settleShape(filletEdit.shape, opened);
  assert.equal(r5.error, null);
  assert.equal(r5.shape?.kind, 'polygon');
  assert.deepEqual(r5.shape.ids, ids);
  assert.deepEqual(r5.shape.radii, { 2: 20, 3: 5 });
  checkRoundedGeometry(r5.shape, 5, 1, 20, 20, true);

  const sourceEdit = commitDimension(opened, 'rad2', 16);
  if (!sourceEdit.ok) assert.fail(sourceEdit.reason);
  const r16 = settleShape(sourceEdit.shape, opened);
  assert.equal(r16.error, null);
  assert.equal(r16.shape?.kind, 'polygon');
  assert.deepEqual(r16.shape.ids, ids);
  assert.deepEqual(r16.shape.radii, { 2: 16, 3: 4 });
  checkRoundedGeometry(r16.shape, 4, 1, 16, 20, true);

  const clear = settleShape({ ...r16.shape, radii: { 3: 4 } }, r16.shape);
  assert.equal(clear.error, null);
  assert.equal(clear.shape?.kind, 'polygon');
  assert.deepEqual(clear.shape.radii, { 3: 4 });
  const invalid = commitDimension(clear.shape, 'rad2', 10);
  assert.ok(!invalid.ok);
  assert.match(invalid.reason, /does not fit on both finite sides/);
  const relocked = commitDimension(clear.shape, 'rad2', 18);
  if (!relocked.ok) assert.fail(relocked.reason);
  assert.deepEqual(relocked.shape.ids, ids);
  checkRoundedGeometry(relocked.shape, 4, 1, 18, 20, true);
});

test('pinned Round guards the fillet radius when re-locking in either traversal', () => {
  for (const reverse of [false, true]) {
    const index = reverse ? 3 : 1, key = `rad${index}`;
    const rounded = roundCorner(reverse ? reversedPinned() : pinned(), index, 4);
    if ('error' in rounded) assert.fail(rounded.error);
    const { shape: unlocked, error } = settleShape(removeConstraint(rounded.shape, `rad:${index}`), rounded.shape);
    assert.equal(error, null);
    assert.equal(unlocked?.kind, 'polygon');
    assert.deepEqual(unlocked.radii, { 2: 20 });
    assert.deepEqual(unlocked.ids, rounded.shape.ids);
    const profile = profileOf([unlocked]);
    assert.ok('node' in profile);
    const { shape: opened } = sketchShapes(profile.node);
    assert.equal(opened?.kind, 'polygon');
    assert.deepEqual(opened.radii, { 2: 20 });
    assert.deepEqual(opened.ids, reverse ? ['e4', 'e3', 'e2', 'e5', 'e1'] : ['e1', 'e5', 'e2', 'e3', 'e4']);
    checkRoundedGeometry(opened, 4, 1, 20, 20, reverse);

    const before = structuredClone(opened);
    for (const radius of [9.99999999, 10]) {
      const inline = commitInlineDimension(opened, key, radius);
      assert.ok(!inline.ok);
      assert.match(inline.reason, /does not fit on both finite sides/);
      const panel = settleShape({ ...opened, radii: { 2: 20, [index]: radius } }, opened);
      assert.equal(panel.shape, opened);
      assert.match(panel.error ?? '', /does not fit on both finite sides/);
    }
    assert.deepEqual(opened, before);

    const radius = 5.0000004;
    const inline = commitInlineDimension(opened, key, radius);
    if (!inline.ok) assert.fail(inline.reason);
    const final = settleShape(inline.shape, opened);
    const panel = settleShape({ ...opened, radii: { 2: 20, [index]: radius } }, opened);
    assert.equal(panel.error, null);
    assert.equal(final.error, null);
    assert.equal(final.shape?.kind, 'polygon');
    assert.deepEqual(final.shape, panel.shape);
    assert.deepEqual(final.shape.ids, opened.ids);
    assert.deepEqual(final.shape.radii, { 2: 20, [index]: radius });
    checkRoundedGeometry(final.shape, radius, 1, 20, 20, reverse);

    const bothUnlocked = settleShape(removeConstraint(opened, 'rad:2'), opened);
    assert.equal(bothUnlocked.error, null);
    assert.equal(bothUnlocked.shape?.kind, 'polygon');
    assert.deepEqual(bothUnlocked.shape.radii, {});
    const noLocks = bothUnlocked.shape;
    for (const radius of [9.99999999, 10]) {
      const filletFirstRefusal = commitInlineDimension(noLocks, key, radius);
      assert.ok(!filletFirstRefusal.ok);
      assert.match(filletFirstRefusal.reason, /does not fit on both finite sides/);
      const refusedPanel = settleShape({ ...noLocks, radii: { [index]: radius } }, noLocks);
      assert.equal(refusedPanel.shape, noLocks);
      assert.match(refusedPanel.error ?? '', /does not fit on both finite sides/);
    }
    const filletFirst = commitInlineDimension(noLocks, key, 5);
    if (!filletFirst.ok) assert.fail(filletFirst.reason);
    assert.deepEqual(filletFirst.shape.radii, { [index]: 5 });
    const lockedBoth = commitDimension(filletFirst.shape, 'rad2', 20);
    if (!lockedBoth.ok) assert.fail(lockedBoth.reason);
    assert.deepEqual(lockedBoth.shape.ids, noLocks.ids);
    checkRoundedGeometry(lockedBoth.shape, 5, 1, 20, 20, reverse);
    assert.equal(planPinnedLineArcRadiusEdit({ ...bothUnlocked.shape, radii: { 2: 20 } }, bothUnlocked.shape), null);
    const sourceFirst = commitDimension(bothUnlocked.shape, 'rad2', 20);
    if (!sourceFirst.ok) assert.fail(sourceFirst.reason);
    assert.deepEqual(sourceFirst.shape.radii, { 2: 20 });
    const second = commitInlineDimension(sourceFirst.shape, key, 10);
    assert.ok(!second.ok);
    assert.match(second.reason, /does not fit on both finite sides/);
  }
});

test('pinned Round rejects the source radius limit while its fillet is unlocked', () => {
  for (const reverse of [false, true]) {
    const index = reverse ? 3 : 1;
    const rounded = roundCorner(reverse ? reversedPinned() : pinned(), index, 4);
    if ('error' in rounded) assert.fail(rounded.error);
    const { shape: openFillet } = settleShape(removeConstraint(rounded.shape, `rad:${index}`), rounded.shape);
    assert.equal(openFillet?.kind, 'polygon');
    for (const radius of [9, 10, 10.00000001]) {
      const inline = commitInlineDimension(openFillet, 'rad2', radius);
      assert.ok(!inline.ok);
      assert.match(inline.reason, /does not fit on both finite sides/);
      const panel = settleShape({ ...openFillet, radii: { 2: radius } }, openFillet);
      assert.equal(panel.shape, openFillet);
      assert.match(panel.error ?? '', /does not fit on both finite sides/);
    }
    const inline = commitInlineDimension(openFillet, 'rad2', 16);
    if (!inline.ok) assert.fail(inline.reason);
    const { shape: panel, error } = settleShape({ ...openFillet, radii: { 2: 16 } }, openFillet);
    assert.equal(error, null);
    assert.deepEqual(inline.shape, panel);
    assert.deepEqual(inline.shape.radii, { 2: 16 });
    const radius = arcOf(inline.shape.points[index], inline.shape.points[index + 1], inline.shape.bulges![index]).radius;
    assert.ok(radius > 2.57 && radius < 2.58);
    checkRoundedGeometry(inline.shape, radius, 1, 16, 20, reverse);
  }
});

test('pinned line–arc Round keeps the radius guard when Finish allocates the largest safe side ID', () => {
  const source = pinned(), max = Number.MAX_SAFE_INTEGER;
  source.ids = ['e1', 'e2', 'e3', `e${max}`];
  assert.ok('error' in roundCorner(source, 1, 3), 'Creation needs one available ID');

  const retained = `e${max - 1}`, fillet = `e${max}`;
  source.ids = ['e1', 'e2', 'e3', retained];
  const rounded = roundCorner(source, 1, 3);
  if ('error' in rounded) assert.fail(rounded.error);
  const profile = profileOf([rounded.shape]);
  assert.ok('node' in profile);
  const ids = ['e1', fillet, 'e2', 'e3', retained];
  assert.deepEqual(profile.node.sideTags?.outer, ids);

  const { shape } = sketchShapes(profile.node);
  assert.equal(shape?.kind, 'polygon');
  assert.deepEqual(shape.ids, ids);
  const edited = commitDimension(shape, 'rad1', 4);
  if (!edited.ok) assert.fail(edited.reason);
  assert.deepEqual(edited.shape.ids, ids);
  const oversized = commitDimension(shape, 'rad1', 10);
  assert.ok(!oversized.ok);
  assert.match(oversized.reason, /does not fit on both finite sides/);
  const locked = settleShape({ ...shape, radii: { ...shape.radii, 1: 10 } }, shape);
  assert.equal(locked.shape, shape);
  assert.match(locked.error ?? '', /does not fit on both finite sides/);
});

test('line–arc Round refuses unpinned, ambiguous and unsupported profiles without changing constraints', () => {
  const source = pinned();
  const refused = (shape: Polygon, i = 1, reason?: RegExp) => {
    const before = structuredClone(shape), result = roundCorner(shape, i, 3);
    assert.ok('error' in result);
    if (reason) assert.match(result.error, reason);
    assert.deepEqual(shape, before);
  };
  refused({ ...source, points: [[0, 0], [40, 20], [20, 40], [0, 40]], hv: { h: [2], v: [3] }, rules: undefined });
  refused({ ...source, rules: undefined });
  refused({ ...source, lengths: { 0: 40 } }, 1, /length lock/);
  refused({ ...source, rules: [{ kind: 'fix', point: 1, at: [40, 20] }, ...source.rules!] }, 1, /fixed point at the corner/);
  refused({ ...source, rules: [...source.rules!, { kind: 'distance', a: 1, b: 3, value: 10 }] });
  refused({ ...source, ids: ['e1', 'e2', 'e2', 'e4'] }, 1, /distinct side IDs/);
  refused({ ...source, closed: false });
  refused({ ...source, pending: true });
  refused({ ...source, fromSpline: true });
  refused({ ...source, fromEllipse: true });
  refused({ ...source, bulges: [0, -source.bulges![1], 0, 0] });
  refused({ ...source, bulges: [0, source.bulges![1], 0.25, 0] });
  refused({ ...source, bulges: [0, source.bulges![1] / 2, 0, 0] });
  // At the top of the CCW quarter circle, both the arc tangent and the retained line point left.
  refused(source, 2, /this one has an arc/);

  // The fixed arc end and the last point coincide, leaving a zero-length retained line.
  refused({ ...source, points: [[20, 20], [40, 20], [20, 40], [20, 40]] }, 1, /convex outline/);

  const leftBranch: Polygon = {
    ...source, points: [[-10, 20], [0, 20], [20, 40], [-10, 40]],
    bulges: [0, -source.bulges![1], 0, 0],
  };
  // The other intersection with y=20 gives a clockwise quarter arc whose end tangent points right.
  // The retained line still points left, so this branch doubles back at the fixed end.
  refused(leftBranch, 1, /convex outline/);
  // The closing side x=10 intersects that arc at y=20+sqrt(300), inside both segments.
  refused({ ...leftBranch, points: [[10, 20], [0, 20], [20, 40], [10, 40]] }, 1, /convex outline/);

  // On the open reverse chain, the last point has an incoming arc and no outgoing side.
  refused({ ...reversedPinned(), closed: false }, 3, /between two edges/);
});

test('selected adjacent line and arc restore the same Round tangent joint', () => {
  for (const reverse of [false, true]) {
    const rounded = roundCorner(reverse ? reversedPinned() : pinned(), reverse ? 3 : 1, 4);
    if ('error' in rounded) assert.fail(rounded.error);
    const line = reverse ? 4 : 0, arc = reverse ? 3 : 1, joint = reverse ? 4 : 1;
    const outline = removeConstraint(rounded.shape, `tan:${joint}`);
    const pick = (i: number) => ({ kind: 'edge' as const, i });
    for (const pair of [[pick(line), pick(arc)], [pick(arc), pick(line)]]) {
      assert.equal(constraintOptions(outline, pair).tangent, null);
      const restored = applyConstraint(outline, pair, 'tangent');
      if (!restored.ok) assert.fail(restored.reason);
      assert.deepEqual(restored.shape.tangents, rounded.shape.tangents);
      assert.equal(constraintOptions(restored.shape, pair).tangent, 'Already tangent');
      checkRoundedGeometry(restored.shape, 4, 1, 20, 20, reverse);
    }
    for (const invalid of [[pick(arc), pick(arc)], [pick(arc), pick(0 === line ? 4 : 0)], [pick(arc), pick(7)], [pick(arc), pick(2)]]) {
      assert.ok(constraintOptions(outline, invalid).tangent);
      assert.equal(applyConstraint(outline, invalid, 'tangent').ok, false);
    }
  }
  const wrap: Polygon = { kind: 'polygon', closed: true, points: [[4, 0], [40, 0], [40, 30], [0, 30], [0, 4]],
    bulges: [0, 0, 0, 0, Math.SQRT2 - 1], hv: { h: [0, 2], v: [1, 3] } };
  const seam = applyConstraint(wrap, [{ kind: 'edge', i: 4 }, { kind: 'edge', i: 0 }], 'tangent');
  if (!seam.ok) assert.fail(seam.reason);
  assert.deepEqual(seam.shape.tangents, [0]);
});

function angleConstrainedCorner(reflected = false, reversedRule = false): Polygon {
  const turn = Math.atan2(3, 4) * 180 / Math.PI;
  const points: P2[] = [[0, 0], [30, 0], [50, 15], [50, 45], [0, 45]];
  if (reflected) for (const point of points) point[1] = point[1] ? -point[1] : 0;
  return { kind: 'polygon', closed: true, points, ids: ['e1', 'e2', 'e3', 'e4', 'e5'],
    hv: { h: [0, 3], v: [2, 4] }, rules: [
      { kind: 'fix', point: 0, at: [...points[0]] }, { kind: 'fix', point: 2, at: [...points[2]] },
      { kind: 'angle', a: reversedRule ? 1 : 0, b: reversedRule ? 0 : 1, value: 180 - turn },
      { kind: 'angle', a: 0, b: 3, value: 180 },
      { kind: 'angle', a: 1, b: 2, value: 90 + turn },
    ] };
}

test('straight Fillet converts only its removed corner angle to separated carrier directions', () => {
  const turn = Math.atan2(3, 4), degrees = turn * 180 / Math.PI;
  for (const reflected of [false, true]) for (const reversedRule of [false, true]) {
    const source = angleConstrainedCorner(reflected, reversedRule), before = structuredClone(source);
    const planned = roundCorner(source, 1, 6); assert.ok('shape' in planned);
    assert.deepEqual(planned.shape.rules, [source.rules![0], { kind: 'fix', point: 3, at: [...source.points[2]] },
      { kind: 'angle', a: reversedRule ? 2 : 0, b: reversedRule ? 0 : 2, value: 180 - (180 - degrees) },
      { kind: 'angle', a: 0, b: 4, value: 180 }, { kind: 'angle', a: 2, b: 3, value: 90 + degrees }]);
    const settled = settleShape(planned.shape, source); assert.equal(settled.error, null);
    assert.equal(settled.shape?.kind, 'polygon'); const shape = settled.shape as Polygon;
    const sign = reflected ? -1 : 1;
    assert.deepEqual(shape.points, [[0, 0], [28, 0], [31.6, 1.2 * sign], [50, 15 * sign], [50, 45 * sign], [0, 45 * sign]]);
    const arc = arcOf(shape.points[1], shape.points[2], shape.bulges![1]);
    nearPoint(arc.center, [28, 6 * sign]); near(arc.radius, 6); near(arc.sweep, turn * sign);
    // The virtual corner keeps the 143.1301° included angle: incoming is reversed there.
    const incoming: P2 = [shape.points[1][0] - shape.points[0][0], shape.points[1][1] - shape.points[0][1]];
    const outgoing: P2 = [shape.points[3][0] - shape.points[2][0], shape.points[3][1] - shape.points[2][1]];
    near(Math.acos(-(incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / (Math.hypot(...incoming) * Math.hypot(...outgoing))) * 180 / Math.PI, 180 - degrees);
    const bounded = roundStraightCornerForEdit(source, 1, 6); assert.ok('shape' in bounded, 'error' in bounded ? bounded.error : '');
    assert.deepEqual(bounded.shape, shape); assert.deepEqual(shape.ids, ['e1', '', 'e2', 'e3', 'e4', 'e5']);
    assert.deepEqual(shape.radii, { 1: 6 }); assert.deepEqual(shape.tangents, [1, 2]);
    assert.deepEqual(source, before);
  }
});

test('angle-constrained Fillet creates native R6 with persistent rules, contacts and side IDs after reopen', () => {
  const authored = angleConstrainedCorner(); authored.rules = authored.rules!.slice(0, 3);
  const profile = profileOf([authored]); assert.ok('node' in profile);
  const source = sketchShapes(profile.node).shape; assert.equal(source?.kind, 'polygon');
  const result = roundStraightCornerForEdit(source as Polygon, 1, 6); assert.ok('shape' in result, 'error' in result ? result.error : '');
  const saved = profileOf([result.shape]); assert.ok('node' in saved);
  assert.deepEqual(saved.node.sideTags?.outer, ['e1', 'e6', 'e2', 'e3', 'e4', 'e5']);
  const reopened = sketchShapes(saved.node).shape; assert.equal(reopened?.kind, 'polygon');
  const shape = reopened as Polygon;
  assert.deepEqual(shape.points, result.shape.points); assert.deepEqual(shape.rules, result.shape.rules);
  assert.deepEqual(shape.radii, { 1: 6 }); assert.deepEqual(shape.tangents, [1, 2]);
  assert.deepEqual(shape.ids, saved.node.sideTags!.outer);
  const body = partSnapshot(withNode(withNode(emptyDoc(), saved.node), { kind: 'extrude', sketch: 0, height: 10 })).outputs[0];
  assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
  near(massPropertiesOf(body).volume, 10 * (2100 - 36 * (1 / 3 - Math.atan2(3, 4) / 2)), 2e-6);
  for (const id of saved.node.sideTags!.outer) assert.equal(body.brep.faces.filter(face => face.name === `n1.side[${id}]`).length, 1);
  const round = faceGeometry(body.brep.faces.find(face => face.name === 'n1.side[e6]')!);
  assert.equal(round.kind, 'cylinder'); near(round.r, 6); nearPoint([round.c[0], round.c[1]], [28, 6]);
  const incoming = faceGeometry(body.brep.faces.find(face => face.name === 'n1.side[e1]')!);
  const outgoing = faceGeometry(body.brep.faces.find(face => face.name === 'n1.side[e2]')!);
  assert.equal(incoming.kind, 'plane'); assert.equal(outgoing.kind, 'plane');
  near(incoming.o[1], 0); near(3 * outgoing.o[0] - 4 * outgoing.o[1], 90);
});

test('removed wraparound angle is converted while unrelated angle values and refusal stay intact', () => {
  const base = angleConstrainedCorner(), shift = (i: number) => (i + 4) % 5;
  const source: Polygon = { ...base, points: [...base.points.slice(1), base.points[0]], ids: [...base.ids!.slice(1), base.ids![0]],
    hv: { h: base.hv!.h.map(shift), v: base.hv!.v.map(shift) },
    rules: base.rules!.map(rule => rule.kind === 'fix' ? { ...rule, point: shift(rule.point) }
      : rule.kind === 'angle' ? { ...rule, a: shift(rule.a), b: shift(rule.b) } : rule) };
  const before = structuredClone(source), result = roundStraightCornerForEdit(source, 0, 6);
  assert.ok('shape' in result, 'error' in result ? result.error : '');
  assert.deepEqual(result.shape.points, [[28, 0], [31.6, 1.2], [50, 15], [50, 45], [0, 45], [0, 0]]);
  assert.deepEqual(result.shape.rules!.slice(2), [
    { kind: 'angle', a: 5, b: 1, value: 180 - (base.rules![2] as { value: number }).value },
    { kind: 'angle', a: 5, b: 3, value: 180 },
    { kind: 'angle', a: 1, b: 2, value: (base.rules![4] as { value: number }).value },
  ]);
  assert.deepEqual(source, before);
  const locked = { ...base, lengths: { 0: 30 } }, lockedBefore = structuredClone(locked);
  assert.ok('error' in roundStraightCornerForEdit(locked, 1, 6)); assert.deepEqual(locked, lockedBefore);
  const incompatible = { ...base, rules: base.rules!.map((rule, i) => i === 2 && rule.kind === 'angle' ? { ...rule, value: 140 } : rule) };
  assert.ok('error' in chamferCorner(incompatible, 1, 6), 'Chamfer refuses an incompatible carrier angle');
});

function nativeStraightChamfer(shape: Polygon, expectedVolume: number) {
  const saved = profileOf([shape]); assert.ok('node' in saved);
  const reopened = sketchShapes(saved.node).shape; assert.equal(reopened?.kind, 'polygon');
  const stored = reopened as Polygon;
  assert.deepEqual(stored.points, shape.points); assert.deepEqual(stored.rules, shape.rules);
  assert.deepEqual(stored.lengths, shape.lengths); assert.deepEqual(stored.ids, saved.node.sideTags!.outer);
  const body = partSnapshot(withNode(withNode(emptyDoc(), saved.node), { kind: 'extrude', sketch: 0, height: 10 })).outputs[0];
  assert.ok(body && checkBrep(body.brep, { strict: true }).valid);
  near(massPropertiesOf(body).volume, expectedVolume, 2e-6);
  for (const [i, id] of saved.node.sideTags!.outer.entries()) {
    const faces = body.brep.faces.filter(face => face.name === `n1.side[${id}]`); assert.equal(faces.length, 1);
    const wall = faceGeometry(faces[0]); assert.equal(wall.kind, 'plane');
    const a = shape.points[i], b = shape.points[(i + 1) % shape.points.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    near(((wall.o[0] - a[0]) * dy - (wall.o[1] - a[1]) * dx) / length, 0);
    near((wall.n[0] * dx + wall.n[1] * dy) / length, 0); near(wall.n[2], 0);
  }
  return stored;
}

test('authored oblique Chamfer retains equal D6 setbacks, carrier angles and native walls', () => {
  const degrees = Math.atan2(3, 4) * 180 / Math.PI;
  for (const reflected of [false, true]) for (const reversedRule of [false, true]) {
    const source = angleConstrainedCorner(reflected, reversedRule), before = structuredClone(source);
    const result = chamferCorner(source, 1, 6); assert.ok('shape' in result, 'error' in result ? result.error : '');
    const shape = result.shape, sign = reflected ? -1 : 1;
    assert.deepEqual(shape.points, [[0, 0], [24, 0], [34.8, 3.6 * sign], [50, 15 * sign], [50, 45 * sign], [0, 45 * sign]]);
    assert.deepEqual(shape.ids, ['e1', '', 'e2', 'e3', 'e4', 'e5']);
    assert.deepEqual(shape.rules, [source.rules![0], { kind: 'fix', point: 3, at: [...source.points[2]] },
      { kind: 'angle', a: reversedRule ? 2 : 0, b: reversedRule ? 0 : 2, value: 180 - (180 - degrees) },
      { kind: 'angle', a: 0, b: 4, value: 180 }, { kind: 'angle', a: 2, b: 3, value: 90 + degrees },
      { kind: 'angle', a: 0, b: 1, value: 180 - degrees / 2 }]);
    // Independent 3:4:5 geometry: contacts are six units along [−1,0] and [4/5,3/5].
    near(Math.hypot(shape.points[1][0] - 30, shape.points[1][1]), 6);
    near(Math.hypot(shape.points[2][0] - 30, shape.points[2][1]), 6);
    near(shape.lengths![1], 3.6 * Math.sqrt(10));
    const dx = shape.points[2][0] - shape.points[1][0], dy = shape.points[2][1] - shape.points[1][1];
    near(dx / Math.hypot(dx, dy), 3 / Math.sqrt(10)); near(dy / Math.hypot(dx, dy), sign / Math.sqrt(10));
    const stored = nativeStraightChamfer(shape, 10 * (2100 - 6 * 6 * 0.6 / 2));
    assert.deepEqual(stored.ids, ['e1', 'e6', 'e2', 'e3', 'e4', 'e5']);
    assert.deepEqual(source, before);
  }
});

test('authored oblique Chamfer preserves reflected reflex and wraparound branches', () => {
  for (const reflected of [false, true]) {
    const sign = reflected ? -1 : 1;
    const points: P2[] = [[0, 0], [60, 0], [60, 45], [40, 45], [40, 20], [20, 5], [0, 5]];
    if (reflected) for (const point of points) point[1] = point[1] ? -point[1] : 0;
    const source: Polygon = { kind: 'polygon', closed: true, points, ids: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'],
      hv: { h: [0, 2, 5], v: [1, 3, 6] }, rules: [
        ...[0, 3, 5].map(point => ({ kind: 'fix' as const, point, at: [...points[point]] as P2 })),
        { kind: 'angle', a: 3, b: 4, value: 180 - Math.atan2(4, 3) * 180 / Math.PI },
      ] };
    const before = structuredClone(source), result = chamferCorner(source, 4, 6);
    assert.ok('shape' in result, 'error' in result ? result.error : '');
    nearPoint(result.shape.points[4], [40, 26 * sign]); nearPoint(result.shape.points[5], [35.2, 16.4 * sign]);
    near(result.shape.lengths![4], 4.8 * Math.sqrt(5));
    nativeStraightChamfer(result.shape, 10 * (1250 + 6 * 6 * 0.8 / 2)); assert.deepEqual(source, before);
  }
  const base = angleConstrainedCorner(), shift = (i: number) => (i + 4) % 5;
  const source: Polygon = { ...base, points: [...base.points.slice(1), base.points[0]], ids: [...base.ids!.slice(1), base.ids![0]],
    hv: { h: base.hv!.h.map(shift), v: base.hv!.v.map(shift) },
    rules: base.rules!.map(rule => rule.kind === 'fix' ? { ...rule, point: shift(rule.point) }
      : rule.kind === 'angle' ? { ...rule, a: shift(rule.a), b: shift(rule.b) } : rule) };
  const before = structuredClone(source), result = chamferCorner(source, 0, 6);
  assert.ok('shape' in result, 'error' in result ? result.error : '');
  assert.deepEqual(result.shape.points, [[24, 0], [34.8, 3.6], [50, 15], [50, 45], [0, 45], [0, 0]]);
  assert.deepEqual(result.shape.rules!.at(-1), { kind: 'angle', a: 5, b: 0, value: 180 - Math.atan2(3, 4) * 90 / Math.PI });
  nativeStraightChamfer(result.shape, 20892); assert.deepEqual(source, before);
});

test('oblique Chamfer refuses incompatible angles, consumed sides and lost driving inputs atomically', () => {
  const source = angleConstrainedCorner();
  for (const value of [NaN, Infinity, 0, 180, 90, 140]) {
    const invalid = { ...source, rules: source.rules!.map((rule, i) => i === 2 && rule.kind === 'angle' ? { ...rule, value } : rule) };
    const before = structuredClone(invalid); assert.ok('error' in chamferCorner(invalid, 1, 6)); assert.deepEqual(invalid, before);
  }
  const cases: Polygon[] = [{ ...source, lengths: { 0: 30 } },
    { ...source, rules: [...source.rules!, { kind: 'fix', point: 1, at: [30, 0] }] },
    { ...source, circles: [{ c: [29, 1.65], r: 0.1 }], circleIds: ['e6'] },
  ];
  for (const invalid of cases) {
    const before = structuredClone(invalid); assert.ok('error' in chamferCorner(invalid, 1, 6)); assert.deepEqual(invalid, before);
  }
  const before = structuredClone(source);
  for (const value of [NaN, Infinity, -1, 0, 25, 30]) {
    assert.ok('error' in chamferCorner(source, 1, value)); assert.deepEqual(source, before);
  }
  const rightAngle = { ...rectangle, rules: [...rectangle.rules!, { kind: 'angle' as const, a: 0, b: 1, value: 90 }] };
  assert.ok('error' in chamferCorner(rightAngle, 1, 6), 'Authored right-angle admission stays outside this change');
});
