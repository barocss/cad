import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepPathGeometryLabel } from '@barocss/cad-model/app/profileCommands';
import { SweepHistoryInputs } from '../src/ui/SweepHistoryInputs';
import type { ModelNode } from '@barocss/cad-model/engine/doc';

test('path geometry does not infer provenance or approximate status from degree', () => {
  assert.equal(sweepPathGeometryLabel({ degree: 1, controlPoints: [0, 1] }), 'Line');
  assert.equal(sweepPathGeometryLabel({ degree: 1, controlPoints: [0, 1, 2] }), 'Polyline');
  assert.equal(sweepPathGeometryLabel({ degree: 4, controlPoints: [0, 1, 2, 3, 4] }), 'Degree 4 NURBS');
  assert.equal(sweepPathGeometryLabel({ degree: 2, controlPoints: [0, 1, 2] }), 'Degree 2 NURBS');
});
test('History distinguishes stored path geometry from faceted output without changing the recipe', () => {
  for (const degree of [1, 4]) {
    const count = degree === 1 ? 3 : 5;
    const sweep = { id: 'sweep', kind: 'sweep-curve', sketch: 0, name: 'Boundary', path: {
      degree, knots: degree === 1 ? [0,0,.5,1,1] : [0,0,0,0,0,1,1,1,1,1],
      controlPoints: Array.from({length: count}, (_, i) => [0,i,i] as [number,number,number]), weights: Array(count).fill(1),
    }} as Extract<ModelNode, {kind:'sweep-curve'}>;
    const before = structuredClone(sweep);
    const html = JSON.stringify(SweepHistoryInputs({sweep, profile: undefined, parameters: {}}));
    assert.ok(html.includes(degree === 1 ? 'Polyline' : 'Degree 4 NURBS'));
    assert.ok(html.includes('Copied'));
    assert.ok(html.includes('Boundary'));
    assert.ok(html.includes('Solid representation'));
    assert.ok(html.includes('Faceted'));
    assert.ok(!html.includes('approximation'));
    assert.deepEqual(sweep, before);
  }
});
