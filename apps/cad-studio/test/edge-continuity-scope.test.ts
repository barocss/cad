import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { EdgeContinuity } from '../src/ui/EdgeContinuity';
const read = async () => ({ edges: [], selected: null });
test('unmapped display edge explains whole-body browsing before inspection', () => {
  const html = renderToString(createElement(EdgeContinuity, { source: {}, picked: undefined, selectedDisplayEdge: true, read }));
  assert.match(html, /no unique native joint mapping/);
  assert.match(html, /list does not identify this selected edge/);
});
test('body selection does not claim an unmapped displayed edge', () => {
  const html = renderToString(createElement(EdgeContinuity, { source: {}, picked: undefined, read }));
  assert.doesNotMatch(html, /no unique native joint mapping/);
  assert.match(html, /Inspect native joints/);
});
