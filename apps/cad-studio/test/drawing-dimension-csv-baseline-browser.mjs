// #225 pre-change current-sheet dimension-list delivery baseline, not an inspection register.
import assert from 'node:assert/strict';
import { createFlow } from './flow-helper.mjs';
const pins=['apps/cad-studio/test/drawing-dimension-csv-baseline-browser.mjs','apps/cad-studio/src/ui/DrawingWorkspace.tsx','apps/cad-studio/src/ui/drawing/ExportActions.tsx','packages/barocss-cad-model/src/drawing/sheet.ts','packages/barocss-cad-model/src/drawing/dimensions.ts','packages/barocss-cad-model/src/chat/drawing.ts'];
const f=await createFlow({name:'drawing-dimension-csv-baseline',output:process.argv[2],envFrozen:'DRAWING_DIMENSION_CSV_BASELINE_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Actual base-part drawing displays current linear/diameter requirements and a lost reference, but has no dimension CSV download control.',
 limits:['One sheet only. Two-sheet ownership, CSV download/parser, delayed export and source editing are follow-up NOT_RUN.', 'Synthetic command-created tube and projection-derived annotation setup, not mouse dimension authoring. No inspection item numbers, issued revision snapshot or inspection acceptance.', 'Product formatting and projection are observed, not an independent geometry/rounding/fit-table certification. No manufacturing limits inferred.'],
 snapshotExtra:()=>({drawing:window.__studioDrawing?.()??null}),
 inspectorSource:`
import assert from 'node:assert/strict';
import {emptyDoc} from '@barocss/cad-model/engine/doc';
import {commands} from '@barocss/cad-model/app/commands';
import {readDrawing} from '@barocss/cad-model/drawing/types';
import {drawingInputs} from '@barocss/cad-model/chat/drawing';
import {issueContext} from '@barocss/cad-model/drawing/issues';
import {snapPoints} from '@barocss/cad-model/drawing/dimensions';
import {dimensionLine} from '@barocss/cad-model/drawing/sheet';
import {presetFor} from '@barocss/cad-model/drawing/standard';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {dispatchTool} from '@barocss/cad-model/chat/tools';
const command=commands.find(c=>c.id==='tube')!,ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
const doc=command.build!(ctx,{...command.defaults!(ctx),r:12.7,ri:5,h:25.4,x:0,y:0,z:0});
const evaluated=evaluateDoc(doc,1);assert.ok(evaluated.ok);
const auto=await dispatchTool({doc,bodies:evaluated.bodies},'auto_dimension',{},async d=>evaluateDoc(d,1));assert.ok(!auto.isError,auto.content);
const input=drawingInputs(auto.state.doc);assert.ok(typeof input!=='string',String(input));
const points=snapPoints(input.views.front);
function pair(axis){for(const a of points)for(const b of points)if(Math.abs(b.at[axis]-a.at[axis]-25.4)<1e-8&&Math.abs(b.at[1-axis]-a.at[1-axis])<1e-8)return[a.ref,b.ref];throw Error('No native endpoint pair for axis '+axis);}
const horizontal=pair(0),vertical=pair(1);
const diameter=issueContext(input).sheet.dimensions.find(r=>r.ok&&r.kind==='diameter'&&r.dim.view==='top'&&Math.abs(r.value-25.4)<1e-8);assert.ok(diameter?.ok);
const width={id:'width',kind:'linear',view:'front',orient:'horizontal',a:horizontal[0],b:horizontal[1],place:[0,-12],tol:{kind:'symmetric',value:.254}};
const height={id:'height',kind:'linear',view:'front',orient:'vertical',a:vertical[0],b:vertical[1],place:[-25,12.7],tol:{kind:'deviation',upper:.508,lower:-.254}};
const outer={...diameter.dim,id:'outer',auto:undefined,place:[30,15],tol:{kind:'fit',code:'H7'}};
const lost={...width,id:'lost-width',a:{...width.a,edge:'missing-synthetic-edge'},place:[0,-24]};
const drawing=readDrawing({scope:{kind:'part'},sheet:'A3',scale:1,projection:'third',views:['front','top'],units:'inch',dual:true,dimensions:[width,height,outer,lost]});
const seed={...doc,drawing},finalInput=drawingInputs(seed);assert.ok(typeof finalInput!=='string',String(finalInput));
const resolved=issueContext(finalInput).sheet.dimensions,p=presetFor(drawing);
assert.equal(resolved.length,4);assert.ok(resolved.slice(0,3).every(r=>r.ok&&Math.abs(r.value-25.4)<1e-8));assert.equal(resolved[3].ok,false);
console.log(JSON.stringify({doc:seed,expected:resolved.map(r=>r.ok?{id:r.dim.id,value:r.value,text:r.text,printed:dimensionLine(r,p)}:{id:r.dim.id,lost:r.reason})}));
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
await f.run(async()=>{
 f.phase='prepare synthetic source and public Open';const prepared=await f.inspect('prepare',{});await f.newPage();
 await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'dimension-requirements.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(prepared.doc))});
 await f.same(prepared.doc);const accepted=await f.doc();assert.deepEqual(accepted,prepared.doc);
 const before=await f.page.evaluate(()=>({dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),undo:['Undo','Redo'].map(n=>document.querySelector('button[aria-label="'+n+'"]')?.disabled)}));
 await button('Drawing').click();await f.page.waitForFunction(()=>window.__studioDrawing?.()?.dimensions?.length===4);
 const observed=await f.page.evaluate(()=>window.__studioDrawing().dimensions);assert.deepEqual(observed,prepared.expected.map(({printed,...rest})=>rest));
 const list=f.page.locator('.dw-dims').filter({has:f.page.getByRole('button',{name:/^Remove dimension /})});assert.equal(await list.count(),1);await list.waitFor();const text=await list.innerText();
 for(const row of prepared.expected.filter(x=>x.printed))assert.ok(text.includes(row.printed),'actual dimension list contains '+row.printed);
 assert.match(text,/H7/);assert.match(text,/\[/,'dual metric display remains separate from model mm value');
 assert.equal(await f.page.locator('.dw').getByRole('button',{name:/CSV|dimension list export|export dimensions/i}).count(),0);
 assert.equal(await button('Export SVG').count(),1);assert.equal(await button('Export DXF').count(),1);
 await f.same(accepted);const after=await f.page.evaluate(()=>({dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),undo:['Undo','Redo'].map(n=>document.querySelector('button[aria-label="'+n+'"]')?.disabled)}));assert.deepEqual(after,before);
 await f.snapshot('01-current-dimensions-no-csv');
 f.report.observations.push({profile:'One base-part sheet; inch primary and dual mm',dimensionIds:observed.map(x=>x.id),rawResolvedModelMm:observed.filter(x=>'value'in x).map(x=>x.value),unresolved:observed.filter(x=>'lost'in x).map(x=>x.id),csvControlAbsent:true,documentUnchanged:true,downloads:0});
 assert.equal(f.report.downloads.length,0);
});
