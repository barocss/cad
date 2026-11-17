import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { TrimBoundaryGuidance } from '../src/ui/TrimBoundaryGuidance';

const guide: SketchShape = { kind: 'polygon', points: [[0, 0], [10, 0]], closed: false, construction: true };
const base: SketchState = { tool: 'trim', plane: { origin: [0,0,0], normal: [0,0,1], xAxis: [1,0,0] }, base: null, shape: null, done: [guide], hideConstruction: true };
const render = (sketch: SketchState) => renderToStaticMarkup(createElement(TrimBoundaryGuidance, { sketch }));
test('discloses existing protected cut inputs without evaluating or changing source', () => {
  const before = structuredClone(base), reference = base.done;
  const html = render(base);
  assert.match(html, /Hidden construction can still act as trimming boundaries for click and drag Trim/);
  assert.match(html, /Use Show construction/);
  assert.doesNotMatch(html, /<button|<input/);
  assert.deepEqual(base, before); assert.equal(base.done, reference); assert.equal(base.done?.[0], guide);
  assert.equal(render(base), html);
});
test('current tool, visibility and exact active shape control disclosure without retained state', () => {
  assert.equal(render({ ...base, tool: 'select' }), '');
  assert.equal(render({ ...base, tool: 'extend' }), '');
  assert.equal(render({ ...base, hideConstruction: false }), '');
  assert.equal(render({ ...base, done: [] }), '');
  assert.equal(render({ ...base, shape: guide, done: [] }), '', 'active construction is not protected by current cut-input policy');
  assert.equal(render({ ...base, done: [{ ...guide, construction: undefined }] }), '');
  assert.notEqual(render({ ...base, done: [{ ...guide }] }), '');
  assert.equal(render({ ...base, tool: 'rectangle', done: [] }), '');
});
test('no claim for Bézier or empty polygon, but existing circle/rectangle/slot boundaries remain covered', () => {
  const excluded: SketchShape[] = [{kind:'bezier',poles:[[0,0],[5,5],[10,0]],construction:true}, {...guide, points: []}, {...guide, points:[[0,0]]}];
  for (const shape of excluded) assert.equal(render({...base,done:[shape]}), '');
  const supported: SketchShape[] = [{kind:'circle',c:[0,0],r:2,construction:true}, {kind:'rectangle',a:[0,0],b:[10,10],construction:true}, {kind:'slot',a:[0,0],b:[10,0],r:2,construction:true}];
  for (const shape of supported) assert.notEqual(render({...base,done:[shape]}), '');
});
