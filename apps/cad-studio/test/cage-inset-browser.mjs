import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','packages/barocss-cad-model/src/subd/cageInset.ts','apps/cad-studio/src/subd/cageInsetDraft.ts','apps/cad-studio/src/ui/CageInsetControls.tsx'];
const f=await createFlow({name:'cage-inset',output:process.argv[2],envFrozen:'CAGE_INSET_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'One planar convex quad inset, baseline preview/cancel, inner face selection into existing Extrude and native persistence.',
 limits:['One regular box in actual Studio; tilted/invalid/mirror-seam fixtures are pure tests. No multi-face regions or wall thickness.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const topBarHistory = process.argv.includes('--topbar-history');
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
 await begin();await pick('Face',[3.75,2.5,16]);const seed=await state(),faceId=seed.sel.faces[0],face=seed.cage.faces[faceId],corners=face.map(v=>seed.cage.positions.slice(3*v,3*v+3));
 const check=async(d)=>{
  await f.page.getByLabel('Inset distance mm',{exact:true}).fill(String(d));const s=await state();assert.equal(s.undo,1);assert.equal(s.cage.faces.length,seed.cage.faces.length+4);assert.equal(s.cage.positions.length,seed.cage.positions.length+12);assert.deepEqual(s.cage.positions.slice(0,seed.cage.positions.length),seed.cage.positions);
  const lo=[0,1].map(k=>Math.min(...corners.map(p=>p[k])));
  const expected=corners.map(p=>[p[0]===lo[0]?p[0]+d:p[0]-d,p[1]===lo[1]?p[1]+d:p[1]-d,16]);assert.deepEqual(s.cage.positions.slice(seed.cage.positions.length),expected.flat());assert.deepEqual(s.sel.faces,[faceId]);assert.equal(await button('Done editing cage',panel()).getAttribute('aria-disabled'),'true');await f.same(base);return s;
 };
 await button('Inset face',panel()).click();for(const d of [.5,1,1.5])await check(d);
 for(const v of ['', '0','-1','2.5','3']) {await f.page.getByLabel('Inset distance mm',{exact:true}).fill(v);assert.deepEqual((await state()).cage,seed.cage);assert.ok(await button('Apply inset',panel()).isDisabled());}
 await check(1);await f.page.getByLabel('Inset distance mm',{exact:true}).press('Escape');assert.deepEqual((await state()).cage,seed.cage);assert.equal((await state()).undo,0);
 await button('Inset face',panel()).click();await check(.5);await button('Cancel inset preview',panel()).click();assert.deepEqual((await state()).cage,seed.cage);
 await button('Inset face',panel()).click();const inset=await check(1);await f.page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Apply inset'&&!b.disabled));await f.snapshot('inset-ready');await button('Apply inset',panel()).click();
 if (topBarHistory) {
  assert.equal(await button('Undo').getAttribute('data-tip'), 'Undo cage edit');
  await button('Undo').click();
  assert.deepEqual((await state()).cage,seed.cage);
  assert.equal(await button('Redo').getAttribute('data-tip'), 'Redo cage edit');
  await button('Redo').click();
  assert.deepEqual((await state()).cage,inset.cage);
  await f.same(base);
  await f.snapshot('cage-topbar-history-redone');
 } else {
  await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,seed.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,inset.cage);
 }
 await button('Iso').click();await f.page.waitForTimeout(250);await button('Extrude',panel()).click();const extruded=await state();assert.equal(extruded.undo,2);assert.equal(extruded.cage.faces.length,inset.cage.faces.length+4);
 const arrow=f.page.locator('.gizmo-arrow[data-gizmo="moveZ"] polygon');await arrow.waitFor();const box=await arrow.boundingBox();assert.ok(box);
 const delta=await f.page.evaluate(()=>{const a=window.__studioScreenOf([3.75,2.5,16]),b=window.__studioScreenOf([3.75,2.5,18]);return [b[0]-a[0],b[1]-a[1]];});const x=box.x+box.width/2,y=box.y+box.height/2;await f.page.mouse.move(x,y);await f.page.mouse.down();await f.page.mouse.move(x+delta[0],y+delta[1],{steps:12});await f.page.mouse.up();
 const moved=await state();assert.equal(moved.undo,3);for(const v of moved.cage.faces[moved.sel.faces[0]])assert.ok(Math.abs(moved.cage.positions[3*v+2]-18)<1e-6);
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,extruded.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,moved.cage);await f.snapshot('inset-extruded');await done();
 const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,moved.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);const saved=await f.save('inset-extruded');await f.freshOpen(saved.file,accepted,'fresh-open');
});
