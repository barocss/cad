import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/files/useModelExports.ts','packages/barocss-cad-model/src/print/export3mf.ts','packages/barocss-cad-model/src/print/threemf.ts','packages/barocss-cad-model/src/engine/stl.ts'];
const f=await createFlow({name:'empty-export',output:process.argv[2],envFrozen:'D1338_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Failed legacy Scale cannot download STL/3MF; History recovery restores actual nonempty downloads at every STL quality.',limits:['Actual empty evaluated BodyResult and mixed input atomicity covered by unit tests, not browser state injection. No external slicer or manufacturing acceptance.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const tool=async name=>{if(await button(name).count())await button(name).click();else{await button('More tools').click();await f.page.getByRole('menuitem',{name,exact:true}).click();}};
await f.run(async()=>{
 const base=JSON.parse(await readFile(resolve(f.app,'test/fixtures/bracket.bcad'),'utf8'));base.nodes[0].min=[10,20];base.nodes[0].max=[22,28];base.nodes[1].from=30;
 const bad={...base,nodes:[...base.nodes,{id:'n2',kind:'scale',parent:{node:1,side:'solid'},factor:5e-9,pivot:[4,-6,10]}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
 const file=join(process.argv[2],'legacy-empty.bcad');await writeFile(file,JSON.stringify(bad));
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});await f.page.setInputFiles('input[aria-label="Model file"]',file);await f.page.getByText('Scale would lose usable geometry',{exact:true}).waitFor();assert.deepEqual(await f.doc(),bad);
  const downloads=[];const listen=d=>downloads.push(d);f.page.on('download',listen);
  await tool('Export STL');const dialog=f.page.getByRole('dialog',{name:'STL export',exact:true});await button('Export',dialog).click();await dialog.waitFor({state:'hidden'});await f.page.getByText('Not written yet',{exact:true}).waitFor();await f.snapshot(`${width}-failed-stl`);
  await tool('Export 3MF');await f.page.getByText('Not written yet',{exact:true}).waitFor();await f.page.waitForTimeout(300);assert.equal(downloads.length,0);f.page.off('download',listen);assert.deepEqual(await f.doc(),bad);
  await f.page.locator('.history .hs[data-node-index="2"]').click();await f.editor().waitFor();await f.editor().getByLabel('Factor',{exact:true}).fill('0.005');await f.applyEditor(bad,`${width}-repaired`);const good=await f.doc();
  for(const quality of ['automatic','8','16','32']){
   await tool('Export STL');await dialog.getByLabel('STL export quality').selectOption(quality);
   const pending=f.page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.stl')});await button('Export',dialog).click();const bytes=await readFile(await(await pending).path());assert.equal(bytes.readUInt32LE(80),12);assert.equal(bytes.length,684);await dialog.waitFor({state:'hidden'});await f.same(good);
  }
  const pending=f.page.waitForEvent('download',{predicate:d=>d.suggestedFilename().endsWith('.3mf')});await tool('Export 3MF');const xml=execFileSync('unzip',['-p',await(await pending).path(),'3D/3dmodel.model'],{encoding:'utf8'});assert.equal((xml.match(/<object\s/g)||[]).length,1);assert.equal((xml.match(/<vertex\s/g)||[]).length,8);assert.equal((xml.match(/<triangle\s/g)||[]).length,12);await f.same(good);await f.snapshot(`${width}-3mf-restored`);
  f.report.observations??=[];f.report.observations.push({width,failedDownloads:0,stlQualities:['automatic','8','16','32'],stlTriangles:12,threeMf:{objects:1,vertices:8,triangles:12},documentUnchangedByExports:true});
 }
});
