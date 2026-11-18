import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins = ['apps/cad-studio/test/section-selective-instance-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/ui/SectionBar.tsx','apps/cad-studio/src/ui/ViewDisplayControls.tsx'];
const f = await createFlow({ name:'section-selective-instance', envFrozen:'SECTION_SELECTIVE_FROZEN', output:process.argv[2], initialFiles:pins,
 qualification:'Session-only exclusion of one rotated top-level occurrence from a single world section plane; public exclusion/restore controls and actual picking.',
 limits:['Synthetic shared 20×12×8 boxes, Rz90; no nested occurrence or multi-plane support.','Plane placement, live drag and CPU forcing use existing test hooks; exclusion, restore, selection and Save/Open use public UI.','World-point picking probes test hit results, not clipped bounds. __studioInstanceBounds is not used as clipping evidence.','Forced CPU section path on a WebGPU viewport is not a native WebGL2 backend qualification.'],
 snapshotExtra:()=>({section:window.__studioSection?.(),dirty:!!document.querySelector('[aria-label="Unsaved changes"]')}) });
const part={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[20,12]},{id:'n1',kind:'extrude',sketch:0,height:8}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const seed={...part,nodes:[],outputs:{},nextId:0,instances:[0,30].map((y,k)=>({id:`p${k+1}`,name:`Plate ${k+1}`,doc:part,part:{id:'shared',rev:'A'},position:[5,y,3],rotation:[0,0,90]}))};
// Rz90 maps local [0,20]×[0,12] to world [-7,5]×[y,y+20].
// These points lie on the original top faces in the removed x<0 half, well away from edges.
const points=[[-4,10,11],[-4,40,11]];
const button=name=>f.page.getByRole('button',{name,exact:true});
const row=id=>f.page.locator(`[data-browser-instance-path="${id}"]`);
const exclusions=()=>f.page.getByRole('group',{name:'Section instance exclusions',exact:true});
const hits=ids=>f.page.waitForFunction(([points,ids])=>points.every((p,k)=>(window.__studioInstanceAt?.(p)?.id??null)===ids[k]),[points,ids]);
const unchanged=async baseline=>{const now=await f.snapshot('state-check');assert.deepEqual(now.doc,baseline.doc);assert.deepEqual(now.history,baseline.history);assert.equal(now.dirty,baseline.dirty);assert.equal(await button('Undo').isEnabled(),baseline.undoEnabled);};
async function clickPoint(k,id){await f.page.keyboard.press('Escape');const xy=await f.page.evaluate(p=>window.__studioScreenOf(p),points[k]);assert.ok(xy?.length===2);await f.page.mouse.click(...xy);// Selection is checked on the public outliner below.
 await f.page.waitForFunction(id=>{const selected=[...document.querySelectorAll('[data-browser-instance-path].sel')].map(n=>n.getAttribute('data-browser-instance-path'));return id?selected.includes(id):selected.length===0;},id);}
await f.run(async()=>{
 await f.newPage();await f.page.setViewportSize({width:1440,height:1000});
 await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'selective-section.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);await f.ready();
 await f.page.locator('.views').getByRole('button',{name:'Top',exact:true}).click();await f.page.keyboard.press('f');await hits(['p1','p2']);const baseline=await f.snapshot('01-uncut');baseline.undoEnabled=await button('Undo').isEnabled();f.report.observations.push({initialUndoEnabled:baseline.undoEnabled});
 for(const cpu of [false,true]){
  const label=cpu?'cpu-forced':'webgpu';
  await f.page.evaluate(cpu=>{window.__studioSectionDebug({hold:false,cpu});window.__studioSetSection({mode:'plane',planes:[{normal:[1,0,0],offset:0,axis:'x'}]});},cpu);
  await f.page.waitForFunction(cpu=>window.__studioSection?.().gpu===!cpu,cpu);
  assert.equal(await f.page.evaluate(()=>window.__studioSection().gpu),!cpu,`actual ${label} section path required`);
  await hits([null,null]);await f.snapshot(`${label}-both-cut`);
  await row('p2').click();await exclusions().getByRole('button',{name:'Exclude selected instances',exact:true}).click();await hits([null,'p2']);
  await f.page.waitForFunction(()=>window.__studioSection().excludedInstances.includes('p2'));
  assert.equal(await button('Sketch the section').isDisabled(),true);
  assert.equal(await f.page.locator('[data-slot="toggle-group-item"]').filter({hasText:/^Box$/}).isDisabled(),true);
  await clickPoint(1,'p2');await clickPoint(0,null);await f.snapshot(`${label}-p2-excluded`);await unchanged(baseline);
  // Public Frame all uses the actual renderer bounds; camera target includes panel-area compensation.
  await f.page.evaluate(()=>document.activeElement?.blur());await f.page.keyboard.press('f');await hits([null,'p2']);
  f.report.observations.push({label:`${label}-frame-all`,camera:await f.page.evaluate(()=>window.__studioCamera()),limit:'Camera target is observed, not asserted to equal bounds midpoint.'});
  await f.snapshot(`${label}-frame-all-excluded`);await unchanged(baseline);
  // Existing test hook exercises the live plane store and its commit, without creating CAD edits.
  const dragged={mode:'plane',planes:[{normal:[1,0,0],offset:1,axis:'x'}]};
  await f.page.evaluate(s=>window.__studioDragSection(s,false),dragged);
  await f.page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  await hits([null,'p2']);await f.snapshot(`${label}-live-offset1`);
  await f.page.evaluate(s=>window.__studioDragSection(s,true),dragged);
  await f.page.waitForFunction(()=>window.__studioSection().planes[0]?.offset===1);await hits([null,'p2']);await unchanged(baseline);
  await f.page.evaluate(()=>window.__studioSetSection({mode:'plane',planes:[{normal:[1,0,0],offset:0,axis:'x'}]}));await hits([null,'p2']);
  await button('Restore section for p2').click();await hits([null,null]);await row('p2').click();await button('Exclude selected instances').click();await hits([null,'p2']);
  await button('Restore all section instances').click();await hits([null,null]);await unchanged(baseline);
  await button('Section view').click();await hits(['p1','p2']);
 }
 await f.page.evaluate(()=>{window.__studioSectionDebug({hold:false,cpu:false});window.__studioSetSection({mode:'plane',planes:[{normal:[1,0,0],offset:0,axis:'x'}]});});await hits([null,null]);await row('p2').click();await button('Exclude selected instances').click();await hits([null,'p2']);
 const saved=await f.save('session-only-exclusion');assert.deepEqual(saved.doc,seed);await f.freshOpen(saved.file,saved.doc,'reopened');await f.ready();
 assert.equal(await f.page.evaluate(()=>window.__studioSection().mode),null);assert.deepEqual(await f.page.evaluate(()=>window.__studioSection().excludedInstances),[]);
 await f.page.locator('.views').getByRole('button',{name:'Top',exact:true}).click();await f.page.keyboard.press('f');await hits(['p1','p2']);await f.same(seed);
 f.report.observations.push({geometry:'world full bounds p1[-7,0,3]..[5,20,11], p2[-7,30,3]..[5,50,11] by analytic Rz90; not runtime clipped-bound proof',probePoints:points,paths:['actual WebGPU section','forced CPU section on same viewport'],sessionClearedOnFreshOpen:true});
});
