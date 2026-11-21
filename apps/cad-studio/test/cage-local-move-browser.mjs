import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const edgeDrag = process.argv.includes('--edge-drag') || process.argv.includes('--expect-no-edge-drag');
const drag = edgeDrag || process.argv.includes('--drag') || process.argv.includes('--expect-no-drag');
const baseline = process.argv.includes('--expect-no-drag') || process.argv.includes('--expect-no-edge-drag');
const pins=['packages/barocss-cad-model/src/subd/cageLocalDirection.ts','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/subd/cageTransformDraft.ts','apps/cad-studio/src/ui/CageTransformControls.tsx'];
if (drag) pins.push('apps/cad-studio/src/subd/useCageGizmo.ts', 'apps/cad-studio/src/viewport/gizmo.ts',
  'apps/cad-studio/src/viewport/GizmoMarks.tsx', 'apps/cad-studio/src/viewport/Viewport.tsx',
  'apps/cad-studio/src/viewport/viewportPointerInput.ts', 'apps/cad-studio/test/cage-local-move-browser.mjs');
const f=await createFlow({name:'cage-local-move',output:process.argv[2],envFrozen:'CAGE_LOCAL_MOVE_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification: edgeDrag ? 'Use an actual viewport handle to move one oblique cage edge along its original tangent.'
   : drag ? 'Use an actual viewport handle to move one tilted cage face along its original normal.'
   : 'Single-edge tangent and tilted single-quad normal numeric movement.',
 limits:['One box, single edge and a 15-degree tilted quad. Multi-selection refusal covered. Arbitrary faces unsupported.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const done=async()=>{await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.ready();};
async function dragLocal(tilted, base, ids, direction, verify) {
 const frame = panel().getByLabel('Drag frame', {exact:true});
 const arrow = f.page.locator('.gizmo-arrow[data-gizmo="moveAlong"]');
 const axisLabel = edgeDrag ? 'T' : 'N';
 const name = edgeDrag ? 'edge-tangent' : 'face-normal';
 if (baseline) {
  assert.equal(await frame.count(), 0);
  assert.equal(await arrow.count(), 0);
  assert.ok(await f.page.locator('.gizmo-arrow[data-gizmo="moveY"]').count());
  await f.snapshot('original-world-handles');
  await f.same(base);
  return;
 }
 assert.equal(await frame.inputValue(), 'world');
 await frame.selectOption(edgeDrag ? 'edge' : 'face');
 await button('Iso').click();
 const points = ids.map(id => tilted.cage.positions.slice(id * 3, id * 3 + 3));
 const centre = points[0].map((_, axis) => points.reduce((sum, point) => sum + point[axis], 0) / points.length);
 async function start(distance, steps = 8) {
  const mark = await f.page.waitForFunction(({centre,direction,distance}) => new Promise(resolve => {
   let previous = '', stable = 0, frames = 0;
   function check() {
    const polygon = document.querySelector('.gizmo-arrow[data-gizmo="moveAlong"] polygon');
    const points = polygon?.getAttribute('points');
    stable = points && points === previous ? stable + 1 : 0;
    previous = points;
    if (stable >= 8) {
     const r = polygon.closest('svg').getBoundingClientRect();
     const p = [...polygon.points];
     const x = r.x + p.reduce((sum, v) => sum + v.x, 0) / p.length;
     const y = r.y + p.reduce((sum, v) => sum + v.y, 0) / p.length;
     const a = window.__studioScreenOf(centre);
     const b = window.__studioScreenOf(centre.map((v, i) => v + direction[i] * distance));
     resolve({x,y,dx:b[0]-a[0],dy:b[1]-a[1],onCanvas:document.elementFromPoint(x,y)?.matches('canvas.vp-canvas')});
    } else if (++frames < 180) requestAnimationFrame(check);
    else resolve(null);
   }
   check();
  }), {centre,direction,distance}, {timeout:8000});
  const {x,y,dx,dy,onCanvas} = await mark.jsonValue();
  assert.ok(onCanvas);
  assert.ok(Math.hypot(dx,dy) >= 2);
  await f.page.mouse.move(x,y);
  await f.page.locator('[data-gizmo="moveAlong"][data-active="true"]').waitFor();
  await f.page.mouse.down();
  await f.page.mouse.move(x+dx,y+dy,{steps});
  await f.page.locator('[data-gizmo="moveAlong"][data-dragging="true"]').waitFor();
 }
 f.phase = 'preview and cancel a local drag';
 await arrow.waitFor();
 assert.equal(await f.page.locator('[data-gizmo="moveX"],[data-gizmo="moveY"],[data-gizmo="moveZ"]').count(),0);
 await start(2);
 await f.page.locator('.gizmo-readout').filter({hasText:`Δ${axisLabel} 2 mm`}).waitFor();
 assert.deepEqual(await state(), tilted);
 await f.same(base);
 await f.snapshot(`${name}-drag-preview`);
 await f.page.keyboard.press('Escape');
 await f.page.mouse.up();
 await f.page.locator('.gizmo-readout').waitFor({state:'detached'});
 assert.deepEqual(await state(), tilted);

 f.phase = 'release pointer capture during a held local drag';
 const canvas = f.page.locator('canvas.vp-canvas');
 await canvas.evaluate(element => element.addEventListener('pointerdown', event => {
  element.dataset.testNormalDragPointer = String(event.pointerId);
 }, {once:true}));
 await start(2);
 await canvas.evaluate(element => {
  const pointerId = Number(element.dataset.testNormalDragPointer);
  if (!element.hasPointerCapture(pointerId)) throw Error('The local drag did not capture the pointer');
  element.releasePointerCapture(pointerId);
  delete element.dataset.testNormalDragPointer;
 });
 await f.page.mouse.move(500,385);
 await f.page.locator('.gizmo-readout').waitFor({state:'detached'});
 await f.page.mouse.up();
 assert.deepEqual(await state(), tilted);

 f.phase = 'positive and negative local drags from the same accepted cage';
 await f.page.keyboard.down('Shift');
 await start(1.5, 12);
 await f.page.mouse.up();
 await f.page.keyboard.up('Shift');
 const fine = await state();
 verify(tilted, fine, ids, direction, 1.5);
 assert.deepEqual(fine.cage.faces, tilted.cage.faces);
 await button('Undo cage step',panel()).click();
 assert.deepEqual(await state(),tilted);

 await start(-1, 3);
 await f.page.mouse.up();
 const back = await state();
 verify(tilted, back, ids, direction, -1);
 assert.equal(back.undo, tilted.undo+1);
 await button('Undo cage step',panel()).click();
 assert.deepEqual(await state(),tilted);
 await start(2, 20);
 await f.page.mouse.up();
 const moved = await state();
 verify(tilted, moved, ids, direction, 2);
 assert.deepEqual(moved.cage.creases, tilted.cage.creases);
 assert.deepEqual(moved.sel, tilted.sel);
 assert.equal(moved.undo, tilted.undo+1);
 await button('Undo cage step',panel()).click();
 assert.deepEqual(await state(),tilted);
 await button('Redo cage step',panel()).click();
 assert.deepEqual(await state(),moved);
 await f.snapshot(`${name}-drag-applied`);
 await done();
 const accepted = await f.doc();
 assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,moved.cage);
 await f.undo(); await f.same(base);
 await f.redo(); await f.same(accepted);
 const saved = await f.save(`${name}-drag`);
 await f.freshOpen(saved.file,accepted,`${name}-drag-reopened`);
 f.report.observations.push({ centre, direction, moved: [2,-1,1.5], affectedVertices: ids });
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
 if (drag && !edgeDrag && !baseline) {
  const frame = panel().getByLabel('Drag frame', {exact:true});
  await frame.selectOption('face');
  await panel().getByRole('status').filter({hasText:'pick exactly one planar convex quad face'}).waitFor();
  assert.equal(await f.page.locator('[data-gizmo^="move"]').count(),0);
  assert.deepEqual(await state(),multi);
  await f.same(base);
  await frame.selectOption('world');
 }
 await button('Move selection',panel()).click();await f.page.getByLabel('Translation frame',{exact:true}).selectOption('face');assert.ok(await button('Apply transform',panel()).isDisabled());assert.deepEqual((await state()).cage,multi.cage);await button('Cancel transform preview',panel()).click();
 const clickPoint=async(p)=>{const q=await f.page.evaluate(p=>window.__studioScreenOf(p),p);assert.ok(q);await f.page.mouse.click(...q);};
 await button('Edge',panel()).click();await clickPoint([23.75,30,26]);const edge=await state();assert.equal(edge.sel.edges.length,1);
 if (edgeDrag && !baseline) {
  const frame = panel().getByLabel('Drag frame', {exact:true});
  await f.page.keyboard.down('Shift');
  await clickPoint([8.75,35,26]);
  await f.page.keyboard.up('Shift');
  const twoEdges = await state();
  assert.equal(twoEdges.sel.edges.length,2);
  await frame.selectOption('edge');
  await panel().getByRole('status').filter({hasText:'pick exactly one current edge'}).waitFor();
  assert.equal(await f.page.locator('[data-gizmo^="move"]').count(),0);
  assert.deepEqual(await state(),twoEdges);
  await f.same(base);
  await frame.selectOption('world');
  await clickPoint([23.75,30,26]);
  assert.deepEqual(await state(),edge);
 }
 const [a,b]=[...edge.sel.edges[0]].sort((a,b)=>a-b),ep=edge.cage.positions,vector=[0,1,2].map(k=>ep[3*b+k]-ep[3*a+k]),length=Math.hypot(...vector),direction=vector.map(x=>x/length);
 const verify=(before,after,ids,dir,d)=>{before.cage.positions.forEach((x,i)=>assert.ok(Math.abs(after.cage.positions[i]-(x+(ids.includes(Math.floor(i/3))?dir[i%3]*d:0)))<1e-10));assert.deepEqual(after.cage.faces,before.cage.faces);};
 await button('Move selection',panel()).click();await f.page.getByLabel('Translation frame',{exact:true}).selectOption('edge');
 for(const d of [-1,.5,1]) {await f.page.getByLabel('Selection distance mm',{exact:true}).fill(String(d));verify(edge,await state(),[a,b],direction,d);}
 await f.page.getByLabel('Selection distance mm',{exact:true}).press('Escape');assert.deepEqual((await state()).cage,edge.cage);
 await button('Face',panel()).click();await clickPoint([23.75,32.5,26]);const seed=await state();assert.equal(seed.sel.faces.length,1);
 if (drag && !edgeDrag && !baseline) {
  const frame = panel().getByLabel('Drag frame', {exact:true});
  await frame.selectOption('face');
  assert.equal(await f.page.locator('[data-gizmo^="move"]').count(),0);
  assert.deepEqual(await state(),seed);
  await frame.selectOption('world');
 }
 await button('Rotate selection',panel()).click();await f.page.getByLabel('Rotation world axis',{exact:true}).selectOption('0');await f.page.getByLabel('Selection angle degrees',{exact:true}).fill('15');await apply();const tilted=await state();
 const ids=tilted.cage.faces[tilted.sel.faces[0]],normal=[0,-Math.sin(Math.PI/12),Math.cos(Math.PI/12)];
 if (edgeDrag) {
  const positions = tilted.cage.positions;
  const z = id => positions[3 * id + 2];
  const oblique = ids.map((id, index) => [id, ids[(index + 1) % ids.length]]).find(([a,b]) => Math.abs(z(a)-z(b)) > 1);
  assert.ok(oblique, 'Find one tilted edge that follows the rotated Y axis');
  const endpoints = [...oblique].sort((a,b) => a-b);
  const midpoint = [0,1,2].map(axis => (positions[3 * endpoints[0] + axis] + positions[3 * endpoints[1] + axis]) / 2);
  await button('Edge',panel()).click();
  await clickPoint(midpoint);
  const picked = await state();
  assert.deepEqual(picked.sel.edges.map(edge => [...edge].sort((a,b)=>a-b)), [endpoints]);
  const sign = Math.sign(z(endpoints[1]) - z(endpoints[0]));
  const tangent = [0,sign*Math.cos(Math.PI/12),sign*Math.sin(Math.PI/12)];
  await dragLocal(picked, base, endpoints, tangent, verify);
  return;
 }
 if (drag) { await dragLocal(tilted, base, ids, normal, verify); return; }
 await button('Move selection',panel()).click();await f.page.getByLabel('Translation frame',{exact:true}).selectOption('face');assert.equal(await f.page.getByLabel('Translation world axis',{exact:true}).count(),0);
 for(const d of [-1,.5,2]) {await f.page.getByLabel('Selection distance mm',{exact:true}).fill(String(d));verify(tilted,await state(),ids,normal,d);assert.equal((await state()).undo,2);await f.same(base);}
 await f.page.getByLabel('Selection distance mm',{exact:true}).fill('');assert.deepEqual((await state()).cage,tilted.cage);assert.ok(await button('Apply transform',panel()).isDisabled());
 await f.page.getByLabel('Selection distance mm',{exact:true}).fill('2');const scaled=await state();await f.snapshot('local-normal-preview');await apply();
 await button('Undo cage step',panel()).click();assert.deepEqual((await state()).cage,tilted.cage);await button('Redo cage step',panel()).click();assert.deepEqual((await state()).cage,scaled.cage);
 await done();const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,scaled.cage);await f.undo();await f.same(base);await f.redo();await f.same(accepted);
 const saved=await f.save('local-move');await f.freshOpen(saved.file,accepted,'fresh-open');
});
