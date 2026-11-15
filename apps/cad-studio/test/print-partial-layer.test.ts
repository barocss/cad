import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { printLayers } from '@barocss/cad-model/print/layers';
import { PrintPanel } from '../src/viewport/PrintPanel';
import { extrudePrintSupport } from '../src/viewport/printSupport';

test('Print panel reports the corrected final sample, unchanged top, contours and slider range from the actual model result', () => {
  const doc = rectanglePart(20, 20, 6), before = structuredClone(doc), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  for (const [height, count, z] of [[0.35, 18, '5.975'], [0.30, 20, '5.850']]) {
    const model = printLayers(evaluated.bodies.map(body => body.mesh), { layerHeight: Number(height) });
    const { layer: makeLayer, ...summary } = model, layer = makeLayer(Number(count) - 1);
    const display = { request: 1, summaryKey: 1, summary, layer, supportMesh: extrudePrintSupport(model.supportColumns),
      top: Math.min(model.height, (layer.k + 1) * model.layerHeight.value), supports: true, printed: true };
    const html = renderToStaticMarkup(createElement(PrintPanel, { options: { layer: layer.k, layerHeight: Number(height), supports: true, printed: true },
      onOptions() {}, onDirection() {}, state: { stage: 'ready', display, count: model.count } }));
    assert.ok(html.includes(`Layer ${count} of ${count} · bed Z ${z} mm · 1 closed contours`));
    assert.ok(html.includes('Top 6.000 mm'));
    assert.match(html, new RegExp(`aria-label="Print layer"[^>]*max="${Number(count) - 1}"`));
    assert.match(html, /NOT FOR PRODUCTION/); assert.match(html, /Display mesh estimate/);
  }
  assert.deepEqual(doc, before);
});
