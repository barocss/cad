import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createFlow, sha256 } from './flow-helper.mjs';
import { clickModelCommand } from './model-rail-helper.mjs';

const paired = process.argv.includes('--pair');
const shaftEstimate = { class: 'g6', over: 10, upTo: 18, upper: -.006, lower: -.017, estimate: true };
const f=await createFlow({name:'drawing-fit-list',output:process.argv[2],envFrozen: paired ? 'D1874_SOURCE_FROZEN' : 'DRAWING_FITS_FROZEN',initialFiles:['apps/cad-studio/test/drawing-fit-list-browser.mjs','apps/cad-studio/test/model-rail-helper.mjs'],
 qualification: paired
  ? '#269 an actual fitted bore and shaft, mixed sourced/estimate rows, two separate diameter identities, and reversible row deletion.'
  : '#269 single base-part sheet, two authored diameter dimensions of one Ø12 bore, explicit fit list and source-table replacement.',
 limits:['Synthetic H7 rows with explicitly named test-source IDs, not certified standard values or manufacturing approval.','This run covers the selected mm drawing only. Other Open/New routes, late responses and unsupported scope matrices are separate.','Original SVG/DXF Blob capture; independent text/entity reader, not a general DXF visual reader.'],
 snapshotExtra:()=>({drawing:window.__studioDrawing?.()??null}),
 inspectorSource:`
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {emptyDoc} from '@barocss/cad-model/engine/doc';
import {commands} from '@barocss/cad-model/app/commands';
import {readDrawing} from '@barocss/cad-model/drawing/types';
import {drawingInputs} from '@barocss/cad-model/chat/drawing';
import {issueContext} from '@barocss/cad-model/drawing/issues';
import {evaluateDoc} from '@barocss/cad-model/engine/evaluate';
import {captureSignatures} from '@barocss/cad-model/engine/references';
import {dispatchTool} from '@barocss/cad-model/chat/tools';
const extra=JSON.parse(process.argv[3]);
if(extra.prepare){
 const c=commands.find(c=>c.id==='tube')!,ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
 const tube=c.build!(ctx,{...c.defaults!(ctx),r:10,ri:6,h:24,x:0,y:0,z:0});
 const cylinder=commands.find(c=>c.id==='cylinder')!, pinCtx={...ctx,doc:tube};
 const base=extra.paired?cylinder.build!(pinCtx,{...cylinder.defaults!(pinCtx),r:6,h:24,x:0,y:0,z:-5}):tube;
 const hole={face:'n1.hole0.side0',class:'H7'}, shaft={face:'n3.side0',class:'g6'};
 const row={class:'H7',over:10,upTo:18,upper:.018,lower:0,source:'synthetic-A'};
 const tables=[{id:'shop-test',sources:[{id:'synthetic-A',label:'Synthetic row A, not a standard'}],rows:extra.paired?[row,extra.shaftEstimate]:[row]}];
 const doc={...base,fits:{version:1 as const,faces:extra.paired?[hole,shaft]:[hole],tables,
   ...(extra.paired?{pairs:[{hole:hole.face,shaft:shaft.face}]}:{})}};
 const e=evaluateDoc(doc,1);assert.ok(e.ok,e.ok?'':e.error.detail);
 const auto=await dispatchTool({doc,bodies:e.bodies},'auto_dimension',{},async d=>evaluateDoc(d,1));assert.ok(!auto.isError,auto.content);
 const input=drawingInputs(auto.state.doc);assert.ok(typeof input!=='string',String(input));
 const bore=issueContext(input).sheet.dimensions.find(r=>r.ok&&r.kind==='diameter'&&r.dim.view==='top'&&r.dim.kind==='diameter'&&r.dim.edge.includes(hole.face)&&Math.abs(r.value-12)<1e-9);assert.ok(bore?.ok&&bore.dim.kind==='diameter','actual ordinary Ø12 reference');
 const drawing=readDrawing({scope:{kind:'part'},sheet:'A3',scale:1,projection:'third',views:['front','top'],dimensions:[{...bore.dim,id:'fit-a',place:[28,20]},{...bore.dim,id:'fit-b',place:[-28,20],count:2}]});
 const prepared={...doc,drawing};
 const signed=extra.paired?captureSignatures(prepared,e.bodies):prepared;
 if(extra.paired)assert.ok(signed.drawing?.dimensions.every(d=>d.kind==='diameter'&&d.sig?.k==='curve'));
 console.log(JSON.stringify({doc:signed,fixtureReference:bore.dim}));
}else{const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));const input=drawingInputs(doc);assert.ok(typeof input!=='string',String(input));const ctx=issueContext(input);console.log(JSON.stringify({doc,sheet:ctx.sheet}));}
`,oracleSource:String.raw`
import json,sys,re,xml.etree.ElementTree as ET
from decimal import Decimal as D
q=json.load(sys.stdin); ns={'s':'http://www.w3.org/2000/svg'};root=ET.fromstring(q['svg']);assert root.attrib['width']=='420mm' and root.attrib['height']=='297mm'
svg=[t.text or '' for t in root.findall('.//s:text',ns)]
raw=q['dxf'].splitlines();assert len(raw)%2==0; entities=[];cur=[]
for i in range(0,len(raw),2):
 c=int(raw[i]);v=raw[i+1]
 if c==0:
  if cur:entities.append(cur)
  cur=[]
 cur.append((c,v))
if cur:entities.append(cur)
def value(e,k):return next((v for c,v in e if c==k),'')
def decode(s):return re.sub(re.escape(chr(92)+'U+')+r'([a-fA-F0-9]{4})',lambda m:chr(int(m[1],16)),s)
dxf=[decode(value(e,1)) for e in entities if value(e,0)=='TEXT']
ids=q['ids']
expected=['FIT DIMENSIONS','12',*[id+' (top)' for id in ids]]
for texts in [svg,dxf]:
 for text in expected:
  assert text in texts,('Missing expected text',text)
 for id in ['fit-a','fit-b']:
  assert sum(t==id+' (top)' for t in texts)==(1 if id in ids else 0),(id,texts)
 # Context lines can be wrapped by the table formatter.
 joined=' '.join(texts)
 assert q['source'] in joined and q['edge'] in joined and 'n1.hole0.side0' in joined
 assert 'Rows are dimensions' in joined
 if q['paired']:
  assert 'H7/g6 (+%s/0, %s/%s) (est.)'%(q['upper'],q['shaftUpper'],q['shaftLower']) in joined,joined
  assert 'H7: shop-test row 1' in joined and 'g6: shop-test row 2 (estimate)' in joined,joined
  assert 'n3.side0' in joined and 'source not supplied (estimate)' in joined
 else:
  assert 'H7 (+%s/0)'%q['upper'] in texts and 'H7: shop-test row 1' in texts
  assert 'H7/g6' not in joined and 'g6: shop-test' not in joined
hole=[D('12'),D('12')+D(q['upper'])]
assert hole[1]==D(str(q['upperLimit']))
report={'status':'PASS','dimensionIDs':ids,'rowCount':len(ids),'holeLimits':[str(x) for x in hole],
 'source':q['source'],'formats':['SVG','DXF']}
if q['paired']:
 shaft=[D('12')+D(q['shaftLower']),D('12')+D(q['shaftUpper'])]
 clearance=[hole[0]-shaft[1],hole[1]-shaft[0]]
 assert clearance==[D(x) for x in q['clearance']],clearance
 report.update(shaftLimits=[str(x) for x in shaft],clearance=[str(x) for x in clearance],shaftEstimate=True)
print(json.dumps(report))
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
const controls=()=>f.page.getByLabel('Fit dimension lists',{exact:true});
async function drawing(count = 2) {
  if (!(await f.page.locator('.dw[aria-label="Drawing"]').count())) await button('Drawing').click();
  await f.page.waitForFunction(n => window.__studioDrawing?.()?.dimensions?.length === n, count);
}
async function listReady(){await f.page.waitForFunction(()=>{const t=window.__studioDrawing?.()?.tables;return t?.length===1&&!t[0].error;});const table=await f.page.evaluate(()=>window.__studioDrawing().tables[0]);assert.equal(table.id,'fits');assert.ok(table.box[0]>=0&&table.box[1]>=0&&table.box[2]<=420&&table.box[3]<=297,'actual fit list remains within A3: '+JSON.stringify(table.box));}
function capture(){const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,urls=new Map();window.__fitFiles=[];URL.createObjectURL=function(blob){const url=create.call(this,blob);urls.set(url,blob);return url;};HTMLAnchorElement.prototype.click=function(){const blob=urls.get(this.href);if(blob&&/\.(svg|dxf)$/.test(this.download)){window.__fitFiles.push({name:this.download,blob});urls.delete(this.href);return;}return click.call(this);};}
async function exported(label){const out={};for(const [kind,name]of[['svg','Export SVG'],['dxf','Export DXF']]){const n=await f.page.evaluate(()=>window.__fitFiles.length);await button(name).click();await f.page.waitForFunction(n=>window.__fitFiles.length>n,n);const data=await f.page.evaluate(async n=>({bytes:Array.from(new Uint8Array(await window.__fitFiles[n].blob.arrayBuffer()))}),n);const bytes=Buffer.from(data.bytes);await writeFile(join(f.output,`${label}.${kind}`),bytes);f.report.files.push({label,kind,sha256:sha256(bytes),bytes:bytes.length,boundary:'original Blob, download anchor suppressed'});out[kind]=bytes.toString(kind==='dxf'?'latin1':'utf8');}return out;}
async function verifyFits(label, seed, changed, ids = ['fit-a', 'fit-b'], hasPair = paired) {
  const source = changed ? 'synthetic-B' : 'synthetic-A';
  const upper = changed ? '0.02' : '0.018';
  const upperLimit = changed ? 12.02 : 12.018;
  const shaftUpper = changed ? '-0.008' : '-0.006';
  const shaftLower = changed ? '-0.019' : '-0.017';
  const clearance = changed ? ['0.008', '0.039'] : ['0.006', '0.035'];
  await f.runOracle({ ...await exported(label), edge: seed.drawing.dimensions[0].edge,
    upper, upperLimit, source, ids, paired: hasPair, shaftUpper, shaftLower, clearance }, label);
}
await f.run(async()=>{
 const { doc: prepared } = await f.inspect('prepare', {}, { prepare: true, paired, shaftEstimate });
 await f.newPage();
 await f.page.setViewportSize({ width: 1440, height: 1000 });
 await f.page.evaluate(capture);
 await f.page.getByLabel('Model file', { exact: true }).setInputFiles({
   name: 'fit-list.bcad', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(prepared)),
 });
 await f.page.waitForFunction(() => document.querySelector('.doc-tab input')?.value === 'fit-list');
 await f.ready();
 const seed = await f.doc();
 assert.deepEqual(seed, prepared);
 await drawing();
 await controls().locator(':scope > summary').click();await button('Add fit dimension list').click();await listReady();const added=await f.doc();assert.deepEqual(added.drawing.tables,[{id:'fits',from:'fits'}]);assert.deepEqual(added.nodes,seed.nodes);assert.deepEqual(added.drawing.dimensions,seed.drawing.dimensions);
 await verifyFits('01-added', seed, false);await f.snapshot('01-added');
 await f.page.getByLabel('Fit list fits X (mm)',{exact:true}).fill('15');await f.page.getByLabel('Fit list fits Y (mm)',{exact:true}).fill('175');await button('Move fit list fits').click();await f.page.waitForFunction(()=>window.__studioDoc.drawing.tables[0].at?.[1]===175);const moved=await f.doc();assert.deepEqual(moved.drawing.tables,[{id:'fits',from:'fits',at:[15,175]}]);
 await button('Remove fit list fits').click();await f.page.waitForFunction(()=>!window.__studioDoc.drawing.tables?.length);await f.undo();await f.same(moved);await listReady();
 await button('Model').click();await button('Library').click();const changedTable={id:'shop-test',sources:[{id:'synthetic-B',label:'Synthetic row B, not a standard'}],rows:[{class:'H7',over:10,upTo:18,upper:.02,lower:0,source:'synthetic-B'}, ...(paired ? [{ ...shaftEstimate, upper: -.008, lower: -.019 }] : [])]};await f.page.getByLabel('Fit table file',{exact:true}).setInputFiles({name:'fits.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changedTable))});await f.page.waitForFunction(()=>window.__studioDoc.fits?.tables[0].rows[0].upper===.02);await button('Close library').click();await f.ready();await drawing();await listReady();const changed=await f.doc();assert.deepEqual(changed,{...moved,fits:{...moved.fits,tables:[changedTable]}});
 await verifyFits('02-source-replaced', seed, true);await f.snapshot('02-source-replaced');
 await f.undo();await f.same(moved);await listReady();await f.redo();await f.same(changed);await listReady();
 if (paired) {
   f.phase = 'Remove one authored diameter and verify the retained pair row';
   assert.deepEqual(changed.drawing.dimensions.map(dimension => dimension.id), ['fit-a', 'fit-b']);
   await f.page.locator('.dw-dim').nth(1).getByRole('button', { name: /^Remove dimension / }).click();
   await drawing(1);
   await listReady();
   const removed = await f.doc();
   assert.deepEqual(removed.drawing.dimensions, changed.drawing.dimensions.slice(0, 1));
   assert.deepEqual(removed.fits, changed.fits);
   await verifyFits('03-second-dimension-removed', seed, true, ['fit-a']);
   await f.snapshot('03-second-dimension-removed');
   await f.undo();
   await f.same(changed);
   await drawing();
   await listReady();

   f.phase = 'Clear the shaft class through Studio and verify pair retirement';
   await button('Model').click();
   assert.equal(await f.page.evaluate(() => window.__studioSelectFace('n3.side0')), true);
   await clickModelCommand(f.page, 'Inspect', 'Fit class');
   const command = f.page.getByRole('dialog', { name: 'Fit class', exact: true });
   await command.getByLabel('Class', { exact: true }).selectOption('none');
   await command.locator('.status.ok').waitFor();
   await command.getByRole('button', { name: 'Apply', exact: true }).click();
   await f.changed(changed);
   const unpaired = await f.doc();
   assert.deepEqual(unpaired, { ...changed, fits: { ...changed.fits, faces: [changed.fits.faces[0]], pairs: [] } });
   await drawing();
   await listReady();
   await verifyFits('03b-shaft-class-cleared', seed, true, ['fit-a', 'fit-b'], false);
   await f.snapshot('03b-shaft-class-cleared');
   await f.undo();
   await f.same(changed);
   await drawing();
   await listReady();
 }
 const saved=await f.save('fit-list');await f.freshOpen(saved.file,changed,'03-fresh-open');await drawing();await listReady();await f.page.evaluate(capture);await verifyFits('04-fresh-open', seed, true);await f.snapshot('04-fresh-open');
 f.report.observations.push({scope:'two dimensions on one face, no physical quantity inference',explicitAddRemoveMove:true,sourceReplacement:true,undoRedoSaveFreshOpen:true,paired, remainingNotRun:['nominal edit',...(!paired?['pair']:[]),'inch/dual','late reply','Open/New interruption','all unsupported inputs']});
});
