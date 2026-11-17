import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageProportional.ts','apps/cad-studio/src/ui/CageProportionalControls.tsx','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/subd/cageTransformDraft.ts','apps/cad-studio/src/ui/CageTransformControls.tsx'];
const f=await createFlow({name:'cage-proportional-move',output:process.argv[2],envFrozen:'CAGE_PROPORTIONAL_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Connected graph-distance proportional vertex translation with independent Manhattan-distance oracle.',
 limits:['One box top-centre seed, numeric Z displacement and radius. Disconnected/mirror/irregular graph tested purely. Drag/weight-colour overlay unsupported.']});
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
 const apply=async()=>{await f.page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Apply transform'&&!b.disabled));await button('Apply transform',panel()).click();};
 await begin();await button('Vertex',panel()).click();const q=await f.page.evaluate(()=>window.__studioScreenOf([20,30,26]));assert.ok(q);await f.page.mouse.click(...q);const seed=await state();assert.equal(seed.sel.vertices.length,1);assert.deepEqual(seed.cage.positions.slice(seed.sel.vertices[0]*3,seed.sel.vertices[0]*3+3),[20,30,26]);
 const verify=(after,radius,distance,enabled=true)=>{const p=seed.cage.positions;for(let v=0;v<p.length/3;v++){const [x,y,z]=p.slice(3*v,3*v+3),d=z===26?Math.abs(x-20)+Math.abs(y-30):Infinity,u=Math.min(d/radius,1),w=enabled?1-3*u*u+2*u*u*u:(v===seed.sel.vertices[0]?1:0);for(let k=0;k<3;k++)assert.ok(Math.abs(after.cage.positions[3*v+k]-(p[3*v+k]+(k===2?w*distance:0)))<1e-10);}assert.deepEqual(after.cage.faces,seed.cage.faces);assert.deepEqual(after.sel,seed.sel);};
 await button('Move selection',panel()).click();await f.page.getByLabel('Selection distance mm',{exact:true}).fill('2');verify(await state(),10,2,false);
 await f.page.getByLabel('Connected proportional move',{exact:true}).check();
 for(const radius of [5,7.5,10]) {await f.page.getByLabel('Proportional graph radius mm',{exact:true}).fill(String(radius));for(const d of [-1,.5,2]){await f.page.getByLabel('Selection distance mm',{exact:true}).fill(String(d));verify(await state(),radius,d);assert.equal((await state()).undo,1);await f.same(base);}}
 await f.page.getByLabel('Proportional affected vertices',{exact:true}).click();assert.match(await f.page.getByLabel('Proportional affected vertices',{exact:true}).innerText(),/^5 vertices/);await f.snapshot('proportional-preview');
 for(const radius of ['','0','-1']){await f.page.getByLabel('Proportional graph radius mm',{exact:true}).fill(radius);assert.deepEqual((await state()).cage,seed.cage);assert.ok(await button('Apply transform',panel()).isDisabled());}
 await f.page.getByLabel('Proportional graph radius mm',{exact:true}).press('Escape');assert.deepEqual((await state()).cage,seed.cage);assert.equal((await state()).undo,0);
 await button('Move selection',panel()).click();await f.page.getByLabel('Connected proportional move',{exact:true}).check();await f.page.getByLabel('Selection distance mm',{exact:true}).fill('2');await f.page.getByLabel('Connected proportional move',{exact:true}).uncheck();verify(await state(),10,2,false);await f.page.getByLabel('Connected proportional move',{exact:true}).check();const scaled=await state();verify(scaled,10,2);await apply();
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,seed.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,scaled.cage);
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,scaled.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);
 const saved=await f.save('proportional-move');await f.freshOpen(saved.file,accepted,'fresh-open');
});
