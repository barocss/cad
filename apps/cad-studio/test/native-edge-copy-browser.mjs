import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/src/App.tsx','apps/cad-studio/src/app/nativeEdgeCurveSource.ts','apps/cad-studio/src/app/ownedNativeEdgeCopy.ts','apps/cad-studio/src/ui/SelectionInspector.tsx','packages/barocss-cad-model/src/engine/nativeEdgeCurve.ts','apps/cad-studio/src/sketch/useSketchActions.ts','apps/cad-studio/src/engine/client.ts','apps/cad-studio/src/engine/engine.worker.ts'];
const f=await createFlow({name:'native-edge-copy',output:process.argv[2],envFrozen:'D1376_SOURCE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Copy two selected native ellipse-outline arcs without replacing the existing whole ellipse curve.',
 limits:['Desktop1024/1440; authored ellipse12x6 Extrude6. Original exact wholeellipse Direct object is a generated fixture, not a UI Make curves assertion.'],
 inspectorSource:`
import {readFileSync} from 'node:fs';
import {evaluateCurve, evaluateCurveCurvature, curveDomain} from '@barocss/cad';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {bodyMesh} from '@barocss/cad-model/engine/mesh';
import {geometryOf} from '@barocss/cad-model/engine/direct';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')),doc=input.doc??input;
const {brep}=partBreps(doc)[0],mesh=bodyMesh(brep,1,8);
if(input.pick!==undefined){const edge=mesh.edges[input.pick];console.log(JSON.stringify({picked:edge.nativeJoint,names:edge.names}));}
else {const copied=geometryOf(doc.direct,doc.direct.objects.at(-1));
const matches=brep.edges.filter(e=>e.curve.degree===copied.degree&&JSON.stringify(e.curve.knots)===JSON.stringify(copied.knots)&&JSON.stringify(e.curve.controlPoints)===JSON.stringify(copied.controlPoints)&&JSON.stringify(e.curve.weights)===JSON.stringify(copied.weights));
const original=matches[0]?.curve;const domain=curveDomain(copied);
console.log(JSON.stringify({matches:matches.map(e=>e.id),degree:copied.degree,points:copied.controlPoints,
 endpoints:[evaluateCurve(copied,domain[0]),evaluateCurve(copied,domain[1])],
 sameCurvature:!!original&&[.2,.5,.8].every(t=>JSON.stringify(evaluateCurveCurvature(copied,domain[0]+t*(domain[1]-domain[0])))===JSON.stringify(evaluateCurveCurvature(original,domain[0]+t*(domain[1]-domain[0]))))}));}
`});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
await f.run(async()=>{for(const width of[1024,1440]){
 await f.newPage();await f.page.setViewportSize({width,height:900});await button('New part').click();await f.ready();
 await f.page.getByLabel('Mode',{exact:true}).getByRole('button',{name:'Sketch',exact:true}).click();await f.sketchPanel().waitFor();await f.sketchPanel().getByLabel('Sketch plane',{exact:true}).selectOption('xy');
 await f.tool('Ellipse','i');await f.frame([[0,0,0],[12,0,0],[0,6,0]]);for(const p of[[0,0,0],[12,0,0],[0,6,0]])await f.worldClick(p);
 await f.finishSketch(`${width}-ellipse-sketch`);const sketch=await f.doc();await f.openExtrudeHud();let accepted=(await f.applyExtrude({distance:6,previous:sketch,label:`${width}-ellipse`})).doc;
 // Prepare one whole-ellipse Direct object from the authored exact rational conic.
 const seedWithCurve={...accepted,direct:{sources:{whole:`@model whole { version: 0; length-unit: mm; @curve #c1 { type: nurbs; degree: 2; knots: [0,0,0,1,1,2,2,3,3,4,4,4]; control-points: [[12,0,0],[12,6,0],[0,6,0],[-12,6,0],[-12,0,0],[-12,-6,0],[0,-6,0],[12,-6,0],[12,0,0]]; weights: [1,0.7071067811865476,1,0.7071067811865476,1,0.7071067811865476,1,0.7071067811865476,1]; } }`},objects:[{id:'whole-ellipse',name:'Whole ellipse fixture',source:'whole',geometry:'c1'}]}};
 const [chooser]=await Promise.all([f.page.waitForEvent('filechooser'),button('Open').click()]);await chooser.setFiles({name:'whole-ellipse-fixture.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seedWithCurve))});await f.same(seedWithCurve);accepted=await f.doc();
 await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();const filter=button('Selection filter');for(let i=0;i<6&&!(await filter.innerText()).includes('Edges');i++)await filter.click();
 for(const [label,p,_radius] of [['major',[11.998387,0.098366,6],3],['minor',[0.196242,5.999198,6],24]]){
  await f.page.getByTitle('Frame all (F)',{exact:true}).click();await f.page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  for(let i=0;i<3;i++){const pos=await f.page.evaluate(p=>window.__studioScreenOf(p),p);await f.page.mouse.move(...pos);await f.page.mouse.wheel(0,-450);await f.page.waitForTimeout(150);}
  const pixel=await f.page.evaluate(p=>window.__studioScreenOf(p),p);await f.page.mouse.click(...pixel);await f.page.waitForFunction(()=>window.__studioSelection.selection.edges.length===1);
  const pick=await f.page.evaluate(()=>window.__studioSelection.selection.edges[0]);
  const selected=await f.inspect(`${width}-${label}-selected`,{doc:accepted,pick:pick.edge});assert.ok(selected.picked);
  const props=f.page.getByRole('complementary',{name:'Selection',exact:true});await props.getByText('Arc',{exact:true}).waitFor();
  const before=accepted;await button('Edge as a curve',props).click();await f.changed(before);const copied=await f.doc();
  assert.equal(copied.direct.objects.length,before.direct.objects.length+1);assert.deepEqual(copied.nodes,before.nodes);
  assert.deepEqual(copied.direct.objects.slice(0,-1),before.direct.objects);
  const proof=await f.inspect(`${width}-${label}-proof`,copied);assert.ok(proof.matches.includes(selected.picked.edgeId));assert.ok(proof.sameCurvature);assert.equal(proof.degree,2);
  f.report.observations.push({width,label,picked:selected.picked,names:selected.names,proof});await f.snapshot(`${width}-${label}-copied`);
  await f.undo();await f.same(before);await f.redo();await f.same(copied);
  const file=await f.save(`${width}-${label}-copy`);await f.freshOpen(file.file,copied,`${width}-${label}-reopened`);await f.page.setViewportSize({width,height:900});
  accepted=copied;await button('Top',f.page.locator('.views')).click();if(await button('Ortho').getAttribute('aria-pressed')!=='true')await button('Ortho').click();
  const nextFilter=button('Selection filter');for(let i=0;i<6&&!(await nextFilter.innerText()).includes('Edges');i++)await nextFilter.click();

 }
}});
