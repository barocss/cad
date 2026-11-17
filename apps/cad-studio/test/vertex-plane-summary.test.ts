import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import type { SketchAnchor } from '@barocss/cad-model/sketch/types';
import type { SketchPlane } from '@barocss/cad-model/sketch/plane';
import { VertexPlaneSummary } from '../src/ui/VertexPlaneSummary';

const captured: SketchPlane = { origin: [1, 2, 3], xAxis: [1, 0, 0], normal: [0, 0, 1] };
const anchor: SketchAnchor = { kind: 'vertices', offset: 0, vertexPlane: captured };
const render = (a: SketchAnchor | undefined, plane = captured) => renderToStaticMarkup(createElement(VertexPlaneSummary, { anchor: a, plane }));

test('vertex capture shows ordered roles and a readonly approximate current frame', () => {
  const before = structuredClone({ anchor, captured }), html = render(anchor);
  assert.match(html, /Origin \(mm\)<b>1, 2, 3/);
  assert.match(html, /\+X<b>1, 0, 0/); assert.match(html, /\+Y<b>0, 1, 0/);
  assert.match(html, /Normal<b>0, 0, 1/);
  assert.match(html, /point 1 sets the origin/); assert.match(html, /point 1 → point 2 sets \+X/);
  assert.match(html, /point 3 sets the \+Y side/); assert.match(html, /Fixed snapshot/);
  assert.match(html, /Approximate display: 6 significant digits/);
  assert.doesNotMatch(html, /<button|<input|current frame includes/);
  assert.deepEqual({ anchor, captured }, before);
});

test('offset and tilted current frame is displayed rather than the stored capture frame', () => {
  const plane: SketchPlane = { origin: [1, 5, 7], xAxis: [1, 0, 0], normal: [0, 0.6, 0.8] };
  const a: SketchAnchor = { ...anchor, offset: 5, angle: 36.86989764584402 };
  const before = structuredClone({ a, plane }), html = render(a, plane);
  assert.match(html, /Origin \(mm\)<b>1, 5, 7/); assert.match(html, /\+Y<b>0, 0.8, -0.6/);
  assert.match(html, /Normal<b>0, 0.6, 0.8/); assert.match(html, /current frame includes the plane offset or angle/);
  assert.deepEqual({ a, plane }, before); assert.equal(a.vertexPlane, captured);
});

test('XY, face, missing capture and reopened anchors make no vertex provenance claim', () => {
  for (const a of [undefined, { kind: 'xy', offset: 0 }, { kind: 'face', offset: 0 }, { kind: 'vertices', offset: 0 },
    { ...anchor, kind: 'xy' }] as (SketchAnchor | undefined)[]) assert.equal(render(a), '');
  assert.notEqual(render(anchor), ''); assert.equal(render(undefined), ''); assert.notEqual(render(anchor), '');
});

test('small nonzero components are not rounded to zero in the display or changed in the source', () => {
  const plane: SketchPlane = { origin: [0.000000123456789, 2, 3], xAxis: [1, 0, 0], normal: [0, 0.0000004, 0.99999999999992] };
  const before = structuredClone(plane), html = render(anchor, plane);
  assert.match(html, /1.23457e-7/); assert.match(html, /Normal<b>0, 4e-7, 1/);
  assert.deepEqual(plane, before);
});
