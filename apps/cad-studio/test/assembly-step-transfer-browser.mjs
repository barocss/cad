import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const base=JSON.parse(await readFile(new URL('./fixtures/assembly-steps.bcad',import.meta.url),'utf8'));
base.assemblySteps=[{id:'mount',name:'Mount blocks',add:['b1','b2'],note:'Install the support blocks',explode:0.5},{id:'finish',name:'Fit post and cap',add:['post','cap'],note:'Finish the assembly'}];
const f=await createFlow({name:'assembly-step-transfer',envFrozen:'ASSEMBLY_STEP_TRANSFER_FROZEN',output:process.argv[2],qualification:'Explicit one-step reassignment of a placed part between assembly instructions, preserving physical assembly and native persistence.',initialFiles:['apps/cad-studio/test/assembly-step-transfer-browser.mjs','packages/barocss-cad-model/src/assembly/steps.ts','apps/cad-studio/src/ui/AssemblyStepsPanel.tsx','apps/cad-studio/src/App.tsx'],limits:['Single top-level selection UI; model batch tests separate. Presentation only, not assembly planning, motion, collision or manufacturing qualification.']});
const panel=()=>f.page.getByRole('complementary',{name:'Assembly steps panel',exact:true});
const button=name=>panel().getByRole('button',{name,exact:true});
const members=()=>panel().getByRole('group',{name:'Parts of this step',exact:true}).locator('[data-part]');
const ids=()=>members().evaluateAll(xs=>xs.map(x=>x.getAttribute('data-part')));
async function select(id){await f.page.locator(`[data-browser-instance-path="${id}"]`).click();}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'step-transfer.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.assemblySteps?.[0]?.id==='mount');await f.ready();await f.command('Assembly steps');await panel().waitFor();const before=await f.doc();
 await button('Next step').click();await select('b2');await button('Go to its step').waitFor();assert.deepEqual(await ids(),['post','cap']);
 // Existing Add remains non-transferring; only the new explicit action moves an already-assigned part.
 await button('Add selected parts to this step').click();await f.page.getByText('Step not changed',{exact:true}).waitFor();assert.deepEqual(await f.doc(),before);await f.page.getByRole('button',{name:'Dismiss',exact:true}).click();await f.snapshot('01-before-transfer');
 await button('Move selected part to this step').click();await f.changed(before);const moved=await f.doc();assert.deepEqual(moved.assemblySteps.map(s=>s.add),[['b1'],['post','cap','b2']]);assert.deepEqual(moved.instances,before.instances);assert.deepEqual(moved.nodes,before.nodes);assert.deepEqual(moved.mates,before.mates);assert.deepEqual(moved.assemblySteps.map(({add,...s})=>s),before.assemblySteps.map(({add,...s})=>s));assert.deepEqual(await ids(),['post','cap','b2']);assert.equal(await button('Move selected part to this step').count(),0);await f.snapshot('02-transferred');
 await f.undo();await f.same(before);assert.deepEqual(await ids(),['post','cap']);await f.redo();await f.same(moved);assert.deepEqual(await ids(),['post','cap','b2']);
 await button('Previous step').click();assert.deepEqual(await ids(),['b1']);await button('Next step').click();assert.deepEqual(await ids(),['post','cap','b2']);
 const saved=await f.save('transferred-assembly-step');await f.freshOpen(saved.file,saved.doc,'03-native-open');await f.command('Assembly steps');await panel().waitFor();assert.deepEqual(await ids(),['b1']);await button('Next step').click();assert.deepEqual(await ids(),['post','cap','b2']);await select('b2');await f.snapshot('04-reopened');assert.deepEqual(await f.doc(),moved);f.report.observations.push({before:[['b1','b2'],['post','cap']],after:[['b1'],['post','cap','b2']],implicitAddRefused:true,oneUndoRestoresBothSteps:true,sourceAndMetadataUnchanged:true,nativeSaveOpen:true});
});
