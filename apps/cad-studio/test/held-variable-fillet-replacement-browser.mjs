import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const wrongPickNotice=process.argv.includes('--wrong-pick-notice');
const f=await createFlow({name:'held-variable-fillet-replacement',output:process.argv[2],envFrozen:'HELD_VARIABLE_FILLET_FROZEN',initialFiles:['apps/cad-studio/test/held-variable-fillet-replacement-browser.mjs','apps/cad-studio/src/state/useHeldFinishEdge.ts'],qualification:'Identify original Start/End locations through varying Fillet creation and History, retaining direction when radii swap.',limits:['One original straight front-top edge, native circular varying Fillet; no curved/multi-edge marker claim.'],inspectorSource:`
import {readFileSync} from 'node:fs';import {checkBrep,brepMassProperties,evaluateSurface} from '@barocss/cad';import {partBreps} from '@barocss/cad-model/engine/evaluate';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));const [{brep}]=partBreps(doc),id=doc.nodes.at(-1).id;
const corners=brep.faces.filter(f=>f.name?.startsWith(id+'.face')).flatMap(f=>{const s=f.surface;if(s.kind!=='surface')return[];const us=[s.knotsU[s.degreeU],s.knotsU[s.controlPoints.length]],vs=[s.knotsV[s.degreeV],s.knotsV[s.controlPoints[0].length]];return us.flatMap(u=>vs.map(v=>evaluateSurface(s,u,v)));});
console.log(JSON.stringify({valid:checkBrep(brep,{strict:true}).valid,volume:brepMassProperties(brep,1).volume,corners}));
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[30,12]},{id:'n1',kind:'extrude',sketch:0,height:20}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
async function openExact(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'endpoint-box.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.page.waitForFunction(n=>window.__studioDoc?.nodes?.length===n,doc.nodes.length,{timeout:30000});await f.ready();assert.deepEqual(await f.doc(),doc);}
async function endpoints(length=30){const start=f.page.locator('[data-fillet-endpoint="Start"]'),end=f.page.locator('[data-fillet-endpoint="End"]');await start.waitFor();await end.waitFor();assert.deepEqual((await start.getAttribute('data-position')).split(',').map(Number),[0,0,20]);assert.deepEqual((await end.getAttribute('data-position')).split(',').map(Number),[length,0,20]);}
async function verify(doc,label,start,end){const n=await f.inspect(label,doc);assert.ok(n.valid);assert.ok(Math.abs(n.volume-(7200-130*(1-Math.PI/4)))<1e-6);for(const p of [[0,start,20],[30,end,20]])assert.ok(n.corners.some(c=>Math.hypot(...c.map((v,i)=>v-p[i]))<1e-7),JSON.stringify({want:p,corners:n.corners}));}

const missing={...source,nodes:[...source.nodes,{id:'n2',kind:'fillet',parent:{node:1,side:'solid'},edges:['n1.side6|n1.side7'],radius:1,radii:[{at:[20,20,0],radius:1,atEnd:true},{at:[20,20,3],radius:3,atEnd:true}],sigs:{'n1.side6|n1.side7':{k:'line',p:[20,20,1.5],d:[0,0,1],s:3}}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
async function pick(){const p=await f.page.evaluate(()=>window.__studioScreenOf([15,0,20]));await f.page.mouse.click(...p);await endpoints();await f.editor().getByText(/This choice assigns the saved Start/).waitFor();}
function instrument(){const state=window.__replaceHold={enabled:false,held:0,release:null};const ids=new Set(),queue=[],post=Worker.prototype.postMessage;Worker.prototype.postMessage=function(m,...args){if(state.enabled&&m?.type==='part')ids.add(m.id);return post.call(this,m,...args);};const prop=Object.getOwnPropertyDescriptor(Worker.prototype,'onmessage');Object.defineProperty(Worker.prototype,'onmessage',{configurable:true,get(){return prop.get.call(this);},set(fn){prop.set.call(this,typeof fn==='function'?function(e){if(ids.has(e.data?.id)&&!e.data.progress){state.held++;queue.push(()=>fn.call(this,e));return;}return fn.call(this,e);}:fn);}});state.release=()=>{state.enabled=false;ids.clear();for(const send of queue.splice(0))send();};}
await f.run(async()=>{
 if(!wrongPickNotice){
  const newPage=f.newPage;f.newPage=async()=>{await newPage();await f.page.addInitScript(instrument);await f.page.reload();await f.ready();};
 }
 await f.newPage();
 if(process.argv.includes('--failure-retirement')){missing.nodes[2].radius=30;missing.nodes[2].radii[0].radius=30;missing.nodes[2].radii[1].radius=40;}
 await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'held-variable.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(missing))});await f.page.getByRole('region',{name:'References',exact:true}).waitFor();await f.ready();const before=await f.doc();assert.ok(before.nodes[2].held);assert.ok(before.nodes[2].suppressed);await f.snapshot('01-held');
 await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.openFeatureEditor(2);
 if(process.argv.includes('--failure-retirement')){
  await button('Replace edge',f.editor()).click();await pick();await button('Apply edge replacement',f.editor()).click();await f.page.getByText('Edge replacement not applied',{exact:true}).waitFor();await f.same(before);await f.snapshot('02-failed-radius-retained');await button('Cancel edge replacement',f.editor()).click();
  await button('Replace edge',f.editor()).click();await pick();await f.page.evaluate(()=>{window.__replaceHold.enabled=true;});await button('Apply edge replacement',f.editor()).click();await f.page.waitForFunction(()=>window.__replaceHold.held>0,null,{timeout:30000});await button('New part').click();await f.page.evaluate(()=>window.__replaceHold.release());await f.ready();assert.equal((await f.doc()).nodes.length,0);assert.equal(await f.page.locator('[data-fillet-endpoint]').count(),0);await f.snapshot('03-new-part-retires-request');return;
 }
 if(wrongPickNotice){
  f.page.setDefaultTimeout(10000);
  const start=()=>button('Replace edge',f.editor()).click();
  const cancel=()=>button('Cancel edge replacement',f.editor()).click();
  const alert=f.page.getByRole('alert').filter({hasText:'Edge not selected'});
  const history=()=>Promise.all(['Undo','Redo'].map(name=>button(name).isEnabled()));
  const original=await history();
  async function wrongPick(){
   const xy=await f.screenOf([15,6,20]);
   assert.equal(await f.page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('canvas.vp-canvas'),xy),true);
   await f.page.mouse.click(...xy);
   await alert.waitFor();
   assert.equal(await button('Apply edge replacement',f.editor()).isEnabled(),false);
   await f.same(before);
   assert.deepEqual(await history(),original);
  }
  await start(); await wrongPick();
  await pick();
  assert.equal(await button('Apply edge replacement',f.editor()).isEnabled(),true);
  if(process.argv.includes('--prior-notice')){
   assert.equal(await alert.isVisible(),true,'Prior keeps the old refusal beside an accepted pick');
   await f.snapshot('02-prior-stale-refusal'); return;
  }
  await alert.waitFor({state:'hidden'});
  await f.same(before);
  assert.deepEqual(await history(),original);
  await f.snapshot('02-new-pick-no-stale-refusal');
  await cancel();
  await start(); await wrongPick(); await cancel();
  await alert.waitFor({state:'hidden'});
  assert.equal(await f.page.locator('[data-fillet-endpoint]').count(),0);
  await f.same(before);
  assert.deepEqual(await history(),original);
 }
 if(!wrongPickNotice){
  await button('Replace edge',f.editor()).click();await pick();await f.same(before);await f.snapshot('02-staged-mapping');await button('Cancel edge replacement',f.editor()).click();await f.same(before);assert.equal(await f.page.locator('[data-fillet-endpoint]').count(),0);
  await button('Replace edge',f.editor()).click();await pick();await f.page.evaluate(()=>{window.__replaceHold.enabled=true;});await button('Apply edge replacement',f.editor()).click();await f.page.waitForFunction(()=>window.__replaceHold.held>0,null,{timeout:30000});
  if(process.argv.includes('--close-editor-pending')){
   await f.closeEditor();
   await f.page.evaluate(()=>window.__replaceHold.release());
   await f.same(before);
   assert.equal(await f.page.locator('[data-fillet-endpoint]').count(),0);
   await f.snapshot('03-closed-editor-pending');
   await f.openFeatureEditor(2);
  }else{
   await button('Cancel edge replacement',f.editor()).click();
   await f.page.evaluate(()=>window.__replaceHold.release());
   await f.same(before);
   await f.snapshot('03-cancelled-pending');
  }
 }
 await button('Replace edge',f.editor()).click();await pick();await button('Apply edge replacement',f.editor()).click();await f.changed(before);await f.ready();const accepted=await f.doc();assert.equal(accepted.nodes[2].held,undefined);assert.equal(accepted.nodes[2].suppressed,undefined);assert.equal(accepted.nodes[2].id,'n2');assert.deepEqual(accepted.nodes[2].radii.map(r=>r.at),[[0,0,20],[30,0,20]]);assert.deepEqual(accepted.nodes[2].radii.map(r=>r.radius),[1,3]);await verify(accepted,'04-repaired-native',1,3);await f.undo();await f.same(before);await f.redo();await f.same(accepted);
 if(wrongPickNotice){
  const saved=await f.save('held-fillet-replacement');
  const reopened=await f.freshOpen(saved.file,accepted,'05-fresh-open');
  await verify(reopened.doc,'06-native-reopened',1,3);
  await f.openFeatureEditor(2);await endpoints();await f.snapshot('07-reopened-endpoints');return;
 }
 await button('New part').click();await f.ready();await openExact(accepted);await f.openFeatureEditor(2);await endpoints();await f.snapshot('05-reopened');await f.closeEditor();assert.deepEqual(f.report.downloads,[]);
});
