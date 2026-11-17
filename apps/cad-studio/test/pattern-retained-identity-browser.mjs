import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFlow} from './flow-helper.mjs';
const fixture=JSON.parse(await readFile('apps/cad-studio/test/fixtures/bearing-housing-identity.bcad','utf8'));
const f=await createFlow({name:'pattern-retained-identity',output:process.argv[2],envFrozen:'PATTERN_RETAINED_IDENTITY_FROZEN',initialFiles:['apps/cad-studio/test/pattern-retained-identity-browser.mjs','packages/barocss-cad-model/src/assembly/patterns.ts','packages/barocss-cad-model/src/assembly/takenIds.ts','apps/cad-studio/test/fixtures/bearing-housing-identity.bcad'],qualification:'A new instance pattern must not take a removed occurrence identity held by an existing bearing housing reference.',limits:['One synthetic patterned housing and existing A9-7 bearing fixture; existing missing-reference and Undo behavior retained.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {addInstancePattern} from '@barocss/cad-model/assembly/patterns';
import {resolveShopTree} from '@barocss/cad-model/engine/shopRows';
import {evaluatePart} from '@barocss/cad-model/engine/evaluate';
let doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(JSON.parse(process.argv[3]??'null')==='prepare'){
 doc.instances[0].position=[-40,0,0];doc=addInstancePattern(doc,{kind:'linear',seed:'inst1',count:2,spacing:40,dir:[1,0,0]}).doc;
 doc.instances.find(i=>i.id==='inst2').doc.nodes.find(n=>n.kind==='bearing').housingRef={part:'pat1-1',body:'b1'};console.log(JSON.stringify(doc));
}else{const r=evaluatePart(resolveShopTree(doc.instances.find(i=>i.id==='inst2').doc,doc,'inst2'),1);console.log(JSON.stringify(r.ok?{ok:true,report:r.bodies.find(b=>b.element?.kind==='bearing')?.element?.report}:{ok:false,error:r.error}));}`});
const button=name=>f.page.getByRole('button',{name,exact:true});
async function selectSeed(){await f.page.locator('[data-browser-instance-path="inst1"]').click();await f.page.getByRole('complementary',{name:'Instance',exact:true}).waitFor();}
await f.run(async()=>{
 const original=await f.inspect('prepared',fixture,'prepare');
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'pattern-housing.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});await f.page.waitForFunction(()=>window.__studioDoc?.instancePatterns?.[0]?.id==='pat1');await f.ready();await f.page.getByTitle('Frame all (F)',{exact:true}).click();assert.equal((await f.inspect('original',await f.doc())).ok,true);
 await selectSeed();await button('Delete pattern').click();await f.changed(original);const deleted=await f.doc();const missing=await f.inspect('deleted',deleted);assert.equal(missing.ok,false);assert.match(missing.error.detail,/housing part pat1-1 no longer exists/);await f.snapshot('01-deleted');
 await selectSeed();await button('Pattern…').click();await f.page.getByLabel('Pattern count',{exact:true}).fill('2');await f.page.getByLabel('Pattern spacing',{exact:true}).fill('40');await f.page.getByLabel('Pattern axis',{exact:true}).selectOption('X');await button('Make pattern').click();await f.changed(deleted);const made=await f.doc(),result=await f.inspect('replacement',made);f.report.observations.push({oldPattern:'pat1',newPattern:made.instancePatterns[0].id,result});await f.snapshot('02-replacement');
 assert.notEqual(made.instancePatterns[0].id,'pat1');assert.equal(result.ok,false);assert.deepEqual(made.instances.find(i=>i.id==='inst2').doc,original.instances.find(i=>i.id==='inst2').doc);
 await f.undo();await f.same(deleted);await f.undo();await f.same(original);assert.equal((await f.inspect('undo-original',await f.doc())).ok,true);await f.redo();await f.same(deleted);await f.redo();await f.same(made);
 const saved=await f.save('retained-pattern-housing');await f.freshOpen(saved.file,saved.doc,'03-reopened');assert.equal((await f.inspect('reopened',await f.doc())).ok,false);await f.snapshot('04-final');
});
