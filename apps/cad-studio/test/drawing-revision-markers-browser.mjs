import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-revision-markers-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DrawingMetadata.tsx',
  'apps/cad-studio/src/ui/drawing/SheetSettings.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['revisionMarkers', 'metadata', 'types', 'sheets', 'sheet', 'issues', 'options', 'savedAnnotationRefs'].map(
    s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts',
  ),
  'packages/barocss-cad-model/src/io/svg.ts',
];

const f = await createFlow({
  name: 'revision-markers',
  output: process.argv[2],
  envFrozen: 'D2022_SOURCE_FROZEN',
  qualification: 'Drawing Revision Change Markers & Zone/Sheet Tracking (#227) across Sheet 1 (S1) and Sheet 2 (S2): records Revision B with ECO, places rm1 on Sheet 1 (A1) and rm2 on Sheet 2 (C4), refuses off-sheet click without mutating Doc, moves rm1 (A1->A2), sets manual override MANUAL-Z, moves rm1 again (A2->A3) & toggles Auto zones off/on confirming override preserved, resets to auto (A3, C4), verifies Hide/Show, Undo/Redo, SVG & DXF export, and .bcad Save/Open round-trip with geometry invariance.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['A4/A3 deterministic paper border-grid zones (live current-marker summary, not issued frozen snapshot); sheet delete/revision delete orphan diagnostics, A4->A3 and mm/inch invariance covered in model unit tests.'],
  inspectorSource: `
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
const doc = {
  ...emptyDoc(),
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [60, 40] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 12 },
    { kind: 'hole', id: 'n2', parent: { node: 1, side: 'solid' }, center: [15, 15], radius: 3, axis: 'z' },
  ],
  outputs: { b1: { node: 2, side: 'solid' } },
  nextId: 3,
  drawing: { ...defaultDrawing(), scale: 1, dimensions: [] },
};
console.log(JSON.stringify({ doc }));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const wait = (predicate, arg) => f.page.waitForFunction(predicate, arg);

async function sheetPx(x, y) {
  const pt = await f.page.evaluate(([sx, sy]) => window.__studioDrawingSheetAt?.(sx, sy), [x, y]);
  assert.ok(pt, `missing sheet point (${x}, ${y})`);
  return pt;
}

async function download(name, filename, encoding = 'utf8') {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(name).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, encoding);
}

await f.run(async () => {
  f.phase = 'open bracket part in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'rev-marker-part.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingSheetAt?.(35, 30)));
  const baselineNodes = JSON.stringify((await f.doc()).nodes);

  f.phase = 'record revision B with ECO and open revision table';
  await field('Revision').fill('B');
  const revDetails = f.page.locator('details[aria-label="Revision history"]');
  await revDetails.locator('summary').click();
  await field('Revision description').fill('Updated flange hole');
  await field('Revision by').fill('ENG');
  await field('Revision ECO').fill('ECO-42');
  await button('Record revision').click();
  await wait(() => window.__studioDoc?.drawing?.revisions?.length === 1);

  f.phase = 'refuse off-sheet marker placement without mutating Doc';
  const beforeOffSheet = await f.doc();
  await button('Revision marker').click();
  const offPt = await sheetPx(3, 3);
  await f.page.mouse.click(offPt.x, offPt.y);
  await wait(() => document.querySelector('.dw-hint')?.textContent?.includes('inside the sheet frame'));
  assert.deepEqual(await f.doc(), beforeOffSheet);

  f.phase = 'place rm1 on Sheet 1 (35, 30 => A1) and add Sheet 2 with rm2 (160, 115 => C4)';
  const p1 = await sheetPx(35, 30);
  await f.page.mouse.click(p1.x, p1.y);
  await wait(() => window.__studioDoc?.drawing?.revisionMarkers?.length === 1);
  await wait(() => window.__studioDrawing?.()?.revisionMarkers?.[0]?.zone === 'A1');

  await button('Add sheet').click();
  await wait(() => window.__studioDoc?.drawing?.sheets?.length === 1);
  await wait(() => Boolean(window.__studioDrawingSheetAt?.(160, 115)));
  const p2 = await sheetPx(160, 115);
  await f.page.mouse.click(p2.x, p2.y);
  await wait(() => window.__studioDoc?.drawing?.revisionMarkers?.length === 2);
  await wait(() => window.__studioDrawing?.()?.revisionMarkers?.[0]?.zone === 'C4');

  // Switch back to Sheet 1 and verify multi-sheet REVISIONS table shows SHEETS = 1, 2 and ZONES = A1, C4
  await f.page.getByRole('tab', { name: 'Sheet 1', exact: true }).click();
  await wait(() => {
    const svgText = document.querySelector('svg[aria-label="Drawing sheet"]')?.textContent ?? '';
    return svgText.includes('SHEETS') && svgText.includes('ZONES') && svgText.includes('1, 2') && svgText.includes('A1, C4');
  });
  await button('Select').click();
  assert.equal(await f.page.getByRole('note', { name: 'DXF revision marker compatibility' }).count(), 1);
  await f.snapshot('01-multisheet-markers-placed');

  f.phase = 'move rm1 (A1 -> A2), apply manual override MANUAL-Z, move again (A2 -> A3), toggle Auto zones off/on, verify override preserved';
  await button('Move revision marker rm1').click();
  await wait(() => window.__studioDrawing?.()?.revisionMarkers?.find(m => m.id === 'rm1')?.zone === 'A2');
  await wait(() => (document.querySelector('svg[aria-label="Drawing sheet"]')?.textContent ?? '').includes('A2, C4'));

  if (!(await revDetails.evaluate(el => el.open))) await revDetails.locator('summary').click();
  const manualZones = field('Manual zones B');
  await manualZones.fill('MANUAL-Z');
  await manualZones.press('Enter');
  await wait(() => window.__studioDoc?.drawing?.revisions?.[0]?.manualZones === 'MANUAL-Z');
  await wait(() => (document.querySelector('svg[aria-label="Drawing sheet"]')?.textContent ?? '').includes('MANUAL-Z'));

  // Move rm1 again (A2 -> A3): manual override must remain MANUAL-Z
  await button('Move revision marker rm1').click();
  await wait(() => window.__studioDrawing?.()?.revisionMarkers?.find(m => m.id === 'rm1')?.zone === 'A3');
  assert.equal((await f.doc()).drawing.revisions[0].manualZones, 'MANUAL-Z');

  // Toggle Auto zones off then back on: manual override must STILL remain MANUAL-Z
  await field('Auto zones B').click();
  await wait(() => window.__studioDoc?.drawing?.revisions?.[0]?.autoZones === false);
  await field('Auto zones B').click();
  await wait(() => window.__studioDoc?.drawing?.revisions?.[0]?.autoZones === undefined);
  assert.equal((await f.doc()).drawing.revisions[0].manualZones, 'MANUAL-Z');
  assert.ok((await f.page.locator('svg[aria-label="Drawing sheet"]').textContent()).includes('MANUAL-Z'));
  await f.snapshot('02-manual-override-preserved');

  f.phase = 'explicit Reset restores auto zones (A3, C4), test Hide/Show and Undo/Redo';
  await button('Reset zones B').click();
  await wait(() => window.__studioDoc?.drawing?.revisions?.[0]?.manualZones === undefined);
  await wait(() => (document.querySelector('svg[aria-label="Drawing sheet"]')?.textContent ?? '').includes('A3, C4'));

  // Hide/Show rm1: presentation-only hide removes ink while keeping marker record & summary
  await button('Hide revision marker rm1').click();
  await wait(() => window.__studioDoc?.drawing?.revisionMarkers?.find(m => m.id === 'rm1')?.hidden === true);
  assert.equal(await f.page.locator('g.revision-marker[data-revision-marker="rm1"]').count(), 0);
  await button('Show revision marker rm1').click();
  await wait(() => window.__studioDoc?.drawing?.revisionMarkers?.find(m => m.id === 'rm1')?.hidden === undefined);
  assert.equal(await f.page.locator('g.revision-marker[data-revision-marker="rm1"]').count(), 1);

  // Undo & Redo round-trip (Undo hides rm1 again, Redo shows rm1 again)
  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.revisionMarkers?.find(m => m.id === 'rm1')?.hidden === true);
  await button('Redo').click();
  await wait(() => window.__studioDoc?.drawing?.revisionMarkers?.find(m => m.id === 'rm1')?.hidden === undefined);

  f.phase = 'export SVG & DXF and verify independent readback';
  const svgText = await download('Export SVG', 'sheet1.svg');
  assert.ok(svgText.includes('data-revision-marker="rm1"'));
  assert.ok(svgText.includes('>SHEETS</text>'));
  assert.ok(svgText.includes('>ZONES</text>'));
  assert.ok(svgText.includes('>1, 2</text>'));
  assert.ok(svgText.includes('>A3, C4</text>'));
  assert.ok(svgText.includes('ECO-42'));

  const dxfText = await download('Export DXF', 'sheet1.dxf', 'latin1');
  assert.ok(dxfText.includes('SHEETS'));
  assert.ok(dxfText.includes('ZONES'));
  assert.ok(dxfText.includes('A3, C4'));

  f.phase = 'save .bcad, reopen fresh, verify markers, table, and native geometry invariance';
  const savedBytes = await download('Save', 'rev-markers-saved.bcad', null);
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'rev-markers-saved.bcad', mimeType: 'application/octet-stream', buffer: savedBytes });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => window.__studioDoc?.drawing?.revisionMarkers?.length === 2);
  await wait(() => (document.querySelector('svg[aria-label="Drawing sheet"]')?.textContent ?? '').includes('A3, C4'));
  const reopenedDoc = await f.doc();
  assert.equal(JSON.stringify(reopenedDoc.nodes), baselineNodes, 'native geometry nodes must be invariant');
  assert.equal(reopenedDoc.drawing.revisions[0].eco, 'ECO-42');
  assert.equal(reopenedDoc.drawing.revisions[0].description, 'Updated flange hole');
  await f.snapshot('03-reset-and-reopened');
});
