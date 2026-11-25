import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-center-mark-group-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'apps/cad-studio/src/drawing/drawing.css',
  ...['centerMarkGroup', 'sheet', 'types', 'sheets', 'issues', 'reorient'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/svg.ts',
  'packages/barocss-cad-model/src/io/dxf.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'center-mark-group',
  output: process.argv[2],
  envFrozen: 'D2011_SOURCE_FROZEN',
  qualification: 'Source-bound linear hole-row center mark group (3 collinear R=3 holes at (0,0),(20,0),(40,0) + off-axis control hole at (20,18)) with straight/off-axis/duplicate refusal, Escape cancel, explicit Create row commit, 3-source highlight, per-group Connecting line toggle, global Centre lines toggle, Delete + Undo/Redo, SVG/DXF CENTER LINE export, native Save/Open, and post-Open Hole 3 Centre X edit 40 -> 50 mm updating connecting segments (20 + 30 mm) without auto-enrolling other holes.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic rectangular plate ([-20,-20]..[70,35], h=10 mm) with 3 collinear R=3 through-holes + 1 off-axis control hole in ordinary unbroken Top view; PDF golden HOLD remains separate.'],
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
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-20, -20], max: [70, 35] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } },
};
doc = withNode(doc, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [0, 0], radius: 3 });
doc = withNode(doc, { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [20, 0], radius: 3 });
doc = withNode(doc, { kind: 'hole', parent: { node: 3, side: 'solid' }, center: [40, 0], radius: 3 });
doc = withNode(doc, { kind: 'hole', parent: { node: 4, side: 'solid' }, center: [20, 18], radius: 3 });
const b = brepsFor(doc);
if (!('breps' in b)) throw Error('No plate: ' + JSON.stringify(b));
const p = projectViews(b.breps, b.prefixes);
if (!p.ok) throw Error('No projection');
console.log(JSON.stringify({
  doc: { ...doc, drawing: { ...defaultDrawing(), scale: 1, dimensions: [] } },
  hole1Rim: [3, 0],
  hole2Rim: [23, 0],
  hole3Rim: [43, 0],
  offAxisRim: [23, 18],
  straightPt: [25, -20],
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
  f.phase = 'open 4-hole plate (3 collinear + 1 off-axis) in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'center-mark-group.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 25, -20)));
  const baseline = await f.doc();
  await f.snapshot('00-baseline');

  f.phase = 'refuse straight edge, duplicate hole, and off-axis hole, then cancel with Escape';
  await button('Hole row').click();
  const straightPt = await pointInTop(info.straightPt[0], info.straightPt[1]);
  await f.page.mouse.click(straightPt.x, straightPt.y);
  await f.page.locator('.dw-hint').filter({ hasText: /full circular hole/i }).waitFor();

  const h1 = await pointInTop(info.hole1Rim[0], info.hole1Rim[1]);
  const h2 = await pointInTop(info.hole2Rim[0], info.hole2Rim[1]);
  const h3 = await pointInTop(info.hole3Rim[0], info.hole3Rim[1]);
  const hOff = await pointInTop(info.offAxisRim[0], info.offAxisRim[1]);

  await f.page.mouse.click(h1.x, h1.y);
  await f.page.mouse.click(h1.x, h1.y);
  await f.page.locator('.dw-hint').filter({ hasText: /already in the row/i }).waitFor();
  await f.page.mouse.click(h2.x, h2.y);
  await f.page.mouse.click(hOff.x, hOff.y);
  await f.page.locator('.dw-hint').filter({ hasText: /not collinear/i }).waitFor();
  assert.deepEqual(await f.doc(), baseline);
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'create 3-hole linear group cmg1 and verify 3 source highlights and connecting lines';
  await button('Hole row').click();
  await f.page.mouse.click(h1.x, h1.y);
  await f.page.mouse.click(h2.x, h2.y);
  await f.page.mouse.click(h3.x, h3.y);
  await wait(() => document.querySelectorAll('[data-center-mark-group-source]').length === 3);
  await wait(() => document.querySelectorAll('[data-center-mark-group-preview] line').length === 2);
  assert.deepEqual(await f.doc(), baseline, 'drafting must not modify Doc before Create row');
  await button('Create hole row').click();
  await wait(() => window.__studioDoc?.drawing?.centerMarkGroups?.length === 1);
  await wait(() => document.querySelectorAll('g.center-mark-group[data-center-mark-group="cmg1"] line').length === 2);
  await wait(() => document.querySelectorAll('[data-center-mark-group-source]').length === 3);
  await f.page.locator('[aria-label="Hole rows"]').filter({ hasText: '3 holes' }).waitFor();
  assert.equal(await f.page.getByRole('note', { name: 'DXF hole row compatibility' }).count(), 1);
  await f.snapshot('01-placed-3holes');

  f.phase = 'toggle per-group Connecting line and global Centre lines without losing group record';
  await button('Connecting line cmg1').click();
  await wait(() => document.querySelectorAll('g.center-mark-group[data-center-mark-group="cmg1"]').length === 0);
  assert.equal((await f.doc()).drawing.centerMarkGroups.length, 1);
  assert.equal((await f.doc()).drawing.centerMarkGroups[0].connectingLines, false);
  await f.snapshot('02-line-hidden');
  await button('Connecting line cmg1').click();
  await wait(() => document.querySelectorAll('g.center-mark-group[data-center-mark-group="cmg1"] line').length === 2);
  assert.equal((await f.doc()).drawing.centerMarkGroups[0].connectingLines, true);

  const centersToggle = f.page.getByLabel('Centre lines', { exact: true });
  await centersToggle.uncheck();
  await wait(() => document.querySelectorAll('g.center-mark-group[data-center-mark-group="cmg1"]').length === 0);
  assert.equal((await f.doc()).drawing.centerMarkGroups.length, 1);
  await centersToggle.check();
  await wait(() => document.querySelectorAll('g.center-mark-group[data-center-mark-group="cmg1"] line').length === 2);

  f.phase = 'verify Delete + Undo/Redo restore cleanly';
  await button('Remove hole row cmg1').click();
  await wait(() => !window.__studioDoc?.drawing?.centerMarkGroups?.length);
  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.centerMarkGroups?.length === 1);
  await button('Redo').click();
  await wait(() => !window.__studioDoc?.drawing?.centerMarkGroups?.length);
  await button('Undo').click();
  await wait(() => document.querySelectorAll('g.center-mark-group[data-center-mark-group="cmg1"] line').length === 2);

  f.phase = 'verify SVG and DXF exports include exact 20 mm CENTER LINE segments';
  const svgText = await download('Export SVG', 'center-mark-group.svg');
  const svgMatch = svgText.match(/<g class="center-mark-group" data-view="top" data-center-mark-group="cmg1">([\s\S]*?)<\/g>/);
  assert.ok(svgMatch, 'SVG missing center-mark-group');
  assert.equal([...svgMatch[1].matchAll(/<line\b/g)].length, 2);
  const dxfText = await download('Export DXF', 'center-mark-group.dxf', 'latin1');
  const centerLines = dxfEntities(dxfText).filter(e => e.type === 'LINE' && e.pairs.some(([k, v]) => k === 8 && v === 'CENTER'));
  const connecting20 = centerLines.filter(e => Math.abs(dxfLineLength(e) - 20) < 1e-4);
  assert.ok(connecting20.length >= 2, `expected at least 2 CENTER LINE entities of length 20 mm, got ${connecting20.length}`);

  f.phase = 'save .bcad, reopen in fresh session, and edit Hole 3 Centre X 40 -> 50 mm';
  const savedText = await download('Save', 'center-mark-group-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.centerMarkGroups.length, 1);
  assert.equal(savedDoc.drawing.centerMarkGroups[0].members.length, 3);

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'center-mark-group-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await wait(() => document.querySelectorAll('g.center-mark-group[data-center-mark-group="cmg1"] line').length === 2);
  await f.page.locator('[aria-label="Hole rows"]').filter({ hasText: '3 holes' }).waitFor();
  await f.snapshot('03-reopened-saved');

  await button('Model').click();
  await f.openFeatureEditor(4, 'Hole');
  const cxInput = f.editor().getByLabel('Centre X', { exact: true });
  assert.equal(await cxInput.inputValue(), '40');
  await cxInput.fill('50');
  await f.applyEditor(await f.doc(), 'apply-hole3-cx-50');
  await wait(() => window.__studioDoc?.nodes?.[4]?.center?.[0] === 50);
  await button('Drawing').click();
  await wait(() => {
    const cmg = window.__studioDrawing?.()?.centerMarkGroups?.[0];
    if (!cmg || !cmg.segments || cmg.segments.length !== 2) return false;
    const len1 = Math.hypot(cmg.segments[0][1][0] - cmg.segments[0][0][0], cmg.segments[0][1][1] - cmg.segments[0][0][1]);
    const len2 = Math.hypot(cmg.segments[1][1][0] - cmg.segments[1][0][0], cmg.segments[1][1][1] - cmg.segments[1][0][1]);
    return Math.abs(len1 - 20) < 1e-4 && Math.abs(len2 - 30) < 1e-4;
  });
  await f.snapshot('04-after-hole3-x50');

  return {
    initialSegmentsMm: [20, 20],
    editedSegmentsMm: [20, 30],
    dxfConnectingLines20Mm: connecting20.length,
  };
});
