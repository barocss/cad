import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const pins = [
  'apps/cad-studio/test/drawing-hole-table-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/useDrawingSheet.ts',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['holeTable', 'sheet', 'types', 'sheets', 'issues', 'reorient', 'savedAnnotationRefs'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
  'packages/barocss-cad-model/src/io/svg.ts',
  'packages/barocss-cad-model/src/engine/references.ts',
];

const f = await createFlow({
  name: 'hole-table',
  output: process.argv[2],
  envFrozen: 'D2021_SOURCE_FROZEN',
  qualification: 'Source-bound Drawing Hole Table on the #232 40x40x8 plate (origin hole O=(10,10), selected holes C1=(20,15) Ø4, C2=(5,15) Ø4, C3=(20,30) Ø6) verifying Escape cancel, origin + 3 rim picks, exact signed X/Y (10,5), (-5,5), (10,20), tag rename A3->B1, row reorder, table move, Undo/Redo, SVG & DXF export, .bcad Save/Open, and post-Open Hole 2 edit updating only A2.',
  initialFiles: pins,
  requiredFrozen: pins,
  limits: ['Single base-part 40x40x8 plate in ordinary unbroken Top view; boss/blind/pattern/suppressed/inch/malformed-sig checks verified in model unit tests.'],
  inspectorSource: `
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
const doc = {
  ...emptyDoc(),
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [0, 0], max: [40, 40] },
    { kind: 'extrude', id: 'n1', sketch: 0, height: 8 },
    { kind: 'hole', id: 'n2', parent: { node: 1, side: 'solid' }, center: [10, 10], radius: 2, axis: 'z' },
    { kind: 'hole', id: 'n3', parent: { node: 2, side: 'solid' }, center: [20, 15], radius: 2, axis: 'z' },
    { kind: 'hole', id: 'n4', parent: { node: 3, side: 'solid' }, center: [5, 15], radius: 2, axis: 'z' },
    { kind: 'hole', id: 'n5', parent: { node: 4, side: 'solid' }, center: [20, 30], radius: 3, axis: 'z' },
  ],
  outputs: { b1: { node: 5, side: 'solid' } },
  nextId: 6,
  drawing: { ...defaultDrawing(), scale: 2, dimensions: [] },
};
console.log(JSON.stringify({
  doc,
  originHole: [10, 10],
  rimPicks: [[22, 15], [7, 15], [23, 30]],
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
  f.phase = 'open 40x40x8 plate in Drawing';
  const info = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({ name: 'hole-table-plate.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(info.doc)) });
  await f.ready();
  await button('Drawing').click();
  await f.page.locator('.dw[aria-label="Drawing"]').waitFor();
  await wait(() => Boolean(window.__studioDrawingAt?.('top', 20, 20)));
  const baseline = await f.doc();

  f.phase = 'verify Escape cancels pending hole table cleanly without mutating Doc';
  await button('Hole table').click();
  const originPt = await pointInTop(info.originHole[0], info.originHole[1]);
  await f.page.mouse.click(originPt.x, originPt.y);
  await f.page.keyboard.press('Escape');
  assert.deepEqual(await f.doc(), baseline);

  f.phase = 'create hole table ht1 with origin O=(10,10) and 3 plain through-holes';
  await button('Hole table').click();
  await f.page.mouse.click(originPt.x, originPt.y);
  for (let i = 0; i < info.rimPicks.length; i++) {
    const rp = await pointInTop(info.rimPicks[i][0], info.rimPicks[i][1]);
    await f.page.mouse.click(rp.x, rp.y);
    await wait(n => document.querySelector('button[aria-label="Create hole table"]')?.textContent?.includes(`(${n})`), i + 1);
  }
  await button('Create hole table').click();
  await wait(() => window.__studioDoc?.drawing?.holeTables?.length === 1);
  await wait(() => {
    const ht = window.__studioDrawing?.()?.holeTables?.[0];
    return ht && !ht.lost && ht.members.length === 3
      && ht.members[0].xText === '10' && ht.members[0].yText === '5'
      && ht.members[1].xText === '-5' && ht.members[1].yText === '5'
      && ht.members[2].xText === '10' && ht.members[2].yText === '20';
  });
  assert.equal(await f.page.getByRole('note', { name: 'DXF hole table compatibility' }).count(), 1);
  await f.snapshot('01-hole-table-created');

  f.phase = 'rename tag A3 -> B1, reorder B1 up, and move table while keeping coordinates invariant';
  const tag3 = field('Tag for hm3');
  await tag3.fill('B1');
  await tag3.press('Enter');
  await wait(() => window.__studioDoc?.drawing?.holeTables?.[0]?.members?.[2]?.tag === 'B1');
  await button('Move row hm3 up').click();
  await wait(() => window.__studioDoc?.drawing?.holeTables?.[0]?.members?.[1]?.tag === 'B1');
  await button('Move hole table ht1').click();
  await wait(() => Array.isArray(window.__studioDoc?.drawing?.holeTables?.[0]?.at));
  const afterEdit = await f.page.evaluate(() => window.__studioDrawing?.()?.holeTables?.[0]);
  assert.deepEqual(afterEdit.members.map(m => `${m.tag}:${m.xText},${m.yText}:${m.sizeText}`), [
    'A1:10,5:Ø4 THRU',
    'B1:10,20:Ø6 THRU',
    'A2:-5,5:Ø4 THRU',
  ]);
  await f.snapshot('02-renamed-reordered-moved');

  f.phase = 'verify Undo/Redo on table move';
  await button('Undo').click();
  await wait(() => window.__studioDoc?.drawing?.holeTables?.[0]?.at === undefined);
  await button('Redo').click();
  await wait(() => Array.isArray(window.__studioDoc?.drawing?.holeTables?.[0]?.at));

  f.phase = 'verify SVG and DXF exports';
  const svgText = await download('Export SVG', 'hole-table.svg');
  assert.match(svgText, /data-hole-table="ht1"/);
  assert.match(svgText, />HOLE TABLE<\/text>/);
  assert.match(svgText, />B1<\/text>/);
  assert.match(svgText, />-5<\/text>/);
  assert.match(svgText, />Ø6 THRU<\/text>/);
  const dxfText = await download('Export DXF', 'hole-table.dxf', 'latin1');
  assert.match(dxfText, /HOLE TABLE/);
  assert.match(dxfText, /\nB1\r?\n/);

  f.phase = 'save .bcad, reopen fresh, and edit Hole n4 (A2) Centre X 5 -> 8 and Radius 2 -> 2.5';
  const savedText = await download('Save', 'hole-table-saved.bcad');
  const savedDoc = JSON.parse(savedText);
  assert.equal(savedDoc.drawing.holeTables.length, 1);
  assert.deepEqual(savedDoc.drawing.holeTables[0].members.map(m => m.tag), ['A1', 'B1', 'A2']);

  await f.newPage();
  await field('Model file').setInputFiles({ name: 'hole-table-saved.bcad', mimeType: 'application/json', buffer: Buffer.from(savedText) });
  await f.ready();
  await button('Drawing').click();
  await wait(() => {
    const ht = window.__studioDrawing?.()?.holeTables?.[0];
    return ht && !ht.lost && ht.members.map(m => `${m.tag}:${m.xText},${m.yText}`).join('|') === 'A1:10,5|B1:10,20|A2:-5,5';
  });

  await button('Model').click();
  await f.openFeatureEditor(4, 'Hole');
  const xInput = f.editor().getByLabel('Centre X', { exact: true });
  const dInput = f.editor().getByLabel('Diameter', { exact: true });
  assert.equal(await xInput.inputValue(), '5');
  assert.equal(await dInput.inputValue(), '4');
  await xInput.fill('8');
  await dInput.fill('5');
  await f.applyEditor(await f.doc(), 'apply-hole-n4-edit');
  await wait(() => window.__studioDoc?.nodes?.[4]?.center?.[0] === 8 && window.__studioDoc?.nodes?.[4]?.radius === 2.5);
  await button('Drawing').click();
  await wait(() => {
    const ht = window.__studioDrawing?.()?.holeTables?.[0];
    return ht && !ht.lost
      && ht.members.map(m => `${m.tag}:${m.xText},${m.yText}:${m.sizeText}`).join('|')
        === 'A1:10,5:Ø4 THRU|B1:10,20:Ø6 THRU|A2:-2,5:Ø5 THRU';
  });
  await f.snapshot('03-reopened-hole2-edited');

  return {
    initial: ['A1:10,5:Ø4 THRU', 'B1:10,20:Ø6 THRU', 'A2:-5,5:Ø4 THRU'],
    afterEdit: ['A1:10,5:Ø4 THRU', 'B1:10,20:Ø6 THRU', 'A2:-2,5:Ø5 THRU'],
  };
});
