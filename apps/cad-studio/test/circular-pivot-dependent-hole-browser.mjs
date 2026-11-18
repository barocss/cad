import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/circular-pivot-dependent-hole-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/app/patternHoleSpacing.ts','apps/cad-studio/src/state/historyFeatureApply.ts','apps/cad-studio/src/ui/NodeEditor.tsx','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','packages/barocss-cad-model/src/engine/references.ts','packages/barocss-cad-model/src/engine/rematch.ts'];
if(!baseline)pins.push('apps/cad-studio/src/app/circularPatternHolePivot.ts');
const f=await createFlow({name:'circular-pivot-dependent-hole',output:process.argv[2],envFrozen:'CIRCULAR_PIVOT_DEPENDENT_HOLE_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Observe legacy numbered Hole after quarter-turn Circular Z pivot History edits; lifecycle PASS does not certify copy-relative motion.',
 limits:['Synthetic schema-3 four-node file opened through real UI; not actual Hole creation and no modern signature-bearing claim.','Count4/angle90/span360 remain fixed. Separate original contexts for Axis at X 0 to 0.25 and 2. Native original admission and copy names are verified before editing; failure there is not a product-edit defect.'],
 inspectorSource:`import {readFileSync} from 'node:fs';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {evaluateCadPart,checkOutput,checkBrep,massPropertiesOf,faceGeometry} from '@barocss/cad';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({id:o.id,count:o.bodyCount,valid:checkOutput(o).valid,strict:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o),vertices:o.brep.vertices.map(v=>v.point),walls:o.brep.faces.filter(f=>f.name?.startsWith('n3.')).map(faceGeometry),tops:o.brep.faces.filter(f=>/^n1\\.top(?:@\\d+)?$/.test(f.name??'')).map(f=>[f.name,f.loops.length]).sort(([a],[b])=>a.localeCompare(b))}))));`,
 snapshotExtra:()=>({undoRedo:['Undo','Redo'].map(name=>document.querySelector(`button[aria-label="${name}"]`)?.disabled)}),
});
const ref=node=>({node,side:'solid'});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
 {id:'n0',kind:'sketch',profile:'rectangle',min:[10,20],max:[14,26]},
 {id:'n1',kind:'extrude',sketch:0,height:8},
 {id:'n2',kind:'circular-pattern',parent:ref(1),axis:'z',angle:90,count:4,span:360},
 {id:'n3',kind:'hole',parent:ref(2),radius:1,center:[-12,-23],face:'n1.top@2'},
],outputs:{b3:ref(3)},nextId:4};
const near=(a,b)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-7,`${a} versus ${b}`);
function turn(x,y,px,k){let u=x-px,v=y;for(let i=0;i<k;i++)[u,v]=[-v,u];return [u+px,v];}
async function native(label,doc){
 const [n,...extra]=await f.inspect(label,doc);assert.equal(extra.length,0);assert.ok(n);
 assert.equal(n.id,'n3');assert.equal(n.count,4);assert.equal(n.valid,true);assert.equal(n.strict.valid,true,JSON.stringify(n.strict));
 const px=doc.nodes[2].pivot?.[0]??0,[x,y]=doc.nodes[3].center;
 // Quarter-turn stock corners are independently derived. Hole rim vertices may be additional.
 const corners=[];for(let k=0;k<4;k++)for(const a of [10,14])for(const b of [20,26])for(const z of [0,8])corners.push([...turn(a,b,px,k),z]);
 for(const p of corners){const found=n.vertices.filter(q=>p.every((v,i)=>Math.abs(v-q[i])<=1e-7));assert.equal(found.length,1,`Stock corner ${p}`);}
 const hasBore=x>=-13+2*px&&x<=-11+2*px&&y===-23;
 if(!hasBore)assert.ok(px===2&&x===-12,'Only the explicit large-pivot stale-centre case may lack a bore');
 assert.deepEqual(n.tops,[['n1.top',1],['n1.top@1',1],['n1.top@2',hasBore?2:1],['n1.top@3',1]]);
 assert.equal(n.walls.length,hasBore?2:0);
 for(const g of n.walls){assert.equal(g.kind,'cylinder');near(g.r,1);near(g.c[0],x);near(g.c[1],y);near(g.a[0],0);near(g.a[1],0);near(Math.abs(g.a[2]),1);}
 const removed=hasBore?8*Math.PI:0,v=768-removed;
 near(n.mass.volume,v);near(n.mass.centroid[0],(768*px-removed*x)/v);near(n.mass.centroid[1],-removed*y/v);near(n.mass.centroid[2],4);
 f.report.observations.push({label,pivotX:px,holeCenter:[x,y],intendedCenter:[-12+2*px,-23],hasBore,native:n});await f.persist();
}
await f.run(async()=>{
 for(const requested of [.25,2]){
  const tag=requested===.25?'small':'large';f.phase=`${tag}: original native admission and actual file Open`;
  await native(`${tag}-00-original-admission`,source);
  await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:`${tag}-circular-hole.bcad`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});
  await f.same(source);await native(`${tag}-01-original-native`,source);await f.openFeatureEditor(2,'Circular pattern');
  const field=f.editor().getByRole('spinbutton',{name:'Axis at X',exact:true});assert.equal(Number(await field.inputValue()),0);
  await f.dismissToasts();const before=await f.snapshot(`${tag}-02-before`);
  await field.fill(String(requested));await f.same(source);await f.snapshot(`${tag}-03-draft`);
  f.phase=`${tag}: observe pivot Apply`;
  await f.editor().getByRole('button',{name:'Apply',exact:true}).click();
  await f.page.waitForFunction(original=>JSON.stringify(window.__studioDoc)!==original||!!document.querySelector('.node-editor .hud-error')?.textContent?.trim()||document.querySelectorAll('.toast').length>0,JSON.stringify(source),{timeout:60000});
  await f.ready();const outcome=await f.snapshot(`${tag}-04-outcome`),current=await f.doc();
  const accepted=JSON.stringify(current)!==JSON.stringify(source);let classification='safe-refusal';
  if(accepted){
   const x=current.nodes[3].center[0];assert.ok(x===-12||x===-12+2*requested,'Unexpected centre: do not weaken oracle');
   const expected={...source,nodes:source.nodes.map((n,i)=>i===2?{...n,pivot:[requested,0,0]}:i===3?{...n,center:[x,-23]}:n)};
   assert.deepEqual(current,expected,'Only requested pivot and optional copy-relative centre may change');
   classification=x===-12+2*requested?'accepted-copy-relative':'accepted-stale-world-centre';
   if(!baseline)assert.equal(classification,'accepted-copy-relative');
  }else{
   if(!baseline)assert.fail('Fixed pivot must be accepted');
   assert.deepEqual(current,source);assert.deepEqual(outcome.history,before.history);assert.deepEqual(outcome.undoRedo,before.undoRedo);
   assert.ok(outcome.notices.length||(await f.editor().locator('.hud-error').allTextContents()).some(x=>x.trim()));
  }
  f.report.observations.push({label:`${tag}-classification`,requestedPivotX:requested,accepted,classification,intendedCenter:[-12+2*requested,-23],storedCenter:current.nodes[3].center,intendedMotion:accepted?(classification==='accepted-copy-relative'?'PASS':'FAIL'):'NOT_APPLIED',notices:outcome.notices,editorError:await f.editor().locator('.hud-error').allTextContents()});await f.persist();
  await f.closeEditor();await f.same(current);await native(`${tag}-05-observed-native`,current);
  if(accepted){await f.undo();await f.same(source);await native(`${tag}-06-undo-native`,source);await f.redo();await f.same(current);await native(`${tag}-07-redo-native`,current);}
  const saved=await f.save(`${tag}-circular-pivot-observed`);await f.freshOpen(saved.file,saved.doc,`${tag}-08-reopened`);await f.same(current);await native(`${tag}-09-reopened-native`,current);
  await f.openFeatureEditor(2,'Circular pattern');assert.equal(Number(await f.editor().getByRole('spinbutton',{name:'Axis at X',exact:true}).inputValue()),current.nodes[2].pivot?.[0]??0);await f.snapshot(`${tag}-10-reopened-history`);await f.closeEditor();
  if(!baseline){
   await f.openFeatureEditor(2,'Circular pattern');await f.editor().getByLabel('Axis at X',{exact:true}).fill('0');
   const {doc:restored}=await f.applyEditor(current,`${tag}-11-pivot-restored`);
   const expected={...source,nodes:source.nodes.map((n,i)=>i===2?{...n,pivot:[0,0,0]}:n)};assert.deepEqual(restored,expected);
   await native(`${tag}-12-restored-native`,restored);await f.undo();await f.same(current);await f.redo();await f.same(restored);
   const saved=await f.save(`${tag}-circular-restored`);await f.freshOpen(saved.file,saved.doc,`${tag}-13-restored-reopened`);await native(`${tag}-14-restored-reopened-native`,restored);
   for(const mode of ['mixed-count','overlap']){
    await f.openFeatureEditor(2,'Circular pattern');await f.dismissToasts();const before=await f.snapshot(`${tag}-${mode}-before`);
    await f.editor().getByLabel('Axis at X',{exact:true}).fill(mode==='overlap'?'12':'.25');
    if(mode==='overlap')await f.editor().getByLabel('Axis at Y',{exact:true}).fill('23');else await f.editor().getByLabel('Count',{exact:true}).fill('3');
    await f.editor().getByRole('button',{name:'Apply',exact:true}).click();await f.editor().locator('.hud-error').waitFor();
    const result=await f.snapshot(`${tag}-${mode}-refused`);assert.deepEqual(await f.doc(),restored);assert.deepEqual(result.history,before.history);assert.deepEqual(result.undoRedo,before.undoRedo);
    assert.match(await f.editor().locator('.hud-error').innerText(),/pivot|axis|pattern/i);await f.closeEditor();await native(`${tag}-${mode}-native`,restored);
   }
  }
 }
});
