import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'step-explode-scale',envFrozen:'STEP_SCALE_FROZEN',output:process.argv[2],qualification:'Exact fractional assembly-step explode scale display and explicit editing, presentation only.',initialFiles:['apps/cad-studio/test/step-explode-scale-browser.mjs','apps/cad-studio/src/ui/AssemblyStepsPanel.tsx','apps/cad-studio/src/app/stepExplodeDraft.ts','apps/cad-studio/test/fixtures/assembly-steps.bcad'],limits:['Top-level assembly steps and display-only explode; no playback, nested steps or geometry/placement edits.']});
const panel=()=>f.page.getByRole('complementary',{name:'Assembly steps panel',exact:true});
const input=()=>panel().getByLabel('Step explode scale',{exact:true});
const select=()=>panel().getByLabel('Step explode',{exact:true});
const apply=()=>panel().getByRole('button',{name:'Set step explode scale',exact:true});
const original=JSON.parse(await readFile(join(import.meta.dirname,'fixtures/assembly-steps.bcad'),'utf8'));
original.assemblySteps=[{id:'step1',name:'Blocks',add:['b1','b2'],explode:.75},{id:'step2',name:'Finish',add:['post','cap'],explode:1.25}];
const fixture=join(f.output,'fractional-steps.bcad');await writeFile(fixture,JSON.stringify(original));
function sourceUnchanged(d){assert.deepEqual(d.instances,original.instances);assert.deepEqual(d.nodes,original.nodes);assert.deepEqual(d.mates,original.mates);}
await f.run(async()=>{
 await f.newPage();await f.openFile(fixture,2);await f.command('Assembly steps');await panel().waitFor();const before=await f.doc();assert.equal(await select().inputValue(),'0.75');assert.equal(await input().inputValue(),'0.75');await f.snapshot('01-imported-fractional');
 for(const value of ['', '-0.1','2.01']){await input().fill(value);await apply().click();await panel().getByLabel('Step explode refused').waitFor();assert.deepEqual(await f.doc(),before);}
 await input().fill('1.125');assert.deepEqual(await f.doc(),before);await input().press('Escape');assert.equal(await input().inputValue(),'0.75');assert.deepEqual(await f.doc(),before);
 await input().fill('1.125');await input().press('Enter');await f.changed(before);const changed=await f.doc();assert.equal(changed.assemblySteps[0].explode,1.125);assert.equal(await select().inputValue(),'1.125');sourceUnchanged(changed);await f.undo();await f.same(before);assert.equal(await input().inputValue(),'0.75');await f.redo();await f.same(changed);
 await input().fill('0.2');await panel().getByRole('button',{name:'Next step',exact:true}).click();assert.equal(await input().inputValue(),'1.25');await panel().getByRole('button',{name:'Previous step',exact:true}).click();assert.equal(await input().inputValue(),'1.125');assert.deepEqual(await f.doc(),changed);
 const saved=await f.save('fractional-explode');await f.freshOpen(saved.file,saved.doc,'02-fresh-open');await f.command('Assembly steps');await panel().waitFor();assert.equal(await select().inputValue(),'1.125');assert.equal(await input().inputValue(),'1.125');await f.snapshot('03-reopened-scale');sourceUnchanged(await f.doc());
 const reopened=await f.doc();await select().selectOption('0.5');await f.changed(reopened);assert.equal(await input().inputValue(),'0.5');const preset=await f.doc();await input().fill('0');await apply().click();await f.changed(preset);const off=await f.doc();assert.equal(off.assemblySteps[0].explode??0,0);sourceUnchanged(off);await panel().getByRole('button',{name:'Close steps',exact:true}).click();assert.deepEqual(await f.doc(),off);
 f.report.observations.push({importedScale:.75,editedScale:1.125,otherStepScale:1.25,preset:.5,off:0,sourceUnchanged:true,undoRedo:true,actualNativeSaveFreshOpen:true});
});
