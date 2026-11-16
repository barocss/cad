import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlow } from './flow-helper.mjs';
const f=await createFlow({name:'sketch-reopen-camera',output:process.argv[2],envFrozen:'SKETCH_REOPEN_CAMERA_FROZEN',
 initialFiles:['apps/cad-studio/test/sketch-reopen-camera-browser.mjs','apps/cad-studio/test/fixtures/d349.bcad'],
 requiredFrozen:['apps/cad-studio/src/sketch/useSketchActions.ts','apps/cad-studio/src/viewport/Viewport.tsx'],
 qualification:'Reopen auto-frame preference preserves all six camera fields when off, with explicit active-plane recovery.',
 limits:['XY/vertical/tilted polygon extrusions in perspective and orthographic desktop views. No new solver, ray tolerance, or camera preset.']});
const template=JSON.parse(await readFile(new URL('./fixtures/d349.bcad',import.meta.url),'utf8')).nodes[2];
const planes=[['xy',{origin:[0,0,10],normal:[0,0,1],xAxis:[1,0,0]}],['vertical',{origin:[5,10,3],normal:[0,1,0],xAxis:[1,0,0]}],['tilted',{origin:[8,-4,12],normal:[0,Math.SQRT1_2,Math.SQRT1_2],xAxis:[1,0,0]}]];
function fixture(plane){const sk={...structuredClone(template),id:'n0',plane};delete sk.on;return{format:'barocss-cad-model',schema:3,units:'mm',parameters:{Depth:5},nodes:[sk,{id:'n1',kind:'extrude',sketch:0,height:{parameter:'Depth'}}],outputs:{b1:{node:1,side:'solid'}},nextId:2};}
const button=name=>f.page.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'Sketch',exact:true});
const camera=()=>f.page.evaluate(()=>window.__studioCamera());
const settle=()=>f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function preference(on){if(await button('Display and previews').getAttribute('aria-expanded')!=='true')await button('Display and previews').click();const toggle=button('Auto-frame reopened sketches');if(await toggle.getAttribute('aria-pressed')!==String(on))await toggle.click();assert.equal(await toggle.getAttribute('aria-pressed'),String(on));await button('Display and previews').click();}
async function customCamera(ortho){await button('Iso').click();if(await button('Ortho').getAttribute('aria-pressed')!==String(ortho))await button('Ortho').click();
 const box=await f.page.locator('canvas.vp-canvas').boundingBox(),x=box.x+box.width*.52,y=box.y+box.height*.48;
 await f.page.mouse.move(x,y);await f.page.mouse.down({button:'right'});await f.page.mouse.move(x+37,y+21,{steps:4});await f.page.mouse.up({button:'right'});
 await f.page.mouse.down({button:'middle'});await f.page.mouse.move(x+72,y+44,{steps:4});await f.page.mouse.up({button:'middle'});await f.page.mouse.wheel(0,-230);await settle();}
async function open(doc){await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'sketch-camera.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);}
async function reopen(){await f.openFeatureEditor(1);const before=await camera();await f.editor().getByRole('button',{name:'Edit sketch',exact:true}).click();await panel().waitFor();await settle();return before;}
async function cancel(){await f.page.evaluate(()=>document.activeElement?.blur());for(let i=0;i<3&&await panel().isVisible();i++)await f.page.keyboard.press('Escape');await panel().waitFor({state:'hidden'});await settle();}
function normal(c,n){const direction=[Math.cos(c.pitch)*Math.cos(c.yaw),Math.cos(c.pitch)*Math.sin(c.yaw),Math.sin(c.pitch)];assert.ok(direction.reduce((s,v,i)=>s+v*n[i],0)>.9999,JSON.stringify({c,n}));}
async function roundtrip(doc){const project='Sketch camera preference',name='sketch-camera-edited.bcad';await f.page.locator('.doc-tab input').fill(name.slice(0,-5));const versions=()=>f.page.getByRole('complementary',{name:'Versions panel',exact:true});const attach=async()=>{if(!(await versions().isVisible()))await button('Project and versions').click();await versions().getByRole('textbox',{name:'Browser project name',exact:true}).fill(project);await versions().getByRole('button',{name:'Project in this browser',exact:true}).click();await versions().getByLabel('Project',{exact:true}).waitFor();};await attach();await button('Save').click();await versions().getByRole('list',{name:'Project documents',exact:true}).getByText(name,{exact:true}).waitFor();await f.page.getByLabel('Unsaved changes',{exact:true}).waitFor({state:'hidden'});const saved=await f.page.evaluate(async([project,name])=>{const root=await navigator.storage.getDirectory(),dir=await(await root.getDirectoryHandle('projects')).getDirectoryHandle(project);return(await(await dir.getFileHandle(name)).getFile()).text();},[project,name]);assert.deepEqual(JSON.parse(saved),doc);await versions().getByRole('button',{name:'Close project',exact:true}).click();await versions().getByLabel('Project',{exact:true}).waitFor({state:'hidden'});await f.page.reload();await f.ready();await attach();await versions().getByRole('button',{name:`Open ${name}`,exact:true}).click();await f.same(doc);await button('Display and previews').click();assert.equal(await button('Auto-frame reopened sketches').getAttribute('aria-pressed'),'false');await button('Display and previews').click();assert.equal(await f.page.evaluate(()=>localStorage.getItem('studio.sketch-reopen-frame')),'off');}
await f.run(async()=>{
 for(const [label,plane] of planes)for(const ortho of [false,true]){
  const id=`${label}-${ortho?'ortho':'perspective'}`,doc=fixture(plane);await f.newPage();await f.page.setViewportSize({width:label==='xy'&&!ortho?1024:1440,height:label==='xy'&&!ortho?800:900});await open(doc);
  // Missing preference preserves the old on behavior.
  await button('Display and previews').click();assert.equal(await button('Auto-frame reopened sketches').getAttribute('aria-pressed'),'true');await button('Display and previews').click();
  await customCamera(ortho);const onBefore=await reopen(),onAfter=await camera();normal(onAfter,plane.normal);assert.notDeepEqual(onAfter,onBefore);assert.equal(onAfter.ortho,ortho);await cancel();await f.same(doc);
  const beforeToggle=await camera();await preference(false);assert.deepEqual(await camera(),beforeToggle);
  await customCamera(ortho);const before=await reopen();assert.deepEqual(await camera(),before);await f.same(doc);await f.snapshot(`${id}-off-preserved`);
  await button('Normal and fit sketch').click();await settle();const fitted=await camera();normal(fitted,plane.normal);assert.notDeepEqual(fitted,before);assert.equal(fitted.ortho,ortho);await f.same(doc);await f.snapshot(`${id}-explicit-fit`);
  // Orbit/pan/zoom in an active sketch, then edit local-mm dimensions without a reframe.
  await customCamera(ortho);const editedView=await camera();const x2=panel().getByLabel('Point 2 X',{exact:true}),x3=panel().getByLabel('Point 3 X',{exact:true});await x2.fill('35');if(Number(await x3.inputValue())!==35)await x3.fill('35');await settle();assert.deepEqual(await camera(),editedView);await f.same(doc);
  await f.page.locator('.topbar button.finish').click();await panel().waitFor({state:'hidden'});await f.changed(doc);const edited=await f.doc();assert.deepEqual(edited.nodes[0].plane,plane);assert.equal(edited.nodes[0].id,'n0');assert.deepEqual(edited.nodes[0].sideTags,doc.nodes[0].sideTags);assert.deepEqual(edited.nodes[1],doc.nodes[1]);assert.deepEqual(edited.parameters,doc.parameters);assert.equal(edited.nodes[0].points[1][0],35);assert.equal(edited.nodes[0].points[2][0],35);assert.ok(Math.abs((await f.bodies()).bodies[0].volume-1875)<1e-6);
  await f.undo();await f.same(doc);await f.redo();await f.same(edited);
  if(label==='xy'&&!ortho){await roundtrip(edited);await customCamera(false);const restored=await reopen();assert.deepEqual(await camera(),restored);await cancel();await f.same(edited);}
  f.report.observations.push({id,before,onBefore,onAfter,fitted,editedView,volume:1875,firstUndoRedo:true});
 }
 // Exact edge-on and far-pan preservation have an explicit, plane-owned way back.
 for(const mode of ['edge-on','far-pan']){
  await f.newPage();const doc=fixture(planes[0][1]);await open(doc);await preference(false);await button('Front').click();
  if(mode==='far-pan'){await button('Top').click();const box=await f.page.locator('canvas.vp-canvas').boundingBox();await f.page.mouse.move(box.x+400,box.y+300);await f.page.mouse.down({button:'middle'});await f.page.mouse.move(box.x+2400,box.y+1800,{steps:8});await f.page.mouse.up({button:'middle'});}
  await settle();const before=await reopen();assert.deepEqual(await camera(),before);await f.snapshot(`${mode}-preserved`);
  const input=panel().getByLabel('Point 2 X',{exact:true});await input.focus();await button('Normal and fit sketch').click();await settle();assert.deepEqual(await camera(),before);await f.page.getByRole('status',{name:'Sketch camera input',exact:true}).waitFor();await f.page.evaluate(()=>document.activeElement?.blur());
  await button('Normal and fit sketch').click();await settle();normal(await camera(),planes[0][1].normal);await f.same(doc);await f.snapshot(`${mode}-recovered`);
  if(mode==='far-pan'){
   await input.fill('1035');const x3=panel().getByLabel('Point 3 X',{exact:true});if(Number(await x3.inputValue())!==1035)await x3.fill('1035');await f.page.evaluate(()=>document.activeElement?.blur());await button('Normal and fit sketch').click();await settle();
   const box=await f.page.locator('canvas.vp-canvas').boundingBox(),rail=await panel().boundingBox();
   for(const p of [[10,10,10],[1035,10,10],[1035,25,10],[10,25,10]]){const q=await f.page.evaluate(p=>window.__studioProject(p),p);assert.ok(q[0]>box.x+45&&q[0]<rail.x&&q[1]>box.y&&q[1]<box.y+box.height,JSON.stringify({p,q,box,rail}));}
   await f.same(doc);await f.snapshot('far-draft-explicit-fit');
  }
  await cancel();await f.same(doc);
  f.report.observations.push({mode,preserved:before,recovered:true,inputGuard:true});
 }
 // Off affects only reopen: new sketch and explicit plane changes still frame.
 await f.newPage();await open(fixture(planes[0][1]));await preference(false);await customCamera(false);await f.command('Sketch');await panel().waitFor();await settle();normal(await camera(),[0,0,1]);await panel().getByLabel('Sketch plane',{exact:true}).selectOption('xz');await settle();normal(await camera(),[0,-1,0]);await cancel();
 // Invalid stored values fall back to on. A failed write remains session-only and does not move the camera.
 await f.newPage();await f.page.evaluate(()=>localStorage.setItem('studio.sketch-reopen-frame','invalid'));await f.page.reload();await f.ready();await button('Display and previews').click();assert.equal(await button('Auto-frame reopened sketches').getAttribute('aria-pressed'),'true');await button('Display and previews').click();
 await f.page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='studio.sketch-reopen-frame')throw new DOMException('blocked','SecurityError');return set.call(this,key,value);};});const beforeFailed=await camera();await preference(false);assert.deepEqual(await camera(),beforeFailed);await button('Display and previews').click();await f.page.getByRole('status',{name:'Sketch camera preference',exact:true}).filter({hasText:/session/i}).waitFor();await f.page.reload();await f.ready();await button('Display and previews').click();assert.equal(await button('Auto-frame reopened sketches').getAttribute('aria-pressed'),'true');
 assert.deepEqual(f.report.downloads,[]);
});
