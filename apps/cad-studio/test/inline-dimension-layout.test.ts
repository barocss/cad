import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { inlineDimensionLayout } from '../src/ui/inlineDimensionLayout';
import { InlineSketchDimension } from '../src/ui/InlineSketchDimension';

const area = { x: 10, y: 20, width: 600, height: 400 };
test('long exact values gain room without changing their text or numeric value', () => {
  for (const value of [44.721359549995796, -44.721359549995796, 1.2345678901234567e-20]) {
    const text = String(value), layout = inlineDimensionLayout(text, false, [300, 200], area);
    assert.ok(layout.inputWidth > 84);
    assert.equal(Number(text), value);
    const html = renderToString(createElement(InlineSketchDimension, { at: [300, 200], area, value,
      label: 'Distance', driving: true, arc: false, onConfirm() {}, onClose() {} }));
    assert.ok(html.includes(`value="${text}"`));
    assert.ok(html.includes('step="any"'));
  }
});
test('short values retain minimum width; long entries and arc controls stay bounded at viewport edges', () => {
  assert.equal(inlineDimensionLayout('40', false, [300, 200], area).inputWidth, 84);
  for (const arc of [false, true]) for (const width of [100, 300, 600]) for (const at of [[-100, -100], [1e6, 1e6]] as const) {
    const box = { ...area, width }, layout = inlineDimensionLayout('1'.repeat(100), arc, at, box);
    assert.ok(layout.inputWidth <= 244);
    assert.equal(layout.width - layout.inputWidth, arc ? 57 : 0);
    assert.ok(layout.left >= box.x && layout.left + layout.width <= box.x + width);
    assert.ok(layout.top >= box.y && layout.top + layout.height <= box.y + box.height);
  }
});
