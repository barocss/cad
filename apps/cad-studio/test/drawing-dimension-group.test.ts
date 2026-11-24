import assert from 'node:assert/strict';
import test from 'node:test';
import type { DrawingDimension } from '@barocss/cad-model/drawing/types';
import type { Sheet } from '@barocss/cad-model/drawing/sheet';
import { dimensionPairLabelsMoved, dimensionPairPaperDelta, drawingDimensionPair, moveDrawingDimensionPair } from '../src/app/drawingDimensionGroup';

type LinearDimension = Extract<DrawingDimension, { kind: 'linear' }>;
const linear = (id: string, place: [number, number], orient: LinearDimension['orient'] = 'horizontal'): LinearDimension => ({
  id, kind: 'linear', view: 'front', place, orient,
  a: { edge: 'n1.side0|n1.bottom', at: 'end', near: [0, 0, 0] },
  b: { edge: 'n1.side0|n1.bottom', at: 'end', near: [64, 0, 0] },
});

test('one paper delta moves both placements along their common normal and preserves dimension references', () => {
  for (const orient of ['horizontal', 'vertical'] as const) {
    const first = linear('first', [3, 7], orient), second = linear('second', [13, 17], orient);
    const control = linear('control', [40, 50]);
    const dims = [first, second, control], pair = drawingDimensionPair(dims, dims, ['first', 'second'], () => true);
    assert.ok(pair);
    assert.equal(dimensionPairPaperDelta(pair, [50, 50], orient === 'horizontal' ? [90, 60.01] : [60.01, 90]), 10);
    const moved = moveDrawingDimensionPair(dims, pair, 2, 10);
    assert.deepEqual(moved.map(dim => dim.place), orient === 'horizontal' ? [[3, 2], [13, 12], [40, 50]] : [[8, 7], [18, 17], [40, 50]]);
    assert.equal(moved[2], control);
    for (let i = 0; i < 2; i++) {
      assert.deepEqual({ ...moved[i], place: dims[i].place }, dims[i]);
      assert.equal((moved[i] as LinearDimension).a, dims[i].a);
    }
    assert.equal(moveDrawingDimensionPair(dims, pair, 2, 0), dims);
    assert.equal(moveDrawingDimensionPair(dims, pair, Infinity, 10), dims);
    const replaced = [{ ...first }, second, control];
    assert.equal(moveDrawingDimensionPair(replaced, pair, 2, 10), replaced);
  }
});

test('duplicate, unresolved, mixed-view or mixed-direction choices cannot make a group', () => {
  const first = linear('first', [3, 7]), second = linear('second', [13, 17]);
  const dims = [first, second], ids = ['first', 'second'] as const;
  assert.equal(drawingDimensionPair(dims, [...dims, { ...second }], ids, () => true), undefined);
  assert.equal(drawingDimensionPair(dims, dims, ids, dim => dim.id === 'first'), undefined);
  assert.equal(drawingDimensionPair(dims, dims, ['first', 'first'], () => true), undefined);
  for (const other of [{ ...second, view: 'right' as const }, { ...second, orient: 'vertical' as const },
    { ...second, orient: 'aligned' as const }]) {
    const mixed = [first, other];
    assert.equal(drawingDimensionPair(mixed, mixed, ids, () => true), undefined);
  }
});

test('automatic label clearance cannot split the visible pair move or reposition an unselected label', () => {
  const pair = [linear('first', [0, 0]), linear('second', [0, 10])] as const;
  const labels = (a: number, b: number, c: number): Sheet => ({
    size: [297, 210], dimensions: [],
    groups: [['first', a], ['second', b], ['control', c]].map(([id, y]) => ({
      role: 'dimension', id: String(id), marks: [{ kind: 'text', at: [50, Number(y)], text: '64', size: 3, anchor: 'middle' }],
    })),
  });
  const fixture = labels(10, 20, 40);
  assert.equal(dimensionPairLabelsMoved(fixture, labels(20, 30, 40), pair, 10), true);
  assert.equal(dimensionPairLabelsMoved(fixture, labels(20, 31, 40), pair, 10), false);
  assert.equal(dimensionPairLabelsMoved(fixture, labels(20, 30, 41), pair, 10), false);
});
