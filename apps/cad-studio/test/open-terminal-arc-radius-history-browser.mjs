import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const interior=process.argv.includes('--interior');
const overflow=process.argv.includes('--radius-overflow');
const priorOverflow=process.argv.includes('--prior-overflow');
const arcIndex=interior?1:2;
const arcLabel=`Arc ${arcIndex+1} radius`;
const pins=['apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/open-terminal-arc-radius-history-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/viewport/viewportPointerInput.ts','apps/cad-studio/src/sketch/draftHistory.ts','apps/cad-studio/src/app/sketchControls.ts','apps/cad-studio/src/ui/SketchPanel.tsx','packages/barocss-cad-model/src/sketch/profile.ts','packages/barocss-cad-model/src/sketch/loops.ts'];
pins.push('apps/cad-studio/src/sketch/openArcRadiusHistory.ts');
const f=await createFlow({name:interior?'open-interior-arc-radius-history':'open-terminal-arc-radius-history',output:process.argv[2],envFrozen:'OPEN_TERMINAL_ARC_RADIUS_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Observe numeric radius and draft Undo on the excluded four-point open outline.':`Verify bounded four-point ${interior?'interior':'terminal'} Arc radius draft Undo without changing other geometry.`,limits:['Open Radius is a bulge geometry edit, not a driving-radius lock.','Exactly two Line segments and one Arc, in Line+Arc+Line or Line+Line+Arc order. No joined outlines, associations, existing edit, or other contours. Baseline history excludes this four-point recipe; fixed qualification is exact four points only. Same-value no-op and cancellation are not qualified here. Raw SVG previews are observations, never an authored geometry oracle. Final explicit closure uses a minor R12.5 circular segment (initial sagitta 5), avoiding the semicircle major/minor boundary. Draft bulges are not exposed by a public debug API: panel radius/endpoints are observed before Finish; saved loop endpoints/arc centre are checked after Finish; optional outline bulges are checked only when present.'],inspectorSource:`
import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';import {checkBrep,brepMassProperties,faceGeometry} from '@barocss/cad';console.log(JSON.stringify(partBreps(JSON.parse(readFileSync(process.argv[2],'utf8'))).map(({brep})=>({bodyKinds:brep.bodies.map(b=>b.kind),valid:checkBrep(brep,{strict:true}).valid,volume:brepMassProperties(brep,1).volume,vertices:brep.vertices.map(v=>v.point),cylinders:brep.faces.flatMap(face=>{const g=faceGeometry(face);return g.kind==='cylinder'?[g]:[];})}))));
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
async function authored(){return f.sketchPanel().locator('input').evaluateAll(es=>es.filter(e=>/^Point \d+ [XY]$|^Arc \d+ radius$/.test(e.getAttribute('aria-label')??'')).map(e=>({label:e.getAttribute('aria-label'),value:e.value})));}
async function observe(label){const result={label,sketchVisible:await f.sketchPanel().isVisible(),panel:await f.sketchPanelText(),fields:await authored(),undo:await button('Undo').isEnabled(),redo:await button('Redo').isEnabled(),overlay:await f.page.locator('.vp-overlay .sk-shape').evaluateAll(es=>es.map(e=>({tag:e.tagName,classes:e.getAttribute('class'),points:e.getAttribute('points')})))};f.report.observations.push(result);await f.snapshot(label);return result;}
async function click(point,label){const p=await f.screenOf(point);await f.page.mouse.move(...p,{steps:4});const hit=await f.page.evaluate(p=>{const e=document.elementFromPoint(...p);return {canvas:!!e?.closest('canvas.vp-canvas'),tag:e?.tagName,classes:e?.getAttribute('class')};},p);f.report.observations.push({label,point,hit});await f.persist();assert.equal(hit.canvas,true,'actual click must reach viewport, not a dimension overlay');await f.page.mouse.click(...p);await f.page.waitForTimeout(150);}
async function exact(points,arc){for(let i=0;i<points.length;i++)for(const [j,a] of ['X','Y'].entries())assert.equal(Number(await f.sketchPanel().getByLabel(`Point ${i+1} ${a}`,{exact:true}).inputValue()),points[i][j]);assert.equal(await f.sketchPanel().locator('input[aria-label^="Point "][aria-label$=" X"]').count(),points.length);const radii=(await authored()).filter(v=>v.label.startsWith('Arc '));assert.equal(radii.length,arc?1:0);if(arc)assert.ok(Math.abs(Number(radii[0].value)-12.5)<1e-6);}
async function native(doc,label){
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.ok(n.valid);assert.deepEqual(n.bodyKinds,['solid']);
 const area=400+156.25*Math.asin(.8)-75,expected=3*area;
 assert.ok(Math.abs(n.volume-expected)<1e-7);assert.equal(n.cylinders.length,1);
 const c=n.cylinders[0];assert.ok(Math.abs(c.r-12.5)<1e-8);assert.ok(Math.hypot(c.c[0]-(interior?22.5:20),c.c[1]-(interior?20:22.5))<1e-8);assert.ok(Math.abs(Math.abs(c.a[2])-1)<1e-8);
 for(const x of [10,30])for(const z of [0,3])assert.ok(n.vertices.some(p=>Math.hypot(p[0]-(interior?30:x),p[1]-(interior?x:30),p[2]-z)<1e-8));
 const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);assert.ok(Math.abs(bodies[0].volume-expected)<1e-7);
 f.report.observations.push({label,expectedVolume:expected,native:n});await f.persist();
}
await f.run(async()=>{
 await f.newPage();await button('New part').click();await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===0);await f.ready();const empty=await f.doc();
 await f.page.locator('.mode').getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.frame([[0,0],[60,45]]);
 await f.tool('Line','l');await click([10,10],'line-first');await click([30,10],'line-end');
 if(!interior){await click([30,30],'line-second-end');await exact([[10,10],[30,10],[30,30]],false);}
 await f.tool('Arc','a');await click(interior?[30,30]:[10,30],'arc-end');await click(interior?[35,20]:[20,35],'arc-bend');
 if(interior){await exact([[10,10],[30,10],[30,30]],true);await f.tool('Line','l');await click([10,30],'line-after-arc');}
 await exact([[10,10],[30,10],[30,30],[10,30]],true);await observe('01-completed-radius12.5');await f.same(empty);
 const radius=()=>f.sketchPanel().getByRole('spinbutton',{name:arcLabel,exact:true});
 const endpointFields=()=>authored().then(xs=>xs.filter(x=>x.label.startsWith('Point ')));
 const originalEndpoints=await endpointFields();
 async function setRadius(value,label){await radius().fill(String(value));await radius().blur();assert.ok(Math.abs(Number(await radius().inputValue())-value)<1e-4);assert.deepEqual(await endpointFields(),originalEndpoints);await f.same(empty);return observe(label);}
 await setRadius(14,'02-radius14');const fourteen=await authored();await setRadius(16,'03-radius16');const sixteen=await authored();
 if(overflow){
  f.phase='open radius arithmetic overflow and cancellation';
  await button('Undo').click();assert.deepEqual(await authored(),fourteen);
  assert.equal(await button('Redo').isEnabled(),true);
  await radius().fill('1e16');
  if(priorOverflow){
   await f.sketchPanel().getByRole('spinbutton',{name:'Edge 3 length',exact:true}).waitFor();
   assert.equal(await radius().count(),0);
   assert.deepEqual(await endpointFields(),originalEndpoints);
   await f.same(empty);
   await observe('00-overflow-became-line');
   return;
  }
  await radius().blur();assert.deepEqual(await authored(),fourteen);
  await radius().fill('1e308');await radius().blur();assert.deepEqual(await authored(),fourteen);
  assert.equal(await button('Redo').isEnabled(),true);await f.same(empty);
  await observe('01-overflow-refused-arc-and-redo-kept');
  await button('Redo').click();assert.deepEqual(await authored(),sixteen);await f.same(empty);
 }
 let undoResult='disabled';
 if(await button('Undo').isEnabled()){
  await button('Undo').click();const observed=await observe('04-observed-draft-undo');
  undoResult=JSON.stringify(observed.fields)===JSON.stringify(fourteen)?'restored-radius14':!observed.fields.some(x=>x.label===arcLabel)?'removed-arc-placement':JSON.stringify(observed.fields)===JSON.stringify(sixteen)?'unchanged-radius16':'other-draft-state';
  await f.same(empty);
  if(await button('Redo').isEnabled()){await button('Redo').click();await observe('05-observed-draft-redo');await f.same(empty);}
 }
 f.report.observations.push({label:'radius-draft-undo-classification',undoResult,numericEditUndo:undoResult==='restored-radius14'?'SUPPORTED_OBSERVED':'NOT_OBSERVED_IN_EXCLUDED_RECIPE',contract:baseline?'The selected four-point topology is outside the prior history scope.':`Exact four-point ${interior?'interior':'terminal'} Arc bounded history`,radius14Fields:fourteen,radius16Fields:sixteen,afterFields:await authored()});await f.persist();
 if(baseline && interior) {assert.notEqual(undoResult,'restored-radius14');return;}
 if(!baseline){
  assert.equal(undoResult,'restored-radius14','numeric Radius edit has a distinct draft Undo');
  assert.deepEqual(await authored(),sixteen,'Redo restores radius16');
  await button('Undo').click();assert.deepEqual(await authored(),fourteen);
  await button('Undo').click();await exact([[10,10],[30,10],[30,30],[10,30]],true);
  await button('Undo').click();await exact([[10,10],[30,10],[30,30]],interior);
  await button('Redo').click();await exact([[10,10],[30,10],[30,30],[10,30]],true);
  await button('Redo').click();assert.deepEqual(await authored(),fourteen);
  await button('Redo').click();assert.deepEqual(await authored(),sixteen);await f.same(empty);
  await observe('05b-radius-and-placement-history');
  await radius().fill('9');await radius().blur();assert.deepEqual(await authored(),sixteen);await f.same(empty);
  assert.equal(await button('Undo').isEnabled(),true);await observe('05c-impossible-radius-preserved');
  await button('Undo').click();assert.deepEqual(await authored(),fourteen);
  await button('Redo').click();assert.deepEqual(await authored(),sixteen);await f.same(empty);await observe('05d-impossible-radius-history-unchanged');
 }
 // Continue only if the observed Undo/Redo left the original completed arc owner.
 // Do not silently reconstruct a deleted placement and call it successful history.
 if(await radius().count()!==1||JSON.stringify(await endpointFields())!==JSON.stringify(originalEndpoints)){
  f.report.observations.push({label:'closure-native-save',status:'NOT_RUN',reason:'Observed draft history did not restore the original completed arc endpoints.'});await f.persist();return;
 }
 await setRadius(12.5,'06-explicit-radius12.5-for-closure');
 await f.tool('Line','l');await click([10,10],'close-left');
 const sketch=(await f.finishSketch('07-finished-outline')).doc;assert.equal(sketch.nodes.length,1);
 const node=sketch.nodes[0];assert.equal(node.kind,'sketch');assert.equal(node.profile,'loop');
 const points=[[10,10],[30,10],[30,30],[10,30]];
 assert.deepEqual(node.segments.map(s=>s.start),points);assert.deepEqual(node.segments.map(s=>s.kind),interior?['line','arc','line','line']:['line','line','arc','line']);
 const savedArc=node.segments[arcIndex];assert.equal(savedArc.direction,'ccw');assert.ok(Math.hypot(savedArc.center[0]-(interior?22.5:20),savedArc.center[1]-(interior?20:22.5))<1e-8);
 const expectedBulge=.5,bulges=node.outline?.bulges;
 if(node.outline){assert.deepEqual(node.outline.points,points);assert.ok(Array.isArray(bulges));assert.ok(Math.abs(bulges[arcIndex]-expectedBulge)<1e-8);for(const i of [0,1,2,3].filter(i=>i!==arcIndex))assert.equal(bulges[i]??0,0);}
 f.report.observations.push({label:'saved-loop-contract',points,segments:node.segments,outlinePresent:!!node.outline,bulges,expectedBulge});
 await f.openExtrudeHud();const solid=(await f.applyExtrude({distance:3,previous:sketch,label:'08-extruded'})).doc;await native(solid,'09-native');
 await f.undo();await f.same(sketch);await f.redo();await f.same(solid);await native(solid,'10-redo-native');
 const saved=await f.save('open-terminal-arc-radius-observed');await f.freshOpen(saved.file,saved.doc,'11-reopened');await f.same(solid);await native(solid,'12-reopened-native');
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('13-final');
});
