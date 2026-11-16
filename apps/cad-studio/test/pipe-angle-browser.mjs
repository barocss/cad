import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/app/profileCommands.ts','apps/cad-studio/src/app/featureNumberInput.ts','apps/cad-studio/test/pipe-angle-browser.mjs'];
const f=await createFlow({name:'pipe-angle',output:process.argv[2],envFrozen:'PIPE_ANGLE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Pipe angle boundary refusals recover to 180 degrees without changing the saved sketch.',limits:['Circle radius5, runs8, bend radius20; Chrome WebGPU.']});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:1,nodes:[{id:'n0',kind:'sketch',profile:'circle',center:[0,0],radius:5}],outputs:{}};
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});await f.page.setInputFiles('input[aria-label="Model file"]',{name:'pipe.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
  await f.page.getByRole('group',{name:'History',exact:true}).getByRole('button',{name:'Sketch · circle',exact:true}).click();await f.closeEditor();await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Pipe');
  const hud=f.page.getByRole('dialog',{name:'Pipe',exact:true}),angle=hud.getByLabel('Bend angle',{exact:true}),apply=hud.getByRole('button',{name:'Apply',exact:true});
  assert.equal(await angle.getAttribute('max'),'180');
  for(const value of ['270','0','180.01']){
   await angle.fill(value);await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent==='refused');assert.equal(await apply.isDisabled(),true);assert.ok((await hud.innerText()).includes('Greater than 0° and at most 180°'));await angle.press('Enter');await f.same(source);
  }
  await f.snapshot('refused-'+width);await angle.fill('180');await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent==='preview');await f.same(source);await apply.click();await f.ready();
  const doc=await f.doc();assert.equal(doc.nodes.at(-1).path[1].angle,180);assert.ok((await f.bodies()).bodies[0].volume>0);await f.snapshot('accepted-'+width);
  await f.undo();await f.same(source);await f.redo();await f.same(doc);const saved=await f.save('pipe-'+width);await f.freshOpen(saved.file,doc,'reopened-'+width);
 }
});
