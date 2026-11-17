import test from 'node:test';
import assert from 'node:assert/strict';
import { resetRemovedSectionPaperPosition } from '../src/ui/drawing/sectionPaperPosition';
import { defaultDrawing, sameSection, sectionsOf, withSections, type DrawingSection } from '@barocss/cad-model/drawing/types';
import { forSheet, mergeSheet, moveToSheet } from '@barocss/cad-model/drawing/sheets';

test('reset removes only paper at and preserves the exact cut and explicit scale', () => {
  for (const scale of [undefined, 2, 1.25, 1000]) {
    const s: DrawingSection = { id: 'A', view: 'front', at: 10, dir: [0, 1, 1], removed: { at: [350, 85], ...(scale === undefined ? {} : { scale }) } };
    const before = structuredClone(s), next = resetRemovedSectionPaperPosition(s);
    assert.deepEqual(next, { ...s, removed: scale === undefined ? {} : { scale } });
    assert.equal(sameSection(s, next), true); assert.deepEqual(s, before);
    assert.equal(resetRemovedSectionPaperPosition(next), next);
  }
});
test('ordinary, revolved and already automatic sections are identity no-ops', () => {
  for (const s of [{ id: 'A', view: 'front', at: 10 }, { id: 'A', view: 'front', at: 10, revolved: true }, { id: 'A', view: 'front', at: 10, removed: {} }] as DrawingSection[]) assert.equal(resetRemovedSectionPaperPosition(s), s);
});
test('continuation-sheet reset preserves annotation records and the original section assignment', () => {
  const section: DrawingSection = { id: 'A', view: 'front', at: 10, removed: { at: [350, 85], scale: 2 } };
  const s = { ...defaultDrawing(), sections: [section], sheets: [{ id: 's2', size: 'A4' as const, views: [] as string[] }], frames: [{ id: 'f', view: 'section:A' as const, characteristic: 'flatness' as const, value: .1, datums: [], place: [32, 12] as [number, number] }] };
  const moved = { ...s, sheets: moveToSheet(s, 'section:A', 1) }, local = forSheet(moved, 1);
  const reset = withSections(local, sectionsOf(local).map(resetRemovedSectionPaperPosition));
  const whole = mergeSheet(moved, 1, reset);
  assert.deepEqual(sectionsOf(whole), [{ ...section, removed: { scale: 2 } }]);
  assert.deepEqual(whole.frames, s.frames); assert.deepEqual(whole.sheets, moved.sheets); assert.deepEqual(whole.dimensions, s.dimensions);
  assert.deepEqual(section.removed!.at, [350, 85]);
});
