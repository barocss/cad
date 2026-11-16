import test from 'node:test';
import assert from 'node:assert/strict';
import { manualSketchRegion } from '../src/sketch/manualSketchRegion';
import { sketchRegion } from '../src/app/sketchControls';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
const draft = (shape: SketchShape, done: SketchShape[] = []): SketchState => ({ plane: xyPlane(), tool: 'select', shape, done });
test('manual fit includes a distant free sketch and enlarged draft without changing automatic region or draft', () => {
  const sketch = draft({ kind: 'rectangle', a: [400, 600], b: [1200, 1600] }, [{ kind: 'circle', c: [-600, -500], r: 80 }]);
  const before = structuredClone(sketch);
  assert.deepEqual(manualSketchRegion([], sketch), [[-680, -580], [1200, 1600]]);
  assert.deepEqual(sketchRegion([], sketch.plane), [[-20, -20], [100, 60]]); assert.deepEqual(sketch, before);
});
test('arc extrema between endpoints and attached circles are included; absent closing edge is not invented', () => {
  const sketch = draft({ kind: 'polygon', points: [[500, 500], [700, 500]], closed: false, bulges: [1, 100], circles: [{ c: [800, 500], r: 25 }] });
  const [min, max] = manualSketchRegion([], sketch);
  assert.ok(min[1] <= 400); assert.equal(max[0], 825); assert.equal(max[1], 525);
  const lower = draft({ kind: 'polygon', points: [[-700, -500], [-500, -500]], closed: false, bulges: [1] });
  assert.ok(manualSketchRegion([], lower)[0][1] <= -600);
});
test('slot caps and Bezier control hull are conservative bounds; hidden construction is omitted', () => {
  const sketch = draft({ kind: 'slot', a: [500, 500], b: [600, 700], r: 20 }, [
    { kind: 'bezier', poles: [[700, 700], [2000, 3000], [900, 900]] },
    { kind: 'circle', c: [-5000, -5000], r: 100, construction: true },
  ]);
  sketch.hideConstruction = true;
  assert.deepEqual(manualSketchRegion([], sketch), [[-20, -20], [2000, 3000]]);
  sketch.hideConstruction = false;
  assert.deepEqual(manualSketchRegion([], sketch)[0], [-5100, -5100]);
});
test('invalid unfinished points do not poison the camera bounds', () => {
  const sketch = draft({ kind: 'polygon', points: [[500, 500], [NaN, Infinity]], closed: false, bulges: [1] });
  assert.deepEqual(manualSketchRegion([], sketch), [[-20, -20], [500, 500]]);
});
test('visible band envelope includes offset and width even when construction sources are hidden', () => {
  const sketch = draft({ kind: 'circle', c: [500, 500], r: 20, ids: ['a'], construction: true },
    [{ kind: 'circle', c: [800, 500], r: 20, ids: ['b'], construction: true }]);
  sketch.hideConstruction = true;
  sketch.band = { version: 1, id: 'band1', sources: ['a', 'b'], offset: 100, width: 40 };
  const before = structuredClone(sketch), bounds = manualSketchRegion([], sketch);
  assert.ok(bounds[1][0] >= 960); assert.ok(bounds[1][1] >= 660);
  assert.deepEqual(sketch, before);
});
