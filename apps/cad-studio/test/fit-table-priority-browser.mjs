import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/engine/fits.ts','apps/cad-studio/src/ui/FitTables.tsx','apps/cad-studio/test/fit-table-priority-browser.mjs'];
const f=await createFlow({name:'fit-table-priority',output:process.argv[2],envFrozen:'FIT_PRIORITY_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Reimport of an existing fit table retains priority, with native history and persistence.',limits:['Chrome WebGPU, estimated H7 fixture rows, not standards-certified values.']});
const table=(id,upper)=>({id,rows:[{class:'H7',over:10,upTo:18,upper,lower:0,estimate:true}]});
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:1000});await f.page.getByRole('button',{name:'Library',exact:true}).click();
  const region=f.page.getByRole('region',{name:'Fit tables',exact:true});const upload=async value=>{await region.getByLabel('Fit table file',{exact:true}).setInputFiles({name:'fits.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await f.page.waitForTimeout(300);};
  await upload([table('first',0.018),table('second',0.03)]);await f.page.waitForFunction(()=>window.__studioDoc.fits?.tables?.length===2);const baseline=await f.doc();
  await upload(table('first',0.02));await f.page.waitForFunction(()=>window.__studioDoc.fits?.tables?.find(t=>t.id==='first').rows[0].upper===0.02);const changed=await f.doc();assert.deepEqual(changed.fits.tables.map(t=>t.id),['first','second']);
  assert.match(await region.getByLabel('Fit table priority').innerText(),/First matching table wins.*same table ID keeps its priority/);
  await f.snapshot('reimport-'+width);await f.undo();await f.same(baseline);await f.redo();await f.same(changed);const saved=await f.save('fit-priority-'+width);await f.freshOpen(saved.file,changed,'reopened-'+width);
 }
});
