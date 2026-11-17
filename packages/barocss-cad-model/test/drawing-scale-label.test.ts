import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleLabel, SCALES, layoutSheet } from '../src/drawing/views';
import { starterDoc } from '../src/engine/doc';
import { brepsFor } from '../src/engine/evaluate';
import { projectViews } from '../src/drawing/project';
import { defaultDrawing } from '../src/drawing/types';
import { buildSheet } from '../src/drawing/sheet';
import { sheetSvg } from '../src/io/svg';

test('scale labels round-trip exact stored ratios without rounding or overflowing reciprocals', () => {
  for (const s of [...SCALES, .25, .75, 1.23456789, .123456789, .999999999, 1.000000001, 1000, 1e-100, Number.MIN_VALUE]) {
    const label = scaleLabel(s), [paper, model] = label.split(':').map(Number);
    assert.ok(Number.isFinite(paper) && Number.isFinite(model) && paper > 0 && model > 0, label);
    assert.equal(paper / model, s, label);
  }
  assert.equal(scaleLabel(.75), '0.75:1');
  assert.equal(scaleLabel(1.23456789), '1.23456789:1');
});
test('standard and exact integer reduction ratios retain conventional notation', () => {
  assert.deepEqual(SCALES.map(scaleLabel), ['10:1','5:1','2:1','1:1','1:2','1:5','1:10','1:20','1:50','1:100']);
  assert.equal(scaleLabel(.25), '1:4');
});
test('SVG title-block scale is exact and does not change paper geometry', () => {
  const b = brepsFor(starterDoc()); assert.ok('breps' in b);
  const r = projectViews(b.breps, b.prefixes); assert.ok(r.ok);
  for (const scale of [1.23456789, .75]) {
    const settings = { ...defaultDrawing(), scale }, before = structuredClone(settings);
    const layout = layoutSheet(r.views, settings);
    const svg = sheetSvg(buildSheet(r.views, layout, settings, { title: 'Exact scale', date: '2026-11-17' }), 'Exact scale');
    assert.ok(svg.includes(`>${scale}:1</text>`));
    assert.ok(Math.abs(layout.views.front.box[2] - layout.views.front.box[0] - 64 * scale) < 1e-8);
    assert.deepEqual(settings, before);
  }
});
