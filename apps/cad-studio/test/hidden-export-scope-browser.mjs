import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/engine/evaluate.ts','apps/cad-studio/src/files/useModelExports.ts','apps/cad-studio/src/files/ModelExportDialogs.tsx','apps/cad-studio/src/files/StepExportPanel.tsx','apps/cad-studio/src/files/stepExportPreparation.ts','apps/cad-studio/src/engine/client.ts'];
const f=await createFlow({name:'hidden-export-scope',output:process.argv[2],envFrozen:'D1333_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Actual hidden-root counts before STL/STEP download; Print and 3MF retain visible-only behavior.',limits:['Two separated closed boxes; placed scope covered by Model tests, not browser; external STEP reader NOT_RUN.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const tool=async(name)=>{if(await button(name).count())await button(name).click();else{await button('More tools').click();await f.page.getByRole('menuitem',{name,exact:true}).click();}};
await f.run(async()=>{
 await f.newPage();await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
 for(const [x,z] of [[0,6],[30,20]]){
  await f.page.getByText('barocss',{exact:true}).click();await f.page.keyboard.press('b');const hud=f.page.locator('.hud');await hud.waitFor();
  for(const [label,value] of [['Width X',10],['Depth Y',10],['Height Z',z],['At X',x],['At Y',0],['At Z',0]])await hud.locator('.field',{has:f.page.locator(`span:text-is("${label}")`)}).locator('input').fill(String(value));
  await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent?.trim()==='preview');await button('Apply',hud).click();await f.ready();
 }
 const base=await f.doc(),saved=await f.save('two-boxes');
 for(const width of [1024,1440]){
  await f.newPage();await f.openFile(saved.file,base.nodes.length);await f.page.setViewportSize({width,height:900});
  for(const hidden of [0,1,2]){
   if(hidden){await button('Hide body').last().click();await f.ready();}
   const before=await f.doc();
   for(const quality of ['automatic','16']){
    await tool('Export STL');const dialog=f.page.getByRole('dialog',{name:'STL export',exact:true});await dialog.getByLabel('STL export quality').selectOption(quality);assert.match(await dialog.getByLabel('STL target boundaries').innerText(),new RegExp(`Root bodies: 2, including ${hidden} hidden`));await f.snapshot(`${width}-${hidden}-stl-${quality}`);
    const downloads=[];const listener=d=>{if(d.suggestedFilename().endsWith('.stl'))downloads.push(d);};f.page.on('download',listener);await button('Export',dialog).click();await dialog.waitFor({state:'hidden'});await f.page.waitForTimeout(300);f.page.off('download',listener);assert.equal(downloads.length,2);for(const dl of downloads){const bytes=await readFile(await dl.path());assert.equal(bytes.readUInt32LE(80),12);}
   }
   await tool('Export STEP');const step=f.page.getByRole('region',{name:'STEP export',exact:true});await step.getByLabel('STEP included bodies').waitFor();assert.match(await step.getByLabel('STEP included bodies').innerText(),new RegExp(`2 output bodies: 2 root bodies, including ${hidden} hidden; 0 placed bodies`));await f.snapshot(`${width}-${hidden}-step`);
   const pending=f.page.waitForEvent('download',{predicate:d=>/\.st(ep|p)$/.test(d.suggestedFilename())});await button('Export',step).click();const text=await readFile(await(await pending).path(),'utf8');assert.equal((text.match(/=MANIFOLD_SOLID_BREP\(/g)||[]).length,2);
   await f.page.getByRole('radio',{name:'Preview: Print',exact:true}).click();const print=f.page.getByLabel('Print layers',{exact:true});await print.waitFor();if(hidden<2){await f.page.waitForFunction(()=>window.__studioPrint().stage==='ready');const status=await print.getByRole('status').innerText();assert.match(status,new RegExp(`of ${hidden?30:100} `));assert.match(status,new RegExp(`${hidden?1:2} closed contours`));}else{await f.page.waitForFunction(()=>!!window.__studioPrint().reason);}
   await f.snapshot(`${width}-${hidden}-print`);await f.page.getByRole('radio',{name:'Preview: None',exact:true}).click();
   if(hidden<2){const pending=f.page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.3mf')});await tool('Export 3MF');const dl=await pending;const xml=execFileSync('unzip',['-p',await dl.path(),'3D/3dmodel.model'],{encoding:'utf8'});assert.equal((xml.match(/<object\s/g)||[]).length,2-hidden);}else{const downloads=[];const listener=d=>downloads.push(d);f.page.on('download',listener);await tool('Export 3MF');await f.page.waitForTimeout(300);f.page.off('download',listener);assert.equal(downloads.length,0);}
   await f.same(before);f.report.observations??=[];f.report.observations.push({width,hidden,stlFiles:2,stepSolids:2,printLayers:hidden===2?0:hidden?30:100});
  }
  await button('Undo').click();await f.ready();await button('Undo').click();await f.ready();await f.same(base);
 }
});
