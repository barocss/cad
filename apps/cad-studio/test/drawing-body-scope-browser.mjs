import assert from 'node:assert/strict';
import {join} from 'node:path';
import {writeFile} from 'node:fs/promises';
import {createFlow,sha256} from './flow-helper.mjs';
const f=await createFlow({name:'drawing-body-scope',output:process.argv[2],envFrozen:'DRAWING_BODY_FROZEN',initialFiles:['apps/cad-studio/test/drawing-body-scope-browser.mjs'],
 qualification:'#270 explicit single native base output, original worker projection, literal two-box occlusion fixture and saved scope.',
 limits:['Synthetic extrude outputs only; no revolve/import/split/assembly subset claim.','Late delivery, suppression/deletion and same-key different document lifecycle are not exercised in this first run.','Independent native mass and actual Worker/SVG/DXF rectangle oracles; not PDF/ASME approval.'],
 snapshotExtra:()=>({drawing:window.__studioDrawing?.()??null,bodyScope:document.querySelector('[aria-label="Drawing body scope"]')?.textContent}),
 inspectorSource:`
import {readFileSync} from 'node:fs';
import {rectanglePart,withNode} from '@barocss/cad-model/engine/doc';
import {withIds} from '@barocss/cad-model/engine/ids';
import {readDrawing} from '@barocss/cad-model/drawing/types';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {brepMassProperties,checkBrep} from '@barocss/cad';
const extra=JSON.parse(process.argv[3]);
if(extra.prepare){let d=withIds(rectanglePart(30,12,6));d=withNode(d,{kind:'sketch',profile:'rectangle',min:[-5,-4],max:[35,-2]});d=withNode(d,{kind:'extrude',sketch:2,height:12,from:-3});console.log(JSON.stringify({doc:{...d,drawing:readDrawing({scope:{kind:'part'},sheet:'A4',scale:1,views:['front','top','right','iso'],hidden:true,dimensions:[]})}}));}
else{const d=JSON.parse(readFileSync(process.argv[2],'utf8'));console.log(JSON.stringify({bodies:partBreps(d).map(({key,brep})=>({key,volume:brepMassProperties(brep,1).volume,check:checkBrep(brep,{strict:true}),vertices:brep.vertices.map(v=>v.point)}))}));}
`,oracleSource:String.raw`
import json,sys,math,xml.etree.ElementTree as ET
q=json.load(sys.stdin);w=q['width'];tol=1e-7
bodies=q['native']['bodies'];assert len(bodies)==2
A=next(b for b in bodies if b['key']=='b1');B=next(b for b in bodies if b['key']=='b3');assert A['check']['valid'] and B['check']['valid'];assert abs(A['volume']-w*12*6)<tol;assert abs(B['volume']-40*2*12)<tol
for axis,lo,hi in [(0,0,w),(1,0,12),(2,0,6)]:assert abs(min(p[axis] for p in A['vertices'])-lo)<tol and abs(max(p[axis] for p in A['vertices'])-hi)<tol
v=q['reply']['drawing']['views'];assert q['reply']['options']['body']=={'key':'b1','feature':'n1','kind':'extrude'}
for name,height in [('front',6),('top',12)]:
 view=v[name];assert abs(view['max'][0]-view['min'][0]-w)<tol and abs(view['max'][1]-view['min'][1]-height)<tol
 assert view['edges'] and all(all(part.startswith('n1.') for part in e['name'].split('|')) for e in view['edges'])
 strokes=[p['curve'] for e in view['edges'] for p in e['pieces'] if p['visible'] and p.get('ink')!=False]
 assert strokes and all(c['kind']=='line' for c in strokes)
 # Every rectangle side is visible again; a full-part projection with occluder B cannot supply this.
 x0,y0=view['min'];x1,y1=view['max'];wanted=[[[x0,y0],[x1,y0]],[[x1,y0],[x1,y1]],[[x1,y1],[x0,y1]],[[x0,y1],[x0,y0]]]
 def segment(a,b):return all(math.dist(x,y)<tol for x,y in zip(a,b)) or all(math.dist(x,y)<tol for x,y in zip(a,reversed(b)))
 for side in wanted:assert any(segment(side,[c['a'],c['b']]) for c in strokes),(name,'missing visible rectangle side',side)
assert all(face['name'].startswith('n1.') for face in v['faces'])
if q.get('svg'):
 ns={'s':'http://www.w3.org/2000/svg'};root=ET.fromstring(q['svg']);H=float(root.attrib['height'].removesuffix('mm'));lines=[]
 raw=q['dxf'].splitlines();entities=[];cur=[]
 for i in range(0,len(raw),2):
  code=int(raw[i]);value=raw[i+1]
  if code==0:
   if cur:entities.append(cur)
   cur=[]
  cur.append((code,value))
 if cur:entities.append(cur)
 def value(e,k):return next((v for c,v in e if c==k),'')
 for name,height in [('front',6),('top',12)]:
  g=root.find(".//s:g[@class='view'][@data-view='%s']"%name,ns);assert g is not None
  visible=[e for e in g.findall('s:line',ns) if float(e.attrib.get('stroke-width',0))==.5]
  pts=[]
  for e in visible:
   a=[float(e.attrib['x1']),float(e.attrib['y1'])];b=[float(e.attrib['x2']),float(e.attrib['y2'])];pts+= [a,b]
   assert any(value(d,0)=='LINE' and value(d,8)=='VISIBLE' and max(abs(float(value(d,10))-a[0]),abs(H-float(value(d,20))-a[1]),abs(float(value(d,11))-b[0]),abs(H-float(value(d,21))-b[1]))<.000050001 for d in entities),(name,'DXF corresponding visible line')
  assert pts and abs(max(p[0] for p in pts)-min(p[0] for p in pts)-w)<.000100002 and abs(max(p[1] for p in pts)-min(p[1] for p in pts)-height)<.000100002
print(json.dumps({'status':'PASS','width':w,'selectedVolume':A['volume'],'excludedVolume':B['volume'],'front':[w,6],'top':[w,12],'preHLRVisibleSides':True,'outputs':['b1','b3'],'svgDxf':bool(q.get('svg'))}))
`});
const button=name=>f.page.getByRole('button',{name,exact:true});
function observe(){
 const post=Worker.prototype.postMessage,seen=new WeakSet(),pending=new WeakMap();window.__bodyDrawings=[];
 Worker.prototype.postMessage=function(msg,...rest){if(!seen.has(this)){seen.add(this);pending.set(this,new Map());this.addEventListener('message',e=>{const options=pending.get(this).get(e.data?.id);if(options&&e.data.drawing){window.__bodyDrawings.push({id:e.data.id,options,drawing:JSON.parse(JSON.stringify(e.data.drawing))});pending.get(this).delete(e.data.id);}});}if(msg?.type==='drawing')pending.get(this).set(msg.id,JSON.parse(JSON.stringify(msg.options??{})));return post.call(this,msg,...rest);};
 const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click,urls=new Map();window.__bodyFiles=[];URL.createObjectURL=function(blob){const url=create.call(this,blob);urls.set(url,blob);return url;};HTMLAnchorElement.prototype.click=function(){const blob=urls.get(this.href);if(blob&&/\.(svg|dxf)$/.test(this.download)){window.__bodyFiles.push({name:this.download,blob});urls.delete(this.href);return;}return click.call(this);};
}
async function drawing(){if(!(await f.page.locator('.dw[aria-label="Drawing"]').count()))await button('Drawing').click();await f.page.waitForFunction(()=>!!window.__studioDrawing?.());}
async function reply(width){await f.page.waitForFunction(w=>window.__bodyDrawings.some(r=>r.options.body?.key==='b1'&&r.drawing.ok&&Math.abs(r.drawing.views.front.max[0]-r.drawing.views.front.min[0]-w)<1e-7),width);return f.page.evaluate(w=>window.__bodyDrawings.findLast(r=>r.options.body?.key==='b1'&&r.drawing.ok&&Math.abs(r.drawing.views.front.max[0]-r.drawing.views.front.min[0]-w)<1e-7),width);}
async function exports(label){const out={};for(const[kind,name]of[['svg','Export SVG'],['dxf','Export DXF']]){const n=await f.page.evaluate(()=>window.__bodyFiles.length);await button(name).click();await f.page.waitForFunction(n=>window.__bodyFiles.length>n,n);const bytes=Buffer.from(await f.page.evaluate(async n=>Array.from(new Uint8Array(await window.__bodyFiles[n].blob.arrayBuffer())),n));await writeFile(join(f.output,`${label}.${kind}`),bytes);f.report.files.push({label,kind,bytes:bytes.length,sha256:sha256(bytes),boundary:'original Blob, anchor suppressed'});out[kind]=bytes.toString(kind==='dxf'?'latin1':'utf8');}return out;}
async function verify(doc,label,width,files=false){await drawing();const dimensions=await f.page.evaluate(()=>window.__studioDrawing().dimensions);assert.ok(dimensions.every(d=>!d.lost),JSON.stringify(dimensions));const r=await reply(width);const native=await f.inspect(label,doc,{prepare:false});await f.runOracle({native,reply:r,width,...(files?await exports(label):{})},label);}
await f.run(async()=>{
 const {doc:seed}=await f.inspect('prepare',{}, {prepare:true});await f.newPage();await f.page.setViewportSize({width:1440,height:1000});await f.page.evaluate(observe);
 await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'body-scope.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await f.same(seed);await f.ready();await drawing();
 await f.page.waitForFunction(()=>window.__bodyDrawings.some(r=>r.drawing.ok&&!r.options.body));const all=await f.page.evaluate(()=>window.__bodyDrawings.findLast(r=>r.drawing.ok&&!r.options.body));assert.ok(Math.abs(all.drawing.views.front.max[0]-all.drawing.views.front.min[0]-40)<1e-7);await f.snapshot('01-whole-part-occluder');
 const controls=f.page.getByLabel('Drawing body scope',{exact:true});await controls.locator(':scope > summary').click();await f.page.getByLabel('Drawing native body',{exact:true}).selectOption('b1');assert.deepEqual(await f.doc(),seed,'selection alone not accepted');await button('Use body for drawing').click();await f.page.waitForFunction(()=>window.__studioDoc.drawing.scope?.body?.key==='b1');const selected=await f.doc();assert.deepEqual(selected.nodes,seed.nodes);assert.deepEqual(selected.outputs,seed.outputs);await verify(selected,'02-A-only',30,true);await f.snapshot('02-A-only');
 await button('Use whole base part').click();await f.page.waitForFunction(()=>!window.__studioDoc.drawing.scope?.body);await f.undo();await f.same(selected);await drawing();await button('Auto-dimension').click();await f.page.waitForFunction(()=>window.__studioDoc.drawing.dimensions.length>0);const dimensioned=await f.doc();assert.deepEqual(dimensioned.drawing.scope,selected.drawing.scope);assert.ok(dimensioned.drawing.dimensions.every(d=>!JSON.stringify(d).includes('n3.')));await verify(dimensioned,'03-auto-selected',30);
 await button('Model').click();await f.openFeatureEditor(1);await f.editor().getByLabel('Width',{exact:true}).fill('40');const grown=(await f.applyEditor(dimensioned,'04-width40')).doc;assert.deepEqual(grown.nodes.slice(1),dimensioned.nodes.slice(1));assert.deepEqual(grown.drawing.scope,selected.drawing.scope);await verify(grown,'04-width40-drawing',40,true);await f.snapshot('04-width40-drawing');
 await f.undo();await f.same(dimensioned);await drawing();await f.redo();await f.same(grown);await drawing();
 const saved=await f.save('body-scope');await f.freshOpen(saved.file,grown,'05-fresh-open');await f.page.evaluate(observe);await verify(grown,'06-fresh-drawing',40,true);await f.snapshot('06-fresh-drawing');
 f.report.observations.push({scope:selected.drawing.scope,explicitWholeReturnAndUndo:true,sourceEdit:'A width30→40, all other nodes unchanged',actualRemaining:['revolve','samekey different document','late reply','suppression/delete/split','manual-reference refusal'],nativeVolumes:[2160,2880],originalOtherBodyRetained:true});
});
