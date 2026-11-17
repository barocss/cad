import test from 'node:test';
import assert from 'node:assert/strict';
import { sheetRatioScale } from '../src/ui/drawing/SheetScaleControl';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
import { forSheet, mergeSheet, readSheets } from '@barocss/cad-model/drawing/sheets';

test('paper:model ratios produce exact scale for common reductions and enlargements', () => {
  for (const [p, m, scale] of [['1', '4', .25], ['5', '4', 1.25], ['1', '2.5', .4], ['1000', '1', 1000], ['0.001', '10', .0001]] as const) assert.equal(sheetRatioScale(p, m), scale);
});
test('invalid, overflowing and underflowing ratios refuse rather than coercing to Auto', () => {
  for (const [p, m] of [['', '1'], ['1', ' '], ['-1', '4'], ['1', '0'], ['0', '1'], ['NaN', '1'], ['Infinity', '1'], ['1', 'Infinity'], ['1001', '1'], ['1e308', '1e-308'], ['5e-324', '1e308']]) assert.equal(sheetRatioScale(p, m), null);
});
test('continuation scale is independent, persisted by the current file contract, and Auto removes only that scale', () => {
  const whole = { ...defaultDrawing(), scale: 2, sheets: [{ id: 's2', views: ['top'] }] };
  const next = mergeSheet(whole, 1, { ...forSheet(whole, 1), scale: .25 });
  assert.equal(next.scale, 2); assert.equal(next.sheets![0].scale, .25);
  assert.deepEqual(readSheets(next.sheets), next.sheets);
  const { scale: _scale, ...automatic } = forSheet(next, 1); void _scale;
  const restored = mergeSheet(next, 1, automatic);
  assert.equal(restored.scale, 2); assert.equal(restored.sheets![0].scale, undefined); assert.deepEqual(whole.sheets, [{ id: 's2', views: ['top'] }]);
});
