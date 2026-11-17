import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const { input } = JSON.parse(await readFile('packages/barocss-cad/conformance/r14/orient-cross-hole-y-plus/case.json', 'utf8'));
const fixture = { ...input.document, drawing: { sheet: 'A4', projection: 'third', hidden: true, scale: 1, title: 'Attached frame sheet identity', views: ['front', 'top', 'right'],
  dimensions: [{ id: 'd1', view: 'top', kind: 'linear', orient: 'vertical', place: [-10, 15], a: { edge: 'n1.bottom|n1.side0', at: 'end', near: [0, 0, 0] }, b: { edge: 'n1.bottom|n1.side2', at: 'end', near: [0, 30, 0] } }],
  frames: [{ id: 'control-d1', view: 'right', place: [-10, 10], characteristic: 'flatness', value: .2, datums: [] }], sheets: [{ id: 'S2', name: 'Side controls', views: ['right'], scale: 1 }] } };
const f = await createFlow({ name: 'drawing-attached-frame-sheets', envFrozen: 'DRAWING_ATTACHED_FRAME_SHEETS_FROZEN', output: process.argv[2], qualification: 'Dimension-attached frame allocation reserves valid IDs on every sheet and preserves both annotations through edit/history/file/SVG.', initialFiles: ['apps/cad-studio/test/drawing-attached-frame-sheets-browser.mjs', 'apps/cad-studio/src/ui/DrawingWorkspace.tsx', 'apps/cad-studio/src/ui/drawing/FrameEditor.tsx'], limits: ['Valid imported custom ID on a separate sheet, one ordinary top dimension; no GD&T solver or PDF qualification.'] });
const button = name => f.page.getByRole('button', { name, exact: true });
async function drawing() { await button('Drawing').click(); await f.page.locator('svg[aria-label="Drawing sheet"] g.view').first().waitFor(); }
async function svg(label, id) { const attr = id === 'control-d1' ? 'data-standalone-frame' : 'data-dim'; await f.page.locator(`svg[aria-label="Drawing sheet"] [${attr}="${id}"]`).waitFor(); const [d] = await Promise.all([f.page.waitForEvent('download'), button('Export SVG').click()]); const file = join(f.output, label+'.svg'); await d.saveAs(file); assert.ok((await readFile(file, 'utf8')).includes(`${attr}="${id}"`)); }
await f.run(async () => {
  await f.newPage(); await f.page.locator('input[aria-label="Model file"]').setInputFiles({ name: 'attached-frame-sheets.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await f.page.waitForFunction(() => window.__studioDoc?.drawing?.title === 'Attached frame sheet identity'); await f.ready(); await drawing();
  await f.page.locator('.dw-dim').filter({ hasText: '· top' }).getByRole('button').first().click(); const before = await f.doc(); await button('Add geometric control').click();
  await f.page.waitForTimeout(300); const added = await f.doc(); f.report.observations.push({ beforeFrames: before.drawing.frames, addedFrames: added.drawing.frames }); await f.snapshot('01-attached');
  assert.equal(added.drawing.frames.length, 2, 'adding a dimension control must preserve the other-sheet imported frame'); assert.equal(new Set(added.drawing.frames.map(x => x.id)).size, 2);
  assert.deepEqual(added.drawing.frames.find(x => x.id === 'control-d1'), before.drawing.frames[0]); const attached = added.drawing.frames.find(x => x.dim === 'd1'); assert.ok(attached); assert.equal(attached.id, 'control-d1-2');
  await f.undo(); await f.same(before); await f.redo(); await f.same(added);
  await f.page.getByLabel('Geometric tolerance', { exact: true }).fill('0.3'); await f.page.getByLabel('Geometric tolerance', { exact: true }).press('Enter'); await f.changed(added); const edited = await f.doc(); assert.equal(edited.drawing.frames.find(x => x.dim === 'd1').value, .3); assert.deepEqual(edited.drawing.frames.find(x => x.id === 'control-d1'), before.drawing.frames[0]);
  await svg('attached', attached.id); await f.page.getByRole('tab', { name: 'Side controls', exact: true }).click(); await svg('other-sheet', 'control-d1');
  await button('Model').click(); const saved = await f.save('attached-control'); await f.freshOpen(saved.file, saved.doc, '02-reopened'); await drawing(); await svg('reopened-attached', attached.id); await f.snapshot('03-reopened'); assert.deepEqual((await f.doc()).drawing.frames, edited.drawing.frames);
});
