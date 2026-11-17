import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFlow} from './flow-helper.mjs';
const route=JSON.parse(await readFile('apps/cad-studio/test/fixtures/revision-route-bundle.bcad','utf8'));
const f=await createFlow({name:'assembly-add-route-admission',output:process.argv[2],envFrozen:'ASSEMBLY_ADD_ROUTE_ADMISSION_FROZEN',initialFiles:['apps/cad-studio/test/assembly-add-route-admission-browser.mjs','packages/barocss-cad-model/src/assembly/edit.ts','apps/cad-studio/test/fixtures/revision-route-bundle.bcad'],qualification:'Core and dispatcher reject root-only linked route copies; ordinary and explicitly detached output remains usable in Studio.',limits:['The bad core candidate is already blocked by Studio merge admission. This does not claim prior UI document corruption.','Synthetic route and rectangular part; existing route support only, no implicit detachment.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {dispatchTool} from '@barocss/cad-model/chat/tools';
import {evaluatePart} from '@barocss/cad-model/engine/evaluate';
import {rectanglePart} from '@barocss/cad-model/engine/doc';
import {detachRouteBundle,routeBundleDocumentIdentity} from '@barocss/cad-model/engine/routeBundle';
import {encodeStudioFile} from '@barocss/cad-model/engine/container';
const route=JSON.parse(readFileSync(process.argv[2],'utf8')), out=[];
for(const [name,doc] of [['linked',route],['ordinary',rectanglePart(12,10,8)],['detached',detachRouteBundle(route,'bundle1',routeBundleDocumentIdentity(route))]]) {
 const before=JSON.stringify(doc), result=await dispatchTool({doc,bodies:[]},'assembly',{action:'add_part',name:'Copy',copy_of:'base',position:[40,0,0]},async d=>evaluatePart(d,1));
 let saveError=null;try{encodeStudioFile(result.state.doc);}catch(e){saveError=String(e);}
 out.push({name,changed:result.changed,isError:result.isError,content:result.content,inputUnchanged:JSON.stringify(doc)===before,saveError,doc:result.state.doc});
}
console.log(JSON.stringify(out));`});
await f.run(async()=>{
 const results=await f.inspect('dispatcher-copies',route);f.report.observations.push({label:'dispatcher',results});
 const linked=results[0];assert.equal(linked.changed,false);assert.equal(linked.isError,true);assert.match(linked.content,/Detach linked route bundles/);assert.deepEqual(linked.doc,route);
 for(const result of results){assert.equal(result.inputUnchanged,true);assert.equal(result.saveError,null);if(result.name!=='linked'){assert.equal(result.changed,true);assert.equal(result.isError,false);}}
 for(const result of results){
  await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:`${result.name}.bcad`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(result.doc))});
  await f.page.waitForFunction(n=>window.__studioDoc?.nodes?.length===n,result.doc.nodes.length);await f.ready();assert.deepEqual(await f.doc(),JSON.parse(JSON.stringify(result.doc)));
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot(`${result.name}-opened`);
  if(result.name!=='linked'){
   await f.page.locator('[data-browser-instance-path="p1"]').click();await f.page.getByRole('complementary',{name:'Instance',exact:true}).waitFor();
   const before=await f.doc();await f.page.getByRole('button',{name:'Reset instance placement',exact:true}).click();await f.changed(before);const reset=await f.doc();assert.deepEqual(reset.instances[0].position,[0,0,0]);await f.undo();await f.same(before);await f.redo();await f.same(reset);
  }
  const saved=await f.save(`${result.name}-saved`);await f.freshOpen(saved.file,saved.doc,`${result.name}-reopened`);await f.snapshot(`${result.name}-final`);
 }
});
