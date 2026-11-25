import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const id = 'linear-arrows';
const pins = [
  'apps/cad-studio/test/drawing-linear-arrows-browser.mjs',
  'apps/cad-studio/src/ui/DrawingWorkspace.tsx',
  'apps/cad-studio/src/ui/drawing/DimensionsList.tsx',
  'apps/cad-studio/src/ui/drawing/ExportActions.tsx',
  ...['sheet','types','issues'].map(s => 'packages/barocss-cad-model/src/drawing/' + s + '.ts'),
];
const f = await createFlow({
  name: id, output: process.argv[2], envFrozen: 'D1999_SOURCE_FROZEN',
  qualification: 'Manual A/B arrow placement, with native file, sheet SVG, and DXF semantic/display-block independent checks.',
  initialFiles: pins, requiredFrozen: pins,
  limits: ['Synthetic rectangular part, not external CAD receiver redraw, not PDF qualification.'],
  inspectorSource: `
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { brepsFor } from '@barocss/cad-model/engine/evaluate';
import { projectViews } from '@barocss/cad-model/drawing/project';
import { snapPoints } from '@barocss/cad-model/drawing/dimensions';
import { defaultDrawing } from '@barocss/cad-model/drawing/types';
const doc = rectanglePart(40,20,8), b = brepsFor(doc);
if (!('breps' in b)) throw Error('No fixture solid');
const p = projectViews(b.breps,b.prefixes);
if (!p.ok) throw Error('No projection');
const points=snapPoints(p.views.front);
const at=(x,y)=>points.find(q=>Math.abs(q.at[0]-x)+Math.abs(q.at[1]-y)<1e-8).ref;
const d={id:'linear-arrows',kind:'linear',view:'front',orient:'horizontal',a:at(0,0),b:at(40,0),place:[20,-25]};
console.log(JSON.stringify({...doc,drawing:{...defaultDrawing(),scale:.25,dimensions:[d]}}));
`,
});

const group = 'g.dimension[data-dim="' + id + '"]';
const button = name => f.page.getByRole('button', { name, exact: true });
const field = name => f.page.getByLabel(name, { exact: true });
const arrow = side => field('Arrow ' + side + ' placement');
const checkX = (a,b) => assert.ok(Math.abs(a-b)<1e-3, `${a} != ${b}`);
const arrowData = paths => paths.map(path => {
  const coords = path.slice(1,-1).split('L').map(pair=>pair.split(' ').map(Number));
  assert.equal(coords.length,3);
  return {tip:coords[0],dir:Math.sign(coords[0][0]-(coords[1][0]+coords[2][0])/2)};
});
const currentPaths = () => f.page.locator(group + ' > path[stroke="none"]').evaluateAll(els => els.map(e => e.getAttribute('d')));
const assertDirections = async (a,b,span) => {
  const points=arrowData(await currentPaths());
  assert.deepEqual(points.map(h=>h.dir),[a,b]);
  checkX(points[1].tip[0]-points[0].tip[0],span);
  return points;
};
const readDim = async () => (await f.doc()).drawing.dimensions[0];
const wait = predicate => f.page.waitForFunction(predicate);
async function selectDrawing() {
  if (!(await f.page.locator('.dw[aria-label="Drawing"]').count())) await button('Drawing').click();
  await f.page.locator(group).waitFor();
  await f.page.locator('.dw-annotation-select').filter({ hasText: /horizontal · front/ }).click();
  await arrow('A').waitFor();
}
async function download(name, filename) {
  const [dl] = await Promise.all([f.page.waitForEvent('download'), button(name).click()]);
  const path = join(f.output, filename);
  await dl.saveAs(path);
  return readFile(path, 'utf8');
}
function dxfEntities(source) {
  const lines=source.trim().split(/\r?\n/), out=[];
  assert.equal(lines.length%2,0);
  for(let i=0;i<lines.length;i+=2){
    const key=Number(lines[i].trim()),value=lines[i+1].trim();
    if(key===0) out.push({type:value,pairs:[]});
    else out.at(-1)?.pairs.push([key,value]);
  }
  return out;
}
const pair = (ent,key) => ent.pairs.find(([k])=>k===key)?.[1];

await f.run(async () => {
  f.phase='open fixture and capture automatic';
  const seed = await f.inspect('fixture', {});
  await f.newPage();
  await field('Model file').setInputFiles({name:'linear-arrows.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
  await f.ready();
  assert.deepEqual((await f.doc()).nodes,seed.nodes);
  await selectDrawing();
  const before = await f.doc(), initial = await assertDirections(-1,1,10);
  await f.snapshot('00-automatic');
  f.phase='apply A outside and leave B auto';
  await arrow('A').selectOption('outside');
  await wait(()=>window.__studioDoc?.drawing?.dimensions?.[0]?.arrowPlacement?.a==='outside');
  await assertDirections(1,1,10);
  assert.deepEqual((await assertDirections(1,1,10)).map(h=>h.tip),initial.map(h=>h.tip));
  const mixed = await f.doc();
  await f.snapshot('01-a-outside-b-auto');
  await f.undo(); await f.same(before);
  await f.redo(); await f.same(mixed);
  await selectDrawing();
  f.phase='retain A through tolerance, unit, and threshold-crossing scale edits';
  await field('Tolerance').selectOption('symmetric');
  await wait(()=>window.__studioDoc?.drawing?.dimensions?.[0]?.tol?.kind==='symmetric');
  const details=f.page.locator('details').filter({hasText:'inch decimals'});
  await details.locator(':scope > summary').click();
  await field('Drawing units').selectOption('inch');
  await button('Set custom sheet scale').click();
  await field('Scale paper ratio').fill('1');
  await field('Scale model ratio').fill('8');
  await button('Apply custom sheet scale').click();
  await wait(()=>window.__studioDoc?.drawing?.scale===.125);
  await assertDirections(1,-1,5);
  assert.deepEqual((await readDim()).arrowPlacement,{a:'outside'});
  assert.deepEqual((await readDim()).a,seed.drawing.dimensions[0].a);
  assert.deepEqual((await readDim()).b,seed.drawing.dimensions[0].b);
  assert.deepEqual((await f.doc()).nodes,seed.nodes);
  await f.snapshot('02-after-scale');
  f.phase='select B Inside so downloaded appearance distinguishes the override';
  await arrow('B').selectOption('inside');
  await wait(()=>window.__studioDoc?.drawing?.dimensions?.[0]?.arrowPlacement?.b==='inside');
  const manual = await assertDirections(1,1,5);
  const svg = await download('Export SVG','linear-arrows.svg');
  const svgGroup=svg.match(/<g class="dimension"[^>]+data-dim="linear-arrows">([^\n]+)<\/g>/)?.[1];
  assert.ok(svgGroup, 'export must contain the linear dimension group');
  assert.deepEqual(arrowData([...svgGroup.matchAll(/<path d="([^"]+)" fill="#000"/g)].map(x=>x[1])), manual);
  const dxf = dxfEntities(await download('Export DXF','linear-arrows.dxf'));
  const dim=dxf.find(e=>e.type==='DIMENSION'); assert.ok(dim);
  assert.equal(Number(pair(dim,42)),40);
  const p1=Number(pair(dim,13)), p2=Number(pair(dim,14));
  checkX(p2-p1,5);
  const block=dxf.findIndex(e=>e.type==='BLOCK' && pair(e,2)===pair(dim,2)); assert.ok(block>=0);
  const end=dxf.findIndex((e,i)=>i>block&&e.type==='ENDBLK'); assert.ok(end>block);
  const solids=dxf.slice(block+1,end).filter(e=>e.type==='SOLID');
  assert.equal(solids.length,2);
  for (const [i,solid] of solids.entries()) {
    const tip=Number(pair(solid,10));
    checkX(tip,manual[i].tip[0]);
    assert.equal(Math.sign(tip-(Number(pair(solid,11))+Number(pair(solid,12)))/2),1);
  }
  assert.equal(await f.page.getByRole('note',{name:'DXF arrow display compatibility'}).count(),1);
  f.report.observations.push({svgArrows:manual, dxfMeasuredMM:40, dxfPaperSpanMM:p2-p1, dxfDisplayBlock:pair(dim,2)});
  f.phase='reopen native Save, edit tolerance again, restore both automatic';
  const saved = await f.save('linear-arrows-reopen');
  await f.newPage();
  await field('Model file').setInputFiles(saved.file);
  await f.ready();
  assert.deepEqual(await f.doc(), saved.doc);
  await selectDrawing();
  assert.equal(await arrow('A').inputValue(),'outside');
  assert.equal(await arrow('B').inputValue(),'inside');
  await assertDirections(1,1,5);
  await field('Tolerance ±').fill('0.25');
  await field('Tolerance ±').press('Enter');
  await wait(()=>window.__studioDoc?.drawing?.dimensions?.[0]?.tol?.value===.25);
  assert.deepEqual((await readDim()).arrowPlacement,{a:'outside',b:'inside'});
  await f.snapshot('03-fresh-open');
  await arrow('A').selectOption('auto');
  await arrow('B').selectOption('auto');
  await wait(()=>!window.__studioDoc?.drawing?.dimensions?.[0]?.arrowPlacement);
  await assertDirections(1,-1,5);
  await f.snapshot('04-automatic-restored');
});
