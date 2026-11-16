import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/test/pmi-svg-hit-browser.mjs','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/viewport/pmiGeometry.ts'];
const f=await createFlow({name:'pmi-svg-hit',output:process.argv[2],envFrozen:'PMI_SVG_HIT_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Actual WebGL2 SVG text bounding boxes select the authored annotation at label front, middle and end.',
 limits:['One bracket front linear annotation; no GPU hit behavior changed or certified. Outside click may perform ordinary model selection. No download.'],
 snapshotExtra:()=>({pmi:window.__studioPmi?.(),dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),dpr:devicePixelRatio})});
const seed=JSON.parse(await readFile('apps/cad-studio/test/fixtures/bracket.bcad','utf8'));
const end=x=>({edge:'n1.side0|n1.top',at:'end',near:[x,0,6]});
const doc={...seed,drawing:{sheet:'A3',projection:'third',hidden:true,scale:2,views:['front','top','right'],notes:[],dimensions:[{id:'frontwidth',kind:'linear',view:'front',a:end(0),b:end(30),orient:'horizontal',place:[15,13],count:4,tol:{kind:'symmetric',value:.1234}}]}};
const button=name=>f.page.getByRole('button',{name,exact:true});
const toggle=()=>f.page.getByLabel('3D annotations',{exact:true});
const settle=()=>f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
let acceptedDoc;
const state=()=>f.page.evaluate(()=>({pmi:window.__studioPmi(),selection:window.__studioSelection,dirty:!!document.querySelector('[aria-label="Unsaved changes"]')}));
async function open(value){
 await f.openFile({name:'pmi-svg-hit.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))},value.nodes.length);
 const accepted=await f.doc();assert.deepEqual(accepted.nodes,value.nodes);assert.deepEqual(accepted.drawing.dimensions,value.drawing.dimensions);
 for(const key of ['projection','scale','units','dual','views','hidden'])assert.deepEqual(accepted.drawing[key],value.drawing[key],key);
 assert.deepEqual(accepted.drawing.notes??[],value.drawing.notes??[]);acceptedDoc=accepted;await f.same(acceptedDoc);
}
async function enable(){await toggle().check();await f.page.waitForFunction(()=>window.__studioPmi()?.items?.length===1);await f.page.locator('svg.pmi text.pmi-text').first().waitFor();await settle();}
async function clearPmi(){await toggle().uncheck();await f.page.waitForFunction(()=>window.__studioPmi().selected===null);await enable();}
async function box(){return f.page.locator('svg.pmi text.pmi-text').first().evaluate(t=>{const b=t.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,text:t.textContent,id:t.getAttribute('data-annotation-id')??t.getAttribute('data-pmi-id')};});}
async function hit(label,fraction,expectHit=true){
 await clearPmi();const b=await box(),before=await state();assert.ok(b.width>10&&b.height>0,JSON.stringify(b));
 const at={x:b.x+b.width*fraction,y:b.y+b.height*.5};await f.page.mouse.click(at.x,at.y);await settle();const after=await state();
 const id=before.pmi.items[0].id;f.report.observations.push({label,bbox:b,at,expected:id,selected:after.pmi.selected});
 assert.equal(after.pmi.selected===id,expectHit,label);await f.same(acceptedDoc);assert.equal(after.dirty,before.dirty);
 return after.selection;
}
await f.run(async()=>{
 for(const dpr of [1,2]){
  f.phase=`DPR ${dpr} forced WebGL2`;await f.newPage({deviceScaleFactor:dpr});await f.page.goto(f.server.resolvedUrls.local[0]+'?renderer=webgl2');await f.page.locator('.viewport[data-renderer="webgl2"]').waitFor();await f.ready();await open(doc);
  await button('Front').click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await enable();
  const original=await f.snapshot(`${dpr}-01-visible`);
  const selected=await hit(`${dpr} front`,.03);assert.deepEqual(await hit(`${dpr} middle`,.5),selected);assert.deepEqual(await hit(`${dpr} end`,.97),selected);await f.snapshot(`${dpr}-02-source-selected`);
  await clearPmi();const b=await box(),outside={x:b.x+b.width+25,y:b.y+b.height*.5};await f.page.mouse.click(outside.x,outside.y);await settle();assert.equal((await state()).pmi.selected,null);await f.same(acceptedDoc);
  await f.snapshot(`${dpr}-02-selected-bounds`);
  const canvas=await f.page.locator('canvas.vp-canvas').boundingBox();assert.ok(canvas);await f.page.mouse.move(canvas.x+canvas.width*.5,canvas.y+canvas.height*.5);await f.page.mouse.wheel(0,-180);await settle();await hit(`${dpr} zoom end`,.97);
  await f.page.setViewportSize({width:1024,height:800});await settle();await hit(`${dpr} resized front`,.03);await hit(`${dpr} resized end`,.97);await f.snapshot(`${dpr}-03-resized`);
  const last=await box();await toggle().uncheck();await settle();assert.equal(await f.page.locator('svg.pmi text.pmi-text').count(),0);await f.page.mouse.click(last.x+last.width*.97,last.y+last.height*.5);await settle();assert.equal((await state()).pmi.selected,null);await f.same(acceptedDoc);
  const plain={...seed,drawing:{...doc.drawing,dimensions:[]}};await open(plain);await toggle().check();await settle();assert.equal(await f.page.locator('svg.pmi text.pmi-text').count(),0);await f.page.mouse.click(last.x+last.width*.97,last.y+last.height*.5);await settle();assert.equal((await state()).pmi.selected,null);await f.same(acceptedDoc);
  await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await settle();assert.equal(await f.page.locator('svg.pmi text.pmi-text').count(),0);assert.equal((await state()).pmi.selected,null);await f.snapshot(`${dpr}-04-new-no-stale-label`);
  f.report.observations.push({dpr,initialDirty:original.dirty,sourceSelectionRepeatedExactly:true});
 }
});
