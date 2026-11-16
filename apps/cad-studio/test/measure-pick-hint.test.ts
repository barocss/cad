import test from 'node:test';
import assert from 'node:assert/strict';
import { measurePickHint } from '../src/ui/measurePickHint';
test('Measure next-target copy follows actual viewport filter semantics', () => {
  for (const slot of ['from', 'to'] as const) {
    assert.equal(measurePickHint('all', slot), `Click a face, edge, or vertex to measure ${slot}.`);
    assert.equal(measurePickHint('edge', slot), `Click an edge to measure ${slot}. Change Selection filter to Pick all for faces, edges, or vertices.`);
    for (const filter of ['face', 'body'] as const)
      assert.equal(measurePickHint(filter, slot), `Click a face to measure ${slot}. Change Selection filter to Pick all for faces, edges, or vertices.`);
  }
});
