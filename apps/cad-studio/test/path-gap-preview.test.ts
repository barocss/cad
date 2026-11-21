import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.equal(preparePathGap({ ...shape, bulges: [0, 0.5, 0, 0] }), null);
  assert.equal(preparePathGap({ ...shape, construction: undefined }, true), null);
});
