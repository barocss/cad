import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/src/viewport/scalarHandleDrag.ts','apps/cad-studio/src/viewport/useCommandGizmos.ts','apps/cad-studio/test/fillet-end-on-handle-browser.mjs','apps/cad-studio/src/viewport/gizmo.ts','apps/cad-studio/src/viewport/viewportPointerInput.ts','packages/barocss-cad-model/src/app/commands.ts'];
const f=await createFlow({name:'fillet-end-on-handle',output:process.argv[2],envFrozen:'FILLET_END_ON_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Observe a real pointer drag of a new Fillet radius handle aligned with the orthographic camera',limits:['Single new Fillet on a 40×30×10 rectangle top edge. Camera changes use actual right-button orbit. No runtime handler calls or synthetic state writes; History handles, perspective end-on rays and command replacement during a held pointer are not browser-qualified. Two orthographic zooms are exercised; perspective behavior remains focused-test scope.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {brepMassProperties,checkBrep,evaluateSurface} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')), [{key,brep}]=partBreps(doc);
const midpoints=doc.nodes[2].kind==='chamfer'?[]:brep.faces.filter(f=>f.name?.startsWith('n2.face')).map(f=>{const s=f.surface;if(s.kind!=='surface')throw Error('Expected native surface');return evaluateSurface(s,(s.knotsU[s.degreeU]+s.knotsU[s.controlPoints.length])/2,(s.knotsV[s.degreeV]+s.knotsV[s.controlPoints[0].length])/2);});
console.log(JSON.stringify({key,midpoints,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true}),vertices:brep.vertices.map(v=>v.point)}));
`,oracleSource:`
import json,sys,math
d=json.load(sys.stdin);n=d['native'];w=d['width'];h=d['height'];depth=d['depth'];c=d['radius']
expected=w*depth*h-w*c*c*(.5 if d['chamfer'] else 1-math.pi/4)
assert n['check']['valid'],n['check']['issues']
assert abs(n['volume']-expected)<1e-7,(n['volume'],expected)
assert abs(d['workerVolume']-expected)<1e-7
for x in [0,w]:
 for p in [(x,0,h-c),(x,c,h)]:
  assert any(math.dist(p,q)<1e-9 for q in n['vertices']),p
 assert not any(math.dist((x,0,h),q)<1e-9 for q in n['vertices'])
q=c*(1-1/math.sqrt(2))
if not d['chamfer']: assert any(math.dist((w/2,q,h-q),p)<1e-7 for p in n['midpoints']),n['midpoints']
print(json.dumps({'status':'PASS','expectedVolume':expected,'nativeVolume':n['volume'],'workerVolume':d['workerVolume']}))
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:10}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=name=>f.page.getByRole('button',{name,exact:true});
const radius=()=>f.page.getByRole('dialog',{name:'Fillet',exact:true}).getByLabel('Radius',{exact:true});
async function orbit(yaw,pitch){
 for(let i=0;i<3;i++){const c=await f.page.evaluate(()=>window.__studioCamera());const dx=(c.yaw-yaw)/.008,dy=(pitch-c.pitch)/.008;if(Math.hypot(dx,dy)<.05)break;const r=await f.page.locator('.vp-canvas').boundingBox();const x=r.x+r.width*.55,y=r.y+r.height*.55;await f.page.mouse.move(x,y);await f.page.mouse.down({button:'right'});await f.page.mouse.move(x+dx,y+dy,{steps:12});await f.page.mouse.up({button:'right'});}
 const c=await f.page.evaluate(()=>window.__studioCamera());assert.ok(Math.abs(c.yaw-yaw)<.003&&Math.abs(c.pitch-pitch)<.003,JSON.stringify(c));return c;
}
async function handle(){return f.page.evaluate(()=>{const g=document.querySelector('g.gizmo-handle[data-handle="radius"]'),c=g?.querySelector('circle');if(!c)return null;const r=c.getBoundingClientRect();return {root:[r.x+r.width/2,r.y+r.height/2],html:g.outerHTML};});}
const dialog=()=>f.page.getByRole('dialog',{name:'Fillet',exact:true});
async function preview(){await f.page.locator('.hud .status').filter({hasText:/^preview$/}).waitFor();}
async function cancel(){await dialog().getByRole('button',{name:'Cancel',exact:true}).click();await f.same(source);}
async function apply(){await dialog().getByRole('button',{name:'Apply',exact:true}).click();await f.changed(source);await f.ready();}
async function dragUp(pixels,zoomWhileHeld=false){const metric=await f.page.evaluate(()=>{const a=window.__studioScreenOf([20,0,10]),b=window.__studioScreenOf([21,0,10]);return {perMm:Math.hypot(b[0]-a[0],b[1]-a[1]),snap:Number(localStorage.getItem('studio.snap')??'1')};});const start=Number(await radius().inputValue());const expected=Math.round((start+pixels/metric.perMm)/(.5*(metric.snap||.01)))*(.5*(metric.snap||.01));const h=await handle();assert.ok(h);await f.page.mouse.move(...h.root);await f.page.mouse.down();await f.page.mouse.move(h.root[0],h.root[1]-pixels,{steps:5});assert.match(await f.page.locator('.gizmo-readout').textContent(),/Radius/i);const value=Number(await radius().inputValue());assert.ok(Math.abs(value-expected)<1e-9,JSON.stringify({value,expected,metric,pixels}));f.report.observations.push({label:'independent-screen-scale-oracle',value,expected,metric,pixels});if(zoomWhileHeld){await f.page.mouse.wheel(0,-120);await f.page.waitForTimeout(200);assert.equal(Number(await radius().inputValue()),value,'wheel during pointer hold does not alter captured value');await f.page.mouse.move(h.root[0],h.root[1]-pixels-1);await f.page.mouse.move(h.root[0],h.root[1]-pixels);assert.equal(Number(await radius().inputValue()),value,'same pointer displacement after wheel uses the frozen coefficient');f.report.observations.push({label:'zoom-during-held-pointer',pixels,value,frozenCoefficient:true});}await f.page.mouse.up();assert.equal(Number(await radius().inputValue()),value,'release preserves captured value');await f.same(source);return value;}
async function freshFillet(){
 await button('Iso').click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 const canvas=await f.page.locator('.vp-canvas').boundingBox();await f.page.mouse.click(canvas.x+8,canvas.y+8);
 const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();
 const point=await f.page.evaluate(()=>window.__studioScreenOf([20,0,10]));assert.ok(point);await f.page.mouse.click(...point);await f.page.waitForFunction(()=>window.__studioSelection?.selection?.edges?.length===1);
 await f.command('Fillet');await radius().waitFor();await radius().fill('2');await preview();await orbit(-Math.PI/2,Math.PI/4);await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
}
async function verify(doc,label,value){const native=await f.inspect(label,doc),[body]=(await f.bodies()).bodies;assert.equal(native.key,body.key);await f.runOracle({native,width:40,depth:30,height:10,chamfer:false,radius:value,workerVolume:body.volume},label);}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'end-on-box.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);await button('Iso').click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();
 // Pick through the actual viewport, never through the selection hook.
 const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();assert.ok((await filter.innerText()).includes('Edges'));const point=await f.page.evaluate(()=>window.__studioScreenOf([20,0,10]));assert.ok(point);await f.page.mouse.click(...point);await f.page.waitForFunction(()=>window.__studioSelection?.selection?.edges?.length===1);await f.command('Fillet');await radius().waitFor();await radius().fill('2');await f.page.locator('.hud .status').filter({hasText:/^preview$/}).waitFor();
 const camera=await orbit(-Math.PI/2,Math.PI/4);await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 const projection=await f.page.evaluate(()=>{const a=window.__studioScreenOf([20,0,10]),b=window.__studioScreenOf([20,-10,20]);return {a,b,length:Math.hypot(b[0]-a[0],b[1]-a[1])};});assert.ok(projection.length<1,'end-on world direction is collapsed');
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
 const second=await dragUp(delta);assert.ok(second>2&&second<10,'second zoom produces a valid increased radius');assert.ok(Math.abs(first-second)>1e-4,'new zoom changes the new gesture sensitivity');
 f.report.observations.push({label:'two-zoom-fresh-gestures',delta,first,second,beforeZoom,afterZoom});
 await cancel();await f.snapshot('03-cancel-preserves-source');
 // Explicit viewport reselection starts a fresh command; apply the pointer-produced value.
 await freshFillet();const appliedRadius=await dragUp(delta);await preview();await apply();const dragged=await f.doc();
 assert.equal(dragged.nodes[2].radius,appliedRadius);assert.deepEqual(dragged.nodes.slice(0,2),source.nodes);await verify(dragged,'04-drag-applied',appliedRadius);
 await f.undo();await f.same(source);await f.redo();await f.same(dragged);await verify(dragged,'05-redo',appliedRadius);
 // The typed scalar must create precisely the same recipe, not merely similar geometry.
 await f.undo();await f.same(source);await freshFillet();await radius().fill(String(appliedRadius));await preview();await apply();await f.same(dragged);await verify(dragged,'06-typed-equivalent',appliedRadius);
 const saved=await f.save('end-on-fillet');await f.freshOpen(saved.file,saved.doc,'07-reopened');await f.same(dragged);await verify(dragged,'08-reopened-native',appliedRadius);
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('09-final-iso');
 
});
