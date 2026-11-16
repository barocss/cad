import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/errors.ts','apps/cad-studio/src/app/featureNumberInput.ts','apps/cad-studio/test/face-thread-history-browser.mjs'];
const f=await createFlow({name:'face-thread-history',output:process.argv[2],envFrozen:'THREAD_HISTORY_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Saved shaft/bore thread dimensions and hand can be edited with visible refusal recovery.',limits:['Native Z shaft Ø6×30 and Ø5 bore in 30×30×10 box; Chrome WebGPU.'],inspectorSource:`
import {part} from '@barocss/cad-model/api';
const type=JSON.parse(process.argv[3]);
const base=type==='shaft'?part('shaft').cylinder({r:3,h:30}):part('bore').box({w:30,d:30,h:10}).hole(b=>b.faces().facing('+z'),{d:5,x:15,y:15});
console.log(JSON.stringify(base.thread(b=>b.faces().curved().first(),{pitch:1,...(type==='shaft'?{length:12}:{diameter:6})}).doc));`});
await f.run(async()=>{
 for(const width of [1024,1440]) for(const type of ['shaft','bore']){
  await f.newPage();await f.page.setViewportSize({width,height:900});
  const fixture=await f.inspect('fixture-'+type+'-'+width,{},type);
  await f.page.setInputFiles('input[aria-label="Model file"]',{name:type+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await f.ready();await f.same(fixture);
  const index=fixture.nodes.length-1;
  await f.openFeatureEditor(index);const editor=f.editor();
  const invalid=type==='shaft'?'Length (0: whole face)':'Nominal Ø';
  await editor.getByLabel(invalid,{exact:true}).fill(type==='shaft'?'31':'5');await editor.getByRole('button',{name:'Apply',exact:true}).click();
  await editor.getByText(type==='shaft'?'Thread length exceeds the selected face':'Thread nominal diameter does not fit this face',{exact:true}).waitFor();
  await f.same(fixture);await f.snapshot('refused-'+type+'-'+width);await editor.getByRole('button',{name:'Reset',exact:true}).click();
  await editor.getByLabel('Pitch',{exact:true}).fill('0.75');await editor.getByLabel('Length (0: whole face)',{exact:true}).fill('4');
  await editor.getByLabel('Hand',{exact:true}).selectOption('left');await editor.getByLabel('From',{exact:true}).selectOption('-');
  const edited=await f.applyEditor(fixture,'edited-'+type+'-'+width);const node=edited.doc.nodes[index];
  assert.equal(node.pitch,0.75);assert.equal(node.length,4);assert.equal(node.hand,'left');assert.equal(node.end,'-');assert.deepEqual(edited.doc.nodes.slice(0,index),fixture.nodes.slice(0,index));
  const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);assert.ok(bodies[0].volume>0);await f.snapshot('accepted-'+type+'-'+width);
  await f.undo();await f.same(fixture);await f.redo();await f.same(edited.doc);
  const saved=await f.save(type+'-'+width);await f.freshOpen(saved.file,edited.doc,'reopened-'+type+'-'+width);
  await f.openFeatureEditor(index);assert.equal(await f.editor().getByLabel('Hand',{exact:true}).inputValue(),'left');
  await f.editor().getByLabel('Hand',{exact:true}).selectOption('right');await f.editor().getByLabel('Length (0: whole face)',{exact:true}).fill('0');
  const whole=await f.applyEditor(edited.doc,'whole-'+type+'-'+width);assert.equal('hand' in whole.doc.nodes[index],false);assert.equal('length' in whole.doc.nodes[index],false);
 }
});
