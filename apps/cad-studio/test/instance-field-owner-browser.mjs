import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'instance-field-owner',envFrozen:'INSTANCE_FIELD_OWNER_FROZEN',output:process.argv[2],qualification:'Uncommitted invalid instance fields never leak into a different selected instance with the same saved scalar.',initialFiles:['apps/cad-studio/test/instance-field-owner-browser.mjs','apps/cad-studio/src/ui/InstancePanel.tsx','apps/cad-studio/test/fixtures/assembly-steps.bcad'],limits:['Top-level instances only; nested assemblies, patterns and neutral exports not tested.']});
const panel=()=>f.page.getByRole('complementary',{name:'Instance',exact:true});
const field=(name,k=0)=>panel().getByLabel(`Instance ${name}`,{exact:true}).nth(k);
async function select(id){await f.page.locator(`[data-browser-instance-path="${id}"]`).click();await panel().waitFor();}
await f.run(async()=>{
 await f.newPage();await f.openFile(join(import.meta.dirname,'fixtures/assembly-steps.bcad'),2);await select('b1');const before=await f.doc();
 let count=0;
 for(const [name,k,value] of [['Y',0,'10'],['Z',0,'0'],['X',1,'0'],['Y',1,'0'],['Z',1,'0']]){
  await select('b1');await field(name,k).fill('');await f.same(before);await select('b2');
  if(count===0)await f.snapshot('01-selected-second-instance');
  assert.equal(await field(name,k).inputValue(),value,`${name}/${k}: new owner must show its saved value, not the old empty draft`);
  await field(name,k).focus();await field(name,k).press('Tab');await f.same(before);await select('b1');assert.equal(await field(name,k).inputValue(),value);count++;
 }
 await field('Y').fill('23');await select('b2');await f.changed(before);const firstMoved=await f.doc();assert.equal(firstMoved.instances.find(i=>i.id==='b1').position[1],23);assert.equal(firstMoved.instances.find(i=>i.id==='b2').position[1],10);assert.equal(await field('Y').inputValue(),'10');
 await field('Y').fill('31');await field('Y').press('Enter');await f.changed(firstMoved);const bothMoved=await f.doc();assert.equal(bothMoved.instances.find(i=>i.id==='b2').position[1],31);assert.equal(bothMoved.instances.find(i=>i.id==='b1').position[1],23);assert.deepEqual(bothMoved.nodes,before.nodes);assert.deepEqual(bothMoved.instances.slice(2),before.instances.slice(2));
 await field('Y').press('Tab');await f.undo();await f.same(firstMoved);await f.redo();await f.same(bothMoved);
 const saved=await f.save('instance-field-owner');await f.freshOpen(saved.file,saved.doc,'02-native-open');await select('b1');assert.equal(await field('Y').inputValue(),'23');await select('b2');assert.equal(await field('Y').inputValue(),'31');await f.snapshot('03-reopened');
 f.report.observations.push({isolatedEmptyFields:count,firstInstanceY:23,secondInstanceY:31,validBlurStillCommitsOldOwner:true,undoRedo:true,nativeSaveOpen:true});
});
