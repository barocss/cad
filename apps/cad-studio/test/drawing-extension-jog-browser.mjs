import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-extension-jog-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['extensionJog', 'sheet', 'types', 'issues'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
];

const f = await createFlow({
  name: 'extension-jog',
  output: process.argv[2],
  envFrozen: 'D2004_SOURCE_FROZEN',
  qualification: 'Jogged linear extension line on side A/B with interactive grip drag, Escape cancel, Undo/Redo, SVG/DXF verification, native Save/Open, and post-Open source edit.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic rectangular part, manual orthographic linear dimensions, not PDF golden qualification.'],
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
const d1 = { id: 'd1', kind: 'linear', view: 'front', orient: 'horizontal', a: at(0, 0), b: at(40, 0), place: [20, -18] };
const d2 = { id: 'd2', kind: 'linear', view: 'front', orient: 'vertical', a: at(40, 0), b: at(40, 24), place: [56, 12] };
console.log(JSON.stringify({ ...doc, drawing: { ...defaultDrawing(), scale: 1, dimensions: [d1, d2] } }));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const wait = predicate => f.page.waitForFunction(predicate);

async function selectD1() {
  if (!(await f.page.locator('.dw[aria-label="Drawing"]').count())) await button('Drawing').click();
  await f.page.locator('g.dimension[data-dim="d1"]').waitFor();
  await f.page.locator('.dw-annotation-select').filter({ hasText: /horizontal · front/ }).click();
  await field('Extension jog side').waitFor();
}

async function dimLineCount(dimId) {
  return f.page.locator(`g.dimension[data-dim="${dimId}"] > line`).count();
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
  f.phase = 'open fixture and capture straight baseline';
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'extension-jog.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
  await f.ready();
  await selectD1();
  const before = await f.doc();
  // 1 horizontal dim line + 2 straight extension lines = 3 lines
  assert.equal(await dimLineCount('d1'), 3);
  assert.equal(await dimLineCount('d2'), 3);
  await f.snapshot('00-straight');

  f.phase = 'add extension jog on side A (-4 mm)';
  await field('Extension jog side').selectOption('a');
  await wait(() => window.__studioDoc?.drawing?.dimensions?.[0]?.extensionJog?.side === 'a');
  const jog4 = await f.doc();
  assert.equal(jog4.drawing.dimensions[0].extensionJog.offset, -4);
  // 1 dim line + 5 bent ext lines on A + 1 straight ext line on B = 7 lines
  assert.equal(await dimLineCount('d1'), 7);
  assert.equal(await dimLineCount('d2'), 3);
  assert.equal(await f.page.getByRole('note', { name: 'DXF extension jog compatibility' }).count(), 1);
  await f.page.locator('[data-jog-handle="d1"]').waitFor();
  await f.snapshot('01-jog-a-4mm');

  f.phase = 'drag jog handle then cancel with Escape (doc and history untouched)';
  const handleBox1 = await f.page.locator('[data-jog-handle="d1"]').boundingBox();
  assert.ok(handleBox1);
  const cx1 = handleBox1.x + handleBox1.width / 2, cy1 = handleBox1.y + handleBox1.height / 2;
  await f.page.mouse.move(cx1, cy1);
  await f.page.mouse.down();
  await f.page.mouse.move(cx1 - 24, cy1 + 8, { steps: 5 });
  await f.page.locator('[aria-label="Extension jog preview"]').waitFor();
  await f.page.keyboard.press('Escape');
  await f.page.mouse.up();
  await f.page.waitForTimeout(200);
  assert.deepEqual(await f.doc(), jog4);

  f.phase = 'drag jog handle and commit new offset (place and orient unchanged)';
  await f.page.mouse.move(cx1, cy1);
  await f.page.mouse.down();
  await f.page.mouse.move(cx1 - 22, cy1 + 4, { steps: 6 });
  await f.page.mouse.up();
  await wait(() => {
    const j = window.__studioDoc?.drawing?.dimensions?.[0]?.extensionJog;
    return !!j && j.offset !== -4;
  });
  const dragged = await f.doc();
  assert.ok(dragged.drawing.dimensions[0].extensionJog.offset < -4, 'dragged left should deepen negative offset');
  assert.deepEqual(dragged.drawing.dimensions[0].place, jog4.drawing.dimensions[0].place);
  assert.equal(dragged.drawing.dimensions[0].orient, 'horizontal');
  assert.equal(await dimLineCount('d1'), 7);
  await f.snapshot('02-jog-dragged');

  f.phase = 'verify FIRST Undo/Redo and Clear + Undo';
  await f.undo();
  await f.same(jog4);
  await f.redo();
  await f.same(dragged);
  await selectD1();
  await button('Remove extension jog d1').click();
  await wait(() => !window.__studioDoc?.drawing?.dimensions?.[0]?.extensionJog);
  assert.equal(await dimLineCount('d1'), 3);
  await f.undo();
  await f.same(dragged);
  await selectD1();
  assert.equal(await dimLineCount('d1'), 7);

  f.phase = 'verify independent exported SVG and DXF bytes';
  const svg = await download('Export SVG', 'extension-jog.svg');
  const d1Chunk = svg.match(/<g class="dimension"[^>]+data-dim="d1">([^\n]+)<\/g>/)?.[1];
  assert.ok(d1Chunk);
  assert.equal([...d1Chunk.matchAll(/<line /g)].length, 7);
  assert.ok(d1Chunk.includes('>40<'));

  const dxf = dxfEntities(await download('Export DXF', 'extension-jog.dxf'));
  const dxfD1 = dxf.find(e => e.type === 'DIMENSION' && Math.abs(Number(pair(e, 42)) - 40) < 1e-6);
  assert.ok(dxfD1);
  const blockIdx = dxf.findIndex(e => e.type === 'BLOCK' && pair(e, 2) === pair(dxfD1, 2));
  const endIdx = dxf.findIndex((e, i) => i > blockIdx && e.type === 'ENDBLK');
  assert.equal(dxf.slice(blockIdx + 1, endIdx).filter(e => e.type === 'LINE').length, 7);

  f.phase = 'save native .bcad, fresh open, and edit source width 40 -> 50 mm';
  const saved = await f.save('extension-jog-reopen');
  await f.newPage();
  await field('Model file').setInputFiles(saved.file);
  await f.ready();
  assert.deepEqual(await f.doc(), saved.doc);
  await selectD1();
  assert.equal(await dimLineCount('d1'), 7);
  assert.equal(await field('Extension jog side').inputValue(), 'a');
  await f.snapshot('03-fresh-open');

  // Post-Open source edit: change rectangle width 40 -> 50 mm and confirm jogged dimension updates to 50
  await button('Model').click();
  await f.openFeatureEditor(1, 'Extrude');
  await f.editor().getByLabel('Width', { exact: true }).fill('50');
  await f.editor().getByRole('button', { name: 'Apply', exact: true }).click();
  await f.ready();
  await selectD1();
  await wait(() => document.querySelector('g.dimension[data-dim="d1"] text')?.textContent?.trim() === '50');
  assert.equal(await dimLineCount('d1'), 7);
  assert.equal((await f.doc()).drawing.dimensions[0].extensionJog.side, 'a');
  await f.snapshot('04-post-open-source-edit-50');
});
