import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const planeBaseline = process.argv.includes('--expect-no-plane-turn');
const baseline = planeBaseline || process.argv.includes('--expect-no-normal-turn');
const localFrame = process.argv.includes('--v-turn') ? 'face-v' : process.argv.includes('--u-turn') || planeBaseline ? 'face-u' : 'face';
const physical = baseline || localFrame !== 'face' || process.argv.includes('--normal-turn');
const rotationAxis = localFrame === 'face-u' ? 0 : localFrame === 'face-v' ? 1 : 2;
const localLabel = 'UVN'[rotationAxis];
const pins=['packages/barocss-cad-model/src/subd/cageLocalDirection.ts','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/subd/cageTransformDraft.ts','apps/cad-studio/src/ui/CageTransformControls.tsx'];
if (physical) pins.push('apps/cad-studio/src/subd/useCageGizmo.ts', 'apps/cad-studio/src/viewport/viewportPointerInput.ts',
 'apps/cad-studio/src/viewport/gizmo.ts', 'apps/cad-studio/src/viewport/GizmoMarks.tsx', 'apps/cad-studio/test/cage-local-rotation-browser.mjs');
const f=await createFlow({name:'cage-local-rotation',output:process.argv[2],envFrozen:'CAGE_LOCAL_ROTATION_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:physical ? `Physical ${localLabel} rotation of one tilted quad in oblique perspective.`
   : 'Numeric rotation about a tilted face normal with independent conjugated planar rotation oracle.',
 limits:['One box, normal rotation on a 15-degree tilted quad. Exact coordinates use a conjugated planar oracle.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const done=async()=>{await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.ready();};
async function dragLocal(base, tilted, centre, degreesOfTilt, verify, openLocal, apply) {
 const tool=panel().getByLabel('Cage drag tool',{exact:true});
 const frame=panel().getByLabel('Rotate drag frame',{exact:true});
 const mark=f.page.locator('[data-gizmo="turnAlong"]');
 await tool.selectOption('rotate');
 if (baseline) {
  if (planeBaseline) assert.equal(await frame.locator('option[value="face-u"],option[value="face-v"]').count(),0);
  else assert.equal(await frame.count(),0);
  assert.equal(await mark.count(),0);
  await f.snapshot('original-world-rotation-only');
  await openLocal();
  await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('15');
  verify(await state(),15);
  await f.same(base);
  return;
 }
 assert.equal(await frame.inputValue(),'world');
 await frame.selectOption(localFrame);
 const viewingAxis=rotationAxis===0?1:0;
 await button(viewingAxis===0?'Right':'Front').click();
 await f.page.waitForFunction(({centre,viewingAxis})=>{
  const a=window.__studioScreenOf(centre), b=window.__studioScreenOf(centre.map((v,k)=>v+(k===viewingAxis?8:0)));
  return Math.hypot(a[0]-b[0],a[1]-b[1])<0.02;
 },{centre,viewingAxis});
 await mark.waitFor({state:'detached'});
 assert.equal(await f.page.locator('[data-gizmo^="turn"]').count(),0);
 await f.same(base);
 await f.snapshot('face-normal-edge-on');
 await button('Iso').click();
 if (await button('Ortho').getAttribute('aria-pressed')==='true') await button('Ortho').click();
 await mark.waitFor();
 assert.equal(await f.page.locator('[data-gizmo^="turn"]').count(),1);
 const readout=f.page.locator('.gizmo-readout'), undo=()=>button('Undo cage step',panel()).click();
 async function start(angle) {
  const hit=await mark.locator('polyline').last().evaluate(async (line,{centre,tilt,angle,rotationAxis})=>{
   let previous='', stable=0;
   for(let i=0;i<160&&stable<8;i++){
    await new Promise(requestAnimationFrame);
    const current=line.getAttribute('points');
    stable=current&&current===previous?stable+1:0;previous=current;
   }
   if(stable<8)throw Error('Normal rotation projection has not settled');
   const rect=line.closest('svg').getBoundingClientRect(), last=line.points.numberOfItems-1;
   const p=line.points.getItem(Math.floor(last/2));
   const x=rect.x+p.x,y=rect.y+p.y,t=tilt*Math.PI/180, phi=Math.PI/4;
   const basis=[[1,0,0],[0,Math.cos(t),Math.sin(t)],[0,-Math.sin(t),Math.cos(t)]];
   const u=basis[(rotationAxis+1)%3],v=basis[(rotationAxis+2)%3];
   const world=(radius,a)=>centre.map((value,i)=>value+radius*(Math.cos(a)*u[i]+Math.sin(a)*v[i]));
   const worldScreen=(radius,a)=>window.__studioScreenOf(world(radius,a));
   const origin=worldScreen(0,0), len=Math.hypot(x-origin[0],y-origin[1]);
   let lo=0,hi=20;
   while(Math.hypot(...worldScreen(hi,phi).map((v,i)=>v-origin[i]))<len&&hi<1000)hi*=2;
   for(let i=0;i<45;i++){
    const radius=(lo+hi)/2,q=worldScreen(radius,phi);
    if(Math.hypot(q[0]-origin[0],q[1]-origin[1])<len)lo=radius;else hi=radius;
   }
   const originCheck=worldScreen((lo+hi)/2,phi);
   const end=worldScreen((lo+hi)/2,phi+angle*Math.PI/180);
   const sweep=(Math.atan2(end[1]-origin[1],end[0]-origin[0])-Math.atan2(y-origin[1],x-origin[0]))*180/Math.PI;
   return {x,y,end,sweep:((sweep+540)%360)-180,mismatch:Math.hypot(originCheck[0]-x,originCheck[1]-y),
    onCanvas:document.elementFromPoint(x,y)?.matches('canvas.vp-canvas')};
  },{centre,tilt:degreesOfTilt,angle,rotationAxis});
  assert.ok(hit.onCanvas&&hit.mismatch<0.5,JSON.stringify(hit));
  await f.page.mouse.move(hit.x,hit.y);
  await f.page.locator('[data-gizmo="turnAlong"][data-active="true"]').waitFor();
  await f.page.mouse.down();
  await f.page.mouse.move(...hit.end,{steps:16});
  await readout.filter({hasText:`${localLabel} ${angle}°`}).waitFor();
  return hit.sweep;
 }
 f.phase='hold a projected normal rotation and cancel it with Escape';
 const screenSweep=await start(30);
 if (rotationAxis===2) assert.ok(Math.abs(Math.abs(screenSweep)-30)>10,JSON.stringify(screenSweep));
 assert.deepEqual(await state(),tilted);
 await f.same(base);
 await f.snapshot('face-normal-rotation-preview');
 await f.page.keyboard.press('Escape');await f.page.mouse.up();
 assert.deepEqual(await state(),tilted);
 f.phase='discard local turn when the pointer view changes';
 await start(30);
 await f.page.mouse.wheel(0,200);
 await readout.waitFor({state:'detached'});
 await f.page.mouse.up();
 assert.deepEqual(await state(),tilted);
 await start(30);
 await f.page.setViewportSize({width:1470,height:1000});
 await f.page.mouse.up();
 await readout.waitFor({state:'detached'});
 assert.deepEqual(await state(),tilted);
 await f.page.setViewportSize({width:1440,height:1000});
 await f.same(base);
 f.phase='apply both world-plane directions';
 for(const angle of [-30,30]){
  await start(angle);await f.page.mouse.up();
  const rotated=await state();verify(rotated,angle);
  assert.deepEqual(rotated.sel,tilted.sel);
  assert.deepEqual(rotated.cage.creases,tilted.cage.creases);
  assert.equal(rotated.undo,tilted.undo+1);
  await undo();assert.deepEqual(await state(),tilted);
 }
 await start(30);await f.page.mouse.up();
 const rotated=await state();verify(rotated,30);
 await undo();
 await button('Redo cage step',panel()).click();
 assert.deepEqual(await state(),rotated);
 await undo();
 await openLocal();
 await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('30');
 await apply();
 assert.deepEqual(await state(),rotated);
 await undo();
 await start(30);await f.page.mouse.up();
 assert.deepEqual(await state(),rotated);
 await done();
 const accepted=await f.doc();
 assert.deepEqual(accepted.nodes.find(node=>node.kind==='subd').cage,rotated.cage);
 await f.undo();await f.same(base);await f.redo();await f.same(accepted);
 const saved=await f.save('normal-rotation-drag');
 await f.freshOpen(saved.file,accepted,'normal-rotation-drag-reopened');
 f.report.observations.push({axis:localLabel,tilt:degreesOfTilt,planeSweep:30,screenSweep,independentNumericParity:true});
}
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
 if (physical && !baseline) {
  const tool=panel().getByLabel('Cage drag tool',{exact:true});
  await tool.selectOption('rotate');
  const frame=panel().getByLabel('Rotate drag frame',{exact:true});
  await frame.selectOption(localFrame);
  await panel().getByRole('status').filter({hasText:'pick exactly one planar convex quad face'}).waitFor();
  assert.equal(await f.page.locator('[data-gizmo^="turn"]').count(),0);
  assert.deepEqual(await state(),multi);
  await frame.selectOption('world');
  await tool.selectOption('move');
 }
 await button('Move selection',panel()).click();await f.page.getByLabel('Translation frame',{exact:true}).selectOption('face');assert.ok(await button('Apply transform',panel()).isDisabled());assert.deepEqual((await state()).cage,multi.cage);await button('Cancel transform preview',panel()).click();
 const clickPoint=async(p)=>{const q=await f.page.evaluate(p=>window.__studioScreenOf(p),p);assert.ok(q);await f.page.mouse.click(...q);};
 await button('Edge',panel()).click();await clickPoint([23.75,30,26]);const edge=await state();assert.equal(edge.sel.edges.length,1);
 const [a,b]=[...edge.sel.edges[0]].sort((a,b)=>a-b),ep=edge.cage.positions,vector=[0,1,2].map(k=>ep[3*b+k]-ep[3*a+k]),length=Math.hypot(...vector),direction=vector.map(x=>x/length);
 const verify=(before,after,ids,dir,d)=>{before.cage.positions.forEach((x,i)=>assert.ok(Math.abs(after.cage.positions[i]-(x+(ids.includes(Math.floor(i/3))?dir[i%3]*d:0)))<1e-10));assert.deepEqual(after.cage.faces,before.cage.faces);};
 await button('Move selection',panel()).click();await f.page.getByLabel('Translation frame',{exact:true}).selectOption('edge');
 for(const d of [-1,.5,1]) {await f.page.getByLabel('Selection distance mm',{exact:true}).fill(String(d));verify(edge,await state(),[a,b],direction,d);}
 await f.page.getByLabel('Selection distance mm',{exact:true}).press('Escape');assert.deepEqual((await state()).cage,edge.cage);
 await button('Face',panel()).click();await clickPoint([23.75,32.5,26]);const seed=await state();assert.equal(seed.sel.faces.length,1);
 const degreesOfTilt=physical?-15:15;
 await button('Rotate selection',panel()).click();await f.page.getByLabel('Rotation world axis',{exact:true}).selectOption('0');await f.page.getByLabel('Selection angle degrees',{exact:true}).fill(String(degreesOfTilt));await apply();const tilted=await state();
 const faceIds=tilted.cage.faces[tilted.sel.faces[0]],oblique=faceIds.map((v,i)=>[v,faceIds[(i+1)%faceIds.length]]).find(([a,b])=>Math.abs(tilted.cage.positions[3*a+2]-tilted.cage.positions[3*b+2])>.1);assert.ok(oblique);
 await button('Edge',panel()).click();await clickPoint([0,1,2].map(k=>(tilted.cage.positions[3*oblique[0]+k]+tilted.cage.positions[3*oblique[1]+k])/2));assert.equal((await state()).sel.edges.length,1);
 await button('Rotate selection',panel()).click();await f.page.getByLabel('Rotation frame',{exact:true}).selectOption('edge');await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('37');assert.deepEqual((await state()).cage,tilted.cage);assert.equal((await state()).undo,1);await apply();assert.equal((await state()).undo,1);
 await button('Face',panel()).click();await clickPoint([23.75,32.5,26]);assert.deepEqual((await state()).sel,tilted.sel);
 const ids=tilted.cage.faces[tilted.sel.faces[0]],centre=[0,1,2].map(k=>ids.reduce((sum,id)=>sum+tilted.cage.positions[3*id+k],0)/ids.length);
 const verifyRotation=(after,degrees,pivot=centre)=>{
  const a=degrees*Math.PI/180,c=Math.cos(a),s=Math.sin(a),cx=Math.cos(degreesOfTilt*Math.PI/180),sx=Math.sin(degreesOfTilt*Math.PI/180);
  const u=(rotationAxis+1)%3,v=(rotationAxis+2)%3;
  tilted.cage.positions.forEach((x,i)=>{
   const id=Math.floor(i/3),k=i%3;
   if(!ids.includes(id)){assert.equal(after.cage.positions[i],x);return;}
   const p=tilted.cage.positions.slice(3*id,3*id+3).map((v,j)=>v-pivot[j]);
   const local=[p[0],cx*p[1]+sx*p[2],-sx*p[1]+cx*p[2]],q=[...local];
   q[u]=c*local[u]-s*local[v]; q[v]=s*local[u]+c*local[v];
   const world=[q[0],cx*q[1]-sx*q[2],sx*q[1]+cx*q[2]];
   assert.ok(Math.abs(after.cage.positions[i]-(world[k]+pivot[k]))<1e-10);
  });
  assert.deepEqual(after.cage.faces,tilted.cage.faces);
 };
 const openLocal=async()=>{await button('Rotate selection',panel()).click();await f.page.getByLabel('Rotation frame',{exact:true}).selectOption(localFrame);};
 if(physical){await dragLocal(base,tilted,centre,degreesOfTilt,verifyRotation,openLocal,apply);return;}
 await openLocal();assert.equal(await f.page.getByLabel('Rotation world axis',{exact:true}).count(),0);await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('360');assert.deepEqual((await state()).cage,tilted.cage);await apply();assert.equal((await state()).undo,1);
 await openLocal();for(const angle of [-10,5,15]){await f.page.getByLabel('Selection angle degrees',{exact:true}).fill(String(angle));verifyRotation(await state(),angle);assert.equal((await state()).undo,2);await f.same(base);}
 await f.page.getByLabel('Selection pivot',{exact:true}).selectOption('vertex');await f.page.getByLabel('Pivot cage vertex',{exact:true}).fill(String(ids[0]));verifyRotation(await state(),15,tilted.cage.positions.slice(ids[0]*3,ids[0]*3+3));
 await f.page.getByLabel('Pivot cage vertex',{exact:true}).fill('-1');assert.deepEqual((await state()).cage,tilted.cage);assert.ok(await button('Apply transform',panel()).isDisabled());await f.page.getByLabel('Pivot cage vertex',{exact:true}).press('Escape');assert.deepEqual((await state()).cage,tilted.cage);
 await openLocal();await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('10');const scaled=await state();verifyRotation(scaled,10);await f.snapshot('local-rotation-preview');await apply();
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,tilted.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,scaled.cage);
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,scaled.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);
 const saved=await f.save('local-rotation');await f.freshOpen(saved.file,accepted,'fresh-open');
});
