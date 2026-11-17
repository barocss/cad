import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const {input:{document:plate}}=JSON.parse(await readFile('packages/barocss-cad/conformance/r14/starter-plate/case.json','utf8'));
const fixture=JSON.parse(await readFile('apps/cad-studio/test/fixtures/assembly-steps.bcad','utf8'));
const base={...fixture,instances:[{id:'first',name:'Mount plate',doc:plate,part:{id:'mount',rev:'A'},position:[0,0,0],rotation:[0,0,0]}]};delete base.assemblySteps;
const route=JSON.parse(await readFile('apps/cad-studio/test/fixtures/revision-route-bundle.bcad','utf8'));
const f=await createFlow({name:'assembly-revision-admission',envFrozen:'ASSEMBLY_REVISION_ADMISSION_FROZEN',output:process.argv[2],qualification:'Offering a root-only linked route file must not make an ordinary assembly unsaveable.',initialFiles:['apps/cad-studio/test/assembly-revision-admission-browser.mjs','packages/barocss-cad-model/src/assembly/definitions.ts','apps/cad-studio/test/fixtures/revision-route-bundle.bcad'],limits:['One placed part and a synthetic valid linked-route file; no nested route support or automatic detach.']});
const button=name=>f.page.getByRole('button',{name,exact:true});
const select=async()=>{await f.page.locator('[data-browser-instance-path="first"]').click();await f.page.getByRole('complementary',{name:'Instance',exact:true}).waitFor();};
const offer=async(doc,name)=>f.page.getByLabel('New revision file',{exact:true}).setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'revision-assembly.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(base))});await f.page.waitForFunction(()=>window.__studioDoc?.instances?.[0]?.id==='first');await f.ready();await select();const before=await f.doc();
 await offer(route,'linked-route.bcad');await f.page.waitForFunction(()=>!!window.__studioDoc?.pendingParts||!!document.querySelector('.toast'));const after=await f.doc();await f.snapshot('01-route-offer');
 if(after.pendingParts){await button('Save').click();await f.page.locator('.toast').filter({hasText:'nested route bundles'}).waitFor();await f.snapshot('02-baseline-save-refusal');f.report.observations.push({acceptedUnsupportedPending:true,saveRefusal:await f.page.locator('.toast').innerText()});}
 assert.equal(after.pendingParts,undefined,'root-only route revision must be refused before pending state');await f.same(before);assert.match(await f.page.locator('.toast').innerText(),/route bundle|linked route/i);
 const saved=await f.save('after-refused-revision');await f.freshOpen(saved.file,saved.doc,'03-open');await select();await f.same(before);
 const ordinary=structuredClone(plate);ordinary.nodes.find(n=>n.kind==='extrude').height=12;await offer(ordinary,'plate-12.bcad');await f.page.getByRole('status',{name:'Revision waiting',exact:true}).waitFor();const pending=await f.doc();await offer(route,'linked-route-again.bcad');await f.page.locator('.toast').filter({hasText:'Detach linked route bundles'}).waitFor();await f.same(pending);await f.snapshot('04-existing-pending-retained');await button('Accept Rev B').click();await f.changed(pending);const accepted=await f.doc();assert.equal(accepted.instances[0].doc.nodes.find(n=>n.kind==='extrude').height,12);await f.undo();await f.same(pending);await f.redo();await f.same(accepted);const final=await f.save('ordinary-revised');await f.freshOpen(final.file,final.doc,'04-normal-reopened');await f.snapshot('05-ordinary-revision');
});
