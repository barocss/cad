import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
// Prepared on main596547415; width-only editing must not re-quantize arc centres.
const pins=['apps/cad-studio/test/slot-width-precision-browser.mjs',...(!baseline?['apps/cad-studio/src/sketch/slotWidth.ts']:[]),'apps/cad-studio/src/ui/SketchPanel.tsx','apps/cad-studio/src/sketch/slotCentre.ts','apps/cad-studio/src/App.tsx','apps/cad-studio/src/sketch/draftHistory.ts','packages/barocss-cad-model/src/sketch/profile.ts','packages/barocss-cad-model/src/sketch/reopen.ts'];
const f=await createFlow({name:'slot-width-precision',output:process.argv[2],envFrozen:'SLOT_WIDTH_PRECISION_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Observe width-only Slot editing after a precise centre translation and physical Save/Open. Intended precision is separate from valid native lifecycle.',limits:['One horizontal XY Slot, original centre distance35, radius4 to5, extrusion3. No Length/Angle or solver capability changes.'],inspectorSource:`
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkBrep,faceGeometry,massPropertiesOf} from '@barocss/cad';
import {partSnapshot} from '@barocss/cad-model/engine/part';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8')),outputs=partSnapshot(doc).outputs;
assert.equal(outputs.length,1);const o=outputs[0];assert.equal(o.bodyCount,1);assert.ok(checkBrep(o.brep,{strict:true}).valid);
console.log(JSON.stringify({mass:massPropertiesOf(o),vertices:o.brep.vertices.map(v=>v.point),cylinders:o.brep.faces.flatMap(face=>{const g=faceGeometry(face);return g.kind==='cylinder'?[{name:face.name,...g}]:[];})}));
`,snapshotExtra:()=>({slotFields:Object.fromEntries(['x','y','length','width','angle'].map(k=>[k,document.getElementById('sk-slot-'+k)?.value??null])),outline:document.querySelector('.vp-overlay .sk-shape')?.getAttribute('points')??null})});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const near=(a,b,t=1e-9)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} != ${b}`);
const A=[10.123456789,15],B=[45.123456789,15],H=3;
function centres(doc){const n=doc.nodes[0];assert.deepEqual(n.segments.map(s=>s.kind),['line','arc','line','arc']);return[n.segments[3].center,n.segments[1].center];}
async function native(label,doc,r,expectedCentres){
 const [a,b]=centres(doc);[a,b].forEach((p,j)=>p.forEach((v,i)=>near(v,expectedCentres[j][i])));
 const profile=doc.nodes[0];assert.deepEqual(profile.slot,{a,b,r});assert.equal(a[1],b[1]);
 const expectedLoop=[{kind:'line',start:[a[0],a[1]-r]},{kind:'arc',start:[b[0],b[1]-r],center:b,direction:'ccw'},{kind:'line',start:[b[0],b[1]+r]},{kind:'arc',start:[a[0],a[1]+r],center:a,direction:'ccw'}];assert.deepEqual(profile.segments,expectedLoop);
 const n=await f.inspect(label,doc);assert.equal(n.cylinders.length,2);const remaining=[...n.cylinders];
 for(const p of[a,b]){const i=remaining.findIndex(c=>Math.hypot(c.c[0]-p[0],c.c[1]-p[1])<=1e-9);assert.ok(i>=0,JSON.stringify({p,cylinders:n.cylinders}));const[c]=remaining.splice(i,1);near(c.r,r);near(Math.abs(c.a[2]),1);}
 near(Math.min(...n.vertices.map(p=>p[2])),0);near(Math.max(...n.vertices.map(p=>p[2])),H);
 const distance=Math.hypot(b[0]-a[0],b[1]-a[1]),actualVolume=H*(2*r*distance+Math.PI*r*r),intendedVolume=H*(2*r*35+Math.PI*r*r);
 near(n.mass.volume,actualVolume,1e-7);const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);near(bodies[0].volume,actualVolume,1e-7);[(a[0]+b[0])/2,(a[1]+b[1])/2,H/2].forEach((v,i)=>near(n.mass.centroid[i],v,1e-8));
 if(!baseline||r===4){[a,b].forEach((p,j)=>p.forEach((v,i)=>near(v,[A,B][j][i])));near(b[0]-a[0],35);near(b[1]-a[1],0);near(n.mass.volume,intendedVolume,1e-7);}
 f.report.observations.push({label,radius:r,authoredCentres:[a,b],intendedCentres:[A,B],distance,distanceError:distance-35,directionErrorY:b[1]-a[1],volume:n.mass.volume,intendedVolume,intendedVolumeError:n.mass.volume-intendedVolume,requestedPrecision:Math.hypot(b[0]-B[0],b[1]-B[1])<=1e-9?'PASS':'FAIL',lifecycleNative:'PASS'});
}
await f.run(async()=>{
 await f.newPage();await button('New part').click();await f.ready();const empty=await f.doc();assert.equal(empty.nodes.length,0);await button('Sketch',f.page.getByLabel('Mode',{exact:true})).click();await f.sketchPanel().getByLabel('Sketch plane',{exact:true}).selectOption('xy');await f.tool('Slot','o');await f.frame([[10,15],[45,15],[10,19]]);for(const p of[[10,15],[45,15],[10,19]])await f.worldClick(p);
 assert.equal(Number(await f.page.locator('#sk-slot-length').inputValue()),35);assert.equal(Number(await f.page.locator('#sk-slot-width').inputValue()),8);await f.page.locator('#sk-slot-x').fill(String(A[0]));await f.page.evaluate(()=>document.activeElement?.blur());
 const sketch=(await f.finishSketch('01-precise-slot')).doc;centres(sketch).forEach((p,j)=>p.forEach((v,i)=>near(v,[A,B][j][i])));await f.openExtrudeHud();const original=(await f.applyExtrude({distance:H,previous:sketch,label:'02-original-solid'})).doc;await native('03-original-native',original,4,[A,B]);
 const firstSave=await f.save('slot-width-original');await f.freshOpen(firstSave.file,firstSave.doc,'04-original-reopened');await f.same(original);await native('05-original-reopened-native',original,4,[A,B]);
 await f.openFeatureEditor(1);await button('Edit sketch',f.editor()).click();await f.sketchPanel().waitFor();assert.equal(Number(await f.page.locator('#sk-slot-width').inputValue()),8);const before=await f.snapshot('06-width-before');
 await f.page.locator('#sk-slot-width').fill('10');await f.page.evaluate(()=>document.activeElement?.blur());const edited=await f.snapshot('07-width-input');assert.equal(edited.slotFields.width,'10');await f.same(original);await button('Undo').click();const undone=await f.snapshot('08-draft-undo');assert.deepEqual(undone.slotFields,before.slotFields);assert.equal(undone.outline,before.outline);await button('Redo').click();const redone=await f.snapshot('09-draft-redo');assert.deepEqual(redone.slotFields,edited.slotFields);assert.equal(redone.outline,edited.outline);
 const changed=(await f.finishSketch('10-width-finished')).doc;assert.deepEqual(changed.nodes[1],original.nodes[1]);assert.deepEqual(changed.nodes[0].sideTags,original.nodes[0].sideTags);assert.deepEqual(changed.outputs,original.outputs);assert.equal(changed.nextId,original.nextId);
 const expected=[A,baseline?B.map(v=>Math.round(v*1e4)/1e4):B];await native('11-width-native',changed,5,expected);await f.undo();await f.same(original);await native('12-document-undo-native',original,4,[A,B]);await f.redo();await f.same(changed);await native('13-document-redo-native',changed,5,expected);
 const saved=await f.save('slot-width-edited');await f.freshOpen(saved.file,saved.doc,'14-width-reopened');await f.same(changed);await native('15-width-reopened-native',changed,5,expected);await f.openFeatureEditor(1);await button('Edit sketch',f.editor()).click();await f.sketchPanel().waitFor();assert.equal(Number(await f.page.locator('#sk-slot-width').inputValue()),10);await f.snapshot('16-reopened-controls');await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor({state:'hidden'});await f.same(changed);
});
