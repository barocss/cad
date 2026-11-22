import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const f=await createFlow({name:'sketch-two-arc-mobility',output:process.argv[2],envFrozen:'SKETCH_TWO_ARC_MOBILITY_SOURCE_FROZEN',initialFiles:['apps/cad-studio/test/sketch-two-arc-mobility-browser.mjs','apps/cad-studio/src/ui/SketchPanel.tsx','packages/barocss-cad-model/src/sketch/corner.ts','packages/barocss-cad-model/src/sketch/mobility.ts','apps/cad-studio/src/ui/SketchMobility.tsx','apps/cad-studio/src/sketch/pointMotionLabel.ts'],qualification:'Actual opposite rectangle corner Round operations, then constraint toggles and retained geometry; no diagnostic result is fabricated.',limits:['Two opposite straight-corner R4 rounds; baseline local mobility absence, not finite-motion certification.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {brepMassProperties,checkBrep} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(partBreps(doc).map(({key,brep})=>({key,valid:checkBrep(brep,{strict:true}).valid,volume:brepMassProperties(brep,1).volume,vertices:brep.vertices.map(v=>v.point)}))));
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]},{id:'n1',kind:'extrude',sketch:0,height:5}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const points=[[0,0],[36,0],[40,4],[40,30],[4,30],[0,26]];
async function native(doc,label,rounded){const bodies=await f.inspect(label,doc);assert.equal(bodies.length,1);const n=bodies[0];assert.equal(n.valid,true);const volume=rounded?(1200-2*(16-4*Math.PI))*5:6000;assert.ok(Math.abs(n.volume-volume)<1e-7);assert.ok(Math.abs((await f.bodies()).bodies[0].volume-volume)<1e-7);const xy=rounded?points:[[0,0],[40,0],[40,30],[0,30]];for(const [x,y] of xy)for(const z of [0,5])assert.ok(n.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-8),JSON.stringify([x,y,z]));return n;}
async function edit(){await f.openFeatureEditor(1);await button('Edit sketch',f.editor()).click();await f.sketchPanel().waitFor();await f.tool('Select','s');await f.frame([[0,0],[40,30]]);}
async function round(point){await f.worldClick(point);await button('Fillet',f.sketchPanel()).click();const group=f.sketchPanel().getByRole('group',{name:'Fillet',exact:true});await group.getByLabel('Radius',{exact:true}).fill('4');await button('Apply',group).click();assert.equal(await f.sketchAlert(),null);}
async function noMobility(label,doc){
 const panel=f.sketchPanel(),details=panel.locator('details.sk-mobility');
 if(baseline)assert.equal(await details.count(),0);
 else{
  await details.waitFor();if(!await details.evaluate(e=>e.open))await details.locator('summary').click();
  await details.getByText('Local first-order directions in sketch X/Y, not world axes. Other points may move together. This is not a finite-motion guarantee.',{exact:true}).waitFor();
  const rows=await details.getByRole('listitem').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),direction:e.getAttribute('aria-description')})));
  assert.deepEqual(rows.filter(r=>r.label.startsWith('Locally movable point')).map(r=>r.label),[2,3,4,5,6].map(i=>`Locally movable point ${i}`));
  assert.deepEqual(rows.filter(r=>r.label.startsWith('Locally movable edge')).map(r=>r.label),[1,2,3,4,5,6].map(i=>`Locally movable edge ${i}`));
  const locked=['02-two-rounds-draft','08-constraints-restored','13-reopened-no-mobility'].includes(label);
  if(locked){for(const [i,direction] of [[2,'Along ±(1, 0)'],[3,'Along ±(1, 0)'],[4,'Two independent directions'],[5,'Along ±(0, 1)'],[6,'Along ±(0, 1)']])assert.equal(rows.find(r=>r.label===`Locally movable point ${i}`).direction,direction);}
  const diagnostics=await panel.locator('.sk-solver-diagnostics').textContent();
  const dof=locked?2:label==='05-radius-locks-cleared'?4:label==='06-equal-radius-observed'?3:null;
  // The point projections do not assert independently controllable motion:
  // equal-radius states are coupled and the disclosure explicitly says so.
  if(dof!==null)assert.equal(diagnostics.trim().endsWith(`· ${dof} DOF`),true,diagnostics);
  const row=details.getByRole('listitem',{name:'Locally movable point 2',exact:true});
  const marker=()=>f.page.waitForFunction(()=>!!document.querySelector('.vp-overlay .inspected[data-sketch-entity="point:1"]'));
  const clear=()=>f.page.waitForFunction(()=>!document.querySelector('.vp-overlay .inspected[data-sketch-entity="point:1"]'));
  await row.hover();await marker();await f.page.mouse.move(1,1);await clear();
  await row.focus();await marker();await panel.getByLabel('Point 1 X',{exact:true}).focus();await clear();
  f.report.observations.push({label,rows,diagnostics,expectedDOF:dof,hoverFocus:'point:1',independentMotionClaim:false});
  await details.scrollIntoViewIfNeeded();
 }
 assert.deepEqual(await f.doc(),doc);await f.snapshot(label);
}
function outlineCheck(doc){const o=doc.nodes[0].outline;assert.equal(o.points.length,6);for(let i=0;i<6;i++)assert.ok(Math.hypot(...o.points[i].map((v,j)=>v-points[i][j]))<1e-8);assert.deepEqual(Object.keys(o.radii).sort(),['1','4']);assert.ok(Math.abs(o.radii[1]-4)<1e-8&&Math.abs(o.radii[4]-4)<1e-8);assert.deepEqual([...o.tangents].sort((a,b)=>a-b),[1,2,4,5]);assert.equal((o.equalRadii??[]).length,0);assert.deepEqual(doc.nodes[1],source.nodes[1]);}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'opposite-rounds.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);await native(source,'01-original-rectangle-native',false);
 await edit();await round([40,0]);await round([0,30]);await noMobility('02-two-rounds-draft',source);
 const rounded=(await f.finishSketch('03-rounded-finished')).doc;outlineCheck(rounded);await native(rounded,'04-rounded-native',true);
 await f.undo();await f.same(source);await f.redo();await f.same(rounded);
 await edit();const panel=f.sketchPanel();const radius=i=>panel.getByLabel(`Arc ${i} radius`,{exact:true});
 for(const i of [2,5]){assert.ok(Math.abs(Number(await radius(i).inputValue())-4)<1e-8);assert.equal(await radius(i).evaluate(e=>e.classList.contains('locked')),true);await radius(i).fill('');}
 await noMobility('05-radius-locks-cleared',rounded);
 const equal=button('Equal radius for arcs 2 and 5',panel);assert.equal(await equal.getAttribute('aria-pressed'),'false');await equal.click();
 const equalApplied=await equal.getAttribute('aria-pressed')==='true';if(!baseline)assert.equal(equalApplied,true,'Baseline accepted equal-radius with both radius locks cleared');f.report.observations.push({label:'equal-radius-add',accepted:equalApplied,alert:await f.sketchAlert()});await noMobility('06-equal-radius-observed',rounded);
 if(equalApplied){await f.undo();assert.equal(await equal.getAttribute('aria-pressed'),'false');await f.redo();assert.equal(await equal.getAttribute('aria-pressed'),'true');await equal.click();assert.equal(await equal.getAttribute('aria-pressed'),'false');}
 for(const i of [2,5]){await radius(i).fill('4');await radius(i).press('Enter');assert.equal(await radius(i).evaluate(e=>e.classList.contains('locked')),true);}
 const tangent=button('Tangent at point 2',panel);assert.equal(await tangent.getAttribute('aria-pressed'),'true');await tangent.click();
 const removed=await tangent.getAttribute('aria-pressed')==='false';f.report.observations.push({label:'tangent-remove',accepted:removed,alert:await f.sketchAlert()});await noMobility('07-tangent-observed',rounded);
 if(removed){await f.undo();assert.equal(await tangent.getAttribute('aria-pressed'),'true');await f.redo();assert.equal(await tangent.getAttribute('aria-pressed'),'false');await tangent.click();assert.equal(await tangent.getAttribute('aria-pressed'),'true');}
 await noMobility('08-constraints-restored',rounded);const final=(await f.finishSketch('09-finished-restored')).doc;outlineCheck(final);await native(final,'10-restored-native',true);assert.deepEqual(final.nodes[0].sideTags,rounded.nodes[0].sideTags);
 const saved=await f.save('opposite-rounds-constraint-baseline');await f.freshOpen(saved.file,saved.doc,'11-reopened');await f.same(final);outlineCheck(final);await native(final,'12-reopened-native',true);await edit();await noMobility('13-reopened-no-mobility',final);await f.page.evaluate(()=>document.activeElement?.blur());await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor({state:'hidden'});await f.same(final);
});
