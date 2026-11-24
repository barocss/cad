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

test('the exact label distinguishes both line and arc orders from a two-span circular path', () => {
  const joined = { degree: 2, controlPoints: [0, 1, 2, 3, 4], knots: [0, 0, 0, 1, 1, 2, 2, 2],
    weights: [1, 1, 1, Math.SQRT1_2, 1] };
  assert.equal(sweepRepresentationLabel('exact', joined), 'Exact line and arc');
  assert.equal(sweepRepresentationLabel('exact', { ...joined, weights: [...joined.weights].reverse() }), 'Exact arc and line');
  assert.equal(sweepRepresentationLabel('exact', { ...joined, weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
    controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [30, 30, 0]] }), 'Exact two-arc path');
  assert.equal(sweepRepresentationLabel('exact', { ...joined, weights: [1, 0, 1, Math.SQRT1_2, 1] }), 'Exact circular arc');
  assert.equal(sweepRepresentationLabel('exact-straight', joined), 'Exact straight path');
});

test('exact three-span labels distinguish a straight lead and tail from a straight span between bends', () => {
  const elbow = { degree: 2, controlPoints: [0, 1, 2, 3, 4, 5, 6], knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
    weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1] };
  assert.equal(sweepRepresentationLabel('exact', elbow), 'Exact line–arc–line');
  assert.equal(sweepRepresentationLabel('exact', { ...elbow, weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1] }), 'Exact arc–arc–line');
  assert.equal(sweepRepresentationLabel('exact', { ...elbow, weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1] }), 'Exact line–arc–arc');
  assert.equal(sweepRepresentationLabel('exact', { ...elbow, weights: [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1] }), 'Exact arc–line–arc');
  assert.equal(sweepRepresentationLabel(undefined, elbow), 'Faceted');
  assert.equal(sweepRepresentationLabel('exact', { ...elbow, weights: [1, 1, 1, 1, 1, 1, 1] }), 'Exact circular arc');
});

test('the closed circle option labels its stored span pattern without changing other modes', () => {
  const circle = { degree: 2, controlPoints: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], weights: [1, .707106781, 1, .707106781, 1, .707106781, 1, .707106781, 1] };
  assert.equal(sweepRepresentationLabel('exact', circle), 'Exact closed circle');
  assert.equal(sweepRepresentationLabel('exact', { ...circle, weights: [1, 1, 1, .707106781, 1, 1, 1, .707106781, 1] }),
    'Exact line–arc–line–arc');
  assert.equal(sweepRepresentationLabel('exact', { ...circle, weights: [1, 1, 1, .707106781, 1, .707106781, 1, 1, 1] }),
    'Exact line–arc–arc–line');
  assert.equal(sweepRepresentationLabel('exact-straight', circle), 'Exact straight path');
  assert.equal(sweepRepresentationLabel(undefined, circle), 'Faceted');
  assert.equal(sweepRepresentationLabel('exact', { ...circle, weights: Array(9).fill(1) }), 'Exact circular arc');
});

test('the five-span exact label identifies both straight ends without labeling an authored curved outlet as straight', () => {
  const path = { degree: 2, controlPoints: Array.from({ length: 11 }, (_, i) => i),
    knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5],
    weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1, 1, 1] };
  assert.equal(sweepRepresentationLabel('exact', path), 'Exact line–arc–line–arc–line');
  assert.equal(sweepRepresentationLabel('faceted', path), 'Faceted');
  path.weights[9] = Math.SQRT1_2;
  assert.equal(sweepRepresentationLabel('exact', path), 'Exact circular arc');
});

test('Sweep History displays a rectangular section with resolved sketch dimensions', () => {
  const sweep: Extract<ModelNode, { kind: 'sweep-curve' }> = {
    kind: 'sweep-curve', sketch: 0, name: 'Elbow rail', mode: 'exact',
    path: { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
      controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0], [20, 27, 0], [20, 34, 0]],
      weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1] },
  };
  const profile: ModelNode = { kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [{ parameter: 'right' }, 3] };
  const html = JSON.stringify(SweepHistoryInputs({ sweep, profile, parameters: { right: 2 } }));
  assert.ok(html.includes('Sketch 1 · 4 × 6 mm'));
  assert.ok(html.includes('Exact line–arc–line'));
});
