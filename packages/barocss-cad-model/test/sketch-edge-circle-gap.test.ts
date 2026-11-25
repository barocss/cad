import assert from 'node:assert/strict';
import test from 'node:test';
import {
  commitDimension,
  constraintEntries,
  dimensionLabel,
  dimensionValue,
  drivingDimensionValue,
  edgeCircleGapEndpoints,
  edgeCircleGapGeometry,
  edgeCircleGapKey,
  edgeCircleKey,
  removeConstraint,
  solveShape,
  type Polygon,
} from '../src/sketch/rules';
import { profileOf } from '../src/sketch/loops';
import { outlineFields } from '../src/sketch/outlineFields';
import { outlineMobility } from '../src/sketch/mobility';
import { sketchShapes } from '../src/sketch/reopen';
import { partSnapshot } from '../src/engine/part';
import { faceGeometry, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';

const close = (points: [number, number][], circles?: { c: [number, number]; r: number }[]): Polygon => ({
  kind: 'polygon',
  points,
  closed: true,
  bulges: points.map(() => 0),
  ...(circles ? { circles } : {}),
});

function lockedRectWithHole(center: [number, number] = [10, 15], r = 4): Polygon {
  let shape = close([[0, 0], [40, 0], [40, 30], [0, 30]], [{ c: center, r }]);
  let res = commitDimension(shape, 'len0', 40);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;
  res = commitDimension(shape, 'len1', 30);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  return res.shape;
}

const approx = (actual: number, expected: number, tol = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected} ± ${tol}, got ${actual}`);

test('D2014 analytic fixture: cgap edits G and preserves G across diameter edits, Extrude B-rep exact', () => {
  let shape = lockedRectWithHole([10, 15], 4);
  // Lock Y centre distance to bottom edge 0 (y = 0) at 15 mm.
  let res = commitDimension(shape, 'cedge0_0', 15);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;

  // Left vertical edge 3 (x = 0): key, label, current measured gap = 10 - 4 = 6.
  assert.equal(edgeCircleKey(shape, 3, 0), 'cedge3_0');
  assert.equal(edgeCircleGapKey(shape, 3, 0), 'cgap3_0');
  assert.equal(dimensionLabel(shape, 'cgap3_0'), 'Gap edge 4 – circle 1');
  approx(dimensionValue(shape, 'cgap3_0')!, 6);
  assert.equal(drivingDimensionValue(shape, 'cgap3_0'), undefined);

  const g0 = edgeCircleGapGeometry(shape, 3, 0);
  assert.ok(g0);
  assert.equal(g0.axis, 0);
  assert.equal(g0.side, 1);
  assert.deepEqual(g0.foot, [0, 15]);
  assert.deepEqual(g0.nearest, [6, 15]);
  approx(g0.gap, 6);

  // Add driving gap G = 6 mm on left edge.
  res = commitDimension(shape, 'cgap3_0', 6);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;
  assert.equal(drivingDimensionValue(shape, 'cgap3_0'), 6);
  approx(shape.circles![0].c[0], 10);
  approx(shape.circles![0].c[1], 15);
  const solved = solveShape(shape);
  assert.ok(solved.ok);
  assert.equal(solved.dof, 0);
  const gapEntry = constraintEntries(shape).find(e => e.label === 'Gap');
  assert.ok(gapEntry);
  assert.equal(gapEntry.detail, 'edge 4 – circle 1 = 6');

  // Edit G: 6 -> 8 mm => center moves to (12, 15), nearest circumference at (8, 15).
  res = commitDimension(shape, 'cgap3_0', 8);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;
  approx(shape.circles![0].c[0], 12);
  approx(shape.circles![0].c[1], 15);
  const g1 = edgeCircleGapGeometry(shape, 3, 0)!;
  assert.deepEqual(g1.foot, [0, 15]);
  assert.deepEqual(g1.nearest, [8, 15]);
  approx(g1.gap, 8);

  // Edit circle diameter: 8 -> 10 mm (r: 4 -> 5) => center moves to (13, 15), G remains 8 mm!
  res = commitDimension(shape, 'cdia0', 10);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;
  approx(shape.circles![0].r, 5);
  approx(shape.circles![0].c[0], 13);
  approx(shape.circles![0].c[1], 15);
  assert.equal(drivingDimensionValue(shape, 'cgap3_0'), 8);
  const g2 = edgeCircleGapGeometry(shape, 3, 0)!;
  assert.deepEqual(g2.foot, [0, 15]);
  assert.deepEqual(g2.nearest, [8, 15]);
  approx(g2.gap, 8);

  // Endpoints helper matches exact foot and nearest circumference.
  const cgapRule = shape.rules!.find(r => r.kind === 'cgap');
  assert.ok(cgapRule && cgapRule.kind === 'cgap');
  const ends = edgeCircleGapEndpoints(shape.points, cgapRule.edge, cgapRule.axis, cgapRule.side, shape.circles![0]);
  assert.ok(ends);
  assert.deepEqual(ends.foot, [0, 15]);
  assert.deepEqual(ends.nearest, [8, 15]);

  // Finish -> Extrude 2 mm -> exact native B-rep volume and cylinder axis.
  const built = profileOf([shape]);
  assert.ok('node' in built, 'error' in built ? built.error : '');
  const doc = withNode(withNode(emptyDoc(), built.node), { kind: 'extrude', sketch: 0, height: 2 });
  const evaluated = partSnapshot(doc);
  assert.equal(evaluated.outputs.length, 1);
  const body = evaluated.outputs[0];
  const props = massPropertiesOf(body);
  const expectedVol = 2400 - 50 * Math.PI;
  approx(props.volume, expectedVol, 1e-4);
  approx(props.centroid[0], (2400 * 20 - 50 * Math.PI * 13) / expectedVol, 1e-6);
  approx(props.centroid[1], (2400 * 15 - 50 * Math.PI * 15) / expectedVol, 1e-6);
  const cylGeom = body.brep.faces.map(f => faceGeometry(f)).find(g => g.kind === 'cylinder');
  assert.ok(cylGeom && cylGeom.kind === 'cylinder');
  approx(cylGeom.r, 5, 1e-6);
  approx(cylGeom.c[0], 13, 1e-6);
  approx(cylGeom.c[1], 15, 1e-6);
});

test('D2014 supports right, bottom, top edges, reversed CW winding, and transformed sketch plane', () => {
  // Right edge (x = 40, edge 1, side = -1) & Top edge (y = 30, edge 2, side = -1).
  let shape = lockedRectWithHole([28, 18], 4);
  let res = commitDimension(shape, 'cgap1_0', 8); // 40 - 8 - 4 = 28
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;
  res = commitDimension(shape, 'cgap2_0', 8); // 30 - 8 - 4 = 18
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;
  approx(shape.circles![0].c[0], 28);
  approx(shape.circles![0].c[1], 18);

  // Grow diameter 8 -> 12 (r: 4 -> 6) => C = (40 - 8 - 6, 30 - 8 - 6) = (26, 16).
  res = commitDimension(shape, 'cdia0', 12);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;
  approx(shape.circles![0].c[0], 26);
  approx(shape.circles![0].c[1], 16);

  // Reversed (CW) outline winding: [(0,0), (0,30), (40,30), (40,0)] -> left edge is edge 0 (vertical x=0).
  let cw = close([[0, 0], [0, 30], [40, 30], [40, 0]], [{ c: [10, 15], r: 4 }]);
  cw = (commitDimension(cw, 'len0', 30) as { shape: Polygon }).shape;
  cw = (commitDimension(cw, 'len1', 40) as { shape: Polygon }).shape;
  cw = (commitDimension(cw, 'cedge3_0', 15) as { shape: Polygon }).shape;
  res = commitDimension(cw, 'cgap0_0', 8);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  cw = res.shape;
  approx(cw.circles![0].c[0], 12);
  res = commitDimension(cw, 'cdia0', 10);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  cw = res.shape;
  approx(cw.circles![0].c[0], 13);
  approx(cw.circles![0].c[1], 15);

  // Transformed rigid workplane preserves exact extruded volume.
  const built = profileOf([cw]);
  assert.ok('node' in built);
  const planeDoc = withNode(
    withNode(emptyDoc(), { ...built.node, plane: { origin: [10, 20, 5], normal: [0, 0, 1], xAxis: [0, 1, 0] } }),
    { kind: 'extrude', sketch: 0, height: 2 },
  );
  const evaluated = partSnapshot(planeDoc);
  approx(massPropertiesOf(evaluated.outputs[0]).volume, 2400 - 50 * Math.PI, 1e-4);
});

test('D2014 preserves sub-display precision, feature editor fields, reopen, JSON roundtrip, and mobility', () => {
  let shape = lockedRectWithHole([10.25, 15], 4.125);
  let mob = outlineMobility(shape);
  assert.ok(mob?.circleDirections?.[0]?.motion?.dimension === 2);

  let res = commitDimension(shape, 'cgap3_0', 6.125);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;
  mob = outlineMobility(shape);
  assert.ok(mob?.circleDirections?.[0]?.motion?.dimension === 1);
  approx(mob.circleDirections[0].motion.direction[0], 0, 1e-12);
  approx(Math.abs(mob.circleDirections[0].motion.direction[1]), 1, 1e-12);

  res = commitDimension(shape, 'cedge0_0', 15);
  assert.ok(res.ok, !res.ok ? res.reason : '');
  shape = res.shape;
  mob = outlineMobility(shape);
  assert.equal(mob?.circleDirections?.length, 0);

  assert.equal(drivingDimensionValue(shape, 'cgap3_0'), 6.125);
  approx(shape.circles![0].c[0], 10.25);

  // Profile -> JSON roundtrip -> outlineFields edits both gap and diameter.
  const built = profileOf([shape]);
  assert.ok('node' in built);
  const roundtripped: StudioDoc = JSON.parse(JSON.stringify(
    withNode(withNode(emptyDoc(), built.node), { kind: 'extrude', sketch: 0, height: 2 }),
  ));
  const fields = outlineFields(roundtripped.nodes, 0, '');
  const gapField = fields.find(f => f.label === 'Gap edge 4 – circle 1');
  const diaField = fields.find(f => f.label === 'Diameter of circle 1');
  assert.ok(gapField && gapField.kind === 'number');
  assert.ok(diaField && diaField.kind === 'number');
  assert.equal(gapField.get(roundtripped.nodes), 6.125);
  assert.equal(diaField.get(roundtripped.nodes), 8.25);

  // Edit gap to 8 via feature editor, then diameter to 10 (r=5) => center at (13, 15), gap stays 8.
  let nodes = gapField.set(roundtripped.nodes, 8);
  assert.equal(gapField.get(nodes), 8);
  nodes = diaField.set(nodes, 10);
  assert.equal(gapField.get(nodes), 8);
  assert.equal(diaField.get(nodes), 10);

  const reopened = sketchShapes(nodes[0] as Extract<StudioDoc['nodes'][number], { kind: 'sketch' }>);
  assert.ok(reopened.shape && reopened.shape.kind === 'polygon');
  approx(reopened.shape.circles![0].c[0], 13);
  approx(reopened.shape.circles![0].c[1], 15);
  approx(reopened.shape.circles![0].r, 5);
  assert.equal(drivingDimensionValue(reopened.shape, 'cgap3_0'), 8);
});

test('D2014 refuses invalid values, out-of-segment feet, non-HV/arc edges, conflicts, and preserves cedge behavior', () => {
  let shape = lockedRectWithHole([10, 15], 4);
  shape = (commitDimension(shape, 'cedge0_0', 15) as { shape: Polygon }).shape;

  // Non-positive or non-finite values refused cleanly (never turned into ctan).
  for (const bad of [0, -1, -0.001, NaN, Infinity, -Infinity]) {
    const r = commitDimension(shape, 'cgap3_0', bad);
    assert.ok(!r.ok, `expected refusal for ${bad}`);
    assert.match(r.reason, /greater than 0/i);
  }
  assert.equal(shape.rules?.some(r => r.kind === 'ctan'), false);

  // Oversized gap pushing circle across opposite edge refused.
  const tooBigGap = commitDimension(shape, 'cgap3_0', 35);
  assert.ok(!tooBigGap.ok && /across the edge/i.test(tooBigGap.reason), JSON.stringify(tooBigGap));

  // Add valid gap = 8, then verify oversized diameter is refused cleanly.
  const added = commitDimension(shape, 'cgap3_0', 8);
  assert.ok(added.ok);
  const withGap = added.shape;
  const tooBigDia = commitDimension(withGap, 'cdia0', 40);
  assert.ok(!tooBigDia.ok, 'expected oversized diameter refusal');

  // Co-existing cedge + cgap on same edge/circle refused in both orders.
  const cedgeOnSame = commitDimension(withGap, 'cedge3_0', 12);
  assert.ok(!cedgeOnSame.ok && /already has a circumference gap/i.test(cedgeOnSame.reason), JSON.stringify(cedgeOnSame));

  const withCedge = (commitDimension(shape, 'cedge3_0', 10) as { shape: Polygon }).shape;
  const cgapOnSame = commitDimension(withCedge, 'cgap3_0', 6);
  assert.ok(!cgapOnSame.ok && /already has a centre distance/i.test(cgapOnSame.reason), JSON.stringify(cgapOnSame));

  // Existing cedge keeps center fixed across diameter edits (distinct from cgap!).
  const cedgeResized = commitDimension(withCedge, 'cdia0', 10);
  assert.ok(cedgeResized.ok);
  approx(cedgeResized.shape.circles![0].c[0], 10);
  approx(cedgeResized.shape.circles![0].r, 5);

  // Opposite-edge conflicting/redundant cgap refused.
  const redundantOpp = commitDimension(withGap, 'cgap1_0', 24); // 8 + 8 + 24 = 40 -> over-defined
  assert.ok(!redundantOpp.ok, 'expected opposite-edge redundant cgap refusal');
  const conflictOpp = commitDimension(withGap, 'cgap1_0', 20); // 8 + 8 + 20 != 40 -> conflict
  assert.ok(!conflictOpp.ok, 'expected opposite-edge conflicting cgap refusal');

  // Removing cgap rule restores free X motion.
  const gapEntry = constraintEntries(withGap).find(e => e.label === 'Gap')!;
  const removed = removeConstraint(withGap, gapEntry.id);
  assert.equal(drivingDimensionValue(removed, 'cgap3_0'), undefined);

  // Slanted edge and arc edge refuse cgap.
  const slanted = close([[0, 0], [40, 0], [35, 30], [0, 30]], [{ c: [15, 15], r: 3 }]);
  assert.equal(edgeCircleGapKey(slanted, 1, 0), null);
  assert.ok(!commitDimension(slanted, 'cgap1_0', 10).ok);

  const arced: Polygon = {
    kind: 'polygon',
    points: [[0, 0], [40, 0], [40, 30], [0, 30]],
    closed: true,
    bulges: [0, 0.25, 0, 0],
    circles: [{ c: [15, 15], r: 3 }],
  };
  assert.equal(edgeCircleGapKey(arced, 1, 0), null);
  assert.ok(!commitDimension(arced, 'cgap1_0', 10).ok);

  // Foot outside finite edge segment (L-shape where notch vertical edge spans y = 0..10 while circle is at y = 20).
  const lShape = close(
    [[0, 0], [20, 0], [20, 10], [40, 10], [40, 30], [0, 30]],
    [{ c: [10, 20], r: 3 }],
  );
  // Edge 1 runs (20,0)->(20,10): foot for y=20 is (20,20), outside [0, 10]!
  assert.equal(edgeCircleGapKey(lShape, 1, 0), null);
  assert.ok(!commitDimension(lShape, 'cgap1_0', 7).ok);
  // Edge 5 runs (0,30)->(0,0): foot for y=20 is (0,20), strictly inside [0, 30]!
  assert.equal(edgeCircleGapKey(lShape, 5, 0), 'cgap5_0');
});
