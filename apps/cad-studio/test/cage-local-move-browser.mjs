import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageLocalDirection.ts','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/subd/cageTransformDraft.ts','apps/cad-studio/src/ui/CageTransformControls.tsx'];
const f=await createFlow({name:'cage-local-move',output:process.argv[2],envFrozen:'CAGE_LOCAL_MOVE_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Single-edge tangent and tilted single-quad normal numeric movement.',
 limits:['One box, single edge and a 15-degree tilted quad. Multi-selection refusal covered. UV/local rotation and arbitrary faces unsupported.']});
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
 await begin();const multi=await faces();
 await button('Move selection',panel()).click();await f.page.getByLabel('Translation frame',{exact:true}).selectOption('face');assert.ok(await button('Apply transform',panel()).isDisabled());assert.deepEqual((await state()).cage,multi.cage);await button('Cancel transform preview',panel()).click();
 const clickPoint=async(p)=>{const q=await f.page.evaluate(p=>window.__studioScreenOf(p),p);assert.ok(q);await f.page.mouse.click(...q);};
 await button('Edge',panel()).click();await clickPoint([23.75,30,26]);const edge=await state();assert.equal(edge.sel.edges.length,1);
 const [a,b]=[...edge.sel.edges[0]].sort((a,b)=>a-b),ep=edge.cage.positions,vector=[0,1,2].map(k=>ep[3*b+k]-ep[3*a+k]),length=Math.hypot(...vector),direction=vector.map(x=>x/length);
 const verify=(before,after,ids,dir,d)=>{before.cage.positions.forEach((x,i)=>assert.ok(Math.abs(after.cage.positions[i]-(x+(ids.includes(Math.floor(i/3))?dir[i%3]*d:0)))<1e-10));assert.deepEqual(after.cage.faces,before.cage.faces);};
 await button('Move selection',panel()).click();await f.page.getByLabel('Translation frame',{exact:true}).selectOption('edge');
 for(const d of [-1,.5,1]) {await f.page.getByLabel('Selection distance mm',{exact:true}).fill(String(d));verify(edge,await state(),[a,b],direction,d);}
 await f.page.getByLabel('Selection distance mm',{exact:true}).press('Escape');assert.deepEqual((await state()).cage,edge.cage);
 await button('Face',panel()).click();await clickPoint([23.75,32.5,26]);const seed=await state();assert.equal(seed.sel.faces.length,1);
 await button('Rotate selection',panel()).click();await f.page.getByLabel('Rotation world axis',{exact:true}).selectOption('0');await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('15');await apply();const tilted=await state();
 await button('Move selection',panel()).click();await f.page.getByLabel('Translation frame',{exact:true}).selectOption('face');assert.equal(await f.page.getByLabel('Translation world axis',{exact:true}).count(),0);
 const ids=tilted.cage.faces[tilted.sel.faces[0]],normal=[0,-Math.sin(Math.PI/12),Math.cos(Math.PI/12)];
 for(const d of [-1,.5,2]) {await f.page.getByLabel('Selection distance mm',{exact:true}).fill(String(d));verify(tilted,await state(),ids,normal,d);assert.equal((await state()).undo,2);await f.same(base);}
 await f.page.getByLabel('Selection distance mm',{exact:true}).fill('');assert.deepEqual((await state()).cage,tilted.cage);assert.ok(await button('Apply transform',panel()).isDisabled());
 await f.page.getByLabel('Selection distance mm',{exact:true}).fill('2');const scaled=await state();await f.snapshot('local-normal-preview');await apply();
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,tilted.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,scaled.cage);
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,scaled.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);
 const saved=await f.save('local-move');await f.freshOpen(saved.file,accepted,'fresh-open');
});
