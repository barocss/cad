import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { CageChecks } from '../src/ui/CagePanel';
import type { validationOf } from '@barocss/cad-model/subd/cageEdit';
const render = (patch: Partial<ReturnType<typeof validationOf>>) => renderToStaticMarkup(createElement(CageChecks, {
  validation: { valid: true, unused: [], poles: [], ngons: [], boundaryEdges: [], darts: [], nonManifoldEdges: [], nonManifoldVertices: [], ...patch }, faces: 96, previewMs: 12.34,
}));
test('closed cage puts legends, face count and timing only inside collapsed details', () => {
  const html = render({}); const [visible, details] = html.split('<details>');
  assert.doesNotMatch(visible, /open edges|n-gons|G1|96 faces|Preview/);
  assert.match(details, /Cage details/); assert.match(details, /0 open edges/); assert.match(details, /96 faces/); assert.match(details, /Preview 12.3 ms/);
  assert.doesNotMatch(html, /<details open/);
});
test('actionable open/non-manifold/ngon/dart counts remain outside details', () => {
  // Presentation fixtures only: these lists represent validator output, not topology qualification.
  const [visible] = render({ valid: false, ngons: [0], boundaryEdges: [[0, 1]], darts: [0], nonManifoldEdges: [[0, 1]], nonManifoldVertices: [0] }).split('<details>');
  for (const text of ['Not a manifold: 1 edges, 1 vertices (red)', '1 n-gons (tinted)', '1 open edges', '1 darts']) assert.ok(visible.includes(text));
  assert.match(visible, /role="status"/);
});
