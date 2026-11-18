import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
// Prepared against main 091366fef after the #273 fast-forward; no product changes.
const pins=['apps/cad-studio/test/slot-centre-precision-browser.mjs',...(!baseline?['apps/cad-studio/src/sketch/slotCentre.ts']:[]),'apps/cad-studio/src/ui/SketchPanel.tsx','apps/cad-studio/src/App.tsx','apps/cad-studio/src/sketch/draftHistory.ts','packages/barocss-cad-model/src/sketch/profile.ts','packages/barocss-cad-model/src/sketch/reopen.ts'];
const f=await createFlow({name:'slot-centre-precision',output:process.argv[2],envFrozen:'SLOT_CENTRE_PRECISION_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Observe Slot Centre X/Y input precision and unintended centre-distance/direction changes, separately from successful native lifecycle.',limits:['Two independent horizontal XY Slot cases. Baseline records intended-translation errors; passing lifecycle does not certify requested precision. No solver or geometry capability expansion.'],inspectorSource:`
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
const round=v=>Math.round(v*1e4)/1e4;
const initialA=[10,15],initialB=[45,15],r=4,h=3;
function centres(doc){const node=doc.nodes[0];assert.deepEqual(node.segments.map(s=>s.kind),['line','arc','line','arc']);return[node.segments[3].center,node.segments[1].center];}
async function physical(label,doc,a,b,intended){
 const n=await f.inspect(label,doc);assert.equal(n.cylinders.length,2);const remaining=[...n.cylinders];
 for(const p of[a,b]){const i=remaining.findIndex(c=>Math.hypot(c.c[0]-p[0],c.c[1]-p[1])<=1e-9);assert.ok(i>=0,JSON.stringify({p,cylinders:n.cylinders}));const[c]=remaining.splice(i,1);near(c.r,r);near(Math.abs(c.a[2]),1);}
 near(Math.min(...n.vertices.map(p=>p[2])),0);near(Math.max(...n.vertices.map(p=>p[2])),h);
 const distance=Math.hypot(b[0]-a[0],b[1]-a[1]),actualVolume=(2*r*distance+Math.PI*r*r)*h,intendedVolume=(2*r*35+Math.PI*r*r)*h;
 if(!baseline){[a,b].forEach((p,j)=>p.forEach((v,i)=>near(v,intended[j][i])));near(b[0]-a[0],35);near(b[1]-a[1],0);near(distance,35);near(n.mass.volume,intendedVolume,1e-7);}
 near(n.mass.volume,actualVolume,1e-7);const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);near(bodies[0].volume,actualVolume,1e-7);
 [(a[0]+b[0])/2,(a[1]+b[1])/2,h/2].forEach((v,i)=>near(n.mass.centroid[i],v,1e-8));
 f.report.observations.push({label,authoredCentres:[a,b],intendedCentres:intended,nativeCentres:n.cylinders.map(c=>c.c),centreDistance:distance,intendedDistance:35,distanceError:distance-35,directionErrorY:b[1]-a[1],volume:n.mass.volume,intendedVolume,intendedVolumeError:n.mass.volume-intendedVolume,requestedPrecision:Math.hypot(b[0]-intended[1][0],b[1]-intended[1][1])<=1e-9?'PASS':'FAIL',lifecycleNative:'PASS'});
}
await f.run(async()=>{
 for(const [axis,target] of [[0,10.123456789],[1,15.234567891]]){
  const label=axis?'y':'x';await f.newPage();await button('New part').click();await f.ready();const empty=await f.doc();assert.equal(empty.nodes.length,0);
  await button('Sketch',f.page.getByLabel('Mode',{exact:true})).click();await f.sketchPanel().getByLabel('Sketch plane',{exact:true}).selectOption('xy');await f.tool('Slot','o');await f.frame([[10,15],[45,15],[10,19]]);
  for(const p of[[10,15],[45,15],[10,19]])await f.worldClick(p);
  assert.equal(Number(await f.page.locator('#sk-slot-length').inputValue()),35);assert.equal(Number(await f.page.locator('#sk-slot-width').inputValue()),8);const before=await f.snapshot(label+'-01-original');
  await f.page.locator('#sk-slot-'+label).fill(String(target));await f.page.evaluate(()=>document.activeElement?.blur());const edited=await f.snapshot(label+'-02-input');await f.same(empty);
  await button('Undo').click();const undone=await f.snapshot(label+'-03-draft-undo');assert.deepEqual(undone.slotFields,before.slotFields);assert.equal(undone.outline,before.outline);await button('Redo').click();const redone=await f.snapshot(label+'-04-draft-redo');assert.deepEqual(redone.slotFields,edited.slotFields);assert.equal(redone.outline,edited.outline);
  const sketch=(await f.finishSketch(label+'-05-finished')).doc,[a,b]=centres(sketch),expectedA=[...initialA],intendedB=[...initialB];expectedA[axis]=target;intendedB[axis]+=target-initialA[axis];
  const observedRoundedB=intendedB.map(round);a.forEach((v,i)=>near(v,expectedA[i]));b.forEach((v,i)=>near(v,(baseline?observedRoundedB:intendedB)[i]));
  f.report.observations.push({label:label+(baseline?'-baseline-input':'-fixed-input'),requested:target,panel:edited.slotFields,authored:[a,b],intended:[expectedA,intendedB],currentRoundedExpectation:observedRoundedB});
  await f.openExtrudeHud();const solid=(await f.applyExtrude({distance:h,previous:sketch,label:label+'-06-extruded'})).doc;await physical(label+'-07-native',solid,a,b,[expectedA,intendedB]);await f.undo();await f.same(sketch);await f.redo();await f.same(solid);
  const saved=await f.save('slot-centre-'+label);await f.freshOpen(saved.file,saved.doc,label+'-08-reopened');await f.same(solid);assert.deepEqual(centres(solid),[a,b]);await physical(label+'-09-reopened-native',solid,a,b,[expectedA,intendedB]);
  await f.openFeatureEditor(1);await button('Edit sketch',f.editor()).click();await f.sketchPanel().waitFor();await f.snapshot(label+'-10-reopened-controls');await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor({state:'hidden'});await f.same(solid);
  if(!baseline){
   // Continue the saved owner: move the other axis, then repeat the first axis.
   // The intended vector remains [35,0], independently of the stored result.
   let prior=solid;const desiredA=[...expectedA];
   for(const [editAxis,value] of [[1-axis,axis?11.345678912:16.345678912],[axis,axis?14.456789123:9.456789123]]){
    const step=label+'-repeat-'+editAxis;await f.openFeatureEditor(1);await button('Edit sketch',f.editor()).click();await f.sketchPanel().waitFor();
    await f.page.locator('#sk-slot-'+(editAxis?'y':'x')).fill(String(value));await f.page.evaluate(()=>document.activeElement?.blur());desiredA[editAxis]=value;
    const next=(await f.finishSketch(step+'-finish')).doc;assert.deepEqual(next.nodes[1],prior.nodes[1]);assert.deepEqual(next.nodes[0].sideTags,prior.nodes[0].sideTags);
    const [na,nb]=centres(next),wantB=[desiredA[0]+35,desiredA[1]];await physical(step+'-native',next,na,nb,[desiredA,wantB]);
    await f.undo();await f.same(prior);await f.redo();await f.same(next);prior=next;
   }
   const repeated=await f.save('slot-centre-'+label+'-repeated');await f.freshOpen(repeated.file,repeated.doc,label+'-repeat-reopened');await f.same(prior);const [na,nb]=centres(prior);await physical(label+'-repeat-final-native',prior,na,nb,[desiredA,[desiredA[0]+35,desiredA[1]]]);
   await f.openFeatureEditor(1);await button('Edit sketch',f.editor()).click();await f.sketchPanel().waitFor();await f.snapshot(label+'-repeat-final-controls');await f.page.keyboard.press('Escape');await f.sketchPanel().waitFor({state:'hidden'});await f.same(prior);
  }

 }
});
