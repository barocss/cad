import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/app/editFields.ts','apps/cad-studio/src/app/featureNumberInput.ts','apps/cad-studio/test/keyway-history-browser.mjs'];
const f=await createFlow({name:'keyway-history',output:process.argv[2],envFrozen:'KEYWAY_HISTORY_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Keyway history width/depth/angle edits preserve bore ownership and Undo/Redo/reopen.',limits:['Ø40/20 tube, height22; Chrome WebGPU; not the open-slot diagnostic or Pipe/Retaining ring scope.'],inspectorSource:`
import {emptyDoc,withNode} from '@barocss/cad-model/engine/doc';
import {commands} from '@barocss/cad-model/app/commands';
const c=commands.find(c=>c.id==='tube')!,ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
const d=c.build!(ctx,{...c.defaults!(ctx),r:20,ri:10,h:22});const index=d.nodes.length;
console.log(JSON.stringify(withNode(d,{kind:'keyway',parent:{node:index-1,side:'solid'},face:'n'+(index-1)+'.hole0.side0',width:6,depth:2.8})));`});
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});const doc=await f.inspect('fixture-'+width,{}),index=doc.nodes.length-1;
  await f.page.setInputFiles('input[aria-label="Model file"]',{name:'keyway.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.ready();await f.same(doc);
  const before=(await f.bodies()).bodies[0].volume;
  await f.openFeatureEditor(index);const e=f.editor();await e.getByLabel('Width',{exact:true}).fill('0');await f.same(doc);assert.equal(await e.getByRole('button',{name:'Apply',exact:true}).isEnabled(),false);
  await e.getByLabel('Width',{exact:true}).fill('7');await e.getByLabel('Depth',{exact:true}).fill('3.4');await e.getByLabel('Angle',{exact:true}).fill('90');await f.same(doc);
  const edited=await f.applyEditor(doc,'edited-'+width),n=edited.doc.nodes[index];assert.deepEqual([n.width,n.depth,n.angle],[7,3.4,90]);assert.deepEqual(edited.doc.nodes.slice(0,index),doc.nodes.slice(0,index));assert.equal(n.face,doc.nodes[index].face);assert.deepEqual(n.parent,doc.nodes[index].parent);
  assert.ok((await f.bodies()).bodies[0].volume<before);await f.snapshot('accepted-'+width);
  await f.undo();await f.same(doc);await f.redo();await f.same(edited.doc);const saved=await f.save('keyway-'+width);await f.freshOpen(saved.file,edited.doc,'reopened-'+width);
  await f.openFeatureEditor(index);assert.equal(await f.editor().getByLabel('Angle',{exact:true}).inputValue(),'90');await f.editor().getByLabel('Angle',{exact:true}).fill('0');const zero=await f.applyEditor(edited.doc,'zero-'+width);assert.equal('angle' in zero.doc.nodes[index],false);
 }
});
