import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'cage-selection-mode',output:process.argv[2],envFrozen:'D1324_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Fill, boundary double-click and cage history keep displayed pick mode aligned with actual selection.',
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
  let lastAccepted;
  for(const width of [1024,1440])for(const display of ['Box','Smooth']){
    await f.freshOpen(baseline.file,base,`base-${width}-${display}`);await f.page.setViewportSize({width,height:900});await command('edit cage');await panel().waitFor();await look('Top');if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button(display,panel()).click();
    await pick('Face',[3.75,2.5],16);const original=await state(),face=original.cage.faces[original.sel.faces[0]];assert.equal(face.length,4);
    const target=[face[0],face[1]],mid=[0,1,2].map(axis=>(original.cage.positions[3*target[0]+axis]+original.cage.positions[3*target[1]+axis])/2);
    await button('Delete',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().cage.faces.length===95);const opened=await state();assert.equal(opened.undo,1);await button('Iso').click();await f.page.waitForTimeout(250);
    const edgePick=async(double=false)=>{await button('Vertex',panel()).click();await button('Edge',panel()).click();const pt=await f.page.evaluate(p=>window.__studioScreenOf(p),mid);assert.ok(pt);if(double)await f.page.mouse.dblclick(pt[0],pt[1]);else await f.page.mouse.click(pt[0],pt[1]);await f.page.waitForTimeout(150);};
    await edgePick();const single=await state();assert.equal(single.sel.edges.length,1);assert.deepEqual([...single.sel.edges[0]].sort((a,b)=>a-b),[...target].sort((a,b)=>a-b));
    await button('Loop',panel()).click();const looped=await state();assert.equal(looped.sel.edges.length,4);assert.equal(looped.undo,1);assert.deepEqual(looped.cage,opened.cage);
    await button('Face',panel()).click();const px=await f.page.evaluate(p=>window.__studioScreenOf(p),mid);await f.page.mouse.dblclick(px[0],px[1]);await f.page.waitForTimeout(150);assert.equal((await state()).mode,'edge');assert.equal(await button('Edge',panel()).getAttribute('aria-pressed'),'true');const doubled=await state();const keys=edges=>edges.map(e=>[...e].sort((a,b)=>a-b).join(':')).sort();assert.deepEqual(keys(doubled.sel.edges),keys(looped.sel.edges));assert.equal(doubled.undo,1);
    await edgePick();await button('Loop',panel()).click();await f.snapshot(`${width}-${display}-loop-four`);await button('Fill',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().cage.faces.length===96);const filled=await state();assert.equal(filled.undo,2);assert.equal(filled.mode,'face');assert.equal(filled.sel.faces.length,1);assert.equal(await button('Face',panel()).getAttribute('aria-pressed'),'true');await button('Face',panel()).click();assert.deepEqual((await state()).sel,filled.sel);await f.page.getByText('barocss',{exact:true}).click();await f.page.keyboard.press('3');assert.deepEqual((await state()).sel,filled.sel);await button('Delete',panel()).click();assert.equal((await state()).cage.faces.length,95);await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,filled.cage);assert.equal((await state()).mode,'face');assert.deepEqual((await state()).sel,filled.sel);
    await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,opened.cage);assert.equal((await state()).mode,'edge');assert.equal((await state()).sel.edges.length,4);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,filled.cage);assert.equal((await state()).mode,'face');assert.deepEqual((await state()).sel,filled.sel);await f.same(base);await f.snapshot(`${width}-${display}-filled`);
    if(width===1440&&display==='Smooth'){await button('Done editing cage',panel()).click();await f.changed(base);lastAccepted=await f.doc();assert.deepEqual(lastAccepted.nodes.find(n=>n.kind==='subd').cage,filled.cage);await f.undo();await f.same(base);await f.redo();await f.same(lastAccepted);}else{await button('Cancel cage edit',panel()).click();await f.same(base);}
  }
  const saved=await f.save('filled-box');await f.freshOpen(saved.file,lastAccepted,'filled-box-reopened');
});
