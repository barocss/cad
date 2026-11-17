import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { SCALES } from '@barocss/cad-model/drawing/views';
import { SectionKind } from '../src/ui/drawing/SectionKind';

function render(scale?: number) {
  const section = { id: 'A', view: 'front' as const, at: 10, removed: { at: [200, 80] as [number, number], ...(scale === undefined ? {} : { scale }) } };
  const before = structuredClone(section), forbidden = () => assert.fail('readback must not edit the document');
  const html = renderToStaticMarkup(createElement(SectionKind, { section, views: null, onSet: forbidden }));
  assert.deepEqual(section, before);
  assert.ok(html.includes('aria-label="Set custom section A scale"'));
  return html.match(/<select[^>]*aria-label="Section A scale"[^>]*>([\s\S]*?)<\/select>/)![1];
}
test('custom native scales have one exact selected option without rounding or mutation', () => {
  for (const value of [1.25, 0.75, 1.23456789, 0.0001, 1000]) {
    const html = render(value);
    assert.ok(html.includes(`<option value="${value}" selected="">${value}:1 (custom)</option>`), html);
    assert.equal((html.match(/ selected=""/g) ?? []).length, 1);
  }
});
test('standard scales and sheet inheritance remain single existing choices', () => {
  for (const value of [...SCALES, undefined]) {
    const html = render(value);
    assert.ok(html.includes(`<option value="${value ?? 'sheet'}" selected="">`));
    assert.equal((html.match(/ selected=""/g) ?? []).length, 1);
    assert.ok(!html.includes('(custom)'));
  }
});
