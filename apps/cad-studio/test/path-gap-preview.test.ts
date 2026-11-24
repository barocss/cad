import test from 'node:test';
import assert from 'node:assert/strict';
import { arcOf, type P2 } from '@barocss/cad-model/sketch/profile';
import { preparePathGap, planPathGap } from '../src/sketch/pathGap';
import { pathGapPreviewDraft } from '../src/sketch/pathGapPreviewDraft';

test('valid line hover clears refusal and returns the new identity used by the preview', () => {
  const source = preparePathGap({ kind: 'polygon', closed: false, construction: true,
    points: [[20, 20], [44, 38]], ids: ['e5', 'e6'] });
  assert.ok(source);
  assert.equal(planPathGap(source, [21, 20.75], 4), null);
  const plan = planPathGap(source, [32, 29], 4); assert.ok(plan);
  const draft = { source, length: '4', notice: 'The gap must fit inside the line.' };
  assert.equal(pathGapPreviewDraft(draft, draft, null), draft);
  const next = pathGapPreviewDraft(draft, draft, plan)!;
  assert.notEqual(next, draft); assert.equal(next.notice, undefined);
  assert.equal(next.source, source); assert.equal(next.length, '4');
  assert.equal(pathGapPreviewDraft(next, next, plan), next);
  assert.equal(pathGapPreviewDraft(next, draft, plan), null);
  assert.equal(pathGapPreviewDraft(null, draft, plan), null);
  assert.equal(pathGapPreviewDraft(draft, { ...draft }, plan), null);
  assert.equal(draft.notice, 'The gap must fit inside the line.');
  assert.deepEqual(source.shape.ids, ['e5', 'e6']);
});
test('the same notice lifecycle accepts native arc and circle previews without changing plans', () => {
  const sources = [
    preparePathGap({ kind: 'circle', construction: true, c: [0, 0], r: 10, ids: ['e1'] }),
    preparePathGap({ kind: 'polygon', construction: true, closed: false, points: [[-10, 0], [10, 0]], bulges: [1, 0], ids: ['e2', 'e3'] }),
  ];
  for (const source of sources) {
    assert.ok(source);
    const plan = planPathGap(source, [0, -10], 4); assert.ok(plan);
    const saved = JSON.stringify(plan), current = { source, length: '4', notice: 'Previous refusal' };
    assert.equal(pathGapPreviewDraft(current, current, plan)?.notice, undefined);
    assert.equal(JSON.stringify(plan), saved);
  }
});

test('polyline gap chooses one straight span and refuses a corner or crossing', () => {
  const ids = ['e1', 'e2', 'e3', 'e4'];
  const shape = { kind: 'polygon', closed: false, construction: true, ids,
    points: [[16, 20], [20, 20], [44, 38], [44, 42]] } satisfies Parameters<typeof preparePathGap>[0];
  const source = preparePathGap(shape);
  assert.ok(source);
  const plan = planPathGap(source, [32, 29], 4);
  assert.ok(plan?.kind === 'polyline');
  assert.equal(plan.span, 1);
  assert.deepEqual([plan.cutA, plan.cutB], [[30.4, 27.8], [33.6, 30.2]]);
  assert.equal(planPathGap(source, [20, 20], 4), null);
  assert.deepEqual(shape.ids, ids);
  const crossing = preparePathGap({ ...shape, points: [[-6, -6], [6, 6], [-6, 6], [6, -6]] });
  assert.ok(crossing);
  assert.equal(planPathGap(crossing, [0, 0], 4), null);
  assert.equal(preparePathGap({ ...shape, closed: true }), null);
  assert.ok(preparePathGap({ ...shape, bulges: [0, 0.5, 0.5, 0] }));
  const ordinary = { ...shape, construction: undefined };
  assert.equal(preparePathGap(ordinary), null);
  const ordinarySource = preparePathGap(ordinary, true);
  assert.ok(ordinarySource?.kind === 'polyline');
  assert.equal(ordinarySource.shape, ordinary);
  assert.deepEqual(planPathGap(ordinarySource, [32, 29], 4), plan);
  assert.equal(planPathGap(ordinarySource, [20, 20], 4), null);
  assert.equal(preparePathGap({ ...ordinary, bulges: [0, 0.25, 0, 0] }, true), null);
  assert.equal(preparePathGap({ ...ordinary, lengths: { 1: 30 } }, true), null);
  const overlappingEnd = preparePathGap({ ...ordinary, points: [[0, 0], [20, 0], [20, 8], [4, -8]] }, true);
  assert.ok(overlappingEnd?.kind === 'polyline');
  assert.equal(planPathGap(overlappingEnd, [10, 0], 4), null);
});

function polyline(points: P2[], bulges: number[]) {
  return { kind: 'polygon' as const, closed: false, construction: true as const,
    points, bulges, ids: points.map((_, i) => `e${i + 1}`) };
}

function close(actual: number, expected: number, tolerance = 1e-5) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
}

test('one circular polyline span uses signed arc length and preserves its source', () => {
  for (const sign of [1, -1]) {
    const shape = polyline([[34, 20], [30, 20], [10, 20], [6, 20]], [0, sign, 0, 0]);
    const saved = JSON.stringify(shape), source = preparePathGap(shape);
    assert.ok(source?.kind === 'polyline');
    const plan = planPathGap(source, [20, 20 + sign * 9.5], 4);
    assert.ok(plan?.kind === 'polyline');
    assert.equal(plan.span, 1);
    const y = sign > 0 ? 29.800666 : 10.199334;
    assert.deepEqual([plan.cutA, plan.cutB], [[21.986693, y], [18.013307, y]]);
    close(plan.hit[0], 20); close(plan.hit[1], 20 + sign * 10);
    close(Math.hypot(plan.cutA[0] - plan.cutB[0], plan.cutA[1] - plan.cutB[1]), 20 * Math.sin(0.2));
    assert.ok(plan.removed.length > 2);
    assert.deepEqual([plan.removed[0], plan.removed.at(-1)], [plan.cutA, plan.cutB]);
    let retainedLength = 0;
    for (const [i, [a, b]] of ([[shape.points[1], plan.cutA], [plan.cutB, shape.points[2]]] as const).entries()) {
      const retained = arcOf(a, b, plan.bulges[i]);
      assert.equal(Math.sign(retained.sweep), sign);
      close(retained.center[0], 20); close(retained.center[1], 20); close(retained.radius, 10);
      close(retained.sweep, sign * (Math.PI / 2 - 0.2), 2e-9);
      close(retained.radius * Math.abs(retained.sweep), 5 * Math.PI - 2);
      retainedLength += retained.radius * Math.abs(retained.sweep);
    }
    close(retainedLength + 4, 10 * Math.PI);
    assert.equal(JSON.stringify(shape), saved);
  }
});

test('finite arc selection uses the curved span instead of its chord or unused circle sector', () => {
  const source = preparePathGap(polyline([[30, 20], [10, 20], [10, 28], [30, 28]], [1, 0, 0]));
  assert.ok(source);
  const arc = planPathGap(source, [20, 30], 4);
  assert.ok(arc?.kind === 'polyline'); assert.equal(arc.span, 0);
  // The closest straight span cannot fit this cut; do not fall back to the longer arc.
  assert.equal(planPathGap(source, [20, 28], 24), null);
  const lower = preparePathGap(polyline([[10, 0], [-10, 0], [-10, -10], [10, -10]], [1, 0, 0]));
  assert.ok(lower);
  const line = planPathGap(lower, [0, -10], 4);
  assert.ok(line?.kind === 'polyline'); assert.equal(line.span, 2);
  assert.deepEqual([line.cutA, line.cutB, line.bulges], [[-2, -10], [2, -10], [0, 0]]);
  // An off-sector radial projection is not a point on the finite arc.
  assert.equal(planPathGap(lower, [10.1, -0.1], 4), null);
});

test('both signed sweeps cross the angle seam and a major arc retains its long sweep', () => {
  for (const sign of [1, -1]) {
    const source = preparePathGap(polyline([[4, sign * 10], [0, sign * 10], [0, -sign * 10], [4, -sign * 10]], [0, sign, 0]));
    assert.ok(source);
    const plan = planPathGap(source, [-10, 0], 4);
    assert.ok(plan?.kind === 'polyline'); assert.equal(plan.span, 1);
    assert.deepEqual(planPathGap(source, [-10, -0], 4), plan);
    assert.deepEqual([plan.cutA, plan.cutB], [[-9.800666, sign * 1.986693], [-9.800666, -sign * 1.986693]]);
    assert.ok(plan.bulges.every(bulge => Math.sign(bulge) === sign));
  }
  const major = preparePathGap(polyline([[-4, 10], [0, 10], [10, 20], [10, 24]], [0, 1 + Math.SQRT2, 0]));
  assert.ok(major?.kind === 'polyline');
  const plan = planPathGap(major, [10, 0], 4);
  assert.ok(plan?.kind === 'polyline'); assert.equal(plan.span, 1);
  const head = arcOf(major.shape.points[1], plan.cutA, plan.bulges[0]);
  const tail = arcOf(plan.cutB, major.shape.points[2], plan.bulges[1]);
  assert.ok(tail.sweep > Math.PI / 2);
  close(head.radius * head.sweep + tail.radius * tail.sweep + 4, 15 * Math.PI);
});

test('mixed polylines refuse corner, neighboring-span ambiguity and cut-end attachment', () => {
  const source = preparePathGap(polyline([[34, 20], [30, 20], [10, 20], [6, 20]], [0, 1, 0]));
  assert.ok(source);
  for (const pointer of [[30, 20], [10, 20], [29.95, 21], [20, 20], [20, Infinity]] as P2[])
    assert.equal(planPathGap(source, pointer, 4), null);
  for (const gap of [0, 1e-4, NaN, Infinity, 10 * Math.PI, 10 * Math.PI - 0.0004])
    assert.equal(planPathGap(source, [20, 30], gap), null);
  const neighbor = preparePathGap(polyline([[30, 20], [10, 20], [10, 30.00005], [30, 30.00005]], [1, 0, 0]));
  assert.ok(neighbor);
  assert.equal(planPathGap(neighbor, [20, 30], 4), null);
  const attached = preparePathGap(polyline([[30, 20], [10, 20], [10, 29.800666], [30, 29.800666]], [1, 0, 0]));
  assert.ok(attached);
  assert.equal(planPathGap(attached, [20, 30], 4), null);
});

test('mixed polyline admission requires independent finite circular spans', () => {
  const shape = polyline([[34, 20], [30, 20], [10, 20], [6, 20]], [0, 1, 0]);
  for (const changed of [
    { closed: true }, { construction: undefined }, { pending: true }, { ids: ['e1', 'e2', 'e3', 'e3'] },
    { lengths: { 0: 4 } }, { radii: { 1: 10 } }, { tangents: [0] }, { fromSpline: true as const },
    { bulges: [1, NaN, 0] }, { bulges: [0, NaN, 0] }, { bulges: [0, Infinity, 0] },
    { bulges: [0, Number.MIN_VALUE, 0] }, { bulges: [0, Number.MAX_VALUE, 0] },
  ]) assert.equal(preparePathGap({ ...shape, ...changed }), null);
  assert.equal(preparePathGap(polyline([[9899, 0], [9999, -100], [9999, -110]], [Math.SQRT2 - 1, 0])), null);
  // The final vertex has no outgoing span in an open path.
  assert.ok(preparePathGap({ ...shape, bulges: [0, 1, 0, 1] }));
});

test('a gap inside a three-arc chain keeps signed arc length and the untouched source', () => {
  for (const sign of [1, -1]) {
    const shape = polyline([[54, 20], [50, 20], [30, 20], [10, 20], [-10, 20], [-14, 20]], [0, -sign, sign, -sign, 0, 0]);
    const saved = JSON.stringify(shape), source = preparePathGap(shape);
    assert.ok(source?.kind === 'polyline');
    // All three original circles have R10. The middle arc has the opposite direction.
    for (const [span, centerX, direction] of [[1, 40, -sign], [2, 20, sign], [3, 0, -sign]]) {
      const plan = planPathGap(source, [centerX, 20 + direction * 10], 4);
      assert.ok(plan?.kind === 'polyline'); assert.equal(plan.span, span);
      const y = 20 + direction * 10 * Math.cos(0.2);
      close(plan.cutA[0], centerX + 10 * Math.sin(0.2), 1e-6);
      close(plan.cutB[0], centerX - 10 * Math.sin(0.2), 1e-6);
      close(plan.cutA[1], y, 1e-6); close(plan.cutB[1], y, 1e-6);
      const chord = Math.hypot(plan.cutA[0] - plan.cutB[0], plan.cutA[1] - plan.cutB[1]);
      close(20 * Math.asin(chord / 20), 4);
      for (const [i, [a, b]] of ([[shape.points[span], plan.cutA], [plan.cutB, shape.points[span + 1]]] as const).entries()) {
        const retained = arcOf(a, b, plan.bulges[i]);
        close(retained.center[0], centerX); close(retained.center[1], 20); close(retained.radius, 10);
        close(retained.sweep, direction * (Math.PI / 2 - 0.2), 2e-9);
        close(retained.radius * Math.abs(retained.sweep), 5 * Math.PI - 2);
      }
    }
    for (const pointer of [[30, 20], [10, 20], [29.95, 20 + sign]] as P2[])
      assert.equal(planPathGap(source, pointer, 4), null);
    assert.equal(planPathGap(source, [20, 20 + sign * 10], 10 * Math.PI - 0.0004), null);
    assert.equal(JSON.stringify(shape), saved);
  }
});

test('multiple arcs use finite sweeps for span selection and leave straight spans available', () => {
  const source = preparePathGap(polyline([[10, 0], [-10, 0], [-10, -12], [10, -12], [10, -32], [-10, -32]], [1, 0, 0, 0, -1, 0]));
  assert.ok(source);
  // The pointer is nearer the first full circle, but outside that arc's finite sweep.
  const line = planPathGap(source, [0, -6], 4);
  assert.ok(line?.kind === 'polyline'); assert.equal(line.span, 2);
  assert.deepEqual([line.cutA, line.cutB, line.bulges], [[-2, -12], [2, -12], [0, 0]]);
  const arc = planPathGap(source, [0, -42], 4);
  assert.ok(arc?.kind === 'polyline'); assert.equal(arc.span, 4);
  assert.ok(arc.bulges.every(bulge => bulge < 0));
  assert.equal(planPathGap(source, [0, -6], 24), null);
});

test('multiple arcs refuse overlapping and near-coincident finite picks', () => {
  const overlap = preparePathGap(polyline([[10, 0], [-10, 0], [10, 0], [-10, 0], [-14, 0]], [1, -1, 1, 0, 0]));
  assert.ok(overlap);
  assert.equal(planPathGap(overlap, [0, 10], 4), null);
  const neighbor = preparePathGap(polyline([[30, 20], [10, 20], [0, 15], [10, 20.00005], [30, 20.00005], [34, 20.00005]], [1, 0, 0, -1, 0, 0]));
  assert.ok(neighbor);
  assert.equal(planPathGap(neighbor, [20, 30], 4), null);
});

test('a cut end refuses another true arc and ignores its unused circle sector', () => {
  const points: P2[] = [[30, 20], [10, 20], [16.986693, 34.800666], [26.986693, 34.800666]];
  // The second lower semicircle touches the first cut end at its interior, away from its chord.
  const attached = preparePathGap(polyline(points, [1, 0, 1, 0]));
  assert.ok(attached);
  assert.equal(planPathGap(attached, [20, 30], 4), null);
  const clear = preparePathGap(polyline(points, [1, 0, -1, 0]));
  assert.ok(clear);
  const plan = planPathGap(clear, [20, 30], 4);
  assert.ok(plan?.kind === 'polyline'); assert.equal(plan.span, 0);
});

test('a major arc still crosses the angle seam between other circular spans', () => {
  const source = preparePathGap(polyline([[-4, 10], [0, 10], [10, 20], [10, 24]], [0.5, 1 + Math.SQRT2, -0.5, 0]));
  assert.ok(source);
  const plan = planPathGap(source, [10, 0], 4);
  assert.ok(plan?.kind === 'polyline'); assert.equal(plan.span, 1);
  assert.deepEqual([plan.cutA, plan.cutB], [[8.013307, 0.199334], [11.986693, 0.199334]]);
  assert.ok(plan.bulges.every(bulge => bulge > 0));
});
