import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {createFlow} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const baseline=process.argv.includes('--baseline');
const shape='square';
const pins=['apps/cad-studio/test/sheet-relief-source-thickness-browser.mjs','apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/model-rail-helper.mjs','packages/barocss-cad-model/src/app/sheetCommands.ts','packages/barocss-cad-model/src/app/editFields.ts','packages/barocss-cad-model/src/engine/part.ts','packages/barocss-cad/src/part/part-sheet.ts','apps/cad-studio/src/ui/HistoryFeatureEditor.tsx','apps/cad-studio/src/ui/NodeEditor.tsx'];
pins.push('packages/barocss-cad-model/src/app/sheetReliefCornerHistoryEdit.ts');
pins.push('packages/barocss-cad-model/src/app/sheetReliefShapeHistoryEdit.ts','packages/barocss-cad-model/src/app/sheetReliefHistoryProof.ts');
pins.push('packages/barocss-cad-model/src/engine/references.ts','packages/barocss-cad-model/src/engine/rematch.ts','apps/cad-studio/src/App.tsx');
pins.push('apps/cad-studio/src/state/historyFeatureApply.ts','apps/cad-studio/src/state/rectangleFinishResize.ts');
if(!baseline)pins.push('apps/cad-studio/src/state/sheetReliefThicknessHistory.ts');
const f=await createFlow({name:'sheet-relief-source-thickness',output:process.argv[2],envFrozen:'SHEET_RELIEF_SOURCE_THICKNESS_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,qualification:'Observe source Thickness editing after actual signed Square relief creation, then saved Round-shape capability. Lifecycle PASS is not a claim of automatic signature repair.',limits:['Actual Corner relief creation on a synthetic plain sheet opened through file UI. Thickness3 accepted/refused and subsequent Round preview are observations, not assumed support.','Only 80x50 XY sheet, one Size3 relief at [80,0]. No downstream/manufacturing/general reference-rematching expansion.','Later stages remain NOT_RUN if an earlier stage fails; observations report absent/disabled/refused Round capability separately.'],inspectorSource:`
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

console.log(JSON.stringify(evaluateCadPart(toPartDocument(doc)).outputs.map(o=>({id:o.id,count:o.bodyCount,check:checkBrep(o.brep,{strict:true}),mass:massPropertiesOf(o),sheet:o.sheet,flat:flatPatternOf(o),vertices:o.brep.vertices.map(v=>v.point),cylinders:o.brep.faces.map(face=>faceGeometry(face)).filter(g=>g.kind==='cylinder'),edges:bodyMesh(o.brep,0).edges.map(e=>({names:e.names,a:e.a,b:e.b,straight:e.straight}))}))));
`});
const source={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]},{id:'n1',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
const near=(a,b,t=1e-8)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${a} != ${b}`);
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const polygon=[[0,0],[77,0],[77,3],[80,3],[80,50],[0,50]];
function bijection(actual,expected){assert.equal(actual.length,expected.length);const unused=new Set(actual.map((_,i)=>i));for(const p of expected){const matches=[...unused].filter(i=>p.every((v,j)=>Math.abs(v-actual[i][j])<=1e-8));assert.equal(matches.length,1,JSON.stringify({p,actual}));unused.delete(matches[0]);}}
async function geometry(label,doc,corner=[80,0],shapeOverride=shape,thickness=1.5){
 const shape=shapeOverride;
 const [cx,cy]=corner;const transform=([x,y])=>[cx===0?80-x:x,cy===50?50-y:y];const boundary=polygon.map(transform);const inset=shape==='round'?4/Math.PI:1.5;const removed=shape==='round'?9*Math.PI/4:9;const cutCenter=[cx===0?inset:80-inset,cy===50?50-inset:inset];
 const rows=await f.inspect(label,doc);assert.equal(rows.length,1);const n=rows[0];assert.equal(n.count,1);assert.ok(n.check.valid,JSON.stringify(n.check.issues));const area=4000-removed;near(n.mass.volume,area*thickness,1e-7);near(n.mass.centroid[0],(4000*40-removed*cutCenter[0])/area);near(n.mass.centroid[1],(4000*25-removed*cutCenter[1])/area);near(n.mass.centroid[2],thickness/2);
 if(shape==='square')bijection(n.vertices,boundary.flatMap(([x,y])=>[[x,y,0],[x,y,thickness]]));
 assert.equal(n.sheet.thickness,thickness);assert.equal(n.sheet.bendRadius,1.5);assert.equal(n.sheet.kFactor,.44);assert.equal(n.sheet.bends.length,0);assert.equal(n.flat.bends.length,0);assert.equal(n.flat.loops.length,1);const loop=n.flat.loops[0];assert.equal(loop.outer,true);near(Math.abs(loop.area),area,1e-7);let lengths;
 if(shape==='square'){assert.equal(loop.segments.length,6);assert.ok(loop.segments.every(s=>s.kind==='line'));
 // Flat coordinates may have a different origin/orientation. Check the entire notch
 // boundary through its six exact segment lengths and signed shoelace area.
 lengths=loop.segments.map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])).sort((a,b)=>a-b);[3,3,47,50,77,80].forEach((v,i)=>near(lengths[i],v));near(Math.abs(loop.segments.reduce((a,s)=>a+s.a[0]*s.b[1]-s.b[0]*s.a[1],0))/2,area);
 }else{
  const arcs=loop.segments.filter(s=>s.kind==='arc'),lines=loop.segments.filter(s=>s.kind==='line');assert.equal(arcs.length,1);assert.equal(lines.length,4);assert.equal(loop.segments.length,5);
  const arc=arcs[0];near(arc.radius,3);const u=arc.start.map((v,i)=>v-arc.center[i]),v=arc.end.map((n,i)=>n-arc.center[i]);near(Math.hypot(...u),3);near(Math.hypot(...v),3);near(u[0]*v[0]+u[1]*v[1],0);assert.equal(arc.ccw,false,'Outer notch is concave');let sweep=Math.atan2(v[1],v[0])-Math.atan2(u[1],u[0]);if(arc.ccw){while(sweep<=0)sweep+=2*Math.PI;}else{while(sweep>=0)sweep-=2*Math.PI;}near(sweep,-Math.PI/2);
  lengths=lines.map(s=>Math.hypot(s.b[0]-s.a[0],s.b[1]-s.a[1])).sort((a,b)=>a-b);[47,50,77,80].forEach((v,i)=>near(lengths[i],v));near(lengths.reduce((a,b)=>a+b,0)+3*Math.PI/2,260-6+3*Math.PI/2);
  const essential=[[0,0],[77,0],[80,3],[80,50],[0,50]].map(transform).flatMap(([x,y])=>[[x,y,0],[x,y,thickness]]);
  for(const p of essential)assert.ok(n.vertices.some(q=>p.every((v,i)=>Math.abs(v-q[i])<=1e-8)),`Missing boundary endpoint ${p}`);
  for(const p of n.vertices){assert.ok(Math.abs(p[2])<=1e-8||Math.abs(p[2]-thickness)<=1e-8);assert.ok(essential.some(q=>p.every((v,i)=>Math.abs(v-q[i])<=1e-8))||Math.abs(Math.hypot(p[0]-cx,p[1]-cy)-3)<=1e-8&&p[0]>=77-1e-8&&p[0]<=80+1e-8&&p[1]>=-1e-8&&p[1]<=3+1e-8);}
  assert.ok(n.cylinders.length>0);for(const g of n.cylinders){near(g.r,3);near(g.c[0],cx);near(g.c[1],cy);near(Math.abs(g.a[2]),1);near(g.a[0],0);near(g.a[1],0);}
 }
 const visible=(await f.bodies()).bodies;assert.equal(visible.length,1);near(visible[0].volume,area*thickness,1e-7);
 f.report.observations.push({label,volume:n.mass.volume,centroid:n.mass.centroid,flatLengths:lengths,cutCorner:corner,cutSize:3,shape});return n;
}
async function signatures(label,doc,t){
 const proof=await f.inspect(label,doc,'parent');assert.equal(proof.check.valid,true);near(proof.mass.volume,4000*t,1e-7);
 assert.deepEqual(doc.nodes[2].sigs,proof.sigs,'Stored relief signature must match independently evaluated parent edge');
 const values=Object.values(proof.sigs);assert.equal(values.length,1);const sig=values[0];
 assert.equal(sig.k,'line');assert.deepEqual(sig.p,[80,0,t/2]);near(sig.s,t);near(Math.abs(sig.d[2]),1);near(sig.d[0],0);near(sig.d[1],0);
 f.report.observations.push({label,parentSignature:proof.sigs,thickness:t});await f.persist();
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
 f.phase='source Thickness 1.5 to 3, observe without assuming support';
 f.report.observations.push({label:'stage-plan',thickness:'STARTED',round:'NOT_RUN'});await f.persist();
 await f.openFeatureEditor(1,'Sheet base');await f.dismissToasts();
 const thicknessField=f.editor().getByRole('spinbutton',{name:'Thickness',exact:true});
 assert.equal(Number(await thicknessField.inputValue()),1.5);
 const before=await f.snapshot('09-before-thickness');
 const undoBefore=await button('Undo').isEnabled();
 await thicknessField.fill('3');await f.same(doc);await f.snapshot('10-thickness-draft');
 await button('Apply',f.editor()).click();
 await f.page.waitForFunction(original=>JSON.stringify(window.__studioDoc)!==original||!!document.querySelector('.node-editor .hud-error')?.textContent?.trim()||document.querySelectorAll('.toast').length>0,JSON.stringify(doc),{timeout:60000});
 await f.ready();const outcome=await f.snapshot('11-thickness-outcome'),current=await f.doc();
 const accepted=JSON.stringify(current)!==JSON.stringify(doc);
 f.report.observations.push({label:'thickness-result',accepted,originalSignature:doc.nodes[2].sigs,currentSignature:current.nodes[2].sigs,notices:outcome.notices,editorError:await f.editor().locator('.hud-error').allTextContents()});await f.persist();
 if(accepted){
  const expected={...doc,nodes:doc.nodes.map((n,i)=>i===1?{...n,thickness:3}:n)};
  // Signature changes are recorded, not assumed; all other authored data must remain exact.
  const stripSigs=d=>({...d,nodes:d.nodes.map((n,i)=>{if(i!==2)return n;const {sigs,...rest}=n;void sigs;return rest;})});
  assert.deepEqual(stripSigs(current),stripSigs(expected));
 }else{
  assert.deepEqual(current,doc);assert.deepEqual(outcome.history,before.history);assert.equal(await button('Undo').isEnabled(),undoBefore);
  assert.ok(outcome.notices.length||(await f.editor().locator('.hud-error').allTextContents()).some(x=>x.trim()));
 }
 if(!baseline){assert.equal(accepted,true,'Fixed mode requires Thickness3 acceptance');assert.notDeepEqual(current.nodes[2].sigs,doc.nodes[2].sigs);await signatures('11-fixed-parent-signatures',current,3);}
 await f.closeEditor();await f.same(current);
 const t=accepted?3:1.5;await geometry('12-thickness-native',current,[80,0],'square',t);
 if(accepted){await f.undo();await f.same(doc);await geometry('13-thickness-undo',doc);await f.redo();await f.same(current);await geometry('14-thickness-redo',current,[80,0],'square',3);}
 const thicknessSaved=await f.save('relief-source-thickness-observed');
 await f.newPage();await f.openFile(thicknessSaved.file,current.nodes.length);
 const reopened=await f.doc();await f.snapshot('15-thickness-reopened');
 const reopenPreserved=isDeepStrictEqual(reopened,current);
 f.report.observations.push({label:'thickness-reopen-reference-observation',preserved:reopenPreserved,originalDoc:doc,acceptedDoc:current,reopenedDoc:reopened,originalSignature:doc.nodes[2].sigs,acceptedSignature:current.nodes[2].sigs,reopenedSignature:reopened.nodes[2]?.sigs});await f.persist();
 if(!baseline)assert.equal(reopenPreserved,true,'Fixed mode requires exact saved document preservation');
 if(!reopenPreserved){
  f.report.observations.push({label:'round-after-thickness',status:'NOT_RUN',reason:'Actual saved Open changed the accepted document/reference state; this is an observed lifecycle discrepancy, not assumed fixture error.'});await f.persist();
  await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('16-reopened-reference-discrepancy');return;
 }
 await geometry('16-thickness-reopened-native',reopened,[80,0],'square',t);
 if(accepted){
  await f.openFeatureEditor(2,'Corner relief');const editButton=button('Edit relief shape',f.editor());
  const offered=await editButton.count()===1,enabled=offered&&await editButton.isEnabled();
  f.report.observations.push({label:'round-capability-after-thickness',offered,enabled});await f.snapshot('17-round-capability');await f.persist();
  if(!baseline)assert.equal(enabled,true,'Fixed mode requires saved Shape command');
  if(enabled){
   const stable=await f.snapshot('18-before-round');await editButton.click();
   const edit=f.page.getByRole('dialog',{name:'Edit relief shape',exact:true});await edit.waitFor();
   await edit.getByLabel('Shape',{exact:true}).selectOption('round');
   await edit.locator('.status').filter({hasText:/^(preview|refused)$/}).waitFor();
   const status=(await edit.locator('.status').innerText()).trim();await f.snapshot('19-round-preview-result');
   f.report.observations.push({label:'round-preview-after-thickness',status,text:await edit.innerText()});await f.persist();
   if(!baseline)assert.equal(status,'preview','Refusal is not a fixed-mode success');
   if(status==='refused'){
    assert.equal(await button('Apply',edit).isDisabled(),true);assert.deepEqual(await f.doc(),current);
    const refused=await f.snapshot('20-round-refused');assert.deepEqual(refused.history,stable.history);
    await button('Cancel',edit).click();await edit.waitFor({state:'hidden'});await f.same(current);await geometry('21-round-cancel-native',current,[80,0],'square',3);
   }else{
    await button('Apply',edit).click();await edit.waitFor({state:'hidden'});await f.changed(current);
    const round=await f.doc();assert.deepEqual(round,{...current,nodes:current.nodes.map((n,i)=>i===2?{...n,shape:'round'}:n)});
    await geometry('20-round-native',round,[80,0],'round',3);await f.undo();await f.same(current);await geometry('21-round-undo-native',current,[80,0],'square',3);await f.redo();await f.same(round);await geometry('22-round-redo-native',round,[80,0],'round',3);
   }
  }else await f.closeEditor();
  const final=await f.doc(),saved=await f.save('relief-after-thickness-shape-observed');await f.freshOpen(saved.file,saved.doc,'23-final-reopened');await f.same(final);await geometry('24-final-native',final,[80,0],final.nodes[2].shape,3);
 }else {f.report.observations.push({label:'round-after-thickness',status:'NOT_RUN',reason:'Thickness3 was refused; original signed Square remains preserved.'});await f.persist();}

 if(!baseline){
  const round=await f.doc();assert.equal(round.nodes[2].shape,'round');await signatures('26-round-parent-signatures',round,3);
  await f.openFeatureEditor(1,'Sheet base');await f.editor().getByRole('spinbutton',{name:'Thickness',exact:true}).fill('1.5');
  const changed=await f.applyEditor(round,'27-restored-thickness'),thin=changed.doc;
  const expected={...round,nodes:round.nodes.map((n,i)=>i===1?{...n,thickness:1.5}:i===2?{...n,sigs:doc.nodes[2].sigs}:n)};
  assert.deepEqual(thin,expected);await signatures('28-thin-parent-signatures',thin,1.5);await geometry('29-thin-round-native',thin,[80,0],'round',1.5);
  await f.undo();await f.same(round);await f.redo();await f.same(thin);
  const saved=await f.save('thin-round-refreshed');await f.freshOpen(saved.file,saved.doc,'30-thin-round-reopened');await signatures('31-thin-reopened-signatures',thin,1.5);await geometry('32-thin-round-reopened-native',thin,[80,0],'round',1.5);
  await f.openFeatureEditor(2,'Corner relief');await button('Edit relief shape',f.editor()).click();
  const edit=f.page.getByRole('dialog',{name:'Edit relief shape',exact:true});await edit.waitFor();await edit.getByLabel('Shape',{exact:true}).selectOption('square');
  await edit.locator('.status').filter({hasText:/^(preview|refused)$/}).waitFor();assert.equal((await edit.locator('.status').innerText()).trim(),'preview');await f.snapshot('33-return-square-preview');
  await button('Apply',edit).click();await edit.waitFor({state:'hidden'});await f.changed(thin);const square=await f.doc();
  assert.deepEqual(square,doc,'Round trip must restore all original authored source, relief, signature and output data');await geometry('34-square-restored-native',square);
  await f.undo();await f.same(thin);await f.redo();await f.same(square);
  const last=await f.save('square-thickness-roundtrip');await f.freshOpen(last.file,last.doc,'35-square-final-reopened');await signatures('36-final-parent-signatures',square,1.5);await geometry('37-square-final-native',square);
 }
 await button('Iso').click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.snapshot('25-final');
});
