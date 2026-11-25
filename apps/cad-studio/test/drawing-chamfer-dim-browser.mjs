import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-chamfer-dim-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'apps/cad-studio/src/ui/drawing/ToleranceEditor.tsx',
  'apps/cad-studio/src/ui/uiIcons.ts',
  ...['chamferDim', 'dimensions', 'sheet', 'types', 'issues', 'annotations3d', 'dimensionReferences'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/dxf.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'chamfer-dim',
  output: process.argv[2],
  envFrozen: 'D2006_SOURCE_FROZEN',
  qualification: '45° chamfer drawing dimension (2 × 45°) with non-touching/fillet refusal, Escape cancel, interactive placement, drag, Undo/Redo, inch unit length-only conversion, SVG/DXF export, native Save/Open, and post-Open Chamfer distance edit 2 -> 3 mm.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic 20 × 10 × 6 mm rectangular plate with 2 mm 45° chamfer and 2 mm fillet negative control in ordinary unbroken Top view, not PDF golden qualification.'],
  inspectorSource: `
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
let doc = rectanglePart(20, 10, 6);
doc = withNode(doc, { kind: 'chamfer', parent: { node: 1, side: 'solid' }, edges: ['n1.side1|n1.side2'], distance: 2 });
doc = withNode(doc, { kind: 'fillet', parent: { node: 2, side: 'solid' }, edges: ['n1.side0|n1.side3'], radius: 2 });
const b = brepsFor(doc);
if (!('breps' in b)) throw Error('No fixture solid');
const p = projectViews(b.breps, b.prefixes);
if (!p.ok) throw Error('No projection');
console.log(JSON.stringify({ ...doc, drawing: { ...defaultDrawing(), scale: 2, dimensions: [] } }));
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
  f.phase = 'open 20 × 10 × 6 mm chamfered plate in Drawing';
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'chamfer-dim.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 19, 9)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'refuse fillet curve and non-touching second edge, then cancel with Escape';
  await button('45° Chamfer').click();
  // Click bottom-left R2 fillet arc at (2 - sqrt(2), 2 - sqrt(2)) = (0.586, 0.586)
  const filletPt = await pointInTop(0.586, 0.586);
  await f.page.mouse.click(filletPt.x, filletPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /straight edge/i }).waitFor();
  assert.equal((await f.doc()).drawing.dimensions.length, 0);

  // Pick chamfer bevel at (19, 9), then click non-touching bottom edge at (11, 0)
  const bevelPt = await pointInTop(19, 9);
  const bottomPt = await pointInTop(11, 0);
  await f.page.mouse.click(bevelPt.x, bevelPt.y);
  await f.page.mouse.click(bottomPt.x, bottomPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /3D corner vertex/i }).waitFor();
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'pick chamfer bevel and adjacent top wall, then place 2 × 45° callout';
  await button('45° Chamfer').click();
  const topWallPt = await pointInTop(9, 10);
  const placePt = await pointInTop(26, 15);
  await f.page.mouse.click(bevelPt.x, bevelPt.y);
  await f.page.mouse.click(topWallPt.x, topWallPt.y);
  await f.page.mouse.move(placePt.x, placePt.y);
  await f.page.locator('.dw-preview').waitFor();
  await f.page.mouse.click(placePt.x, placePt.y);
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: '2 × 45°' }).waitFor();
  assert.equal(await f.page.getByRole('note', { name: 'DXF chamfer compatibility' }).count(), 1);
  const placedDoc = await f.doc();
  assert.equal(placedDoc.drawing.dimensions[0].kind, 'chamfer');
  assert.equal('edge' in placedDoc.drawing.dimensions[0], false);
  await f.snapshot('01-placed-2x45');

  f.phase = 'verify inch display converts length only (.079 × 45°) and return to mm';
  await field('Drawing units').selectOption('inch');
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: '.079 × 45°' }).waitFor();
  await f.snapshot('02-inch-079x45');
  await field('Drawing units').selectOption('mm');
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: '2 × 45°' }).waitFor();

  f.phase = 'drag callout and verify FIRST Undo/Redo';
  await button('Select').click();
  const textBox = await f.page.locator('g.dimension[data-dim="d1"] text').boundingBox();
  assert.ok(textBox);
  const movedPt = await pointInTop(28, 12);
  await f.page.mouse.move(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
  await f.page.mouse.down();
  await f.page.mouse.move(movedPt.x, movedPt.y, { steps: 5 });
  await f.page.mouse.up();
  await wait(() => {
    const p = window.__studioDoc?.drawing?.dimensions?.[0]?.place;
    return p && Math.abs(p[1] - 15) > 1;
  });
  const afterDrag = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]);
  assert.equal(afterDrag.text, '2 × 45°');
  assert.ok(Math.abs(afterDrag.value - 2) < 1e-6);

  await button('Undo').click(); // undo drag
  await button('Undo').click(); // undo units mm
  await button('Undo').click(); // undo units inch
  await button('Undo').click(); // undo chamfer creation
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 0);
  assert.deepEqual(await f.doc(), baseline);
  await button('Redo').click(); // restore chamfer creation
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: '2 × 45°' }).waitFor();

  f.phase = 'verify SVG and DXF exports preserve 2 × 45° without fake DXF DIMENSION';
  const svgText = await download('Export SVG', 'chamfer-dim.svg');
  assert.match(svgText, /2 × 45°/);
  const dxfText = await download('Export DXF', 'chamfer-dim.dxf', 'latin1');
  const entities = dxfEntities(dxfText);
  assert.equal(entities.some(e => e.type === 'DIMENSION'), false);
  assert.ok(entities.some(e => e.type === 'TEXT' && e.pairs.some(([k, v]) => k === 1 && v === '2 × 45%%d')));

  f.phase = 'save .bcad, reopen in fresh session, and edit Chamfer distance 2 -> 3 mm';
  const savedText = await download('Save', 'chamfer-dim-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.dimensions[0].kind, 'chamfer');

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'chamfer-dim-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: '2 × 45°' }).waitFor();
  await f.snapshot('03-reopened-saved');

  await button('Model').click();
  await f.openFeatureEditor(2, 'Chamfer');
  const distInput = f.editor().getByLabel('Distance', { exact: true });
  await distInput.fill('3');
  await distInput.press('Enter');
  await wait(() => window.__studioDoc?.nodes?.[2]?.distance === 3);
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: '3 × 45°' }).waitFor();
  const afterEdit = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]);
  assert.equal(afterEdit.text, '3 × 45°');
  assert.ok(Math.abs(afterEdit.value - 3) < 1e-6);
  await f.snapshot('04-after-chamfer-3mm');

  return {
    placedText: '2 × 45°',
    inchText: '.079 × 45°',
    editedText: afterEdit.text,
    editedValueMm: afterEdit.value,
    svgHasChamferText: true,
    dxfDimensionEntities: 0,
  };
});
