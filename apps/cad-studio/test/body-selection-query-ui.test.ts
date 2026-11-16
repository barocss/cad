import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { BodySelectionQuery } from '../src/ui/BodySelectionQuery';
const doc = rectanglePart(20, 12, 8);
for (const blocked of [null, 'Wait for the current model result before finding the selection.']) {
  test(`query initial render never selects or changes document: ${blocked ?? 'idle'}`, () => {
    const before = JSON.stringify(doc);
    const html = renderToStaticMarkup(createElement(BodySelectionQuery, { doc, bodies: [], owner: {}, blocked,
      onSelect: () => assert.fail('Rendering must never select') }));
    assert.match(html, /Body name contains/); assert.match(html, /maxLength="256"/i);
    assert.match(html, /<option value="any" selected="">Any<\/option>/);
    assert.match(html, /<option value="unspecified">Unspecified<\/option>/);
    assert.match(html, /<button type="button" disabled="">Select matches<\/button>/);
    if (blocked) assert.ok(html.includes(blocked));
    assert.equal(JSON.stringify(doc), before);
  });
}
