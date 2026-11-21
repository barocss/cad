import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const scaleBaseline = process.argv.includes('--expect-no-scale-drag');
const pivotBaseline = process.argv.includes('--expect-no-vertex-pivot');
const stalePivot = process.argv.includes('--expect-stale-pivot');
const pivotTopology = stalePivot || process.argv.includes('--pivot-topology');
const vertexScale = pivotBaseline || pivotTopology || process.argv.includes('--vertex-scale');
const scaleDrag = scaleBaseline || vertexScale || process.argv.includes('--scale-drag');
const pins=['packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/subd/cageTransformDraft.ts','apps/cad-studio/src/ui/CageTransformControls.tsx'];
if (scaleDrag) pins.push('apps/cad-studio/src/subd/useCageGizmo.ts', 'apps/cad-studio/src/viewport/gizmo.ts',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts', 'apps/cad-studio/test/cage-selection-transform-browser.mjs');
const f=await createFlow({name:'cage-selection-transform',output:process.argv[2],envFrozen:'CAGE_TRANSFORM_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification: vertexScale ? 'Physical uniform scaling of two connected cage faces about one exact cage vertex.'
   : scaleDrag ? 'Physical uniform scaling of two connected cage faces about the original centre, compared with numeric Scale.'
   : 'Numeric world-axis rotation and uniform scale on selected faces, explicit pivot, no-op/cancel/history and native persistence.',
 limits:['One box and two connected top faces. No arbitrary cage or mirror claims.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const pick=async(mode,p)=>{
 await button(mode==='Vertex'?'Edge':'Vertex',panel()).click(); await button(mode,panel()).click();
 const point=await f.page.evaluate(p=>window.__studioScreenOf(p),p);assert.ok(point);await f.page.mouse.click(...point);await f.page.waitForTimeout(120);
};
const done=async()=>{await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.ready();};
async function scaleSelection(seed, base, verify, apply) {
 const tool = panel().getByLabel('Cage drag tool', {exact:true});
 const centre = f.page.locator('[data-gizmo="scale"]');
 const pivotMode = panel().getByLabel('Scale drag pivot', {exact:true});
 const vertex = panel().getByRole('spinbutton', {name:'Scale drag vertex ID',exact:true});
 const expectPivot = async pivot => f.page.waitForFunction(pivot=>{
  const mark=document.querySelector('[data-gizmo="scale"]');
  if(!mark)return false;
  const box=mark.getBoundingClientRect();
  const [x,y]=window.__studioScreenOf(pivot);
  return Math.hypot(box.x+box.width/2-x,box.y+box.height/2-y)<0.5;
 },pivot);
 if (scaleBaseline) {
  assert.equal(await centre.count(),0);
  assert.equal(await tool.count(),0);
  await button('Scale selection',panel()).click();
  await f.page.getByRole('spinbutton',{name:'Selection scale ratio',exact:true}).waitFor();
  await f.snapshot('original-numeric-scale');
  await f.same(base);
  return;
 }
 assert.equal(await tool.inputValue(),'move');
 await tool.selectOption('scale');
 await centre.waitFor();
 assert.equal(await f.page.locator('[data-gizmo^="move"]').count(),0);
 if (pivotBaseline) {
  assert.equal(await pivotMode.count(),0);
  await f.snapshot('original-centre-scale');
  await f.same(base);
  return;
 }
 let vertexId, pivot;
 if (vertexScale) {
  assert.equal(await pivotMode.inputValue(),'centre');
  await pivotMode.selectOption('vertex');
  const unavailable = panel().getByRole('status').filter({hasText:'Enter a current cage vertex ID'});
  for (const invalid of ['', '-1', '2.5', String(seed.cage.positions.length / 3)]) {
   await vertex.fill(invalid);
   await unavailable.waitFor();
   assert.equal(await centre.count(),0);
   assert.deepEqual(await state(),seed);
   await f.same(base);
  }
  vertexId = Math.min(...seed.sel.faces.flatMap(face=>seed.cage.faces[face]));
  pivot = seed.cage.positions.slice(3*vertexId,3*vertexId+3);
  await vertex.fill(String(vertexId));
  await centre.waitFor();
  await expectPivot(pivot);
 }
 const verifyScale = (after, factor) => {
  verify(seed, after, 'scale', factor, pivot);
  if (vertexId !== undefined) assert.deepEqual(after.cage.positions.slice(3*vertexId,3*vertexId+3),pivot);
 };
 const readout = f.page.locator('.gizmo-readout');
 async function start(factor, steps = 8) {
  const {x,y} = await centre.evaluate(mark => {
   const r = mark.getBoundingClientRect();
   return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};
  });
  await f.page.mouse.move(x,y);
  await f.page.locator('[data-gizmo="scale"][data-active="true"]').waitFor();
  await f.page.mouse.down();
  if (factor !== 1) {
   await f.page.mouse.move(x+Math.round((factor-1)*84),y,{steps});
   await readout.filter({hasText:`relative × ${factor}`}).waitFor();
  }
 }
 if (pivotTopology) {
  f.phase = 'delete two faces and compare the current owner of their old vertex number';
  for (const [index, point] of [[8.75,22.5,26],[8.75,27.5,26]].entries()) {
   const pixel = await f.page.evaluate(point=>window.__studioScreenOf(point),point);
   assert.ok(pixel);
   if (index) await f.page.keyboard.down('Shift');
   await f.page.mouse.click(...pixel);
   if (index) await f.page.keyboard.up('Shift');
  }
  const deleting = await state();
  assert.deepEqual(deleting.sel.faces,[80,81]);
  const survivors = seed.cage.faces.filter((_,id)=>!deleting.sel.faces.includes(id));
  const order = [...new Set(survivors.flat())];
  const remappedId = order.indexOf(vertexId);
  const alias = order[vertexId];
  assert.ok(remappedId >= 0 && alias !== undefined);
  assert.notEqual(alias,vertexId);
  const otherPivot = seed.cage.positions.slice(alias*3,alias*3+3);
  assert.notDeepEqual(otherPivot,pivot);
  await button('Delete',panel()).click();
  const pixel = await f.page.evaluate(()=>window.__studioScreenOf([23.75,37.5,26]));
  assert.ok(pixel);
  await f.page.mouse.click(...pixel);
  await f.page.waitForFunction(()=>window.__studioCage()?.sel.faces.length===1);
  const changed = await state();
  assert.equal(changed.cage.faces.length,seed.cage.faces.length-2);
  assert.equal(await vertex.inputValue(),String(vertexId));
  assert.deepEqual(changed.cage.positions.slice(vertexId*3,vertexId*3+3),otherPivot);
  assert.deepEqual(changed.cage.positions.slice(remappedId*3,remappedId*3+3),pivot);
  if (stalePivot) {
   await expectPivot(otherPivot);
   await start(1.1);
   await f.snapshot('old-number-alias-preview');
   await f.page.mouse.up();
   verify(changed,await state(),'scale',1.1,otherPivot);
  } else {
   await panel().getByRole('status').filter({hasText:'The cage changed. Enter the pivot vertex again.'}).waitFor();
   assert.equal(await centre.count(),0);
   assert.deepEqual(await state(),changed);
   await f.snapshot('old-number-refused');
   await vertex.fill(String(remappedId));
   await expectPivot(pivot);
   await start(1.1);
   await f.snapshot('confirmed-current-pivot');
   await f.page.mouse.up();
   verify(changed,await state(),'scale',1.1,pivot);
   await button('Undo cage step',panel()).click();
   assert.deepEqual(await state(),changed);
  }
  await f.same(base);
  f.report.observations.push({oldId:vertexId,remappedId,pivot,otherPivot,oldNumberOwnedWrongPoint:stalePivot});
  return;
 }
 f.phase = 'identity, held scale and Escape';
 await start(1);
 await f.page.mouse.up();
 assert.deepEqual(await state(),seed);
 await start(1.1);
 assert.ok(await tool.isDisabled());
 assert.deepEqual(await state(),seed);
 await f.same(base);
 await f.snapshot('selection-scale-drag-preview');
 await f.page.keyboard.press('Escape');
 await f.page.mouse.up();
 await readout.waitFor({state:'detached'});
 assert.deepEqual(await state(),seed);

 f.phase = 'discard a held scale when pointer capture is lost';
 const canvas = f.page.locator('canvas.vp-canvas');
 await canvas.evaluate(element => element.addEventListener('pointerdown', event => {
  element.dataset.testScalePointer = String(event.pointerId);
 }, {once:true}));
 await start(0.8);
 await canvas.evaluate(element => {
  const pointerId = Number(element.dataset.testScalePointer);
  if (!element.hasPointerCapture(pointerId)) throw Error('The scale drag did not capture its pointer');
  element.releasePointerCapture(pointerId);
  delete element.dataset.testScalePointer;
 });
 await f.page.mouse.move(500,385);
 await readout.waitFor({state:'detached'});
 await f.page.mouse.up();
 assert.deepEqual(await state(),seed);

 f.phase = 'scale below and above one and verify the original selection centre';
 await f.page.keyboard.down('Shift');
 await start(1.12);
 await f.page.mouse.up();
 await f.page.keyboard.up('Shift');
 const fine = await state();
 verifyScale(fine,1.12);
 assert.deepEqual(fine.cage.creases, seed.cage.creases);
 assert.equal(fine.undo,1);
 await button('Undo cage step',panel()).click();
 assert.deepEqual(await state(),seed);
 await start(0.8);
 await f.page.mouse.up();
 const smaller = await state();
 verifyScale(smaller,0.8);
 assert.equal(smaller.undo,1);
 await button('Undo cage step',panel()).click();
 assert.deepEqual(await state(),seed);

 await start(1.1, 20);
 await f.page.mouse.up();
 const larger = await state();
 verifyScale(larger,1.1);
 assert.equal(larger.undo,1);
 await button('Undo cage step',panel()).click();
 assert.deepEqual(await state(),seed);
 await button('Redo cage step',panel()).click();
 assert.deepEqual(await state(),larger);
 await button('Undo cage step',panel()).click();
 await button('Scale selection',panel()).click();
 if (vertexId !== undefined) {
  await f.page.getByLabel('Selection pivot', {exact:true}).selectOption('vertex');
  await f.page.getByRole('spinbutton', {name:'Pivot cage vertex',exact:true}).fill(String(vertexId));
 }
 await f.page.getByRole('spinbutton',{name:'Selection scale ratio',exact:true}).fill('1.1');
 await apply();
 assert.deepEqual(await state(),larger);
 await button('Undo cage step',panel()).click();
 assert.deepEqual(await state(),seed);
 await start(1.1);
 await f.page.mouse.up();
 assert.deepEqual(await state(),larger);
 await f.snapshot('selection-scale-drag-accepted');
 await done();
 const accepted = await f.doc();
 assert.deepEqual(accepted.nodes.find(node=>node.kind==='subd').cage,larger.cage);
 await f.undo(); await f.same(base);
 await f.redo(); await f.same(accepted);
 const saved = await f.save('selection-scale-drag');
 await f.freshOpen(saved.file,accepted,'selection-scale-drag-reopened');
 f.report.observations.push({factors:[0.8,1.1,1.12],numericParity:true,selectedFaces:seed.sel.faces,vertexId,pivot});
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
 const verify=(before,after,kind,value,pivot)=>{
  const selected=new Set(before.sel.faces.flatMap(f=>before.cage.faces[f])),out=before.cage.positions.slice();
  if(!pivot)pivot=[0,1,2].map(k=>[...selected].reduce((a,v)=>a+before.cage.positions[3*v+k]/selected.size,0));
  for(const v of selected){const p=before.cage.positions.slice(3*v,3*v+3).map((x,k)=>x-pivot[k]);let q;
   if(kind==='scale')q=p.map(x=>x*value);else {const t=value*Math.PI/180;q=[Math.cos(t)*p[0]-Math.sin(t)*p[1],Math.sin(t)*p[0]+Math.cos(t)*p[1],p[2]];}
   for(let k=0;k<3;k++)out[3*v+k]=q[k]+pivot[k];
  }
  out.forEach((v,i)=>{if(selected.has(Math.floor(i/3)))assert.ok(Math.abs(after.cage.positions[i]-v)<1e-10);else assert.equal(after.cage.positions[i],v);});
  assert.deepEqual(after.cage.faces,before.cage.faces);assert.deepEqual(after.sel,before.sel);
 };
 const apply=async()=>{await f.page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Apply transform'&&!b.disabled));await button('Apply transform',panel()).click();};
 await begin();const seed=await faces();
 if (scaleDrag) { await scaleSelection(seed, base, verify, apply); return; }
 await button('Rotate selection',panel()).click();assert.equal((await state()).undo,0);await apply();assert.equal((await state()).undo,0);
 await button('Rotate selection',panel()).click();
 for(const angle of [5,10,15]){await f.page.getByLabel('Selection angle degrees',{exact:true}).fill(String(angle));const s=await state();verify(seed,s,'rotate',angle);assert.equal(s.undo,1);assert.equal(await button('Done editing cage',panel()).getAttribute('aria-disabled'),'true');await f.same(base);}
 const pivotId=seed.cage.faces[seed.sel.faces[0]][0];await f.page.getByLabel('Selection pivot',{exact:true}).selectOption('vertex');await f.page.getByLabel('Pivot cage vertex',{exact:true}).fill(String(pivotId));verify(seed,await state(),'rotate',15,seed.cage.positions.slice(pivotId*3,pivotId*3+3));
 await f.page.getByLabel('Pivot cage vertex',{exact:true}).fill('-1');assert.deepEqual((await state()).cage,seed.cage);assert.ok(await button('Apply transform',panel()).isDisabled());
 await f.page.getByLabel('Pivot cage vertex',{exact:true}).press('Escape');assert.deepEqual((await state()).cage,seed.cage);assert.equal((await state()).undo,0);
 await button('Rotate selection',panel()).click();await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('10');const rotated=await state();verify(seed,rotated,'rotate',10);await apply();assert.equal((await state()).undo,1);
 await button('Scale selection',panel()).click();for(const invalid of ['','0','-1']) {await f.page.getByLabel('Selection scale ratio',{exact:true}).fill(invalid);assert.deepEqual((await state()).cage,rotated.cage);assert.ok(await button('Apply transform',panel()).isDisabled());}
 for(const ratio of [.8,.9]) {await f.page.getByLabel('Selection scale ratio',{exact:true}).fill(String(ratio));verify(rotated,await state(),'scale',ratio);assert.equal((await state()).undo,2);}
 await button('Cancel transform preview',panel()).click();assert.deepEqual((await state()).cage,rotated.cage);assert.equal((await state()).undo,1);
 await button('Scale selection',panel()).click();await f.page.getByLabel('Selection scale ratio',{exact:true}).fill('.9');const scaled=await state();verify(rotated,scaled,'scale',.9);await f.snapshot('selection-scale-preview');await apply();
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,rotated.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,scaled.cage);
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,scaled.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);
 const saved=await f.save('selection-transform');await f.freshOpen(saved.file,accepted,'fresh-open');
});
