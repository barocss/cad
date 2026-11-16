import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const f = await createFlow({name:'drawing-assembly-auto-guidance',output:process.argv[2],envFrozen:'ASSEMBLY_AUTO_FROZEN',initialFiles:[import.meta.filename],requiredFrozen:['apps/cad-studio/src/ui/drawing/DimensionsList.tsx','apps/cad-studio/src/ui/drawing/SheetSettings.tsx'],qualification:'Keyboard-readable assembly Auto restriction on two sheets without document changes',limits:['Desktop Chrome, assembly with BOM and balloons off; no output qualification']});
await f.run(async()=>{
 let source=JSON.parse(await readFile('apps/cad-studio/test/fixtures/assembly-cut.bcad','utf8'));
 source.drawing={sheet:'A3',scale:1,projection:'third',scope:{kind:'assembly'},views:['front','top'],hidden:false,dimensions:[],sheets:[{id:'second',name:'Continuation',views:['front']}]};
 await f.newPage();await f.page.setViewportSize({width:Number(process.argv[3]??1440),height:900});
 await f.page.setInputFiles('input[aria-label="Model file"]',{name:'assembly.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.sheets?.[0]?.id === 'second');await f.ready();assert.deepEqual(await f.doc(),source);source=await f.doc();
 await f.page.getByRole('button',{name:'Drawing',exact:true}).click();
 const settings=f.page.getByRole('complementary',{name:'Drawing settings',exact:true});
 for(const name of ['Sheet 1','Continuation','Sheet 1']) {
  await f.page.getByRole('tab',{name,exact:true}).click();
  const auto=settings.getByRole('button',{name:'Auto-dimension',exact:true});
  await f.page.waitForFunction(()=>!!window.__studioDrawing?.());
  await auto.waitFor();await auto.focus();
  assert.equal(await auto.evaluate(el=>el===document.activeElement),true);
  assert.equal(await auto.getAttribute('aria-disabled'),'true');
  const description=await auto.evaluate(el=>document.getElementById(el.getAttribute('aria-describedby'))?.textContent);
  assert.equal(description,'Auto-dimension needs a part scope.');
  assert.equal(await settings.getByText('Auto-dimension is available for a part scope. Assembly scope keeps its BOM table and balloons.').count(),0);
  await f.page.keyboard.press('Enter');await f.page.keyboard.press('Space');await f.same(source);
  assert.equal(await settings.getByLabel('BOM table',{exact:true}).count(),name==='Sheet 1'?1:0);
  if(name==='Sheet 1') assert.equal(await settings.getByLabel('BOM table',{exact:true}).isChecked(),false);
  assert.equal(await settings.getByLabel('Balloons',{exact:true}).isChecked(),false);
  await f.snapshot(name==='Sheet 1'?'first-sheet':'continuation');
 }
 await settings.getByRole('combobox',{name:'Drawing scope',exact:true}).selectOption('part');
 const auto=settings.getByRole('button',{name:'Auto-dimension',exact:true});
 await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.scope?.kind==='part');
 assert.equal(await auto.getAttribute('aria-disabled'),null);
 assert.equal(await auto.getAttribute('aria-describedby'),null);
 await f.page.waitForFunction(()=>!document.querySelector('[aria-label="Auto-dimension"]')?.disabled);
 await auto.focus();await f.page.keyboard.press('Enter');
 await f.page.waitForFunction(()=>window.__studioDoc?.drawing?.dimensions?.length>0);
 await f.snapshot('part-auto-enabled');
});
