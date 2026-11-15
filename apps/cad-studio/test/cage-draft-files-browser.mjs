import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/App.tsx','apps/cad-studio/src/files/useStudioDocumentFiles.ts','apps/cad-studio/src/ui/useWorkspaceModeExit.tsx','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'cage-draft-files',output:process.argv[2],envFrozen:'D1329_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Save discloses excluded cage drafts; New part Keep/Escape preserve draft, selection, history and focus across workspaces.',
  limits:['One public30×20×16 SubD box with4quads per side; general cage families and AT NOT_RUN.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const look=async(name)=>{await button('View cube directions').click();await f.page.getByRole('menuitem',{name,exact:true}).click();await f.page.waitForTimeout(250);};
const pick=async(mode,xy,z)=>{
  await button(mode==='Vertex'?'Edge':'Vertex',panel()).click();await button(mode,panel()).click();
  const point=await f.page.evaluate(p=>window.__studioScreenOf(p),[...xy,z]);assert.ok(point);await f.page.mouse.click(point[0],point[1]);await f.page.waitForTimeout(120);
};
await f.run(async()=>{
  await f.newPage();await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
  await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
  for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',0],['Centre Y',0],['At Z',0]])await hud.getByLabel(name,{exact:true}).fill(String(value));
  await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();const baseline=await f.save('box-baseline');
  for(const width of [1024,1440]){
    await f.newPage();await f.openFile(baseline.file,base.nodes.length);await f.same(base);await f.page.setViewportSize({width,height:900});
    await command('edit cage');await panel().waitFor();await look('Top');if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();await pick('Edge',[3.75,0],16);await button('Crease',panel()).click();const draft=await state();assert.equal(draft.undo,1);assert.equal(draft.creases,1);
    await f.save(`draft-excluded-${width}`);await f.page.getByText('The cage draft is not included. Use Done, then save to include it.',{exact:true}).waitFor();assert.deepEqual(await state(),draft);await f.same(base);
    for(const mode of ['Model','Render','Drawing','Model']){
      await button(mode).click();assert.deepEqual(await state(),draft);await f.same(base);
      if(mode==='Drawing')continue;
      const focus=mode==='Model'?button('Edge',panel()):button('Render');await focus.focus();await button('New part').click();const dialog=f.page.getByRole('dialog');await dialog.getByText('Discard cage draft and start a new part?',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Keep editing',exact:true}).click();await dialog.waitFor({state:'hidden'});await f.page.waitForFunction(el=>el===document.activeElement,await focus.elementHandle(),{timeout:3000});assert.deepEqual(await state(),draft);await f.same(base);
      await button('New part').click();await dialog.waitFor();await f.page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.deepEqual(await state(),draft);await f.same(base);
      if(mode==='Render'){
        const download=f.page.waitForEvent('download');await f.page.keyboard.press('Meta+s');await download;await f.page.getByText('The cage draft is not included. Use Done, then save to include it.',{exact:true}).waitFor();assert.deepEqual(await state(),draft);
      }
    }
    await f.snapshot(`${width}-kept-cage-draft`);await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await f.changed(base);const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,draft.cage);const saved=await f.save(`done-${width}`);await f.freshOpen(saved.file,accepted,`done-${width}-reopened`);
    await command('edit cage');await panel().waitFor();await button('Box',panel()).click();await look('Top');await pick('Edge',[3.75,0],16);await button('Smooth edges',panel()).click();await button('New part').click();await f.page.getByRole('dialog').getByRole('button',{name:'Discard changes',exact:true}).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await panel().waitFor({state:'detached'});await f.undo();await f.same(accepted);
  }
});
