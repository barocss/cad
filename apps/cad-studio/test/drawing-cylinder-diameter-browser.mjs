import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-cylinder-diameter-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'packages/barocss-cad/src/brep/brep-hidden-line.ts',
  'packages/barocss-cad/src/index.ts',
  ...['cylinderDiameter', 'dimensions', 'sheet', 'types', 'issues', 'annotations3d', 'dimensionReferences'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/dxf.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'cylinder-diameter',
  output: process.argv[2],
  envFrozen: 'D2008_SOURCE_FROZEN',
  qualification: 'Cylinder side silhouette diameter drawing dimension (r=6, L=30 -> Ø12) with non-silhouette refusal in top view, Escape cancel, interactive placement in front view, drag without changing Ø12, Undo/Redo, inch (Ø.472), SVG/DXF export, native Save/Open, and post-Open cylinder radius edit 6 -> 7 mm (Ø14).',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic cylinder (r=6, L=30 mm) in ordinary unbroken Front view, not PDF golden qualification.'],
  inspectorSource: `
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
const doc = {
  format: 'barocss-cad-model',
  schema: 3,
  units: 'mm',
  parameters: {},
  nextId: 2,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 6 },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 30 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
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
  f.phase = 'open r=6, L=30 mm cylinder in Drawing';
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'cylinder-diameter.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('front', 6, 15)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'refuse non-silhouette circle edge in top view, cancel cleanly with Escape';
  await button('Side diameter').click();
  const topCircle = await pointInView('top', 6, 0);
  await f.page.mouse.click(topCircle.x, topCircle.y);
  await f.page.locator('.dw-hint').filter({ hasText: /straight silhouette/i }).waitFor();
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'pick visible cylinder side silhouette in front view and place Ø12';
  await button('Side diameter').click();
  const frontSil = await pointInView('front', 6, 15);
  const placePt = await pointInView('front', 14, 15);
  await f.page.mouse.click(frontSil.x, frontSil.y);
  await f.page.mouse.move(placePt.x, placePt.y);
  await f.page.locator('.dw-preview').waitFor();
  await f.page.mouse.click(placePt.x, placePt.y);
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^Ø12$/ }).waitFor();
  assert.equal(await f.page.getByRole('note', { name: 'DXF cylinder diameter compatibility' }).count(), 1);
  const placedDoc = await f.doc();
  assert.equal(placedDoc.drawing.dimensions[0].kind, 'cylinder-diameter');
  assert.equal('edge' in placedDoc.drawing.dimensions[0], false);
  await f.snapshot('01-placed-d12');

  f.phase = 'verify inch display (Ø.472) and drag to opposite side without changing Ø12';
  await field('Drawing units').selectOption('inch');
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /Ø0?\.472/ }).waitFor();
  await f.snapshot('02-inch-472');
  await field('Drawing units').selectOption('mm');
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^Ø12$/ }).waitFor();

  await button('Select').click();
  const textBox = await f.page.locator('g.dimension[data-dim="d1"] text').boundingBox();
  assert.ok(textBox);
  const draggedPt = await pointInView('front', -16, 20);
  await f.page.mouse.move(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
  await f.page.mouse.down();
  await f.page.mouse.move(draggedPt.x, draggedPt.y, { steps: 6 });
  await f.page.mouse.up();
  await wait(() => {
    const p = window.__studioDoc?.drawing?.dimensions?.[0]?.place;
    return p && p[0] < 0;
  });
  const afterDrag = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]);
  assert.equal(afterDrag.text, 'Ø12');
  assert.ok(Math.abs(afterDrag.value - 12) < 1e-6);

  f.phase = 'verify Undo/Redo restores prior states cleanly';
  await button('Undo').click(); // undo drag
  await button('Undo').click(); // undo units mm
  await button('Undo').click(); // undo units inch
  await button('Undo').click(); // undo creation
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 0);
  assert.deepEqual(await f.doc(), baseline);
  await button('Redo').click(); // restore creation
  await wait(() => window.__studioDoc?.drawing?.dimensions?.length === 1);
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^Ø12$/ }).waitFor();

  f.phase = 'verify SVG and DXF exports preserve Ø12 without fake DXF DIMENSION';
  const svgText = await download('Export SVG', 'cylinder-diameter.svg');
  assert.match(svgText, />Ø12<\/text>/);
  const dxfText = await download('Export DXF', 'cylinder-diameter.dxf', 'latin1');
  const entities = dxfEntities(dxfText);
  assert.equal(entities.some(e => e.type === 'DIMENSION'), false);
  assert.ok(entities.some(e => e.type === 'TEXT' && e.pairs.some(([k, v]) => k === 1 && (v === '\xd812' || v === '%%c12' || v === 'Ø12'))));

  f.phase = 'save .bcad, reopen in fresh session, and edit cylinder radius 6 -> 7 mm (Ø14)';
  const savedText = await download('Save', 'cylinder-diameter-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.dimensions[0].kind, 'cylinder-diameter');

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'cylinder-diameter-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^Ø12$/ }).waitFor();
  await f.snapshot('03-reopened-saved');

  await button('Model').click();
  await f.openFeatureEditor(1, 'Cylinder');
  const diameterInput = f.editor().getByLabel('Diameter', { exact: true });
  await diameterInput.fill('14');
  await diameterInput.press('Enter');
  await wait(() => window.__studioDoc?.nodes?.[0]?.radius === 7);
  await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"] text').filter({ hasText: /^Ø14$/ }).waitFor();
  const afterEdit = await f.page.evaluate(() => window.__studioDrawing?.()?.dimensions?.[0]);
  assert.equal(afterEdit.text, 'Ø14');
  assert.ok(Math.abs(afterEdit.value - 14) < 1e-6);
  await f.snapshot('04-after-radius-7');

  return {
    placedText: 'Ø12',
    inchText: 'Ø.472',
    editedText: afterEdit.text,
    editedValueMm: afterEdit.value,
    svgHasText: true,
    dxfDimensionEntities: 0,
  };
});
