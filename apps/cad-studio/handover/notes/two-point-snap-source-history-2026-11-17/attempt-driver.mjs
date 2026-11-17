import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/test/two-point-snap-source-history-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/sketch/useTwoPointSnap.ts','apps/cad-studio/src/viewport/viewportPointerInput.ts'];
const f=await createFlow({name:'two-point-snap-source-history',output:process.argv[2],envFrozen:'TWO_POINT_HISTORY_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Public draft Undo removes the pending calculation source; Redo does not resurrect it; explicit reselection supplies a rectangle corner.',
 limits:['XY authored construction line and Rectangle only. Project Open during Sketch remains inaccessible and is not tested. No captured callback injection or native geometry inspector.'],
 snapshotExtra:()=>({snapForm:document.querySelector('form[aria-label="Two-point snap"]')?.textContent??null,rectangle:[...document.querySelectorAll('input[id^="sk-"]')].filter(x=>['sk-x','sk-y','sk-width','sk-height'].includes(x.id)).map(x=>x.value),construction:[...document.querySelectorAll('.vp-overlay .sk-shape.construction')].map(x=>x.getAttribute('points'))}),
 oracleSource:String.raw`import json,sys
x=json.load(sys.stdin);s=x['nodes'][0]
assert s['min']==[7.75,3.25] and s['max']==[15.5,6.5]
assert [c['points'] for c in s['construction']]==[[[0,0],[31,13]]]
assert 'association' not in s
print(json.dumps({'status':'PASS','first':[7.75,3.25],'second':[15.5,6.5],'sourceUnchanged':True}))`});
const b=(p,n)=>p.getByRole('button',{name:n,exact:true});
const form=()=>f.page.getByRole('form',{name:'Two-point snap',exact:true});
const marker=()=>f.page.locator('.vp-overlay .sk-osnap').filter({hasText:'Calculated'});
async function arm(){await b(f.sketchPanel(),'Two-point snap').click();await f.worldClick([0,0]);await f.worldClick([31,13]);await form().getByLabel('Snap value').fill('0.25');await form().getByRole('status').getByText('Point 7.75, 3.25 mm',{exact:true}).waitFor();await marker().waitFor();}
await f.run(async()=>{
 await f.newPage();await b(f.page,'New part').click();await f.ready();const empty=await f.doc();
 await b(f.page.locator('.mode'),'Sketch').click();await f.sketchPanel().waitFor();await f.frame([[0,0],[31,13]]);
 await f.tool('Line','l');await f.page.keyboard.press('x');await f.worldClick([0,0]);await f.worldClick([31,13]);await f.page.keyboard.press('x');await f.tool('Rectangle','r');
 await arm();await f.same(empty);const pending=await f.snapshot('01-pending-source');assert.equal(pending.construction.length,1);
 f.phase='public draft Undo removes source and pending calculation';await f.undo();await form().waitFor({state:'hidden'});await marker().waitFor({state:'hidden'});
 await f.snapshot('02a-calculation-retired');
 // Point-confirmation history can retain a visible construction after the first Undo. Require removal after the second, not merely cue disappearance.
 await f.undo();await f.page.waitForFunction(()=>document.querySelectorAll('.vp-overlay .sk-shape.construction').length===0);
 const undone=await f.snapshot('02-source-undone');assert.deepEqual(undone.doc,empty);assert.equal(undone.rectangle.length,0);
 f.phase='Redo restores source only';await f.redo();await f.page.waitForFunction(()=>document.querySelectorAll('.vp-overlay .sk-shape.construction').length===1);
 assert.equal(await form().count(),0);assert.equal(await marker().count(),0);await f.redo();await f.same(empty);assert.equal(await form().count(),0);assert.equal(await marker().count(),0);await f.snapshot('03-source-redone');
 await f.tool('Rectangle','r');await arm();await b(form(),'Use point').click();await form().waitFor({state:'hidden'});
 const first=await f.snapshot('04-explicit-first-corner');assert.deepEqual(first.rectangle.map(Number),[7.75,3.25,0,0]);assert.deepEqual(first.doc,empty);
 await f.worldClick([15.56,6.54]);const finished=await f.finishSketch('05-finished');await f.runOracle(finished.doc,'05-coordinate-oracle');
 const saved=await f.save('source-history');await f.freshOpen(saved.file,finished.doc,'06-fresh-open');await f.runOracle(await f.doc(),'06-coordinate-oracle');
 f.report.observations.push({undoRemovedSource:true,redoDidNotResurrectCalculation:true,explicitReselection:true,acceptedCorner:[7.75,3.25],actualSaveFreshOpen:true});
});
