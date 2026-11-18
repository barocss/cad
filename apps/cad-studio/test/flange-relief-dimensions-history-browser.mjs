import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline');
const partial=true,positive=process.argv.includes('--positive'),reliefWidth=positive?2:1.5,reliefDepth=positive?2.5:1.5;
const pins=['apps/cad-studio/test/flange-relief-dimensions-history-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs','packages/barocss-cad/src/part/part-sheet.ts','packages/barocss-cad/src/frame-sheet/sheet-flat.ts','packages/barocss-cad-model/src/app/sheetCommands.ts','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','packages/barocss-cad-model/src/engine/references.ts','packages/barocss-cad-model/src/engine/rematch.ts','apps/cad-studio/src/ui/NodeEditor.tsx','apps/cad-studio/src/state/historyFeatureApply.ts'];
pins.push('packages/barocss-cad-model/src/app/flangeWidthHistoryEdit.ts','apps/cad-studio/src/ui/HistoryFeatureEditor.tsx');
if(!baseline)pins.push('packages/barocss-cad-model/src/app/flangeReliefDimensionsHistoryEdit.ts');
const f=await createFlow({name:'flange-relief-dimensions-history',output:process.argv[2],envFrozen:'FLANGE_RELIEF_DIMENSIONS_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Observe existing partial Flange relief dimension History entry; separately qualify explicit creation dimensions and persistence.':'Verify bounded explicit relief dimension edits and original preservation.',limits:['Actual partial creation on synthetic XY sheet; numeric inherited radius, obround end relief. No missing-field regression assumption. History dimension edits are NOT_RUN when unavailable. No full-width transition, manufacturing or downstream claim.'],inspectorSource:`
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

console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({id:o.id,count:o.bodyCount,check:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o),sheet:o.sheet,flat:flatPatternOf(o),vertices:o.brep.vertices.map(v=>v.point),rawEdges:o.brep.edges.map(e=>({name:e.name,points:e.curve.controlPoints})),faces:o.brep.faces.map(face=>({name:face.name,geometry:faceGeometry(face)})),edges:bodyMesh(o.brep,0).edges.map(e=>({names:e.names,a:e.a,b:e.b,straight:e.straight}))}))));
`});

const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]},{id:'n1',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const near=(a,b,t=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} != ${b}`);
let partialY=[10,25];
async function geometry(label,doc){
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const [n]=rows;assert.equal(n.count,1);
 const partial=!!doc.nodes[2].offsets?.some(v=>v>0);assert.ok(n.check.valid,JSON.stringify(n.check.issues));
 const T=1.5,R=1.5,K=.44,trim=3,straight=17,width=partial?15:50;
 // Each obround notch removes a rectangle to the semicircle centre plus half-disc.
 const {width:reliefWidth,depth:reliefDepth}=doc.nodes[2].relief;
 const capRadius=reliefWidth/2;
 const reliefArea=2*(reliefWidth*(trim+reliefDepth-capRadius)+Math.PI*capRadius**2/2);
 const volume=T*(4000-trim*width-reliefArea+width*(straight+Math.PI/2*(R+T/2)));
 const flatArea=4000-trim*width-reliefArea+width*(straight+Math.PI/2*(R+K*T));
 near(n.mass.volume,volume,1e-7);assert.equal(n.sheet.bends.length,1);near(n.sheet.bends[0].radius,R);near(n.sheet.bends[0].angle,90);
 near(n.flat.area,flatArea,1e-7);assert.equal(n.flat.loops.length,1);assert.equal(n.flat.bends.length,1);near(n.flat.bends[0].allowance,Math.PI/2*(R+K*T));
 const bends=n.faces.filter(x=>x.geometry.kind==='cylinder'&&Math.abs(x.geometry.a[1])>1-1e-8);
 assert.ok(bends.some(x=>Math.abs(x.geometry.r-R)<1e-8));assert.ok(bends.some(x=>Math.abs(x.geometry.r-(R+T))<1e-8));
 if(partial){const caps=n.faces.filter(x=>x.geometry.kind==='cylinder'&&Math.abs(x.geometry.r-capRadius)<1e-8);assert.equal(caps.length,2);for(const c of caps){near(Math.abs(c.geometry.a[2]),1);near(c.geometry.c[0],80-trim-reliefDepth+capRadius);}const ys=caps.map(c=>c.geometry.c[1]).sort((a,b)=>a-b);near(ys[0],partialY[0]-capRadius);near(ys[1],partialY[1]+capRadius);}
 for(const c of bends){near(c.geometry.c[0],77);near(c.geometry.c[2],3);}
 const upper=n.vertices.filter(p=>p[2]>1.5+1e-8);assert.ok(upper.length);near(Math.min(...upper.map(p=>p[1])),partial?partialY[0]:0);near(Math.max(...upper.map(p=>p[1])),partial?partialY[1]:50);near(Math.max(...upper.map(p=>p[2])),20);
 for(const y of partial?partialY:[0,50])for(const [x,z] of [[78.5,3],[80,3],[78.5,20],[80,20]])assert.ok(n.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-8),`Missing flange endpoint ${x},${y},${z}`);
 const proof=await f.inspect(label+'-parent',doc,'parent');assert.ok(proof.check.valid);near(proof.mass.volume,6000,1e-7);assert.deepEqual(doc.nodes[2].sigs,proof.sigs);
 f.report.observations.push({label,partial,expectedVolume:volume,actualVolume:n.mass.volume,expectedFlatArea:flatArea,flat:n.flat,originalSignature:proof.sigs});return n;
}
async function history(label,doc){
 const partial=!!doc.nodes[2].offsets?.some(v=>v>0);
 await f.openFeatureEditor(2,'Flange');const fields=await f.editorFields();
 for(const [name,value] of [['Offset at start',10],['Offset at end',25]]){const input=f.editor().getByRole('spinbutton',{name,exact:true});assert.equal(await input.count(),partial?1:0);if(partial)near(Number(await input.inputValue()),value);}
 const choices=await f.editor().getByRole('combobox').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),value:e.value,options:[...e.options].map(o=>o.value)})));
 const width=f.editor().getByRole('spinbutton',{name:/^Relief width/i}),depth=f.editor().getByRole('spinbutton',{name:/^Relief depth/i});
 const offered={width:await width.count(),depth:await depth.count()};const buttons=await f.editor().getByRole('button').allTextContents();
 f.report.observations.push({label,fields,choices,buttons,reliefDimensionsOffered:offered,savedRelief:doc.nodes[2].relief,dimensionEdit:{status:'NOT_RUN',reason:offered.width||offered.depth?'Fields unexpectedly offered: observation retained; numeric editing not attempted by this baseline':'Existing partial History has no relief dimension fields'}});
 assert.equal(await button('Edit flange width',f.editor()).count(),0,'Full-width transition command must not replace existing partial History');
 await f.same(doc);await f.snapshot(label);await f.closeEditor();await f.same(doc);
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'flange-width-source.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
 const [native]=await f.inspect('01-source',source);assert.ok(native.check.valid);near(native.mass.volume,6000,1e-7);const edges=native.edges.filter(e=>e.straight&&e.a[0]===80&&e.b[0]===80&&e.a[2]===1.5&&e.b[2]===1.5);assert.equal(edges.length,1);assert.deepEqual(edges[0].names,['n1.side1|n1.top']);const raw=native.rawEdges.filter(e=>e.name==='n1.side1|n1.top');assert.equal(raw.length,1);const ends=raw[0].points;const a=ends[0],b=ends.at(-1);assert.ok((a[1]===0&&b[1]===50)||(a[1]===50&&b[1]===0));assert.deepEqual([a[0],a[2],b[0],b[2]],[80,1.5,80,1.5]);partialY=[a[1]+(b[1]-a[1])*10/50,b[1]-(b[1]-a[1])*25/50].sort((a,b)=>a-b);f.report.observations.push({label:'native-start-end-offset-frame',a,b,expectedPartialY:partialY});
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([80,25,1.5]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await clickModelCommand(f.page,'Modify','Flange');const hud=f.page.getByRole('dialog',{name:'Flange',exact:true});near(Number(await hud.getByLabel('Bend radius (0: the sheet’s)',{exact:true}).inputValue()),0);
 if(partial){await hud.getByLabel('Offset at start',{exact:true}).fill('10');await hud.getByLabel('Offset at end',{exact:true}).fill('25');await hud.getByLabel('Relief',{exact:true}).selectOption('obround');await hud.getByLabel('Relief width (0: T, estimate)',{exact:true}).fill(String(reliefWidth));await hud.getByLabel('Relief depth (0: T, estimate)',{exact:true}).fill(String(reliefDepth));await hud.getByLabel('Length',{exact:true}).click();}
 await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await f.snapshot('02-creation-preview');await button('Apply',hud).click();await f.changed(source);await f.ready();const doc=await f.doc();assert.equal(doc.nodes.length,3);assert.deepEqual(doc.nodes.slice(0,2),source.nodes);const node=doc.nodes[2];assert.equal(node.kind,'sheet-flange');assert.equal(Object.hasOwn(node,'bendRadius'),false);assert.deepEqual(node.edges,edges[0].names);
 if(partial){assert.deepEqual(node.offsets,[10,25]);assert.deepEqual(node.relief,{kind:'obround',width:reliefWidth,depth:reliefDepth});}else{assert.equal(Object.hasOwn(node,'offsets'),false);assert.equal(Object.hasOwn(node,'relief'),false);}
 await geometry('03-created-native',doc);await history('04-history-noop',doc);await f.undo();await f.same(source);await f.redo();await f.same(doc);await geometry('05-redo-native',doc);
 const saved=await f.save(positive?'flange-relief-positive':'flange-relief-original');await f.freshOpen(saved.file,saved.doc,'06-reopened');await f.same(doc);await geometry('07-reopened-native',doc);await history('08-reopened-history',doc);
 if(!baseline&&!positive){
  const accepted=doc;
  const open=async()=>{await f.openFeatureEditor(2,'Flange');await button('Edit flange relief',f.editor()).click();const hud=f.page.getByRole('dialog',{name:'Edit flange relief',exact:true});await hud.waitFor();return hud;};
  const input=(hud,name)=>hud.getByLabel(name,{exact:true});
  const preview=async hud=>{await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await button('Apply',hud).waitFor();assert.equal(await button('Apply',hud).isEnabled(),true);};
  let hud=await open();near(Number(await input(hud,'Relief width').inputValue()),1.5);near(Number(await input(hud,'Relief depth').inputValue()),1.5);await preview(hud);await button('Apply',hud).click();await hud.waitFor({state:'hidden'});await f.same(accepted);await geometry('09-noop-native',accepted);
  hud=await open();await input(hud,'Relief width').fill('2');await input(hud,'Relief depth').click();await preview(hud);await button('Cancel',hud).click();await hud.waitFor({state:'hidden'});await f.same(accepted);await geometry('10-cancel-native',accepted);
  hud=await open();await input(hud,'Relief width').fill('11');await input(hud,'Relief depth').click();await hud.locator('.status').filter({hasText:/refused/i}).waitFor();assert.equal(await button('Apply',hud).isEnabled(),false);await f.same(accepted);await f.snapshot('11-wide-relief-refused');
  await input(hud,'Relief width').fill('2');await input(hud,'Relief depth').fill('.5');await input(hud,'Relief width').click();await hud.locator('.status').filter({hasText:/refused/i}).waitFor();assert.equal(await button('Apply',hud).isEnabled(),false);await f.same(accepted);await f.snapshot('12-shallow-relief-refused');
  await input(hud,'Relief depth').fill('1.5');await input(hud,'Relief width').click();await preview(hud);await button('Apply',hud).click();await f.changed(accepted);await f.ready();const wider=await f.doc();const expectedW=structuredClone(accepted);expectedW.nodes[2].relief.width=2;assert.deepEqual(wider,expectedW);await geometry('13-width-native',wider);
  hud=await open();await input(hud,'Relief depth').fill('2.5');await input(hud,'Relief width').click();await preview(hud);await f.snapshot('14-depth-preview');await button('Apply',hud).click();await f.changed(wider);await f.ready();const deeper=await f.doc();const expectedD=structuredClone(wider);expectedD.nodes[2].relief.depth=2.5;assert.deepEqual(deeper,expectedD);await geometry('15-depth-native',deeper);
  await f.undo();await f.same(wider);await geometry('16-undo-depth-native',wider);await f.undo();await f.same(accepted);await geometry('17-undo-width-native',accepted);await f.redo();await f.same(wider);await f.redo();await f.same(deeper);await geometry('18-redo-native',deeper);
  const edited=await f.save('flange-relief-edited');await f.freshOpen(edited.file,edited.doc,'19-edited-reopened');await f.same(deeper);await geometry('20-reopened-native',deeper);hud=await open();near(Number(await input(hud,'Relief width').inputValue()),2);near(Number(await input(hud,'Relief depth').inputValue()),2.5);await button('Cancel',hud).click();await hud.waitFor({state:'hidden'});await f.same(deeper);
 }
 await f.persist();
});
