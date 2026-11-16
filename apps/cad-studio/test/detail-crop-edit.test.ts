import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultDrawing, type DrawingSettings } from '@barocss/cad-model/drawing/types';
import type { DrawingDetail } from '@barocss/cad-model/drawing/detail';
import { editDetailCrop } from '../src/ui/drawing/detailCropEdit';

const detail: DrawingDetail = { id: 'B', view: 'top', center: [32, 16], radius: 6, scale: 2, at: [150, 80] };
const fields = { x: '34', y: '18', radius: '7' };
const owner = {};
function fixture(): DrawingSettings { return { ...defaultDrawing(), details: [detail], sheets: [{ id: 's2', views: ['detail:B'] }] }; }
function edit(s = fixture(), input = fields) { return editDetailCrop(s, detail, input, owner, owner, true); }

test('crop edit changes only the exact detail crop and preserves scale, paper position and sheet ownership', () => {
  const s = fixture(), before = structuredClone(s), result = edit(s);
  assert.ok('settings' in result);
  assert.deepEqual(result.settings.details, [{ ...detail, center: [34, 18], radius: 7 }]);
  assert.deepEqual({ ...result.settings, details: s.details }, s);
  assert.deepEqual(s, before);
});

test('empty, nonfinite and nonpositive fields refuse without mutating the source', () => {
  for (const key of ['x', 'y', 'radius'] as const) for (const value of ['', ' ', 'NaN', 'Infinity', '-Infinity', '1e999']) {
    const s = fixture(), before = structuredClone(s);
    assert.ok('error' in edit(s, { ...fields, [key]: value }));
    assert.deepEqual(s, before);
  }
  for (const radius of ['0', '-0', '-1']) assert.ok('error' in edit(fixture(), { ...fields, radius }));
  assert.ok('settings' in edit(fixture(), { x: '0', y: '-12', radius: '0.1' }));
});

test('no-op retains the original settings reference', () => {
  const s = fixture(), result = edit(s, { x: '32', y: '16', radius: '6' });
  assert.ok('settings' in result); assert.equal(result.settings, s);
});

test('stale ownership, unavailable evaluation, missing, replaced or duplicate detail refuses', () => {
  const s = fixture(), before = structuredClone(s);
  assert.ok('error' in editDetailCrop(s, detail, fields, owner, {}, true));
  assert.ok('error' in editDetailCrop(s, detail, fields, owner, owner, false));
  assert.ok('error' in edit({ ...s, details: [] }));
  assert.ok('error' in edit({ ...s, details: [{ ...detail }] }));
  assert.ok('error' in edit({ ...s, details: [detail, detail] }));
  assert.deepEqual(s, before);
});

test('whole-drawing annotations on another sheet protect crop changes, including standalone frames', () => {
  const dimension: DrawingSettings['dimensions'][number] = { id: 'dia', kind: 'diameter', view: 'detail:B', edge: 'rim', near: [32, 16, 8], place: [40, 20] };
  for (const annotations of [
    { dimensions: [dimension] },
    { frames: [{ id: 'frame', view: 'detail:B' as const, place: [40, 20] as [number, number], characteristic: 'flatness' as const, value: 0.1, datums: [] }] },
  ]) {
    const s: DrawingSettings = { ...fixture(), ...annotations }, before = structuredClone(s);
    const result = edit(s);
    assert.ok('error' in result); assert.match(result.error, /dimensions or geometric controls/);
    assert.deepEqual(s, before);
    const unchanged = edit(s, { x: '32', y: '16', radius: '6' });
    assert.ok('settings' in unchanged); assert.equal(unchanged.settings, s);
  }
});
