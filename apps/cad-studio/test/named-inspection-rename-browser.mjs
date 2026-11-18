// #220 session-only Rename feature baseline. Session-only, actual UI actions; no product patches.
import assert from 'node:assert/strict';
import { statfs } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createFlow } from './flow-helper.mjs';
const repo=resolve(import.meta.dirname,'../../..'),output=process.argv[2];
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'));
const pins=['apps/cad-studio/test/named-inspection-rename-browser.mjs','apps/cad-studio/test/named-inspection-browser.mjs','apps/cad-studio/src/state/useNamedInspection.ts','apps/cad-studio/src/app/namedInspection.ts','apps/cad-studio/src/ui/NamedInspectionViews.tsx','apps/cad-studio/src/ui/ViewDisplayControls.tsx','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/useModelAppearance.ts','apps/cad-studio/src/App.tsx'];
const f=await createFlow({name:'named-inspection-rename',output,envFrozen:'NAMED_INSPECTION_RENAME_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Explicit session-only Rename preserves saved camera/visibility and first Restore; public native Save/Open keeps document data and clears session views.',
 limits:['Synthetic ordinary two-body document only. No persistent snapshots or geometry accuracy certification.', 'Actual camera hook and canvas picking are observations, not hidden state mutation. Stable internal IDs and callback races require separate unit coverage.', 'Visible History rows and Undo/Redo availability only; no internal history identity claim. Public owner reset is checked, not injected stale callbacks.']});
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
const rows=()=>panel().getByRole('button',{name:/^Apply inspection view /}).evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-label')));
const draft=name=>panel().getByRole('textbox',{name:'Rename inspection view '+name,exact:true});
const begin=name=>button('Rename inspection view '+name).click();
const saveName=name=>button('Save inspection view name '+name);
const cancel=name=>button('Cancel renaming inspection view '+name);
await f.run(async()=>{
 const fs=await statfs(output);assert.ok(fs.bavail*fs.bsize>=2*1024**3);await f.newPage();await open();
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await settle();
 const original=await invariant(),allCamera=await camera();await capture('All oblique');
 await top();await f.page.locator('[data-browser-body-key="b1"]').click();
 const subsetCamera=await camera();assert.notDeepEqual(subsetCamera,allCamera);await capture('A reviwe',true);
 const beforeApply=await camera();await apply('A reviwe').click();await cameraEquals(subsetCamera);
 await pick(5,'b1');await pick(35,null);
 await apply('All oblique').click();await cameraEquals(allCamera);
 const originalRows=await rows();assert.deepEqual(originalRows,['Apply inspection view All oblique','Apply inspection view A reviwe']);
 f.phase='explicit draft Cancel Escape blur and blank boundaries';
 await begin('A reviwe');await draft('A reviwe').fill('Cancelled name');await cancel('A reviwe').click();
 assert.equal(await draft('A reviwe').count(),0);assert.deepEqual(await rows(),originalRows);
 await begin('A reviwe');await draft('A reviwe').fill('Escaped name');await draft('A reviwe').press('Escape');
 assert.equal(await draft('A reviwe').count(),0);assert.deepEqual(await rows(),originalRows);
 await begin('A reviwe');await draft('A reviwe').fill('Blur must not save');
 await panel().getByRole('textbox',{name:'Inspection view name',exact:true}).click();
 assert.deepEqual(await rows(),originalRows);assert.equal(await draft('A reviwe').inputValue(),'Blur must not save');
 await draft('A reviwe').fill('   ');assert.equal(await saveName('A reviwe').isDisabled(),true);
 assert.deepEqual(await rows(),originalRows);await cameraEquals(allCamera);assert.deepEqual(await invariant(),original);
 f.phase='rename inactive row without recapture or navigation';
 await draft('A reviwe').fill('A review');await saveName('A reviwe').click();await apply('A review').waitFor();
 assert.equal(await draft('A reviwe').count(),0);await cameraEquals(allCamera);
 assert.deepEqual(await rows(),['Apply inspection view All oblique','Apply inspection view A review']);
 assert.match(await apply('All oblique').locator('..').innerText(),/· active/);
 assert.doesNotMatch(await apply('A review').locator('..').innerText(),/· active/);
 await pick(5,'b1');await pick(35,'b3');assert.deepEqual(await invariant(),original);
 await f.snapshot('01-name-only-no-navigation');
 await apply('A review').click();await cameraEquals(subsetCamera);
 await pick(5,'b1');await pick(35,null);
 f.phase='rename active row preserves active snapshot';
 await begin('A review');await draft('A review').fill('A inspected');await saveName('A review').click();await apply('A inspected').waitFor();
 await cameraEquals(subsetCamera);assert.match(await apply('A inspected').locator('..').innerText(),/· active/);
 assert.deepEqual(await rows(),['Apply inspection view All oblique','Apply inspection view A inspected']);
 await pick(5,'b1');await pick(35,null);assert.deepEqual(await invariant(),original);
 await f.snapshot('02-renamed-original-subset');
 await button('Restore inspection view').click();await cameraEquals(beforeApply);
 await pick(5,'b1');await pick(35,'b3');assert.deepEqual(await invariant(),original);
 await f.snapshot('03-first-restore-preserved');
 f.phase='native Save retains source only';
 const saved=await f.save('inspection-pair');assert.deepEqual(saved.doc,doc);
 // Explicit public Open changes owner while a draft exists. No stale callback invocation.
 await begin('A inspected');await draft('A inspected').fill('STALE_DRAFT_NOT_SAVED');
 const other=structuredClone(doc);other.bodies.b1.name='Other synthetic owner';
 await f.openFile({name:'other-inspection-pair.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(other))},4);await f.same(other);await display();
 assert.deepEqual(await rows(),[]);assert.equal(await panel().getByRole('textbox',{name:/^Rename inspection view /}).count(),0);
 assert.equal(await button('Restore inspection view').isDisabled(),true);
 await capture('A inspected');assert.deepEqual(await rows(),['Apply inspection view A inspected']);
 assert.doesNotMatch(await panel().innerText(),/STALE_DRAFT_NOT_SAVED/);await f.same(other);
 f.phase='fresh Open restores original native document and resets session';
 await f.freshOpen(saved.file,saved.doc,'04-native-reopened');await display();
 assert.deepEqual(await rows(),[]);assert.equal(await button('Restore inspection view').isDisabled(),true);await f.same(doc);
 await top();await pick(5,'b1');await pick(35,'b3');await f.same(doc);await f.snapshot('05-session-reset');
 f.report.observations.push({allCamera,subsetCamera,firstRestoreCamera:beforeApply,
  explicitRenameNoRecapture:true,cancelEscapeBlurAndBlank:true,rowOrderAndOtherNamePreserved:true,
  renameDoesNotNavigate:true,inactiveAndActiveMarkersPreserved:true,originalSubsetApplyPreserved:true,
  firstRestorePreserved:true,documentDirtyVisibleHistoryUnchangedBeforeSave:true,
  nativeSaveFreshOpenPreservesSourceAndClearsSession:true,publicOwnerOpenDiscardsDraft:true,
  internalStableIds:'UNIT_ONLY',staleCallbackRace:'NOT_RUN'});
 assert.equal(f.report.downloads.length,1);const end=await statfs(output);assert.ok(end.bavail*end.bsize>=2*1024**3);
});
