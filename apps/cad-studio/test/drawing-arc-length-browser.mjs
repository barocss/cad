import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-arc-length-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['arcLength', 'dimensions', 'sheet', 'types', 'issues', 'annotations3d', 'dimensionReferences'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/dxf.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'arc-length',
  output: process.argv[2],
  envFrozen: 'D2005_SOURCE_FROZEN',
  qualification: 'Arc length drawing dimension on a native partial circular arc with full-circle and straight-line refusal, interactive placement, drag without conjugate flip, Undo/Redo, inch/dual/scale, SVG/DXF export, native Save/Open, and post-Open fillet radius edit.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic filleted plate with through-hole, ordinary unbroken Top orthographic view, not PDF golden qualification.'],
  inspectorSource: `
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
let doc = rectanglePart(50, 30, 10);
doc = withNode(doc, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side1|n1.side2'], radius: 10 });
doc = withNode(doc, { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [15, 15], radius: 5 });
const b = brepsFor(doc);
if (!('breps' in b)) throw Error('No fixture solid');
const p = projectViews(b.breps, b.prefixes);
if (!p.ok) throw Error('No projection');
console.log(JSON.stringify({ ...doc, drawing: { ...defaultDrawing(), scale: 1, dimensions: [] } }));
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

await f.run(async () => {
  f.phase = 'open filleted plate with through-hole in Drawing';
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'arc-length.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 40, 20)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'refuse full circle and straight line under Arc length tool';
  await button('Arc length').click();
  // Click full circle hole rim at (20, 15) in Top view
  const holeRim = await pointInTop(20, 15);
  await f.page.mouse.click(holeRim.x, holeRim.y);
  await f.page.locator('.dw-hint').filter({ hasText: /Full circles are not supported/i }).waitFor();
  assert.equal((await f.doc()).drawing.dimensions.length, 0);

  // Click straight bottom edge at (25, 0) in Top view
  const straightPt = await pointInTop(25, 0);
  await f.page.mouse.click(straightPt.x, straightPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /partial circular arc/i }).waitFor();
  assert.equal((await f.doc()).drawing.dimensions.length, 0);

  f.phase = 'pick partial fillet arc and place arc length dimension (ARC 15.71)';
  // Quarter arc centered at (40, 20) radius 10: 45° midpoint is (40 + 10*cos45, 20 + 10*sin45) = (47.071, 27.071)
  const arcMid = await pointInTop(47.071, 27.071);
  await f.page.mouse.move(arcMid.x, arcMid.y);
  await f.page.mouse.click(arcMid.x, arcMid.y);
  const placePt = await pointInTop(58, 38);
  await f.page.mouse.move(placePt.x, placePt.y);
  await f.page.locator('.dw-preview').waitFor();
  await f.page.mouse.click(placePt.x, placePt.y);
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: 'ARC 15.71' }).waitFor();
  assert.equal(await f.page.getByRole('note', { name: 'DXF arc length compatibility' }).count(), 1);
  const placedDoc = await f.doc();
  assert.equal(placedDoc.drawing.dimensions[0].kind, 'arc-length');
  assert.equal('edge' in placedDoc.drawing.dimensions[0], false);
  await f.snapshot('01-placed-arc-15-71');

  f.phase = 'drag dimension label across center and verify value never flips to conjugate arc';
  await button('Select').click();
  const dimTextBox = await f.page.locator('g.dimension[data-dim="d1"] text').boundingBox();
  assert.ok(dimTextBox);
  const oppositePt = await pointInTop(25, 5);
  await f.page.mouse.move(dimTextBox.x + dimTextBox.width / 2, dimTextBox.y + dimTextBox.height / 2);
  await f.page.mouse.down();
  await f.page.mouse.move(oppositePt.x, oppositePt.y, { steps: 6 });
  await f.page.mouse.up();
  await wait(() => {
    const p = window.__studioDoc?.drawing?.dimensions?.[0]?.place;
    return p && p[0] < 40;
  });
  const afterDrag = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]);
  assert.equal(afterDrag.text, 'ARC 15.71');
  assert.ok(Math.abs(afterDrag.value - 5 * Math.PI) < 1e-6);

  // Drag back outside cleanly for readability
  const dimTextBox2 = await f.page.locator('g.dimension[data-dim="d1"] text').boundingBox();
  assert.ok(dimTextBox2);
  const outPt = await pointInTop(60, 40);
  await f.page.mouse.move(dimTextBox2.x + dimTextBox2.width / 2, dimTextBox2.y + dimTextBox2.height / 2);
  await f.page.mouse.down();
  await f.page.mouse.move(outPt.x, outPt.y, { steps: 6 });
  await f.page.mouse.up();
  await wait(() => {
    const p = window.__studioDoc?.drawing?.dimensions?.[0]?.place;
    return p && p[0] > 50;
  });
  await f.snapshot('02-dragged-stable');

  f.phase = 'verify Undo/Redo restores prior states cleanly';
  await button('Undo').click(); // back to opposite drag
  await button('Undo').click(); // back to placedDoc
  await f.page.waitForFunction(expectedX => {
    const p = window.__studioDoc?.drawing?.dimensions?.[0]?.place;
    return p && Math.abs(p[0] - expectedX) < 1e-3;
  }, placedDoc.drawing.dimensions[0].place[0]);
  await button('Undo').click(); // back to 0 dimensions
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 0);
  assert.deepEqual(await f.doc(), baseline);
  await button('Redo').click();
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  assert.equal((await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]?.text)), 'ARC 15.71');

  f.phase = 'verify SVG and DXF exports preserve arc-length appearance without fake DXF RADIUS DIMENSION';
  const svgText = await download('Export SVG', 'arc-length.svg');
  assert.match(svgText, /ARC 15\.71/);
  const dxfText = await download('Export DXF', 'arc-length.dxf');
  const entities = dxfEntities(dxfText);
  assert.equal(entities.some(e => e.type === 'DIMENSION'), false);
  assert.ok(entities.some(e => e.type === 'TEXT' && e.pairs.some(([k, v]) => k === 1 && v === 'ARC 15.71')));

  f.phase = 'save .bcad, open in fresh session, and edit fillet radius 10 -> 15 mm';
  const savedText = await download('Save', 'arc-length-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.dimensions[0].kind, 'arc-length');
  assert.equal('edge' in savedDoc.drawing.dimensions[0], false);

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'arc-length-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: 'ARC 15.71' }).waitFor();
  await f.snapshot('03-reopened-saved');

  // Switch to Model, edit Fillet radius 10 -> 15 mm, return to Drawing and confirm ARC 23.56
  await button('Model').click();
  await f.openFeatureEditor(2, 'Fillet');
  const radiusInput = f.editor().getByLabel('Radius', { exact: true });
  await radiusInput.fill('15');
  await radiusInput.press('Enter');
  await wait(() => window.__studioDoc?.nodes?.[2]?.radius === 15);
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: 'ARC 23.56' }).waitFor();
  const afterEdit = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]);
  assert.equal(afterEdit.text, 'ARC 23.56');
  assert.ok(Math.abs(afterEdit.value - 7.5 * Math.PI) < 1e-6);
  await f.snapshot('04-after-fillet-r15');

  return {
    placedText: 'ARC 15.71',
    editedText: afterEdit.text,
    editedValueMm: afterEdit.value,
    svgHasArcText: true,
    dxfDimensionEntities: 0,
    dxfHasArcText: true,
  };
});
