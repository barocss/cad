import test from 'node:test';
import assert from 'node:assert/strict';
import { readDrawing } from '@barocss/cad-model/drawing/types';
import { addFitList, fitListScopeProblem, moveFitList, removeFitList } from '../src/ui/drawing/fitListSettings';

test('fit list explicit settings preserve existing tables and store no derived rows', () => {
  const original = readDrawing({ tables: [{ id: 'fits', rows: [['manual']], columns: [{ key: 'a', label: 'A' }] }] });
  const saved = structuredClone(original), next = addFitList(original);
  assert.deepEqual(original, saved);
  assert.deepEqual(next.tables?.[1], { id: 'fits2', from: 'fits' });
  assert.equal(addFitList(next), next);
  const moved = moveFitList(next, 'fits2', '20.25', '35.5'); assert.ok(moved);
  assert.deepEqual(moved.tables?.[1], { id: 'fits2', from: 'fits', at: [20.25, 35.5] });
  assert.equal(moved.tables?.[0], original.tables?.[0]);
  assert.equal(moveFitList(moved, 'fits2', '20.25', '35.5'), moved);
  assert.deepEqual(removeFitList(moved, 'fits2'), original);
  assert.equal(removeFitList(moved, 'fits'), moved, 'manual table cannot be removed as fits');
});
test('fit list position refuses blank/nonfinite/missing source without changing settings', () => {
  const settings = addFitList(readDrawing(undefined)), saved = structuredClone(settings);
  for (const [x,y] of [['','2'],['1',' '],['NaN','2'],['1','Infinity'],['1e999','2']]) assert.equal(moveFitList(settings,'fits',x,y),null);
  assert.equal(moveFitList(settings,'missing','1','2'),null);
  assert.deepEqual(settings,saved);
});
test('fit list UI scope reads whole drawing, not a stripped sheet or instance document', () => {
  const settings = readDrawing(undefined);
  assert.equal(fitListScopeProblem(settings),null);
  assert.match(fitListScopeProblem({ ...settings, scope: { kind: 'assembly' } })!,/base part/);
  assert.match(fitListScopeProblem({ ...settings, scope: { kind: 'part', part: 'p1' } })!,/base part/);
  assert.match(fitListScopeProblem({ ...settings, sheets: [{id:'s2', views:['top']}] })!,/single sheet/);
});
