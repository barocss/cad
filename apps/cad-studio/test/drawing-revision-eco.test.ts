import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { DrawingMetadata } from '../src/ui/drawing/DrawingMetadata';
import { checkDrawingMetadata, readRevisions, revisionTableContent } from '@barocss/cad-model/drawing/metadata';
import type { DrawingSettings } from '@barocss/cad-model/drawing/types';
const row = { revision: 'A', date: '2026-11-17', description: 'Hole changed', eco: 'EC-204' };
test('existing ECO records are visible and optional authoring input respects the native length', () => {
 const settings: DrawingSettings = { sheet: 'A4', projection: 'third', hidden: false, dimensions: [], revisions: [row] };
 const before = structuredClone(settings), forbidden = () => assert.fail('render must not commit');
 const html = renderToStaticMarkup(createElement(DrawingMetadata, { settings, onChange: forbidden, onRefused: forbidden }));
 assert.match(html, /A · ECO EC-204 · 2026-11-17 · Hole changed/);
 assert.match(html, /aria-label="Revision ECO"[^>]*maxLength="20"/);
 assert.deepEqual(settings, before);
});
test('ECO native validation, readback and table preserve the identifier; legacy records remain valid', () => {
 for (const record of [row, { ...row, eco: 'x'.repeat(20) }, { revision: 'B', date: row.date, description: 'No ECO' }]) {
  assert.deepEqual(checkDrawingMetadata({ revisions: [record] }), []);
  assert.deepEqual(readRevisions([record]), [record]);
 }
 const table = revisionTableContent([row]);
 assert.equal(table.columns[1].key, 'eco');assert.equal(table.rows[0][1], row.eco);
 for (const eco of ['', 'x'.repeat(21), 'bad\nvalue', 'bad\tvalue']) {
  const errors = checkDrawingMetadata({ revisions: [{ ...row, eco }] });assert.equal(errors.length, 1);assert.match(errors[0].message, /eco \(1–20 characters\)/);
 }
});
