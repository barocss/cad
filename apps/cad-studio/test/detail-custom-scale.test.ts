import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
import { SCALES } from '@barocss/cad-model/drawing/views';
import { DetailsList } from '../src/ui/drawing/DetailsList';

function render(scale?: number) {
  const settings = { ...defaultDrawing(), details: [{ id: 'B', view: 'top' as const, center: [32, 16] as [number, number], radius: 6, ...(scale === undefined ? {} : { scale }) }] };
  const before = structuredClone(settings), forbidden = () => assert.fail('readback must not edit the document');
  const html = renderToStaticMarkup(createElement(DetailsList, { settings, sheet: null, layout: null, onChange: forbidden, onRemove: forbidden, crop: { owner: {}, ready: true, annotated: new Set<string>(), apply: forbidden } }));
  assert.deepEqual(settings, before);
  return html.match(/<select[^>]*aria-label="Detail B scale"[^>]*>([\s\S]*?)<\/select>/)![1];
}
test('custom native scales have one exact selected option without rounding or mutation', () => {
  for (const value of [1.25, 0.75, 1.23456789, 0.0001, 1000]) {
    const html = render(value);
    assert.ok(html.includes(`<option value="${value}" selected="">${value}:1 (custom)</option>`), html);
    assert.equal((html.match(/ selected=""/g) ?? []).length, 1);
  }
});
test('standard scales and Auto remain single existing choices', () => {
  for (const value of [...SCALES, undefined]) {
    const html = render(value);
    assert.ok(html.includes(`<option value="${value ?? 'auto'}" selected="">`));
    assert.equal((html.match(/ selected=""/g) ?? []).length, 1);
    assert.ok(!html.includes('(custom)'));
  }
});
