import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/flange-measure-history-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs','packages/barocss-cad/src/part/part-sheet.ts','packages/barocss-cad-model/src/app/sheetCommands.ts','packages/barocss-cad-model/src/app/flangeRadiusEdit.ts','packages/barocss-cad-model/src/app/flangePositionEdit.ts','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','apps/cad-studio/src/ui/NodeEditor.tsx','apps/cad-studio/src/app/featureNumberInput.ts','apps/cad-studio/src/state/historyFeatureApply.ts'];
if(!baseline)pins.push('packages/barocss-cad-model/src/app/flangeMeasureEdit.ts','apps/cad-studio/src/state/flangeMeasureHistory.ts','apps/cad-studio/src/state/rectangleFinishResize.ts');
const f=await createFlow({name:'flange-measure-history',output:process.argv[2],envFrozen:'FLANGE_MEASURE_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Actual Outer/Inner/Tangent creation and History availability observation.':'Bounded History Length to cycle with independent native geometry, Undo/Redo, Save/Open and mixed-edit refusal.',limits:['Three independent actual creation cases, terminal full-width rectangular-sheet flange, length20, 90 degrees, Material inside, explicit radius2. No manufacturing calibration, bend tables, downstream or multi-flange claim.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {evaluateCadPart,massPropertiesOf,flatPatternOf,checkBrep,faceGeometry} from '@barocss/cad';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {bodyMesh} from '@barocss/cad-model/engine/mesh';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({id:o.id,count:o.bodyCount,check:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o),sheet:o.sheet,flat:flatPatternOf(o),vertices:o.brep.vertices.map(v=>v.point),faces:o.brep.faces.map(face=>({name:face.name,geometry:faceGeometry(face)})),edges:bodyMesh(o.brep,0).edges.map(e=>({names:e.names,a:e.a,b:e.b,straight:e.straight}))}))));
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]},{id:'n1',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const near=(a,b,t=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} != ${b}`);
// Pick the x=80 rim: edge width50, plate run80. These are intentionally swapped
// from a y=50 rim (width80/run50); flat area*T is NOT the folded volume when K!=.5.
const T=1.5,R=2,K=.44,W=50,run=80,L=20;
async function geometry(label,doc){
 const R=doc.nodes[2].bendRadius;assert.equal(typeof R,'number');
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
 for(const c of cylinders){near(c.geometry.c[0],cx);near(c.geometry.c[2],3.5);near(Math.abs(c.geometry.a[1]),1);}
 for(const [axis,min,max] of [[0,0,maxX],[1,0,50],[2,0,tipZ]]){near(Math.min(...n.vertices.map(p=>p[axis])),min);near(Math.max(...n.vertices.map(p=>p[axis])),max);}
 const section=[[0,0],[cx,0],[cx,1.5],[0,1.5],[cx+R,3.5],[maxX,3.5],[cx+R,tipZ],[maxX,tipZ]];
 for(const y of [0,50])for(const [x,z] of section)assert.ok(n.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<=1e-8),`Missing section vertex ${x},${y},${z}`);
 const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);near(bodies[0].volume,volume,1e-7);f.report.observations.push({label,measure,straight,tipZ,trim,maxX,volume:n.mass.volume,expectedVolume:volume,flatLength,innerRadius:R,sheetDefaultRadius:n.sheet.bendRadius,bend:n.sheet.bends[0]});return n;
}
async function history(label,doc){
 await f.openFeatureEditor(2,'Flange');const fields=await f.editorFields();
 const choices=await f.editor().getByRole('combobox').evaluateAll(es=>es.map(e=>({ariaLabel:e.getAttribute('aria-label'),id:e.id,value:e.value,options:Array.from(e.options).map(o=>({value:o.value,text:o.textContent}))})));
 const offered=choices.filter(c=>['outer','inner','tangent'].every(v=>c.options.some(o=>o.value===v)));
 f.report.observations.push({label,fields,choices,historyMeasureOffered:offered.length>0,savedMeasure:doc.nodes[2].measure??'outer'});
 if(!baseline){assert.equal(offered.length,1);assert.equal(offered[0].value,doc.nodes[2].measure??'outer');}
 assert.equal(Number(await f.editor().getByLabel('Length',{exact:true}).inputValue()),20);
 assert.equal(Number(await f.editor().getByLabel('Angle',{exact:true}).inputValue()),90);
 await f.snapshot(label);await f.closeEditor();await f.same(doc);
}
await f.run(async()=>{
 for(const measure of (baseline?['outer','inner','tangent']:['outer'])){
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'flange-position-source.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
 const [native]=await f.inspect(measure+'-01-sheet-native',source);assert.ok(native.check.valid);near(native.mass.volume,6000,1e-7);const edge=native.edges.filter(e=>e.straight&&e.a[0]===80&&e.b[0]===80&&e.a[2]===T&&e.b[2]===T);assert.equal(edge.length,1);assert.deepEqual(edge[0].names,['n1.side1|n1.top']);near(Math.hypot(...edge[0].a.map((v,i)=>v-edge[0].b[i])),W);
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([80,25,T]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await clickModelCommand(f.page,'Modify','Flange');const hud=f.page.getByRole('dialog',{name:'Flange',exact:true});await hud.getByLabel('Bend radius (0: the sheet’s)',{exact:true}).fill('2');assert.equal(await hud.getByLabel('Position',{exact:true}).inputValue(),'material-inside');assert.equal(await hud.getByLabel('Length to',{exact:true}).inputValue(),'outer');await hud.getByLabel('Length to',{exact:true}).selectOption(measure);await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await button('Apply',hud).click();await f.changed(source);await f.ready();const doc=await f.doc();assert.equal(doc.nodes.length,3);assert.deepEqual(doc.nodes.slice(0,2),source.nodes);assert.equal(doc.nodes[2].kind,'sheet-flange');assert.equal(doc.nodes[2].bendRadius,R);assert.equal(doc.nodes[2].length,20);assert.equal(doc.nodes[2].position??'material-inside','material-inside');assert.equal(doc.nodes[2].measure??'outer',measure);assert.equal(doc.nodes[2].angle??90,90);assert.deepEqual(doc.nodes[2].edges,edge[0].names);
 await geometry(measure+'-02-flange-native',doc);await history(measure+'-03-history-measure-observation',doc);await f.undo();await f.same(source);await f.redo();await f.same(doc);await geometry(measure+'-04-redo-native',doc);
 if(!baseline){
  await f.openFeatureEditor(2,'Flange');await f.editor().getByRole('combobox',{name:'Length to',exact:true}).selectOption('inner');await f.snapshot('fixed-cancel-draft');await f.closeEditor();await f.same(doc);
  let current=doc;
  for(const [step,value] of ['inner','tangent','outer'].entries()){
   const changed=structuredClone(current);if(value==='outer')delete changed.nodes[2].measure;else changed.nodes[2].measure=value;
   await f.openFeatureEditor(2,'Flange');await f.editor().getByRole('combobox',{name:'Length to',exact:true}).selectOption(value);await f.applyEditor(current,'fixed-'+step+'-apply');await f.same(changed);
   await geometry('fixed-'+step+'-native',changed);await f.undo();await f.same(current);await geometry('fixed-'+step+'-undo-native',current);await f.redo();await f.same(changed);await geometry('fixed-'+step+'-redo-native',changed);
   const file=await f.save('flange-measure-fixed-'+value);await f.freshOpen(file.file,file.doc,'fixed-'+step+'-reopened');await f.same(changed);await geometry('fixed-'+step+'-reopened-native',changed);await history('fixed-'+step+'-reopened-fields',changed);current=changed;
  }
  assert.deepEqual(current,doc);
  for(const [field,value] of [['Length','21'],['Angle','45']]){
   const before=await f.snapshot('fixed-before-mixed-'+field);
   await f.openFeatureEditor(2,'Flange');await f.editor().getByRole('combobox',{name:'Length to',exact:true}).selectOption('inner');await f.editor().getByLabel(field,{exact:true}).fill(value);await button('Apply',f.editor()).click();await f.editor().locator('.hud-error').first().waitFor();assert.match(await f.editor().locator('.hud-error').first().innerText(),/Flange length measurement not applied/);
   const refused=await f.snapshot('fixed-mixed-'+field+'-refused');await f.same(current);assert.deepEqual(refused.history,before.history);await f.closeEditor();await f.same(current);await geometry('fixed-mixed-'+field+'-native',current);
  }
 }
 const saved=await f.save('flange-measure-'+measure);await f.freshOpen(saved.file,saved.doc,measure+'-05-reopened');await f.same(doc);await geometry(measure+'-06-reopened-native',doc);await history(measure+'-07-reopened-history',doc);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot(measure+'-08-final');
 }
});
