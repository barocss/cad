// #274: actual browser downloads, synthetic full Fields, native Save/fresh Open.
import assert from 'node:assert/strict';
import {readFile,statfs} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {createFlow,sha256} from './flow-helper.mjs';
import {clickModelCommand} from './model-rail-helper.mjs';
const output=process.argv[2],repo=resolve(import.meta.dirname,'../../..');
assert.ok(output&&isAbsolute(output)&&relative(repo,resolve(output)).startsWith('../'));
const field=group=>({value:`SYNTHETIC_${group}, "quoted"\nsecond line`,basis:'stated',source:`SYNTHETIC_SOURCE_${group}`,why:`SYNTHETIC_REASON_${group}`,confirmed:{by:'user',at:'2026-01-01T00:00:00.000Z'},said:'unverified'});
const fields=[field('shared'),field('independent')];
const part=notes=>({format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:2,nodes:[{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[10,5]},{kind:'extrude',id:'n1',sketch:0,height:2}],outputs:{b1:{node:1,side:'solid'}},brief:{version:1,notes}});
const doc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[],outputs:{},nextId:0,instances:['p1','p2','p3'].map((id,i)=>({id,name:'Same box',doc:part(fields[i<2?0:1]),position:[i*15,0,0],rotation:[0,0,0],part:{id:i<2?'shared':'independent',rev:'A'}}))};
const pins=['apps/cad-studio/test/bom-note-download-roundtrip-browser.mjs','apps/cad-studio/src/App.tsx','apps/cad-studio/src/ui/BomPanel.tsx','apps/cad-studio/src/ui/BomBriefNotes.tsx','packages/barocss-cad-model/src/bom/designBriefNotes.ts','packages/barocss-cad-model/src/bom/bom.ts'];
const oracleSource=String.raw`import csv,io,json,sys,hashlib
from pathlib import Path
r=json.load(sys.stdin); raw=Path(r['file']).read_bytes()
assert hashlib.sha256(raw).hexdigest()==r['sha256']
rows=list(csv.reader(io.StringIO(raw.decode('utf-8'),newline=''),strict=True))
assert rows[0]==['item no.','item','qty','note scope','design brief notes / occurrence mapping JSON']
assert len(rows)==2 and rows[1][:3]==['1','Same box','3']
assert rows[1][3]=='Design brief notes: intent, not approval'
groups=json.loads(rows[1][4]);assert groups==[{'parts':['p1','p2'],'state':'note','field':r['fields'][0]},{'parts':['p3'],'state':'note','field':r['fields'][1]}]
assert all(set(g['field'])=={'value','basis','source','why','confirmed','said'} for g in groups)
assert all('\n' in g['field']['value'] and '"quoted"' in g['field']['value'] and ',' in g['field']['value'] for g in groups)
print(json.dumps({'status':'PASS','rows':1,'qty':3,'occurrences':['p1','p2','p3'],'fullFieldEquality':True,'bytes':len(raw),'sha256':r['sha256']}))
`;
const f=await createFlow({name:'bom-note-download-roundtrip',output,envFrozen:'BOM_NOTE_DOWNLOAD_ROUNDTRIP_FROZEN',initialFiles:pins,requiredFrozen:pins,oracleSource,
qualification:'#274 synthetic full design-brief Field CSV downloads survive native Save/fresh Open with renewed opt-in; purchase CSV is unchanged.',
limits:['Only schema3, three ordinary top-level made-part occurrences, two synthetic notes; no schema4 or absent-note fixture.','No Blob/anchor/Worker patch, delayed delivery, source-revision concurrency, codec provenance or approval certification.','Scene preservation is renderer identity picking at three known top-face interiors and source document equality, not independently recomputed geometry. Synthetic confirmed metadata is test input, not a real user approval.']});
const button=(name,scope=f.page)=>scope.getByRole('button',{name,exact:true});
const panel=()=>f.page.getByRole('complementary',{name:'BOM panel',exact:true});
async function reserve(label){const s=await statfs(output),available=s.bavail*s.bsize;f.report.observations.push({label,availableBytes:available});await f.persist();assert.ok(available>=2*1024**3,'2 GiB reserve reached');}
async function ensureBom(){if(!await panel().isVisible())await clickModelCommand(f.page,'Inspect','BOM');await panel().getByRole('row',{name:'BOM line 1',exact:true}).waitFor();assert.match(await panel().getByLabel('BOM totals',{exact:true}).innerText(),/^3 parts/);await panel().getByLabel('Purchase list with made parts',{exact:true}).check();}
async function state(){return f.page.evaluate(()=>({doc:JSON.parse(JSON.stringify(window.__studioDoc)),dirty:!!document.querySelector('[aria-label="Unsaved changes"]'),history:[...document.querySelectorAll('.history .hs')].map(x=>x.getAttribute('aria-label')),undo:['Undo','Redo'].map(n=>{const b=document.querySelector(`button[aria-label="${n}"]`);return{disabled:b?.disabled,tip:b?.getAttribute('data-tip')};})}));}
async function scene(){await f.page.waitForFunction(()=>[5,20,35].every((x,i)=>window.__studioInstanceAt?.([x,2.5,2])?.id===['p1','p2','p3'][i]));return f.page.evaluate(()=>[5,20,35].map(x=>window.__studioInstanceAt([x,2.5,2]).id));}
async function top(){await button('Top').click();const o=button('Ortho');if(await o.getAttribute('aria-pressed')!=='true')await o.click();await f.page.getByTitle('Frame all (F)',{exact:true}).click();await scene();}
async function download(label,control,expectedName){await reserve(label);const pending=f.page.waitForEvent('download');await control.click();const d=await pending;assert.equal(d.suggestedFilename(),expectedName);const file=join(output,label+expectedName.slice(expectedName.lastIndexOf('.')));await d.saveAs(file);assert.equal(await d.failure(),null);const bytes=await readFile(file);assert.ok(bytes.length);f.report.files.push({file,name:d.suggestedFilename(),bytes:bytes.length,sha256:sha256(bytes),boundary:'actual browser download.saveAs'});return{file,bytes};}
async function absentConsent(){assert.equal(await panel().getByLabel('Include design-brief notes',{exact:true}).isChecked(),false);assert.equal(await button('Export design-brief notes',panel()).count(),0);}
async function notes(label,stem){await panel().getByLabel('Include design-brief notes',{exact:true}).check();await panel().getByRole('region',{name:'Design-brief notes',exact:true}).waitFor();const d=await download(label,button('Export design-brief notes',panel()),stem+' design-brief notes.csv');await f.runOracle({file:d.file,sha256:sha256(d.bytes),fields},label);return d;}
await f.run(async()=>{
 f.phase='Open synthetic three-occurrence document';await reserve('before-browser');await f.newPage();await f.openFile({name:'same-notes.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))},0);await f.same(doc);await top();await ensureBom();await absentConsent();const before=await state(),initialScene=await scene();assert.equal(before.dirty,false);
 f.phase='Purchase before consent, notes A, purchase after consent';const purchaseA=await download('01-purchase-before',button('Export purchase list',panel()),'same-notes purchase list.csv');const csvA=await notes('02-notes-A','same-notes');const purchaseAfter=await download('03-purchase-after',button('Export purchase list',panel()),'same-notes purchase list.csv');assert.deepEqual(purchaseAfter.bytes,purchaseA.bytes);assert.deepEqual(await state(),before);assert.deepEqual(await scene(),initialScene);await f.snapshot('04-opted-in-source-preserved');
 f.phase='Actual native Save while notes consent is enabled';const saved=await download('05-native-save',button('Save'),'same-notes.bcad');await f.same(doc);assert.deepEqual(await state(),before);
 f.phase='Fresh context Open exact saved bytes; consent not persisted';await f.freshOpen(saved.file,doc,'06-fresh-open');await top();await ensureBom();await absentConsent();const reopened=await state();assert.equal(reopened.dirty,false);assert.deepEqual(await scene(),initialScene);await f.snapshot('07-fresh-consent-absent');
 // Native filename is the actual artifact basename used by public Open.
 const stem=await f.page.locator('.doc-tab input').inputValue();
 f.phase='Explicit new consent and byte-identical notes B';const csvB=await notes('08-notes-B',stem);assert.deepEqual(csvB.bytes,csvA.bytes,'full notes CSV bytes survive native Save/fresh Open');const purchaseB=await download('09-purchase-reopened',button('Export purchase list',panel()),stem+' purchase list.csv');assert.deepEqual(purchaseB.bytes,purchaseA.bytes);assert.deepEqual(await state(),reopened);assert.deepEqual(await scene(),initialScene);await f.same(doc);await f.snapshot('10-roundtrip-complete');assert.equal(f.report.downloads.length,6);await reserve('finished');
 f.report.observations.push({fullFields:fields,notesCSVByteEqual:true,purchaseCSVByteEqual:true,qty:3,mapping:[['p1','p2'],['p3']],renewedConsent:true,sourcePreserved:true,actualDownloads:6});
});
