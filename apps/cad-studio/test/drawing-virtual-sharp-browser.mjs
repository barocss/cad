import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-virtual-sharp-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'apps/cad-studio/src/drawing/drawing.css',
  ...['virtualSharp', 'dimensions', 'sheet', 'types', 'sheets', 'issues', 'reorient'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/svg.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'virtual-sharp',
  output: process.argv[2],
  envFrozen: 'D2013_SOURCE_FROZEN',
  qualification: 'Source-bound virtual sharp at theoretical intersection (30,20) of top (y=20, 0..26) and right (x=30, 0..16) edges on a 30x20x10 chamfered (4 mm) plate, with parallel & already-meeting edge refusals, Escape cancel, live witness preview & creation, linear dimensions from origin (0,0) to virtual sharp (30 horizontal & 20 vertical), Undo/Redo, SVG & DXF export, native .bcad Save/Open, post-Open Chamfer 4 -> 6 mm keeping 30 & 20, and post-Open Box Width 30 -> 40 mm updating horizontal 30 -> 40.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic 30x20x10 chamfered plate in ordinary unbroken Top view; PDF golden and schema 5/migration HOLDs stay separate.'],
  inspectorSource: `
import { prefixDoc, rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { brepsFor, evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
let doc = rectanglePart(30, 20, 10);
const b0 = brepsFor(doc);
if (!('breps' in b0)) throw Error('No box');
const vById = new Map(b0.breps[0].vertices.map(v => [v.id, v.point]));
const corner = b0.breps[0].edges.find(e => {
  const a = vById.get(e.vertices[0]), b = vById.get(e.vertices[1]);
  return a && b && Math.abs(a[0] - 30) < 1e-4 && Math.abs(a[1] - 20) < 1e-4 && Math.abs(b[0] - 30) < 1e-4 && Math.abs(b[1] - 20) < 1e-4;
})?.name ?? 'n1.side1|n1.side2';
const parentEval = evaluateDoc(prefixDoc(doc, 2), 1);
if (!parentEval.ok) throw Error('No parent eval');
doc = withNode(doc, { kind: 'chamfer', parent: { node: 1, side: 'solid' }, edges: [corner], distance: 4 });
doc = captureSignatures(doc, parentEval.bodies);
console.log(JSON.stringify({
  doc: { ...doc, drawing: { ...defaultDrawing(), scale: 1, dimensions: [] } },
  topEdgeMid: [13, 20],
  rightEdgeMid: [30, 8],
  bottomEdgeMid: [15, 0],
  leftEdgeMid: [0, 10],
  originCorner: [0, 0],
  virtualCorner: [30, 20],
}));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const wait = predicate => f.page.waitForFunction(predicate);

async function pointInTop(u, v) {
  const pt = await f.page.evaluate(([uu, vv]) => window.__studioDrawingAt?.('top', uu, vv), [u, v]);
  assert.ok(pt, `missing top point (${u}, ${v})`);
  return pt;
}

async function download(name, filename, encoding = 'utf8') {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(name).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, encoding);
}

await f.run(async () => {
  f.phase = 'open 30x20x10 chamfered (4 mm) plate in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'virtual-sharp.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 15, 0)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'refuse parallel and already-meeting corner edges, cancel cleanly with Escape';
  await button('Virtual sharp').click();
  const topPt = await pointInTop(info.topEdgeMid[0], info.topEdgeMid[1]);
  const rightPt = await pointInTop(info.rightEdgeMid[0], info.rightEdgeMid[1]);
  const botPt = await pointInTop(info.bottomEdgeMid[0], info.bottomEdgeMid[1]);
  const leftPt = await pointInTop(info.leftEdgeMid[0], info.leftEdgeMid[1]);
  await f.page.mouse.click(topPt.x, topPt.y);
  await wait(() => document.querySelectorAll('[data-virtual-sharp-source] line').length === 1);
  await f.page.mouse.click(botPt.x, botPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /parallel/i }).waitFor();
  await f.page.mouse.click(leftPt.x, leftPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /already meet/i }).waitFor();
  assert.deepEqual(await f.doc(), baseline);
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'create virtual sharp vs1 at (30,20) and place horizontal 30 and vertical 20 linear dimensions';
  await button('Virtual sharp').click();
  await f.page.mouse.click(topPt.x, topPt.y);
  await f.page.mouse.move(rightPt.x, rightPt.y);
  await wait(() => document.querySelectorAll('[data-virtual-sharp-preview] line').length === 2);
  assert.deepEqual(await f.doc(), baseline, 'preview must not mutate Doc');
  await f.page.mouse.click(rightPt.x, rightPt.y);
  await wait(() => window.__studioDoc?.drawing?.virtualSharps?.length === 1);
  await wait(() => document.querySelectorAll('g.virtual-sharp[data-virtual-sharp="vs1"] line').length === 2);
  await f.page.locator('[aria-label="Virtual sharps"]').filter({ hasText: '(30, 20)' }).waitFor();
  assert.equal(await f.page.getByRole('note', { name: 'DXF virtual sharp compatibility' }).count(), 1);

  // Place linear horizontal 30 and vertical 20 dimensions to virtual sharp (30, 20)
  await button('Linear dimension').click();
  const originPt = await pointInTop(info.originCorner[0], info.originCorner[1]);
  const vsPt = await pointInTop(info.virtualCorner[0], info.virtualCorner[1]);
  const placeH = await pointInTop(15, 30);
  await f.page.mouse.click(originPt.x, originPt.y);
  await f.page.mouse.click(vsPt.x, vsPt.y);
  await f.page.mouse.click(placeH.x, placeH.y);
  await wait(() => window.__studioDrawing?.()?.dimensions?.some(d => d.text === '30'));

  const placeV = await pointInTop(40, 10);
  await f.page.mouse.click(originPt.x, originPt.y);
  await f.page.mouse.click(vsPt.x, vsPt.y);
  await f.page.mouse.click(placeV.x, placeV.y);
  await wait(() => window.__studioDrawing?.()?.dimensions?.some(d => d.text === '20'));
  await f.snapshot('01-placed-30-20');

  f.phase = 'verify Undo/Redo on virtual-sharp dimension and marker';
  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  await button('Redo').click();
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 2);

  f.phase = 'verify SVG and DXF exports include virtual sharp witness lines and 30 / 20 dimensions';
  const svgText = await download('Export SVG', 'virtual-sharp.svg');
  assert.match(svgText, /data-virtual-sharp="vs1"/);
  assert.match(svgText, />30<\/text>/);
  assert.match(svgText, />20<\/text>/);
  const dxfText = await download('Export DXF', 'virtual-sharp.dxf', 'latin1');
  assert.match(dxfText, /DIMENSION/);

  f.phase = 'save .bcad, reopen fresh, edit Chamfer 4->6 (keeps 30 & 20), then edit Box Width 30->40 (updates 30->40)';
  const savedText = await download('Save', 'virtual-sharp-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.virtualSharps.length, 1);
  assert.equal(savedDoc.drawing.dimensions.length, 2);

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'virtual-sharp-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await wait(() => document.querySelectorAll('g.virtual-sharp[data-virtual-sharp="vs1"] line').length === 2);
  await wait(() => {
    const dims = window.__studioDrawing?.()?.dimensions ?? [];
    return dims.some(d => d.text === '30') && dims.some(d => d.text === '20');
  });
  await f.snapshot('02-reopened-saved');

  // Edit Chamfer 4 -> 6 mm: theoretical corner stays (30, 20), dimensions remain 30 and 20
  await button('Model').click();
  await f.openFeatureEditor(2, 'Chamfer');
  const chamferInput = f.editor().getByLabel('Distance', { exact: true });
  assert.equal(await chamferInput.inputValue(), '4');
  await chamferInput.fill('6');
  await f.applyEditor(await f.doc(), 'apply-chamfer-6');
  await wait(() => window.__studioDoc?.nodes?.[2]?.distance === 6);
  await button('Drawing').click();
  await wait(() => {
    const dims = window.__studioDrawing?.()?.dimensions ?? [];
    return dims.some(d => d.text === '30') && dims.some(d => d.text === '20');
  });
  await f.snapshot('03-after-chamfer-6');

  // Edit Box Width 30 -> 40 mm: virtual sharp moves to (40, 20), horizontal updates 30 -> 40
  await button('Model').click();
  await f.openFeatureEditor(1, 'Box');
  const widthInput = f.editor().getByLabel('Width', { exact: true });
  assert.equal(await widthInput.inputValue(), '30');
  await widthInput.fill('40');
  await f.applyEditor(await f.doc(), 'apply-box-width-40');
  await wait(() => window.__studioDoc?.nodes?.[0]?.max?.[0] === 40);
  await button('Drawing').click();
  await wait(() => {
    const dims = window.__studioDrawing?.()?.dimensions ?? [];
    const vs = window.__studioDrawing?.()?.virtualSharps?.[0];
    return !!vs && Math.abs(vs.point[0] - 40) < 1e-4 && dims.some(d => d.text === '40') && dims.some(d => d.text === '20');
  });
  await f.snapshot('04-after-width-40');

  return {
    initialCorner: [30, 20],
    afterChamfer6: [30, 20],
    afterWidth40: [40, 20],
  };
});
