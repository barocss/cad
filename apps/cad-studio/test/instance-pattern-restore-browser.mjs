import assert from 'node:assert/strict';
import { join } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'instance-pattern-restore',envFrozen:'PATTERN_RESTORE_FROZEN',output:process.argv[2],qualification:'Restore exactly one skipped pattern occurrence without restoring the other exclusions.',initialFiles:['apps/cad-studio/test/instance-pattern-restore-browser.mjs','apps/cad-studio/src/ui/InstancePattern.tsx','apps/cad-studio/test/fixtures/instance-pattern.bcad'],limits:['Five-instance linear X pattern, synthetic cube/plate fixture. No new Model/schema behavior, nested assembly, mate or exchange-export qualification.']});
const panel=()=>f.page.getByRole('complementary',{name:'Instance',exact:true});
const form=()=>panel().getByRole('group',{name:'Instance pattern',exact:true});
async function pick(id){await f.page.locator(`[data-browser-instance-path="${id}"]`).click();await panel().waitFor();}
async function check(skip,live,label){const d=await f.doc(),p=d.instancePatterns[0],s=d.instances.find(i=>i.id==='cube');assert.deepEqual(p.skip??[],skip);const copies=d.instances.filter(i=>i.pattern);assert.deepEqual(copies.map(i=>i.pattern.k),live);for(const i of copies){assert.equal(i.id,`${p.id}-${i.pattern.k}`);assert.deepEqual(i.position,[i.pattern.k*25,0,0]);assert.deepEqual(i.doc,s.doc);assert.deepEqual(i.part,s.part);}f.report.observations.push({label,skip,live:copies.map(i=>({id:i.id,position:i.position}))});return d;}
await f.run(async()=>{
 await f.newPage();await f.openFile(join(import.meta.dirname,'fixtures/instance-pattern.bcad'),2);await pick('cube');const before=await f.doc();
 await panel().getByRole('button',{name:'Pattern…',exact:true}).click();await form().getByLabel('Pattern count').fill('5');await form().getByLabel('Pattern spacing').fill('25');await form().getByRole('button',{name:'Make pattern',exact:true}).click();await f.changed(before);const made=await check([],[1,2,3,4],'created');
 for(const id of ['pat1-2','pat1-4']){const prev=await f.doc();await pick(id);await panel().getByRole('button',{name:'Skip',exact:true}).click();await f.changed(prev);}
 const skipped=await check([2,4],[1,3],'two-skipped');await pick('cube');assert.equal(await form().getByRole('button',{name:'Restore occurrence 3',exact:true}).count(),1);assert.equal(await form().getByRole('button',{name:'Restore occurrence 5',exact:true}).count(),1);await f.snapshot('01-two-skipped');
 await form().getByRole('button',{name:'Restore occurrence 3',exact:true}).click();await f.changed(skipped);const restored=await check([4],[1,2,3],'only-three-restored');assert.deepEqual(restored.nodes,made.nodes);assert.deepEqual(restored.instances.find(i=>i.id==='cube'),made.instances.find(i=>i.id==='cube'));assert.equal(await f.page.locator('[data-browser-instance-path="pat1-4"]').count(),0);await f.snapshot('02-only-three-restored');
 await f.undo();await f.same(skipped);await f.redo();await f.same(restored);
 const saved=await f.save('one-occurrence-restored');await f.freshOpen(saved.file,saved.doc,'03-fresh-open');await check([4],[1,2,3],'fresh-open');await pick('cube');assert.equal(await form().getByRole('button',{name:'Restore occurrence 3',exact:true}).count(),0);
 await form().getByRole('button',{name:'Restore all',exact:true}).click();await f.changed(restored);await check([],[1,2,3,4],'restore-all');assert.equal(await form().getByRole('group',{name:'Skipped pattern occurrences',exact:true}).count(),0);await f.snapshot('04-all-restored');
});
