import test from 'node:test';
import assert from 'node:assert/strict';
import { coordinateMessage, currentCoordinateFeedback } from '../src/sketch/coordinateFeedback';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import type { SketchShape } from '@barocss/cad-model/sketch/types';
const source: SketchShape = { kind: 'polygon', closed: true, points: [[10,14],[50,14],[50,34],[10,34]], bulges: [0,0,0,0] };
const intent = { source, point: 2, axis: 0 as const, requested: 51 };
test('reports only the requested and settled coordinates, without changing source or attributing an indirect constraint', () => {
  const before = JSON.stringify(source), message = coordinateMessage(intent, source, source, null);
  assert.equal(message, 'Point 3 X is 50 mm, not the requested 51 mm. The current constraints did not retain that coordinate.');
  assert.equal(JSON.stringify(source), before);
  assert.equal(coordinateMessage({ ...intent, requested: 50 }, source, source, null), null);
  assert.equal(coordinateMessage({ ...intent, requested: 50.00000001 }, source, source, null), null);
});
test('refusal, stale source, malformed intent and curved outline never get success-mismatch guidance', () => {
  assert.equal(coordinateMessage(intent, source, source, 'Solver failure'), null);
  assert.equal(coordinateMessage(intent, structuredClone(source), source, null), null);
  for (const requested of [NaN, Infinity]) assert.equal(coordinateMessage({ ...intent, requested }, source, source, null), null);
  for (const point of [-1, 99, .5]) assert.equal(coordinateMessage({ ...intent, point }, source, source, null), null);
  const arc = { ...source, bulges: [0, .2, 0, 0] };
  assert.equal(coordinateMessage({ ...intent, source: arc }, arc, arc, null), null);
});
test('document, exact settled shape and draft generation own guidance; Undo cannot resurrect a receipt', () => {
  const doc = rectanglePart(40,20,2), receipt = { doc, shape: source, generation: 7, message: 'result' };
  assert.equal(currentCoordinateFeedback(receipt, doc, source, 7), 'result');
  assert.equal(currentCoordinateFeedback(receipt, { ...doc }, source, 7), null);
  assert.equal(currentCoordinateFeedback(receipt, doc, { ...source }, 7), null);
  assert.equal(currentCoordinateFeedback(receipt, doc, source, 8), null);
  assert.equal(currentCoordinateFeedback(receipt, doc, null, 7), null);
});
