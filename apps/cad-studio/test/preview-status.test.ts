import test from 'node:test';
import assert from 'node:assert/strict';
import { annotationCounts, printPreviewSummary } from '../src/app/previewStatus';
test('collapsed Print summary distinguishes suspension and current results', () => {
  assert.equal(printPreviewSummary('Print layers are available in Model view.', 'ready'), 'Print · Model only');
  assert.equal(printPreviewSummary('No visible solid mesh to preview.', 'ready'), 'Print · No solid');
  assert.equal(printPreviewSummary('Finish the current edit.', 'ready'), 'Print · Paused');
  assert.equal(printPreviewSummary(undefined, 'ready'), 'Print · Ready');
  assert.equal(printPreviewSummary(undefined, 'pending'), 'Print · Pending');
  assert.equal(printPreviewSummary(undefined, 'error', 'failure'), 'Print · Failed');
});
test('sheet-only annotations are not reported as an empty drawing', () => {
  assert.equal(annotationCounts(0, 1), '0 annotations on the model · 1 only on the sheet');
  assert.equal(annotationCounts(1, 0), '1 annotation on the model');
  assert.match(annotationCounts(0, 0), /No annotations yet/);
});
