import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts'];
const f=await createFlow({name:'cage-connected-selection',output:process.argv[2],envFrozen:'CAGE_CONNECTED_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Current-mode Grow/Shrink/Linked change only selection; subsequent crease owns one cage undo step and native persistence.',
 limits:['One 4-quads-per-side box at 1440x1000; disconnected/invalid topology checked separately in pure tests. Shortest path and crease barriers not implemented.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const pick=async(mode,p)=>{
 await button(mode==='Vertex'?'Edge':'Vertex',panel()).click(); await button(mode,panel()).click();
 const point=await f.page.evaluate(p=>window.__studioScreenOf(p),p);assert.ok(point);await f.page.mouse.click(...point);await f.page.waitForTimeout(120);
};
const done=async()=>{await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.ready();};
await f.run(async()=>{
 await f.newPage();await f.page.setViewportSize({width:1440,height:1000});await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
 await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
 for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',0],['Centre Y',0],['At Z',0]])await hud.getByLabel(name,{exact:true}).fill(String(value));
 await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();
 const begin=async()=>{await command('edit cage');await panel().waitFor();await button('View cube directions').click();await f.page.getByRole('menuitem',{name:'Top',exact:true}).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();};
 await begin();
 for(const [mode,point,key,grownCount,total] of [['Vertex',[0,0,16],'vertices',5,98],['Edge',[3.75,0,16],'edges',7,192],['Face',[3.75,2.5,16],'faces',5,96]]) {
  await pick(mode,point);const one=await state();assert.equal(one.sel[key].length,1);
  await button('Grow',panel()).click();const grown=await state();assert.equal(grown.sel[key].length,grownCount);assert.deepEqual(grown.cage,one.cage);assert.equal(grown.undo,0);
  if(mode==='Vertex') {
   const coords=grown.sel.vertices.map(v=>grown.cage.positions.slice(3*v,3*v+3).join(',')).sort();
   assert.deepEqual(coords,['-7.5,0,16','0,-5,16','0,0,16','0,5,16','7.5,0,16'].sort());
  }
  await button('Shrink',panel()).click();assert.deepEqual((await state()).sel,one.sel);
  await button('Linked',panel()).click();const linked=await state();assert.equal(linked.sel[key].length,total);assert.deepEqual(linked.cage,one.cage);assert.equal(linked.undo,0);
  await button('Shrink',panel()).click();assert.deepEqual((await state()).sel,linked.sel);await f.same(base);
 }
 await f.snapshot('linked-faces');await button('Cancel cage edit',panel()).click();await panel().waitFor({state:'detached'});await f.same(base);
 await begin();await pick('Edge',[3.75,0,16]);await button('Grow',panel()).click();const grown=await state();
 await button('Crease',panel()).click();const creased=await state();assert.equal(creased.undo,1);assert.equal(creased.creases,7);assert.deepEqual(creased.sel,grown.sel);
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,grown.cage);assert.deepEqual((await state()).sel,grown.sel);
 await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,creased.cage);await f.snapshot('grown-edges-creased');
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,creased.cage);
 await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save('grown-crease');await f.freshOpen(saved.file,accepted,'fresh-open');
});
