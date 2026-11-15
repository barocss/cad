import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/App.tsx','apps/cad-studio/src/subd/cageBeginPolicy.ts','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'cage-reentry',output:process.argv[2],envFrozen:'D1330_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Same cage reentry preserves exact draft; switching cages requires Keep/Discard, with history and persistence retained.',
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
  for(let count=1;count<=2;count++){
    await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
    for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',0],['Centre Y',0],['At Z',0]])await hud.getByLabel(name,{exact:true}).fill(String(value));
    await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(n=>window.__studioDoc.nodes.filter(x=>x.kind==='subd').length===n,count);await f.ready();
  }
  const base=await f.doc(),baseline=await f.save('two-cages');
  for(const width of [1024,1440]){
    await f.newPage();await f.openFile(baseline.file,base.nodes.length);await f.same(base);await f.page.setViewportSize({width,height:900});
    const bodies=()=>f.page.locator('.ol-row > button.ol');
    await bodies().nth(0).click();await command('edit cage');await panel().waitFor();await look('Top');if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();await pick('Edge',[3.75,0],16);await button('Crease',panel()).click();const draft=await state();assert.equal(draft.undo,1);
    for(let repeat=0;repeat<3;repeat++){await bodies().nth(0).click();await command('edit cage');assert.deepEqual(await state(),draft);await f.same(base);assert.equal(await f.page.getByRole('dialog').count(),0);}
    await bodies().nth(1).click();await command('edit cage');const dialog=f.page.getByRole('dialog');await dialog.getByText('Discard cage draft and edit another cage?',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Keep editing',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.deepEqual(await state(),draft);await f.same(base);
    await command('edit cage');await dialog.waitFor();await f.page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.deepEqual(await state(),draft);await f.same(base);await f.snapshot(`${width}-reentry-kept`);
    await command('edit cage');await dialog.waitFor();await dialog.getByRole('button',{name:'Discard changes',exact:true}).click();await dialog.waitFor({state:'hidden'});const other=await state();assert.equal(other.undo,0);assert.equal(other.creases,0);assert.equal(other.sel.edges.length,0);await f.same(base);
    await look('Top');await button('Box',panel()).click();await pick('Edge',[3.75,0],16);await button('Crease',panel()).click();const changed=await state();await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await f.changed(base);const accepted=await f.doc();const indices=base.nodes.flatMap((n,i)=>n.kind==='subd'?[i]:[]);assert.deepEqual(accepted.nodes[indices[0]],base.nodes[indices[0]]);assert.deepEqual(accepted.nodes[indices[1]].cage,changed.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save(`switched-${width}`);await f.freshOpen(saved.file,accepted,`switched-${width}-reopened`);
  }
});
