import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-circle-separation-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['circleSeparation', 'dimensions', 'sheet', 'types', 'issues', 'annotations3d', 'dimensionReferences', 'savedReflexAngle'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/dxf.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'circle-separation',
  output: process.argv[2],
  envFrozen: 'D2009_SOURCE_FROZEN',
  qualification: 'Disjoint circle separation min/max drawing dimension (C_A=(0,0) r=4, C_B=(30,0) r=6 -> min 20, max 40) with same-circle refusal, Escape cancel, interactive Min and Max placement, drag without mode flip, mode toggle in list, Undo/Redo, inch (.787), SVG/DXF export, native Save/Open, and post-Open Hole r=6 -> 8 edit (18 / 42).',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic two-hole plate (90x60x10 mm, C_A=(0,0) r=4, C_B=(30,0) r=6) in ordinary unbroken Top view, not PDF golden qualification.'],
  inspectorSource: `
import { withNode } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
let doc = {
  format: 'barocss-cad-model',
  schema: 3,
  units: 'mm',
  parameters: {},
  nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [60, 40] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
doc = withNode(doc, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [0, 0], radius: 4 });
doc = withNode(doc, { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [30, 0], radius: 6 });
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

await f.run(async () => {
  f.phase = 'open two-hole plate in Drawing';
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'circle-separation.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 30, 6)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'refuse same circle picked twice, cancel cleanly with Escape';
  await button('Circle gap').click();
  const rimA = await pointInTop(4, 0);
  const rimA2 = await pointInTop(0, 4);
  await f.page.mouse.click(rimA.x, rimA.y);
  await f.page.mouse.click(rimA2.x, rimA2.y);
  await f.page.locator('.dw-hint').filter({ hasText: /concentric or identical/i }).waitFor();
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'place Min circle gap (20 mm) and Max circle gap (40 mm)';
  await button('Circle gap').click();
  await button('Circle gap Min').click();
  const rimB = await pointInTop(36, 0);
  const placeMin = await pointInTop(15, 18);
  await f.page.mouse.click(rimA.x, rimA.y);
  await f.page.mouse.click(rimB.x, rimB.y);
  await f.page.mouse.move(placeMin.x, placeMin.y);
  await f.page.locator('.dw-preview').waitFor();
  await f.page.mouse.click(placeMin.x, placeMin.y);
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^20$/ }).waitFor();

  await button('Circle gap Max').click();
  const placeMax = await pointInTop(15, -20);
  await f.page.mouse.click(rimA.x, rimA.y);
  await f.page.mouse.click(rimB.x, rimB.y);
  await f.page.mouse.move(placeMax.x, placeMax.y);
  await f.page.locator('.dw-preview').waitFor();
  await f.page.mouse.click(placeMax.x, placeMax.y);
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 2);
  await f.page.locator('g.dimension[data-dim="d2"] text').filter({ hasText: /^40$/ }).waitFor();
  assert.equal(await f.page.getByRole('note', { name: 'DXF circle separation compatibility' }).count(), 1);
  const placedDoc = await f.doc();
  assert.equal(placedDoc.drawing.dimensions[0].kind, 'circle-separation');
  assert.equal(placedDoc.drawing.dimensions[0].mode, 'min');
  assert.equal(placedDoc.drawing.dimensions[1].mode, 'max');
  assert.equal('edge' in placedDoc.drawing.dimensions[0], false);
  await f.snapshot('01-placed-min20-max40');

  f.phase = 'verify inch display (.787 / 1.575) and drag without mode flip';
  await field('Drawing units').selectOption('inch');
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /0?\.787/ }).waitFor();
  await f.page.locator('g.dimension[data-dim="d2"] text').filter({ hasText: '1.575' }).waitFor();
  await f.snapshot('02-inch-units');
  await field('Drawing units').selectOption('mm');
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^20$/ }).waitFor();

  await button('Select').click();
  const box1 = await f.page.locator('g.dimension[data-dim="d1"] text').boundingBox();
  assert.ok(box1);
  const draggedPt = await pointInTop(15, 26);
  await f.page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await f.page.mouse.down();
  await f.page.mouse.move(draggedPt.x, draggedPt.y, { steps: 6 });
  await f.page.mouse.up();
  await wait(() => {
    const p = window.__studioDoc?.drawing?.dimensions?.[0]?.place;
    return p && p[1] > 21;
  });
  const afterDrag = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]);
  assert.equal(afterDrag.text, '20');
  assert.equal((await f.doc()).drawing.dimensions[0].mode, 'min');

  f.phase = 'verify Undo/Redo restores cleanly';
  await button('Undo').click(); // undo drag
  await button('Undo').click(); // undo units mm
  await button('Undo').click(); // undo units inch
  await button('Undo').click(); // undo d2 (max)
  await button('Undo').click(); // undo d1 (min)
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 0);
  assert.deepEqual(await f.doc(), baseline);
  await button('Redo').click(); // restore d1
  await button('Redo').click(); // restore d2
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 2);
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^20$/ }).waitFor();
  await f.page.locator('g.dimension[data-dim="d2"] text').filter({ hasText: /^40$/ }).waitFor();

  f.phase = 'verify SVG and DXF exports preserve 20 and 40 without fake DXF DIMENSION';
  const svgText = await download('Export SVG', 'circle-separation.svg');
  assert.match(svgText, />20<\/text>/);
  assert.match(svgText, />40<\/text>/);
  const dxfText = await download('Export DXF', 'circle-separation.dxf', 'latin1');
  const entities = dxfEntities(dxfText);
  assert.equal(entities.some(e => e.type === 'DIMENSION'), false);
  assert.ok(entities.some(e => e.type === 'TEXT' && e.pairs.some(([k, v]) => k === 1 && v === '20')));
  assert.ok(entities.some(e => e.type === 'TEXT' && e.pairs.some(([k, v]) => k === 1 && v === '40')));

  f.phase = 'save .bcad, reopen in fresh session, and edit Hole 2 diameter 12 -> 16 mm (18 / 42)';
  const savedText = await download('Save', 'circle-separation-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.dimensions.length, 2);
  assert.equal(savedDoc.drawing.dimensions[0].mode, 'min');
  assert.equal(savedDoc.drawing.dimensions[1].mode, 'max');

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'circle-separation-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^20$/ }).waitFor();
  await f.page.locator('g.dimension[data-dim="d2"] text').filter({ hasText: /^40$/ }).waitFor();
  await f.snapshot('03-reopened-saved');

  await button('Model').click();
  await f.openFeatureEditor(3, 'Hole');
  const diameterInput = f.editor().getByLabel('Diameter', { exact: true });
  await diameterInput.fill('16');
  await diameterInput.press('Enter');
  await wait(() => window.__studioDoc?.nodes?.[3]?.radius === 8);
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^18$/ }).waitFor();
  await f.page.locator('g.dimension[data-dim="d2"] text').filter({ hasText: /^42$/ }).waitFor();
  const afterEdit = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.map(d => ({ text: d.text, value: d.value })));
  assert.equal(afterEdit[0].text, '18');
  assert.equal(afterEdit[1].text, '42');
  await f.snapshot('04-after-hole-r8');

  return {
    placedMin: '20',
    placedMax: '40',
    editedMin: afterEdit[0].text,
    editedMax: afterEdit[1].text,
    dxfDimensionEntities: 0,
  };
});
