import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline');
const shape=process.argv.includes('--round')?'round':'square';
const pins=['apps/cad-studio/test/sheet-relief-shape-history-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs','packages/barocss-cad-model/src/app/sheetCommands.ts','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','packages/barocss-cad/src/part/part-sheet.ts','apps/cad-studio/src/ui/HistoryFeatureEditor.tsx','apps/cad-studio/src/ui/NodeEditor.tsx'];
pins.push('packages/barocss-cad-model/src/app/sheetReliefCornerHistoryEdit.ts');
if(!baseline)pins.push('packages/barocss-cad-model/src/app/sheetReliefShapeHistoryEdit.ts','packages/barocss-cad-model/src/app/sheetReliefHistoryProof.ts');
const f=await createFlow({name:'sheet-relief-shape-history',output:process.argv[2],envFrozen:'SHEET_RELIEF_SHAPE_HISTORY_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:baseline?'Actual selected Square or Round relief creation, History Shape control observation, independent native corner cut and flat geometry, Undo/Redo and physical Save/Open.':'Actual shape-only History transitions, draft blocking, Cancel and same-value preservation, native corner/flat geometry, repeated Undo/Redo and Save/Open.',limits:['Synthetic plain sheet-base opened through Model file; relief itself created with actual pointer and command UI.',baseline?'Shape switching is NOT_RUN; --round exercises existing Round creation independently. Existing Edit relief corner is supported and is not the candidate gap.':'One terminal relief at [80,0], Size3 on a plain XY rectangular sheet. Other corners and adversarial ownership/native refusals are unit-tested only.','No downstream, manufacturing, automatic reference repair or new native capability claim.'],inspectorSource:`
import {readFileSync} from 'node:fs';
import {evaluateCadPart,massPropertiesOf,flatPatternOf,checkBrep,faceGeometry} from '@barocss/cad';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {bodyMesh} from '@barocss/cad-model/engine/mesh';
const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));
console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({id:o.id,count:o.bodyCount,check:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o),sheet:o.sheet,flat:flatPatternOf(o),vertices:o.brep.vertices.map(v=>v.point),cylinders:o.brep.faces.map(face=>faceGeometry(face)).filter(g=>g.kind==='cylinder'),edges:bodyMesh(o.brep,0).edges.map(e=>({names:e.names,a:e.a,b:e.b,straight:e.straight}))}))));
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]},{id:'n1',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const near=(a,b,t=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} != ${b}`);
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const polygon=[[0,0],[77,0],[77,3],[80,3],[80,50],[0,50]];
function bijection(actual,expected){assert.equal(actual.length,expected.length);const unused=new Set(actual.map((_,i)=>i));for(const p of expected){const matches=[...unused].filter(i=>p.every((v,j)=>Math.abs(v-actual[i][j])<=1e-8));assert.equal(matches.length,1,JSON.stringify({p,actual}));unused.delete(matches[0]);}}
async function geometry(label,doc,corner=[80,0],shapeOverride=shape){
 const shape=shapeOverride;
 const [cx,cy]=corner;const transform=([x,y])=>[cx===0?80-x:x,cy===50?50-y:y];const boundary=polygon.map(transform);const inset=shape==='round'?4/Math.PI:1.5;const removed=shape==='round'?9*Math.PI/4:9;const cutCenter=[cx===0?inset:80-inset,cy===50?50-inset:inset];
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.equal(n.count,1);assert.ok(n.check.valid,JSON.stringify(n.check.issues));const area=4000-removed;near(n.mass.volume,area*1.5,1e-7);near(n.mass.centroid[0],(4000*40-removed*cutCenter[0])/area);near(n.mass.centroid[1],(4000*25-removed*cutCenter[1])/area);near(n.mass.centroid[2],.75);
 if(shape==='square')bijection(n.vertices,boundary.flatMap(([x,y])=>[[x,y,0],[x,y,1.5]]));
 assert.equal(n.sheet.thickness,1.5);assert.equal(n.sheet.bendRadius,1.5);assert.equal(n.sheet.kFactor,.44);assert.equal(n.sheet.bends.length,0);assert.equal(n.flat.bends.length,0);assert.equal(n.flat.loops.length,1);const loop=n.flat.loops[0];assert.equal(loop.outer,true);near(Math.abs(loop.area),area,1e-7);let lengths;
 if(shape==='square'){assert.equal(loop.segments.length,6);assert.ok(loop.segments.every(s=>s.kind==='line'));
 // Flat coordinates may have a different origin/orientation. Check the entire notch
 // boundary through its six exact segment lengths and signed shoelace area.
 lengths=loop.segments.map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])).sort((a,b)=>a-b);[3,3,47,50,77,80].forEach((v,i)=>near(lengths[i],v));near(Math.abs(loop.segments.reduce((a,s)=>a+s.a[0]*s.b[1]-s.b[0]*s.a[1],0))/2,area);
 }else{
  const arcs=loop.segments.filter(s=>s.kind==='arc'),lines=loop.segments.filter(s=>s.kind==='line');assert.equal(arcs.length,1);assert.equal(lines.length,4);assert.equal(loop.segments.length,5);
  const arc=arcs[0];near(arc.radius,3);const u=arc.start.map((v,i)=>v-arc.center[i]),v=arc.end.map((n,i)=>n-arc.center[i]);near(Math.hypot(...u),3);near(Math.hypot(...v),3);near(u[0]*v[0]+u[1]*v[1],0);assert.equal(arc.ccw,false,'Outer notch is concave');let sweep=Math.atan2(v[1],v[0])-Math.atan2(u[1],u[0]);if(arc.ccw){while(sweep<=0)sweep+=2*Math.PI;}else{while(sweep>=0)sweep-=2*Math.PI;}near(sweep,-Math.PI/2);
  lengths=lines.map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])).sort((a,b)=>a-b);[47,50,77,80].forEach((v,i)=>near(lengths[i],v));near(lengths.reduce((a,b)=>a+b,0)+3*Math.PI/2,260-6+3*Math.PI/2);
  const essential=[[0,0],[77,0],[80,3],[80,50],[0,50]].map(transform).flatMap(([x,y])=>[[x,y,0],[x,y,1.5]]);
  for(const p of essential)assert.ok(n.vertices.some(q=>p.every((v,i)=>Math.abs(v-q[i])<=1e-8)),`Missing boundary endpoint ${p}`);
  for(const p of n.vertices){assert.ok(Math.abs(p[2])<=1e-8||Math.abs(p[2]-1.5)<=1e-8);assert.ok(essential.some(q=>p.every((v,i)=>Math.abs(v-q[i])<=1e-8))||Math.abs(Math.hypot(p[0]-cx,p[1]-cy)-3)<=1e-8&&p[0]>=77-1e-8&&p[0]<=80+1e-8&&p[1]>=-1e-8&&p[1]<=3+1e-8);}
  assert.ok(n.cylinders.length>0);for(const g of n.cylinders){near(g.r,3);near(g.c[0],cx);near(g.c[1],cy);near(Math.abs(g.a[2]),1);near(g.a[0],0);near(g.a[1],0);}
 }
 const visible=(await f.bodies()).bodies;assert.equal(visible.length,1);near(visible[0].volume,area*1.5,1e-7);
 f.report.observations.push({label,volume:n.mass.volume,centroid:n.mass.centroid,flatLengths:lengths,cutCorner:corner,cutSize:3,shape});return n;
}
async function history(label,doc){
 await f.openFeatureEditor(2,'Corner relief');const fields=await f.editorFields();assert.equal(Number(await f.editor().getByLabel('Size',{exact:true}).inputValue()),3);
 const choices=await f.editor().getByRole('combobox').evaluateAll(els=>els.map(e=>({label:e.getAttribute('aria-label'),value:e.value,options:[...e.options].map(o=>({value:o.value,text:o.textContent}))})));const buttons=await f.editor().getByRole('button').allTextContents();
 assert.equal(await button('Edit relief corner',f.editor()).count(),1,'Existing corner reassignment must not be reported as missing');
 if(!baseline)assert.equal(await button('Edit relief shape',f.editor()).count(),1);
 const shapeChoices=choices.filter(x=>/shape/i.test(x.label??'')||x.options.some(o=>o.value==='square')&&x.options.some(o=>o.value==='round'));
 f.report.observations.push({label,fields,choices,buttons,shapeEditOffered:shapeChoices.length>0||buttons.some(text=>/relief shape/i.test(text)),existingCornerEdit:true,savedShape:doc.nodes[2].shape});await f.snapshot(label);await f.closeEditor();await f.same(doc);
}
await f.run(async()=>{
 await f.newPage();await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'plain-sheet.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(source))});await f.same(source);
 const [native]=await f.inspect('01-sheet-source',source);assert.equal(native.count,1);assert.ok(native.check.valid);near(native.mass.volume,6000,1e-7);
 const corners=native.edges.filter(e=>e.straight&&e.a[0]===e.b[0]&&e.a[1]===e.b[1]&&Math.abs(e.a[2]-e.b[2])===1.5);assert.equal(corners.length,4);bijection(corners.map(e=>[e.a[0],e.a[1],(e.a[2]+e.b[2])/2]),[[0,0,.75],[80,0,.75],[80,50,.75],[0,50,.75]]);assert.equal(new Set(corners.flatMap(e=>e.names)).size,4);for(const e of corners)assert.equal(e.names.length,1);
 const selected=corners.find(e=>e.a[0]===80&&e.a[1]===0);assert.ok(selected);f.report.observations.push({label:'source-corner-signatures',corners:corners.map(e=>({name:e.names[0],kind:'line',at:[e.a[0],e.a[1],.75],size:1.5,dir:[0,0,Math.sign(e.b[2]-e.a[2])]}))});
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();await f.worldClick([80,0,.75]);await f.page.waitForFunction(()=>window.__studioSelection?.selection.edges.length===1);
 await clickModelCommand(f.page,'Modify','Corner relief');const hud=f.page.getByRole('dialog',{name:'Corner relief',exact:true});await hud.getByLabel('Shape',{exact:true}).selectOption(shape);await hud.getByLabel('Size (default R + T)',{exact:true}).fill('3');await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();assert.match(await hud.innerText(),new RegExp(selected.names[0].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));await button('Apply',hud).click();await f.changed(source);await f.ready();const doc=await f.doc();assert.equal(doc.nodes.length,3);assert.deepEqual(doc.nodes.slice(0,2),source.nodes);const relief=doc.nodes[2];assert.equal(relief.kind,'sheet-corner-relief');assert.deepEqual(relief.edges,selected.names);assert.equal(relief.shape,shape);assert.equal(relief.size,3);assert.deepEqual(relief.parent,{node:1,side:'solid'});assert.ok(relief.sigs?.[selected.names[0]],'Created edge signature must be saved');
 await geometry('02-created-native',doc);await history('03-history-shape',doc);await f.undo();await f.same(source);await f.redo();await f.same(doc);await geometry('04-redo-native',doc);const saved=await f.save(`relief-shape-${shape}`);await f.freshOpen(saved.file,saved.doc,'05-reopened');await f.same(doc);await geometry('06-reopened-native',doc);await history('07-reopened-history',doc);
if(!baseline){
 let accepted=doc;
 const opposite=value=>value==='square'?'round':'square';
 const openShape=async()=>{await f.openFeatureEditor(2,'Corner relief');await button('Edit relief shape',f.editor()).click();const hud=f.page.getByRole('dialog',{name:'Edit relief shape',exact:true});await hud.waitFor();assert.equal(await hud.getByLabel('Shape',{exact:true}).inputValue(),accepted.nodes[2].shape);return hud;};
 const preview=async(hud,value)=>{await hud.getByLabel('Shape',{exact:true}).selectOption(value);await hud.locator('.status').filter({hasText:/^preview$/}).waitFor();};
 const historyRows=()=>f.page.locator('.history .hs').evaluateAll(es=>es.map(e=>e.getAttribute('aria-label')));
 // Existing uncommitted Size edits cannot be silently discarded by the saved command.
 await f.openFeatureEditor(2,'Corner relief');await f.editor().getByLabel('Size',{exact:true}).fill('4');assert.equal(await button('Edit relief shape',f.editor()).isDisabled(),true);await f.snapshot('09-size-draft-disabled');await f.same(accepted);await f.closeEditor();await geometry('10-size-cancel-native',accepted,[80,0],accepted.nodes[2].shape);
 let edit=await openShape();await preview(edit,opposite(accepted.nodes[2].shape));await f.snapshot('11-shape-cancel-preview');await button('Cancel',edit).click();await edit.waitFor({state:'hidden'});await f.same(accepted);await geometry('12-shape-cancel-native',accepted,[80,0],accepted.nodes[2].shape);
 const beforeHistory=await historyRows();edit=await openShape();await preview(edit,accepted.nodes[2].shape);await button('Apply',edit).click();await edit.waitFor({state:'hidden'});await f.same(accepted);assert.deepEqual(await historyRows(),beforeHistory);await geometry('13-unchanged-selection-native',accepted,[80,0],accepted.nodes[2].shape);
 for(const [i,value] of [opposite(shape),shape,opposite(shape),shape].entries()){
  const before=accepted,expected={...before,nodes:before.nodes.map((n,j)=>j===2?{...n,shape:value}:n)};edit=await openShape();await preview(edit,value);await f.snapshot(`14-${i}-shape-preview`);await button('Apply',edit).click();await edit.waitFor({state:'hidden'});await f.changed(before);await f.same(expected);accepted=await f.doc();
  assert.deepEqual(accepted,expected);await geometry(`15-${i}-changed-native`,accepted,[80,0],value);await f.undo();await f.same(before);await geometry(`16-${i}-undo-native`,before,[80,0],before.nodes[2].shape);await f.redo();await f.same(accepted);await geometry(`17-${i}-redo-native`,accepted,[80,0],value);
  const saved=await f.save(`relief-shape-${i}-${value}`);await f.freshOpen(saved.file,saved.doc,`18-${i}-reopened`);await f.same(accepted);await geometry(`19-${i}-reopened-native`,accepted,[80,0],value);await history(`20-${i}-reopened-history`,accepted);
 }
 assert.deepEqual(accepted,doc);
}
await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('08-final');
});
