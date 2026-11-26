import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addLinearPattern, commitDimension, constraintEntries, derivedPatternCircles, dimensionLabel, dimensionValue,
  drivingDimensionValue, findDerivedPatternCircle, linearPatternsProblem, patternCopyDimensionKeys, patternCopySideId,
  removeLinearPattern, solveShape, updateLinearPattern, type Polygon,
} from '../src/sketch/rules';
import { outlineOf, profileOf } from '../src/sketch/loops';
import { outlinePolygon, sketchShapes } from '../src/sketch/reopen';
import { outlineFields } from '../src/sketch/outlineFields';
import { pickSketch, sketchClick } from '../src/sketch/select';
import { xyPlane } from '../src/sketch/plane';
import type { SketchState } from '../src/sketch/types';
import { emptyDoc, type SketchNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { decodeStudioFile, encodeStudioFile } from '../src/engine/container';
import { readStudioDoc } from '../src/engine/migrate';

/** Analytic fixture from #223: [0,50] x [0,20] mm fixed rectangle with circle seed (5,10) R=2, Y=10 locked, X free. */
function makeBasePlate(): Polygon {
  const poly: Polygon = {
    kind: 'polygon',
    closed: true,
    points: [[0, 0], [50, 0], [50, 20], [0, 20]],
    bulges: [0, 0, 0, 0],
    hv: { h: [0, 2], v: [1, 3] },
    lengths: { 0: 50, 1: 20 },
    circles: [{ c: [5, 10], r: 2 }],
    circleIds: ['e5'],
    ids: ['e1', 'e2', 'e3', 'e4'],
    rules: [{ kind: 'cdy', a: 0, circle: 0, value: 10 }],
  };
  const solved = solveShape(poly);
  assert.equal(solved.ok, true);
  if (solved.ok) assert.equal(solved.dof, 1); // Only seed X is free.
  return poly;
}

test('sketch linear pattern drives seed X from copy k=2 X dimension (25 -> 27) with zero extra DOF and exact native Extrude volume 3000 - 36*pi', async () => {
  const base = makeBasePlate();
  const added = addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: 10, count: 3 });
  assert.equal(added.ok, true, !added.ok ? added.reason : '');
  if (!added.ok) return;
  assert.equal(added.patternId, 'sp1');
  assert.equal(added.report.dof, 1); // Derived copies add ZERO extra DOF.

  const copies0 = derivedPatternCircles(added.shape);
  assert.deepEqual(copies0.map(c => c.c), [[15, 10], [25, 10]]);
  assert.deepEqual(copies0.map(c => c.sideId), ['sp1_k1', 'sp1_k2']);

  // Constrain derived copy ordinal k=2 X from origin point 0 at 25 mm, then edit 25 -> 27 mm.
  const key = patternCopyDimensionKeys(0, 'sp1', 2).dx;
  assert.equal(key, 'pcdx0_sp1_2');
  assert.ok(Math.abs((dimensionValue(added.shape, key) ?? 0) - 25) < 1e-6);
  assert.ok(dimensionLabel(added.shape, key).includes('pattern sp1 copy #2'));

  const lock25 = commitDimension(added.shape, key, 25);
  assert.equal(lock25.ok, true, !lock25.ok ? lock25.reason : '');
  if (!lock25.ok) return;
  assert.equal(lock25.report.dof, 0);
  assert.equal(drivingDimensionValue(lock25.shape, key), 25);

  const moved27 = commitDimension(lock25.shape, key, 27);
  assert.equal(moved27.ok, true, !moved27.ok ? moved27.reason : '');
  if (!moved27.ok) return;
  assert.equal(moved27.report.dof, 0);
  // Independent analytic oracle: Xseed = 27 - 2 * 10 = 7; centers (7,10), (17,10), (27,10); R=2, Y=10 invariant.
  assert.ok(Math.abs(moved27.shape.circles![0].c[0] - 7) < 1e-6);
  assert.ok(Math.abs(moved27.shape.circles![0].c[1] - 10) < 1e-6);
  assert.equal(moved27.shape.circles![0].r, 2);
  const copies27 = derivedPatternCircles(moved27.shape);
  assert.ok(Math.abs(copies27[0].c[0] - 17) < 1e-6);
  assert.ok(Math.abs(copies27[0].c[1] - 10) < 1e-6);
  assert.ok(Math.abs(copies27[1].c[0] - 27) < 1e-6);
  assert.ok(Math.abs(copies27[1].c[1] - 10) < 1e-6);
  assert.ok(Math.abs(copies27[1].c[0] - moved27.shape.points[0][0] - 27) < 1e-7);

  // Over-defining seed X with an extra cdx0_0 must be refused.
  const overdef = commitDimension(moved27.shape, 'cdx0_0', 7);
  assert.equal(overdef.ok, false);

  // Downstream profileOf + native Extrude(height=3) -> exact volume 3000 - 36*pi mm^3.
  const prof = profileOf([moved27.shape]);
  assert.ok('node' in prof, 'error' in prof ? prof.error : '');
  if ('error' in prof) return;
  assert.equal(prof.node.holes?.length, 3);
  assert.deepEqual(prof.node.sideTags?.holes, [['e5'], ['sp1_k1'], ['sp1_k2']]);

  const doc: StudioDoc = {
    ...emptyDoc(),
    nodes: [
      { ...prof.node, id: 'n0' } as unknown as SketchNode,
      { kind: 'extrude', id: 'n1', sketch: 0, height: 3 },
    ],
    outputs: { b1: { node: 1, side: 'solid' } },
    nextId: 2,
  };
  const ev = evaluateDoc(doc, 1);
  assert.ok(ev.ok, ev.ok ? '' : JSON.stringify(ev.error));
  const expectedVolume = 50 * 20 * 3 - 3 * Math.PI * 2 * 2 * 3;
  assert.ok(Math.abs((ev.bodies[0].volume ?? 0) - expectedVolume) < 1e-3, `volume ${ev.bodies[0].volume} vs expected ${expectedVolume}`);

  // Reopen sketch: derived copies stay derived (never duplicated into `done`) and Feature Editor edits 27 -> 29.
  const reopened = sketchShapes(prof.node);
  assert.equal(reopened.done.length, 0);
  assert.equal(reopened.shape?.kind, 'polygon');
  if (reopened.shape?.kind === 'polygon') {
    assert.equal(reopened.shape.circles?.length, 1);
    assert.equal(reopened.shape.patterns?.length, 1);
    assert.deepEqual(derivedPatternCircles(reopened.shape).map(c => c.c[0]), [17, 27]);
  }
  const fields = outlineFields(doc.nodes, 0, '');
  const copyField = fields.find(f => f.key === 'opcdx0_sp1_2');
  assert.ok(copyField && copyField.kind === 'number');
  assert.equal(copyField.get(doc.nodes), 27);
  const editedNodes = copyField.set(doc.nodes, 29);
  const ev2 = evaluateDoc({ ...doc, nodes: editedNodes }, 2);
  assert.ok(ev2.ok, ev2.ok ? '' : JSON.stringify(ev2.error));
  assert.ok(Math.abs((ev2.bodies[0].volume ?? 0) - expectedVolume) < 1e-3);
  const reopened2 = sketchShapes(editedNodes[0] as SketchNode);
  assert.ok(reopened2.shape?.kind === 'polygon' && Math.abs(reopened2.shape.circles![0].c[0] - 9) < 1e-6);

  // .bcad Save / Open round-trip preserves pattern + copy constraint cleanly.
  const encoded = encodeStudioFile({ ...doc, nodes: editedNodes });
  const decoded = await decodeStudioFile(encoded);
  const read = readStudioDoc(decoded.text);
  assert.ok('doc' in read, 'error' in read ? read.error : '');
  const roundSketch = read.doc.nodes[0];
  assert.equal(roundSketch.kind, 'sketch');
  if (roundSketch.kind === 'sketch') {
    const r3 = sketchShapes(roundSketch);
    assert.equal(r3.done.length, 0);
    assert.equal(r3.shape?.kind === 'polygon' && r3.shape.patterns?.[0].id, 'sp1');
    assert.equal(r3.shape?.kind === 'polygon' && drivingDimensionValue(r3.shape, 'pcdx0_sp1_2'), 29);
  }
});

test('sketch linear pattern refuses count reduction while copy is referenced, allows explicit atomic drop, and never resurrects constraints or reuses deleted pattern IDs', () => {
  const base = makeBasePlate();
  const added = addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: 10, count: 3 });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  const locked = commitDimension(added.shape, 'pcdx0_sp1_2', 27);
  assert.equal(locked.ok, true);
  if (!locked.ok) return;
  assert.ok(constraintEntries(locked.shape).some(e => e.detail.includes('pattern sp1 copy #2 = 27')));

  // Count 3 -> 2 MUST be refused while copy #2 is referenced, leaving accepted sketch untouched.
  const refused = updateLinearPattern(locked.shape, 'sp1', { count: 2 });
  assert.equal(refused.ok, false);
  if (!refused.ok) {
    assert.equal(refused.blockingRuleIndices?.length, 1);
    assert.ok(refused.reason.includes('copy #2'));
  }

  // Explicit atomic drop removes ONLY the affected constraint and reduces count 3 -> 2.
  const reduced = updateLinearPattern(locked.shape, 'sp1', { count: 2 }, { dropReferencedConstraints: true });
  assert.equal(reduced.ok, true);
  if (!reduced.ok) return;
  assert.equal(reduced.removedRuleIndices.length, 1);
  assert.equal(reduced.shape.patterns![0].count, 2);
  assert.equal(drivingDimensionValue(reduced.shape, 'pcdx0_sp1_2'), undefined);
  assert.equal(findDerivedPatternCircle(reduced.shape, 'sp1', 2), null);
  assert.ok(Math.abs((findDerivedPatternCircle(reduced.shape, 'sp1', 1)?.c[0] ?? 0) - 17) < 1e-6);

  // Raising count 2 -> 3 must NOT resurrect the deleted constraint.
  const raised = updateLinearPattern(reduced.shape, 'sp1', { count: 3 });
  assert.equal(raised.ok, true);
  if (!raised.ok) return;
  assert.equal(drivingDimensionValue(raised.shape, 'pcdx0_sp1_2'), undefined);
  assert.equal(raised.report.dof, 1);

  // Deleting pattern sp1 and creating a new pattern at the same location gets fresh ID sp2 (never reuses sp1).
  const removed = removeLinearPattern(raised.shape, 'sp1');
  assert.equal(removed.ok, true);
  if (!removed.ok) return;
  assert.equal(removed.shape.patterns?.length, 0);
  assert.equal(removed.shape.patternSeq, 1);

  const recreated = addLinearPattern(removed.shape, { seedCircle: 0, axis: 'x', sign: 1, spacing: 10, count: 3 });
  assert.equal(recreated.ok, true);
  if (!recreated.ok) return;
  assert.equal(recreated.patternId, 'sp2');
  assert.equal(patternCopySideId(recreated.patternId, 2), 'sp2_k2');
});

test('sketch linear pattern rejects negative inputs, supports viewport pick/click, and refuses malformed saved patterns', () => {
  const base = makeBasePlate();
  assert.equal(addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: 10, count: 2.5 }).ok, false);
  assert.equal(addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: 10, count: 1 }).ok, false);
  assert.equal(addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: 0, count: 3 }).ok, false);
  assert.equal(addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: -10, count: 3 }).ok, false);
  assert.equal(addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: Number.NaN, count: 3 }).ok, false);
  assert.equal(addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: 3, count: 3 }).ok, false);
  assert.equal(addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: 23, count: 3 }).ok, false);
  assert.equal(addLinearPattern(base, { seedCircle: 5, axis: 'x', sign: 1, spacing: 10, count: 3 }).ok, false);

  const added = addLinearPattern(base, { seedCircle: 0, axis: 'x', sign: 1, spacing: 10, count: 3 });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(commitDimension(added.shape, 'pcdx0_sp1_2', 49).ok, false);
  assert.equal(addLinearPattern(added.shape, { seedCircle: 0, axis: 'y', sign: 1, spacing: 5, count: 2 }).ok, false);

  // Viewport picking & clicking derived copy #2 opens pcdx0_sp1_2 when paired with point 0.
  const proj = (u: number, v: number) => [u * 10, v * 10];
  const hitCopy2 = pickSketch(added.shape, proj, 250, 100);
  assert.deepEqual(hitCopy2, { kind: 'pattern-circle', pattern: 'sp1', i: 2 });
  const sk0: SketchState = { plane: xyPlane(), tool: 'dimension', shape: added.shape };
  const sk1 = sketchClick(sk0, { kind: 'point', i: 0 }, false);
  const sk2 = sketchClick(sk1, hitCopy2, false);
  assert.equal(sk2.editDim, 'pcdx0_sp1_2');

  // Malformed saved outline pattern is explicitly refused on sketchShapes reopen.
  const badOutline = outlineOf(added.shape)!;
  badOutline.patterns = [{ id: 'sp1', seedCircle: 0, axis: 'x', sign: 1, spacing: -5, count: 3 }];
  assert.ok(linearPatternsProblem(outlinePolygon(badOutline)));
  assert.throws(() => sketchShapes({ kind: 'sketch', profile: 'polygon', points: base.points, outline: badOutline }));
});
