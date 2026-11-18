import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/flange-position-history-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs','packages/barocss-cad/src/part/part-sheet.ts','packages/barocss-cad-model/src/app/sheetCommands.ts','packages/barocss-cad-model/src/app/flangeRadiusEdit.ts','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','apps/cad-studio/src/ui/NodeEditor.tsx','apps/cad-studio/src/app/featureNumberInput.ts','apps/cad-studio/src/state/historyFeatureApply.ts'];
if(!baseline)pins.push('packages/barocss-cad-model/src/app/flangePositionEdit.ts','apps/cad-studio/src/state/flangePositionHistory.ts','apps/cad-studio/src/state/rectangleFinishResize.ts');
const f=await createFlow({name:'flange-position-history',output:process.argv[2],envFrozen:'FLANGE_POSITION_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Actual Material inside Flange creation and History Position availability observation, independent folded/flat geometry and Save/Open preservation.':'Actual History Position inside/outside/bend-outside cycle, independent folded/flat geometry, mixed-edit rejection, Undo/Redo and Save/Open preservation.',limits:['Single terminal rectangular-sheet flange, outer length20, 90 degrees, constant explicit radius2. Baseline starts Material inside. No manufacturing calibration, bend tables, downstream or multi-flange claim.'],inspectorSource:`
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
 const position=doc.nodes[2].position??'material-inside',trim=position==='material-inside'?R+T:position==='material-outside'?R:0;
 const straight=L-(R+T),cx=run-trim,maxX=cx+R+T;
 const volume=W*T*(run-trim+straight+Math.PI/2*(R+T/2));
 const flatLength=run-trim+straight+Math.PI/2*(R+K*T);
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.equal(n.count,1);assert.ok(n.check.valid,JSON.stringify(n.check.issues));near(n.mass.volume,volume,1e-7);
 assert.equal(n.sheet.thickness,T);assert.equal(n.sheet.bendRadius,1.5);assert.equal(n.sheet.kFactor,K);assert.equal(n.sheet.bends.length,1);near(n.sheet.bends[0].radius,R);near(n.sheet.bends[0].angle,90);
 assert.equal(n.flat.bends.length,1);near(n.flat.bends[0].radius,R);near(n.flat.bends[0].allowance,Math.PI/2*(R+K*T));assert.equal(n.flat.loops.length,1);const loop=n.flat.loops[0];assert.equal(loop.outer,true);assert.equal(loop.segments.length,4);assert.ok(loop.segments.every(s=>s.kind==='line'));
 const lengths=loop.segments.map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])).sort((a,b)=>a-b);[W,W,flatLength,flatLength].sort((a,b)=>a-b).forEach((v,i)=>near(lengths[i],v));
 const cylinders=n.faces.filter(x=>x.geometry.kind==='cylinder');assert.ok(cylinders.some(x=>Math.abs(x.geometry.r-R)<1e-8));assert.ok(cylinders.some(x=>Math.abs(x.geometry.r-(R+T))<1e-8));
 // Position changes plate trim, not the authored leg length or radius.
 // The bend centre moves along X; the tip Z and Y-directed axis stay fixed.
 for(const c of cylinders){near(c.geometry.c[0],cx);near(c.geometry.c[2],3.5);near(Math.abs(c.geometry.a[1]),1);}
 for(const [axis,min,max] of [[0,0,maxX],[1,0,50],[2,0,20]]){near(Math.min(...n.vertices.map(p=>p[axis])),min);near(Math.max(...n.vertices.map(p=>p[axis])),max);}
 const section=[[0,0],[cx,0],[cx,1.5],[0,1.5],[cx+R,3.5],[maxX,3.5],[cx+R,20],[maxX,20]];
 for(const y of [0,50])for(const [x,z] of section)assert.ok(n.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<=1e-8),`Missing section vertex ${x},${y},${z}`);
 const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);near(bodies[0].volume,volume,1e-7);f.report.observations.push({label,position,trim,maxX,volume:n.mass.volume,expectedVolume:volume,flatLength,innerRadius:R,sheetDefaultRadius:n.sheet.bendRadius,bend:n.sheet.bends[0]});return n;
}
async function history(label,doc){
 await f.openFeatureEditor(2,'Flange');const fields=await f.editorFields();
 const position=f.editor().getByRole('combobox',{name:'Position',exact:true});const offered=await position.count();
 const buttons=await f.editor().getByRole('button').allTextContents();
 f.report.observations.push({label,fields,historyPositionOffered:offered>0,positionValue:offered?await position.inputValue():null,buttons});
 assert.equal(Number(await f.editor().getByLabel('Length',{exact:true}).inputValue()),20);
 assert.equal(Number(await f.editor().getByLabel('Angle',{exact:true}).inputValue()),90);
 if((doc.nodes[2].position??'material-inside')==='material-inside')assert.equal(Number(await f.editor().getByLabel('Bend radius',{exact:true}).inputValue()),2);
 else assert.equal(await f.editor().getByLabel('Bend radius',{exact:true}).count(),0,'Existing own-radius editor stays limited to Material inside');
 if(!baseline){assert.equal(offered,1);assert.equal(await position.inputValue(),doc.nodes[2].position??'material-inside');}
 await f.snapshot(label);await f.closeEditor();await f.same(doc);
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'flange-position-source.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
 const [native]=await f.inspect('01-sheet-native',source);assert.ok(native.check.valid);near(native.mass.volume,6000,1e-7);const edge=native.edges.filter(e=>e.straight&&e.a[0]===80&&e.b[0]===80&&e.a[2]===T&&e.b[2]===T);assert.equal(edge.length,1);assert.deepEqual(edge[0].names,['n1.side1|n1.top']);near(Math.hypot(...edge[0].a.map((v,i)=>v-edge[0].b[i])),W);
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([80,25,T]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await clickModelCommand(f.page,'Modify','Flange');const hud=f.page.getByRole('dialog',{name:'Flange',exact:true});await hud.getByLabel('Bend radius (0: the sheet’s)',{exact:true}).fill('2');assert.equal(await hud.getByLabel('Position',{exact:true}).inputValue(),'material-inside');assert.equal(await hud.getByLabel('Length to',{exact:true}).inputValue(),'outer');await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await button('Apply',hud).click();await f.changed(source);await f.ready();const doc=await f.doc();assert.equal(doc.nodes.length,3);assert.deepEqual(doc.nodes.slice(0,2),source.nodes);assert.equal(doc.nodes[2].kind,'sheet-flange');assert.equal(doc.nodes[2].bendRadius,R);assert.equal(doc.nodes[2].length,20);assert.equal(doc.nodes[2].position??'material-inside','material-inside');assert.equal(doc.nodes[2].measure??'outer','outer');assert.equal(doc.nodes[2].angle??90,90);assert.deepEqual(doc.nodes[2].edges,edge[0].names);
 await geometry('02-flange-native',doc);await history('03-history-position-observation',doc);await f.undo();await f.same(source);await f.redo();await f.same(doc);await geometry('04-redo-native',doc);
 if(!baseline){
  // Cancel leaves both document history and native geometry untouched.
  await f.openFeatureEditor(2,'Flange');await f.editor().getByRole('combobox',{name:'Position',exact:true}).selectOption('material-outside');await f.snapshot('fixed-cancel-draft');await f.closeEditor();await f.same(doc);
  let current=doc;
  for(const [step,position] of ['material-outside','bend-outside','material-inside'].entries()){
   const changed=structuredClone(current);if(position==='material-inside')delete changed.nodes[2].position;else changed.nodes[2].position=position;
   await f.openFeatureEditor(2,'Flange');await f.editor().getByRole('combobox',{name:'Position',exact:true}).selectOption(position);await f.applyEditor(current,'fixed-'+step+'-apply');await f.same(changed);
   // Whole-document equality covers source nodes, original edge/sigs, ids, output,
   // size, radius, angle and all sheet rules, not just visible field values.
   await geometry('fixed-'+step+'-native',changed);await f.undo();await f.same(current);await geometry('fixed-'+step+'-undo-native',current);await f.redo();await f.same(changed);await geometry('fixed-'+step+'-redo-native',changed);
   const file=await f.save('flange-position-'+position);await f.freshOpen(file.file,file.doc,'fixed-'+step+'-reopened');await f.same(changed);await geometry('fixed-'+step+'-reopened-native',changed);await history('fixed-'+step+'-reopened-fields',changed);current=changed;
  }
  assert.deepEqual(current,doc);
  for(const [field,value] of [['Length','21'],['Angle','45']]){
   const before=await f.snapshot('fixed-before-mixed-'+field);
   await f.openFeatureEditor(2,'Flange');await f.editor().getByRole('combobox',{name:'Position',exact:true}).selectOption('material-outside');await f.editor().getByLabel(field,{exact:true}).fill(value);await button('Apply',f.editor()).click();await f.editor().locator('.hud-error').first().waitFor();assert.match(await f.editor().locator('.hud-error').first().innerText(),/Flange position not applied/);
   const refused=await f.snapshot('fixed-mixed-'+field+'-refused');await f.same(current);assert.deepEqual(refused.history,before.history);await f.closeEditor();await f.same(current);await geometry('fixed-mixed-'+field+'-native',current);
  }
 }
 const saved=await f.save('flange-position-baseline');await f.freshOpen(saved.file,saved.doc,'05-reopened');await f.same(doc);await geometry('06-reopened-native',doc);await history('07-reopened-history',doc);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('08-final');
});
