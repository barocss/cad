// #268 WebGPU label-picking regression. Actual raster glyph pixels, not a product pick-span oracle.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const {PNG}=createRequire(join(process.env.PW_DIR,'package.json'))('playwright-core/lib/utilsBundle');
const pins=['apps/cad-studio/test/pmi-gpu-hit-browser.mjs','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/viewport/pmiGeometry.ts','apps/cad-studio/src/viewport/useWorkspacePreviews.ts'];
const f=await createFlow({name:'pmi-gpu-hit',output:process.argv[2],envFrozen:'PMI_GPU_HIT_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Actual WebGPU authored label glyph clicks, independently located from on/off PNG differences in the visually reviewed synthetic label region.',
 limits:['One synthetic bracket label 4× 30 ±0.1234, Front planar and Top facing, DPR 1/2 and two public zoom-out steps. Raster segmentation is scoped to the manually reviewed isolated label region, not general OCR.', 'Unclassifiable raster or unavailable WebGPU is NOT_RUN, never fallback PASS. GPU-provider internals and product pick formulas are not used as the selection oracle.', 'No native Save or geometry edits; fresh file Open checks accepted document equality. General fonts, arbitrary camera/coordinates, overlapping labels and multi-line actual UI are NOT_RUN.'],
 snapshotExtra:()=>({pmi:window.__studioPmi?.(),camera:window.__studioCamera?.(),dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),dpr:devicePixelRatio})});
const seed=JSON.parse(await readFile('apps/cad-studio/test/fixtures/bracket.bcad','utf8'));
const end=x=>({edge:'n1.side0|n1.top',at:'end',near:[x,0,6]});
const doc={...seed,drawing:{sheet:'A3',projection:'third',hidden:true,scale:2,views:['front','top','right'],notes:[],dimensions:[{id:'frontwidth',kind:'linear',view:'front',a:end(0),b:end(30),orient:'horizontal',place:[15,13],count:4,tol:{kind:'symmetric',value:.1234}}]}};
const button=name=>f.page.getByRole('button',{name,exact:true});
const toggle=()=>f.page.getByLabel('3D annotations',{exact:true});
const settle=async()=>{await f.page.waitForTimeout(350);await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));};
const read=()=>f.page.evaluate(()=>({pmi:window.__studioPmi?.(),camera:window.__studioCamera?.(),selection:window.__studioSelection,dirty:!!document.querySelector('[aria-label="Unsaved changes"]')}));
let accepted;
async function enable(){await toggle().check();await f.page.waitForFunction(()=>window.__studioPmi?.()?.items?.length===1&&!window.__studioPmi().busy);await settle();}
async function clear(){await toggle().uncheck();await f.page.waitForFunction(()=>window.__studioPmi?.()?.selected===null);await enable();}
// Segment actual changed blue raster pixels. The classifier does not use product glyph/layout bounds.
function classify(off,on,roi,dpr){
 const pixels=new Map();for(let y=roi.top;y<=roi.bottom;y++)for(let x=roi.left;x<=roi.right;x++){
  const k=(y*on.width+x)*4,r=on.data[k],g=on.data[k+1],b=on.data[k+2],delta=Math.abs(r-off.data[k])+Math.abs(g-off.data[k+1])+Math.abs(b-off.data[k+2]);
  if(b>g+20&&g>r+20&&b>115&&delta>50)pixels.set(y*on.width+x,{x,y,rgb:[r,g,b]});
 }
 const unseen=new Set(pixels.keys()),components=[];
 while(unseen.size){const start=unseen.values().next().value;unseen.delete(start);const todo=[start],ps=[];
  while(todo.length){const key=todo.pop(),p=pixels.get(key);ps.push(p);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=p.x+dx,yy=p.y+dy,n=yy*on.width+xx;if(xx>=roi.left&&xx<=roi.right&&yy>=roi.top&&yy<=roi.bottom&&unseen.delete(n))todo.push(n);}}
  const left=Math.min(...ps.map(p=>p.x)),right=Math.max(...ps.map(p=>p.x)),top=Math.min(...ps.map(p=>p.y)),bottom=Math.max(...ps.map(p=>p.y)),width=(right-left+1)/dpr,height=(bottom-top+1)/dpr;
  components.push({left,right,top,bottom,width,height,area:ps.length/(dpr*dpr),pixels:ps});
 }
 const glyphs=components.filter(c=>c.width>=2&&c.height>=3&&c.width<=60&&c.height<=70&&c.width/c.height>=.18&&c.width/c.height<=8&&c.area>=6).sort((a,b)=>a.left-b.left);
 return {pixels:pixels.size,bluePixels:[...pixels.values()],components,glyphs};
}
async function raster(label,view,dpr){
 await clear();const before=await read();assert.equal(before.pmi.selected,null);assert.deepEqual(before.pmi.items[0].text,['4× 30 ±0.1234']);
 const anchor=await f.page.evaluate(()=>window.__studioScreenOf(window.__studioPmi().items[0].anchor));assert.ok(anchor?.length===2);
 const canvas=await f.page.locator('canvas.vp-canvas').boundingBox();assert.ok(canvas);
 // Anchor locates the reviewed label region only. No width/height is calculated from font metrics or pick spans.
 const cssRoi={left:Math.max(canvas.x,anchor[0]-10),right:Math.min(canvas.x+canvas.width-1,anchor[0]+650),top:Math.max(canvas.y,anchor[1]-(view==='Front'?90:28)),bottom:Math.min(canvas.y+canvas.height-1,anchor[1]-2)};
 const roi={left:Math.ceil(cssRoi.left*dpr),right:Math.floor(cssRoi.right*dpr),top:Math.ceil(cssRoi.top*dpr),bottom:Math.floor(cssRoi.bottom*dpr)};
 await toggle().uncheck();await settle();const offBytes=await f.page.screenshot({scale:'device'});await writeFile(join(f.output,label+'-off.png'),offBytes);
 await enable();const onBytes=await f.page.screenshot({scale:'device'});await writeFile(join(f.output,label+'-on.png'),onBytes);
 assert.deepEqual((await read()).camera,before.camera);const off=PNG.sync.read(offBytes),on=PNG.sync.read(onBytes);assert.equal(on.width,off.width);assert.equal(on.height,off.height);assert.equal(on.width,1440*dpr);
 const {pixels,bluePixels,components,glyphs}=classify(off,on,roi,dpr);const span=glyphs.length?(glyphs.at(-1).right-glyphs[0].left+1)/dpr:0;
 const classified=glyphs.length>=6&&span>=(view==='Top'?65:100)&&span<=(view==='Top'?140:550);
 const record={label,view,dpr,anchor,cssRoi,roi,changedBluePixels:pixels,components:components.map(({pixels,...c})=>c),eligibleGlyphComponents:glyphs.length,span,classification:classified?'REVIEWED_SYNTHETIC_GLYPH_REGION':'NOT_RUN_UNCLASSIFIED_RASTER',outcomes:[]};f.report.observations.push(record);await f.persist();
 assert.ok(classified,'NOT_RUN: raster did not satisfy reviewed glyph-region classifier; do not classify as product miss');
 const candidates=[glyphs[0],glyphs[Math.floor(glyphs.length/2)],glyphs.at(-1)].map(c=>{const cx=(c.left+c.right)/2,cy=(c.top+c.bottom)/2;const p=c.pixels.reduce((a,b)=>Math.hypot(a.x-cx,a.y-cy)<=Math.hypot(b.x-cx,b.y-cy)?a:b);return {...p,css:[(p.x+.5)/dpr,(p.y+.5)/dpr]};});
 // Retain the baseline's five occupied-column quantile probes for DPR1 Top.
 // Threshold, minimum population and vertical extent are unchanged; the reviewed above-anchor
 // band excludes the dimension line. Only run after glyph-region classification succeeds.
 if(dpr===1&&view==='Top'){
  const columns=new Map();for(const p of bluePixels){const c=columns.get(p.x)??[];c.push(p);columns.set(p.x,c);}
  const eligible=[...columns].filter(([,ps])=>ps.length>=3&&ps.at(-1).y-ps[0].y>=3).sort((a,b)=>a[0]-b[0]);
  assert.ok(eligible.length>=5,'baseline quantile columns remain visible');
  const probes=[];for(const fraction of [0,.25,.5,.75,1]){const [,ps]=eligible[Math.round((eligible.length-1)*fraction)],p=ps[Math.floor(ps.length/2)];probes.push({...p,css:[p.x+.5,p.y+.5],origin:'baseline-column-quantile',fraction});}
  record.baselineQuantileProbes=probes;candidates.push(...probes);
 }
 await f.snapshot(label+'-visible');
 for(let i=0;i<candidates.length;i++){
  await clear();const p=candidates[i],stateBefore=await read();assert.equal(await f.page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('canvas.vp-canvas'),p.css),true,'candidate is exposed canvas');
  await f.page.mouse.click(...p.css);await settle();const after=await read();record.outcomes.push({index:i,pixel:p,expected:'frontwidth',selected:after.pmi.selected,selection:after.selection});await f.persist();
  await f.same(accepted);assert.equal(after.dirty,stateBefore.dirty);assert.deepEqual(after.camera,stateBefore.camera);await f.snapshot(label+'-click-'+i);
  assert.equal(after.pmi.selected,'frontwidth','actual reviewed glyph pixel selects its annotation');
 }
 // A clear background point lies outside the observed label region and model in this fixture.
 await clear();const outside=[Math.min(canvas.x+canvas.width-30,cssRoi.right),Math.max(canvas.y+35,cssRoi.top-50)];await f.page.mouse.click(...outside);await settle();assert.equal((await read()).pmi.selected,null);await f.same(accepted);
 await toggle().uncheck();await settle();const last=candidates.at(-1);await f.page.mouse.click(...last.css);await settle();assert.equal((await read()).pmi.selected,null,'hidden annotation cannot be selected at old glyph');await f.same(accepted);
 record.hiddenAtOldGlyphNoHit=true;record.backgroundNoHit=true;await f.persist();return last.css;
}
async function open(value){await f.openFile({name:'pmi-gpu-hit.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))},value.nodes.length);accepted=await f.doc();assert.deepEqual(accepted.nodes,value.nodes);assert.deepEqual(accepted.drawing.dimensions,value.drawing.dimensions);await f.same(accepted);}
await f.run(async()=>{
 for(const dpr of [1,2]){
  f.phase='actual WebGPU DPR '+dpr;try{await f.newPage({deviceScaleFactor:dpr});await f.page.locator('.viewport[data-renderer="webgpu"]').waitFor();}catch(error){f.report.observations.push({qualification:'NOT_RUN',dpr,reason:'Actual WebGPU unavailable; fallback forbidden'});throw error;}
  assert.equal(await f.page.evaluate(()=>devicePixelRatio),dpr);await open(doc);const original=structuredClone(accepted);
  await button('Front').click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await enable();f.phase='Front planar DPR '+dpr;await raster('dpr-'+dpr+'-front','Front',dpr);
  await button('Top').click();await settle();let last;
  for(let zoom=0;zoom<3;zoom++){f.phase='Top facing DPR '+dpr+' zoom '+zoom;if(zoom){const c=await f.page.locator('canvas.vp-canvas').boundingBox();await f.page.mouse.move(c.x+c.width*.5,c.y+c.height*.5);await f.page.mouse.wheel(0,400);await settle();}last=await raster('dpr-'+dpr+'-top-'+zoom,'Top',dpr);}
  f.phase='empty labels and fresh source Open DPR '+dpr;await open({...doc,drawing:{...doc.drawing,dimensions:[]}});await toggle().check();await f.page.waitForFunction(()=>window.__studioPmi?.()?.items?.length===0);await f.page.mouse.click(...last);await settle();assert.equal((await read()).pmi.selected,null);await f.same(accepted);
  // New context proves the accepted original source reopens unchanged; no Save semantics claimed.
  await f.newPage({deviceScaleFactor:dpr});await open(original);assert.deepEqual(accepted,original);await enable();assert.equal((await read()).pmi.items[0].id,'frontwidth');await f.same(original);await f.snapshot('dpr-'+dpr+'-fresh-open');
 }
 assert.equal(f.report.downloads.length,0);
});
