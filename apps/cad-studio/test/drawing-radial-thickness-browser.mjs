import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-radial-thickness-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['radialThickness', 'dimensions', 'sheet', 'types', 'issues', 'annotations3d', 'dimensionReferences'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/dxf.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'radial-thickness',
  output: process.argv[2],
  envFrozen: 'D2007_SOURCE_FROZEN',
  qualification: 'Concentric radial thickness drawing dimension (R=20, r=15 -> 5 mm) with same-circle refusal, Escape cancel, interactive placement, drag across angles, Undo/Redo, inch (.197), SVG/DXF export, native Save/Open, and post-Open inner radius edit 15 -> 16 mm (4 mm).',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic concentric ring (R=20, r=15, H=10 mm) in ordinary unbroken Top view, not PDF golden qualification.'],
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
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 20 },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
doc = withNode(doc, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [0, 0], radius: 15 });
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
  f.phase = 'open concentric R=20 / r=15 mm ring in Drawing';
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'radial-thickness.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 20, 0)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'refuse same circle picked twice, cancel cleanly with Escape';
  await button('Wall thickness').click();
  const outerRim = await pointInTop(20, 0);
  const outerRim2 = await pointInTop(0, 20);
  await f.page.mouse.click(outerRim.x, outerRim.y);
  await f.page.mouse.click(outerRim2.x, outerRim2.y);
  await f.page.locator('.dw-hint').filter({ hasText: /different radii/i }).waitFor();
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'pick outer R=20 and inner r=15 circles and place wall thickness (5 mm)';
  await button('Wall thickness').click();
  const innerRim = await pointInTop(15, 0);
  const placePt = await pointInTop(28, 12);
  await f.page.mouse.click(outerRim.x, outerRim.y);
  await f.page.mouse.click(innerRim.x, innerRim.y);
  await f.page.mouse.move(placePt.x, placePt.y);
  await f.page.locator('.dw-preview').waitFor();
  await f.page.mouse.click(placePt.x, placePt.y);
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^5$/ }).waitFor();
  assert.equal(await f.page.getByRole('note', { name: 'DXF radial thickness compatibility' }).count(), 1);
  const placedDoc = await f.doc();
  assert.equal(placedDoc.drawing.dimensions[0].kind, 'radial-thickness');
  assert.equal('edge' in placedDoc.drawing.dimensions[0], false);
  await f.snapshot('01-placed-5mm');

  f.phase = 'verify inch display (.197) and drag to another radial angle';
  await field('Drawing units').selectOption('inch');
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: '.197' }).waitFor();
  await f.snapshot('02-inch-197');
  await field('Drawing units').selectOption('mm');
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^5$/ }).waitFor();

  await button('Select').click();
  const textBox = await f.page.locator('g.dimension[data-dim="d1"] text').boundingBox();
  assert.ok(textBox);
  const rotatedPt = await pointInTop(-26, 16);
  await f.page.mouse.move(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
  await f.page.mouse.down();
  await f.page.mouse.move(rotatedPt.x, rotatedPt.y, { steps: 6 });
  await f.page.mouse.up();
  await wait(() => {
    const p = window.__studioDoc?.drawing?.dimensions?.[0]?.place;
    return p && p[0] < 0;
  });
  const afterDrag = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]);
  assert.equal(afterDrag.text, '5');
  assert.ok(Math.abs(afterDrag.value - 5) < 1e-6);

  f.phase = 'verify FIRST Undo/Redo restores prior states cleanly';
  await button('Undo').click(); // undo drag
  await button('Undo').click(); // undo units mm
  await button('Undo').click(); // undo units inch
  await button('Undo').click(); // undo creation
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 0);
  assert.deepEqual(await f.doc(), baseline);
  await button('Redo').click(); // restore creation
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^5$/ }).waitFor();

  f.phase = 'verify SVG and DXF exports preserve wall thickness without fake DXF DIMENSION';
  const svgText = await download('Export SVG', 'radial-thickness.svg');
  assert.match(svgText, />5<\/text>/);
  const dxfText = await download('Export DXF', 'radial-thickness.dxf', 'latin1');
  const entities = dxfEntities(dxfText);
  assert.equal(entities.some(e => e.type === 'DIMENSION'), false);
  assert.ok(entities.some(e => e.type === 'TEXT' && e.pairs.some(([k, v]) => k === 1 && v === '5')));

  f.phase = 'save .bcad, reopen in fresh session, and edit Hole radius 15 -> 16 mm (4 mm wall)';
  const savedText = await download('Save', 'radial-thickness-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.dimensions[0].kind, 'radial-thickness');

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'radial-thickness-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^5$/ }).waitFor();
  await f.snapshot('03-reopened-saved');

  await button('Model').click();
  await f.openFeatureEditor(2, 'Hole');
  const diameterInput = f.editor().getByLabel('Diameter', { exact: true });
  await diameterInput.fill('32');
  await diameterInput.press('Enter');
  await wait(() => window.__studioDoc?.nodes?.[2]?.radius === 16);
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^4$/ }).waitFor();
  const afterEdit = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]);
  assert.equal(afterEdit.text, '4');
  assert.ok(Math.abs(afterEdit.value - 4) < 1e-6);
  await f.snapshot('04-after-hole-r16');

  return {
    placedText: '5',
    inchText: '.197',
    editedText: afterEdit.text,
    editedValueMm: afterEdit.value,
    svgHasText: true,
    dxfDimensionEntities: 0,
  };
});
