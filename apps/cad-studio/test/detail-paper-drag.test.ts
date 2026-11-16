import test from 'node:test';
import assert from 'node:assert/strict';
import { commitDetailPaperDrag, detailPaperDragAt } from '../src/ui/drawing/detailPaperDrag';
import { defaultDrawing, type DrawingSettings, type XY } from '@barocss/cad-model/drawing/types';

const initial: XY = [123.456, 78.912], pointer: XY = [126.234, 80.345];
const fixture = (at?: XY): DrawingSettings => ({ ...defaultDrawing(), details: [
  { id: 'B', view: 'top', center: [32,16], radius: 6, scale: 5, ...(at ? { at } : {}) },
  { id: 'C', view: 'top', center: [10,10], radius: 3, at: [200,100] },
], frames: [{ id: 'f', view: 'detail:B', place: [40,20], characteristic: 'flatness', value: .1, datums: [] }] });

test('stationary auto-placement click preserves document identity and does not materialize at', () => {
  const settings = fixture(), detail = settings.details![0];
  const at = detailPaperDragAt(initial, pointer, [...pointer]);
  assert.equal(at, initial, 'no rounding on same-coordinate pointermove');
  assert.equal(commitDetailPaperDrag(settings, detail, initial, at), settings);
  assert.equal(detail.at, undefined);
});

test('explicit placement clicks and a drag retraced to its exact start are no-ops', () => {
  const settings = fixture(initial), detail = settings.details![0];
  assert.notDeepEqual(detailPaperDragAt(initial, pointer, [pointer[0] + 3, pointer[1] + 2]), initial);
  const returned = detailPaperDragAt(initial, pointer, [...pointer]);
  assert.equal(commitDetailPaperDrag(settings, detail, initial, returned), settings);
});

test('actual movement uses the existing tenth-mm grid and changes only the selected detail paper position', () => {
  for (const saved of [undefined, initial]) {
    const settings = fixture(saved), before = structuredClone(settings), detail = settings.details![0];
    const at = detailPaperDragAt(initial, pointer, [pointer[0] + 10, pointer[1] - 4]);
    assert.deepEqual(at, [133.5,74.9]);
    const next = commitDetailPaperDrag(settings, detail, initial, at);
    assert.notEqual(next, settings); assert.deepEqual(next.details![0], { ...detail, at });
    assert.equal(next.details![1], settings.details![1]); assert.equal(next.frames, settings.frames); assert.equal(next.dimensions, settings.dimensions);
    assert.deepEqual(settings, before);
  }
});

test('stale detail and duplicate ids cannot apply a placement', () => {
  const settings = fixture(), detail = settings.details![0], moved: XY = [140,80];
  assert.equal(commitDetailPaperDrag(settings, { ...detail }, initial, moved), settings);
  const duplicate = { ...settings, details: [...settings.details!, { ...detail }] };
  assert.equal(commitDetailPaperDrag(duplicate, detail, initial, moved), duplicate);
});
