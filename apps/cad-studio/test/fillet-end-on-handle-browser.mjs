import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const nearTransition=process.argv.includes('--near-transition');
const perspective=process.argv.includes('--perspective');
const twoEdges=process.argv.includes('--two-edges');
assert.ok(!perspective || (!baseline && !nearTransition), 'Perspective is a separate run');
assert.ok(!twoEdges || (!baseline && !nearTransition && !perspective), 'Two edges use an orthographic run');
const pins=['apps/cad-studio/src/viewport/scalarHandleDrag.ts','apps/cad-studio/src/viewport/useCommandGizmos.ts','apps/cad-studio/test/fillet-end-on-handle-browser.mjs','apps/cad-studio/src/viewport/gizmo.ts','apps/cad-studio/src/viewport/viewportPointerInput.ts','packages/barocss-cad-model/src/app/commands.ts'];
const f=await createFlow({name:'fillet-end-on-handle',output:process.argv[2],envFrozen:'FILLET_END_ON_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:nearTransition?'Observe identical short pointer drags across the near-end-on 4px projection boundary':`Drag a new ${twoEdges?'shared two-edge':'single-edge'} Fillet radius in the ${perspective?'perspective':'orthographic'} view`,limits:['One new Fillet on a 40×30×10 rectangular solid. Two-edge mode selects two opposite parallel top edges with the actual mouse. Camera changes use actual right-button orbit. No runtime handler calls or synthetic state writes. History, curved and intersecting edges, and command replacement during a held pointer are outside these runs. The regular modes exercise two zooms. --near-transition instead measures 3.8/4.2px orthographic axes and identical upward 8px drags with geometric increase pointing down.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {brepMassProperties,checkBrep,evaluateSurface} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), [{key,brep}]=partBreps(doc);
const midpoints=doc.nodes[2].kind==='chamfer'?[]:brep.faces.filter(f=>f.name?.startsWith('n2.face')).map(f=>{const s=f.surface;if(s.kind!=='surface')throw Error('Expected native surface');return evaluateSurface(s,(s.knotsU[s.degreeU]+s.knotsU[s.controlPoints.length])/2,(s.knotsV[s.degreeV]+s.knotsV[s.controlPoints[0].length])/2);});
console.log(JSON.stringify({key,midpoints,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true}),vertices:brep.vertices.map(v=>v.point)}));
`,oracleSource:`
import json,sys,math
d=json.load(sys.stdin);n=d['native'];w=d['width'];h=d['height'];depth=d['depth'];c=d['radius']
targets=[(0,1),(depth,-1)] if d['twoEdges'] else [(0,1)]
expected=w*depth*h-len(targets)*w*c*c*(.5 if d['chamfer'] else 1-math.pi/4)
assert n['check']['valid'],n['check']['issues']
assert abs(n['volume']-expected)<1e-7,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<1e-7
for y,sign in targets:
 for x in [0,w]:
  for p in [(x,y,h-c),(x,y+sign*c,h)]:
   assert any(math.dist(p,q)<1e-9 for q in n['vertices']),p
  assert not any(math.dist((x,y,h),q)<1e-9 for q in n['vertices'])
 q=c*(1-1/math.sqrt(2))
 if not d['chamfer']: assert any(math.dist((w/2,y+sign*q,h-q),p)<1e-7 for p in n['midpoints']),n['midpoints']
print(json.dumps({'status':'PASS','expectedVolume':expected,'nativeVolume':n['volume'],'workerVolume':d['workerVolume']}))
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=name=>f.page.getByRole('button',{name,exact:true});
const radius=()=>f.page.getByRole('dialog',{name:'Fillet',exact:true}).getByLabel('Radius',{exact:true});
async function orbit(yaw,pitch){
 for(let i=0;i<3;i++){const c=await f.page.evaluate(()=>window.__studioCamera());const dx=(c.yaw-yaw)/.008,dy=(pitch-c.pitch)/.008;if(Math.hypot(dx,dy)<.05)break;const r=await f.page.locator('.vp-canvas').boundingBox();const x=r.x+r.width*.55,y=r.y+r.height*.55;await f.page.mouse.move(x,y);await f.page.mouse.down({button:'right'});await f.page.mouse.move(x+dx,y+dy,{steps:12});await f.page.mouse.up({button:'right'});}
 const c=await f.page.evaluate(()=>window.__studioCamera());assert.ok(Math.abs(c.yaw-yaw)<.003&&Math.abs(c.pitch-pitch)<.003,JSON.stringify(c));return c;
}
async function frameSource(){
 await button('Iso').click();
 const ortho=button('Ortho');
 if((await ortho.getAttribute('aria-pressed')==='true')===perspective)await ortho.click();
 await f.page.getByTitle('Frame all (F)',{exact:true}).click();
}
async function aimEndOn(){
 let yaw=-Math.PI/2,pitch=Math.PI/4;
 if(perspective){
  const {target,distance}=await f.page.evaluate(()=>window.__studioCamera());
  const [x,y,z]=[20,0,10].map((value,i)=>value-target[i]);
  const along=(-y+z)*Math.SQRT1_2;
  // Intersect the outward radius line with the orbit sphere around the current target.
  const travel=Math.sqrt(distance**2+along**2-x*x-y*y-z*z)-along;
  assert.ok(travel>10,'camera intersection must lie beyond the edge and handle');
  yaw=Math.atan2(y-travel*Math.SQRT1_2,x);
  pitch=Math.asin((z+travel*Math.SQRT1_2)/distance);
 }
 const camera=await orbit(yaw,pitch);
 assert.equal(camera.ortho,!perspective);
 await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 return camera;
}
async function endOnProjection(){
 const projection=await f.page.evaluate(()=>{
  const a=window.__studioScreenOf([20,0,10]),b=window.__studioScreenOf([20,-10,20]);
  return {a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1])};
 });
 assert.ok(projection.length<1,`End-on radius line must project to under 1 px: ${JSON.stringify(projection)}`);
 return projection;
}
async function handle(){return f.page.evaluate(()=>{const g=document.querySelector('g.gizmo-handle[data-handle="radius"]'),c=g?.querySelector('circle');if(!c)return null;const r=c.getBoundingClientRect();return {root:[r.x+r.width/2,r.y+r.height/2],html:g.outerHTML};});}
const dialog=()=>f.page.getByRole('dialog',{name:'Fillet',exact:true});
async function preview(){await f.page.locator('.hud .status').filter({hasText:/^preview$/}).waitFor();}
async function cancel(){await dialog().getByRole('button',{name:'Cancel',exact:true}).click();await f.same(source);}
async function apply(){await dialog().getByRole('button',{name:'Apply',exact:true}).click();await f.changed(source);await f.ready();}
async function dragUp(pixels,zoomWhileHeld=false){
 const start=Number(await radius().inputValue());
 const metric=await f.page.evaluate(radius=>{
  const canvas=document.querySelector('.vp-canvas');
  const {target,distance,yaw,pitch,fovY,ortho}=window.__studioCamera();
  const horizon=Math.cos(pitch);
  const outward=[horizon*Math.cos(yaw),horizon*Math.sin(yaw),Math.sin(pitch)];
  const anchor=[20,-radius*Math.SQRT1_2,10+radius*Math.SQRT1_2];
  const depth=ortho?distance:distance+anchor.reduce((sum,coordinate,i)=>sum+(target[i]-coordinate)*outward[i],0);
  return {depth,perMm:canvas.clientHeight/(2*depth*Math.tan(fovY/2)),snap:Number(localStorage.getItem('studio.snap')??'1')};
 },start);
 const step=.5*(metric.snap||.01);
 const expected=Math.round((start+pixels/metric.perMm)/step)*step;
 const h=await handle();assert.ok(h);
 await f.page.mouse.move(...h.root);await f.page.mouse.down();
 await f.page.mouse.move(h.root[0],h.root[1]-pixels,{steps:5});
 assert.match(await f.page.locator('.gizmo-readout').textContent(),/Radius/i);
 const value=Number(await radius().inputValue());
 assert.ok(Math.abs(value-expected)<1e-9,JSON.stringify({value,expected,metric,pixels}));
 f.report.observations.push({label:'independent-screen-scale-oracle',value,expected,metric,pixels});
 if(zoomWhileHeld){
  if(perspective || twoEdges)await f.snapshot(twoEdges?'two-edges-radius-held':'perspective-radius-held');
  await f.page.mouse.wheel(0,-120);await f.page.waitForTimeout(200);
  assert.equal(Number(await radius().inputValue()),value,'wheel during pointer hold does not alter captured value');
  await f.page.mouse.move(h.root[0],h.root[1]-pixels-1);
  await f.page.mouse.move(h.root[0],h.root[1]-pixels);
  assert.equal(Number(await radius().inputValue()),value,'same pointer displacement after wheel uses the frozen coefficient');
  f.report.observations.push({label:'zoom-during-held-pointer',pixels,value,frozenCoefficient:true});
 }
 await f.page.mouse.up();
 assert.equal(Number(await radius().inputValue()),value,'release preserves captured value');
 await f.same(source);return value;
}
async function pickFilletEdges(){
 const canvas=await f.page.locator('.vp-canvas').boundingBox();await f.page.mouse.click(canvas.x+8,canvas.y+8);
 const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();
 assert.match(await filter.innerText(),/Edges/);
 await f.worldClick([20,0,10]);
 await f.page.waitForFunction(()=>window.__studioSelection?.selection?.edges?.length===1);
 if(twoEdges){
  await f.page.keyboard.down('Shift');
  try{await f.worldClick([20,30,10]);}finally{await f.page.keyboard.up('Shift');}
  await f.page.waitForFunction(()=>window.__studioSelection?.selection?.edges?.length===2);
  const closeChat=button('Close chat');
  if(await closeChat.isVisible())await closeChat.click();
  await f.page.waitForFunction(()=>window.__studioSelection?.selection?.edges?.length===2);
 }
}
async function startFillet(){
 await pickFilletEdges();
 await f.command('Fillet');await radius().waitFor();await radius().fill('2');await preview();
 if(twoEdges){
  await dialog().getByText('Picked native edges',{exact:true}).waitFor();
  assert.match(await dialog().innerText(),/Picked native edges\s+2\b/);
  assert.equal(await f.page.locator('g.gizmo-handle[data-handle="radius"]').count(),1);
 }
}
async function freshFillet(){
 await frameSource();
 await startFillet();await aimEndOn();await endOnProjection();
}
// Independent orthographic metric for this source's straight top edge. The radius
// increases along [0,-1,1]/sqrt(2); X is perpendicular to the end-on view and
// gives world-mm screen scale. No product drag helper is imported by this driver.
async function nearMetric(){return f.page.evaluate(()=>{
 const a=window.__studioScreenOf([20,0,10]),x=window.__studioScreenOf([21,0,10]);
 const d=window.__studioScreenOf([20,-Math.SQRT1_2,10+Math.SQRT1_2]);
 const perMm=Math.hypot(x[0]-a[0],x[1]-a[1]);
 return {perMm,axis:[d[0]-a[0],d[1]-a[1]],idealLength:84*Math.hypot(d[0]-a[0],d[1]-a[1])/perMm};
});}
async function nearTransitionRun(){
 const pixels=8,targets=[3.8,4.2],samples=[];
 // Find the side of end-on where a geometric increase points DOWN. The two
 // targets differ by only about 0.27 degrees, and cross the former 4px switch.
 let sign=1;
 await orbit(-Math.PI/2,Math.PI/4+Math.asin(targets[0]/84));
 if((await nearMetric()).axis[1]<0)sign=-1;
 for(const target of targets){
  await radius().fill('2');await preview();
  const camera=await orbit(-Math.PI/2,Math.PI/4+sign*Math.asin(target/84));
  await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const metric=await nearMetric();
  assert.ok(Math.abs(metric.idealLength-target)<.025,JSON.stringify({target,metric,camera}));
  assert.ok(metric.axis[1]>0,'geometric increasing direction must point down');
  const label=`near-${String(target).replace('.','p')}`,h=await handle();assert.ok(h);
  await f.snapshot(`${label}-01-before`);
  const start=Number(await radius().inputValue());
  await f.page.mouse.move(...h.root);await f.page.mouse.down();
  await f.page.mouse.move(h.root[0],h.root[1]-pixels,{steps:4});
  assert.match(await f.page.locator('.gizmo-readout').textContent(),/Radius/i);
  const held=Number(await radius().inputValue());assert.ok(Number.isFinite(held));
  await f.snapshot(`${label}-02-up-${pixels}px-held`);
  await f.page.mouse.up();const released=Number(await radius().inputValue());
  assert.equal(released,held,'release must retain the held value');
  await preview();await f.same(source);await f.snapshot(`${label}-03-released`);
  // Start a separate physical gesture from the newly rendered handle, then
  // return its pointer to the exact down position while still held.
  const next=await handle();assert.ok(next);await f.page.mouse.move(...next.root);await f.page.mouse.down();
  await f.page.mouse.move(next.root[0],next.root[1]-pixels,{steps:4});
  await f.page.mouse.move(...next.root,{steps:4});
  const roundTrip=Number(await radius().inputValue());await f.page.mouse.up();
  assert.equal(roundTrip,released,'pointer round trip must restore the captured scalar');
  assert.equal(Number(await radius().inputValue()),released);
  await preview();await f.same(source);
  const sample={label,camera,metric,pixels,start,held,released,roundTrip,documentUnchanged:true};
  samples.push(sample);f.report.observations.push(sample);await f.persist();
 }
 const difference=Math.abs(samples[1].held-samples[0].held);
 f.report.observations.push({label:'near-transition-comparison',baseline,difference,samples});await f.persist();
 if(baseline){
  assert.ok(samples[0].held>samples[0].start,'old sub-4px fallback increases upward');
  assert.ok(samples[1].held<samples[1].start,'old over-4px geometry decreases upward');
 }else{
  assert.ok(samples.every(s=>s.held>s.start),'both short upward drags must increase the radius');
  assert.ok(difference<=.5,'two close angles must differ by at most 0.5 mm');
  // Commit a value produced by the physical drag, and check native geometry.
  const appliedRadius=samples[1].released;
  await preview();await apply();const dragged=await f.doc();
  assert.equal(dragged.nodes[2].radius,appliedRadius);assert.deepEqual(dragged.nodes.slice(0,2),source.nodes);
  await verify(dragged,'near-04-applied-native',appliedRadius);
  await f.undo();await f.same(source);await f.redo();await f.same(dragged);
  await verify(dragged,'near-05-redo-native',appliedRadius);
  await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('near-06-final-iso');return;
 }
 await cancel();await f.snapshot('near-04-baseline-cancel');
}
async function verify(doc,label,value){
 if(twoEdges)assert.deepEqual([...doc.nodes[2].edges].sort(),['n1.side0|n1.top','n1.side2|n1.top']);
 const native=await f.inspect(label,doc),[body]=(await f.bodies()).bodies;
 assert.equal(native.key,body.key);
 await f.runOracle({native,width:40,depth:30,height:10,chamfer:false,twoEdges,radius:value,workerVolume:body.volume},label);
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'end-on-box.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);await frameSource();
 // Pick through the actual viewport, never through the selection hook.
 await startFillet();
 const camera=await aimEndOn();
 if(nearTransition){await nearTransitionRun();return;}
 const projection=await endOnProjection();
 const h=await handle();assert.ok(h,'collapsed radius handle remains rendered');await f.snapshot('01-end-on-before');const start=Number(await radius().inputValue());const samples=[];
 await f.page.mouse.move(...h.root);await f.page.mouse.down();
 for(const [dx,dy] of [[20,0],[50,0],[50,-30],[0,-50],[0,0]]){await f.page.mouse.move(h.root[0]+dx,h.root[1]+dy,{steps:5});samples.push({dx,dy,value:Number(await radius().inputValue()),cursor:await f.page.locator('.vp-canvas').evaluate(e=>getComputedStyle(e).cursor),readout:await f.page.locator('.gizmo-readout').textContent()});}
 assert.ok(samples.every(s=>/Radius/i.test(s.readout??'')),'actual drag entered the radius handle, not camera or selection');await f.snapshot('02-end-on-pointer-held');
 await f.page.mouse.up();await f.page.locator('.hud .status').filter({hasText:/^preview$/}).waitFor();await f.same(source);await f.snapshot('02-end-on-after');
 const changed=samples.some(s=>s.value!==start);f.report.observations.push({label:'end-on-pointer',camera,projection,start,samples,changed,documentUnchanged:true,handle:h});await f.persist();if(baseline)assert.equal(changed,false,'baseline collapsed axis remains inert');else assert.equal(changed,true,'fixed radius handle must respond to an end-on drag');
 
 assert.equal(Number(await radius().inputValue()),start,'round trip and release restore the original scalar');
 if(baseline){await cancel();return;}
 // A fresh gesture captures the current zoom, not the previous gesture's scale.
 const delta=24;
 const first=await dragUp(delta,true);assert.ok(first>2&&first<10,'first zoom produces a valid increased radius');
 await radius().fill('2');await preview();
 const beforeZoom=await f.page.evaluate(()=>window.__studioCamera());
 const canvas=await f.page.locator('.vp-canvas').boundingBox();await f.page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);await f.page.mouse.wheel(0,-300);await f.page.waitForTimeout(250);
 const afterZoom=await f.page.evaluate(()=>window.__studioCamera());
 assert.ok(afterZoom.distance<beforeZoom.distance,'wheel changed the zoom');
 if(perspective){
  const camera=await aimEndOn(),projection=await endOnProjection();
  f.report.observations.push({label:'perspective-realigned-after-zoom',camera,projection});
 }
 const second=await dragUp(delta);assert.ok(second>2&&second<10,'second zoom produces a valid increased radius');assert.ok(Math.abs(first-second)>1e-4,'new zoom changes the new gesture sensitivity');
 f.report.observations.push({label:'two-zoom-fresh-gestures',delta,first,second,beforeZoom,afterZoom});
 await cancel();await f.snapshot('03-cancel-preserves-source');
 // Explicit viewport reselection starts a fresh command; apply the pointer-produced value.
 await freshFillet();const appliedRadius=await dragUp(delta);await preview();
 if(twoEdges){
  await button('Iso').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();
  assert.equal(Number(await radius().inputValue()),appliedRadius);
  await f.same(source);await f.snapshot('two-edges-dragged-preview');
 }
 await apply();const dragged=await f.doc();
 assert.equal(dragged.nodes[2].radius,appliedRadius);assert.deepEqual(dragged.nodes.slice(0,2),source.nodes);await verify(dragged,'04-drag-applied',appliedRadius);
 await f.undo();await f.same(source);await f.redo();await f.same(dragged);await verify(dragged,'05-redo',appliedRadius);
 // The typed scalar must create precisely the same recipe, not merely similar geometry.
 await f.undo();await f.same(source);await freshFillet();await radius().fill(String(appliedRadius));await preview();await apply();await f.same(dragged);await verify(dragged,'06-typed-equivalent',appliedRadius);
 const saved=await f.save('end-on-fillet');await f.freshOpen(saved.file,saved.doc,'07-reopened');await f.same(dragged);await verify(dragged,'08-reopened-native',appliedRadius);
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('09-final-iso');
 
});
