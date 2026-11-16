import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { ContinuityLocation } from '../src/viewport/ContinuityLocation';
import type { EdgeCurvatureMeasurement } from '@barocss/cad-model/engine/edgeCurvature';
const curve: EdgeCurvatureMeasurement = { edgeId: 'native', edgeName: 'edge', unit: '1/mm', minimum: 0, maximum: 0,
  spans: [[{ point: [1,2,3], parameter: 0.2, magnitude: 0, vector: [0,0,0] }, { point: [4,5,6], parameter: 0.8, magnitude: 0, vector: [0,0,0] }]] };
test('zero-curvature native edges still show non-interactive location samples, not connecting ink', () => {
  const before = structuredClone(curve);
  const html = renderToString(createElement(ContinuityLocation, { curve, project: p => [p[0],p[1]] }));
  assert.equal((html.match(/<circle/g) ?? []).length, 2);
  assert.match(html, /pointer-events="none"/);
  assert.doesNotMatch(html, /<line|<polyline/);
  assert.deepEqual(curve, before);
});
test('clipped or invalid projected samples are omitted', () => {
  const html = renderToString(createElement(ContinuityLocation, { curve, project: p => p[0] === 1 ? null : [NaN,0] }));
  assert.doesNotMatch(html, /<circle/);
});
