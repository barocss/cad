import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad/src/machine/shaft-parts.ts','packages/barocss-cad-model/src/engine/bodyNotes.ts','apps/cad-studio/test/keyway-open-slot-browser.mjs'];
const f=await createFlow({name:'keyway-open-slot',output:process.argv[2],envFrozen:'KEYWAY_OPEN_SLOT_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Keyway depth edits distinguish a surviving floor from an open slot, with Undo/Redo and reopen.',limits:['Ø24/20 tube, height22; Chrome WebGPU; not Retaining ring framing.'],inspectorSource:`
import {emptyDoc,withNode} from '@barocss/cad-model/engine/doc';
import {commands} from '@barocss/cad-model/app/commands';
const c=commands.find(c=>c.id==='tube')!,ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
const d=c.build!(ctx,{...c.defaults!(ctx),r:12,ri:10,h:22});const index=d.nodes.length;
console.log(JSON.stringify(withNode(d,{kind:'keyway',parent:{node:index-1,side:'solid'},face:'n'+(index-1)+'.hole0.side0',width:6,depth:1})));`});
async function note(text){
 await f.page.locator('.outliner .ol-row button.ol').filter({hasText:'Tube'}).first().click();
 await f.page.getByLabel('Generator note').filter({hasText:text}).waitFor();
}
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});const doc=await f.inspect('fixture-'+width,{}),index=doc.nodes.length-1;
  await f.page.setInputFiles('input[aria-label="Model file"]',{name:'keyway.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.ready();await f.same(doc);
  const before=(await f.bodies()).bodies[0].volume;
  await note('its floor 11 from the axis');
  await f.openFeatureEditor(index);const e=f.editor();await e.getByLabel('Width',{exact:true}).fill('0');await f.same(doc);assert.equal(await e.getByRole('button',{name:'Apply',exact:true}).isEnabled(),false);
  await e.getByLabel('Width',{exact:true}).fill('6');await e.getByLabel('Depth',{exact:true}).fill('3.4');await e.getByLabel('Angle',{exact:true}).fill('90');await f.same(doc);
  const edited=await f.applyEditor(doc,'edited-'+width),n=edited.doc.nodes[index];assert.deepEqual([n.width,n.depth,n.angle],[6,3.4,90]);assert.deepEqual(edited.doc.nodes.slice(0,index),doc.nodes.slice(0,index));assert.equal(n.face,doc.nodes[index].face);assert.deepEqual(n.parent,doc.nodes[index].parent);
  assert.ok((await f.bodies()).bodies[0].volume<before);await note('open slot, no floor (requested depth 3.4)');await f.snapshot('accepted-'+width);
  await f.undo();await f.same(doc);await note('its floor 11 from the axis');await f.redo();await f.same(edited.doc);const saved=await f.save('keyway-'+width);await f.freshOpen(saved.file,edited.doc,'reopened-'+width);
  await f.openFeatureEditor(index);assert.equal(await f.editor().getByLabel('Angle',{exact:true}).inputValue(),'90');await f.editor().getByLabel('Angle',{exact:true}).fill('0');const zero=await f.applyEditor(edited.doc,'zero-'+width);assert.equal('angle' in zero.doc.nodes[index],false);
 }
});
