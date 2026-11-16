import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { continuityRecovery } from '../src/ui/continuityRecovery';
import { StepExportPanel } from '../src/files/StepExportPanel';
import type { ModelExportController } from '../src/files/useModelExports';
test('STEP ready panel explains inspection without duplicating native history loss', () => {
 const controller = { stepPreview: { name: 'part', meshes: 'auto', hasMeshes: false, stage: 'ready', profile: 'STEP AP214', losses: ['Native feature history is not included; STEP contains the resulting geometry.'] } } as unknown as ModelExportController;
 const html = renderToStaticMarkup(createElement(StepExportPanel, { controller }));
 assert.equal((html.match(/history/g) ?? []).length, 1); assert.match(html, /original .bcad/); assert.match(html, /does not by itself mean the geometry changed/);
 controller.stepPreview!.stage = 'preparing'; assert.doesNotMatch(renderToStaticMarkup(createElement(StepExportPanel, { controller })), /STEP continuity inspection/);
});
test('only missing-pcurve refusals suggest conditional STEP recovery', () => {
 assert.match(continuityRecovery('missing-pcurve'), /If this model came from STEP/);
 for (const reason of ['edge-not-found', 'invalid-incidence', 'same-face-seam', 'faceted-geometry', 'binding-mismatch', 'derivative-unavailable'] as const) assert.equal(continuityRecovery(reason), 'This edge cannot be measured. Select another native edge.');
});
