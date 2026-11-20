import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/src/viewport/CageMarks.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/styles.css','apps/cad-studio/src/subd/useCageGizmo.ts','apps/cad-studio/src/viewport/gizmo.ts','apps/cad-studio/src/viewport/viewportPointerInput.ts','packages/barocss-cad-model/src/subd/cageProportional.ts','apps/cad-studio/src/ui/CageProportionalControls.tsx','packages/barocss-cad-model/src/subd/cageEdit.ts','apps/cad-studio/src/ui/CagePanel.tsx','apps/cad-studio/src/subd/useCageEditor.ts','apps/cad-studio/src/subd/cageTransformDraft.ts','apps/cad-studio/src/ui/CageTransformControls.tsx'];
const f=await createFlow({name:'cage-proportional-drag',output:process.argv[2],envFrozen:'CAGE_PROPORTIONAL_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Verify connected proportional cage dragging, cancellation, history and native reopen.',
 limits:['One desktop closed box with vertex seed, X-axis motion, radius 10 mm.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Cage editor',exact:true});
const command=async(text)=>{await f.page.getByText('barocss',{exact:true}).click();await f.command(text);};
const state=()=>f.page.evaluate(()=>window.__studioCage());
const done=async()=>{await f.page.waitForFunction(()=>document.querySelector('[aria-label="Done editing cage"]')?.getAttribute('aria-disabled')==='false');await button('Done editing cage',panel()).click();await panel().waitFor({state:'detached'});await f.ready();};
await f.run(async()=>{
 await f.newPage();await f.page.setViewportSize({width:1440,height:1000});await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();
 await command('subd box');const hud=f.page.getByRole('dialog',{name:'SubD box',exact:true});
 for(const [name,value] of [['Width X',30],['Depth Y',20],['Height Z',16],['Quads along a side',4],['Centre X',20],['Centre Y',30],['At Z',10]])await hud.getByLabel(name,{exact:true}).fill(String(value));
 await hud.locator('.status.ok').waitFor();await button('Apply',hud).click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.some(n=>n.kind==='subd'));await f.ready();const base=await f.doc();const originalFile=await f.save('original-cage');
 const begin=async()=>{await command('edit cage');await panel().waitFor();await button('View cube directions').click();await f.page.getByRole('menuitem',{name:'Top',exact:true}).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();await button('Box',panel()).click();};
 const apply=async()=>{await f.page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Apply transform'&&!b.disabled));await button('Apply transform',panel()).click();};
 await begin();await button('Vertex',panel()).click();const q=await f.page.evaluate(()=>window.__studioScreenOf([20,30,26]));assert.ok(q);await f.page.mouse.click(...q);const seed=await state();assert.equal(seed.sel.vertices.length,1);assert.deepEqual(seed.cage.positions.slice(seed.sel.vertices[0]*3,seed.sel.vertices[0]*3+3),[20,30,26]);

 const enabled=panel().getByRole('checkbox',{name:'Connected proportional drag',exact:true});
 const radius=panel().getByRole('spinbutton',{name:'Drag graph radius mm',exact:true});
 assert.equal(await enabled.isChecked(),false);
 const dragStart=async (delta,steps=12)=>{
   const arrow=f.page.locator('.gizmo-arrow[data-gizmo="moveX"] polygon');
   await arrow.waitFor();
   await f.page.waitForFunction(() => new Promise(resolve => {
     let previous='', stable=0;
     function check() {
       const mark=document.querySelector('.gizmo-arrow[data-gizmo="moveX"] polygon')?.getAttribute('points');
       stable=mark===previous?stable+1:0; previous=mark;
       if(mark && stable>=8) resolve(true); else requestAnimationFrame(check);
     }
     check();
   }));
   const {x,y,dx,dy,onCanvas}=await arrow.evaluate((polygon,delta)=>{
     const rect=polygon.closest('svg').getBoundingClientRect();
     const points=[...polygon.points];
     const x=rect.x+points.reduce((sum,p)=>sum+p.x,0)/points.length;
     const y=rect.y+points.reduce((sum,p)=>sum+p.y,0)/points.length;
     const a=window.__studioScreenOf([20,30,26]), b=window.__studioScreenOf([20+delta,30,26]);
     return {x,y,dx:b[0]-a[0],dy:b[1]-a[1],onCanvas:document.elementFromPoint(x,y)?.matches('canvas.vp-canvas')};
   },delta);
   assert.equal(onCanvas,true);
   await f.page.mouse.move(x,y);
   await f.page.locator('[data-gizmo="moveX"][data-active="true"]').waitFor({ timeout: 8000 });
   await f.page.mouse.down();
   await f.page.mouse.move(x+dx,y+dy,{steps});
   await f.page.locator('[data-gizmo="moveX"][data-dragging="true"]').waitFor({ timeout:8000 });
 };

 const cageButton=name=>button(name,panel());
 const xyz=(snapshot,vertex)=>snapshot.cage.positions.slice(3*vertex,3*vertex+3);
 const expected=(after,delta,weighted)=>{
   const picked=seed.sel.vertices[0];
   for(let v=0;v<seed.cage.positions.length/3;v++){
     const [x,y,z]=xyz(seed,v);
     const d=z===26?Math.abs(x-20)+Math.abs(y-30):Infinity;
     const u=Math.min(d/10,1);
     const weight=weighted?(1-u)**2*(1+2*u):Number(v===picked);
     const [mx,my,mz]=xyz(after,v);
     assert.ok(Math.abs(mx-(x+weight*delta))<1e-9,`vertex ${v} expected x=${x+weight*delta} got ${mx}`);
     assert.equal(my,y);assert.equal(mz,z);
   }
   assert.deepEqual(after.cage.faces,seed.cage.faces);assert.deepEqual(after.cage.creases,seed.cage.creases);
   assert.deepEqual(after.sel,seed.sel);
 };
 const influenced=()=>f.page.locator('.cage[data-influenced-vertices]');
 const noInfluence=()=>influenced().waitFor({state:'detached'});
 async function verifyInfluence(points) {
   await f.page.locator(`.cage[data-influenced-vertices="${points.length}"]`).waitFor({state:'attached'});
   await f.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
   const png=await f.page.screenshot();
   const hits=await f.page.evaluate(async ({png,points})=>{
     const bytes=Uint8Array.from(atob(png),ch=>ch.charCodeAt(0));
     const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
     const canvas=document.createElement('canvas');
     canvas.width=image.width;canvas.height=image.height;
     const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
     return points.map(point=>{
       const [x,y]=window.__studioScreenOf(point).map(Math.round);
       const rgba=ctx.getImageData(x-7,y-7,15,15).data;
       let n=0;
       for(let i=0;i<rgba.length;i+=4) {
         if(rgba[i]<150 && rgba[i+1]>180 && rgba[i+2]>135 && rgba[i+1]>rgba[i+2]+8) n++;
       }
       return n;
     });
   },{png:png.toString('base64'),points});
   assert.ok(hits.every(n=>n>=4),JSON.stringify(hits));
   f.report.observations.push({points,turquoisePixels:hits});
 }
 const release=async()=>{ await f.page.mouse.up();await noInfluence(); };
 const undoCage=()=>cageButton('Undo cage step').click();
 const redoCage=()=>cageButton('Redo cage step').click();
 const undoWhenHeld=async()=>{
   await cageButton('Undo cage step').focus();
   await cageButton('Undo cage step').press('Enter');
   await f.page.waitForFunction(()=>window.__studioCage()?.undo===0);
 };
 f.phase='default rigid motion and owner reset';
 await dragStart(2);await release();expected(await state(),2,false);
 await dragStart(3);await undoWhenHeld();await release();
 await f.same(base);assert.deepEqual(await state(),seed);

 f.phase='connected weights and cadence from the same frozen baseline';
 await enabled.check();
 await radius.fill('7.5');await dragStart(2);
 await verifyInfluence([[20+14/27,25,26],[20+14/27,35,26]]);
 await f.page.keyboard.press('Escape');await release();
 assert.deepEqual(await state(),seed);
 await radius.fill('10');
 await dragStart(2,1);assert.deepEqual(await state(),seed);
 await f.page.waitForFunction(() => {
   const origin=document.querySelector('circle.gizmo-origin');
   if (!origin) return false;
   const svg=origin.closest('svg').getBoundingClientRect();
   const [x,y]=window.__studioScreenOf([22,30,26]);
   return Math.hypot(svg.x+Number(origin.getAttribute('cx'))-x,svg.y+Number(origin.getAttribute('cy'))-y)<0.5;
 });
 await f.same(base);
 await verifyInfluence([[21,25,26],[21,35,26],[12.8125,30,26],[27.8125,30,26]]);
 await f.snapshot('01-weighted-drag-held');
 await release();const moved=await state();expected(moved,2,true);assert.equal(moved.undo,1);
 await undoCage();assert.deepEqual(await state(),seed);
 await dragStart(2,100);await release();assert.deepEqual(await state(),moved);
 await undoCage();await dragStart(-2);await release();expected(await state(),-2,true);
 await undoCage();assert.deepEqual(await state(),seed);

 f.phase='release pointer capture while proportional movement is pending';
 const canvas=f.page.locator('canvas.vp-canvas');
 await canvas.evaluate(el=>el.addEventListener('pointerdown',event=>{ el.dataset.probePointer=String(event.pointerId); },{once:true}));
 await dragStart(2);
 await canvas.evaluate(el=>{
   const pid=Number(el.dataset.probePointer);
   if(!el.hasPointerCapture(pid)) throw Error('Expected held cage drag capture');
   el.releasePointerCapture(pid);
   delete el.dataset.probePointer;
 });
 await f.page.mouse.move(500,385);
 await f.page.locator('[data-gizmo="moveX"][data-dragging="true"]').waitFor({state:'detached'});
 await release();
 assert.deepEqual(await state(),seed);
 await f.same(base);

 f.phase='cancel held pointer with Escape';
 await dragStart(-2);await f.page.keyboard.press('Escape');
 await f.page.locator('[data-gizmo="moveX"][data-dragging="true"]').waitFor({state:'detached'});
 await release();assert.deepEqual((await state()).cage,seed.cage);assert.equal((await state()).undo,0);
 if(!(await state()).sel.vertices.length) await f.page.mouse.click(...q);

 f.phase='discard held movement on pointercancel and selection mode change';
 await canvas.evaluate(el=>el.addEventListener('pointerdown', event=>{ el.dataset.probePointer=String(event.pointerId); }, {once:true}));
 await dragStart(2);
 await canvas.evaluate(el=>{
   const pointerId=Number(el.dataset.probePointer);
   el.dispatchEvent(new PointerEvent('pointercancel',{pointerId,bubbles:true}));
   delete el.dataset.probePointer;
 });
 await f.page.locator('[data-gizmo="moveX"][data-dragging="true"]').waitFor({state:'detached'});
 await release();assert.deepEqual(await state(),seed);
 await dragStart(2);await f.page.keyboard.press('2');await release();
 const switched=await state();
 assert.equal(switched.mode,'edge');assert.equal(switched.undo,0);assert.deepEqual(switched.cage,seed.cage);
 await cageButton('Vertex').click();
 await f.page.waitForFunction(()=>window.__studioCage()?.mode==='vertex');
 const seedPixel=await f.page.evaluate(()=>window.__studioScreenOf([20,30,26]));
 await f.page.mouse.click(...seedPixel);
 await f.page.waitForFunction(()=>window.__studioCage()?.sel.vertices.length===1);
 assert.deepEqual(await state(),seed);

 f.phase='publish one accepted cage step and verify native file';
 await dragStart(2);await release();expected(await state(),2,true);
 await undoCage();assert.deepEqual(await state(),seed);
 await redoCage();expected(await state(),2,true);
 await f.snapshot('02-weighted-applied');
 await done();
 const accepted=await f.doc();assert.deepEqual(accepted.nodes.find(n=>n.kind==='subd').cage,moved.cage);
 await f.undo();await f.same(base);await f.redo();await f.same(accepted);
 const saved=await f.save('proportional-drag');
 await f.freshOpen(saved.file,accepted,'03-reopened');
 f.phase='open a different native document while a gesture is held';
 await begin();await cageButton('Vertex').click();
 const acceptedVertex=await f.page.evaluate(()=>window.__studioScreenOf([22,30,26]));
 await f.page.mouse.click(...acceptedVertex);
 assert.deepEqual((await state()).sel,seed.sel);
 await panel().getByRole('checkbox',{name:'Connected proportional drag',exact:true}).check();await dragStart(2);
 await f.page.setInputFiles('input[aria-label="Model file"]',originalFile.file);
 const discard=button('Discard draft');
 await f.page.waitForFunction(expected=>
   JSON.stringify(window.__studioDoc)===expected || [...document.querySelectorAll('button')].some(b=>b.textContent==='Discard draft'),JSON.stringify(base));
 if(await discard.isVisible()) await discard.click();
 await f.same(base);await release();await panel().waitFor({state:'detached'});
 assert.equal(await state(),null);await f.same(base);
 f.report.observations.push({interruption:'native Open while held', acceptedOriginalFile:true});
 f.report.observations.push({seed:[20,30,26],radius:10,deltaX:2,seedDx:2,yNeighborDx:1,xNeighborDx:.3125});
});
