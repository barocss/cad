import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/app/shaftCommands.ts','apps/cad-studio/src/ui/Hud.tsx','apps/cad-studio/src/App.tsx','apps/cad-studio/test/retaining-ring-preview-browser.mjs'];
const f=await createFlow({name:'retaining-ring-preview',output:process.argv[2],envFrozen:'RING_PREVIEW_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Retaining ring preview is located on an off-origin shaft groove and survives cancel/reopen/apply.',limits:['Default shaft translated to 1000,2000,3000; default ring envelope; Chrome WebGPU.'],inspectorSource:`
import {emptyDoc} from '@barocss/cad-model/engine/doc';import {commands} from '@barocss/cad-model/app/commands';
const c=commands.find(c=>c.id==='shaft')!,ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
console.log(JSON.stringify(c.build!(ctx,{...c.defaults!(ctx),x:1000,y:2000,z:3000})));`});
await f.run(async()=>{
 for(const width of [1024,1440]){
  await f.newPage();await f.page.setViewportSize({width,height:900});const source=await f.inspect('fixture-'+width,{});
  await f.page.setInputFiles('input[aria-label="Model file"]',{name:'ring.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.ready();await f.same(source);
  for(let repeat=0;repeat<2;repeat++){
   await f.page.locator('.outliner .ol-row button.ol').filter({hasText:'Shaft'}).first().click();await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Retaining ring');
   const hud=f.page.getByRole('dialog',{name:'Retaining ring',exact:true});await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent==='preview');await f.same(source);
   const frame=hud.getByRole('button',{name:'View preview',exact:true});
   await hud.getByLabel('Thickness (estimate)',{exact:true}).fill('2');await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent==='refused');assert.equal(await frame.isDisabled(),true);await f.same(source);
   await hud.getByLabel('Thickness (estimate)',{exact:true}).fill('1.2');await f.page.waitForFunction(()=>document.querySelector('.hud .status')?.textContent==='preview');
   await frame.focus();await frame.press('Enter');await f.same(source);await frame.press('Space');await f.same(source);
   const points=await f.page.evaluate(()=>[[988,2000,3088.65],[1012,2000,3088.65],[1000,1988,3088.65],[1000,2012,3088.65]].map(p=>window.__studioScreenOf(p)));
   const canvas=await f.page.locator('canvas').first().boundingBox();assert.ok(canvas);for(const p of points){assert.ok(p[0]>=canvas.x&&p[0]<=canvas.x+canvas.width,JSON.stringify({p,canvas}));assert.ok(p[1]>=canvas.y&&p[1]<=canvas.y+canvas.height,JSON.stringify({p,canvas}));}
   await f.snapshot('preview-'+width+'-'+repeat);
   if(repeat===0){await hud.getByRole('button',{name:'Cancel',exact:true}).click();await f.same(source);}else{await hud.getByRole('button',{name:'Apply',exact:true}).click();await f.ready();}
  }
  const doc=await f.doc();assert.equal(doc.nodes.at(-1).kind,'retaining-ring');const bs=(await f.bodies()).bodies;assert.equal(bs.length,2);assert.deepEqual(bs[1].centroid,[1000,2000,3088.65]);assert.ok(Math.abs(bs[1].volume-Math.PI*(12*12-9.5*9.5)*1.2)<1e-6);
  await f.undo();await f.same(source);await f.redo();await f.same(doc);const saved=await f.save('ring-'+width);await f.freshOpen(saved.file,doc,'reopened-'+width);
 }
});
