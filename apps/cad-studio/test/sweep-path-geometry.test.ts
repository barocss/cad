import test from 'node:test';
import assert from 'node:assert/strict';
import { sweepPathGeometryLabel, sweepRepresentationLabel } from '@barocss/cad-model/app/profileCommands';
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

test('the exact label distinguishes a joined line and arc from a two-span circular path', () => {
  const joined = { degree: 2, controlPoints: [0, 1, 2, 3, 4], knots: [0, 0, 0, 1, 1, 2, 2, 2],
    weights: [1, 1, 1, Math.SQRT1_2, 1] };
  assert.equal(sweepRepresentationLabel('exact', joined), 'Exact line and arc');
  assert.equal(sweepRepresentationLabel('exact', { ...joined, weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1] }), 'Exact circular arc');
  assert.equal(sweepRepresentationLabel('exact-straight', joined), 'Exact straight path');
});

test('the exact elbow label follows the stored seven-pole span pattern', () => {
  const elbow = { degree: 2, controlPoints: [0, 1, 2, 3, 4, 5, 6], knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
    weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1] };
  assert.equal(sweepRepresentationLabel('exact', elbow), 'Exact line–arc–line');
  assert.equal(sweepRepresentationLabel(undefined, elbow), 'Faceted');
  assert.equal(sweepRepresentationLabel('exact', { ...elbow, weights: [1, 1, 1, 1, 1, 1, 1] }), 'Exact circular arc');
});
