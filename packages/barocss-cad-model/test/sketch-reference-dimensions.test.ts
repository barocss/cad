import assert from 'node:assert/strict';
import test from 'node:test';
import { massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode, type SketchNode, type StudioDoc } from '../src/engine/doc';
import { encodeStudioFile, decodeStudioFile } from '../src/engine/container';
import { readStudioDoc } from '../src/engine/migrate';
import { partSnapshot } from '../src/engine/part';
import { editFields } from '../src/app/editFields';
import { carryPolygon } from '../src/sketch/entityIds';
import { profileOf } from '../src/sketch/loops';
import { sketchShapes } from '../src/sketch/reopen';
import { rectangleOutline } from '../src/sketch/select';
import {
  addReferenceDimension,
  commitDimension,
  convertDrivingToReference,
  convertReferenceToDriving,
  isConvertibleToReference,
  removeReferenceDimension,
  resolveReferenceDimension,
  solveShape,
  type Polygon,
} from '../src/sketch/rules';

const approx = (actual: number, expected: number, tol = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${expected} ± ${tol}, got ${actual}`);

function lockedRect30x40(): Polygon {
  let shape = rectangleOutline({ kind: 'rectangle', a: [0, 0], b: [30, 40], ids: ['e1', 'e2', 'e3', 'e4'] })!;
  shape = (commitDimension(shape, 'len0', 30) as { shape: Polygon }).shape;
  shape = (commitDimension(shape, 'len1', 40) as { shape: Polygon }).shape;
  return shape;
}

test('D2016 adds diagonal reference on fully constrained 30x40 rectangle without adding solver rows/rank/DOF and updates live on 30->60 width edit', async () => {
  const before = lockedRect30x40();
  const sBefore = solveShape(before);
  assert.ok(sBefore.ok);
  assert.equal(sBefore.dof, 0);

  // Driving diagonal on fully constrained rectangle is still refused by existing redundancy policy.
  const drivingDiag = commitDimension(before, 'dist0_2', 50);
  assert.ok(!drivingDiag.ok && /over-define/i.test(drivingDiag.reason), JSON.stringify(drivingDiag));

  // Reference diagonal succeeds without changing rows, rank, DOF, or points.
  const added = addReferenceDimension(before, 0, 2, 'distance');
  assert.ok(added.ok, !added.ok ? added.reason : '');
  const withRef = added.shape;
  const sAfter = solveShape(withRef);
  assert.ok(sAfter.ok);
  assert.equal(sAfter.rows, sBefore.rows);
  assert.equal(sAfter.rank, sBefore.rank);
  assert.equal(sAfter.dof, sBefore.dof);
  assert.deepEqual(withRef.points, before.points);

  // Stored by stable side IDs (e1, e3), NOT bare indices.
  assert.equal(withRef.references?.length, 1);
  assert.deepEqual(withRef.references![0], { id: 'ref1', kind: 'distance', aId: 'e1', bId: 'e3' });
  const r50 = resolveReferenceDimension(withRef, withRef.references![0]);
  assert.ok(r50.ok);
  approx(r50.value, 50);

  // Order-independent duplicate is refused.
  const dup = addReferenceDimension(withRef, 2, 0, 'distance');
  assert.ok(!dup.ok);

  // Extrude 5 mm -> exact volume 6000 mm^3, unaffected by reference presence.
  const built = profileOf([withRef]);
  assert.ok('node' in built);
  assert.equal(built.node.profile, 'rectangle', 'compact rectangle retained with persistent reference');
  let doc: StudioDoc = withNode(withNode(emptyDoc(), built.node), { kind: 'extrude', sketch: 0, height: 5 });
  approx(massPropertiesOf(partSnapshot(doc).outputs[0]).volume, 6000, 1e-6);

  // Edit width 30 -> 60 via Feature Editor -> volume becomes 12000 mm^3 and reopened diagonal reads sqrt(60^2 + 40^2).
  const widthField = editFields(doc.nodes, 1, doc.parameters).find(f => f.label === 'Width');
  assert.ok(widthField && widthField.kind === 'number');
  doc = { ...doc, nodes: widthField.set(doc.nodes, 60) };
  approx(massPropertiesOf(partSnapshot(doc).outputs[0]).volume, 12000, 1e-6);

  // Save/Open codec roundtrip preserves compact rectangle, sideTags, lengths, and persistent reference.
  const decoded = await decodeStudioFile(encodeStudioFile(doc));
  const read = readStudioDoc(decoded.text);
  assert.ok('doc' in read);
  const reopened = sketchShapes(read.doc.nodes[0] as SketchNode);
  assert.ok(reopened.shape && reopened.shape.kind === 'polygon');
  assert.equal(reopened.shape.references?.length, 1);
  const r72 = resolveReferenceDimension(reopened.shape, reopened.shape.references![0]);
  assert.ok(r72.ok);
  approx(r72.value, Math.hypot(60, 40), 1e-9);
});

test('D2016 supports driving <-> reference conversions, preserves full sub-display precision, and refuses over-defined/zero conversions', () => {
  // Start with 30.123456789 x 40 locked rectangle (0 DOF).
  let shape = rectangleOutline({ kind: 'rectangle', a: [0, 0], b: [30, 40], ids: ['e1', 'e2', 'e3', 'e4'] })!;
  shape = (commitDimension(shape, 'len0', 30.123456789) as { shape: Polygon }).shape;
  shape = (commitDimension(shape, 'len1', 40) as { shape: Polygon }).shape;
  const s0 = solveShape(shape);
  assert.ok(s0.ok && s0.dof === 0);

  // Eligibility check: straight length convertible, anchor/H/V not convertible.
  assert.equal(isConvertibleToReference(shape, 'len:0'), true);
  assert.equal(isConvertibleToReference(shape, 'anchor'), false);
  assert.equal(isConvertibleToReference(shape, 'h:0'), false);

  // Driving -> Reference on len:0: removes only width lock, DOF 0 -> 1, geometry unchanged!
  const toRef = convertDrivingToReference(shape, 'len:0');
  assert.ok(toRef.ok, !toRef.ok ? toRef.reason : '');
  const refShape = toRef.shape;
  assert.equal(refShape.lengths?.[0], undefined);
  assert.equal(refShape.lengths?.[1], 40);
  assert.deepEqual(refShape.points, shape.points);
  const s1 = solveShape(refShape);
  assert.ok(s1.ok && s1.dof === 1);

  const measured = resolveReferenceDimension(refShape, refShape.references![0]);
  assert.ok(measured.ok);
  approx(measured.value, 30.123456789, 1e-6);

  // Reference -> Driving: uses exact full-precision measured value (NOT rounded display text!), DOF 1 -> 0!
  const back = convertReferenceToDriving(refShape, toRef.refId);
  assert.ok(back.ok, !back.ok ? back.reason : '');
  assert.equal(back.shape.references, undefined);
  approx(back.shape.lengths![0], measured.value, 1e-12);
  const s2 = solveShape(back.shape);
  assert.ok(s2.ok && s2.dof === 0);

  // Over-defined Reference -> Driving (diagonal on fully constrained rect) is refused and preserves reference intact.
  const withDiag = addReferenceDimension(back.shape, 0, 2, 'distance');
  assert.ok(withDiag.ok);
  const refusedOver = convertReferenceToDriving(withDiag.shape, withDiag.refId);
  assert.ok(!refusedOver.ok && /over-define/i.test(refusedOver.reason), JSON.stringify(refusedOver));
  assert.equal(withDiag.shape.references?.length, 1);

  // Zero-distance horizontal reference between vertical edge endpoints (0,0)-(0,40): measures ~0, refuses driving conversion.
  const zeroDx = addReferenceDimension(refShape, 0, 3, 'dx');
  assert.ok(zeroDx.ok);
  const resolvedZero = resolveReferenceDimension(zeroDx.shape, zeroDx.shape.references!.find(r => r.id === zeroDx.refId)!);
  assert.ok(resolvedZero.ok && resolvedZero.value <= 1e-7);
  const refusedZero = convertReferenceToDriving(zeroDx.shape, zeroDx.refId);
  assert.ok(!refusedZero.ok && /zero-length/i.test(refusedZero.reason), JSON.stringify(refusedZero));

  // Removing reference leaves constraints & geometry unchanged.
  const removed = removeReferenceDimension(zeroDx.shape, zeroDx.refId);
  assert.equal(removed.references?.length, 1);
});

test('D2016 binds by stable side IDs across vertex insertion and reports unresolved (never silent index retarget) when an endpoint is deleted', () => {
  const base = lockedRect30x40();
  const added = addReferenceDimension(base, 0, 2, 'distance'); // e1 -> e3 (0,0) -> (30,40)
  assert.ok(added.ok);
  const withRef = added.shape;

  // Insert a vertex between point 0 and point 1 (shifts original indices 1,2,3 -> 2,3,4!).
  const insertedNext: Polygon = {
    kind: 'polygon',
    closed: true,
    points: [[0, 0], [15, 0], [30, 0], [30, 40], [0, 40]],
    bulges: [0, 0, 0, 0, 0],
    ids: ['e1', 'e5', 'e2', 'e3', 'e4'],
  };
  const carried = carryPolygon(withRef, insertedNext, [0, -1, 1, 2, 3]);
  assert.equal(carried.references?.length, 1);
  const resCarried = resolveReferenceDimension(carried, carried.references![0]);
  assert.ok(resCarried.ok, 'reference follows stable side IDs across vertex insertion');
  assert.equal(resCarried.a, 0);
  assert.equal(resCarried.b, 3); // shifted from index 2 to 3, still exact e3 = (30, 40)!
  approx(resCarried.value, 50);

  // Delete vertex e3 (index 2): even though index 2 now holds another point e4, reference MUST report unresolved!
  const deletedNext: Polygon = {
    kind: 'polygon',
    closed: true,
    points: [[0, 0], [30, 0], [0, 40]],
    bulges: [0, 0, 0],
    ids: ['e1', 'e2', 'e4'],
  };
  const afterDelete = carryPolygon(withRef, deletedNext, [0, 1, 3]);
  const resDeleted = resolveReferenceDimension(afterDelete, afterDelete.references![0]);
  assert.equal(resDeleted.ok, false, 'deleted endpoint must be reported unresolved, never retargeted by index');
  assert.equal(resDeleted.reason, 'unresolved');
  const refusedDrive = convertReferenceToDriving(afterDelete, afterDelete.references![0].id);
  assert.equal(refusedDrive.ok, false);
});
