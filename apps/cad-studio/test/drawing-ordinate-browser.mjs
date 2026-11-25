import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-ordinate-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  'apps/cad-studio/src/drawing/drawing.css',
  ...['ordinate', 'sheet', 'types', 'sheets', 'issues', 'reorient'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/svg.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'ordinate-groups',
  output: process.argv[2],
  envFrozen: 'D2018_SOURCE_FROZEN',
  qualification: 'Source-bound common-origin ordinate dimension groups on an asymmetric 60x30x10 mm plate with three holes at X=10, 25, 40 mm, verifying Escape cancel before baseline leaves Doc unchanged, creating horizontal group ord1 at origin (0,0) and adding members m1(10), m2(25), m3(40), group baseline Move and individual member Jog without changing measured values, Undo/Redo, SVG & DXF export, native .bcad Save/Open, and post-Open Hole 3 Centre X edit 40->48 updating m3 live 40->48 while preserving m1=10 and m2=25.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Synthetic 60x30x10 three-hole plate in ordinary unbroken Top view; PDF golden and schema 5/migration HOLDs stay separate.'],
  inspectorSource: `
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
let doc = rectanglePart(60, 30, 10);
doc = withNode(doc, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [10, 15], axis: 'z', radius: 3 });
doc = withNode(doc, { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [25, 15], axis: 'z', radius: 3 });
doc = withNode(doc, { kind: 'hole', parent: { node: 3, side: 'solid' }, center: [40, 15], axis: 'z', radius: 3 });
console.log(JSON.stringify({
  doc: { ...doc, drawing: { ...defaultDrawing(), scale: 1, dimensions: [] } },
  originCorner: [0, 0],
  holes: [[10, 15], [25, 15], [40, 15]],
}));
`,
});

const button = name => f.page.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const wait = (predicate, arg) => f.page.waitForFunction(predicate, arg);

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

await f.run(async () => {
  f.phase = 'open 60x30x10 three-hole plate in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'ordinate-plate.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 30, 15)));
  const baseline = await f.doc();

  f.phase = 'verify Escape cancels pending ordinate origin cleanly without mutating Doc';
  await button('Ordinate').click();
  const originPt = await pointInTop(info.originCorner[0], info.originCorner[1]);
  await f.page.mouse.click(originPt.x, originPt.y);
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'create horizontal ordinate group ord1 at (0,0) and add members at X=10, 25, 40';
  await button('Ordinate').click();
  await f.page.mouse.click(originPt.x, originPt.y);
  const basePt = await pointInTop(0, 38);
  await f.page.mouse.click(basePt.x, basePt.y);
  await wait(() => window.__studioDoc?.drawing?.ordinateGroups?.length === 1);

  for (let i = 0; i < info.holes.length; i++) {
    const hp = await pointInTop(info.holes[i][0], info.holes[i][1]);
    await f.page.mouse.click(hp.x, hp.y);
    await wait(count => window.__studioDoc?.drawing?.ordinateGroups?.[0]?.members?.length === count, i + 1);
  }
  await f.page.keyboard.press('Escape');

  await wait(() => {
    const g = window.__studioDrawing?.()?.ordinateGroups?.[0];
    return g && g.originText === '0' && g.members.map(m => m.text).join(',') === '10,25,40';
  });
  await wait(() => document.querySelectorAll('g.ordinate-group[data-ordinate-group="ord1"] text').length === 4);
  assert.equal(await f.page.getByRole('note', { name: 'DXF ordinate compatibility' }).count(), 1);
  await f.snapshot('01-ordinate-0-10-25-40');

  f.phase = 'move group baseline and jog member m2 while keeping measured values 10, 25, 40 invariant';
  const beforeLine = await f.page.evaluate(() => window.__studioDoc?.drawing?.ordinateGroups?.[0]?.lineCoord);
  await button('Move baseline ord1').click();
  await wait(prev => window.__studioDoc?.drawing?.ordinateGroups?.[0]?.lineCoord > prev, beforeLine);
  await button('Toggle jog for m2').click();
  await wait(() => window.__studioDoc?.drawing?.ordinateGroups?.[0]?.members?.[1]?.jog === 5);
  const afterMove = await f.page.evaluate(() => window.__studioDrawing?.()?.ordinateGroups?.[0]);
  assert.deepEqual(afterMove.members.map(m => m.text), ['10', '25', '40']);
  assert.equal(afterMove.members[1].jog, 5);
  await f.snapshot('02-moved-and-jogged');

  f.phase = 'verify Undo/Redo on jog';
  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.ordinateGroups?.[0]?.members?.[1]?.jog === undefined);
  await button('Redo').click();
  await wait(() => window.__studioDoc?.drawing?.ordinateGroups?.[0]?.members?.[1]?.jog === 5);

  f.phase = 'verify SVG and DXF exports';
  const svgText = await download('Export SVG', 'ordinate.svg');
  assert.match(svgText, /data-ordinate-group="ord1"/);
  assert.match(svgText, />0<\/text>/);
  assert.match(svgText, />10<\/text>/);
  assert.match(svgText, />25<\/text>/);
  assert.match(svgText, />40<\/text>/);
  const dxfText = await download('Export DXF', 'ordinate.dxf', 'latin1');
  assert.match(dxfText, /\n40\r?\n/);

  f.phase = 'save .bcad, reopen fresh, and edit Hole 3 Centre X 40 -> 48 so m3 updates live 40 -> 48';
  const savedText = await download('Save', 'ordinate-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.ordinateGroups.length, 1);
  assert.equal(savedDoc.drawing.ordinateGroups[0].members.length, 3);
  assert.equal(savedDoc.drawing.ordinateGroups[0].members[1].jog, 5);

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'ordinate-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await wait(() => {
    const g = window.__studioDrawing?.()?.ordinateGroups?.[0];
    return g && g.members.map(m => m.text).join(',') === '10,25,40' && g.members[1].jog === 5;
  });

  await button('Model').click();
  await f.openFeatureEditor(4, 'Hole');
  const xInput = f.editor().getByLabel('Centre X', { exact: true });
  assert.equal(await xInput.inputValue(), '40');
  await xInput.fill('48');
  await f.applyEditor(await f.doc(), 'apply-hole3-x-48');
  await wait(() => window.__studioDoc?.nodes?.[4]?.center?.[0] === 48);
  await button('Drawing').click();
  await wait(() => {
    const g = window.__studioDrawing?.()?.ordinateGroups?.[0];
    return g && g.members.map(m => m.text).join(',') === '10,25,48' && g.members[1].jog === 5;
  });
  await f.snapshot('03-reopened-hole3-48');

  return {
    initialValues: ['10', '25', '40'],
    afterHoleEdit: ['10', '25', '48'],
  };
});
