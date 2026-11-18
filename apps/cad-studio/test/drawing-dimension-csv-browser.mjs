// #225 actual current-sheet non-issued dimension CSV. Not an inspection register.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow,sha256} from './flow-helper.mjs';
const pins=['apps/cad-studio/test/drawing-dimension-csv-browser.mjs','apps/cad-studio/src/ui/DrawingWorkspace.tsx','apps/cad-studio/src/ui/drawing/ExportActions.tsx','packages/barocss-cad-model/src/drawing/currentSheetDimensionsCsv.ts'];
const oracleSource=String.raw`
import csv,io,json,sys,math
x=json.load(sys.stdin)
rows=list(csv.DictReader(io.StringIO(x['csv'],newline='')))
headers=['report_scope','sheet_number','dimension_id','kind','view','orientation','state','model_value_mm','printed','print_unit','dual','basic','count','tolerance_kind','tolerance_value_mm','tolerance_upper_mm','tolerance_lower_mm','tolerance_code','reason']
assert list(rows[0])==headers
assert len(rows)==len(x['expected'])
for r,e in zip(rows,x['expected']):
    expected_id="'"+e['id'] if e['id'].startswith('=') else e['id']
    assert r['dimension_id']==expected_id,(r,e)
    assert r['report_scope']=='non-issued-current-sheet'
    assert r['sheet_number']==str(x['sheet'])
    assert r['print_unit']=='inch' and r['dual']=='true'
    assert r['basic']=='false' and r['count']==''
    if 'lost' in e:
        assert r['state']=='unresolved' and r['model_value_mm']=='' and r['printed']=='' and r['reason']==e['lost']
    else:
        assert r['state']=='resolved' and math.isclose(float(r['model_value_mm']),25.4,abs_tol=1e-8)
        assert math.isclose(float(r['model_value_mm']),e['value'],abs_tol=1e-8)
        assert r['printed']==e['printed'] and r['reason']==''
    if e['id']=='=SUM(1,2)' or e['id']=='lost-width':
        assert r['tolerance_kind']=='symmetric' and r['tolerance_value_mm']=='0.254'
    if e['id']=='height':
        assert r['tolerance_kind']=='deviation' and r['tolerance_upper_mm']=='0.508' and r['tolerance_lower_mm']=='-0.254'
    if e['id']=='outer':
        assert r['tolerance_kind']=='fit' and r['tolerance_code']=='H7'
assert 'SYNTHETIC_PRIVATE' not in x['csv'] and 'SECR9' not in x['csv']
assert not any(k in headers for k in ['sheet_name','revision','title','note','inspection_id','measured','pass'])
print(json.dumps({'status':'PASS','rows':len(rows),'sheet':x['sheet'],'parser':'Python stdlib csv','raw_mm_independent_expected':25.4,'printed_oracle':'product formatter equality, not independent rounding certification'}))
`;
const f=await createFlow({name:'drawing-dimension-csv',output:process.argv[2],envFrozen:'DRAWING_DIMENSION_CSV_FROZEN',initialFiles:pins,requiredFrozen:pins,
 qualification:'Actual non-issued current-sheet CSV download, independent CSV parsing, raw mm versus printed inch/dual, unresolved retention, formula defense, two-sheet ownership and native Save/Open.',
 limits:['Synthetic command/projection-created annotations, not mouse authoring. No inspection item identity, issued snapshot or manufacturing acceptance.', 'Python independently parses CSV and checks known 25.4 mm geometry; printed text is compared with the product formatter, not independent fit/rounding certification.', 'Stale captured callback and pending-worker race behavior are NOT_RUN. Hidden-view pre-resolved rows and malformed duplicate identity are unit-only; this actual run does not manufacture races.'],
 snapshotExtra:()=>({drawing:window.__studioDrawing?.()??null}),oracleSource,
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
const width={id:'=SUM(1,2)',kind:'linear',view:'front',orient:'horizontal',a:horizontal[0],b:horizontal[1],place:[0,-12],tol:{kind:'symmetric',value:.254}};
const height={id:'height',kind:'linear',view:'front',orient:'vertical',a:vertical[0],b:vertical[1],place:[-25,12.7],tol:{kind:'deviation',upper:.508,lower:-.254}};
const outer={...diameter.dim,id:'outer',auto:undefined,place:[30,15],tol:{kind:'fit',code:'H7'}};
const lost={...width,id:'lost-width',a:{...width.a,edge:'missing-synthetic-edge'},place:[0,-24]};
const drawing=readDrawing({scope:{kind:'part'},sheet:'A3',scale:1,projection:'third',views:['front','top'],units:'inch',dual:true,title:'SYNTHETIC_PRIVATE_TITLE',revision:'SECR9',notes:[{id:'private-note',text:'SYNTHETIC_PRIVATE_NOTE',at:[20,40]}],dimensions:[width,height,outer,lost]});
const seed={...doc,drawing},finalInput=drawingInputs(seed);assert.ok(typeof finalInput!=='string',String(finalInput));
const resolved=issueContext(finalInput).sheet.dimensions,p=presetFor(drawing);
assert.equal(resolved.length,4);assert.ok(resolved.slice(0,3).every(r=>r.ok&&Math.abs(r.value-25.4)<1e-8));assert.equal(resolved[3].ok,false);
const rawSplit={...drawing,sheets:[{id:'second',views:['top']}]};
const rawUnsupported={...drawing,dimensions:drawing.dimensions.map((d,i)=>i===0?{...d,view:'iso'}:d)};
const split={...doc,drawing:readDrawing(rawSplit)},unsupported={...doc,drawing:readDrawing(rawUnsupported)};
assert.deepEqual(split.drawing,rawSplit);assert.deepEqual(unsupported.drawing,rawUnsupported);
assert.deepEqual(split.drawing.sheets,[{id:'second',views:['top']}]);
assert.equal(unsupported.drawing.dimensions[0].view,'iso');assert.equal(unsupported.drawing.dimensions.length,4);
// Public Open runs the same native drawing normalizer; keep strict byte/order ownership waits.
assert.equal(JSON.stringify(readDrawing(split.drawing)),JSON.stringify(split.drawing));
assert.equal(JSON.stringify(readDrawing(unsupported.drawing)),JSON.stringify(unsupported.drawing));
console.log(JSON.stringify({doc:seed,split,unsupported,expected:resolved.map(r=>r.ok?{id:r.dim.id,value:r.value,text:r.text,printed:dimensionLine(r,p)}:{id:r.dim.id,lost:r.reason})}));
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
const state=()=>f.page.evaluate(()=>({dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),undo:['Undo','Redo'].map(n=>document.querySelector('button[aria-label="'+n+'"]')?.disabled)}));
async function open(doc){await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'dimension-requirements.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await f.same(doc);await f.ready();}
async function drawing(ids){await button('Drawing').click();await f.page.waitForFunction(ids=>JSON.stringify(window.__studioDrawing?.()?.dimensions?.map(d=>d.id))===JSON.stringify(ids),ids);}
async function capture(label,expected,sheetNumber,filename){
 const original=await f.doc(),before=await state();
 const control=button('Export dimension CSV');await control.scrollIntoViewIfNeeded();assert.equal(await control.isEnabled(),true);
 const [download]=await Promise.all([f.page.waitForEvent('download'),control.click()]);
 assert.equal(download.suggestedFilename(),filename);
 const file=join(f.output,label+'.csv');await download.saveAs(file);const bytes=await readFile(file),csv=bytes.toString('utf8');
 f.report.files.push({file,hash:sha256(bytes),suggestedFilename:download.suggestedFilename()});
 await f.runOracle({csv,expected,sheet:sheetNumber},label);
 await f.same(original);assert.deepEqual(await state(),before);
 return csv;
}
await f.run(async()=>{
 f.phase='prepare source and Open';const prepared=await f.inspect('prepare',{});await f.newPage();await open(prepared.doc);await drawing(prepared.expected.map(d=>d.id));
 f.phase='single-sheet download';const first=await capture('single-sheet',prepared.expected,1,'dimension-requirements-sheet-1-dimensions.csv');
 await f.snapshot('01-current-dimension-csv');
 f.phase='Save and fresh Open';const saved=await f.save('source');await f.freshOpen(saved.file,saved.doc,'02-native-reopened');await drawing(prepared.expected.map(d=>d.id));
 const reopened=await capture('reopened',prepared.expected,1,'source-sheet-1-dimensions.csv');assert.equal(reopened,first);
 f.phase='two-sheet ownership';await open(prepared.split);await drawing(prepared.expected.filter(d=>d.id!=='outer').map(d=>d.id));
 await capture('sheet-1',prepared.expected.filter(d=>d.id!=='outer'),1,'dimension-requirements-sheet-1-dimensions.csv');
 await f.page.getByRole('tab',{name:'Sheet 2',exact:true}).click();await f.page.waitForFunction(()=>window.__studioDrawing?.()?.dimensions?.length===1&&window.__studioDrawing().dimensions[0].id==='outer');
 await capture('sheet-2',prepared.expected.filter(d=>d.id==='outer'),2,'dimension-requirements-sheet-2-dimensions.csv');await f.snapshot('03-second-sheet-only');
 f.phase='unsupported view refuses whole file';await open(prepared.unsupported);await drawing(prepared.expected.map(d=>d.id));
 const before=await state(),doc=await f.doc(),downloads=f.report.downloads.length;const csvButton=button('Export dimension CSV');await csvButton.scrollIntoViewIfNeeded();
 assert.equal(await csvButton.isEnabled(),true,'ready base part admits click; unsupported row is refused by serializer');
 await csvButton.click();await f.waitToast(/Dimension CSV not written/);
 await f.page.waitForTimeout(200);assert.equal(f.report.downloads.length,downloads);await f.same(doc);assert.deepEqual(await state(),before);await f.snapshot('04-unsupported-refusal');
 f.report.observations.push({scope:'non-issued current-sheet only',singleAndReopenCsvEqual:true,twoSheetRows:[3,1],formulaIdProtected:true,freeMetadataExcluded:true,unsupportedRefusedWithoutDownload:true,documentUnchanged:true});
});
