// #220 bounded session-only inspection. Real UI actions; readonly camera/selection hooks.
import assert from 'node:assert/strict';
import { readFile, statfs } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'));
const pins=['apps/cad-studio/test/named-inspection-browser.mjs','apps/cad-studio/src/state/useNamedInspection.ts','apps/cad-studio/src/app/namedInspection.ts','apps/cad-studio/src/ui/NamedInspectionViews.tsx','apps/cad-studio/src/ui/ViewDisplayControls.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/useModelAppearance.ts','apps/cad-studio/src/App.tsx'];
const f=await createFlow({name:'named-inspection',output,envFrozen:'NAMED_INSPECTION_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Two native base boxes: real session camera/subset capture, Apply/Fit/Restore, picking, document/session invalidation and native Save/fresh Open.',
 limits:['WebGPU only; no assembly, independent renderer, project/worker restart or forced renderer failure.','Visibility evidence is real pointer picking at separated face interiors plus screenshots, not original body bounds. Save absence is verified by exact public fresh-Open document equality, not a new codec or raw JSON assumption.','No action injection, Worker interception, camera setter or hidden-mask read hook.']});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[10,10]},{kind:'extrude',id:'n1',sketch:0,height:10},{kind:'sketch',id:'n2',profile:'rectangle',min:[30,0],max:[40,10]},{kind:'extrude',id:'n3',sketch:2,height:10}],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}},nextId:4,bodies:{b1:{name:'Box A'},b3:{name:'Box B'}}};
const button=name=>f.page.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Named inspection views',exact:true});
const apply=name=>button('Apply inspection view '+name);
async function camera(){return f.page.evaluate(()=>window.__studioCamera());}
async function settle(){await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
async function cameraEquals(expected){await f.page.waitForFunction(c=>JSON.stringify(window.__studioCamera())===JSON.stringify(c),expected);assert.deepEqual(await camera(),expected);}
async function invariant(){return f.page.evaluate(()=>({doc:JSON.parse(JSON.stringify(window.__studioDoc)),dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),history:[...document.querySelectorAll('.history .hs')].map(x=>x.getAttribute('aria-label')),undo:['Undo','Redo'].map(n=>{const b=document.querySelector(`button[aria-label="${n}"]`);return{disabled:b?.disabled,tip:b?.getAttribute('data-tip')};})}));}
async function display(){const b=button('Display and previews');if(await b.getAttribute('aria-expanded')!=='true')await b.click();await panel().waitFor();}
async function open(){await f.openFile({name:'inspection-pair.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},4);await f.same(doc);await display();}
async function capture(name,selected=false){await panel().getByLabel('Inspection view name',{exact:true}).fill(name);await button(selected?'Capture selected bodies':'Capture all visible bodies').click();await apply(name).waitFor();}
async function top(){await button('Top').click();const ortho=button('Ortho');if(await ortho.getAttribute('aria-pressed')!=='true')await ortho.click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await settle();}
async function pick(x,expected){
 const displayToggle=button('Display and previews'),wasOpen=await displayToggle.getAttribute('aria-expanded')==='true';
 if(wasOpen)await displayToggle.click();
 await f.page.keyboard.press('Escape');await settle();
 const point=await f.page.evaluate(p=>window.__studioScreenOf(p),[x,5,10]);assert.ok(point?.length===2);
 const box=await f.page.locator('.vp-canvas').boundingBox();assert.ok(box&&point[0]>box.x&&point[0]<box.x+box.width&&point[1]>box.y&&point[1]<box.y+box.height,'probe is inside actual canvas');
 assert.equal(await f.page.evaluate(([x,y])=>document.elementFromPoint(x,y)===document.querySelector('.vp-canvas'),point),true,'probe reaches canvas, not an overlay');
 await f.page.mouse.click(point[0],point[1]);await settle();
 const keys=await f.page.evaluate(()=>{const s=window.__studioSelection.selection,b=window.__studioBodies().bodies;return [...new Set([...s.bodies,...s.faces.map(f=>f.body),...s.edges.map(e=>e.body)].map(i=>b[i]?.key))];});
 assert.deepEqual(keys,expected?[expected]:[],`actual pointer selection at x=${x}`);
 f.report.observations.push({probe:[x,5,10],pixel:point,selectedKeys:keys});
 if(wasOpen)await display();
}
await f.run(async()=>{
 const fs=await statfs(output);assert.ok(fs.bavail*fs.bsize>=2*1024**3);await f.newPage();await open();
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await settle();const original=await invariant(),allCamera=await camera();await capture('All oblique');
 await top();await pick(35,'b3');await f.page.locator('[data-browser-body-key="b1"]').click();const subsetCamera=await camera();assert.notDeepEqual(subsetCamera,allCamera);await capture('A top',true);assert.deepEqual(await invariant(),original);await f.snapshot('01-two-captured-views');
 const beforeApply=await camera();await apply('A top').click();await cameraEquals(subsetCamera);await pick(5,'b1');await pick(35,null);await f.snapshot('02-subset-applied');
 await f.page.getByTitle('Frame all (F)',{exact:true}).click();await settle();await pick(5,'b1');assert.doesNotMatch(await apply('A top').locator('..').innerText(),/· active/);await f.snapshot('03-subset-fit');
 await apply('All oblique').click();await cameraEquals(allCamera);await f.snapshot('04-all-oblique-applied');
 await button('Restore inspection view').click();await cameraEquals(beforeApply);await pick(5,'b1');await pick(35,'b3');assert.deepEqual(await invariant(),original);await f.snapshot('05-restored-camera-and-visibility');
 await apply('A top').click();await button('Section view').click();await settle();assert.equal(await apply('A top').isDisabled(),true);assert.equal(await button('Restore inspection view').isDisabled(),true);await f.snapshot('06-section-blocked');await button('Section view').click();await settle();assert.equal(await apply('A top').isDisabled(),false);assert.equal(await button('Restore inspection view').isDisabled(),true);await top();await pick(35,'b3');assert.deepEqual(await invariant(),original);
 // Real fast user clicks: last published camera and mask must win together.
 await display();
 const clickAt=async(locator,label)=>{
  const box=await locator.boundingBox();assert.ok(box);
  const point=[box.x+box.width/2,box.y+box.height/2];
  const target=await f.page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y)?.closest('button,[role="menuitem"]');return e?.getAttribute('aria-label')??e?.textContent?.trim();},point);
  assert.equal(target,label,'real click reaches the intended control');
  await f.page.mouse.click(...point);
 };
 const rapidStart=await f.page.evaluate(()=>performance.now());
 await clickAt(apply('All oblique'),'Apply inspection view All oblique');await clickAt(apply('A top'),'Apply inspection view A top');await clickAt(apply('All oblique'),'Apply inspection view All oblique');await clickAt(apply('A top'),'Apply inspection view A top');
 const rapidMs=await f.page.evaluate(t=>performance.now()-t,rapidStart);
 await cameraEquals(subsetCamera);await pick(35,null);await pick(5,'b1');
 f.report.observations.push({boundary:'four real consecutive Apply clicks, last subset wins',elapsedMs:rapidMs});
 await f.snapshot('11-rapid-apply-last-wins');
 // Start the existing 260ms ViewCube easing, then take ownership with Apply.
 await apply('All oblique').click();await cameraEquals(allCamera);
 await button('View cube directions').click();
 const front=f.page.getByRole('menuitem',{name:'Front',exact:true});await front.waitFor();
 const turnStart=await f.page.evaluate(()=>performance.now());
 await clickAt(front,'Front');
 await f.page.waitForFunction(c=>{const n=window.__studioCamera();return n.yaw!==c.yaw&&Math.abs(n.pitch)>1e-6;},allCamera,{timeout:200});
 const intermediate=await camera();assert.notDeepEqual(intermediate,allCamera);assert.ok(Math.abs(intermediate.pitch)>1e-6,'easing has not reached Front');
 await clickAt(apply('A top'),'Apply inspection view A top');
 const takeoverMs=await f.page.evaluate(t=>performance.now()-t,turnStart);
 assert.ok(takeoverMs<260,'fixture must Apply before the ViewCube easing completes');
 await cameraEquals(subsetCamera);await f.page.waitForTimeout(400);await cameraEquals(subsetCamera);
 await pick(35,null);await pick(5,'b1');assert.deepEqual(await invariant(),original);
 f.report.observations.push({boundary:'Apply interrupts live ViewCube easing; no late overwrite after 400ms',takeoverMs,intermediate});
 await f.snapshot('12-viewcube-takeover-stable');
 // Native Save while a session subset is active must not persist the preset/mask.
 await apply('A top').click();const pending=f.page.waitForEvent('download');await button('Save').click();const dl=await pending,file=join(output,'inspection-not-saved.bcad');await dl.saveAs(file);assert.equal(await dl.failure(),null);const bytes=await readFile(file);assert.ok(bytes.length);f.report.files.push({file,bytes:bytes.length,sha256:sha256(bytes),boundary:'actual public Save; semantic verification through fresh Open below'});await f.same(doc);
 // Existing authored visibility edit invalidates all session snapshots; Undo does not revive them.
 await button('Restore inspection view').click();await f.page.locator('[data-browser-body-key="b3"]').locator('xpath=..').getByRole('button',{name:'Hide body',exact:true}).click();await f.ready();assert.equal(await panel().getByRole('button',{name:/^Apply inspection view /}).count(),0);await button('Undo').click();await f.same(doc);assert.equal(await panel().getByRole('button',{name:/^Apply inspection view /}).count(),0);await f.snapshot('07-document-edit-undo-no-resurrection');
 await capture('Before Open');await open();assert.equal(await panel().getByRole('button',{name:/^Apply inspection view /}).count(),0);await f.snapshot('08-same-filename-open-cleared');
 await f.freshOpen(file,doc,'09-native-fresh-open-original');await display();assert.equal(await panel().getByRole('button',{name:/^Apply inspection view /}).count(),0);await top();await pick(5,'b1');await pick(35,'b3');await f.same(doc);await f.snapshot('10-native-no-presets-or-mask');
 f.report.observations.push({allCamera,subsetCamera,restoreCamera:beforeApply,sourceUnchanged:true,sessionOnly:true,actualDownloads:1});assert.equal(f.report.downloads.length,1);
});
