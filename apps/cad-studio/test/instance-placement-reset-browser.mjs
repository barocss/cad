import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const base=JSON.parse(await readFile(new URL('./fixtures/assembly-steps.bcad',import.meta.url),'utf8'));
base.instances[0].position=[15,25,18];base.instances[0].rotation=[20,-30,45];
const f=await createFlow({name:'instance-placement-reset',envFrozen:'INSTANCE_PLACEMENT_RESET_FROZEN',output:process.argv[2],qualification:'Reset one ordinary instance position and rotation atomically, preserving shared source and all other instances through history and native persistence.',initialFiles:['apps/cad-studio/test/instance-placement-reset-browser.mjs','apps/cad-studio/src/ui/InstancePanel.tsx','apps/cad-studio/src/ui/instancePlacement.ts','apps/cad-studio/test/fixtures/assembly-steps.bcad'],limits:['Top-level unmated assembly placement; no nested instances, solver constraints, pattern seed propagation or neutral exports.']});
const panel=()=>f.page.getByRole('complementary',{name:'Instance',exact:true});
const button=()=>panel().getByRole('button',{name:'Reset instance placement',exact:true});
const field=(name,k=0)=>panel().getByLabel(`Instance ${name}`,{exact:true}).nth(k);
async function select(){await f.page.locator('[data-browser-instance-path="b1"]').click();await panel().waitFor();}
async function zeroBounds(){await f.page.waitForFunction(()=>{const b=window.__studioInstanceBounds?.().find(b=>b.id==='b1');return b&&b.min.every(v=>Math.abs(v)<1e-8)&&b.max.every((v,k)=>Math.abs(v-[20,20,10][k])<1e-8)});}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'placement-reset.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.instances?.[0]?.rotation?.[2]===45);await f.ready();await select();const before=await f.doc();await f.snapshot('01-placed');
 await field('X').fill('99');await f.same(before);await button().click();await f.changed(before);const reset=await f.doc();assert.deepEqual(reset.instances[0],{...before.instances[0],position:[0,0,0],rotation:[0,0,0]});assert.deepEqual(reset.instances.slice(1),before.instances.slice(1));assert.deepEqual(reset.nodes,before.nodes);assert.equal(await button().isDisabled(),true);await zeroBounds();await f.snapshot('02-reset');
 await f.undo();await f.same(before);await f.redo();await f.same(reset);await select();await zeroBounds();
 for(const name of ['X','Y','Z']){assert.equal(await field(name).inputValue(),'0');assert.equal(await field(name,1).inputValue(),'0');}
 await field('Y').fill('17');await field('Y').press('Enter');await f.changed(reset);const moved=await f.doc();assert.equal(moved.instances[0].position[1],17);await field('Y').press('Tab');await button().focus();await button().press('Enter');await f.changed(moved);assert.deepEqual(await f.doc(),reset);await f.undo();await f.same(moved);await f.redo();await f.same(reset);
 const saved=await f.save('instance-placement-reset');await f.freshOpen(saved.file,saved.doc,'03-native-open');await select();await zeroBounds();assert.equal(await button().isDisabled(),true);await f.snapshot('04-reopened');f.report.observations.push({positionAndRotation:[0,0,0],bounds:{min:[0,0,0],max:[20,20,10]},oneUndoRestoresOriginalNotPending99:true,keyboardReset:true,otherInstancesAndSourcePreserved:true,nativeSaveOpen:true});
});
