import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'cage-mirror-noop',output:process.argv[2],envFrozen:'CAGE_MIRROR_FROZEN',initialFiles:pins,requiredFrozen:pins,
  qualification:'Mirror-plane drags preserve history; Weld near identifies selection prerequisite.',
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
    await f.newPage();await f.openFile(baseline.file,base.nodes.length);await f.page.setViewportSize({width,height:900});await command('edit cage');await panel().waitFor();
    const weld=button('Weld near',panel());assert.equal(await weld.getAttribute('aria-disabled'),'true');assert.match(await weld.getAttribute('aria-description'),/at least two vertices/);const empty=await state();await weld.click({force:true});assert.deepEqual(await state(),empty);
    assert.match(await panel().getByLabel('Mirror source and replacement').innerText(),/positive side.*negative side/);
    await panel().getByLabel('Mirror',{exact:true}).selectOption('x');await look('Top');if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();await pick('Vertex',[0,-10],16);
    const selected=await state();assert.equal(selected.sel.vertices.length,1);assert.equal(selected.cage.positions[3*selected.sel.vertices[0]],0);
    const arrow=f.page.locator('.gizmo-arrow[data-gizmo="moveX"] polygon');await arrow.waitFor();const box=await arrow.boundingBox();assert.ok(box);
    const delta=await f.page.evaluate(()=>{const a=window.__studioScreenOf([0,-10,16]),b=window.__studioScreenOf([5,-10,16]);return [b[0]-a[0],b[1]-a[1]];});
    const x=box.x+box.width/2,y=box.y+box.height/2;await f.page.mouse.move(x,y);await f.page.mouse.down();await f.page.mouse.move(x+delta[0],y+delta[1],{steps:12});await f.page.mouse.up();
    const after=await state();assert.deepEqual(after.cage,selected.cage);assert.equal(after.undo,selected.undo);await f.same(base);await f.snapshot('constrained-drag-'+width);
    await button('Undo cage step',panel()).click();assert.equal((await state()).undo,0);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,after.cage);
    await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.ready();const accepted=await f.doc();assert.equal(accepted.nodes.find(n=>n.kind==='subd').mirror,'x');await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save('mirror-'+width);await f.freshOpen(saved.file,accepted,'reopened-'+width);
  }
});
