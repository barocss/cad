import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/open-spline-fitpoint-history-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/sketch/useSketchActions.ts','apps/cad-studio/src/app/sketchControls.ts','apps/cad-studio/src/ui/SketchPanel.tsx','apps/cad-studio/src/sketch/draftHistory.ts','apps/cad-studio/src/sketch/openSplineFitPointHistory.ts','packages/barocss-cad-model/src/sketch/spline.ts','packages/barocss-cad-model/src/sketch/loops.ts','packages/barocss-cad-model/src/sketch/rules.ts'];
const f=await createFlow({name:'open-spline-fitpoint-history',output:process.argv[2],envFrozen:'OPEN_SPLINE_FITPOINT_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Observe existing open Spline fit-point numeric edits and draft Undo without asserting previously unsupported history.':'Verify bounded open Spline fit-point numeric draft Undo/Redo.',limits:['Actual three-click open spline, Select, numeric Fit point 2 Y edits. No internal draft injection.','Independent interpolation check compares authored outline vertex coordinates with the requested fit points; it is not an independent full biarc or native solid oracle.','No forced closure or guessed saved format. Native solid, Finish and Save of the open draft are NOT_RUN in this narrow history baseline. Closed spline lifecycle already has separate qualification.'],snapshotExtra:()=>({dirty:!!document.querySelector('[aria-label="Unsaved changes"]')}),inspectorSource:`import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';import {checkBrep} from '@barocss/cad';const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify(partBreps(doc).map(({brep})=>({valid:checkBrep(brep,{strict:true}).valid,bodies:brep.bodies.length}))));`});
const button=name=>f.page.getByRole('button',{name,exact:true});
async function fields(){return f.sketchPanel().locator('input[aria-label]').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),value:e.value})));}
async function observe(label){const result={label,fields:await fields(),panel:await f.sketchPanelText(),undo:await button('Undo').isEnabled(),redo:await button('Redo').isEnabled(),doc:await f.doc(),alert:await f.sketchAlert()};f.report.observations.push(result);await f.snapshot(label);return result;}
function interpolation(rows,fit){
 const read=(label)=>{const found=rows.filter(x=>x.label===label);assert.equal(found.length,1,label);return Number(found[0].value);};
 const count=rows.filter(x=>/^Point \d+ X$/.test(x.label)).length;
 assert.equal(count,5,'Two open biarc spans expose five authored vertices');
 const points=Array.from({length:count},(_,i)=>[read(`Point ${i+1} X`),read(`Point ${i+1} Y`)]);
 fit.forEach((p,i)=>{assert.deepEqual([read(`Fit point ${i+1} X`),read(`Fit point ${i+1} Y`)],p);assert.deepEqual(points[i*2],p);assert.equal(points.filter(q=>q[0]===p[0]&&q[1]===p[1]).length,1);});
 return points;
}

// Observe a stable rendered state across animation frames, not a fixed sleep.
// Unchanged/disabled is a legitimate baseline outcome, so no mutation is required.
async function settledDraft(){await f.page.evaluate(()=>new Promise((resolve,reject)=>{
 let last='',stable=0,frames=0;const step=()=>{const inputs=[...document.querySelectorAll('.sk-panel input[aria-label]')].map(e=>[e.getAttribute('aria-label'),e.value]);const buttons=[...document.querySelectorAll('button')].filter(e=>['Undo','Redo'].includes(e.getAttribute('aria-label')??e.textContent?.trim())).map(e=>[e.getAttribute('aria-label')??e.textContent,e.disabled]);const now=JSON.stringify({inputs,buttons});stable=now===last?stable+1:0;last=now;++frames;if(frames>=12&&stable>=8)resolve(null);else if(frames>=120)reject(new Error("Draft did not settle within 120 frames"));else requestAnimationFrame(step);};requestAnimationFrame(step);
}));}
async function click(p){const q=await f.screenOf(p);await f.page.mouse.move(...q,{steps:4});const canvas=await f.page.evaluate(q=>!!document.elementFromPoint(...q)?.closest('canvas.vp-canvas'),q);assert.equal(canvas,true);await f.page.mouse.click(...q);await f.page.waitForTimeout(150);}
await f.run(async()=>{
 await f.newPage();await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();const empty=await f.doc();const native=await f.inspect('00-empty-native',empty);assert.deepEqual(native,[]);
 await f.page.locator('.mode').getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.sketchPanel().getByLabel('Sketch plane',{exact:true}).selectOption('xy');await f.frame([[0,0],[60,45]]);await f.tool('Spline','p');
 const fit=[[10,10],[30,20],[50,10]];for(const p of fit)await click(p);
 await observe('01-three-click-placement');await f.tool('Select','v');
 await f.sketchPanel().getByRole('group',{name:'Spline fit points',exact:true}).waitFor();const original=await observe('02-select-completed');interpolation(original.fields,fit);assert.deepEqual(original.doc,empty);
 const versions=[];
 for(const y of [25,30]){const input=f.sketchPanel().getByLabel('Fit point 2 Y',{exact:true});await input.fill(String(y));await input.press('Enter');await f.page.waitForFunction(y=>document.querySelector('.sk-panel input[aria-label="Fit point 2 Y"]')?.value===String(y)&&document.querySelector('.sk-panel input[aria-label="Point 3 Y"]')?.value===String(y),y);const state=await observe(`03-fit-y${y}`);interpolation(state.fields,[[10,10],[30,y],[50,10]]);assert.deepEqual(state.doc,empty);assert.equal(state.alert,null);versions.push(state);}
 if(!baseline){
  async function replay(label,redo,y){assert.equal(await button(redo?'Redo':'Undo').isEnabled(),true);await button(redo?'Redo':'Undo').click();await f.page.waitForFunction(y=>document.querySelector('.sk-panel input[aria-label="Point 3 Y"]')?.value===String(y),y);await settledDraft();const state=await observe(label);interpolation(state.fields,[[10,10],[30,y],[50,10]]);assert.deepEqual(state.doc,empty);assert.equal(state.alert,null);return state;}
  const once=await replay('04-undo-y25',false,25);assert.equal(once.undo,true);
  const originalAgain=await replay('05-undo-y20',false,20);assert.equal(originalAgain.undo,false,'The fixture does not add placement history');
  await replay('06-redo-y25',true,25);const latest=await replay('07-redo-y30',true,30);assert.equal(latest.redo,false);
  const same=f.sketchPanel().getByLabel('Fit point 2 Y',{exact:true});await same.fill('30');await same.press('Enter');await settledDraft();await replay('08-noop-undo-y25',false,25);await replay('09-noop-redo-y30',true,30);
  f.report.observations.push({label:'fixed-draft-history',status:'PASS',fitEdits:2,undo:2,redo:2,noOp:'no extra step',nativeCurve:'NOT_RUN',finish:'NOT_RUN',save:'NOT_RUN'});await f.persist();return;
 }
 const before=versions.at(-1);let classification='disabled';
 if(before.undo){await button('Undo').click();await settledDraft();const after=await observe('04-after-undo');const y=after.fields.find(x=>x.label==='Fit point 2 Y')?.value;classification=y==='25'?'previous-numeric-edit':y==='20'?'original-fit':y==='30'?'unchanged-latest-fit':'placement-or-other-draft-state';assert.deepEqual(after.doc,empty);if(after.redo){await button('Redo').click();await settledDraft();const redo=await observe('05-after-redo');assert.deepEqual(redo.doc,empty);}}
 f.report.observations.push({label:'undo-classification',classification,before,finish:{status:'NOT_RUN',reason:'Open draft history observation only; no closure or unsupported Finish is forced'},nativeSolid:{status:'NOT_RUN',reason:'Open curve has no solid oracle in this fixture'},save:{status:'NOT_RUN',reason:'No authored document commit was attempted'}});
 await f.persist();
});
