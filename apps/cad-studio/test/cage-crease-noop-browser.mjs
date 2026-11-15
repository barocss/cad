import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'cage-crease-noop',output:process.argv[2],envFrozen:'D1327_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'No-op Crease/Smooth edges preserve cage history, Redo and clean document; mixed changes remain one step.',
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
const verticesOf=s=>s.sel.vertices.length?s.sel.vertices:s.sel.edges.length?s.sel.edges[0]:s.cage.faces[s.sel.faces[0]];
await f.run(async()=>{
  await f.newPage();await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
  await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
  for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',0],['Centre Y',0],['At Z',0]])await hud.getByLabel(name,{exact:true}).fill(String(value));
  await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();const baseline=await f.save('box-baseline');
  for(const width of [1024,1440]){
    await f.newPage();const beforeOpen=await f.doc();await f.openFile(baseline.file,base.nodes.length);await f.same(base);await f.page.setViewportSize({width,height:900});assert.equal(await f.page.getByLabel('Unsaved changes',{exact:true}).count(),0);const undoBefore={disabled:await button('Undo').isDisabled(),tip:await button('Undo').getAttribute('data-tip')};
    const begin=async()=>{await command('edit cage');await panel().waitFor();await look('Top');if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();await pick('Edge',[3.75,0],16);};
    await begin();const smooth=await state();await button('Smooth edges',panel()).click();assert.deepEqual(await state(),smooth);assert.equal(await button('Undo cage step',panel()).isDisabled(),true);await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.same(base);assert.equal(await f.page.getByLabel('Unsaved changes',{exact:true}).count(),0);assert.deepEqual({disabled:await button('Undo').isDisabled(),tip:await button('Undo').getAttribute('data-tip')},undoBefore);await f.undo();await f.same(beforeOpen);await f.redo();await f.same(base);await f.snapshot(`${width}-noop-done-clean`);
    await begin();await button('Crease',panel()).click();const creased=await state();assert.equal(creased.undo,1);await button('Crease',panel()).click();assert.deepEqual(await state(),creased);await button('Undo cage step',panel()).click();const undone=await state();assert.equal(undone.undo,0);assert.deepEqual(undone.cage,smooth.cage);assert.equal(await button('Redo cage step',panel()).isDisabled(),false);await button('Smooth edges',panel()).click();assert.deepEqual(await state(),undone);assert.equal(await button('Redo cage step',panel()).isDisabled(),false);assert.equal(await button('Redo').isDisabled(),false);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,creased.cage);
    const point=await f.page.evaluate(()=>window.__studioScreenOf([11.25,10,16]));await f.page.keyboard.down('Shift');await f.page.mouse.click(point[0],point[1]);await f.page.keyboard.up('Shift');const mixed=await state();assert.equal(mixed.sel.edges.length,2);await button('Smooth edges',panel()).click();const result=await state();assert.equal(result.undo,2);assert.equal(result.creases,0);assert.deepEqual(result.sel,mixed.sel);assert.deepEqual(result.cage.positions,mixed.cage.positions);await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,mixed.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,result.cage);await f.same(base);await f.snapshot(`${width}-mixed-real-change`);
    // Keep the meaningful crease result for document history and native persistence checks.
    await button('Undo cage step',panel()).click();await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await f.changed(base);const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,mixed.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save(`creased-${width}`);await f.freshOpen(saved.file,accepted,`creased-${width}-reopened`);
  }
});
