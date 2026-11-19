import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFlow,sha256} from '../../../test/flow-helper.mjs';
const f=await createFlow({name:'drawing-project-edit-closure',envFrozen:'CAD270_CLOSURE_FROZEN',output:process.argv[2],initialFiles:['apps/cad-studio/src/ui/DrawingWorkspace.tsx','apps/cad-studio/src/ui/useDrawingSheet.ts'],qualification:'#270 OPFS Save/fresh project Open then ordinary source Width edit and independent dimension writer readback',limits:['No browser export/download. Model SVG/DXF writer strings are separate from actual UI file delivery. No arbitrary dimensions or assembly claims.'],inspectorSource:`import {readFileSync} from 'node:fs';import {partBreps} from '@barocss/cad-model/engine/evaluate';import {brepMassProperties,checkBrep} from '@barocss/cad';import {drawingInputs} from '@barocss/cad-model/chat/drawing';import {issueContext} from '@barocss/cad-model/drawing/issues';import {sheetSvg} from '@barocss/cad-model/io/svg';import {sheetDxf} from '@barocss/cad-model/io/dxf';const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));const inputs=drawingInputs(doc);if(typeof inputs==='string')throw Error(inputs);const {sheet,layout}=issueContext(inputs);console.log(JSON.stringify({scope:doc.drawing.scope,native:partBreps(doc).map(({key,brep})=>({key,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true})})),views:inputs.views,dimensions:sheet.dimensions,svg:sheetSvg(sheet,'scope-closure'),dxf:sheetDxf(sheet,layout,'AC1015').text}));`,oracleSource:String.raw`
import json,sys,xml.etree.ElementTree as ET
q=json.load(sys.stdin); w=q['writer'];expected=q['expected'];tol=1e-7
assert w['scope']=={'kind':'part','body':{'key':'b1','feature':'n1','kind':'extrude'}}
assert len(w['native'])==2
for key,vol in [('b1',2880),('b3',960)]:
 b=next(x for x in w['native'] if x['key']==key);assert b['check']['valid'];assert abs(b['volume']-vol)<tol
for n,size in [('front',[40,6]),('top',[40,12]),('right',[12,6])]:
 v=w['views'][n];assert v['edges'];assert all(all(z.startswith('n1.') for z in e['name'].split('|')) for e in v['edges']);assert all(abs(v['max'][i]-v['min'][i]-size[i])<tol for i in [0,1])
ns={'s':'http://www.w3.org/2000/svg'};root=ET.fromstring(w['svg']);texts={}
for id,value in expected.items():
 g=root.find(".//s:g[@class='dimension'][@data-dim='%s']"%id,ns);assert g is not None,id
 ts=[''.join(t.itertext()).strip() for t in g.findall('.//s:text',ns)];assert str(value) in ts,(id,value,ts);texts[id]=ts
raw=w['dxf'].splitlines();assert len(raw)%2==0; pairs=[(int(raw[i]),raw[i+1].strip()) for i in range(0,len(raw),2)];entities=[];section=None;cur=[];i=0
while i<len(pairs):
 code,value=pairs[i]
 if (code,value)==(0,'SECTION'):
  section=pairs[i+1][1];i+=2;continue
 if (code,value)==(0,'ENDSEC'):
  if cur:entities.append(cur);cur=[]
  section=None
 elif section=='ENTITIES':
  if code==0:
   if cur:entities.append(cur)
   cur=[]
  cur.append((code,value))
 i+=1
vals=[]
for e in entities:
 def get(k):return next((v for c,v in e if c==k),None)
 if get(0)=='DIMENSION':
  assert get(1) is not None and get(42) is not None
  vals.append((get(1),float(get(42))))
assert len(vals)==len(expected),(vals,expected)
assert sorted(t for t,v in vals)==sorted(str(v) for v in expected.values())
assert all(abs(v-float(t))<tol for t,v in vals)
print(json.dumps({'status':'PASS','svgDimensionTexts':texts,'dxfDimensionTextMeasurements':vals,'nativeVolumes':{'b1':2880,'b3':960},'boundary':'Model writer strings, not browser exports'}))
`});
const seed={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[30,12]},{id:'n1',kind:'extrude',sketch:0,height:6},{id:'n2',kind:'sketch',profile:'rectangle',min:[-5,-4],max:[35,-2]},{id:'n3',kind:'extrude',sketch:2,height:12,from:-3}],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}},nextId:4,drawing:{scope:{kind:'part'},sheet:'A4',scale:1,views:['front','top','right','iso'],hidden:true,dimensions:[]}};
const button=n=>f.page.getByRole('button',{name:n,exact:true});const panel=()=>f.page.getByRole('complementary',{name:'Versions panel',exact:true});const documentName='scope-closure.bcad',projectName='CAD270 synthetic closure '+randomUUID();let grown,expected;
function observe(){const post=Worker.prototype.postMessage,seen=new WeakSet(),pending=new WeakMap();window.__closureReplies=[];Worker.prototype.postMessage=function(msg,...rest){if(!seen.has(this)){seen.add(this);pending.set(this,new Map());this.addEventListener('message',e=>{const options=pending.get(this).get(e.data?.id);if(options&&e.data.drawing){window.__closureReplies.push({options,drawing:structuredClone(e.data.drawing)});pending.get(this).delete(e.data.id);}});}if(msg?.type==='drawing')pending.get(this).set(msg.id,structuredClone(msg.options??{}));return post.call(this,msg,...rest);};}
async function drawing(){if(!await f.page.locator('.dw[aria-label="Drawing"]').count())await button('Drawing').click();await f.page.waitForFunction(()=>!!window.__studioDrawing?.());}
async function current(width){await drawing();await f.page.waitForFunction(w=>window.__closureReplies.some(r=>r.drawing.ok&&r.options.body?.key==='b1'&&Math.abs(r.drawing.views.front.max[0]-r.drawing.views.front.min[0]-w)<1e-7),width);const r=await f.page.evaluate(w=>window.__closureReplies.findLast(r=>r.drawing.ok&&r.options.body?.key==='b1'&&Math.abs(r.drawing.views.front.max[0]-r.drawing.views.front.min[0]-w)<1e-7),width);assert.deepEqual(r.options.body,{key:'b1',feature:'n1',kind:'extrude'});for(const[n,size]of [['front',[width,6]],['top',[width,12]]]){const v=r.drawing.views[n];assert.ok(v.edges.length);assert.ok(v.edges.every(e=>e.name.split('|').every(n=>n.startsWith('n1.'))));for(let i=0;i<2;i++)assert.ok(Math.abs(v.max[i]-v.min[i]-size[i])<1e-7);}return r;}
async function project(){if(!await panel().isVisible()){if(await button('Project and versions').isVisible())await button('Project and versions').click();else{await button('More tools').click();await f.page.getByRole('menuitem',{name:'Project and versions',exact:true}).click();}}if(await panel().getByLabel('Project',{exact:true}).isVisible())return;await panel().getByRole('textbox',{name:'Browser project name',exact:true}).fill(projectName);await panel().getByRole('button',{name:'Project in this browser',exact:true}).click();await panel().getByLabel('Project',{exact:true}).waitFor();}
await f.run(async()=>{
f.phase='select A and Auto dimensions at width30';await f.newPage();await f.page.evaluate(observe);await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:documentName,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.page.waitForFunction(()=>window.__studioDoc.nodes.length===4);await f.ready();await drawing();const c=f.page.getByLabel('Drawing body scope',{exact:true});await c.locator(':scope > summary').click();await f.page.getByLabel('Drawing native body',{exact:true}).selectOption('b1');await button('Use body for drawing').click();await current(30);await button('Auto-dimension').click();await f.page.waitForFunction(()=>window.__studioDoc.drawing.dimensions.length>0);const savedDoc=await f.doc();await f.page.waitForFunction(()=>window.__studioDrawing?.().dimensions.length===window.__studioDoc.drawing.dimensions.length);const dims=await f.page.evaluate(()=>window.__studioDrawing().dimensions);assert.ok(dims.length);assert.ok(dims.every(d=>!d.lost&&[30,12,6].includes(d.value)));expected=Object.fromEntries(dims.map(d=>[d.id,d.value===30?40:d.value]));for(const value of [40,12,6])assert.ok(Object.values(expected).includes(value),'Auto dimensions must cover '+value);
f.phase='actual OPFS Save then project Close and fresh reload Open';await button('Model').click();assert.deepEqual(await f.doc(),savedDoc);await project();await button('Save').click();await panel().getByRole('list',{name:'Project documents',exact:true}).getByText(documentName,{exact:true}).waitFor();await f.page.getByLabel('Unsaved changes',{exact:true}).waitFor({state:'hidden'});const bytes=Buffer.from(await f.page.evaluate(async([p,n])=>{const projects=await(await navigator.storage.getDirectory()).getDirectoryHandle('projects');const dir=await projects.getDirectoryHandle(p);const file=await(await dir.getFileHandle(n)).getFile();return Array.from(new Uint8Array(await file.arrayBuffer()));},[projectName,documentName]));assert.deepEqual(JSON.parse(bytes),savedDoc);await panel().getByRole('button',{name:'Close project',exact:true}).click();await panel().getByLabel('Project',{exact:true}).waitFor({state:'hidden'});await f.page.reload();await f.page.waitForSelector('.viewport[data-renderer="webgpu"]');await f.ready();await project();await panel().getByRole('button',{name:'Open '+documentName,exact:true}).click();await f.same(savedDoc);await f.page.evaluate(observe);await current(30);await f.snapshot('01-fresh-project-open-dimensions');f.report.observations.push({phase:f.phase,savedBytes:bytes.length,sha256:sha256(bytes),scope:savedDoc.drawing.scope,dimensionIds:savedDoc.drawing.dimensions.map(d=>d.id)});
f.phase='ordinary Width40 edit preserves scope and dimension IDs';await button('Model').click();await f.openFeatureEditor(1);await f.editor().getByLabel('Width',{exact:true}).fill('40');grown=(await f.applyEditor(savedDoc,'source-width40')).doc;assert.deepEqual(grown.nodes.slice(1),savedDoc.nodes.slice(1));assert.deepEqual(grown.nodes[0],{...savedDoc.nodes[0],max:[40,12]});assert.deepEqual(grown.drawing.scope,savedDoc.drawing.scope);assert.deepEqual(grown.drawing.dimensions.map(d=>d.id),savedDoc.drawing.dimensions.map(d=>d.id));const projection=await current(40);const live=await f.page.evaluate(()=>({dimensions:window.__studioDrawing().dimensions,texts:Object.fromEntries([...document.querySelectorAll('.dw-paper svg g.dimension[data-dim]')].map(g=>[g.getAttribute('data-dim'),[...g.querySelectorAll('text')].map(t=>t.textContent.trim())]))}));for(const[id,value]of Object.entries(expected)){const d=live.dimensions.find(d=>d.id===id);assert.ok(d&&!d.lost);assert.ok(Math.abs(d.value-value)<1e-7);assert.ok(live.texts[id]?.includes(String(value)),JSON.stringify(live));}f.report.observations.push({phase:f.phase,expected,live,projection});await f.snapshot('02-width40-current-dimensions');await writeFile(join(f.output,'accepted-width40.json'),JSON.stringify(grown,null,2));assert.deepEqual(f.report.downloads,[]);
});
assert.equal(f.report.status,'PASS','Browser/freeze/cleanup must pass before writer verification');
try{f.phase='browser closed: Model writers and independent XML/DXF reader';const writer=await f.inspect('post-browser-writers',grown);await f.runOracle({writer,expected},'independent-writer-readback');f.report.status='PASS';await f.persist();console.log('WRITER_READER_PASS');}catch(error){f.report.status='FAIL';f.report.writerFailure=String(error);await f.persist();throw error;}
