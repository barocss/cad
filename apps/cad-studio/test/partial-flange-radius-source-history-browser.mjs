import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline'),refusalCase=process.argv.includes('--refusal'),sheetRadius=refusalCase?19:1.5;
const partial=true,own=process.argv.includes('--own')||refusalCase,ownRadius=own?2:0,reliefWidth=1.5,reliefDepth=1.5;
const pins=['apps/cad-studio/test/partial-flange-radius-source-history-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs','packages/barocss-cad/src/part/part-sheet.ts','packages/barocss-cad/src/frame-sheet/sheet-flat.ts','packages/barocss-cad-model/src/app/sheetCommands.ts','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','packages/barocss-cad-model/src/engine/references.ts','packages/barocss-cad-model/src/engine/rematch.ts','apps/cad-studio/src/ui/NodeEditor.tsx','apps/cad-studio/src/state/historyFeatureApply.ts'];
pins.push('packages/barocss-cad-model/src/app/flangeWidthHistoryEdit.ts','apps/cad-studio/src/ui/HistoryFeatureEditor.tsx');
pins.push('packages/barocss-cad-model/src/app/partialFlangeRadiusHistoryEdit.ts');
pins.push('packages/barocss-cad-model/src/app/flangeRadiusEdit.ts','packages/barocss-cad-model/src/app/flangeRadiusSourceEdit.ts','packages/barocss-cad-model/src/app/flangeReliefDimensionsHistoryEdit.ts');
if(!baseline)pins.push('packages/barocss-cad-model/src/app/partialFlangeRadiusSourceHistoryEdit.ts');
const f=await createFlow({name:'partial-flange-radius-source-history',output:process.argv[2],envFrozen:'PARTIAL_FLANGE_RADIUS_SOURCE_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Observe existing partial Flange Radius source History availability.':'Verify bounded partial Flange Radius source switch, preservation, Undo and persistence.',limits:['Actual partial Flange creation: default inherited radius (HUD 0, saved key omitted), or separate --own R2 creation. These are creation controls, not a source-transition test.','Baseline observes controls only: transition NOT_RUN, not data loss. Fixed mode explicitly tests source-only switching; numeric radius and relief commands remain separate.','No bound Dim, downstream, manufacturing or general sheet editing claim. History open/close is not a no-op Apply test.'],inspectorSource:`
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

const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]},{id:'n1',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:sheetRadius,kFactor:.44}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const near=(a,b,t=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} != ${b}`);
let partialY=[10,25];
async function geometry(label,doc){
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const [n]=rows;assert.equal(n.count,1);
 const partial=!!doc.nodes[2].offsets?.some(v=>v>0);assert.ok(n.check.valid,JSON.stringify(n.check.issues));
 const T=1.5,R=doc.nodes[2].bendRadius??doc.nodes[1].bendRadius,K=.44,trim=R+T,straight=20-trim,width=partial?15:50;
 assert.equal(typeof R,'number');assert.ok(Number.isFinite(R)&&R>0);assert.equal(doc.nodes[1].bendRadius,sheetRadius);
 // Each obround notch removes a rectangle to the semicircle centre plus half-disc.
 const {width:reliefWidth,depth:reliefDepth}=doc.nodes[2].relief;
 const capRadius=reliefWidth/2;
 const reliefArea=2*(reliefWidth*(trim+reliefDepth-capRadius)+Math.PI*capRadius**2/2);
 const volume=T*(4000-trim*width-reliefArea+width*(straight+Math.PI/2*(R+T/2)));
 const flatArea=4000-trim*width-reliefArea+width*(straight+Math.PI/2*(R+K*T));
 near(n.mass.volume,volume,1e-7);near(n.sheet.bendRadius,sheetRadius);assert.equal(n.sheet.bends.length,1);near(n.sheet.bends[0].radius,R);near(n.sheet.bends[0].angle,90);
 near(n.flat.area,flatArea,1e-7);assert.equal(n.flat.loops.length,1);assert.equal(n.flat.bends.length,1);near(n.flat.bends[0].radius,R);near(n.flat.bends[0].allowance,Math.PI/2*(R+K*T));
 const bends=n.faces.filter(x=>x.geometry.kind==='cylinder'&&Math.abs(x.geometry.a[1])>1-1e-8);
 assert.ok(bends.some(x=>Math.abs(x.geometry.r-R)<1e-8));assert.ok(bends.some(x=>Math.abs(x.geometry.r-(R+T))<1e-8));
 if(partial){const caps=n.faces.filter(x=>x.geometry.kind==='cylinder'&&Math.abs(x.geometry.r-capRadius)<1e-8);assert.equal(caps.length,2);for(const c of caps){near(Math.abs(c.geometry.a[2]),1);near(c.geometry.c[0],80-trim-reliefDepth+capRadius);}const ys=caps.map(c=>c.geometry.c[1]).sort((a,b)=>a-b);near(ys[0],partialY[0]-capRadius);near(ys[1],partialY[1]+capRadius);}
 for(const c of bends){near(c.geometry.c[0],80-trim);near(c.geometry.c[2],trim);}
 const upper=n.vertices.filter(p=>p[2]>1.5+1e-8);assert.ok(upper.length);near(Math.min(...upper.map(p=>p[1])),partial?partialY[0]:0);near(Math.max(...upper.map(p=>p[1])),partial?partialY[1]:50);near(Math.max(...upper.map(p=>p[2])),20);
 for(const y of partial?partialY:[0,50])for(const [x,z] of [[78.5,trim],[80,trim],[78.5,20],[80,20]])assert.ok(n.vertices.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-8),`Missing flange endpoint ${x},${y},${z}`);
 const proof=await f.inspect(label+'-parent',doc,'parent');assert.ok(proof.check.valid);near(proof.mass.volume,6000,1e-7);assert.deepEqual(doc.nodes[2].sigs,proof.sigs);
 f.report.observations.push({label,partial,expectedVolume:volume,actualVolume:n.mass.volume,expectedFlatArea:flatArea,flat:n.flat,originalSignature:proof.sigs});return n;
}
async function history(label,doc){
 const partial=!!doc.nodes[2].offsets?.some(v=>v>0);
 await f.openFeatureEditor(2,'Flange');const fields=await f.editorFields();
 for(const [name,value] of [['Offset at start',10],['Offset at end',25]]){const input=f.editor().getByRole('spinbutton',{name,exact:true});assert.equal(await input.count(),partial?1:0);if(partial)near(Number(await input.inputValue()),value);}
 const choices=await f.editor().getByRole('combobox').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),value:e.value,options:[...e.options].map(o=>o.value)})));
 const radius=f.editor().getByRole('spinbutton',{name:/^(?:Own )?Bend radius$/i});
 const offered=await radius.count(),buttons=await f.editor().getByRole('button').allTextContents();
 const radiusSource=choices.filter(c=>/radius source/i.test(c.label??''));
 const sourceButtons=buttons.filter(text=>/radius source/i.test(text));
 f.report.observations.push({label,fields,choices,buttons,radiusFieldsOffered:offered,radiusSourceControls:radiusSource,radiusSourceButtons:sourceButtons,numericRadiusCommands:buttons.filter(text=>/^Edit partial flange radius$/i.test(text)),reliefCommands:buttons.filter(text=>/flange relief/i.test(text)),savedRadiusPresent:Object.hasOwn(doc.nodes[2],'bendRadius'),savedOwnRadius:doc.nodes[2].bendRadius??null,effectiveRadius:doc.nodes[2].bendRadius??doc.nodes[1].bendRadius,radiusSourceEdit:{status:'NOT_RUN',reason:radiusSource.length||sourceButtons.length?'Source control observed; this baseline does not exercise source transition':'No Radius source control observed; original creation and persistence remain independently checked'}});
 await f.same(doc);await f.snapshot(label);await f.closeEditor();await f.same(doc);
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'partial-flange-radius-source.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
 const [native]=await f.inspect('01-source',source);assert.ok(native.check.valid);near(native.mass.volume,6000,1e-7);const edges=native.edges.filter(e=>e.straight&&e.a[0]===80&&e.b[0]===80&&e.a[2]===1.5&&e.b[2]===1.5);assert.equal(edges.length,1);assert.deepEqual(edges[0].names,['n1.side1|n1.top']);const raw=native.rawEdges.filter(e=>e.name==='n1.side1|n1.top');assert.equal(raw.length,1);const ends=raw[0].points;const a=ends[0],b=ends.at(-1);assert.ok((a[1]===0&&b[1]===50)||(a[1]===50&&b[1]===0));assert.deepEqual([a[0],a[2],b[0],b[2]],[80,1.5,80,1.5]);partialY=[a[1]+(b[1]-a[1])*10/50,b[1]-(b[1]-a[1])*25/50].sort((a,b)=>a-b);f.report.observations.push({label:'native-start-end-offset-frame',a,b,expectedPartialY:partialY});
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([80,25,1.5]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await clickModelCommand(f.page,'Modify','Flange');const hud=f.page.getByRole('dialog',{name:'Flange',exact:true});near(Number(await hud.getByLabel('Bend radius (0: the sheet’s)',{exact:true}).inputValue()),0);await hud.getByLabel('Bend radius (0: the sheet’s)',{exact:true}).fill(String(ownRadius));
 if(partial){await hud.getByLabel('Offset at start',{exact:true}).fill('10');await hud.getByLabel('Offset at end',{exact:true}).fill('25');await hud.getByLabel('Relief',{exact:true}).selectOption('obround');await hud.getByLabel('Relief width (0: T, estimate)',{exact:true}).fill(String(reliefWidth));await hud.getByLabel('Relief depth (0: T, estimate)',{exact:true}).fill(String(reliefDepth));await hud.getByLabel('Length',{exact:true}).click();}
 await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();await f.snapshot('02-creation-preview');await button('Apply',hud).click();await f.changed(source);await f.ready();const doc=await f.doc();assert.equal(doc.nodes.length,3);assert.deepEqual(doc.nodes.slice(0,2),source.nodes);const node=doc.nodes[2];assert.equal(node.kind,'sheet-flange');if(own)assert.equal(node.bendRadius,2);else assert.equal(Object.hasOwn(node,'bendRadius'),false,'HUD zero preserves inherited radius by omission');assert.deepEqual(node.edges,edges[0].names);
 if(partial){assert.deepEqual(node.offsets,[10,25]);assert.deepEqual(node.relief,{kind:'obround',width:reliefWidth,depth:reliefDepth});}else{assert.equal(Object.hasOwn(node,'offsets'),false);assert.equal(Object.hasOwn(node,'relief'),false);}
 await geometry('03-created-native',doc);await history('04-history-open-close',doc);await f.undo();await f.same(source);await f.redo();await f.same(doc);await geometry('05-redo-native',doc);
 const saved=await f.save(own?'partial-flange-radius-source-own':'partial-flange-radius-source-inherited');await f.freshOpen(saved.file,saved.doc,'06-reopened');await f.same(doc);await geometry('07-reopened-native',doc);await history('08-reopened-history',doc);

 if(!baseline){
  const open=async()=>{await f.openFeatureEditor(2,'Flange');await button('Edit partial flange radius source',f.editor()).click();const hud=f.page.getByRole('dialog',{name:'Edit partial flange radius source',exact:true});await hud.waitFor();return hud;};
  const choice=hud=>hud.getByLabel('Radius source',{exact:true});
  const preview=async hud=>{await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();assert.equal(await button('Apply',hud).isEnabled(),true);};
  const initial=own?'own':'sheet',target=own?'sheet':'own';
  let hud=await open();assert.equal(await choice(hud).inputValue(),initial);await preview(hud);await button('Apply',hud).click();await hud.waitFor({state:'hidden'});await f.same(doc);await geometry('09-noop-native',doc);
  hud=await open();await choice(hud).selectOption(target);
  if(refusalCase){await hud.locator('.status').filter({hasText:/refused/i}).waitFor();assert.equal(await button('Apply',hud).isEnabled(),false);await f.same(doc);await f.snapshot('10-source-sheet-native-refused');await button('Cancel',hud).click();await hud.waitFor({state:'hidden'});await f.same(doc);await geometry('11-refusal-preserved-native',doc);f.report.observations.push({label:'source-native-refusal',status:'PASS',source:'own R2',requested:'sheet R19',continuation:'NOT_RUN after refusal'});await f.persist();return;}
  await preview(hud);await button('Cancel',hud).click();await hud.waitFor({state:'hidden'});await f.same(doc);await geometry('10-cancel-native',doc);
  hud=await open();await choice(hud).selectOption(target);await preview(hud);await f.snapshot('11-source-preview');await button('Apply',hud).click();await f.changed(doc);await f.ready();const accepted=await f.doc();const expected=structuredClone(doc);if(target==='sheet')delete expected.nodes[2].bendRadius;else expected.nodes[2].bendRadius=sheetRadius;assert.deepEqual(accepted,expected);await geometry('12-source-native',accepted);
  await f.undo();await f.same(doc);await geometry('13-undo-native',doc);await f.redo();await f.same(accepted);await geometry('14-redo-native',accepted);
  let saved=await f.save('partial-flange-source-switched');await f.freshOpen(saved.file,saved.doc,'15-switched-reopened');await f.same(accepted);await geometry('16-switched-reopened-native',accepted);
  hud=await open();assert.equal(await choice(hud).inputValue(),target);await choice(hud).selectOption(initial);await preview(hud);await button('Apply',hud).click();await f.changed(accepted);await f.ready();const reversed=await f.doc(),reverseExpected=structuredClone(accepted);if(initial==='sheet')delete reverseExpected.nodes[2].bendRadius;else reverseExpected.nodes[2].bendRadius=sheetRadius;assert.deepEqual(reversed,reverseExpected);await geometry('17-reverse-native',reversed);
  await f.undo();await f.same(accepted);await f.redo();await f.same(reversed);saved=await f.save('partial-flange-source-reversed');await f.freshOpen(saved.file,saved.doc,'18-reversed-reopened');await f.same(reversed);await geometry('19-reversed-reopened-native',reversed);await history('20-final-history',reversed);
  f.report.observations.push({label:'source-transitions',status:'PASS',initial,target,reverse:initial,sheetRadius,noOp:'accepted document unchanged',cancel:'accepted document unchanged',ownReset:'switch back to own uses current sheet rule, not the historical own override'});
 }
 await f.persist();
});
