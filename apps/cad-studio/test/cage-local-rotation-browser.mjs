import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/subd/cageLocalDirection.ts','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/subd/cageTransformDraft.ts','apps/cad-studio/src/ui/CageTransformControls.tsx'];
const f=await createFlow({name:'cage-local-rotation',output:process.argv[2],envFrozen:'CAGE_LOCAL_ROTATION_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Numeric rotation about a tilted face normal with independent conjugated planar rotation oracle.',
 limits:['One box, normal rotation on a 15-degree tilted quad and explicit pivot. Other local axes/mirror/refusals covered by pure tests. No drag support.']});
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
 const faceIds=tilted.cage.faces[tilted.sel.faces[0]],oblique=faceIds.map((v,i)=>[v,faceIds[(i+1)%faceIds.length]]).find(([a,b])=>Math.abs(tilted.cage.positions[3*a+2]-tilted.cage.positions[3*b+2])>.1);assert.ok(oblique);
 await button('Edge',panel()).click();await clickPoint([0,1,2].map(k=>(tilted.cage.positions[3*oblique[0]+k]+tilted.cage.positions[3*oblique[1]+k])/2));assert.equal((await state()).sel.edges.length,1);
 await button('Rotate selection',panel()).click();await f.page.getByLabel('Rotation frame',{exact:true}).selectOption('edge');await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('37');assert.deepEqual((await state()).cage,tilted.cage);assert.equal((await state()).undo,1);await apply();assert.equal((await state()).undo,1);
 await button('Face',panel()).click();await clickPoint([23.75,32.5,26]);assert.deepEqual((await state()).sel,tilted.sel);
 const ids=tilted.cage.faces[tilted.sel.faces[0]],centre=[0,1,2].map(k=>ids.reduce((sum,id)=>sum+tilted.cage.positions[3*id+k],0)/ids.length);
 const verifyRotation=(after,degrees,pivot=centre)=>{const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=Math.cos(Math.PI/12),sx=Math.sin(Math.PI/12);tilted.cage.positions.forEach((x,i)=>{const id=Math.floor(i/3),k=i%3;if(!ids.includes(id)){assert.equal(after.cage.positions[i],x);return;}const p=tilted.cage.positions.slice(3*id,3*id+3).map((v,j)=>v-pivot[j]);const local=[p[0],cx*p[1]+sx*p[2],-sx*p[1]+cx*p[2]],q=[c*local[0]-s*local[1],s*local[0]+c*local[1],local[2]],world=[q[0],cx*q[1]-sx*q[2],sx*q[1]+cx*q[2]];assert.ok(Math.abs(after.cage.positions[i]-(world[k]+pivot[k]))<1e-10);});assert.deepEqual(after.cage.faces,tilted.cage.faces);};
 const openLocal=async()=>{await button('Rotate selection',panel()).click();await f.page.getByLabel('Rotation frame',{exact:true}).selectOption('face');};
 await openLocal();assert.equal(await f.page.getByLabel('Rotation world axis',{exact:true}).count(),0);await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('360');assert.deepEqual((await state()).cage,tilted.cage);await apply();assert.equal((await state()).undo,1);
 await openLocal();for(const angle of [-10,5,15]){await f.page.getByLabel('Selection angle degrees',{exact:true}).fill(String(angle));verifyRotation(await state(),angle);assert.equal((await state()).undo,2);await f.same(base);}
 await f.page.getByLabel('Selection pivot',{exact:true}).selectOption('vertex');await f.page.getByLabel('Pivot cage vertex',{exact:true}).fill(String(ids[0]));verifyRotation(await state(),15,tilted.cage.positions.slice(ids[0]*3,ids[0]*3+3));
 await f.page.getByLabel('Pivot cage vertex',{exact:true}).fill('-1');assert.deepEqual((await state()).cage,tilted.cage);assert.ok(await button('Apply transform',panel()).isDisabled());await f.page.getByLabel('Pivot cage vertex',{exact:true}).press('Escape');assert.deepEqual((await state()).cage,tilted.cage);
 await openLocal();await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('10');const scaled=await state();verifyRotation(scaled,10);await f.snapshot('local-rotation-preview');await apply();
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,tilted.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,scaled.cage);
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,scaled.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);
 const saved=await f.save('local-rotation');await f.freshOpen(saved.file,accepted,'fresh-open');
});
