import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createFlow } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';
const pins=['apps/cad-studio/src/app/filletFamily.ts','apps/cad-studio/src/app/commandState.ts','apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/src/state/useCommandPreview.ts','apps/cad-studio/test/fixtures/bracket.bcad'];
const f=await createFlow({name:'fillet-mode-draft',output:process.argv[2],envFrozen:'D1336_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Varying endpoint survives Constant round trips without altering constant effective geometry or source document.',limits:['Single front/top edge of30×12×20box, circular section; Edge/Face/Full-round type switches and AT NOT_RUN.']});
const hud=()=>f.page.getByRole('dialog',{name:'Fillet',exact:true});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const settled=()=>f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent?.trim()==='preview',null,{timeout:60000});
const mode=value=>hud().getByLabel('Fillet radius mode',{exact:true}).selectOption(value);
const start=()=>hud().getByLabel(/^(?:Start radius|Radius)$/,{exact:true});
const end=()=>hud().getByLabel('End radius (0: same)',{exact:true});
await f.run(async()=>{
 const fixture=JSON.parse(await readFile(resolve(f.app,'test/fixtures/bracket.bcad'),'utf8'));fixture.nodes[1].height=20;const file=join(process.argv[2],'box.bcad');await writeFile(file,JSON.stringify(fixture));
 for(const width of [1024,1440]){
  await f.newPage();await f.openFile(file,2);await f.page.setViewportSize({width,height:900});await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const base=await f.doc();
  const open=async()=>{await clickModelCommand(f.page,'Modify','Fillet');await hud().waitFor();await f.worldClick([15,0,20]);await start().fill('1');await settled();};
  await open();await mode('varying');await end().fill('3');await settled();
  for(let i=0;i<3;i++){await mode('constant');await settled();assert.equal(await end().count(),0);assert.equal(await start().inputValue(),'1');await f.same(base);await mode('varying');await settled();assert.equal(await end().inputValue(),'3');assert.equal(await start().inputValue(),'1');await f.same(base);}
  await f.snapshot(`${width}-varying-restored`);await button('Apply',hud()).click();await hud().waitFor({state:'hidden'});await f.changed(base);const varying=await f.doc(),node=varying.nodes.at(-1);assert.equal(node.kind,'fillet');assert.deepEqual(node.radii.map(r=>r.radius),[1,3]);assert.deepEqual(node.edges,['n1.side0|n1.top']);assert.equal(JSON.stringify(node).includes('varyingDraft'),false);
  await f.openFeatureEditor(2);assert.ok(await f.editor().getByRole('group',{name:'Fillet radius mode',exact:true}).getByText('Varying',{exact:true}).isVisible());assert.equal(await f.editor().locator('select[aria-label="Fillet radius mode"]').count(),0);await f.closeEditor();await f.undo();await f.same(base);await f.redo();await f.same(varying);const saved=await f.save(`${width}-varying`);await f.freshOpen(saved.file,varying,`${width}-varying-reopened`);
  await f.openFile(file,2);await f.ready();await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await open();await mode('varying');await end().fill('3');await settled();await mode('constant');await settled();await f.snapshot(`${width}-constant-effective`);await button('Apply',hud()).click();await hud().waitFor({state:'hidden'});await f.changed(base);const constant=await f.doc(),c=constant.nodes.at(-1);assert.equal(c.kind,'fillet');assert.equal(c.radius,1);assert.equal(c.radii,undefined);await f.openFeatureEditor(2);assert.ok(await f.editor().getByRole('group',{name:'Fillet radius mode',exact:true}).getByText('Constant',{exact:true}).isVisible());assert.equal(await f.editor().locator('select[aria-label="Fillet radius mode"]').count(),0);await f.closeEditor();await f.undo();await f.same(base);
  f.report.observations??=[];f.report.observations.push({width,roundTrips:3,varying:[1,3],constant:1,history:true,saveOpen:true});
 }
});
