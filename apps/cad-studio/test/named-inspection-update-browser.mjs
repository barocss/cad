// #220 explicit session snapshot Update. Actual public UI only; no product patches.
import assert from 'node:assert/strict';
import { statfs } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'));
const pins=['apps/cad-studio/test/named-inspection-update-browser.mjs','apps/cad-studio/test/named-inspection-browser.mjs','apps/cad-studio/src/state/useNamedInspection.ts','apps/cad-studio/src/app/namedInspection.ts','apps/cad-studio/src/ui/NamedInspectionViews.tsx','apps/cad-studio/src/ui/ViewDisplayControls.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/useModelAppearance.ts','apps/cad-studio/src/App.tsx'];
const f=await createFlow({name:'named-inspection-update',output,envFrozen:'NAMED_INSPECTION_UPDATE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Explicitly update an existing session inspection snapshot from the current camera and visible subset without Delete; preserve original document and initial Restore camera.',
 limits:['Synthetic ordinary two-box native document only. No persistent named views, assembly, renderer/device failure, stale-callback injection or asynchronous race qualification.', 'Actual camera is read through the existing readonly hook; visibility is checked by actual canvas picking. No action or hidden-mask injection.', 'Stable row IDs are unit-tested separately: actual UI checks retained names/two-row count without deletion, not internal hook IDs. Native Save/fresh Open checks session reset, not persistence of snapshots.', 'History checks cover visible rows, toolbar availability and the current dirty indicator, not internal history-stack identity or geometry accuracy.']});
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
async function pick(x,expected,front=false){
 const displayToggle=button('Display and previews'),wasOpen=await displayToggle.getAttribute('aria-expanded')==='true';
 if(wasOpen)await displayToggle.click();
 await f.page.keyboard.press('Escape');await settle();
 const world=front?[x,0,5]:[x,5,10];
 const point=await f.page.evaluate(p=>window.__studioScreenOf(p),world);assert.ok(point?.length===2);
 const box=await f.page.locator('.vp-canvas').boundingBox();assert.ok(box&&point[0]>box.x&&point[0]<box.x+box.width&&point[1]>box.y&&point[1]<box.y+box.height,'probe is inside actual canvas');
 assert.equal(await f.page.evaluate(([x,y])=>document.elementFromPoint(x,y)===document.querySelector('.vp-canvas'),point),true,'probe reaches canvas, not an overlay');
 await f.page.mouse.click(point[0],point[1]);await settle();
 const keys=await f.page.evaluate(()=>{const s=window.__studioSelection.selection,b=window.__studioBodies().bodies;return [...new Set([...s.bodies,...s.faces.map(f=>f.body),...s.edges.map(e=>e.body)].map(i=>b[i]?.key))];});
 assert.deepEqual(keys,expected?[expected]:[],`actual pointer selection at x=${x}`);
 f.report.observations.push({probe:world,pixel:point,selectedKeys:keys});
 if(wasOpen)await display();
}
// Front auto-fits the currently visible A subset. Zoom out publicly until both
// the positive A and hidden-B negative probes reach uncovered canvas pixels.
async function frameFrontProbes(){
 const toggle=button('Display and previews'),wasOpen=await toggle.getAttribute('aria-expanded')==='true';
 if(wasOpen)await toggle.click();
 const before=await camera();let wheels=0,ready=false;
 for(let attempt=0;attempt<16;attempt++){
  const box=await f.page.locator('.vp-canvas').boundingBox();assert.ok(box);
  const probes=await f.page.evaluate(()=>[5,35].map(x=>{const p=window.__studioScreenOf([x,0,5]);return{pixel:p,canvas:!!p&&document.elementFromPoint(p[0],p[1])===document.querySelector('.vp-canvas')};}));
  ready=probes.every(({pixel:p,canvas})=>p?.length===2&&p[0]>box.x+8&&p[0]<box.x+box.width-8&&p[1]>box.y+8&&p[1]<box.y+box.height-8&&canvas);
  if(ready&&wheels>0){f.report.observations.push({frontProbeFraming:{wheels,probes}});break;}
  const cursor=[box.x+box.width/2,box.y+box.height/2];
  assert.equal(await f.page.evaluate(([x,y])=>document.elementFromPoint(x,y)===document.querySelector('.vp-canvas'),cursor),true,'wheel reaches canvas');
  const prior=await camera();await f.page.mouse.move(...cursor);await f.page.mouse.wheel(0,200);await settle();
  await f.page.waitForFunction(d=>window.__studioCamera().distance>d,prior.distance);wheels++;
 }
 assert.ok(ready&&wheels>0,'both front probes must be inside uncovered canvas after actual wheel zoom');
 assert.ok((await camera()).distance>before.distance,'public zoom-out increased distance');
 if(wasOpen)await display();
}
const update=name=>button('Update inspection view '+name);
async function rows(){return panel().getByRole('button',{name:/^Apply inspection view /}).evaluateAll(nodes=>nodes.map(n=>n.getAttribute('aria-label')));}
await f.run(async()=>{
 const fs=await statfs(output);assert.ok(fs.bavail*fs.bsize>=2*1024**3);
 f.phase='public Open and two captures';await f.newPage();await open();
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await settle();
 const original=await invariant(),allCamera=await camera();await capture('All oblique');
 await top();await f.page.locator('[data-browser-body-key="b1"]').click();
 const subsetCamera=await camera();assert.notDeepEqual(subsetCamera,allCamera);await capture('A review',true);
 const originalRows=await rows();assert.deepEqual(originalRows,['Apply inspection view All oblique','Apply inspection view A review']);
 assert.deepEqual(await invariant(),original);
 const beforeApply=await camera();await apply('A review').click();await cameraEquals(subsetCamera);
 await pick(5,'b1');await pick(35,null);
 f.phase='correct live view then explicitly Update';
 await button('Front').click();await settle();await frameFrontProbes();const correctedCamera=await camera();assert.notDeepEqual(correctedCamera,subsetCamera);
 assert.doesNotMatch(await apply('A review').locator('..').innerText(),/· active/);
 await panel().getByLabel('Inspection view name',{exact:true}).fill('Third capture not used');
 assert.equal(await button('Capture all visible bodies').isDisabled(),true);
 assert.equal(await update('A review').isEnabled(),true);
 await update('A review').click();await settle();await cameraEquals(correctedCamera);
 assert.deepEqual(await rows(),originalRows);assert.deepEqual(await invariant(),original);
 assert.doesNotMatch(await apply('A review').locator('..').innerText(),/· active/,'Update alone does not activate a snapshot');
 assert.equal(await button('Restore inspection view').isEnabled(),true);
 await pick(5,'b1',true);await pick(35,null,true);await cameraEquals(correctedCamera);
 await f.snapshot('01-updated-in-place-no-navigation');
 f.phase='unchanged other snapshot and updated snapshot Apply';
 await apply('All oblique').click();await cameraEquals(allCamera);
 await pick(5,'b1');await pick(35,'b3');await cameraEquals(allCamera);
 await apply('A review').click();await cameraEquals(correctedCamera);await settle();
 assert.match(await apply('A review').locator('..').innerText(),/· active/);
 await pick(5,'b1',true);await pick(35,null,true);await cameraEquals(correctedCamera);
 assert.deepEqual(await invariant(),original);await f.snapshot('02-updated-camera-and-subset-applied');
 f.phase='Restore first pre-Apply camera and visibility';
 await button('Restore inspection view').click();await cameraEquals(beforeApply);
 await pick(5,'b1');await pick(35,'b3');await cameraEquals(beforeApply);
 assert.deepEqual(await rows(),originalRows);assert.deepEqual(await invariant(),original);
 await f.snapshot('03-first-restore-preserved');
 f.phase='actual native Save and fresh Open reset';
 const saved=await f.save('inspection-pair');assert.deepEqual(saved.doc,doc);
 await f.freshOpen(saved.file,saved.doc,'04-native-reopened');await display();
 assert.deepEqual(await rows(),[]);assert.equal(await button('Restore inspection view').isDisabled(),true);await f.same(saved.doc);
 await top();await pick(5,'b1');await pick(35,'b3');await f.same(saved.doc);
 await f.snapshot('05-session-reset');
 f.report.observations.push({allCamera,originalSavedCamera:subsetCamera,updatedCamera:correctedCamera,firstRestoreCamera:beforeApply,
  updateWithoutDelete:true,namesAndTwoRowsPreserved:true,noUpdateNavigation:true,updateDoesNotActivate:true,
  otherSnapshotCameraAndMaskUnchanged:true,updatedApplyCameraAndActualMask:true,firstRestorePreserved:true,
  documentHistoryAndDirtyIndicatorUnchangedBeforeSave:true,nativeSaveFreshOpenClearsSession:true,
  limits:'Stable IDs and stale callbacks are separate unit scope; no persistent named-view support.'});
 assert.equal(f.report.downloads.length,1);
 const end=await statfs(output);assert.ok(end.bavail*end.bsize>=2*1024**3);
});
