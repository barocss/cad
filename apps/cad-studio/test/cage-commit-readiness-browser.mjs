import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'cage-commit-readiness',output:process.argv[2],envFrozen:'D1326_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Unevaluable zero-displacement extrusion stays a draft; Undo and a real4mm gizmo move recover before Done.',
  limits:['One public30×20×16 SubD box with3quads per side; general cage families, async transport fault injection and AT NOT_RUN.']});
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
  for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',3],['Centre X',0],['Centre Y',0],['At Z',0]])await hud.getByLabel(name,{exact:true}).fill(String(value));
  await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();const baseline=await f.save('box-baseline');
  for(const width of [1024,1440]){
    await f.freshOpen(baseline.file,base,`base-${width}`);await f.page.setViewportSize({width,height:900});await command('edit cage');await panel().waitFor();await look('Top');if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();
    await pick('Face',[0,0],16);const original=await state(),face=original.cage.faces[original.sel.faces[0]],target=[face[0],face[1]],mid=[0,1,2].map(k=>(original.cage.positions[3*target[0]+k]+original.cage.positions[3*target[1]+k])/2);
    await button('Delete',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().cage.faces.length===53);await button('Iso').click();await f.page.waitForTimeout(250);await button('Edge',panel()).click();const point=await f.page.evaluate(p=>window.__studioScreenOf(p),mid);await f.page.mouse.dblclick(point[0],point[1]);await f.page.waitForTimeout(150);assert.equal((await state()).sel.edges.length,4);const open=await state();
    const refuse=async()=>{await button('Extrude',panel()).click();await f.page.waitForFunction(()=>window.__studioCage().cage.faces.length===57);await f.page.waitForFunction(()=>{const b=document.querySelector('[aria-label="Done editing cage"]');return b?.getAttribute('aria-disabled')==='true'&&!b.getAttribute('aria-description')?.startsWith('Checking');});const draft=await state();await button('Done editing cage',panel()).click({force:true});await panel().waitFor();assert.deepEqual(await state(),draft);await f.same(base);await button('Done editing cage',panel()).press('Enter');assert.deepEqual(await state(),draft);await f.same(base);await button('Extrude',panel()).hover();await f.page.locator('.tooltip').waitFor();assert.match(await f.page.locator('.tooltip').textContent(),/Move it with the gizmo before Done/);await f.snapshot(`${width}-extrusion-refused`);return draft;};
    await refuse();await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,open.cage);await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await f.same(base);
    const draft=await refuse();const arrow=f.page.locator('.gizmo-arrow[data-gizmo="moveZ"] polygon');await arrow.waitFor();const box=await arrow.boundingBox();assert.ok(box);const delta=await f.page.evaluate(()=>{const a=window.__studioScreenOf([0,0,16]),b=window.__studioScreenOf([0,0,20]);return [b[0]-a[0],b[1]-a[1]];});const x=box.x+box.width/2,y=box.y+box.height/2;await f.page.mouse.move(x,y);await f.page.mouse.down();await f.page.mouse.move(x+delta[0],y+delta[1],{steps:12});await f.page.mouse.up();await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');const moved=await state();assert.equal(moved.cage.faces.length,57);const newVertices=Array.from({length:(draft.cage.positions.length-open.cage.positions.length)/3},(_,i)=>open.cage.positions.length/3+i);for(const v of newVertices)assert.ok(Math.abs(moved.cage.positions[3*v+2]-20)<1e-6);await f.same(base);await f.snapshot(`${width}-moved-ready`);
    await button('Done editing cage',panel()).click();await f.changed(base);const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,moved.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save(`moved-${width}`);await f.freshOpen(saved.file,accepted,`moved-${width}-reopened`);
  }
});
