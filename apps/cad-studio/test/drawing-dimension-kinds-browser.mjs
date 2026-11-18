// #202: opt-in geometry-only diameter discovery; default linear stack contract retained.
import assert from 'node:assert/strict';
import {createFlow} from './flow-helper.mjs';
const pins=['apps/cad-studio/test/drawing-dimension-kinds-browser.mjs','apps/cad-studio/src/ui/DrawingWorkspace.tsx','apps/cad-studio/src/ui/drawing/DimensionsList.tsx','packages/barocss-cad-model/src/chat/drawingToleranceStack.ts','packages/barocss-cad-model/src/chat/drawing.ts','packages/barocss-cad-model/src/chat/groups.ts','packages/barocss-cad-model/src/chat/tools.ts','packages/barocss-cad-model/src/drawing/types.ts','packages/barocss-cad-model/src/drawing/dimensions.ts'];
const f=await createFlow({name:'drawing-dimension-kinds',envFrozen:'DRAWING_DIMENSION_KINDS_FROZEN',output:process.argv[2],initialFiles:pins,requiredFrozen:pins,
 qualification:'Actual native/UI diameter annotations compared with strict opt-in geometry-only public discovery and unchanged default linear rows.',
 limits:['Synthetic command/projection-derived native drawing, not mouse annotation authoring. One sheet only.','Public facade and dispatcher run locally on a copy of the Studio-accepted document; external MCP is NOT_RUN.','Projection/formatting are product contract comparisons, not independent geometry or H7 table certification.','Existing provenance, including sheetName/scope, is preserved, not newly sanitized. Only new diameter rows have a minimal geometry-only key contract.','No tolerance-stack expansion, Fix or automatic annotation acceptance. Successful stack arithmetic remains covered by existing dedicated regressions, not this fixture.','History checks cover visible rows and Undo/Redo availability. Existing native schema and data are unchanged.'],
 inspectorSource:`import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyDoc} from '@barocss/cad-model/engine/doc';
import {commands} from '@barocss/cad-model/app/commands';
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
 const command=commands.find(c=>c.id==='tube');assert.ok(command?.build&&command.defaults);const ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
 const doc=command.build(ctx,{...command.defaults(ctx),r:12.7,ri:5,h:25.4,x:0,y:0,z:0});const e=evaluateDoc(doc,1);assert.ok(e.ok);
 const auto=await dispatchTool({doc,bodies:e.bodies},'auto_dimension',{},evaluate);assert.equal(auto.isError,false,auto.content);
 const i=drawingInputs(auto.state.doc);assert.notEqual(typeof i,'string');
 const points=snapPoints(i.views.front);let pair;
 for(const a of points)for(const b of points)if(Math.abs(b.at[0]-a.at[0]-25.4)<1e-8&&Math.abs(b.at[1]-a.at[1])<1e-8)pair=[a.ref,b.ref];assert.ok(pair);
 const d=issueContext(i).sheet.dimensions.find(r=>r.ok&&r.kind==='diameter'&&r.dim.view==='top'&&Math.abs(r.value-25.4)<1e-8);assert.ok(d?.ok&&d.dim.kind==='diameter');
 const linear={id:'manual-width',kind:'linear',view:'front',orient:'horizontal',a:pair[0],b:pair[1],place:[0,-12],tol:{kind:'symmetric',value:0.1}};
 const diameter={id:'manual-diameter',kind:'diameter',view:'top',edge:d.dim.edge,near:d.dim.near,place:[30,15],tol:{kind:'fit',code:'H7'}};
 // No sig/was fallback: the synthetic retained circle is deliberately absent.
 const lost={...diameter,id:'retained-lost-diameter',edge:'missing-synthetic-circle',place:[30,28]};
 const drawing=readDrawing({scope:{kind:'part'},sheet:'A3',scale:1,projection:'third',views:['front','top'],units:'mm',title:'SYNTHETIC_PRIVATE_SOURCE_SENTINEL',notes:[{id:'private-note',text:'SYNTHETIC_PRIVATE_NOTE_SENTINEL',at:[20,40]}],dimensions:[linear,diameter,lost]});assert.equal(drawing.dimensions.length,3);assert.equal(JSON.stringify(readDrawing(drawing)),JSON.stringify(drawing));
 console.log(JSON.stringify({doc:{...doc,drawing}}));
}else{
 const doc=input,before=structuredClone(doc),i=drawingInputs(doc);assert.notEqual(typeof i,'string');const rows=issueContext(i).sheet.dimensions;assert.equal(rows.length,3);
 assert.deepEqual(rows.map(r=>[r.dim.id,r.dim.kind,r.ok]),[['manual-width','linear',true],['manual-diameter','diameter',true],['retained-lost-diameter','diameter',false]]);
 for(const r of rows.slice(0,2))assert.ok(Math.abs(r.value-25.4)<1e-8);assert.equal(doc.drawing.dimensions[1].auto,undefined);
 const described=await runTool({doc,bodies:[]},'describe',{tool:'drawing',action:'dimensions'},evaluate);assert.equal(described.isError,false);const contract=JSON.parse(described.content);assert.match(contract.description,/Lists linear dimensions/);
 async function call(args){const result=await runTool({doc,bodies:[]},'drawing',{action:'dimensions',sheet:1,...args},evaluate);assert.equal(result.isError,false,result.content);assert.equal(result.changed,false);assert.deepEqual(result.state.doc,before);const direct=await dispatchTool({doc,bodies:[]},'get_drawing_dimensions',{sheet:1,...args},evaluate);assert.equal(direct.isError,false);assert.equal(direct.changed,false);assert.equal(result.content,direct.content);assert.deepEqual(direct.state.doc,before);assert.deepEqual(doc,before);assert.ok(!result.content.includes('SYNTHETIC_PRIVATE_NOTE_SENTINEL'));return result;}
 const ordinary=await call({}),disabled=await call({include_diameters:false}),enabled=await call({include_diameters:true});assert.equal(ordinary.content,disabled.content);
 const data=JSON.parse(ordinary.content),extended=JSON.parse(enabled.content);assert.deepEqual(data.dimensions.map(d=>d.id),['manual-width']);assert.equal(data.sheet,1);assert.equal(data.unit,'mm');assert.equal(data.dimensions[0].resolved,true);assert.ok(Math.abs(data.dimensions[0].value-25.4)<1e-8);
 assert.deepEqual(extended.dimensions.map(d=>[d.id,d.kind]),[['manual-width','linear'],['manual-diameter','diameter'],['retained-lost-diameter','diameter']]);
 const {kind,...linear}=extended.dimensions[0];assert.equal(kind,'linear');assert.deepEqual(linear,data.dimensions[0]);assert.deepEqual({...extended,dimensions:data.dimensions},data);
 const good=extended.dimensions[1],bad=extended.dimensions[2];for(const sentinel of ['SYNTHETIC_PRIVATE_SOURCE_SENTINEL','SYNTHETIC_PRIVATE_NOTE_SENTINEL'])assert.ok(!JSON.stringify([good,bad]).includes(sentinel));assert.deepEqual(Object.keys(good).sort(),['id','kind','resolved','value','view']);assert.deepEqual(Object.keys(bad).sort(),['id','kind','reason','resolved','view']);assert.equal(good.view,'top');assert.equal(good.resolved,true);assert.ok(Math.abs(good.value-25.4)<1e-8);assert.equal(bad.view,'top');assert.equal(bad.resolved,false);assert.equal(bad.reason,rows[2].reason);
 for(const value of [null,'true',0,undefined])for(const dispatch of [false,true]){const args={sheet:1,include_diameters:value};const state={doc,bodies:[]};const r=dispatch?await dispatchTool(state,'get_drawing_dimensions',args,evaluate):await runTool(state,'drawing',{action:'dimensions',...args},evaluate);assert.equal(r.isError,true);assert.equal(r.changed,false);assert.deepEqual(r.state.doc,before);assert.deepEqual(doc,before);}
 const stackArgs={sheet:1,expectedRevision:extended.revision,terms:[{id:'manual-width',sign:1},{id:'manual-diameter',sign:-1}]};
 const stack=await runTool({doc,bodies:[]},'drawing',{action:'stack',...stackArgs},evaluate);assert.equal(stack.isError,true);assert.equal(stack.changed,false);assert.match(JSON.parse(stack.content).error,/manual-diameter must be linear/);assert.deepEqual(stack.state.doc,before);
 const directStack=await dispatchTool({doc,bodies:[]},'calculate_drawing_tolerance_stack',stackArgs,evaluate);assert.equal(directStack.content,stack.content);assert.equal(directStack.changed,false);assert.deepEqual(directStack.state.doc,before);assert.deepEqual(doc,before);
 const preset=presetFor(i.settings);const expected=rows.map(r=>r.ok?{id:r.dim.id,kind:r.dim.kind,text:r.text,value:r.value,printed:dimensionLine(r,preset)}:{id:r.dim.id,kind:r.dim.kind,lost:r.reason});assert.match(expected[1].printed,/H7/);
 console.log(JSON.stringify({expected,publicResponse:data,optInResponse:extended,defaultFalseByteEqual:true,strictMalformedRefusals:8,diameterStackRefused:true,description:contract.description,documentUnchanged:true,facadeMatchesDispatcher:true,linearOnlyMatchesExistingContract:true}));
}`});
const state=async()=>({dirty:await f.page.locator('[aria-label="Unsaved changes"]').count(),undo:await f.page.getByRole('button',{name:'Undo',exact:true}).isEnabled(),redo:await f.page.getByRole('button',{name:'Redo',exact:true}).isEnabled(),history:await f.page.locator('.history .hs').evaluateAll(rows=>rows.map(r=>r.textContent))});
async function observe(doc,label){const before=await state();await f.page.getByRole('button',{name:'Drawing',exact:true}).click();await f.page.waitForFunction(()=>window.__studioDrawing?.()?.dimensions?.length===3);const proof=await f.inspect(label,await f.doc());
 const actual=await f.page.evaluate(()=>window.__studioDrawing().dimensions);assert.deepEqual(actual,proof.expected.map(({kind,printed,...rest})=>rest));const rows=f.page.locator('.dw-dim').filter({has:f.page.locator('button[aria-label^="Remove dimension "]')});assert.equal(await rows.count(),3);
 for(const expected of proof.expected.filter(r=>r.printed))assert.ok((await rows.allTextContents()).some(t=>t.includes(expected.printed)));
 const lost=rows.filter({has:f.page.getByRole('button',{name:'Remove dimension retained-lost-diameter',exact:true})});assert.equal(await lost.count(),1);assert.match(await lost.innerText(),/diameter/);assert.match(await lost.getAttribute('class'),/lost/);await lost.scrollIntoViewIfNeeded();
 await f.same(doc);assert.deepEqual(await state(),before);await f.snapshot(label);return proof;}
await f.run(async()=>{f.phase='synthetic native annotation preparation';const prepared=await f.inspect('prepare',{});await f.newPage();await f.openFile({name:'synthetic-dimension-kinds.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(prepared.doc))},prepared.doc.nodes.length);await f.same(prepared.doc);const original=await f.doc();const first=await observe(original,'01-opt-in-three-default-linear-one');
 const saved=await f.save('synthetic-dimension-kinds');assert.deepEqual(saved.doc,original);await f.freshOpen(saved.file,saved.doc,'02-native-fresh-open');const reopened=await observe(saved.doc,'03-reopened-opt-in-three');assert.deepEqual(reopened,first);assert.equal(f.report.downloads.length,1);
 f.report.observations.push({nativeAndUiDimensions:3,defaultLinearDimensions:1,optInDimensions:3,diameterAndUnresolvedDiameterRetained:true,defaultFalseByteEqual:true,geometryOnlyDiameterKeys:true,freeNoteOmitted:true,newDiameterRowsOmitSyntheticMetadata:true,existingProvenancePreserved:true,malformedRefusals:8,diameterNotStackEligible:true,sourceDirtyHistoryUnchanged:true,nativeSaveFreshOpen:true,externalMcp:'NOT_RUN'});
});
