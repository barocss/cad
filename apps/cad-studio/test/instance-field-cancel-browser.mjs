import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'instance-field-cancel',envFrozen:'INSTANCE_FIELD_CANCEL_FROZEN',output:process.argv[2],qualification:'Escape discards pending instance name/position/rotation input without changing the model, blur still commits valid edits, native persistence and history remain intact.',initialFiles:['apps/cad-studio/test/instance-field-cancel-browser.mjs','apps/cad-studio/src/ui/InstancePanel.tsx','apps/cad-studio/test/fixtures/assembly-steps.bcad'],limits:['Top-level instance scalar fields. No nested instances, mate-driven transforms, patterns or neutral exports.']});
const panel=()=>f.page.getByRole('complementary',{name:'Instance',exact:true});
const field=(name,k=0)=>panel().getByLabel(`Instance ${name}`,{exact:true}).nth(k);
async function select(id){await f.page.locator(`[data-browser-instance-path="${id}"]`).click();await panel().waitFor();}
await f.run(async()=>{
 await f.newPage();await f.openFile(join(import.meta.dirname,'fixtures/assembly-steps.bcad'),2);await select('b1');const before=await f.doc();
 for(const [name,k,dirty] of [['X',0,'123'],['Y',0,'-37'],['Z',0,'42'],['X',1,'35'],['Y',1,'-25'],['Z',1,'90'],['Name',0,'Unwanted name'],['X',0,''],['Name',0,'']]){
  const input=field(name,k),original=await input.inputValue();await input.fill(dirty);await f.same(before);await input.press('Escape');
  if(name==='X'&&dirty==='123')await f.snapshot('01-after-escape');
  assert.equal(await input.inputValue(),original,`${name}/${k} Escape should restore current saved value`);assert.equal(await input.evaluate(x=>x===document.activeElement),true);await input.press('Tab');await f.same(before);
 }
 await field('X').fill('25');await field('X').press('Enter');await f.changed(before);const moved=await f.doc();assert.equal(moved.instances.find(i=>i.id==='b1').position[0],25);assert.deepEqual(moved.instances.filter(i=>i.id!=='b1'),before.instances.filter(i=>i.id!=='b1'));await field('X').press('Tab');await f.same(moved);
 await field('X').fill('77');await field('X').press('Escape');await field('X').press('Tab');await f.same(moved);await f.undo();await f.same(before);await f.redo();await f.same(moved);await select('b1');
 await field('Z',1).fill('30');await field('Z',1).press('Tab');await f.changed(moved);const rotated=await f.doc();assert.equal(rotated.instances.find(i=>i.id==='b1').rotation[2],30);assert.deepEqual(rotated.nodes,before.nodes);
 const saved=await f.save('instance-field-cancel');await f.freshOpen(saved.file,saved.doc,'02-native-open');await select('b1');assert.equal(await field('X').inputValue(),'25');assert.equal(await field('Z',1).inputValue(),'30');await f.snapshot('03-reopened');f.report.observations.push({cancelledFields:9,enterPositionX:25,blurRotationZ:30,undoRedo:true,nativeSaveOpen:true});
});
