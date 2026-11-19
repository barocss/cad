// Isolated baseline only. Run from the CAD checkout after separate heavy approval.
// Existing helpers are imported from that checkout; this file never edits product code.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const driverHash=async()=>createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
const frozenDriver=await driverHash();
const root=process.env.CAD_ROOT;
assert.ok(root,'CAD_ROOT must be the explicitly approved checkout');
const {createFlow}=await import(pathToFileURL(resolve(root,'apps/cad-studio/test/flow-helper.mjs')));
const {clickModelCommand}=await import(pathToFileURL(resolve(root,'apps/cad-studio/test/model-rail-helper.mjs')));
const pins=['apps/cad-studio/src/viewport/GizmoMarks.tsx','apps/cad-studio/src/viewport/gizmo.ts','apps/cad-studio/src/viewport/Viewport.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/styles.css'];
const f=await createFlow({name:'gizmo-state-baseline',output:process.argv[2],envFrozen:'GIZMO_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'#735 pre-implementation state/direction baseline',limits:['Synthetic box only; Move X and Rotate Z; no Scale/plane/full-camera matrix.','No OS pointercancel/lostpointercapture injection or claim.','No geometry accuracy or Save/Open claim; no external CAD consumer.','Signed Angle/zero observation only; snap-step correctness is not qualified.']});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{kind:'sketch',profile:'rectangle',min:[0,0],max:[40,20],id:'n0'},{kind:'extrude',sketch:0,height:10,id:'n1'}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const results={kind:'baseline-observations',driverHash:frozenDriver,stages:{move:'NOT_RUN',rotate:'NOT_RUN',escape:'NOT_RUN'},notRun:['Scale','Move plane','camera reversal','light/dark matrix','OS pointer cancellation','Save/Open','snap-step correctness']};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const state=key=>f.page.locator(`[data-gizmo="${key}"]`).evaluate(el=>({active:el.getAttribute('data-active'),style:[...el.querySelectorAll('line,polyline,polygon,text')].map(n=>({tag:n.tagName,fill:n.getAttribute('fill'),stroke:n.getAttribute('stroke'),width:n.getAttribute('stroke-width'),opacity:n.getAttribute('stroke-opacity')})),heads:[...el.querySelectorAll('polygon')].map(n=>n.getAttribute('points'))}));
async function capture(name){await f.snapshot(name);}
async function persist(){await writeFile(resolve(process.argv[2],'state-observations.json'),JSON.stringify(results,null,2));}
await f.run(async()=>{try{
 await f.newPage();
 const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
 await chooser.setFiles({name:'synthetic-gizmo-state.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
 await f.page.locator('.outliner .ol-row > button.ol').first().click();
 await clickModelCommand(f.page,'Modify','Move');
 const move=f.page.getByRole('dialog',{name:'Move',exact:true});await move.waitFor();
 f.phase='Move baseline';await capture('01-move-idle');const idle=await state('moveX');
 const p=await f.page.locator('[data-gizmo="moveX"] polygon').first().evaluate(el=>{const s=el.closest('svg').getBoundingClientRect(),p=el.points.getItem(0);return [s.left+p.x-3,s.top+p.y];});
 await f.page.mouse.move(...p);await f.page.locator('[data-gizmo="moveX"][data-active="true"]').waitFor();
 await capture('02-move-hover');const hover=await state('moveX');
 await f.page.mouse.down();await f.page.mouse.move(p[0]+36,p[1],{steps:8});await f.page.locator('.gizmo-readout').waitFor();
 await capture('03-move-drag');const drag=await state('moveX');assert.deepEqual(drag.style,hover.style,'baseline: no distinct hover/drag style');assert.notDeepEqual(idle.style,hover.style);
 await f.page.mouse.up();await f.page.locator('.gizmo-readout').waitFor({state:'detached'});
 assert.notEqual(Number(await move.getByLabel('ΔX',{exact:true}).inputValue()),0);
 results.stages.move={idle,hover,drag,release:await state('moveX'),hoverDragStyleEqual:true};
 await button('Cancel',move).click();await f.same(source);results.stages.move.cancelSourcePreserved=true;
 await clickModelCommand(f.page,'Modify','Rotate');const rotate=f.page.getByRole('dialog',{name:'Rotate',exact:true});await rotate.waitFor();
 f.phase='Rotate signed baseline';
 const rotationIdle=await state('turnZ');assert.equal(rotationIdle.heads.length,1);await capture('04-rotate-idle-fixed-arrow');
 const t=await f.page.locator('[data-gizmo="turnZ"] polyline').first().evaluate(el=>{const r=el.closest('svg').getBoundingClientRect(),p=el.points.getItem(9),c=document.querySelector('.gizmo-origin');return {p:[r.left+p.x,r.top+p.y],c:[r.left+Number(c.getAttribute('cx')),r.top+Number(c.getAttribute('cy'))]};});
 const dx=t.p[0]-t.c[0],dy=t.p[1]-t.c[1];
 const at=a=>[t.c[0]+dx*Math.cos(a)-dy*Math.sin(a),t.c[1]+dx*Math.sin(a)+dy*Math.cos(a)];
 await f.page.mouse.move(...t.p);await f.page.locator('[data-gizmo="turnZ"][data-active="true"]').waitFor();await f.page.mouse.down();
 const samples=[];
 for(const [label,a] of [['screen-positive',Math.PI/5],['zero',0],['screen-negative',-Math.PI/5]]){
  await f.page.mouse.move(...at(a),{steps:10});await f.page.locator('.gizmo-readout').waitFor();
  await capture(`05-rotate-${label}`);
  const angle=Number(await rotate.getByLabel('Angle',{exact:true}).inputValue());const marks=await state('turnZ');
  assert.ok(Number.isFinite(angle));assert.deepEqual(marks.heads,rotationIdle.heads,'baseline: arrowhead stays fixed despite signed preview');
  samples.push({label,angle,marks,readout:await f.page.locator('.gizmo-readout').textContent()});
 }
 assert.ok(samples[0].angle*samples[2].angle<0,'opposite real signed previews');assert.equal(samples[1].angle,0,'return to start displays zero');
 await f.page.mouse.up();await f.page.locator('.gizmo-readout').waitFor({state:'detached'});
 assert.equal(Number(await rotate.getByLabel('Angle',{exact:true}).inputValue()),samples[2].angle);
 results.stages.rotate={idle:rotationIdle,samples,releaseReadoutGone:true};
 await button('Cancel',rotate).click();await f.same(source);results.stages.rotate.cancelSourcePreserved=true;
 // Real keyboard cancellation, no synthetic event dispatch or private state mutation.
 await clickModelCommand(f.page,'Modify','Move');await move.waitFor();
 f.phase='Real keyboard cancellation';
 const q=await f.page.locator('[data-gizmo="moveX"] polygon').first().evaluate(el=>{const r=el.closest('svg').getBoundingClientRect(),p=el.points.getItem(0);return [r.left+p.x-3,r.top+p.y];});
 await f.page.mouse.move(...q);await f.page.mouse.down();await f.page.mouse.move(q[0]+30,q[1],{steps:6});await f.page.locator('.gizmo-readout').waitFor();
 await f.page.keyboard.press('Escape');await f.page.mouse.up();await f.page.locator('.gizmo-readout').waitFor({state:'detached'});
 // Escape may cancel the command. Record the visible route rather than infer onCancel internals.
 await f.same(source);
 const dialogRemains=await move.isVisible();const remainingDraft=dialogRemains ? await move.getByLabel('ΔX',{exact:true}).inputValue() : null;
 if(dialogRemains)await button('Cancel',move).click();await f.same(source);
 results.stages.escape={dialogRemains,remainingDraft,acceptedSourcePreservedImmediately:true,cleanupCancelUsed:dialogRemains,sourcePreservedAfterCleanup:true,readoutGone:true};await capture('06-after-cancel');
 results.completed=true;
 }finally{results.driverHashAfter=await driverHash();await persist();assert.equal(results.driverHashAfter,frozenDriver,'isolated driver frozen');}});
