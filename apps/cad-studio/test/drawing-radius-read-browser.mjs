// #202: explicit geometry-only radius discovery; existing default/diameter contracts preserved.
import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/test/flow-helper.mjs','apps/cad-studio/test/drawing-radius-read-browser.mjs','apps/cad-studio/src/ui/DrawingWorkspace.tsx','apps/cad-studio/src/ui/drawing/DimensionsList.tsx','packages/barocss-cad-model/src/chat/drawingToleranceStack.ts','packages/barocss-cad-model/src/chat/drawing.ts','packages/barocss-cad-model/src/chat/groups.ts','packages/barocss-cad-model/src/chat/tools.ts','packages/barocss-cad-model/src/drawing/types.ts','packages/barocss-cad-model/src/drawing/dimensions.ts'];
const f=await createFlow({name:'drawing-radius-read',envFrozen:'DRAWING_RADIUS_READ_FROZEN',output:process.argv[2],initialFiles:pins,requiredFrozen:pins,
 qualification:'Compare saved/displayed native radius annotations with explicit geometry-only public reads and unchanged default/diameter-only responses.',
 limits:['Synthetic starter/projection-derived native drawing, not mouse annotation authoring. One sheet only.','Public facade and dispatcher run locally on a copy of the Studio-accepted document; external MCP is NOT_RUN.','Projection/formatting are product contract comparisons, not independent geometry certification.','No tolerance-stack behavior change, Fix or automatic annotation acceptance. Radius is geometry, not a manufacturing or fit interpretation.','History checks cover visible rows and Undo/Redo availability. Existing native schema and data are unchanged.'],
 inspectorSource:`import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {starterDoc} from '@barocss/cad-model/engine/doc';
import {readDrawing} from '@barocss/cad-model/drawing/types';
import {drawingInputs} from '@barocss/cad-model/chat/drawing';
import {issueContext} from '@barocss/cad-model/drawing/issues';
import {snapPoints} from '@barocss/cad-model/drawing/dimensions';
import {dimensionLine} from '@barocss/cad-model/drawing/sheet';
import {presetFor} from '@barocss/cad-model/drawing/standard';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {dispatchTool,runTool} from '@barocss/cad-model/chat/tools';
const input=JSON.parse(readFileSync(process.argv[2],'utf8')),evaluate=async d=>evaluateDoc(d,1);
if(!input.nodes){
 const doc=starterDoc(),i=drawingInputs(doc);assert.notEqual(typeof i,'string');
 const points=snapPoints(i.views.front);const corner=(x,y)=>{const p=points.find(p=>Math.abs(p.at[0]-x)<1e-8&&Math.abs(p.at[1]-y)<1e-8);assert.ok(p);return p.ref;};
 const circle=i.views.top.edges.find(e=>e.circle&&Math.abs(e.circle.radius-4)<1e-9);assert.ok(circle?.circle);
 const linear={id:'manual-width',kind:'linear',view:'front',orient:'horizontal',a:corner(0,0),b:corner(64,8),place:[32,-10]};
 const diameter={id:'manual-diameter',kind:'diameter',view:'top',edge:circle.name,near:[...circle.circle.center],place:[50,40]};
 const radius={...diameter,id:'manual-radius',kind:'radius',place:[65,50]};
 const lost={...radius,id:'retained-lost-radius',edge:'missing-synthetic-circle',place:[65,60]};
 const drawing=readDrawing({scope:{kind:'part'},sheet:'A3',scale:1,projection:'third',views:['front','top'],units:'inch',dual:true,notes:[{id:'private-note',text:'SYNTHETIC_PRIVATE_RADIUS_NOTE',at:[10,70]}],dimensions:[linear,diameter,radius,lost]});
 assert.equal(drawing.dimensions.length,4);assert.equal(JSON.stringify(readDrawing(drawing)),JSON.stringify(drawing));
 console.log(JSON.stringify({doc:{...doc,drawing}}));
}else{
 const doc=input,before=structuredClone(doc),i=drawingInputs(doc);assert.notEqual(typeof i,'string');const rows=issueContext(i).sheet.dimensions;
 assert.deepEqual(rows.map(r=>[r.dim.id,r.dim.kind,r.ok]),[['manual-width','linear',true],['manual-diameter','diameter',true],['manual-radius','radius',true],['retained-lost-radius','radius',false]]);
 assert.ok(Math.abs(rows[0].value-64)<1e-9);assert.ok(Math.abs(rows[1].value-8)<1e-9);assert.ok(Math.abs(rows[2].value-4)<1e-9);
 const described=await runTool({doc,bodies:[]},'describe',{tool:'drawing',action:'dimensions'},evaluate);assert.equal(described.isError,false);const contract=JSON.parse(described.content);assert.equal(contract.input.properties.include_radii.type,'boolean');assert.ok(!(contract.input.required??[]).includes('include_radii'));
 async function call(args){const result=await runTool({doc,bodies:[]},'drawing',{action:'dimensions',sheet:1,...args},evaluate),direct=await dispatchTool({doc,bodies:[]},'get_drawing_dimensions',{sheet:1,...args},evaluate);for(const r of [result,direct]){assert.equal(r.isError,false,r.content);assert.equal(r.changed,false);assert.deepEqual(r.state.doc,before);assert.ok(!r.content.includes('SYNTHETIC_PRIVATE_RADIUS_NOTE'));}assert.equal(result.content,direct.content);assert.deepEqual(doc,before);return result;}
 const ordinary=await call({}),off=await call({include_diameters:false}),radiusOff=await call({include_radii:false}),bothOff=await call({include_diameters:false,include_radii:false});
 for(const r of [off,radiusOff,bothOff])assert.equal(r.content,ordinary.content);
 const on=await call({include_diameters:true}),diameterRadiusOff=await call({include_diameters:true,include_radii:false});assert.equal(on.content,diameterRadiusOff.content);
 const radiusOn=await call({include_radii:true}),radiusDiameterOff=await call({include_radii:true,include_diameters:false}),bothOn=await call({include_diameters:true,include_radii:true});assert.equal(radiusOn.content,radiusDiameterOff.content);
 const data=JSON.parse(ordinary.content),extended=JSON.parse(on.content),radii=JSON.parse(radiusOn.content),both=JSON.parse(bothOn.content);
 assert.deepEqual(data.dimensions.map(d=>d.id),['manual-width']);assert.deepEqual(extended.dimensions.map(d=>[d.id,d.kind]),[['manual-width','linear'],['manual-diameter','diameter']]);assert.equal(extended.dimensions[1].value,rows[1].value);assert.equal(data.sheet,1);assert.equal(data.unit,'mm');
 assert.deepEqual(radii.dimensions.map(d=>[d.id,d.kind]),[['manual-width','linear'],['manual-radius','radius'],['retained-lost-radius','radius']]);
 assert.deepEqual(both.dimensions.map(d=>[d.id,d.kind]),[['manual-width','linear'],['manual-diameter','diameter'],['manual-radius','radius'],['retained-lost-radius','radius']]);
 const good=radii.dimensions[1],lost=radii.dimensions[2];
 assert.deepEqual(good,{id:'manual-radius',view:'top',kind:'radius',resolved:true,value:rows[2].value});assert.ok(Math.abs(good.value-4)<1e-9);
 assert.deepEqual(lost,{id:'retained-lost-radius',view:'top',kind:'radius',resolved:false,reason:rows[3].reason});
 assert.deepEqual(both.dimensions.filter(d=>d.kind==='radius'),[good,lost]);assert.deepEqual(both.dimensions.filter(d=>d.kind!=='radius'),extended.dimensions);
 const {kind,...linear}=radii.dimensions[0];assert.equal(kind,'linear');assert.deepEqual(linear,data.dimensions[0]);
 for(const result of [extended,radii,both]){assert.equal(result.revision,data.revision);assert.deepEqual({...result,dimensions:data.dimensions},data);}
 let malformedRefusals=0;
 for(const value of [undefined,null,0,1,'true',[],{}])for(const direct of [false,true]){
   const args={sheet:1,include_radii:value},state={doc,bodies:[]};
   const r=direct?await dispatchTool(state,'get_drawing_dimensions',args,evaluate):await runTool(state,'drawing',{action:'dimensions',...args},evaluate);
   assert.equal(r.isError,true,r.content);assert.equal(r.changed,false);assert.deepEqual(r.state.doc,before);assert.deepEqual(doc,before);malformedRefusals++;
 }
 assert.equal(doc.drawing.units,'inch');assert.equal(doc.drawing.dual,true);
 const preset=presetFor(i.settings);const expected=rows.map(r=>r.ok?{id:r.dim.id,kind:r.dim.kind,text:r.text,value:r.value,printed:dimensionLine(r,preset)}:{id:r.dim.id,kind:r.dim.kind,lost:r.reason});
 assert.equal(described.changed,false);assert.deepEqual(described.state.doc,before);assert.deepEqual(doc,before);
 console.log(JSON.stringify({expected,publicResponse:data,diameterResponse:extended,radiusResponse:radii,bothResponse:both,optionalRadiusBooleanAdvertised:true,defaultFalseByteEqual:true,diameterFalseByteEqual:true,revisionUnchangedAcrossOptions:true,malformedRefusals,freeNoteOmitted:true,documentUnchanged:true,facadeMatchesDispatcher:true}));
}`});
const state=async()=>({dirty:await f.page.locator('[aria-label="Unsaved changes"]').count(),undo:await f.page.getByRole('button',{name:'Undo',exact:true}).isEnabled(),redo:await f.page.getByRole('button',{name:'Redo',exact:true}).isEnabled(),history:await f.page.locator('.history .hs').evaluateAll(rows=>rows.map(r=>r.textContent))});
async function observe(doc,label){const before=await state();await f.page.getByRole('button',{name:'Drawing',exact:true}).click();await f.page.waitForFunction(()=>window.__studioDrawing?.()?.dimensions?.length===4);const proof=await f.inspect(label,await f.doc());
 const actual=await f.page.evaluate(()=>window.__studioDrawing().dimensions);assert.deepEqual(actual,proof.expected.map(({kind,printed,...rest})=>rest));const rows=f.page.locator('.dw-dim').filter({has:f.page.locator('button[aria-label^="Remove dimension "]')});assert.equal(await rows.count(),4);
 for(const expected of proof.expected.filter(r=>r.printed))assert.ok((await rows.allTextContents()).some(t=>t.includes(expected.printed)));
 const lost=rows.filter({has:f.page.getByRole('button',{name:'Remove dimension retained-lost-radius',exact:true})});assert.equal(await lost.count(),1);assert.match(await lost.innerText(),/radius/);assert.match(await lost.getAttribute('class'),/lost/);await lost.scrollIntoViewIfNeeded();
 await f.same(doc);assert.deepEqual(await state(),before);await f.snapshot(label);return proof;}
await f.run(async()=>{f.phase='synthetic native annotation preparation';const prepared=await f.inspect('prepare',{});await f.newPage();await f.openFile({name:'synthetic-radius-read.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(prepared.doc))},prepared.doc.nodes.length);await f.same(prepared.doc);const original=await f.doc();const first=await observe(original,'01-ui-radius-opt-in');
 const saved=await f.save('synthetic-radius-read');assert.deepEqual(saved.doc,original);await f.freshOpen(saved.file,saved.doc,'02-native-fresh-open');const reopened=await observe(saved.doc,'03-reopened-radius-opt-in');assert.deepEqual(reopened,first);assert.equal(f.report.downloads.length,1);
 f.report.observations.push({nativeAndUiDimensions:4,nativeRadiusMm:4,defaultLinearDimensions:1,diameterOptInDimensions:2,radiusOptInDimensions:3,bothOptInDimensions:4,unresolvedRadiusHasNoValue:true,minimalGeometryOnlyRadius:true,malformedRefusals:14,defaultAndDiameterFalseCompatibility:true,revisionUnchanged:true,freeNoteOmitted:true,sourceDirtyHistoryUnchanged:true,nativeSaveFreshOpen:true,externalMcp:'NOT_RUN'});
});
