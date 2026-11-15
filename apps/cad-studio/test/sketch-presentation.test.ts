import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { duplicatePointDistance, MAKE_CURVES_HELP, SketchSolverDiagnostics } from '../src/ui/sketchPresentation';
import { sketchStatus } from '../src/ui/sketchSettledStatus';
import { dimensionKey, pointDimensionKeys, type Polygon } from '@barocss/cad-model/sketch/rules';
import { ellipseShape } from '@barocss/cad-model/sketch/ellipse';

test('solver rank and DOF remain available inside a closed-by-default native disclosure', () => {
  const html = renderToStaticMarkup(createElement(SketchSolverDiagnostics, { rank: 6, dof: 2 }));
  assert.match(html, /<details[^>]*><summary>Solver diagnostics<\/summary>/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
  assert.match(html, /rank 6 · 2 DOF/);
});

test('two distinct points keep Dimension while only the duplicate Distance is omitted; H/V keys unchanged', () => {
  const shape: Polygon = { kind: 'polygon', closed: true, points: [[0, 0], [40, 0], [40, 20], [0, 20]], hv: { h: [0, 2], v: [1, 3] } };
  const picked = [{ kind: 'point' as const, i: 1 }, { kind: 'point' as const, i: 3 }];
  const before = JSON.stringify(shape), dim = dimensionKey(shape, picked), keys = pointDimensionKeys(1, 3);
  assert.ok(dim); assert.equal(duplicatePointDistance(picked, dim), true);
  assert.notEqual(keys.dx, keys.dy); assert.notEqual(keys.dist, keys.dx);
  assert.equal(duplicatePointDistance(picked, null), false);
  assert.equal(duplicatePointDistance([{ kind: 'point', i: 1 }, { kind: 'circle', i: 0 }], 'circle-distance'), false);
  assert.equal(duplicatePointDistance([{ kind: 'edge', i: 0 }, { kind: 'edge', i: 2 }], 'angle'), false);
  assert.equal(duplicatePointDistance([{ kind: 'circle', i: 0 }, { kind: 'circle', i: 1 }], 'distance'), false);
  assert.equal(JSON.stringify(shape), before);
});

test('matching ellipse status is concise and exact-curve guidance belongs to Make curves help', () => {
  const shape = ellipseShape({ center: [0, 0], rx: 12, ry: 6, angle: 0 }), before = JSON.stringify(shape);
  assert.deepEqual(sketchStatus(shape, null), { text: 'Ellipse', warn: false });
  assert.match(MAKE_CURVES_HELP, /matching ellipses become exact ellipse curves/);
  assert.match(MAKE_CURVES_HELP, /sketch is kept/);
  assert.equal(JSON.stringify(shape), before);
});
