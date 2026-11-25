import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-bisector-centerline-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'apps/cad-studio/src/drawing/drawing.css',
  ...['bisectorCenterline', 'sheet', 'types', 'sheets', 'issues', 'reorient'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/svg.ts',
  'packages/barocss-cad-model/src/io/dxf.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'bisector-centerline',
  output: process.argv[2],
  envFrozen: 'D2012_SOURCE_FROZEN',
  qualification: 'Source-bound straight centerline bisecting two parallel equal-span straight edges (40x10x5 plate, A=(0,0,5)->(40,0,5) & B=(0,10,5)->(40,10,5), bisector y=5) with same-edge & perpendicular refusals, Escape cancel, live preview & creation, 2-source highlight, global Centre lines hide/show preserving record, Delete + Undo/Redo, SVG & DXF CENTER LINE (45 mm = 40 + 2*2.5 mm) export, native .bcad Save/Open, and post-Open Box Depth edit 10 -> 14 mm moving bisector to y=7.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic 40x10x5 rectangular plate in ordinary unbroken Top view; PDF golden and schema 5/migration HOLDs stay separate.'],
  inspectorSource: `
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
const doc = rectanglePart(40, 10, 5);
console.log(JSON.stringify({
  doc: { ...doc, drawing: { ...defaultDrawing(), scale: 1, dimensions: [] } },
  bottomEdgeMid: [20, 0],
  topEdgeMid: [20, 10],
  leftEdgeMid: [0, 5],
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

function dxfEntities(source) {
  const lines = source.trim().split(/\r?\n/), out = [];
  assert.equal(lines.length % 2, 0);
  for (let i = 0; i < lines.length; i += 2) {
    const key = Number(lines[i].trim()), value = lines[i + 1].trim();
    if (key === 0) out.push({ type: value, pairs: [] });
    else out.at(-1)?.pairs.push([key, value]);
  }
  return out;
}

function dxfLineLength(entity) {
  const get = code => Number(entity.pairs.find(([k]) => k === code)?.[1]);
  return Math.hypot(get(11) - get(10), get(21) - get(20));
}

await f.run(async () => {
  f.phase = 'open 40x10x5 plate in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'bisector-centerline.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 20, 0)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'refuse same edge and perpendicular edge, cancel cleanly with Escape';
  await button('Centerline').click();
  const botPt = await pointInTop(info.bottomEdgeMid[0], info.bottomEdgeMid[1]);
  const topPt = await pointInTop(info.topEdgeMid[0], info.topEdgeMid[1]);
  const leftPt = await pointInTop(info.leftEdgeMid[0], info.leftEdgeMid[1]);
  await f.page.mouse.click(botPt.x, botPt.y);
  await wait(() => document.querySelectorAll('[data-bisector-centerline-source] line').length === 1);
  await f.page.mouse.click(botPt.x, botPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /distinct, separated/i }).waitFor();
  await f.page.mouse.click(leftPt.x, leftPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /not parallel/i }).waitFor();
  assert.deepEqual(await f.doc(), baseline);
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'create straight bisector centerline cl1 between y=0 and y=10 edges';
  await button('Centerline').click();
  await f.page.mouse.click(botPt.x, botPt.y);
  await f.page.mouse.move(topPt.x, topPt.y);
  await wait(() => document.querySelectorAll('[data-bisector-centerline-preview] line').length === 1);
  assert.deepEqual(await f.doc(), baseline, 'preview must not mutate Doc before second click');
  await f.page.mouse.click(topPt.x, topPt.y);
  await wait(() => window.__studioDoc?.drawing?.bisectorCenterlines?.length === 1);
  await wait(() => document.querySelectorAll('g.bisector-centerline[data-bisector-centerline="cl1"] line').length === 1);
  await wait(() => document.querySelectorAll('[data-bisector-centerline-source] line').length === 2);
  await f.page.locator('[aria-label="Centerlines"]').filter({ hasText: 'L40' }).waitFor();
  assert.equal(await f.page.getByRole('note', { name: 'DXF straight centerline compatibility' }).count(), 1);
  await f.snapshot('01-placed-y5');

  f.phase = 'toggle Centre lines off and on without deleting bisector centerline record';
  const centersToggle = f.page.getByLabel('Centre lines', { exact: true });
  await centersToggle.uncheck();
  await wait(() => document.querySelectorAll('g.bisector-centerline[data-bisector-centerline="cl1"]').length === 0);
  assert.equal((await f.doc()).drawing.bisectorCenterlines.length, 1);
  await f.snapshot('02-centers-hidden');
  await centersToggle.check();
  await wait(() => document.querySelectorAll('g.bisector-centerline[data-bisector-centerline="cl1"] line').length === 1);

  f.phase = 'verify Delete + Undo/Redo restore cleanly';
  await button('Remove centerline cl1').click();
  await wait(() => !window.__studioDoc?.drawing?.bisectorCenterlines?.length);
  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.bisectorCenterlines?.length === 1);
  await button('Redo').click();
  await wait(() => !window.__studioDoc?.drawing?.bisectorCenterlines?.length);
  await button('Undo').click();
  await wait(() => document.querySelectorAll('g.bisector-centerline[data-bisector-centerline="cl1"] line').length === 1);

  f.phase = 'verify SVG and DXF exports contain exact 45 mm CENTER LINE';
  const svgText = await download('Export SVG', 'bisector-centerline.svg');
  assert.match(svgText, /<g class="bisector-centerline" data-view="top" data-bisector-centerline="cl1">[\s\S]*stroke-dasharray="8 1\.5 1\.5 1\.5"/);
  const dxfText = await download('Export DXF', 'bisector-centerline.dxf', 'latin1');
  const centerLines = dxfEntities(dxfText).filter(e => e.type === 'LINE' && e.pairs.some(([k, v]) => k === 8 && v === 'CENTER'));
  assert.equal(centerLines.length, 1);
  assert.ok(Math.abs(dxfLineLength(centerLines[0]) - 45) < 1e-4, `expected 45 mm CENTER LINE, got ${dxfLineLength(centerLines[0])}`);

  f.phase = 'save .bcad, reopen in fresh session, and edit Box Depth 10 -> 14 mm (bisector y=5 -> y=7)';
  const savedText = await download('Save', 'bisector-centerline-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.bisectorCenterlines.length, 1);

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'bisector-centerline-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await wait(() => document.querySelectorAll('g.bisector-centerline[data-bisector-centerline="cl1"] line').length === 1);
  await f.page.locator('[aria-label="Centerlines"]').filter({ hasText: 'L40' }).waitFor();
  await f.snapshot('03-reopened-saved');

  await button('Model').click();
  await f.openFeatureEditor(1, 'Box');
  const depthInput = f.editor().getByLabel('Depth', { exact: true });
  assert.equal(await depthInput.inputValue(), '10');
  await depthInput.fill('14');
  await f.applyEditor(await f.doc(), 'apply-box-depth-14');
  await wait(() => window.__studioDoc?.nodes?.[0]?.max?.[1] === 14);
  await button('Drawing').click();
  await wait(() => {
    const cl = window.__studioDrawing?.()?.bisectorCenterlines?.[0];
    return !!cl && Math.abs(cl.start[1] - 7) < 1e-4 && Math.abs(cl.end[1] - 7) < 1e-4 && Math.abs(cl.separation - 14) < 1e-4;
  });
  await f.snapshot('04-after-depth-14');

  return {
    initialY: 5,
    editedY: 7,
    dxfCenterLineLengthMm: dxfLineLength(centerLines[0]),
  };
});
