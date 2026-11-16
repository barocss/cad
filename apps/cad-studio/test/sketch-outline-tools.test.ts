import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState } from '../src/viewport/Viewport';
import { SketchOutlineTools } from '../src/ui/SketchOutlineTools';
const blank: SketchState = { plane: xyPlane(), tool: 'polygon', shape: null };
const unused = () => assert.fail('Rendering availability must not execute actions');
test('unavailable tools render no controls or actions', () => {
  assert.equal(renderToStaticMarkup(createElement(SketchOutlineTools, { sketch: blank })), '');
  assert.doesNotMatch(renderToStaticMarkup(createElement(SketchOutlineTools, { sketch: blank, onOffset: unused })), /Offset distance|Offset inward|Offset outward/);
});
test('closed outline exposes offset and independent face/curve actions without draft mutation', () => {
  const sketch: SketchState = { ...blank, shape: { kind: 'rectangle', a: [0, 0], b: [20, 12] } }, before = structuredClone(sketch);
  const html = renderToStaticMarkup(createElement(SketchOutlineTools, { sketch, onOffset: unused, onUseOutline: unused, onToCurves: unused }));
  for (const label of ['Offset distance', 'Offset inward', 'Offset outward', 'Use the face outline', 'Face outline as references', 'Make curves']) assert.ok(html.includes(`aria-label="${label}"`));
  assert.match(html, /value="2"/); assert.match(html, /A copy of Outline 1/);
  assert.doesNotMatch(html, /Link face outline \+ inset/); assert.deepEqual(sketch, before);
});
test('empty linked face retains its distinct entry and distance field, not general offset buttons', () => {
  const props = { onOffset: unused, onLinkedInset: unused };
  const html = renderToStaticMarkup(createElement(SketchOutlineTools, { sketch: blank, ...props }));
  assert.match(html, /Link face outline \+ inset/); assert.match(html, /aria-label="Offset distance"/);
  assert.doesNotMatch(html, /aria-label="Offset (inward|outward)"/);
  const active: SketchState = { ...blank, shape: { kind: 'rectangle', a: [0, 0], b: [20, 12] } };
  const filled = renderToStaticMarkup(createElement(SketchOutlineTools, { sketch: active, ...props }));
  assert.doesNotMatch(filled, /Link face outline \+ inset/); assert.match(filled, /aria-label="Offset inward"/);
});
