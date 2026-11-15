import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['packages/barocss-cad-model/src/app/profileCommands.ts','apps/cad-studio/src/ui/SweepHistoryInputs.tsx','apps/cad-studio/src/App.tsx','apps/cad-studio/src/app/nativeEdgeCurveSource.ts','apps/cad-studio/src/app/ownedNativeEdgeCopy.ts','apps/cad-studio/src/ui/SelectionInspector.tsx','packages/barocss-cad-model/src/engine/nativeEdgeCurve.ts','apps/cad-studio/src/sketch/useSketchActions.ts','apps/cad-studio/src/engine/client.ts','apps/cad-studio/src/engine/engine.worker.ts'];
const f=await createFlow({name:'native-g2-edge-copy',output:process.argv[2],envFrozen:'D1377_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Copy a native G2 edge and line/semicircle controls with original coefficients and curvature.',
 limits:['Desktop1024/1440; generated native G2 Box and capsule fixture Open. Not a UI Fillet creation or Loft verification. Sweep profile and 9-point uniformly sampled polyline controls are generated fixture inputs, not a retained old copy.'],
 inspectorSource:`
import {readFileSync} from 'node:fs';
import {checkBrep,evaluateCurve, evaluateCurveCurvature, curveDomain} from '@barocss/cad';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {bodyMesh} from '@barocss/cad-model/engine/mesh';
import {geometryOf} from '@barocss/cad-model/engine/direct';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')),doc=input.doc??input;
const {brep}=partBreps(doc)[0],mesh=bodyMesh(brep,1,8);
if(input.sweep){console.log(JSON.stringify(partBreps(doc).map(b=>({key:b.key,check:checkBrep(b.brep,{strict:true})}))));}
else if(input.pick!==undefined){const edge=mesh.edges[input.pick];console.log(JSON.stringify({picked:edge.nativeJoint,names:edge.names}));}
else {const copied=geometryOf(doc.direct,doc.direct.objects.at(-1));
const matches=brep.edges.filter(e=>e.curve.degree===copied.degree&&JSON.stringify(e.curve.knots)===JSON.stringify(copied.knots)&&JSON.stringify(e.curve.controlPoints)===JSON.stringify(copied.controlPoints)&&JSON.stringify(e.curve.weights)===JSON.stringify(copied.weights));
const original=matches[0]?.curve;const domain=curveDomain(copied);
console.log(JSON.stringify({matches:matches.map(e=>e.id),degree:copied.degree,points:copied.controlPoints,
 endpoints:[evaluateCurve(copied,domain[0]),evaluateCurve(copied,domain[1])], samples:Array.from({length:9},(_,i)=>evaluateCurve(copied,domain[0]+i/8*(domain[1]-domain[0]))), curvatures:[.13,.27,.63,.81,.91].map(t=>evaluateCurveCurvature(copied,domain[0]+t*(domain[1]-domain[0])).curvaturePer),
 sameCurvature:!!original&&[.23,.37,.83].every(t=>JSON.stringify(evaluateCurveCurvature(copied,domain[0]+t*(domain[1]-domain[0])))===JSON.stringify(evaluateCurveCurvature(original,domain[0]+t*(domain[1]-domain[0]))))}));}
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const decimal=v=>{const s=String(v);if(!/e/i.test(s))return s;const neg=s.startsWith('-'),[m,e]=s.replace(/^-/,'').split(/e/i),digits=m.replace('.',''),at=(m.includes('.')?m.indexOf('.'):m.length)+Number(e);return(neg?'-':'')+(at<=0?'0.'+'0'.repeat(-at)+digits:at>=digits.length?digits+'0'.repeat(at-digits.length):digits.slice(0,at)+'.'+digits.slice(at));};
const g2={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
 {kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[30,12]},
 {kind:'extrude',id:'n1',sketch:0,height:20},
 {kind:'fillet',id:'n2',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],radius:2,section:{kind:'g2',tension:.5}}],outputs:{b2:{node:2,side:'solid'}},nextId:3};
const capsule={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
 {kind:'sketch',id:'n0',profile:'loop',segments:[{kind:'line',start:[0,-4]},{kind:'arc',start:[20,-4],center:[20,0],direction:'ccw'},{kind:'line',start:[20,4]},{kind:'arc',start:[0,4],center:[0,0],direction:'ccw'}]},
 {kind:'extrude',id:'n1',sketch:0,height:6}],outputs:{b1:{node:1,side:'solid'}},nextId:2};
await f.run(async()=>{for(const width of [1024,1440]){
 for(const c of [{label:'g2',doc:g2,view:'Right',point:[30,.375,19.625],degree:4,id:'n2_e13'},
 {label:'line',doc:capsule,view:'Top',point:[10,-4,6],degree:1},
 {label:'semicircle',doc:capsule,view:'Top',point:[24,0,6],degree:2}]){
  f.phase=`${width} ${c.label} native edge copy`;
  await f.newPage();await f.page.setViewportSize({width,height:900});
  const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);
  await chooser.setFiles({name:c.label+'.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(c.doc))});await f.same(c.doc);
  const before=await f.doc();await button(c.view,f.page.locator('.views')).click();
  if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();const filter=button('Selection filter');
  for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();assert.match(await filter.innerText(),/Edges/);
  await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  if(c.label==='g2')for(let i=0;i<2;i++){const p=await f.page.evaluate(p=>window.__studioScreenOf(p),c.point);await f.page.mouse.move(...p);await f.page.mouse.wheel(0,-350);await f.page.waitForTimeout(150);}
  const p=await f.page.evaluate(p=>window.__studioScreenOf(p),c.point);await f.page.mouse.click(...p);await f.page.waitForFunction(()=>window.__studioSelection.selection.edges.length===1);
  const picked=await f.page.evaluate(()=>window.__studioSelection.selection.edges[0]);
  const selected=await f.inspect(`${width}-${c.label}-selection`,{doc:before,pick:picked.edge});assert.ok(selected.picked);if(c.id)assert.equal(selected.picked.edgeId,c.id);
  const props=f.page.getByRole('complementary',{name:'Selection',exact:true});await button('Edge as a curve',props).click();await f.changed(before);const copied=await f.doc();
  assert.equal(copied.direct.objects.length,(before.direct?.objects.length??0)+1);assert.deepEqual(copied.nodes,before.nodes);
  const proof=await f.inspect(`${width}-${c.label}-proof`,copied);assert.equal(proof.degree,c.degree);assert.ok(proof.matches.includes(selected.picked.edgeId));assert.ok(proof.sameCurvature);
  if(c.label==='g2'){assert.ok(proof.curvatures.every(k=>k>0));assert.ok(Math.max(...proof.curvatures)-Math.min(...proof.curvatures)>.1);assert.ok(!/approximation/i.test(copied.direct.objects.at(-1).name));}
  else for(const k of proof.curvatures)assert.ok(Math.abs(k-(c.label==='line'?0:.25))<1e-10);
  f.report.observations.push({width,label:c.label,selected,proof});await f.snapshot(`${width}-${c.label}-copied`);
  await f.undo();await f.same(before);await f.redo();await f.same(copied);
  const file=await f.save(`${width}-${c.label}-copy`);await f.freshOpen(file.file,copied,`${width}-${c.label}-reopened`);await f.page.setViewportSize({width,height:900});
  const reopened=await f.inspect(`${width}-${c.label}-reopened-proof`,await f.doc());assert.deepEqual(reopened,proof);
  if(c.label==='g2')for(const kind of ['native','polyline']){
   f.phase=`${width}: ${kind} Sweep geometry and History`;
   const pathName=kind==='native'?copied.direct.objects.at(-1).name:'Polyline control';
   const points=proof.samples,degree=kind==='native'?4:1;
   const pathSource=`@model poly { version: 0; length-unit: mm; @curve #p { type: nurbs; degree: 1; knots: [0,${points.map((_,i)=>i)},${points.length-1}]; control-points: [${points.map(p=>'['+p.map(decimal).join(',')+']')}]; weights: [${points.map(()=>1)}]; } }`;
   const prepared={...copied,nodes:[...copied.nodes,{id:'n3',kind:'sketch',profile:'circle',center:[0,0],radius:.08}],nextId:4,
    direct:kind==='native'?copied.direct:{sources:{...copied.direct.sources,poly:pathSource},objects:[...copied.direct.objects,{id:'poly-control',name:pathName,source:'poly',geometry:'p'}]}};
   const [setup]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await setup.setFiles({name:`${kind}-sweep-setup.bcad`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(prepared))});await f.same(prepared);
   await button('Sketch 4').click();await button(pathName).click();await f.page.evaluate(()=>document.activeElement?.blur());await f.command('Sweep');
   const panel=f.page.getByRole('dialog',{name:'Sweep',exact:true});await panel.locator('.status').filter({hasText:/^preview$/}).waitFor();
   const geometry=degree===4?'Degree 4 NURBS':'Polyline';await panel.getByText(`${pathName} · ${geometry}`,{exact:true}).waitFor();
   await panel.locator('.hud-step').filter({hasText:/Solid/}).getByText('Faceted',{exact:true}).waitFor();
   await button('Apply',panel).click();await f.changed(prepared);const swept=await f.doc();
   assert.deepEqual(swept.nodes.slice(0,4),prepared.nodes);assert.deepEqual(swept.direct,prepared.direct);assert.equal(swept.nodes[4].path.degree,degree);
   await f.openFeatureEditor(4,`${kind} sweep`);await f.editor().getByText(`${pathName} · ${geometry} · Copied`,{exact:true}).waitFor();
   await f.editor().locator('.field').filter({hasText:'Solid representation'}).getByText('Faceted',{exact:true}).waitFor();
   await f.snapshot(`${width}-${kind}-sweep-history`);await f.closeEditor();
   const solids=await f.inspect(`${width}-${kind}-sweep-native`,{doc:swept,sweep:true});assert.ok(solids.length>=2);assert.ok(solids.every(b=>b.check.valid));
   await f.undo();await f.same(prepared);await f.redo();await f.same(swept);
   const saved=await f.save(`${width}-${kind}-sweep`);await f.freshOpen(saved.file,swept,`${width}-${kind}-sweep-reopened`);await f.page.setViewportSize({width,height:900});
   await f.openFeatureEditor(4,`${kind} reopened sweep`);await f.editor().getByText(`${pathName} · ${geometry} · Copied`,{exact:true}).waitFor();await f.closeEditor();
   f.report.observations.push({width,label:`${kind}-sweep`,geometry,solidRepresentation:'Faceted',native:solids});
  }

 }
}});
