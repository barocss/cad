import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-inspection-items-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['inspectionItems', 'types', 'sheets', 'sheet', 'issues', 'options', 'savedAnnotationRefs'].map(
    s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts',
  ),
  'packages/barocss-cad-model/src/io/svg.ts',
];

const f = await createFlow({
  name: 'inspection-items',
  output: process.argv[2],
  envFrozen: 'D2023_SOURCE_FROZEN',
  qualification: 'Drawing Inspection Items (#225) on a 2-sheet bracket (50.8x25.4x12 with Ø8 hole): adds 3 inspection items (2 on Sheet 1, 1 on Sheet 2) with distinct stadium/pill badges & INSPECTION LIST table, records Revision A baseline, renumbers ii2 (2->7) while refusing duplicate #1, verifies cross-highlight & baseline diff, Undo/Redo, SVG/Inspection CSV/DXF readbacks, and .bcad Save/Open round-trip with native geometry invariance.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Linear and diameter dimensions (non-basic) in v1; fit-code limit honesty, basic refusal, ID-reuse stale detection, and formula-injection CSV checks verified in model unit tests.'],
  inspectorSource: `
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { layoutSheet } from '@barocss/cad-model/drawing/views';
import { autoDimensions } from '@barocss/cad-model/drawing/auto';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';

const base = {
  ...emptyDoc(),
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [50.8, 25.4] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 12 },
    { kind: 'hole', id: 'n2', parent: { node: 1, side: 'solid' }, center: [25.4, 12.7], radius: 4, axis: 'z' },
  ],
  outputs: { b1: { node: 2, side: 'solid' } },
  nextId: 3,
};
const built = brepsFor(base);
const proj = projectViews(built.breps);
const baseDrawing = { ...defaultDrawing(), scale: 1, dimensions: [] };
const layout = layoutSheet(proj.views, baseDrawing);
const auto = autoDimensions(proj.views, layout, baseDrawing, () => null).dimensions;
const linearTop = auto.find(d => d.kind === 'linear' && d.view === 'top');
const diameterTop = auto.find(d => d.kind === 'diameter' && d.view === 'top');
const rightHoriz = proj.views.right.edges.find(e => e.kind === 'line' && e.ends && e.pieces.some(p => p.visible)
  && Math.abs(e.ends[0][1] - e.ends[1][1]) > 20 && Math.abs(e.ends[0][2] - e.ends[1][2]) < 1e-6);
const d1 = { ...linearTop, id: 'd1', tol: { kind: 'symmetric', value: 0.1 } }; delete d1.auto;
const d2 = { ...diameterTop, id: 'd2', tol: { kind: 'fit', code: 'H7' } }; delete d2.auto;
const d3 = {
  id: 'd3',
  view: 'right',
  kind: 'linear',
  orient: 'horizontal',
  a: { edge: rightHoriz.name, at: 'end', near: [...rightHoriz.ends[0]] },
  b: { edge: rightHoriz.name, at: 'end', near: [...rightHoriz.ends[1]] },
  place: [12.7, -8],
  tol: { kind: 'deviation', upper: 0.2, lower: -0.05 },
};

const doc = {
  ...base,
  drawing: {
    ...baseDrawing,
    revision: 'A',
    sheets: [{ id: 'S2', name: 'Right Sheet', views: ['right'] }],
    dimensions: [d1, d2, d3],
  },
};
console.log(JSON.stringify({ doc }));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const wait = (predicate, arg) => f.page.waitForFunction(predicate, arg);

async function download(name, filename, encoding = 'utf8') {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(name).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, encoding);
}

await f.run(async () => {
  f.phase = 'open 2-sheet bracket in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'inspection-bracket.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawing?.()?.dimensions?.length === 2));
  const baselineNodes = JSON.stringify((await f.doc()).nodes);

  f.phase = 'add inspection items #1 and #2 on Sheet 1, then #3 on Sheet 2';
  await f.page.locator('g.dimension[data-dim="d1"] text').first().click();
  await button('Add inspection item').click();
  await wait(() => window.__studioDoc?.drawing?.inspectionItems?.length === 1);

  await f.page.locator('g.dimension[data-dim="d2"] text').first().click();
  await button('Add inspection item').click();
  await wait(() => window.__studioDoc?.drawing?.inspectionItems?.length === 2);

  await f.page.getByRole('tab', { name: 'Right Sheet', exact: true }).click();
  await wait(() => Boolean(window.__studioDrawing?.()?.dimensions?.length === 1));
  await f.page.locator('g.dimension[data-dim="d3"] text').first().click();
  await button('Add inspection item').click();
  await wait(() => window.__studioDoc?.drawing?.inspectionItems?.length === 3);

  await f.page.getByRole('tab', { name: 'Sheet 1', exact: true }).click();
  await wait(() => {
    const svgText = document.querySelector('svg[aria-label="Drawing sheet"]')?.textContent ?? '';
    return svgText.includes('INSPECTION LIST') && svgText.includes('ii1') && svgText.includes('ii3') && svgText.includes('H7');
  });
  assert.equal(await f.page.locator('g.inspection-item[data-inspection-item="ii1"]').count(), 1);
  assert.equal(await f.page.locator('g.inspection-item[data-inspection-item="ii2"]').count(), 1);
  assert.equal(await f.page.getByRole('note', { name: 'DXF inspection item compatibility' }).count(), 1);
  await f.snapshot('01-inspection-items-multisheet');

  f.phase = 'record baseline Rev A, refuse duplicate #1, renumber ii2 (2 -> 7), verify cross-highlight & baseline diff';
  await button('Record inspection baseline').click();
  await wait(() => window.__studioDoc?.drawing?.inspectionBaselines?.length === 1);

  const num2 = field('Inspection number ii2');
  await num2.fill('1');
  await num2.press('Enter');
  await wait(() => document.querySelector('.dw-hint')?.textContent?.includes('already assigned'));
  assert.equal((await f.doc()).drawing.inspectionItems.find(i => i.id === 'ii2').number, 2);

  await num2.fill('7');
  await num2.press('Enter');
  await wait(() => window.__studioDoc?.drawing?.inspectionItems?.find(i => i.id === 'ii2')?.number === 7);
  await wait(() => (document.querySelector('[aria-label="Inspection baseline diff"]')?.textContent ?? '').includes('#2 changed'));

  // Click ii2 badge on sheet -> cross-highlights BOTH ii2 badge AND d2 dimension
  await f.page.locator('g.inspection-item[data-inspection-item="ii2"] text').first().click();
  await wait(() => document.querySelector('g.dimension[data-dim="d2"]')?.classList.contains('sel'));
  await f.snapshot('02-renumbered-baseline-diff');

  f.phase = 'verify Undo/Redo on renumbering';
  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.inspectionItems?.find(i => i.id === 'ii2')?.number === 2);
  await button('Redo').click();
  await wait(() => window.__studioDoc?.drawing?.inspectionItems?.find(i => i.id === 'ii2')?.number === 7);

  f.phase = 'verify SVG, Inspection CSV, and DXF exports';
  const svgText = await download('Export SVG', 'inspection-sheet1.svg');
  assert.ok(svgText.includes('data-inspection-item="ii1"'));
  assert.ok(svgText.includes('data-inspection-item="ii2"'));
  assert.ok(svgText.includes('>INSPECTION LIST</text>'));
  assert.ok(svgText.includes('>7</text>'));

  const csvText = await download('Export inspection CSV', 'inspection-list.csv');
  const csvLines = csvText.trim().split('\r\n');
  assert.equal(csvLines.length, 4);
  assert.ok(csvLines[0].includes('item_id,item_number,dim_id'));
  assert.ok(csvLines.some(l => l.includes('ii2,7,d2,1,top') && l.includes(',fit,H7,,,ok,')));
  assert.ok(csvLines.some(l => l.includes('ii3,3,d3,2,right') && l.includes(',deviation,,')));

  const dxfText = await download('Export DXF', 'inspection-sheet1.dxf', 'latin1');
  assert.ok(dxfText.includes('INSPECTION LIST'));

  f.phase = 'save .bcad, reopen fresh, verify items, baseline, table, and native geometry invariance';
  const savedBytes = await download('Save', 'inspection-saved.bcad', null);
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'inspection-saved.bcad', mimeType: 'application/octet-stream', buffer: savedBytes });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => window.__studioDoc?.drawing?.inspectionItems?.length === 3);
  await wait(() => (document.querySelector('[aria-label="Inspection baseline diff"]')?.textContent ?? '').includes('#2 changed'));
  const reopenedDoc = await f.doc();
  assert.equal(JSON.stringify(reopenedDoc.nodes), baselineNodes, 'native geometry nodes must be invariant');
  assert.equal(reopenedDoc.drawing.inspectionItems.find(i => i.id === 'ii2').number, 7);
  assert.equal(reopenedDoc.drawing.inspectionBaselines.length, 1);
  await f.snapshot('03-reopened-verified');
});
