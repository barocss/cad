import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';

const webgpu = process.argv.includes('--webgpu');
const seed=JSON.parse(await readFile('apps/cad-studio/test/fixtures/bracket.bcad','utf8'));
const end=x=>({edge:'n1.side0|n1.top',at:'end',near:[x,0,6]});
const second={id:'second',kind:'linear',view:'front',a:end(0),b:end(30),orient:'horizontal',place:[15,13],count:4,tol:{kind:'symmetric',value:.1234}};
const frame={id:'control-second',dim:'second',characteristic:'position',value:.2,datums:[],composite:{value:.1,datums:[]}};
const short={...second,id:'short',place:[15,24]};
delete short.count;
delete short.tol;
const doc={...seed,drawing:{sheet:'A3',projection:'third',hidden:true,scale:2,views:['front','top','right'],notes:[],
  dimensions:[{...second,id:'first'},second,short],frames:[frame]}};
const f=await createFlow({name:'pmi-source-layout',output:process.argv[2],envFrozen:'D1821_SOURCE_FROZEN',
 initialFiles:['apps/cad-studio/test/pmi-source-layout-browser.mjs','apps/cad-studio/src/viewport/useWorkspacePreviews.ts','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts',
  'apps/cad-studio/src/viewport/pmiGeometry.ts','packages/barocss-cad-model/src/drawing/annotations3d.ts'],
 qualification:'Actual desktop overlap, composite control labels and source removal/Undo/Redo on the same bracket.',
 snapshotExtra: () => ({ pmi:window.__studioPmi(), dirty:!!document.querySelector('[aria-label="Unsaved changes"]') })});
const button=name=>f.page.getByRole('button',{name,exact:true});
const toggle=()=>f.page.getByLabel('3D annotations',{exact:true});
const read=()=>f.page.evaluate(()=>({pmi:window.__studioPmi(),selection:window.__studioSelection,dirty:!!document.querySelector('[aria-label="Unsaved changes"]')}));
const settle=async()=>{await f.page.waitForTimeout(350);await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));};
async function show(ids){
 if(!await toggle().isChecked()) await toggle().check();
 await f.page.waitForFunction(ids=>JSON.stringify(window.__studioPmi()?.items?.map(item=>item.id))===JSON.stringify(ids),ids);
 await settle();
}
async function svgProbes() {
 const texts = await f.page.locator('svg.pmi text.pmi-text').evaluateAll(nodes => nodes.map(node => {
  const bounds = node.getBoundingClientRect();
  return { text:node.textContent, index:Number(node.dataset.pmiItem), x:bounds.x, y:bounds.y, width:bounds.width, height:bounds.height };
 }));
 const centre = bounds => [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2];
 const overlap = texts.filter(text => text.text.startsWith('4×'));
 assert.equal(overlap.length, 2);
 assert.deepEqual(centre(overlap[0]), centre(overlap[1]));
 const lower = texts.find(text => text.index === 3 && text.text.includes('0.1'));
 assert.ok(lower && lower.width > 0 && lower.height > 0);
 return { overlapPoint:centre(overlap[0]), framePoint:centre(lower), texts };
}

// Compare visible pixels with the overlay off and on. Projection only locates
// two isolated regions. Hit and glyph rectangle sizes come from neither product API.
function glyphPixel(off, on, { left, right, top, bottom }) {
 const ink = new Map();
 for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
  const key = y * on.width + x, i = key * 4;
  const [r, g, b] = on.data.subarray(i, i + 3);
  const delta = Math.abs(r - off.data[i]) + Math.abs(g - off.data[i + 1]) + Math.abs(b - off.data[i + 2]);
  if (b > g + 20 && g > r + 20 && b > 115 && delta > 50) ink.set(key, [x,y]);
 }
 const glyphs = [];
 while (ink.size) {
  const [key, point] = ink.entries().next().value;
  const component = [point];
  ink.delete(key);
  for (const [x,y] of component) {
   for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (x + dx < left || x + dx > right || y + dy < top || y + dy > bottom) continue;
    const next = (y + dy) * on.width + x + dx, nextPoint = ink.get(next);
    if (nextPoint) { ink.delete(next); component.push(nextPoint); }
   }
  }
  const xs = component.map(point => point[0]), ys = component.map(point => point[1]);
  const width = Math.max(...xs) - Math.min(...xs) + 1, height = Math.max(...ys) - Math.min(...ys) + 1;
  if (component.length > 10 && width >= 3 && width <= 64 && height >= 3 && height <= 43 && width / height >= .28) {
   glyphs.push(component);
  }
 }
 assert.ok(glyphs.length >= 2, 'NOT_RUN: isolated text pixels could not be classified');
 const glyph = glyphs.sort((a,b) => b.length - a.length)[0];
 const [x,y] = glyph[Math.floor(glyph.length / 2)];
 return [x + .5, y + .5];
}

async function gpuProbes(ids) {
 const { PNG } = createRequire(join(process.env.PW_DIR, 'package.json'))('playwright-core/lib/utilsBundle');
 const { dim, lower } = await f.page.evaluate(() => {
  const screen = point => window.__studioScreenOf(point);
  const items = window.__studioPmi().items;
  const frame = screen(items.find(item => item.id === 'control-second').anchor);
  // At this fixture's drawing scale the two authored rows are 3 mm apart.
  const pixelsPerMM = Math.abs(screen([0,0,1])[1] - screen([0,0,0])[1]);
  return { dim:screen(items[0].anchor), lower:[frame[0],frame[1] + 3 * pixelsPerMM] };
 });
 await toggle().uncheck(); await settle();
 const off = await f.page.screenshot({ scale:'css' });
 await show(ids);
 const on = await f.page.screenshot({ scale:'css' });
 await writeFile(join(f.output, 'baseline-off.png'), off);
 await writeFile(join(f.output, 'baseline-on.png'), on);
 const offPng = PNG.sync.read(off), onPng = PNG.sync.read(on);
 const region = ([x,y], l, r, top) => ({ left:Math.floor(x-l), right:Math.floor(x+r), top:Math.floor(y-top), bottom:Math.floor(y-3) });
 const overlapPoint = glyphPixel(offPng, onPng, region(dim, 10, 420, 62));
 const framePoint = glyphPixel(offPng, onPng, region(lower, 60, 62, 42));
 return { overlapPoint, framePoint, anchors:{ dim, lower } };
}

async function hit(pixel, expected, label, retained){
 const state=await read();
 assert.equal(await f.page.evaluate(([x,y])=>document.elementFromPoint(x,y)?.matches('canvas.vp-canvas'),pixel),true);
 await f.page.mouse.click(...pixel);await settle();
 const after=await read();
 f.report.observations.push({label,pixel,expected,before:state.pmi.selected,selected:after.pmi.selected,items:after.pmi.items.map(item=>item.id)});
 await f.persist();
 assert.equal(after.pmi.selected,expected,label);
 if(expected) assert.deepEqual(after.selection.selection.edges,[{body:0,edge:2}]);
 await f.same(retained);
 assert.equal(after.dirty,state.dirty);
 await f.snapshot(label);
}
async function removeOverlap(expectedIds){
 await button('Drawing').click();
 await f.page.getByRole('button',{name:/^Remove dimension 4×/}).first().click();
 const confirm=f.page.getByRole('group',{name:'Confirm drawing control removal',exact:true});
 await confirm.waitFor();
 await button('Remove annotation and controls').click();
 await f.page.waitForFunction(ids=>JSON.stringify(window.__studioDoc?.drawing?.dimensions?.map(d=>d.id))===JSON.stringify(ids),expectedIds);
 await button('Model').click();
 await f.ready();
}
await f.run(async()=>{
 await f.newPage();
 if (!webgpu) await f.page.goto(f.server.resolvedUrls.local[0] + '?renderer=webgl2');
 await f.page.locator(`.viewport[data-renderer="${webgpu ? 'webgpu' : 'webgl2'}"]`).waitFor();
 await f.ready();
 await f.openFile({name:'pmi-source-layout.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},seed.nodes.length);
 const original=await f.doc();
 assert.deepEqual(original.drawing.frames,[frame]);
 await button('Front').click();
 if(await button('Ortho').getAttribute('aria-pressed')!=='true') await button('Ortho').click();
 const ids = ['first','second','short','control-second'];
 await show(ids);
 const layout = await (webgpu ? gpuProbes(ids) : svgProbes());
 const { overlapPoint, framePoint } = layout;
 f.report.observations.push({ label:'composite-layout', ...layout });
 await f.snapshot('01-overlap-and-two-row-frame');
 f.phase='Pick both the overlap and the lower composite-frame row';
 await hit(overlapPoint,'first','02-overlap-first-source',original);
 await hit(framePoint,'control-second','03-lower-frame-cell',original);
 f.phase='Remove the first drawing source without moving the other displayed annotation';
 await removeOverlap(['second','short']);
 await show(['second','short','control-second']);
 const once=await f.doc();
 await hit(overlapPoint,'second','04-overlap-second-source-after-removal',once);
 f.phase='Remove the remaining overlapped dimension and its attached control';
 await removeOverlap(['short']);
 await show(['short']);
 const twice=await f.doc();
 assert.deepEqual(twice.drawing.frames??[],[]);
 assert.equal((await read()).pmi.selected,null,'Removed annotation selection retires before the next pointer event');
 await f.snapshot('05-current-render-before-old-coordinate');
 await hit(overlapPoint,null,'05-retired-overlap-misses',twice);
 await hit(framePoint,null,'06-retired-frame-cell-misses',twice);
 f.phase='Undo and Redo the drawing-source removal in Model';
 await f.undo();await f.same(once);await show(['second','short','control-second']);
 assert.equal((await read()).pmi.selected,null,'Undo restores the annotation without restoring old selection');
 await hit(framePoint,'control-second','07-restored-frame-cell',once);
 await f.redo();await f.same(twice);await show(['short']);
 await hit(framePoint,null,'08-redo-retires-frame-cell',twice);
 assert.deepEqual((await f.doc()).nodes,original.nodes);

 f.phase='Open another document that reuses the control ID';
 await f.undo();await f.same(once);
 await f.undo();await f.same(original);await show(ids);
 await hit(framePoint,'control-second','09-selected-in-original-document',original);
 const next = structuredClone(doc);
 next.drawing.title = 'Different saved drawing';
 next.drawing.frames[0].value = .24;
 await f.openFile({ name:'different-pmi-owner.bcad', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(next)) },next.nodes.length);
 await f.page.waitForFunction(() => window.__studioDoc?.drawing?.title === 'Different saved drawing');
 await show(ids);
 const state = await read();
 assert.deepEqual(state.pmi.items.find(item => item.id === 'control-second').text, ['Ø0.24','Ø0.1']);
 assert.equal(state.pmi.selected,null);
 assert.deepEqual(state.selection.selection.edges,[]);
 await f.snapshot('10-reused-id-has-fresh-owner');
 assert.equal(f.report.downloads.length,0);
});
