import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createFlow} from './flow-helper.mjs';
const fixture=fileURLToPath(new URL('../../../packages/barocss-cad-model/test/fixtures/inherited-catalogue.ts',import.meta.url));
const f=await createFlow({name:'catalogue-row-inheritance',output:process.argv[2],envFrozen:'CATALOGUE_ROW_INHERITANCE_FROZEN',initialFiles:['apps/cad-studio/test/catalogue-row-inheritance-browser.mjs','packages/barocss-cad-model/test/fixtures/inherited-catalogue.ts','packages/barocss-cad-model/src/engine/rings.ts','packages/barocss-cad-model/src/engine/drives.ts','packages/barocss-cad-model/src/engine/connectors.ts'],qualification:'Library protects inherited ring, drive and connector rows used by placed features.',limits:['Drive consumer is a coupling; no new row propagation, pending revision or schema semantics.'],inspectorSource:`import {catalogueFixture,specs} from ${JSON.stringify(fixture)};console.log(JSON.stringify(specs.map(s=>({kind:s.kind,id:s.id,doc:catalogueFixture(s.kind)}))));`});
await f.run(async()=>{
 const cases=await f.inspect('fixtures',{}),results=[];
 for(const c of cases){
  c.doc[c.kind].rows.push({...c.doc[c.kind].rows[0],id:'unused'});
  await f.newPage();await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:`inherited-${c.kind}.bcad`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c.doc))});await f.page.waitForFunction(()=>window.__studioDoc?.instances?.length===1);await f.ready();await f.page.waitForFunction(()=>window.__studioInstanceBounds?.().some(i=>i.id==='p1'&&i.min&&i.max));await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.page.getByRole('button',{name:'Library',exact:true}).click();
  const label={rings:'ring',drives:'drive',connectors:'connector'}[c.kind],before=await f.doc();await f.page.getByRole('button',{name:`Remove ${label} row ${c.id}`,exact:true}).click();await f.snapshot(`${c.kind}-removed`);
  const unchanged=JSON.stringify(await f.doc())===JSON.stringify(before);results.push({kind:c.kind,unchanged});
  if(!unchanged)continue;
  assert.match(await f.page.locator('body').innerText(),/ROW_IN_USE/);await f.page.getByRole('button',{name:`Remove ${label} row unused`,exact:true}).click();await f.changed(before);const removed=await f.doc();assert.deepEqual(removed[c.kind].rows.map(r=>r.id),[c.id]);await f.undo();await f.same(before);await f.redo();await f.same(removed);await f.page.getByRole('button',{name:'Close library',exact:true}).click();const saved=await f.save(`preserved-${c.kind}`);await f.freshOpen(saved.file,saved.doc,`${c.kind}-reopened`);await f.page.waitForFunction(()=>window.__studioInstanceBounds?.().some(i=>i.id==='p1'&&i.min&&i.max));await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot(`${c.kind}-final`);
 }
 f.report.observations.push({results});assert.ok(results.every(r=>r.unchanged),JSON.stringify(results));
});
