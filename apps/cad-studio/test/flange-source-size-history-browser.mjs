import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline');
const both=process.argv.includes('--both');
const expectRefused=process.argv.includes('--expect-refused');
const depth=process.argv.includes('--depth');
const explicitRadius=process.argv.includes('--own-radius')?2.5:undefined;
assert.ok(!both||(!depth&&!baseline),'Combined extent has its own runtime baseline');
assert.ok(!expectRefused||both,'The current refusal is only expected for the combined edit');
assert.ok(explicitRadius===undefined||both,'Explicit radius uses the combined resize');
const edits=both?[['Width',80,100],['Depth',50,60]]:[depth?['Depth',50,60]:['Width',80,100]];
const measure=explicitRadius!==undefined?'own-radius-width-depth':both?'width-depth':depth?'depth':'width';
const nextMax=[depth?80:100,depth||both?60:50];
const pins=['apps/cad-studio/test/flange-source-size-history-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs','packages/barocss-cad/src/part/part-sheet.ts','packages/barocss-cad-model/src/app/sheetCommands.ts','packages/barocss-cad-model/src/app/flangeRadiusEdit.ts','packages/barocss-cad-model/src/app/flangePositionEdit.ts','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','apps/cad-studio/src/ui/NodeEditor.tsx','apps/cad-studio/src/app/featureNumberInput.ts','apps/cad-studio/src/state/historyFeatureApply.ts'];
pins.push('apps/cad-studio/src/state/rectangleFinishResize.ts','packages/barocss-cad-model/src/app/flangeMeasureEdit.ts','apps/cad-studio/src/state/flangeMeasureHistory.ts','packages/barocss-cad-model/src/engine/references.ts','packages/barocss-cad-model/src/engine/rematch.ts','apps/cad-studio/src/App.tsx');
pins.push('apps/cad-studio/src/state/flangeSourceThicknessHistory.ts','packages/barocss-cad-model/src/app/flangeRadiusSourceEdit.ts');
if(!baseline)pins.push('apps/cad-studio/src/state/flangeSourceSizeHistory.ts');
const f=await createFlow({name:'flange-source-size-history',output:process.argv[2],envFrozen:'FLANGE_SOURCE_SIZE_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Observe source rectangle extent edits with a signed Flange.',limits:['Actual signed Flange creation on a synthetic plain XY sheet. Single full-width inside flange, sheet R1.5, optional distinct Flange R2.5, L20, 90 degrees. No general signature repair.'],snapshotExtra:()=>({dirty:!!document.querySelector('[aria-label="Unsaved changes"]')}),inspectorSource:`
import {readFileSync} from 'node:fs';
import {evaluateCadPart,massPropertiesOf,flatPatternOf,checkBrep,faceGeometry} from '@barocss/cad';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {bodyMesh} from '@barocss/cad-model/engine/mesh';
import {toSig} from '@barocss/cad-model/engine/references';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(process.argv[3]&&JSON.parse(process.argv[3])==='parent'){
 const prefix={...doc,nodes:doc.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}}};
 const [o]=evaluateCadPart(toPartDocument(prefix)).outputs;
 const names=doc.nodes[2].edges,edges=bodyMesh(o.brep,0).edges;
 const sigs=Object.fromEntries(names.map(name=>{
  const found=edges.filter(e=>e.names.includes(name));if(found.length!==1)throw Error('Nonunique parent edge');
  const e=found[0],delta=e.b.map((v,i)=>v-e.a[i]),length=Math.hypot(...delta);
  if(!e.straight)throw Error('Expected straight corner');
  return [name,toSig({kind:'line',at:e.a.map((v,i)=>(v+e.b[i])/2),dir:delta.map(v=>v/length),size:length})];
 }));
 console.log(JSON.stringify({sigs,check:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o)}));process.exit(0);
}

console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({id:o.id,count:o.bodyCount,check:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o),sheet:o.sheet,flat:flatPatternOf(o),vertices:o.brep.vertices.map(v=>v.point),faces:o.brep.faces.map(face=>({name:face.name,geometry:faceGeometry(face)})),edges:bodyMesh(o.brep,0).edges.map(e=>({names:e.names,a:e.a,b:e.b,straight:e.straight}))}))));
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]},{id:'n1',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const near=(a,b,t=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} != ${b}`);
// Pick the x=80 rim: edge width50, plate run80. These are intentionally swapped
// from a y=50 rim (width80/run50); flat area*T is NOT the folded volume when K!=.5.
const T=1.5,K=.44,L=20;
async function geometry(label,doc){
 const run=doc.nodes[0].max[0],W=doc.nodes[0].max[1];
 const T=doc.nodes[1].thickness;assert.equal(typeof T,'number');const R=doc.nodes[2].bendRadius??doc.nodes[1].bendRadius;assert.equal(typeof R,'number');
 const measure=doc.nodes[2].measure??'outer';assert.ok(['outer','inner','tangent'].includes(measure));assert.equal(doc.nodes[2].position??'material-inside','material-inside');
 const trim=R+T,straight=measure==='outer'?L-(R+T):measure==='inner'?L-R:L,cx=run-trim,maxX=cx+R+T,tipZ=R+T+straight;
 const volume=W*T*(run-trim+straight+Math.PI/2*(R+T/2));
 const flatLength=run-trim+straight+Math.PI/2*(R+K*T);
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.equal(n.count,1);assert.ok(n.check.valid,JSON.stringify(n.check.issues));near(n.mass.volume,volume,1e-7);
 assert.equal(n.sheet.thickness,T);assert.equal(n.sheet.bendRadius,1.5);assert.equal(n.sheet.kFactor,K);assert.equal(n.sheet.bends.length,1);near(n.sheet.bends[0].radius,R);near(n.sheet.bends[0].angle,90);
 assert.equal(n.flat.bends.length,1);near(n.flat.bends[0].radius,R);near(n.flat.bends[0].allowance,Math.PI/2*(R+K*T));assert.equal(n.flat.loops.length,1);const loop=n.flat.loops[0];assert.equal(loop.outer,true);assert.equal(loop.segments.length,4);assert.ok(loop.segments.every(s=>s.kind==='line'));
 const lengths=loop.segments.map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])).sort((a,b)=>a-b);[W,W,flatLength,flatLength].sort((a,b)=>a-b).forEach((v,i)=>near(lengths[i],v));
 const cylinders=n.faces.filter(x=>x.geometry.kind==='cylinder');assert.ok(cylinders.some(x=>Math.abs(x.geometry.r-R)<1e-8));assert.ok(cylinders.some(x=>Math.abs(x.geometry.r-(R+T))<1e-8));
 // Measure changes only straight leg length; inside trim and bend centre stay fixed.
 for(const c of cylinders){near(c.geometry.c[0],cx);near(c.geometry.c[2],R+T);near(Math.abs(c.geometry.a[1]),1);}
 for(const [axis,min,max] of [[0,0,maxX],[1,0,W],[2,0,tipZ]]){near(Math.min(...n.vertices.map(p=>p[axis])),min);near(Math.max(...n.vertices.map(p=>p[axis])),max);}
 const section=[[0,0],[cx,0],[cx,T],[0,T],[cx+R,R+T],[maxX,R+T],[cx+R,tipZ],[maxX,tipZ]];
 for(const y of [0,W])for(const [x,z] of section)assert.ok(n.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<=1e-8),`Missing section vertex ${x},${y},${z}`);
 const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);near(bodies[0].volume,volume,1e-7);f.report.observations.push({label,measure,straight,tipZ,trim,maxX,volume:n.mass.volume,expectedVolume:volume,flatLength,innerRadius:R,sheetDefaultRadius:n.sheet.bendRadius,bend:n.sheet.bends[0]});return n;
}
async function history(label,doc){
 await f.openFeatureEditor(2,'Flange');const fields=await f.editorFields();
 const choices=await f.editor().getByRole('combobox').evaluateAll(es=>es.map(e=>({ariaLabel:e.getAttribute('aria-label'),id:e.id,value:e.value,options:Array.from(e.options).map(o=>({value:o.value,text:o.textContent}))})));
 const offered=choices.filter(c=>['outer','inner','tangent'].every(v=>c.options.some(o=>o.value===v)));
 f.report.observations.push({label,fields,choices,historyMeasureOffered:offered.length>0,savedMeasure:doc.nodes[2].measure??'outer'});
 assert.equal(Number(await f.editor().getByLabel('Length',{exact:true}).inputValue()),20);
 assert.equal(Number(await f.editor().getByLabel('Angle',{exact:true}).inputValue()),90);
 if(explicitRadius!==undefined){
  assert.equal(await f.editor().getByRole('combobox',{name:'Radius source',exact:true}).inputValue(),'own');
  assert.equal(Number(await f.editor().getByRole('spinbutton',{name:'Bend radius',exact:true}).inputValue()),explicitRadius);
 }
 await f.snapshot(label);await f.closeEditor();await f.same(doc);
}
async function signatures(label,doc){
 const proof=await f.inspect(label,doc,'parent'),t=doc.nodes[1].thickness,run=doc.nodes[0].max[0],W=doc.nodes[0].max[1];assert.ok(proof.check.valid);near(proof.mass.volume,run*W*t,1e-7);
 const values=Object.values(proof.sigs);assert.equal(values.length,1);const sig=values[0];assert.equal(sig.k,'line');assert.deepEqual(sig.p,[run,W/2,t]);near(sig.s,W);near(Math.abs(sig.d[1]),1);near(sig.d[0],0);near(sig.d[2],0);
 const matches=isDeepStrictEqual(doc.nodes[2].sigs,proof.sigs);f.report.observations.push({label,stored:doc.nodes[2].sigs,nativeParent:proof.sigs,matches});await f.persist();return matches;
}
async function applyObserved(original,label){
 await f.dismissToasts();const before=await f.snapshot(label+'-before'),undoBefore=await button('Undo').isEnabled(),redoBefore=await button('Redo').isEnabled();await button('Apply',f.editor()).click();
 await f.page.waitForFunction(original=>JSON.stringify(window.__studioDoc)!==original||!!document.querySelector('.node-editor .hud-error')?.textContent?.trim()||document.querySelectorAll('.toast').length>0,JSON.stringify(original),{timeout:60000});
 await f.ready();const outcome=await f.snapshot(label+'-outcome'),current=await f.doc(),accepted=!isDeepStrictEqual(current,original);
 f.report.observations.push({label,accepted,notices:outcome.notices,errors:await f.editor().locator('.hud-error').allTextContents()});
 if(!accepted){assert.deepEqual(current,original);for(const key of ['bodies','selection','history','dirty'])assert.deepEqual(outcome[key],before[key],key);assert.equal(await button('Undo').isEnabled(),undoBefore);assert.equal(await button('Redo').isEnabled(),redoBefore);assert.ok(outcome.notices.length||(await f.editor().locator('.hud-error').allTextContents()).some(x=>x.trim()));}
 await f.closeEditor();await f.same(current);await f.persist();return {accepted,current};
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'flange-position-source.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
 const [native]=await f.inspect(measure+'-01-sheet-native',source);assert.ok(native.check.valid);near(native.mass.volume,6000,1e-7);const edge=native.edges.filter(e=>e.straight&&e.a[0]===80&&e.b[0]===80&&e.a[2]===T&&e.b[2]===T);assert.equal(edge.length,1);assert.deepEqual(edge[0].names,['n1.side1|n1.top']);near(Math.hypot(...edge[0].a.map((v,i)=>v-edge[0].b[i])),50);
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([80,25,T]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await clickModelCommand(f.page,'Modify','Flange');
 const hud=f.page.getByRole('dialog',{name:'Flange',exact:true});
 const radiusField=hud.getByLabel('Bend radius (0: the sheet’s)',{exact:true});
 assert.equal(Number(await radiusField.inputValue()),0);
 if(explicitRadius!==undefined)await radiusField.fill(String(explicitRadius));
 assert.equal(await hud.getByLabel('Position',{exact:true}).inputValue(),'material-inside');assert.equal(await hud.getByLabel('Length to',{exact:true}).inputValue(),'outer');await hud.getByLabel('Length to',{exact:true}).selectOption('outer');await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await button('Apply',hud).click();await f.changed(source);await f.ready();
 const doc=await f.doc();assert.equal(doc.nodes.length,3);assert.deepEqual(doc.nodes.slice(0,2),source.nodes);assert.equal(doc.nodes[2].kind,'sheet-flange');
 assert.equal(Object.hasOwn(doc.nodes[2],'bendRadius'),explicitRadius!==undefined);
 assert.equal(doc.nodes[2].bendRadius,explicitRadius);
 assert.equal(doc.nodes[2].length,20);assert.equal(doc.nodes[2].position??'material-inside','material-inside');assert.equal(doc.nodes[2].measure??'outer','outer');assert.equal(doc.nodes[2].angle??90,90);assert.deepEqual(doc.nodes[2].edges,edge[0].names);
 await geometry(measure+'-02-flange-native',doc);await history(measure+'-03-history-measure-observation',doc);await f.undo();await f.same(source);await f.redo();await f.same(doc);await geometry(measure+'-04-redo-native',doc);
 assert.equal(await signatures('05-original-parent',doc),true,'Actual creation must capture its original native top-rim signature');
 await f.openFeatureEditor(1,'Sheet base');
 for(const [field,start,target] of edits){
  const input=f.editor().getByRole('spinbutton',{name:field,exact:true});assert.equal(Number(await input.inputValue()),start);await input.fill(String(target));
 }
 await f.same(doc);
 const change=await applyObserved(doc,'06-'+measure),current=change.current;
 if(expectRefused)assert.equal(change.accepted,false,'Original combined extent shows the existing safe refusal');
 else if(!baseline)assert.equal(change.accepted,true,'Proven source extents must apply');
 const stripSigs=d=>({...d,nodes:d.nodes.map((n,i)=>{if(i!==2)return n;const {sigs,...rest}=n;void sigs;return rest;})});
 if(change.accepted){
  const expected={...doc,nodes:doc.nodes.map((n,i)=>i===0?{...n,max:nextMax}:n)};
  assert.deepEqual(stripSigs(current),stripSigs(expected),'Only the requested rectangle extent may change apart from observed flange signatures');
  assert.equal(Object.hasOwn(current.nodes[2],'bendRadius'),explicitRadius!==undefined);const matched=await signatures('07-resized-parent',current);if(!baseline)assert.equal(matched,true,'Accepted extent must retain current native rim evidence');
 }
 await geometry('08-observed-native',current);
 if(change.accepted){await f.undo();await f.same(doc);await geometry('09-size-undo',doc);await f.redo();await f.same(current);await geometry('10-size-redo',current);}
 const saved=await f.save('flange-'+measure+'-observed');await f.newPage();await f.openFile(saved.file,3);const reopened=await f.doc();await f.snapshot('11-reopened');
 const preserved=isDeepStrictEqual(reopened,current);f.report.observations.push({label:'reopen-preservation',edits,preserved,accepted:current,reopened});await f.persist();
 if(!baseline)assert.equal(preserved,true,'Accepted size and repaired signature must survive fresh Open');
 if(!preserved){f.report.observations.push({label:'continuation',status:'NOT_RUN',reason:'Open changed accepted document; held/rematched/suppressed state is preserved in the snapshot'});await f.persist();return;}
 await geometry('12-reopened-native',reopened);await signatures('13-reopened-parent',reopened);
 if(explicitRadius!==undefined)await history('13b-reopened-radius-source',reopened);
 f.report.observations.push({label:'continuation',status:'NOT_RUN',reason:'This baseline covers source size and saved replay only; no subsequent Flange editing support is claimed.'});await f.persist();
 if(change.accepted&&!baseline){
  await f.openFeatureEditor(1,'Sheet base');
  for(const [field,start] of edits)await f.editor().getByRole('spinbutton',{name:field,exact:true}).fill(String(start));
  const restored=(await f.applyEditor(current,'14-restored-size')).doc;assert.deepEqual(restored,doc,'Reverse extent restores the complete original document');
  assert.equal(await signatures('15-restored-parent',restored),true);await geometry('16-restored-native',restored);
  await f.undo();await f.same(current);await geometry('17-reverse-undo',current);await f.redo();await f.same(restored);await geometry('18-reverse-redo',restored);
  const back=await f.save('flange-'+measure+'-restored');await f.freshOpen(back.file,back.doc,'19-restored-reopened');await f.same(doc);await geometry('20-restored-reopened-native',doc);assert.equal(await signatures('21-restored-reopened-parent',doc),true);
 }
 await history('22-reopened-history',await f.doc());await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('15-final');
});
