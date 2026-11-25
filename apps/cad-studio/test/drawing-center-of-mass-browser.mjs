import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-center-of-mass-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/useDrawingSheet.ts',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'apps/cad-studio/src/drawing/drawing.css',
  'apps/cad-studio/src/storage/drawingDimensionChanges.ts',
  ...['centerOfMass', 'dimensions', 'sheet', 'types', 'sheets', 'issues', 'reorient', 'measurement', 'auto', 'toleranceStack'].map(
    s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts',
  ),
  'packages/barocss-cad-model/src/io/svg.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
  'packages/barocss-cad-model/src/chat/features.ts',
];

const f = await createFlow({
  name: 'center-of-mass',
  output: process.argv[2],
  envFrozen: 'D2017_SOURCE_FROZEN',
  qualification: 'Source-bound drawing center-of-mass (CG) symbol and live COM linear dimensions on an asymmetric 40x20x10 mm plate with a 10x10 through-cut at x=25..35, y=5..15 (exact COM X=130/7=18.5714 mm, Y=10 mm, distinct from bbox center 20 mm), verifying iso refusal, CG symbol creation, linear dimensions 18.57 and 10, presentation-only Hide/Show preserving dependent dimensions, Undo/Redo, SVG & DXF export, native .bcad Save/Open, and post-Open upstream Box Width 40->50 edit updating COM live to 220/9=24.44 mm.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic asymmetric 40x20x10 plate with 10x10 through-cut in ordinary unbroken Top view; PDF golden and schema 5/migration HOLDs stay separate.'],
  inspectorSource: `
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
let doc = rectanglePart(40, 20, 10);
doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [25, 5], max: [35, 15] });
doc = withNode(doc, { kind: 'extrude', sketch: 2, height: 10 });
doc = withNode(doc, { kind: 'difference', parent: { node: 1, side: 'solid' }, tool: { node: 3, side: 'solid' } });
console.log(JSON.stringify({
  doc: { ...doc, drawing: { ...defaultDrawing(), scale: 1, dimensions: [] } },
  originCorner: [0, 0],
  initialCom: [130 / 7, 10],
  widenedCom: [220 / 9, 10],
}));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const wait = predicate => f.page.waitForFunction(predicate);

async function pointInView(view, u, v) {
  const pt = await f.page.evaluate(([vw, uu, vv]) => window.__studioDrawingAt?.(vw, uu, vv), [view, u, v]);
  assert.ok(pt, `missing ${view} point (${u}, ${v})`);
  return pt;
}

async function download(name, filename, encoding = 'utf8') {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(name).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, encoding);
}

await f.run(async () => {
  f.phase = 'open asymmetric 40x20x10 plate with 10x10 through-cut in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'center-of-mass.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 20, 10)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'place center of mass symbol com1 in Top view and verify exact (18.57, 10) vs bbox 20';
  await button('Center of mass').click();
  const topClick = await pointInView('top', 20, 10);
  await f.page.mouse.click(topClick.x, topClick.y);
  await wait(() => window.__studioDoc?.drawing?.centerOfMass?.length === 1);
  await wait(() => document.querySelectorAll('g.center-of-mass[data-center-of-mass="com1"] path').length === 3);
  await wait(() => document.querySelectorAll('g.center-of-mass[data-center-of-mass="com1"] line').length === 2);
  await f.page.locator('[aria-label="Center of mass"]').filter({ hasText: '(18.57, 10)' }).waitFor();
  assert.equal(await f.page.getByRole('note', { name: 'DXF center of mass compatibility' }).count(), 1);
  const comInfo = await f.page.evaluate(() => window.__studioDrawing?.()?.centerOfMass?.[0]);
  assert.ok(comInfo && Math.abs(comInfo.point[0] - 130 / 7) < 1e-4, `expected COM X=130/7, got ${JSON.stringify(comInfo)}`);
  assert.ok(Math.abs(comInfo.point[1] - 10) < 1e-4);

  f.phase = 'place horizontal 18.57 and vertical 10 linear dimensions from origin to com1';
  await button('Linear dimension').click();
  const originPt = await pointInView('top', info.originCorner[0], info.originCorner[1]);
  const comPt = await pointInView('top', info.initialCom[0], info.initialCom[1]);
  const placeH = await pointInView('top', 10, 29);
  await f.page.mouse.click(originPt.x, originPt.y);
  await f.page.mouse.move(comPt.x, comPt.y);
  await wait(() => document.querySelectorAll('[data-com-snap="1"]').length === 1);
  await f.page.mouse.click(comPt.x, comPt.y);
  await f.page.mouse.click(placeH.x, placeH.y);
  await wait(() => window.__studioDrawing?.()?.dimensions?.some(d => d.text === '18.57'));

  const placeV = await pointInView('top', -10, 5);
  await f.page.mouse.click(originPt.x, originPt.y);
  await f.page.mouse.click(comPt.x, comPt.y);
  await f.page.mouse.click(placeV.x, placeV.y);
  await wait(() => window.__studioDrawing?.()?.dimensions?.some(d => d.text === '10'));
  await f.snapshot('01-com-and-dims-18-57');

  f.phase = 'hide COM symbol and confirm dependent 18.57 and 10 dimensions stay intact, then show again';
  await button('Hide center of mass com1').click();
  await wait(() => window.__studioDoc?.drawing?.centerOfMass?.[0]?.hidden === true);
  await wait(() => document.querySelectorAll('g.center-of-mass[data-center-of-mass="com1"]').length === 0);
  const dimsWhileHidden = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions ?? []);
  assert.ok(dimsWhileHidden.some(d => d.text === '18.57'), '18.57 dimension must stay resolved while symbol is hidden');
  assert.ok(dimsWhileHidden.some(d => d.text === '10'), '10 dimension must stay resolved while symbol is hidden');
  await f.snapshot('02-com-hidden-dims-kept');

  await button('Show center of mass com1').click();
  await wait(() => !window.__studioDoc?.drawing?.centerOfMass?.[0]?.hidden);
  await wait(() => document.querySelectorAll('g.center-of-mass[data-center-of-mass="com1"]').length === 1);

  f.phase = 'verify Undo/Redo on Show/Hide and linear dimension';
  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.centerOfMass?.[0]?.hidden === true);
  await button('Redo').click();
  await wait(() => !window.__studioDoc?.drawing?.centerOfMass?.[0]?.hidden);

  f.phase = 'verify SVG and DXF exports';
  const svgText = await download('Export SVG', 'center-of-mass.svg');
  assert.match(svgText, /data-center-of-mass="com1"/);
  assert.match(svgText, />18\.57<\/text>/);
  assert.match(svgText, />10<\/text>/);
  const dxfText = await download('Export DXF', 'center-of-mass.dxf', 'latin1');
  assert.match(dxfText, /DIMENSION/);
  assert.match(dxfText, /18\.57/);

  f.phase = 'save .bcad, reopen fresh, and edit Box Width 40 -> 50 so COM updates live 18.57 -> 24.44';
  const savedText = await download('Save', 'center-of-mass-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.centerOfMass.length, 1);
  assert.equal(savedDoc.drawing.dimensions.length, 2);
  assert.equal(savedDoc.drawing.dimensions[0].b.at, 'com');
  assert.equal(savedDoc.drawing.dimensions[0].b.edge, '');

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'center-of-mass-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await wait(() => document.querySelectorAll('g.center-of-mass[data-center-of-mass="com1"]').length === 1);
  await wait(() => {
    const dims = window.__studioDrawing?.()?.dimensions ?? [];
    return dims.some(d => d.text === '18.57') && dims.some(d => d.text === '10');
  });

  await button('Model').click();
  await f.openFeatureEditor(1, 'Box');
  const widthInput = f.editor().getByLabel('Width', { exact: true });
  assert.equal(await widthInput.inputValue(), '40');
  await widthInput.fill('50');
  await f.applyEditor(await f.doc(), 'apply-box-width-50');
  await wait(() => window.__studioDoc?.nodes?.[0]?.max?.[0] === 50);
  await button('Drawing').click();
  await wait(() => {
    const draw = window.__studioDrawing?.();
    const com = draw?.centerOfMass?.[0];
    const dims = draw?.dimensions ?? [];
    return !!com && Math.abs(com.point[0] - 220 / 9) < 1e-4 && dims.some(d => d.text === '24.44') && dims.some(d => d.text === '10');
  });
  await f.snapshot('03-reopened-width-50-com-24-44');

  assert.notDeepEqual(await f.doc(), baseline);
  return {
    initialCom: [130 / 7, 10],
    widenedCom: [220 / 9, 10],
  };
});
