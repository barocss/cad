import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline');
const pins=['apps/cad-studio/test/sheet-relief-corner-history-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs','packages/barocss-cad-model/src/app/sheetCommands.ts','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','packages/barocss-cad/src/part/part-sheet.ts','apps/cad-studio/src/ui/HistoryFeatureEditor.tsx','apps/cad-studio/src/ui/NodeEditor.tsx'];
if(!baseline)pins.push('packages/barocss-cad-model/src/app/sheetReliefCornerHistoryEdit.ts');
const f=await createFlow({name:'sheet-relief-corner-history',output:process.argv[2],envFrozen:'SHEET_RELIEF_CORNER_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Actual corner-edge pick and Square relief creation, History location-edit observation, native cut location and flat boundary, Undo/Redo and physical Save/Open.':'Actual saved corner reassignment across four corners, native cut location and flat boundary, repeated Undo/Redo, Cancel and physical Save/Open.',limits:['Synthetic plain sheet-base opened through Model file; relief itself created with actual pointer and command UI.',baseline?'Single terminal square relief only. No downstream, manufacturing, automatic reference repair or new corner replacement claim.':'Actual browser covers square relief on one XY rectangular base. Round and invalid owner/reference boundaries are unit-tested only; downstream, manufacturing and automatic reference repair remain unsupported.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {evaluateCadPart,massPropertiesOf,flatPatternOf,checkBrep} from '@barocss/cad';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {bodyMesh} from '@barocss/cad-model/engine/mesh';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({id:o.id,count:o.bodyCount,check:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o),sheet:o.sheet,flat:flatPatternOf(o),vertices:o.brep.vertices.map(v=>v.point),edges:bodyMesh(o.brep,0).edges.map(e=>({names:e.names,a:e.a,b:e.b,straight:e.straight}))}))));
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]},{id:'n1',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const near=(a,b,t=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} != ${b}`);
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const polygon=[[0,0],[77,0],[77,3],[80,3],[80,50],[0,50]];
function bijection(actual,expected){assert.equal(actual.length,expected.length);const unused=new Set(actual.map((_,i)=>i));for(const p of expected){const matches=[...unused].filter(i=>p.every((v,j)=>Math.abs(v-actual[i][j])<=1e-8));assert.equal(matches.length,1,JSON.stringify({p,actual}));unused.delete(matches[0]);}}
async function geometry(label,doc,corner=[80,0]){
 const [cx,cy]=corner;const transform=([x,y])=>[cx===0?80-x:x,cy===50?50-y:y];const boundary=polygon.map(transform);const cutCenter=[cx===0?1.5:78.5,cy===50?48.5:1.5];
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.equal(n.count,1);assert.ok(n.check.valid,JSON.stringify(n.check.issues));const area=4000-9;near(n.mass.volume,area*1.5,1e-7);near(n.mass.centroid[0],(4000*40-9*cutCenter[0])/area);near(n.mass.centroid[1],(4000*25-9*cutCenter[1])/area);near(n.mass.centroid[2],.75);
 bijection(n.vertices,boundary.flatMap(([x,y])=>[[x,y,0],[x,y,1.5]]));
 assert.equal(n.sheet.thickness,1.5);assert.equal(n.sheet.bendRadius,1.5);assert.equal(n.sheet.kFactor,.44);assert.equal(n.sheet.bends.length,0);assert.equal(n.flat.bends.length,0);assert.equal(n.flat.loops.length,1);const loop=n.flat.loops[0];assert.equal(loop.outer,true);assert.equal(loop.segments.length,6);assert.ok(loop.segments.every(s=>s.kind==='line'));
 // Flat coordinates may have a different origin/orientation. Check the entire notch
 // boundary through its six exact segment lengths and signed shoelace area.
 const lengths=loop.segments.map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])).sort((a,b)=>a-b);[3,3,47,50,77,80].forEach((v,i)=>near(lengths[i],v));near(Math.abs(loop.segments.reduce((a,s)=>a+s.a[0]*s.b[1]-s.b[0]*s.a[1],0))/2,area);
 const visible=(await f.bodies()).bodies;assert.equal(visible.length,1);near(visible[0].volume,area*1.5,1e-7);
 f.report.observations.push({label,volume:n.mass.volume,centroid:n.mass.centroid,flatLengths:lengths,cutCorner:corner,cutSize:3});return n;
}
async function history(label,doc){
 await f.openFeatureEditor(2,'Corner relief');const fields=await f.editorFields();assert.equal(Number(await f.editor().getByLabel('Size',{exact:true}).inputValue()),3);const choices=await f.editor().getByRole('combobox').evaluateAll(els=>els.map(e=>({label:e.getAttribute('aria-label'),options:[...e.options].map(o=>o.textContent)})));const buttons=await f.editor().getByRole('button').allTextContents();const offered=buttons.filter(s=>/edit.*corner|replace.*edge|change.*corner/i.test(s));assert.equal(offered.length,baseline?0:1);assert.equal(choices.filter(x=>/corner|location/i.test(x.label??'')).length,0);f.report.observations.push({label,fields,choices,buttons,locationEditOffered:offered.length>0});await f.snapshot(label);await f.closeEditor();await f.same(doc);
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'plain-sheet.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
 const [native]=await f.inspect('01-sheet-source',source);assert.equal(native.count,1);assert.ok(native.check.valid);near(native.mass.volume,6000,1e-7);
 const corners=native.edges.filter(e=>e.straight&&e.a[0]===e.b[0]&&e.a[1]===e.b[1]&&Math.abs(e.a[2]-e.b[2])===1.5);assert.equal(corners.length,4);bijection(corners.map(e=>[e.a[0],e.a[1],(e.a[2]+e.b[2])/2]),[[0,0,.75],[80,0,.75],[80,50,.75],[0,50,.75]]);assert.equal(new Set(corners.flatMap(e=>e.names)).size,4);for(const e of corners)assert.equal(e.names.length,1);
 const selected=corners.find(e=>e.a[0]===80&&e.a[1]===0);assert.ok(selected);f.report.observations.push({label:'source-corner-signatures',corners:corners.map(e=>({name:e.names[0],kind:'line',at:[e.a[0],e.a[1],.75],size:1.5,dir:[0,0,Math.sign(e.b[2]-e.a[2])]}))});
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([80,0,.75]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await clickModelCommand(f.page,'Modify','Corner relief');const hud=f.page.getByRole('dialog',{name:'Corner relief',exact:true});await hud.getByLabel('Shape',{exact:true}).selectOption('square');await hud.getByLabel('Size (default R + T)',{exact:true}).fill('3');await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();assert.match(await hud.innerText(),new RegExp(selected.names[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));await button('Apply',hud).click();await f.changed(source);await f.ready();const doc=await f.doc();assert.equal(doc.nodes.length,3);assert.deepEqual(doc.nodes.slice(0,2),source.nodes);const relief=doc.nodes[2];assert.equal(relief.kind,'sheet-corner-relief');assert.deepEqual(relief.edges,selected.names);assert.equal(relief.shape,'square');assert.equal(relief.size,3);assert.deepEqual(relief.parent,{node:1,side:'solid'});assert.ok(relief.sigs?.[selected.names[0]],'Created edge signature must be saved');
 await geometry('02-created-native',doc);await history('03-history-location',doc);await f.undo();await f.same(source);await f.redo();await f.same(doc);await geometry('04-redo-native',doc);const saved=await f.save('corner-relief-source');await f.freshOpen(saved.file,saved.doc,'05-reopened');await f.same(doc);await geometry('06-reopened-native',doc);await history('07-reopened-history',doc);
 if(!baseline){
  let accepted=doc;
  const openCorner=async()=>{await f.openFeatureEditor(2,'Corner relief');await button('Edit relief corner',f.editor()).click();return f.page.getByRole('dialog',{name:'Edit relief corner',exact:true});};
  const select=async(hud,edge)=>{await hud.getByLabel('Corner',{exact:true}).selectOption(edge);await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();};
  for(const [i,corner] of [[0,0],[0,50],[80,50]].entries()){
   const edge=corners.find(e=>e.a[0]===corner[0]&&e.a[1]===corner[1]).names[0];const before=accepted;const hud=await openCorner();await select(hud,edge);assert.match(await hud.innerText(),/Thickness 1.5 mm/);assert.match(await hud.innerText(),/flat pattern is preserved/);await f.snapshot(`09-${i}-corner-preview`);await button('Apply',hud).click();await f.changed(before);await f.ready();accepted=await f.doc();
   assert.deepEqual(accepted.nodes.slice(0,2),doc.nodes.slice(0,2));const node=accepted.nodes[2];assert.deepEqual({...node,edges:[],sigs:{}},{...doc.nodes[2],edges:[],sigs:{}});assert.deepEqual(node.edges,[edge]);assert.deepEqual(Object.keys(node.sigs),[edge]);assert.deepEqual(node.sigs[edge].p,[...corner,.75]);
   await geometry(`10-${i}-changed`,accepted,corner);await f.undo();await f.same(before);await f.redo();await f.same(accepted);await geometry(`11-${i}-redo`,accepted,corner);const saved=await f.save(`corner-${i}`);await f.freshOpen(saved.file,saved.doc,`12-${i}-reopened`);await f.same(accepted);await geometry(`13-${i}-reopened-native`,accepted,corner);
  }
  const hud=await openCorner();await select(hud,selected.names[0]);await button('Cancel',hud).click();await f.same(accepted);await geometry('14-cancel-preserved',accepted,[80,50]);
  await f.openFeatureEditor(2,'Corner relief');await f.snapshot('15-corner-history');await f.closeEditor();
 }
await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('08-final');
});
