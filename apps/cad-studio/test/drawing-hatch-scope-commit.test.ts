import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultDrawing, sectionsOf, type DrawingSettings } from '@barocss/cad-model/drawing/types';
import { forSheet, mergeSheet } from '@barocss/cad-model/drawing/sheets';
import { commitDrawingSettings } from '../src/ui/drawing/commitSettings';
const whole: DrawingSettings = { ...defaultDrawing(), scope: { kind: 'part' }, sections: [{ id: 'A', view: 'front', at: 5 }, { id: 'B', view: 'top', at: -4, hideHatch: true }], sheets: [{ id: 'S2', views: ['top'] }] };
test('whole merged commit refuses assembly when hidden B is absent from active sheet; callback never runs', () => {
  const local = forSheet(whole, 0); assert.deepEqual(sectionsOf(local).map(x => x.id), ['A']);
  const next = mergeSheet(whole, 0, { ...local, scope: { kind: 'assembly' } }), before = structuredClone(next), reasons: string[] = [];
  assert.equal(commitDrawingSettings(next, { kind: 'part' }, () => assert.fail('must not commit'), why => reasons.push(why)), false);
  assert.equal(reasons.length, 1); assert.match(reasons[0], /Show all section hatches before changing to assembly/); assert.deepEqual(next, before);
});
test('shown B permits canonical assembly commit without rewriting any section geometry', () => {
  const shown = { ...whole, sections: whole.sections!.map(({ hideHatch: _hideHatch, ...x }) => x) };
  const next = mergeSheet(shown, 0, { ...forSheet(shown, 0), scope: { kind: 'assembly' } }); let committed: DrawingSettings | undefined;
  assert.equal(commitDrawingSettings(next, { kind: 'part' }, x => { committed = x; return true; }, () => assert.fail('supported')), true);
  assert.equal(committed!.scope?.kind, 'assembly'); assert.deepEqual(committed!.sections, shown.sections); assert.deepEqual(committed!.sheets, shown.sheets);
});
test('source rejection remains false; raw unsupported flag cannot disappear during canonicalization', () => {
  assert.equal(commitDrawingSettings(whole, { kind: 'part' }, () => false, () => assert.fail('valid candidate')), false);
  const invalid: DrawingSettings = { ...whole, sections: [{ id: 'A', view: 'front', at: 5, half: { line: 'vertical', at: 0, cut: 'after' }, hideHatch: true }] };
  assert.equal(commitDrawingSettings(invalid, { kind: 'part' }, () => assert.fail('must not commit'), () => {}), false);
});
