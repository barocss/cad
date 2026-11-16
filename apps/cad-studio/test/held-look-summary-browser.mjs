import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/assembly/looks.ts','apps/cad-studio/src/App.tsx','apps/cad-studio/test/held-look-summary-browser.mjs'];
const f=await createFlow({name:'held-look-summary',output:process.argv[2],envFrozen:'HELD_LOOK_SUMMARY_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'One held body warning per selected instance across pending revision dismissal and reopen.',limits:['Two shared native parts with a missing b3 override; Chrome WebGPU.'],inspectorSource:`
import {emptyDoc,rectanglePart} from '@barocss/cad-model/engine/doc';
const base=rectanglePart(10,10,10);console.log(JSON.stringify({...emptyDoc(),instances:['p1','p2'].map((id,i)=>({id,name:id,position:[i*20,0,0],rotation:[0,0,0],doc:base,part:{id:'shared',rev:'C'},looks:{b3:{hidden:true}}})),pendingParts:{shared:{doc:rectanglePart(12,10,10),rev:'D',name:'next'}}}));`});
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});const source=await f.inspect('fixture-'+width,{});
  await f.page.setInputFiles('input[aria-label="Model file"]',{name:'held.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.ready();await f.same(source);
  async function check(id){
   await f.page.locator('.ol.instance:not(.nested)').filter({hasText:id}).first().click();const group=f.page.getByRole('group',{name:'Appearance (this occurrence)',exact:true});
   const details=group.getByRole('button',{name:'Details · 1 held',exact:true});await details.waitFor();if(await details.getAttribute('data-state')!=='open')await details.click();
   assert.equal(await group.getByRole('alert').count(),1);assert.match(await group.getByRole('alert').innerText(),new RegExp(id+' .*body b3'));return group;
  }
  await check('p1');await check('p2');await f.same(source);await f.snapshot('pending-'+width);
  await f.page.getByRole('button',{name:'Keep Rev C',exact:true}).click();await f.ready();const kept=await f.doc();assert.deepEqual(kept.instances,source.instances);assert.ok(!kept.pendingParts?.shared);await check('p1');
  await f.undo();await f.same(source);await check('p2');await f.redo();await f.same(kept);
  const saved=await f.save('held-'+width);await f.freshOpen(saved.file,kept,'reopened-'+width);await check('p1');await check('p2');
 }
});
