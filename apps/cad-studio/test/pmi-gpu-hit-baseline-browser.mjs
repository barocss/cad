// #268 exploratory WebGPU label-picking baseline. Raster observations, not a pick-span oracle.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const {PNG}=createRequire(join(process.env.PW_DIR,'package.json'))('playwright-core/lib/utilsBundle');
const pins=['apps/cad-studio/test/pmi-gpu-hit-baseline-browser.mjs','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/viewport/pmiGeometry.ts','apps/cad-studio/src/viewport/useWorkspacePreviews.ts'];
const f=await createFlow({name:'pmi-gpu-hit-baseline',output:process.argv[2],envFrozen:'PMI_GPU_HIT_BASELINE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Exploratory actual WebGPU raster-labelled candidate clicks. Selection outcomes are observations; root visual review must distinguish text glyphs from lines before asserting a defect.',
 limits:['One synthetic bracket front linear annotation, DPR 1, public Top/Ortho and two wheel zoom-out steps only.', 'Readonly native anchor locates a broad raster ROI; no product text width, hit predicate or internal state mutation is used. Blue difference candidates may include lines/heads; screenshots require independent visual adjudication.', 'Missing WebGPU is NOT_RUN, never fallback PASS. No implementation, PDF/DXF, issued identity or saved schema changes.'],
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
async function raster(label){
 await clear();const before=await read();assert.equal(before.pmi.selected,null);
 const anchor=await f.page.evaluate(()=>window.__studioScreenOf(window.__studioPmi().items[0].anchor));assert.ok(anchor?.length===2,'native anchor projects');
 const canvas=await f.page.locator('canvas.vp-canvas').boundingBox();assert.ok(canvas);
 // Wide ROI is independent of text length/height/world span and admits both sides of the anchor.
 const roi={left:Math.max(Math.ceil(canvas.x),Math.floor(anchor[0]-220)),right:Math.min(Math.floor(canvas.x+canvas.width)-1,Math.ceil(anchor[0]+220)),top:Math.max(Math.ceil(canvas.y),Math.floor(anchor[1]-28)),bottom:Math.min(Math.floor(canvas.y+canvas.height)-1,Math.ceil(anchor[1]+28))};
 await toggle().uncheck();await settle();const offBytes=await f.page.screenshot();await writeFile(join(f.output,label+'-off.png'),offBytes);
 await enable();const onBytes=await f.page.screenshot();await writeFile(join(f.output,label+'-on.png'),onBytes);
 assert.deepEqual((await read()).camera,before.camera,'toggle does not change camera');
 const off=PNG.sync.read(offBytes),on=PNG.sync.read(onBytes);assert.equal(on.width,off.width);assert.equal(on.height,off.height);
 const pixels=[];
 for(let y=roi.top;y<=roi.bottom;y++)for(let x=roi.left;x<=roi.right;x++){
  const k=(y*on.width+x)*4,r=on.data[k],g=on.data[k+1],b=on.data[k+2];
  const delta=Math.abs(r-off.data[k])+Math.abs(g-off.data[k+1])+Math.abs(b-off.data[k+2]);
  if(b>g+20&&g>r+20&&b>115&&delta>50)pixels.push({x,y,rgb:[r,g,b]});
 }
 // Describe occupied columns, including their vertical extent. Reject one-pixel-high columns
 // from click candidates, but do not equate the surviving candidates with certified glyphs.
 const columns=new Map();for(const p of pixels){const c=columns.get(p.x)??[];c.push(p);columns.set(p.x,c);}
 const eligible=[...columns].filter(([,ps])=>ps.length>=3&&ps.at(-1).y-ps[0].y>=3).sort((a,b)=>a[0]-b[0]);
 const picked=[];for(const fraction of [0,.25,.5,.75,1]){if(!eligible.length)break;const [,ps]=eligible[Math.round((eligible.length-1)*fraction)],p=ps[Math.floor(ps.length/2)];if(!picked.some(q=>q.x===p.x&&q.y===p.y))picked.push(p);}
 const observation={label,anchor,roi,changedBluePixels:pixels.length,columnCount:columns.size,eligibleColumns:eligible.length,blueBounds:pixels.length?{left:Math.min(...pixels.map(p=>p.x)),right:Math.max(...pixels.map(p=>p.x)),top:Math.min(...pixels.map(p=>p.y)),bottom:Math.max(...pixels.map(p=>p.y))}:null,candidates:picked,outcomes:[],classification:'UNADJUDICATED_RASTER_CANDIDATES'};
 f.report.observations.push(observation);await f.persist();
 await f.snapshot(label+'-visible');
 for(let i=0;i<picked.length;i++){
  await clear();const p=picked[i],stateBefore=await read();const actualTop=await f.page.evaluate(p=>!!document.elementFromPoint(p.x,p.y)?.closest('canvas.vp-canvas'),p);
  if(!actualTop){observation.outcomes.push({index:i,at:p,notRun:'candidate covered by non-canvas UI'});continue;}
  await f.page.mouse.click(p.x+.5,p.y+.5);await settle();const after=await read();
  observation.outcomes.push({index:i,at:p,expectedAnnotation:stateBefore.pmi.items[0].id,selected:after.pmi.selected,hit:after.pmi.selected===stateBefore.pmi.items[0].id,selection:after.selection});
  await f.same(accepted);assert.equal(after.dirty,stateBefore.dirty);assert.deepEqual(after.camera,stateBefore.camera);
  await f.snapshot(label+'-click-'+i);
 }
 await writeFile(join(f.output,label+'-raster-candidates.json'),JSON.stringify({observation,pixels},null,2));await f.persist();
}
await f.run(async()=>{
 f.phase='actual WebGPU qualification';
 try{await f.newPage({deviceScaleFactor:1});await f.page.locator('.viewport[data-renderer="webgpu"]').waitFor();}
 catch(error){f.report.observations.push({qualification:'NOT_RUN',reason:'Actual WebGPU viewport was unavailable; no fallback renderer is accepted.'});throw error;}
 assert.equal(await f.page.evaluate(()=>devicePixelRatio),1);
 f.phase='public Open synthetic bracket';await f.openFile({name:'pmi-gpu-hit.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},doc.nodes.length);accepted=await f.doc();assert.deepEqual(accepted.nodes,doc.nodes);assert.deepEqual(accepted.drawing.dimensions,doc.drawing.dimensions);await f.same(accepted);
 await button('Front').click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await enable();await f.snapshot('01-front-reference');
 await button('Top').click();await settle();
 for(let step=0;step<3;step++){
  f.phase='Top edge-on raster observation zoom '+step;
  if(step){const c=await f.page.locator('canvas.vp-canvas').boundingBox();await f.page.mouse.move(c.x+c.width*.5,c.y+c.height*.5);await f.page.mouse.wheel(0,400);await settle();}
  await raster('top-zoom-'+step);
 }
 await f.same(accepted);assert.equal(f.report.downloads.length,0);
 f.report.observations.push({conclusion:'OBSERVED_ONLY; root must visually adjudicate candidates before reporting a label miss',documentUnchanged:true,downloads:0});
});
