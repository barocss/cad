// #220 pre-change Update affordance baseline. Session-only, actual UI actions; no product patches.
import assert from 'node:assert/strict';
import { statfs } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'));
const pins=['apps/cad-studio/test/named-inspection-update-baseline-browser.mjs','apps/cad-studio/test/named-inspection-browser.mjs','apps/cad-studio/src/state/useNamedInspection.ts','apps/cad-studio/src/app/namedInspection.ts','apps/cad-studio/src/ui/NamedInspectionViews.tsx','apps/cad-studio/src/ui/ViewDisplayControls.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/useModelAppearance.ts','apps/cad-studio/src/App.tsx'];
const f=await createFlow({name:'named-inspection-update-baseline',output,envFrozen:'NAMED_INSPECTION_UPDATE_BASELINE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Existing two session snapshots cannot be explicitly updated; actual camera correction requires Delete and Capture. Original document/history and first-Apply Restore remain unchanged.',
 limits:['Pre-change baseline, expected to fail once Update is implemented. No assertion that the current two-view cap itself is a defect.', 'Ordinary two-box native document only. No persistent named views, codec changes, assembly, renderer/device failure, stale callbacks or asynchronous races.', 'Camera equality uses existing readonly actual-camera hook; visibility uses actual canvas picking. No hidden-mask or action injection. No native Save/roundtrip or geometry accuracy qualification.']});
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
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await settle();
 const original=await invariant(),allCamera=await camera();await capture('All oblique');
 await top();await f.page.locator('[data-browser-body-key="b1"]').click();
 const subsetCamera=await camera();assert.notDeepEqual(subsetCamera,allCamera);await capture('A review',true);
 assert.deepEqual(await invariant(),original);assert.equal(await panel().getByRole('button',{name:/^Apply inspection view /}).count(),2);
 const beforeApply=await camera();await apply('A review').click();await cameraEquals(subsetCamera);
 await pick(5,'b1');await pick(35,null);
 // Public standard direction changes the live camera, not the saved row.
 await button('Front').click();await settle();const correctedCamera=await camera();
 assert.notDeepEqual(correctedCamera,subsetCamera);
 assert.doesNotMatch(await apply('A review').locator('..').innerText(),/· active/);
 await panel().getByLabel('Inspection view name',{exact:true}).fill('A review');
 assert.equal(await button('Capture all visible bodies').isDisabled(),true);
 assert.equal(await button('Capture selected bodies').isDisabled(),true);
 assert.equal(await panel().getByRole('button',{name:/update|replace|overwrite/i}).count(),0,'no explicit existing-row update affordance');
 assert.deepEqual(await invariant(),original);await f.snapshot('01-corrected-camera-no-update');
 // Re-applying proves the original snapshot was not silently overwritten by navigation.
 await apply('A review').click();await cameraEquals(subsetCamera);
 await button('Front').click();await settle();await cameraEquals(correctedCamera);
 // Existing workaround: deleting a bookmark must not navigate or restore the mask.
 await button('Delete inspection view A review').click();await cameraEquals(correctedCamera);
 assert.equal(await apply('A review').count(),0);assert.equal(await button('Restore inspection view').isDisabled(),false);
 assert.equal(await button('Capture all visible bodies').isDisabled(),false);
 await capture('A review'); // current visible subset, not all design-visible bodies
 await cameraEquals(correctedCamera);assert.deepEqual(await invariant(),original);await f.snapshot('02-delete-and-recapture');
 await apply('All oblique').click();await cameraEquals(allCamera);
 await apply('A review').click();await cameraEquals(correctedCamera);
 // The initial pre-inspection camera survives navigation, delete/recreate and successive Applies.
 await button('Restore inspection view').click();await cameraEquals(beforeApply);
 await pick(5,'b1');await pick(35,'b3');assert.deepEqual(await invariant(),original);
 assert.equal(await panel().getByRole('button',{name:/^Apply inspection view /}).count(),2);
 await f.snapshot('03-original-restore-preserved');
 f.report.observations.push({allCamera,originalSavedCamera:subsetCamera,correctedCamera,restoreCamera:beforeApply,
  updateControlAbsent:true,captureBlockedAtTwo:true,deleteRecaptureWorkaround:true,documentAndHistoryUnchanged:true,
  limits:'Session-only baseline. No native Save or persistent snapshot support claimed.'});
 assert.equal(f.report.downloads.length,0);
});
