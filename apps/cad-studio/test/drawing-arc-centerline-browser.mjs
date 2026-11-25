import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-arc-centerline-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'apps/cad-studio/src/drawing/drawing.css',
  ...['arcCenterline', 'sheet', 'types', 'sheets', 'issues', 'reorient'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/svg.ts',
  'packages/barocss-cad-model/src/io/dxf.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'arc-centerline',
  output: process.argv[2],
  envFrozen: 'D2010_SOURCE_FROZEN',
  qualification: 'Source-bound curved centerline between concentric partial arcs (shelled filleted box R=14 / r=10 -> midRadius 12) with straight-edge refusal, Escape cancel, creation, Centre lines hide/show preserving record, Delete + Undo/Redo, SVG/DXF CENTER ARC export, native Save/Open, and post-Open Shell thickness edit 4 -> 2 mm updating centerline radius 12 -> 13 mm.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic filleted shelled box (50x50x15 mm, R=14, shell t=4 -> r=10) in ordinary unbroken Top view, not PDF golden qualification.'],
  inspectorSource: `
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
let doc = rectanglePart(50, 50, 15);
const b0 = brepsFor(doc);
if (!('breps' in b0)) throw Error('No box');
const corner = b0.breps[0].edges.find(e => e.name === 'n1.side1|n1.side2')?.name
  ?? b0.breps[0].edges.find(e => e.name?.includes('side1') && e.name?.includes('side2'))?.name
  ?? 'n1.side1|n1.side2';
doc = withNode(doc, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [corner], radius: 14 });
doc = withNode(doc, { kind: 'shell', parent: { node: 2, side: 'solid' }, open: ['n1.top'], thickness: 4 });
const b = brepsFor(doc);
if (!('breps' in b)) throw Error('No shelled solid: ' + JSON.stringify(b));
const p = projectViews(b.breps, b.prefixes);
if (!p.ok) throw Error('No projection');
const findArc = r => p.views.top.edges.find(e => e.kind === 'circle' && e.circle && !e.circle.full && Math.abs(e.circle.radius - r) < 1e-2 && e.pieces.some(pc => pc.visible));
const outerArc = findArc(14);
const innerArc = findArc(10);
if (!outerArc || !innerArc) throw Error('Missing concentric arcs');
const c = outerArc.circle.center;
const pickOn = (e, r) => {
  const m = [
    (e.ends[0][0] + e.ends[1][0]) / 2 - c[0],
    (e.ends[0][1] + e.ends[1][1]) / 2 - c[1],
  ];
  const l = Math.hypot(m[0], m[1]) || 1;
  return [c[0] + r * m[0] / l, c[1] + r * m[1] / l];
};
console.log(JSON.stringify({
  doc: { ...doc, drawing: { ...defaultDrawing(), scale: 1, dimensions: [] } },
  outerPt: pickOn(outerArc, 14),
  innerPt: pickOn(innerArc, 10),
  straightPt: [25, 0],
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

await f.run(async () => {
  f.phase = 'open filleted shelled corner (R=14, r=10) in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'arc-centerline.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 25, 0)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'refuse straight edge and same arc, cancel cleanly with Escape';
  await button('Curved centerline').click();
  const straightPt = await pointInTop(info.straightPt[0], info.straightPt[1]);
  await f.page.mouse.click(straightPt.x, straightPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /partial circular arc/i }).waitFor();
  const outerPt = await pointInTop(info.outerPt[0], info.outerPt[1]);
  await f.page.mouse.click(outerPt.x, outerPt.y);
  await f.page.mouse.click(outerPt.x, outerPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /different radii/i }).waitFor();
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'create source-bound curved centerline R=12 between R=14 and r=10 arcs';
  await button('Curved centerline').click();
  const innerPt = await pointInTop(info.innerPt[0], info.innerPt[1]);
  await f.page.mouse.click(outerPt.x, outerPt.y);
  await f.page.locator('[data-arc-centerline-source] path').waitFor();
  await f.page.mouse.move(innerPt.x, innerPt.y);
  await f.page.locator('.dw-hover:not([data-arc-centerline-source]) path').first().waitFor();
  assert.deepEqual(await f.doc(), baseline);
  await f.page.mouse.click(innerPt.x, innerPt.y);
  await wait(() => window.__studioDoc?.drawing?.arcCenterlines?.length === 1);
  await f.page.locator('g.arc-centerline[data-arc-centerline="ac1"] path').waitFor();
  await f.page.locator('[aria-label="Curved centerlines"]').filter({ hasText: 'R12' }).waitFor();
  await wait(() => document.querySelectorAll('[data-arc-centerline-source] path').length === 2);
  assert.equal(await f.page.getByRole('note', { name: 'DXF curved centerline compatibility' }).count(), 1);
  await f.snapshot('01-placed-r12');

  f.phase = 'toggle Centre lines off and on without deleting curved centerline record';
  const centersToggle = f.page.getByLabel('Centre lines', { exact: true });
  await centersToggle.uncheck();
  await wait(() => document.querySelectorAll('g.arc-centerline[data-arc-centerline="ac1"]').length === 0);
  assert.equal((await f.doc()).drawing.arcCenterlines.length, 1);
  await f.snapshot('02-centers-hidden');
  await centersToggle.check();
  await f.page.locator('g.arc-centerline[data-arc-centerline="ac1"] path').waitFor();

  f.phase = 'verify Delete + Undo/Redo restore cleanly';
  await button('Select').click();
  await button('Remove curved centerline ac1').click();
  await wait(() => !window.__studioDoc?.drawing?.arcCenterlines?.length);
  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.arcCenterlines?.length === 1);
  await button('Redo').click();
  await wait(() => !window.__studioDoc?.drawing?.arcCenterlines?.length);
  await button('Undo').click();
  await f.page.locator('g.arc-centerline[data-arc-centerline="ac1"] path').waitFor();

  f.phase = 'verify SVG and DXF exports include curved centerline ARC on CENTER layer';
  const svgText = await download('Export SVG', 'arc-centerline.svg');
  assert.match(svgText, /data-arc-centerline="ac1"/);
  const dxfText = await download('Export DXF', 'arc-centerline.dxf', 'latin1');
  const entities = dxfEntities(dxfText);
  const curved = entities.filter(e => e.type === 'ARC' && e.pairs.some(([k, v]) => k === 8 && v === 'CENTER'));
  assert.equal(curved.length, 1);
  assert.ok(Math.abs(Number(curved[0].pairs.find(([k]) => k === 40)?.[1]) - 12) < 1e-7);
  const angles = [50, 51].map(code => Number(curved[0].pairs.find(([k]) => k === code)?.[1]));
  assert.ok(Math.abs(((angles[1] - angles[0] + 360) % 360) - 90) < 1e-3);

  f.phase = 'save .bcad, reopen in fresh session, and edit Shell thickness 4 -> 2 mm (R12 -> R13)';
  const savedText = await download('Save', 'arc-centerline-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.arcCenterlines.length, 1);

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'arc-centerline-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('g.arc-centerline[data-arc-centerline="ac1"] path').waitFor();
  await f.page.locator('[aria-label="Curved centerlines"]').filter({ hasText: 'R12' }).waitFor();
  await f.snapshot('03-reopened-saved');

  await button('Model').click();
  await f.openFeatureEditor(3, 'Shell');
  const thicknessInput = f.editor().getByLabel('Wall', { exact: true });
  assert.equal(await thicknessInput.inputValue(), '4');
  await thicknessInput.fill('2');
  await f.applyEditor(await f.doc(), 'apply-shell-wall-2');
  await wait(() => window.__studioDoc?.nodes?.[3]?.thickness === 2);
  await button('Drawing').click();
  await f.page.locator('[aria-label="Curved centerlines"]').filter({ hasText: 'R13' }).waitFor();
  await f.page.locator('g.arc-centerline[data-arc-centerline="ac1"] path').waitFor();
  await f.snapshot('04-after-shell-t2');

  return {
    initialMidRadius: 12,
    editedMidRadius: 13,
    dxfCenterArcFound: true,
  };
});
