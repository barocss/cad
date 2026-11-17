import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createFlow, sha256 } from './flow-helper.mjs';
const f=await createFlow({name:'drawing-fit-list',output:process.argv[2],envFrozen:'DRAWING_FITS_FROZEN',initialFiles:['apps/cad-studio/test/drawing-fit-list-browser.mjs'],
 qualification:'#269 single base-part sheet, two authored diameter dimensions of one Ø12 bore, explicit fit list and source-table replacement.',
 limits:['Synthetic H7 rows with explicitly named test-source IDs, not certified standard values or manufacturing approval.','This run does not cover pair, dual/inch, nominal geometry edits, late responses, other Open/New routes or all unsupported inputs.','Original SVG/DXF Blob capture; independent text/entity reader, not a general DXF visual reader.'],
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
import {dispatchTool} from '@barocss/cad-model/chat/tools';
const extra=JSON.parse(process.argv[3]);
if(extra.prepare){
 const c=commands.find(c=>c.id==='tube')!,ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
 const base=c.build!(ctx,{...c.defaults!(ctx),r:10,ri:6,h:24,x:0,y:0,z:0});
 const doc={...base,fits:{version:1 as const,faces:[{face:'n1.hole0.side0',class:'H7'}],tables:[{id:'shop-test',sources:[{id:'synthetic-A',label:'Synthetic row A, not a standard'}],rows:[{class:'H7',over:10,upTo:18,upper:.018,lower:0,source:'synthetic-A'}]}]}};
 const e=evaluateDoc(doc,1);assert.ok(e.ok,e.ok?'':e.error.detail);
 const auto=await dispatchTool({doc,bodies:e.bodies},'auto_dimension',{},async d=>evaluateDoc(d,1));assert.ok(!auto.isError,auto.content);
 const input=drawingInputs(auto.state.doc);assert.ok(typeof input!=='string',String(input));
 const bore=issueContext(input).sheet.dimensions.find(r=>r.ok&&r.kind==='diameter'&&r.dim.view==='top'&&Math.abs(r.value-12)<1e-9);assert.ok(bore?.ok&&bore.dim.kind==='diameter','actual ordinary Ø12 reference');
 const drawing=readDrawing({scope:{kind:'part'},sheet:'A3',scale:1,projection:'third',views:['front','top'],dimensions:[{...bore.dim,id:'fit-a',place:[28,20]},{...bore.dim,id:'fit-b',place:[-28,20],count:2}]});
 console.log(JSON.stringify({doc:{...doc,drawing},fixtureReference:bore.dim}));
}else{const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));const input=drawingInputs(doc);assert.ok(typeof input!=='string',String(input));const ctx=issueContext(input);console.log(JSON.stringify({doc,sheet:ctx.sheet}));}
`,oracleSource:String.raw`
import json,sys,re,xml.etree.ElementTree as ET
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
expected=['FIT DIMENSIONS','fit-a (top)','fit-b (top)','12','H7 (+%s/0)'%q['upper'],'H7: shop-test row 1']
for text in expected:
 assert text in svg,('SVG missing',text)
 assert text in dxf,('DXF missing',text)
for texts in [svg,dxf]:
 assert sum(t=='fit-a (top)' for t in texts)==1 and sum(t=='fit-b (top)' for t in texts)==1
 # Source notes may be line-wrapped by the table formatter, so inspect their ordered text content.
 joined=' '.join(texts);assert q['source'] in joined;assert q['edge'] in joined;assert 'n1.hole0.side0' in joined
 assert 'Rows are dimensions' in joined
# Independent arithmetic, not the product's fit lookup or formatter.
assert 12+float(q['upper'])==q['upperLimit'];assert 12+0==12
print(json.dumps({'status':'PASS','dimensionIDs':['fit-a','fit-b'],'rowCount':2,'notPhysicalQuantity':True,'nominal':12,'limits':[12,q['upperLimit']],'source':q['source'],'formats':['SVG','DXF']}))
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
const controls=()=>f.page.getByLabel('Fit dimension lists',{exact:true});
async function drawing(){if(!(await f.page.locator('.dw[aria-label="Drawing"]').count()))await button('Drawing').click();await f.page.waitForFunction(()=>window.__studioDrawing?.()?.dimensions?.length===2);}
async function listReady(){await f.page.waitForFunction(()=>{const t=window.__studioDrawing?.()?.tables;return t?.length===1&&!t[0].error;});const table=await f.page.evaluate(()=>window.__studioDrawing().tables[0]);assert.equal(table.id,'fits');assert.ok(table.box[0]>=0&&table.box[1]>=0&&table.box[2]<=420&&table.box[3]<=297,'actual fit list remains within A3: '+JSON.stringify(table.box));}
function capture(){const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,urls=new Map();window.__fitFiles=[];URL.createObjectURL=function(blob){const url=create.call(this,blob);urls.set(url,blob);return url;};HTMLAnchorElement.prototype.click=function(){const blob=urls.get(this.href);if(blob&&/\.(svg|dxf)$/.test(this.download)){window.__fitFiles.push({name:this.download,blob});urls.delete(this.href);return;}return click.call(this);};}
async function exported(label){const out={};for(const [kind,name]of[['svg','Export SVG'],['dxf','Export DXF']]){const n=await f.page.evaluate(()=>window.__fitFiles.length);await button(name).click();await f.page.waitForFunction(n=>window.__fitFiles.length>n,n);const data=await f.page.evaluate(async n=>({bytes:Array.from(new Uint8Array(await window.__fitFiles[n].blob.arrayBuffer()))}),n);const bytes=Buffer.from(data.bytes);await writeFile(join(f.output,`${label}.${kind}`),bytes);f.report.files.push({label,kind,sha256:sha256(bytes),bytes:bytes.length,boundary:'original Blob, download anchor suppressed'});out[kind]=bytes.toString(kind==='dxf'?'latin1':'utf8');}return out;}
await f.run(async()=>{
 const {doc:seed}=await f.inspect('prepare',{}, {prepare:true});await f.newPage();await f.page.setViewportSize({width:1440,height:1000});await f.page.evaluate(capture);
 await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'fit-list.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);await drawing();
 await controls().locator(':scope > summary').click();await button('Add fit dimension list').click();await listReady();const added=await f.doc();assert.deepEqual(added.drawing.tables,[{id:'fits',from:'fits'}]);assert.deepEqual(added.nodes,seed.nodes);assert.deepEqual(added.drawing.dimensions,seed.drawing.dimensions);
 await f.runOracle({...await exported('01-added'),edge:seed.drawing.dimensions[0].edge,upper:'0.018',upperLimit:12.018,source:'synthetic-A'},'01-added');await f.snapshot('01-added');
 await f.page.getByLabel('Fit list fits X (mm)',{exact:true}).fill('15');await f.page.getByLabel('Fit list fits Y (mm)',{exact:true}).fill('175');await button('Move fit list fits').click();await f.page.waitForFunction(()=>window.__studioDoc.drawing.tables[0].at?.[1]===175);const moved=await f.doc();assert.deepEqual(moved.drawing.tables,[{id:'fits',from:'fits',at:[15,175]}]);
 await button('Remove fit list fits').click();await f.page.waitForFunction(()=>!window.__studioDoc.drawing.tables?.length);await f.undo();await f.same(moved);await listReady();
 await button('Model').click();await button('Library').click();const changedTable={id:'shop-test',sources:[{id:'synthetic-B',label:'Synthetic row B, not a standard'}],rows:[{class:'H7',over:10,upTo:18,upper:.02,lower:0,source:'synthetic-B'}]};await f.page.getByLabel('Fit table file',{exact:true}).setInputFiles({name:'fits.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changedTable))});await f.page.waitForFunction(()=>window.__studioDoc.fits?.tables[0].rows[0].upper===.02);await button('Close library').click();await f.ready();await drawing();await listReady();const changed=await f.doc();assert.deepEqual(changed,{...moved,fits:{...moved.fits,tables:[changedTable]}});
 await f.runOracle({...await exported('02-source-replaced'),edge:seed.drawing.dimensions[0].edge,upper:'0.02',upperLimit:12.02,source:'synthetic-B'},'02-source-replaced');await f.snapshot('02-source-replaced');
 await f.undo();await f.same(moved);await listReady();await f.redo();await f.same(changed);await listReady();
 const saved=await f.save('fit-list');await f.freshOpen(saved.file,changed,'03-fresh-open');await drawing();await listReady();await f.page.evaluate(capture);await f.runOracle({...await exported('04-fresh-open'),edge:seed.drawing.dimensions[0].edge,upper:'0.02',upperLimit:12.02,source:'synthetic-B'},'04-fresh-open');await f.snapshot('04-fresh-open');
 f.report.observations.push({scope:'two dimensions on one face, no physical quantity inference',explicitAddRemoveMove:true,sourceReplacement:true,undoRedoSaveFreshOpen:true,remainingNotRun:['nominal edit','pair','inch/dual','late reply','Open/New interruption','all unsupported inputs']});
});
