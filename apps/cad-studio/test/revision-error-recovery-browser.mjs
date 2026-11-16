import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/App.tsx','apps/cad-studio/test/revision-error-recovery-browser.mjs'];
const f=await createFlow({name:'revision-error-recovery',output:process.argv[2],envFrozen:'REVISION_ERROR_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Shared revision error ownership during delayed real placed replies.',limits:['Chrome WebGPU, two shared zero-height failing occurrences. No synthetic worker results.'],inspectorSource:`
import {emptyDoc,rectanglePart} from '@barocss/cad-model/engine/doc';
const bad=rectanglePart(10,10,10);bad.nodes[1].height=0;
console.log(JSON.stringify({...emptyDoc(),instances:['p1','p2'].map((id,i)=>({id,name:id,position:[i*20,0,0],rotation:[0,0,0],doc:bad,part:{id:'shared',rev:'B'},looks:{b1:{color:'#ff0000'}}})),pendingParts:{shared:{doc:rectanglePart(10,10,10),rev:'C',name:'recovered'}}}));`});
function holdPlaced(){
 const proto=Worker.prototype,post=proto.postMessage,descriptor=Object.getOwnPropertyDescriptor(proto,'onmessage');
 let armed=false,target,release;const seen=[];
 proto.postMessage=function(req,...args){if(req?.type==='placed'){seen.push({id:req.id,done:false});if(armed){armed=false;target={worker:this,id:req.id};}}return post.call(this,req,...args);};
 Object.defineProperty(proto,'onmessage',{configurable:true,get:descriptor.get,set(cb){descriptor.set.call(this,cb&&function(event){const row=seen.find(r=>r.id===event.data?.id);if(row&&event.data.result){row.done=true;row.ok=event.data.result.ok;}if(target?.worker===this&&target.id===event.data?.id){release=()=>cb.call(this,event);return;}cb.call(this,event);});}});
 window.__revisionHold={arm(){armed=true;},state(){return {held:!!release,seen};},release(){target=null;release();release=null;}};
}
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.addInitScript(holdPlaced);await f.page.reload();await f.ready();await f.page.setViewportSize({width,height:900});
  const source=await f.inspect('fixture-'+width,{});
  await f.page.setInputFiles('input[aria-label="Model file"]',{name:'bad-revision.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
  await f.page.waitForFunction(()=>window.__revisionHold.state().seen.filter(r=>r.done&&!r.ok).length>=2);
  const old=await f.page.locator('.toast').innerText();assert.ok(old.length);await f.snapshot('failed-two-'+width);
  await f.page.locator('.ol.instance:not(.nested)').filter({hasText:'p1'}).first().click();
  await f.page.evaluate(()=>window.__revisionHold.arm());await f.page.getByRole('button',{name:'Accept Rev C',exact:true}).click();
  await f.page.waitForFunction(()=>window.__revisionHold.state().held);assert.equal(await f.page.locator('.toast').count(),0);
  const accepted=await f.doc();assert.ok(accepted.instances.every(i=>i.part.rev==='C'));assert.deepEqual(accepted.instances.map(i=>i.looks),source.instances.map(i=>i.looks));
  await f.snapshot('recovery-pending-'+width);await f.page.evaluate(()=>window.__revisionHold.release());
  await f.page.waitForFunction(()=>window.__revisionHold.state().seen.filter(r=>r.done&&r.ok).length>=2);await f.ready();assert.equal(await f.page.locator('.toast').count(),0);
  await f.snapshot('recovered-'+width);await f.same(accepted);
  const saved=await f.save('recovered-'+width);await f.freshOpen(saved.file,accepted,'reopened-'+width);
 }
});
