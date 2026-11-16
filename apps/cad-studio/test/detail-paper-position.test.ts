import test from 'node:test';
import assert from 'node:assert/strict';
import { resetDetailPaperPosition } from '../src/ui/drawing/detailPaperPosition';
import { defaultDrawing, type DrawingSettings } from '@barocss/cad-model/drawing/types';
import { starterDoc } from '@barocss/cad-model/engine/doc';
import { drawingInputs } from '@barocss/cad-model/chat/drawing';
import { issueContext } from '@barocss/cad-model/drawing/issues';
import { forSheet, mergeSheet, moveToSheet } from '@barocss/cad-model/drawing/sheets';

function fixture(): DrawingSettings {
  return { ...defaultDrawing(), sheet: 'A3', details: [{ id: 'B', view: 'top', center: [32, 16], radius: 6, scale: 2, at: [330, 80] }],
    frames: [{ id: 'f', view: 'detail:B', characteristic: 'flatness', value: 0.1, datums: [], place: [32, 16] }],
    sheets: [{ id: 'S2', size: 'A4', views: [] }] };
}
function built(settings: DrawingSettings) {
  const input = drawingInputs(starterDoc(), settings);
  if (typeof input === 'string') throw Error(input);
  return issueContext(input);
}

test('paper reset changes only exact detail at, preserving crop, scale, controls and sheet ownership', () => {
  const s = fixture(), other = { ...s.details![0], id: 'C', at: [200, 90] as [number, number] };
  s.details!.push(other);
  const saved = structuredClone(s), d = s.details![0];
  const next = resetDetailPaperPosition(s, d);
  assert.deepEqual(next.details, [{ id: 'B', view: 'top', center: [32, 16], radius: 6, scale: 2 }, other]);
  assert.equal(next.details![1], other, 'another detail keeps its identity and paper position');
  assert.equal(next.frames, s.frames);
  assert.equal(next.dimensions, s.dimensions);
  assert.equal(next.sheets, s.sheets);
  assert.deepEqual(s, saved);
  assert.equal(resetDetailPaperPosition(s, { ...d }), s, 'stale detail identity does not apply');
  assert.equal(resetDetailPaperPosition(next, next.details![0]), next, 'already automatic is a no-op');
});

test('native detail moved to A4 can auto-place without losing its frame or changing crop and scale', () => {
  const original = fixture();
  const moved = { ...original, sheets: moveToSheet(original, 'detail:B', 1) };
  const local = forSheet(moved, 1), before = built(local);
  assert.ok(before.sheet.details![0].placement.box[0] > before.sheet.size[0], 'old A3 paper position lies outside A4');
  const reset = resetDetailPaperPosition(local, local.details![0]), whole = mergeSheet(moved, 1, reset), after = built(forSheet(whole, 1));
  const box = after.sheet.details![0].placement.box, [w, h] = after.sheet.size;
  assert.ok(box[0] >= 0 && box[1] >= 0 && box[2] <= w && box[3] <= h);
  assert.deepEqual(whole.frames, original.frames);
  assert.equal(whole.details![0].scale, 2);
  assert.deepEqual(whole.details![0].center, [32, 16]);
  assert.equal(whole.details![0].radius, 6);
  assert.deepEqual(whole.sheets, moved.sheets);
});

test('oversized explicit scale remains unchanged and reports no room after reset', () => {
  const s = fixture(); s.details = [{ ...s.details![0], scale: 100 }];
  const reset = resetDetailPaperPosition(s, s.details[0]), ctx = built(reset);
  assert.equal(reset.details![0].scale, 100);
  assert.ok(ctx.sheet.detailsMissing?.some(d => d.id === 'B' && d.why === 'room'));
  assert.deepEqual(reset.frames, s.frames);
});
