import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad/src/part/part-model.ts','packages/barocss-cad-model/src/engine/errors.ts','apps/cad-studio/test/pipe-radius-browser.mjs'];
const f=await createFlow({name:'pipe-radius',output:process.argv[2],envFrozen:'PIPE_RADIUS_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Pipe circular bend radius 4.99 is refused and equality at 5 recovers without changing the sketch.',limits:['Circle radius5, runs8, bend radius4.99/5; Chrome WebGPU.']});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:1,nodes:[{id:'n0',kind:'sketch',profile:'circle',center:[0,0],radius:5}],outputs:{}};
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});await f.page.setInputFiles('input[aria-label="Model file"]',{name:'pipe.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
  await f.page.getByRole('group',{name:'History',exact:true}).getByRole('button',{name:'Sketch · circle',exact:true}).click();await f.closeEditor();await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Pipe');
  const hud=f.page.getByRole('dialog',{name:'Pipe',exact:true}),angle=hud.getByLabel('Bend radius',{exact:true}),apply=hud.getByRole('button',{name:'Apply',exact:true});
  for(const value of ['4.99']){
   await angle.fill(value);await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent==='refused');assert.equal(await apply.isDisabled(),true);assert.ok((await hud.innerText()).includes('Contact at profile vertices may be supported'));await angle.press('Enter');await f.same(source);
  }
  await f.snapshot('refused-'+width);await angle.fill('5');await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent==='preview');await f.same(source);await apply.click();await f.ready();
  const doc=await f.doc();assert.equal(doc.nodes.at(-1).path[1].radius,5);assert.ok((await f.bodies()).bodies[0].volume>0);await f.snapshot('accepted-'+width);
  await f.undo();await f.same(source);await f.redo();await f.same(doc);const saved=await f.save('pipe-'+width);await f.freshOpen(saved.file,doc,'reopened-'+width);
 }
});
