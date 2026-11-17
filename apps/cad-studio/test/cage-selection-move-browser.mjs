import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/subd/cageTransformDraft.ts','apps/cad-studio/src/ui/CageTransformControls.tsx'];
const f=await createFlow({name:'cage-selection-move',output:process.argv[2],envFrozen:'CAGE_MOVE_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Numeric XYZ mm translation on two selected faces, immutable baseline, no-op/cancel/history and native persistence.',
 limits:['One box and two connected top faces in Studio. Mirror and drag-equivalence covered by pure tests; local frames unsupported.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const done=async()=>{await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.ready();};
await f.run(async()=>{
 await f.newPage();await f.page.setViewportSize({width:1440,height:1000});await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
 await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
 for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',20],['Centre Y',30],['At Z',10]])await hud.getByLabel(name,{exact:true}).fill(String(value));
 await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();
 const begin=async()=>{await command('edit cage');await panel().waitFor();await button('View cube directions').click();await f.page.getByRole('menuitem',{name:'Top',exact:true}).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();};
 const faces=async()=>{
  await button('Face',panel()).click();
  for(const [i,p] of [[23.75,32.5,26],[16.25,32.5,26]].entries()) {const q=await f.page.evaluate(p=>window.__studioScreenOf(p),p);assert.ok(q);if(i)await f.page.keyboard.down('Shift');await f.page.mouse.click(...q);if(i)await f.page.keyboard.up('Shift');}
  const s=await state();assert.equal(s.sel.faces.length,2);return s;
 };
 const apply=async()=>{await f.page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Apply transform'&&!b.disabled));await button('Apply transform',panel()).click();};
 await begin();const seed=await faces();
 const verifyMove=(before,after,axis,distance)=>{const ids=new Set(before.sel.faces.flatMap(i=>before.cage.faces[i]));before.cage.positions.forEach((x,i)=>assert.equal(after.cage.positions[i],x+(ids.has(Math.floor(i/3))&&i%3===axis?distance:0)));assert.deepEqual(after.cage.faces,before.cage.faces);assert.deepEqual(after.sel,before.sel);};
 await button('Move selection',panel()).click();await apply();assert.equal((await state()).undo,0);
 await button('Move selection',panel()).click();assert.equal(await f.page.getByLabel('Selection pivot',{exact:true}).count(),0);
 for(const axis of [0,1,2]) {await f.page.getByLabel('Translation world axis',{exact:true}).selectOption(String(axis));for(const distance of [-1,.5,1.5]){await f.page.getByLabel('Selection distance mm',{exact:true}).fill(String(distance));verifyMove(seed,await state(),axis,distance);assert.equal((await state()).undo,1);await f.same(base);}}
 await f.page.getByLabel('Selection distance mm',{exact:true}).fill('');assert.deepEqual((await state()).cage,seed.cage);assert.ok(await button('Apply transform',panel()).isDisabled());
 await f.page.getByLabel('Selection distance mm',{exact:true}).press('Escape');assert.deepEqual((await state()).cage,seed.cage);assert.equal((await state()).undo,0);
 await button('Move selection',panel()).click();await f.page.getByLabel('Selection distance mm',{exact:true}).fill('2');await button('Cancel transform preview',panel()).click();assert.deepEqual((await state()).cage,seed.cage);
 await button('Move selection',panel()).click();await f.page.getByLabel('Selection distance mm',{exact:true}).fill('2');const scaled=await state();verifyMove(seed,scaled,2,2);await f.snapshot('selection-move-preview');await apply();
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,seed.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,scaled.cage);
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,scaled.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);
 const saved=await f.save('selection-move');await f.freshOpen(saved.file,accepted,'fresh-open');
});
