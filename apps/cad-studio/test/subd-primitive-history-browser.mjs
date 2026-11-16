import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const f=await createFlow({name:'subd-primitive-history',output:process.argv[2],envFrozen:'SUBD_PRIMITIVE_FROZEN',initialFiles:['apps/cad-studio/test/subd-primitive-history-browser.mjs','apps/cad-studio/src/subd/useCageEditor.ts'],qualification:'Original SubD Torus/Tube recipes edit through History without inferring from changed cages.'});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true}),hud=()=>f.page.locator('.hud'),panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async name=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(name);};
const ready=()=>f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&!b.disabled),null,{timeout:60000});
const field=name=>hud().getByLabel(name,{exact:true});
const open=async doc=>{await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'subd.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);};
async function edit(label){await f.openFeatureEditor(0);await button(`Edit SubD ${label}`,f.editor()).click();await hud().waitFor();await ready();}
async function pick(mode){
 await button(mode,panel()).click();const cage=(await f.page.evaluate(()=>window.__studioCage())).cage;
 const point=i=>cage.positions.slice(i*3,i*3+3),avg=ids=>[0,1,2].map(k=>ids.reduce((s,i)=>s+point(i)[k],0)/ids.length);
 const candidates=mode==='Vertex'?Array.from({length:cage.positions.length/3},(_,i)=>point(i)):mode==='Edge'?cage.faces.flatMap(face=>face.map((i,j)=>avg([i,face[(j+1)%face.length]]))):cage.faces.map(avg);
 for(const at of candidates.sort((a,b)=>b[2]-a[2]).slice(0,12)){
  const px=await f.page.evaluate(at=>window.__studioScreenOf(at),at);if(!px)continue;
  if(!await f.page.evaluate(px=>document.elementFromPoint(...px)?.matches('canvas.vp-canvas'),px))continue;
  await f.page.mouse.click(...px);await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const s=await f.page.evaluate(()=>window.__studioCage());if(s.sel[mode==='Vertex'?'vertices':mode==='Edge'?'edges':'faces'].length)return;
 }assert.fail(`actual ${mode} pick`);
}
await f.run(async()=>{
 await f.newPage();
 for(const kind of ['torus','tube']){
  await button('New part').click();await f.ready();await command(`SubD ${kind}`);
  for(const [label,value] of Object.entries(kind==='torus'?{'Ring radius':12,'Tube radius':3,'Quads round':8,'Quads across':4}:{'Outer radius':12,'Inner radius':8,'Length':20,'Quads round':8,'Quads along':2}))await field(label).fill(String(value));
  for(const label of ['Centre X','Centre Y','At Z'])await field(label).fill('0');await ready();await button('Apply',hud()).click();await hud().waitFor({state:'hidden'});await f.ready();const made=await f.doc();assert.equal(made.nodes[0].made.nodes,1);
  await edit(kind);await field('Quads round').fill('8.5');await f.page.waitForFunction(()=>[...document.querySelectorAll('.hud button')].some(b=>b.textContent.trim()==='Apply'&&b.disabled));await f.same(made);
  await field('Quads round').fill('10');await field(kind==='torus'?'Ring radius':'Length').fill(kind==='torus'?'15':'26');await ready();await button('Apply',hud()).click();await f.changed(made);await hud().waitFor({state:'hidden'});const edited=await f.doc();assert.equal(edited.nodes.length,1);assert.equal(edited.nodes[0].id,made.nodes[0].id);assert.deepEqual(edited.outputs,made.outputs);assert.equal(edited.nodes[0].cage.faces.length,kind==='torus'?40:60);assert.notDeepEqual(edited.nodes[0].cage,made.nodes[0].cage);await f.snapshot(`${kind}-history-applied`);
  await f.undo();await f.same(made);await f.redo();await f.same(edited);await open(edited);await edit(kind);assert.equal(await field('Quads round').inputValue(),'10');await button('Cancel',hud()).click();await hud().waitFor({state:'hidden'});await f.same(edited);
  await f.page.locator('.outliner .ol-row > button.ol').first().click();await command('Edit cage');await panel().waitFor();await button('Top').click();await button('Box',panel()).click();await button('Smooth',panel()).click();await button('Box',panel()).click();
  for(const mode of ['Vertex','Edge','Face'])await pick(mode);await button('Cancel cage edit',panel()).click();await panel().waitFor({state:'detached'});await f.same(edited);
  if(kind==='torus'){
   await command('Edit cage');await panel().waitFor();await button('Box',panel()).click();await pick('Edge');await button('Crease',panel()).click();await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false',null,{timeout:60000});await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.changed(edited);const sculpted=await f.doc();assert.equal(sculpted.nodes[0].made,undefined);await f.openFeatureEditor(0);assert.equal(await button('Edit SubD torus',f.editor()).count(),0);await f.closeEditor();await f.undo();await f.same(edited);await f.redo();await f.same(sculpted);await f.snapshot('manual-cage-recipe-retired');
  }
 }
 assert.deepEqual(f.report.downloads,[]);
});
