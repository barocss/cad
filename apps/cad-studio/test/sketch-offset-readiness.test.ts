import test from 'node:test';
import assert from 'node:assert/strict';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState, SketchShape } from '../src/viewport/Viewport';
import { activateDraftOutline } from '../src/app/sketchControls';
import { sketchOffsetReadiness, sketchOffsetTarget } from '../src/app/sketchOffsetTarget';
const rectangle: SketchShape = { kind: 'rectangle', a: [0, 0], b: [20, 12] };
const open: SketchShape = { kind: 'polygon', points: [[0, 0], [10, 0]], closed: false };
const blank: SketchState = { plane: xyPlane(), tool: 'polygon', shape: null };
test('empty and open-only sketches hide general Offset while closed outlines enable it', () => {
  for (const sketch of [blank, { ...blank, shape: open }, { ...blank, done: [open] }]) {
    assert.equal(sketchOffsetReadiness(sketch, false).showDistance, false);
    assert.equal(sketchOffsetTarget(sketch), null);
  }
  assert.equal(sketchOffsetReadiness({ ...blank, shape: rectangle }, false).showDistance, true);
});
test('open active stroke does not hide an applicable completed closed outline', () => {
  const sketch = { ...blank, shape: open, done: [rectangle] };
  const before = structuredClone(sketch);
  assert.equal(sketchOffsetTarget(sketch)?.shape, rectangle);
  assert.equal(sketchOffsetTarget(sketch)?.index, 0);
  assert.deepEqual(sketch, before);
});
test('chosen Active outline and help ordinal use the exact execution target', () => {
  const second: SketchShape = { kind: 'rectangle', a: [30, 0], b: [40, 10] };
  const draft = { ...blank, done: [rectangle, second] };
  assert.equal(sketchOffsetTarget(draft)?.shape, second);
  for (const index of [0, 1]) {
    const active = activateDraftOutline(draft, index); assert.ok(active);
    assert.equal(sketchOffsetTarget(active)?.shape, active.shape);
    assert.equal(sketchOffsetTarget(active)?.index, index);
  }
});
test('empty linked-face path retains distance and link controls, not general In/Out', () => {
  const ready = sketchOffsetReadiness(blank, true);
  assert.equal(ready.canLinkInset, true); assert.equal(ready.showDistance, true); assert.equal(ready.target, null);
  const openDraft = sketchOffsetReadiness({ ...blank, shape: open }, true);
  assert.equal(openDraft.canLinkInset, false); assert.equal(openDraft.showDistance, false);
  assert.equal(sketchOffsetReadiness({ ...blank, done: [rectangle] }, true).canLinkInset, false);
});
