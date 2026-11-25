import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-crossing-break-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['crossingBreak', 'sheet', 'types', 'issues', 'annotations3d'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
];

const f = await createFlow({
  name: 'crossing-break',
  output: process.argv[2],
  envFrozen: 'D2003_SOURCE_FROZEN',
  qualification: 'Optional crossing break on one linear dimension line over another, with mutual-conflict refusal, paper-mm scale/unit invariance, Undo/Redo, native Save/Open, and independent SVG/DXF verification.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic rectangular part, manual orthographic linear dimension pairs only, not PDF golden qualification.'],
  inspectorSource: `
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { snapPoints } from '@barocss/cad-model/drawing/dimensions';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
const doc = rectanglePart(40, 8, 24), b = brepsFor(doc);
if (!('breps' in b)) throw Error('No fixture solid');
const p = projectViews(b.breps, b.prefixes);
if (!p.ok) throw Error('No projection');
const points = snapPoints(p.views.front);
const at = (x, y) => points.find(q => Math.abs(q.at[0] - x) + Math.abs(q.at[1] - y) < 1e-8).ref;
const h1 = { id: 'h1', kind: 'linear', view: 'front', orient: 'horizontal', a: at(0, 0), b: at(40, 0), place: [20, 10] };
const v1 = { id: 'v1', kind: 'linear', view: 'front', orient: 'vertical', a: at(0, 0), b: at(0, 24), place: [10, 12] };
console.log(JSON.stringify({ ...doc, drawing: { ...defaultDrawing(), scale: 1, dimensions: [h1, v1] } }));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const wait = predicate => f.page.waitForFunction(predicate);
const near = (a, b, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`);

async function selectDim(pattern) {
  if (!(await f.page.locator('.dw[aria-label="Drawing"]').count())) await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="h1"]').waitFor();
  await f.page.locator('.dw-annotation-select').filter({ hasText: pattern }).click();
}

async function horizontalDimLines(dimId) {
  return f.page.locator(`g.dimension[data-dim="${dimId}"] > line`).evaluateAll(els =>
    els.map(e => ({
      x1: Number(e.getAttribute('x1')),
      y1: Number(e.getAttribute('y1')),
      x2: Number(e.getAttribute('x2')),
      y2: Number(e.getAttribute('y2')),
    })).filter(l => Math.abs(l.y1 - l.y2) < 1e-2 && Math.abs(l.x2 - l.x1) > 1),
  );
}

async function verticalDimLines(dimId) {
  return f.page.locator(`g.dimension[data-dim="${dimId}"] > line`).evaluateAll(els =>
    els.map(e => ({
      x1: Number(e.getAttribute('x1')),
      y1: Number(e.getAttribute('y1')),
      x2: Number(e.getAttribute('x2')),
      y2: Number(e.getAttribute('y2')),
    })).filter(l => Math.abs(l.x1 - l.x2) < 1e-2 && Math.abs(l.y2 - l.y1) > 1),
  );
}

async function download(name, filename) {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(name).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, 'utf8');
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
const pair = (ent, key) => ent.pairs.find(([k]) => k === key)?.[1];

await f.run(async () => {
  f.phase = 'open crossing fixture and verify unbroken baseline';
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'crossing-break.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.ready();
  await selectDim(/horizontal · front/);
  await field('Crossing break target').waitFor();

  const before = await f.doc();
  const baseH = await horizontalDimLines('h1');
  const baseV = await verticalDimLines('v1');
  assert.equal(baseH.length, 1);
  assert.equal(baseV.length, 1);
  await f.snapshot('00-unbroken');

  f.phase = 'apply crossing break on h1 over v1 at 2 mm paper gap';
  await field('Crossing break target').selectOption('v1');
  await wait(() => window.__studioDoc?.drawing?.dimensions?.[0]?.crossingBreak?.over === 'v1');
  const broken2 = await f.doc();
  const split2 = await horizontalDimLines('h1');
  assert.equal(split2.length, 2);
  near(split2[1].x1 - split2[0].x2, 2.0, 0.02);
  assert.deepEqual(await verticalDimLines('v1'), baseV);
  assert.equal(await f.page.getByRole('note', { name: 'DXF crossing break compatibility' }).count(), 1);
  await f.snapshot('01-break-2mm');

  f.phase = 'verify mutual conflict refusal on v1 leaves doc and history unchanged';
  await selectDim(/vertical · front/);
  await field('Crossing break target').selectOption('h1');
  await f.page.waitForTimeout(250);
  assert.deepEqual(await f.doc(), broken2);
  assert.equal((await horizontalDimLines('h1')).length, 2);
  assert.equal((await verticalDimLines('v1')).length, 1);

  f.phase = 'verify FIRST Undo and Redo';
  await selectDim(/horizontal · front/);
  await f.undo();
  await f.same(before);
  assert.equal((await horizontalDimLines('h1')).length, 1);
  await f.redo();
  await f.same(broken2);
  await selectDim(/horizontal · front/);
  assert.equal((await horizontalDimLines('h1')).length, 2);

  f.phase = 'change paper gap to 3 mm, switch to inch and 1:2 scale, verify SVG & DXF';
  await field('Crossing break gap').selectOption('3');
  await wait(() => window.__studioDoc?.drawing?.dimensions?.[0]?.crossingBreak?.gap === 3);
  const split3 = await horizontalDimLines('h1');
  assert.equal(split3.length, 2);
  near(split3[1].x1 - split3[0].x2, 3.0, 0.02);

  const details = f.page.locator('details').filter({ hasText: 'inch decimals' });
  await details.locator(':scope > summary').click();
  await field('Drawing units').selectOption('inch');
  await button('Set custom sheet scale').click();
  await field('Scale paper ratio').fill('1');
  await field('Scale model ratio').fill('2');
  await button('Apply custom sheet scale').click();
  await wait(() => window.__studioDoc?.drawing?.scale === 0.5 && window.__studioDoc?.drawing?.units === 'inch');
  const split3Scaled = await horizontalDimLines('h1');
  assert.equal(split3Scaled.length, 2);
  // Paper-mm gap stays 3.0 mm even when sheet scale halves from 1:1 to 1:2 and units change to inch!
  near(split3Scaled[1].x1 - split3Scaled[0].x2, 3.0, 0.02);
  await f.snapshot('02-gap-3mm-inch-scaled');

  // Independent exported SVG bytes check
  const svg = await download('Export SVG', 'crossing-break.svg');
  const h1Chunk = svg.match(/<g class="dimension"[^>]+data-dim="h1">([^\n]+)<\/g>/)?.[1];
  const v1Chunk = svg.match(/<g class="dimension"[^>]+data-dim="v1">([^\n]+)<\/g>/)?.[1];
  assert.ok(h1Chunk && v1Chunk);
  const svgHLines = [...h1Chunk.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)]
    .map(m => ({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) }))
    .filter(l => Math.abs(l.y1 - l.y2) < 1e-2 && Math.abs(l.x2 - l.x1) > 1);
  assert.equal(svgHLines.length, 2);
  near(svgHLines[1].x1 - svgHLines[0].x2, 3.0, 0.02);
  const svgVLines = [...v1Chunk.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g)]
    .map(m => ({ x1: Number(m[1]), y1: Number(m[2]), x2: Number(m[3]), y2: Number(m[4]) }))
    .filter(l => Math.abs(l.x1 - l.x2) < 1e-2 && Math.abs(l.y2 - l.y1) > 1);
  assert.equal(svgVLines.length, 1);

  // Independent exported DXF check: native DIMENSION value 40 preserved + split display block lines
  const dxf = dxfEntities(await download('Export DXF', 'crossing-break.dxf'));
  const dxfH1 = dxf.find(e => e.type === 'DIMENSION' && Math.abs(Number(pair(e, 42)) - 40) < 1e-6);
  assert.ok(dxfH1);
  const blockIdx = dxf.findIndex(e => e.type === 'BLOCK' && pair(e, 2) === pair(dxfH1, 2));
  const endIdx = dxf.findIndex((e, i) => i > blockIdx && e.type === 'ENDBLK');
  assert.ok(blockIdx >= 0 && endIdx > blockIdx);
  const blockHLines = dxf.slice(blockIdx + 1, endIdx)
    .filter(e => e.type === 'LINE' && Math.abs(Number(pair(e, 20)) - Number(pair(e, 21))) < 1e-2 && Math.abs(Number(pair(e, 11)) - Number(pair(e, 10))) > 1);
  assert.equal(blockHLines.length, 2);
  near(Number(pair(blockHLines[1], 10)) - Number(pair(blockHLines[0], 11)), 3.0, 0.02);
  f.report.observations.push({ svgGapMM: svgHLines[1].x1 - svgHLines[0].x2, dxfMeasuredMM: 40, dxfBlockSegments: blockHLines.length });

  f.phase = 'save native .bcad, fresh open, verify persistence, edit gap, and clear break';
  const saved = await f.save('crossing-break-reopen');
  await f.newPage();
  await field('Model file').setInputFiles(saved.file);
  await f.ready();
  assert.deepEqual(await f.doc(), saved.doc);
  await selectDim(/horizontal · front/);
  assert.equal(await field('Crossing break target').inputValue(), 'v1');
  assert.equal(await field('Crossing break gap').inputValue(), '3');
  const reopenedLines = await horizontalDimLines('h1');
  assert.equal(reopenedLines.length, 2);
  near(reopenedLines[1].x1 - reopenedLines[0].x2, 3.0, 0.02);
  await f.snapshot('03-fresh-open');

  await button('Remove crossing break h1').click();
  await wait(() => !window.__studioDoc?.drawing?.dimensions?.[0]?.crossingBreak);
  assert.equal((await horizontalDimLines('h1')).length, 1);
  assert.equal(await f.page.getByRole('note', { name: 'DXF crossing break compatibility' }).count(), 0);
  await f.snapshot('04-cleared');
});
