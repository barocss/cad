// #268 test-only first-Top-click public provider trace; regression source remains unchanged.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createFlow} from './flow-helper.mjs';
const {PNG}=createRequire(join(process.env.PW_DIR,'package.json'))('playwright-core/lib/utilsBundle');
const pins=['apps/cad-studio/test/pmi-gpu-hit-diagnostic-browser.mjs','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/viewport/pmiGeometry.ts','apps/cad-studio/src/viewport/useWorkspacePreviews.ts','packages/barocss-gpu/src/viewer/viewer.ts'];
const f=await createFlow({name:'pmi-gpu-hit-diagnostic',output:process.argv[2],envFrozen:'PMI_GPU_HIT_DIAGNOSTIC_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Test-only synchronous public provider/requestRender wrappers diagnose the first Top glyph click; not a regression pass or timing certification.',
 limits:['One synthetic bracket label 4× 30 ±0.1234, DPR 1 Front control and first Top click only. Test-only instance observers add synchronous logging overhead; not timing-equivalent certification.', 'Unclassifiable raster or unavailable WebGPU is NOT_RUN, never fallback PASS. GPU-provider internals and product pick formulas are not used as the selection oracle.', 'No Save/fresh-context reopen or geometry edits. Only the initial accepted Open is preserved. General fonts, arbitrary camera/coordinates, overlapping labels and multi-line actual UI are NOT_RUN.'],
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
  if(view==='Top')return p.css;
  assert.equal(after.pmi.selected,'frontwidth','Front control glyph selects its annotation');
 }
 // A clear background point lies outside the observed label region and model in this fixture.
 await clear();const outside=[Math.min(canvas.x+canvas.width-30,cssRoi.right),Math.max(canvas.y+35,cssRoi.top-50)];await f.page.mouse.click(...outside);await settle();assert.equal((await read()).pmi.selected,null);await f.same(accepted);
 await toggle().uncheck();await settle();const last=candidates.at(-1);await f.page.mouse.click(...last.css);await settle();assert.equal((await read()).pmi.selected,null,'hidden annotation cannot be selected at old glyph');await f.same(accepted);
 record.hiddenAtOldGlyphNoHit=true;record.backgroundNoHit=true;await f.persist();return last.css;
}
async function open(value){await f.openFile({name:'pmi-gpu-hit.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))},value.nodes.length);accepted=await f.doc();assert.deepEqual(accepted.nodes,value.nodes);assert.deepEqual(accepted.drawing.dimensions,value.drawing.dimensions);await f.same(accepted);}
async function installDiagnostic(){
 const result=await f.page.evaluate(()=>{
  const installation=window.__pmiDiagnosticInstall={stage:'validate-exact-live-instance',source:'existing readonly __studioViewer hook',stages:[]};
  const stage=name=>{installation.stage=name;installation.stages.push(name);};
  const viewer=window.__studioViewer;
  if(!viewer||typeof viewer.labelGlyphBounds!=='function'||typeof viewer.requestRender!=='function')throw Error('NOT_RUN: exact live Viewer public methods unavailable');
  const descriptors={bounds:Object.getOwnPropertyDescriptor(viewer,'labelGlyphBounds'),request:Object.getOwnPropertyDescriptor(viewer,'requestRender')};
  for(const d of Object.values(descriptors))if(d&&!d.configurable)throw Error('NOT_RUN: public instance descriptor cannot be safely restored');
  if(!Object.isExtensible(viewer)&&Object.values(descriptors).some(d=>!d))throw Error('NOT_RUN: live instance does not admit a temporary public method observer');
  const originals={bounds:viewer.labelGlyphBounds,request:viewer.requestRender};
  const provenance={instance:'exact existing __studioViewer',constructor:viewer.constructor?.name,sourcePaths:['apps/cad-studio/src/viewport/gpuRenderer.ts','packages/barocss-gpu/src/viewer/viewer.ts'],sourceHashes:'source-frozen.json capsule',noModuleImports:true,wrappers:'Reflect.apply(original,this,args) once; identical synchronous return/reference; rethrow original; no extra provider/render calls'};
  const logs=[],epochs=new WeakMap();let epochSerial=0,overflow=0;const record=e=>{if(logs.length<10000)logs.push({...e,sequence:logs.length});else overflow++;};
  const observe=make=>{try{record(make());}catch{overflow++;}};
  const snapshot=r=>r===null?null:r===undefined?'undefined':{epoch:r.epoch&&typeof r.epoch==='object'?(epochs.has(r.epoch)?epochs.get(r.epoch):(epochs.set(r.epoch,++epochSerial),epochSerial)):null,bounds:r.bounds?.map(b=>({labelIndex:b.labelIndex,rects:b.rects.map(rect=>({...rect}))}))};
  function bounds(...args){let result;try{result=Reflect.apply(originals.bounds,this,args);}catch(error){observe(()=>({method:'Viewer.labelGlyphBounds',liveViewer:this===viewer,threw:String(error)}));throw error;}observe(()=>({method:'Viewer.labelGlyphBounds',liveViewer:this===viewer,meshName:args[0]?.name,result:snapshot(result)}));return result;}
  function request(...args){let stack;try{stack=new Error('requestRender observer').stack;}catch{/* observation never replaces API behavior */}let result;try{result=Reflect.apply(originals.request,this,args);}catch(error){observe(()=>({method:'Viewer.requestRender',liveViewer:this===viewer,stack,threw:String(error)}));throw error;}observe(()=>({method:'Viewer.requestRender',liveViewer:this===viewer,stack}));return result;}
  const installed={bounds:false,request:false};
  window.__pmiDiagnostic={provenance,read:()=>({provenance,logs:[...logs],overflow}),restore(){const restored={};for(const [key,name,wrapper] of [['bounds','labelGlyphBounds',bounds],['request','requestRender',request]]){if(!installed[key]){restored[key]=true;continue;}if(Object.getOwnPropertyDescriptor(viewer,name)?.value!==wrapper){restored[key]=false;continue;}if(descriptors[key])Object.defineProperty(viewer,name,descriptors[key]);else delete viewer[name];const after=Object.getOwnPropertyDescriptor(viewer,name);restored[key]=descriptors[key]?after?.value===descriptors[key].value&&after?.get===descriptors[key].get&&after?.set===descriptors[key].set&&after?.writable===descriptors[key].writable&&after?.enumerable===descriptors[key].enumerable&&after?.configurable===descriptors[key].configurable:after===undefined;}return restored;}};
  stage('install-bounds-instance-observer');Object.defineProperty(viewer,'labelGlyphBounds',{value:bounds,writable:true,configurable:true,enumerable:descriptors.bounds?.enumerable??false});installed.bounds=true;
  stage('install-request-instance-observer');Object.defineProperty(viewer,'requestRender',{value:request,writable:true,configurable:true,enumerable:descriptors.request?.enumerable??false});installed.request=true;
  stage('installed');return provenance;
 });f.report.observations.push({diagnosticInstalled:result});await f.persist();
}
await f.run(async()=>{
 let initialError=null,cleanupError=null;
 try{
  f.phase='actual WebGPU diagnostic qualification';await f.newPage({deviceScaleFactor:1});await f.page.locator('.viewport[data-renderer="webgpu"]').waitFor();await open(doc);
  await button('Front').click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await enable();
  f.phase='Front control before instrumentation';await raster('diagnostic-front','Front',1);
  f.phase='install public API observers';await installDiagnostic();
  f.phase='first Top glyph diagnostic';await button('Top').click();await settle();await raster('diagnostic-top','Top',1);await f.same(accepted);
 }catch(error){
  initialError=error;f.report.initialException={phase:f.phase,error:error?.stack??String(error)};
  try{await writeFile(join(f.output,'initial-exception.json'),JSON.stringify(f.report.initialException,null,2));await f.persist();}catch(recordError){f.report.initialExceptionRecordError=String(recordError);}
 }finally{
  try{
   if(f.page&&!f.page.isClosed()){
    const trace=await f.page.evaluate(()=>{const installation=window.__pmiDiagnosticInstall??null,d=window.__pmiDiagnostic;let result={status:'NOT_INSTALLED',installation};if(d){result={...d.read(),installation};result.restored=d.restore();delete window.__pmiDiagnostic;}delete window.__pmiDiagnosticInstall;return result;});
    const calls={bounds:trace.logs?.filter(x=>x.method==='Viewer.labelGlyphBounds'&&x.liveViewer).length??0,request:trace.logs?.filter(x=>x.method==='Viewer.requestRender'&&x.liveViewer).length??0};
    const complete=Object.values(calls).every(n=>n>0);trace.qualification=complete?'DIAGNOSTIC_OBSERVED':'NOT_RUN_INCOMPLETE_PUBLIC_TRACE';trace.callCounts=calls;
    await writeFile(join(f.output,'public-provider-trace.json'),JSON.stringify(trace,null,2));f.report.observations.push({diagnosticTrace:'public-provider-trace.json',qualification:trace.qualification,calls,overflow:trace.overflow??0,restored:trace.restored??null});await f.persist();
    assert.ok(complete,'NOT_RUN: missing live public provider/requestRender calls; retained partial trace is not complete qualification');
    assert.ok(Object.values(trace.restored).every(Boolean),'all installed instance descriptors restored');
   }
  }catch(error){cleanupError=error;f.report.diagnosticFinalizationException={error:error?.stack??String(error),suppressedByInitialError:!!initialError};try{await f.persist();}catch{/* retain first error */}}
 }
 if(initialError)throw initialError;if(cleanupError)throw cleanupError;
});
