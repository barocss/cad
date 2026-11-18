import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/flange-radius-history-browser.mjs','packages/barocss-cad-model/src/app/flangeRadiusEdit.ts','packages/barocss-cad-model/src/app/sheetCommands.ts','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','apps/cad-studio/src/ui/NodeEditor.tsx','apps/cad-studio/src/app/featureNumberInput.ts','apps/cad-studio/src/state/historyFeatureApply.ts'];
const f=await createFlow({name:'flange-radius-history',output:process.argv[2],envFrozen:'FLANGE_RADIUS_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Actual explicit R2 Flange creation followed by observation of History radius editing and native Save/Open preservation.':'Actual explicit Flange radius-only History editing, native folded/developed geometry, invalid and mixed draft rejection, Undo and Save/Open preservation.',limits:['Single terminal rectangular-sheet flange, outer length20, material-inside90 degrees, constant explicit radius2. No manufacturing calibration, bend tables, downstream or multi-flange claim.'],inspectorSource:`
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
 const volume=W*T*(run+L-2*(R+T)+Math.PI/2*(R+T/2));
 const flatLength=run+L-2*(R+T)+Math.PI/2*(R+K*T);
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.equal(n.count,1);assert.ok(n.check.valid,JSON.stringify(n.check.issues));near(n.mass.volume,volume,1e-7);
 assert.equal(n.sheet.thickness,T);assert.equal(n.sheet.bendRadius,1.5);assert.equal(n.sheet.kFactor,K);assert.equal(n.sheet.bends.length,1);near(n.sheet.bends[0].radius,R);near(n.sheet.bends[0].angle,90);
 assert.equal(n.flat.bends.length,1);near(n.flat.bends[0].radius,R);near(n.flat.bends[0].allowance,Math.PI/2*(R+K*T));assert.equal(n.flat.loops.length,1);const loop=n.flat.loops[0];assert.equal(loop.outer,true);assert.equal(loop.segments.length,4);assert.ok(loop.segments.every(s=>s.kind==='line'));
 const lengths=loop.segments.map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])).sort((a,b)=>a-b);[W,W,flatLength,flatLength].sort((a,b)=>a-b).forEach((v,i)=>near(lengths[i],v));
 const cylinders=n.faces.filter(x=>x.geometry.kind==='cylinder');assert.ok(cylinders.some(x=>Math.abs(x.geometry.r-R)<1e-8));assert.ok(cylinders.some(x=>Math.abs(x.geometry.r-(R+T))<1e-8));
 const bodies=(await f.bodies()).bodies;assert.equal(bodies.length,1);near(bodies[0].volume,volume,1e-7);f.report.observations.push({label,volume:n.mass.volume,expectedVolume:volume,flatLength,innerRadius:R,sheetDefaultRadius:n.sheet.bendRadius,bend:n.sheet.bends[0]});return n;
}
async function history(label,doc){
 await f.openFeatureEditor(2,'Flange');const fields=await f.editorFields(),radiusFields=fields.filter(x=>/radius/i.test(x.label));
 // Baseline observes support; fixed proves this explicit numeric terminal field.
 if(!baseline){assert.equal(Number(await f.editor().getByLabel('Bend radius',{exact:true}).inputValue()),doc.nodes[2].bendRadius);assert.equal(await f.editor().getByLabel('Bend radius parameter',{exact:true}).count(),0);}
 f.report.observations.push({label,fields,radiusFields,historyRadiusOffered:radiusFields.length>0});assert.equal(Number(await f.editor().getByLabel('Length',{exact:true}).inputValue()),20);await f.snapshot(label);await f.closeEditor();await f.same(doc);
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'flange-radius-source.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
 const [native]=await f.inspect('01-sheet-native',source);assert.ok(native.check.valid);near(native.mass.volume,6000,1e-7);const edge=native.edges.filter(e=>e.straight&&e.a[0]===80&&e.b[0]===80&&e.a[2]===T&&e.b[2]===T);assert.equal(edge.length,1);assert.deepEqual(edge[0].names,['n1.side1|n1.top']);near(Math.hypot(...edge[0].a.map((v,i)=>v-edge[0].b[i])),W);
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([80,25,T]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await clickModelCommand(f.page,'Modify','Flange');const hud=f.page.getByRole('dialog',{name:'Flange',exact:true});await hud.getByLabel('Bend radius (0: the sheet’s)',{exact:true}).fill('2');await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await button('Apply',hud).click();await f.changed(source);await f.ready();const doc=await f.doc();assert.equal(doc.nodes.length,3);assert.deepEqual(doc.nodes.slice(0,2),source.nodes);assert.equal(doc.nodes[2].kind,'sheet-flange');assert.equal(doc.nodes[2].bendRadius,R);assert.equal(doc.nodes[2].length,20);assert.deepEqual(doc.nodes[2].edges,edge[0].names);
 await geometry('02-flange-native',doc);await history('03-history-radius-observation',doc);await f.undo();await f.same(source);await f.redo();await f.same(doc);await geometry('04-redo-native',doc);
 let finalDoc=doc;
 if(!baseline){
  const changed=structuredClone(doc);changed.nodes[2].bendRadius=3;
  await f.openFeatureEditor(2,'Flange');await f.editor().getByLabel('Bend radius',{exact:true}).fill('3');await f.applyEditor(doc,'fixed-radius3');await f.same(changed);await geometry('fixed-radius3-native',changed);
  await f.undo();await f.same(doc);await geometry('fixed-undo-radius2-native',doc);await f.redo();await f.same(changed);await geometry('fixed-redo-radius3-native',changed);
  // Invalid numeric text stays an uncommitted draft, rather than throwing in React.
  await f.openFeatureEditor(2,'Flange');await f.editor().getByLabel('Bend radius',{exact:true}).fill('0');assert.equal(await button('Apply',f.editor()).isDisabled(),true);await f.same(changed);await f.snapshot('fixed-zero-disabled');await f.closeEditor();
  // Radius-only admission must hold at Apply, not just while its field is visible.
  for(const [label,value] of [['Angle','45'],['Length','21']]){
   await f.openFeatureEditor(2,'Flange');await f.editor().getByLabel('Bend radius',{exact:true}).fill('4');await f.editor().getByLabel(label,{exact:true}).fill(value);await button('Apply',f.editor()).click();await f.editor().locator('.hud-error').first().waitFor();await f.same(changed);await f.snapshot('fixed-mixed-'+label.toLowerCase()+'-refused');await f.closeEditor();
  }
  const accepted=await f.snapshot('fixed-before-invalid');await f.openFeatureEditor(2,'Flange');await f.editor().getByLabel('Bend radius',{exact:true}).fill('19');await button('Apply',f.editor()).click();await f.editor().locator('.hud-error').first().waitFor();const refused=await f.snapshot('fixed-radius19-refused');assert.match(refused.editor,/BEND_DOES_NOT_FIT/);assert.deepEqual(refused.history,accepted.history);await f.same(changed);await geometry('fixed-refused-native',changed);
  await f.editor().getByLabel('Bend radius',{exact:true}).fill('2.5');assert.equal(Number(await f.editor().getByLabel('Bend radius',{exact:true}).inputValue()),2.5);await f.snapshot('fixed-valid-draft-cancel');await f.closeEditor();await f.same(changed);
  // Rejected and cancelled drafts must not introduce document Undo entries.
  await f.undo();await f.same(doc);await f.redo();await f.same(changed);await geometry('fixed-after-cancel-native',changed);finalDoc=changed;
 }
 const saved=await f.save('explicit-flange-radius');await f.freshOpen(saved.file,saved.doc,'05-reopened');await f.same(finalDoc);await geometry('06-reopened-native',finalDoc);await history('07-reopened-history',finalDoc);await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('08-final');
});
