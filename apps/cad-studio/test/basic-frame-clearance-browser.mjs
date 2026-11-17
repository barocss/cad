import assert from 'node:assert/strict';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createFlow, sha256 } from './flow-helper.mjs';
const driver = 'apps/cad-studio/test/basic-frame-clearance-browser.mjs';
const f = await createFlow({ name: 'basic-frame-clearance', output: process.argv[2], envFrozen: 'BASIC_FRAME_FROZEN', initialFiles: [driver], requiredFrozen: [driver],
 qualification: '#613 pinned +X A4 scale .5: actual acceptance, d1-d5 basic frames versus own line/arrow ink, original SVG/DXF, Undo/Redo and Save/fresh Open.',
 limits: ['Synthetic existing tolerance fixture. Previous partial evidence remains untouched.', 'Independent narrow SVG/DXF coordinate and polygon oracle, not a font rasterizer or general DXF reader. No PDF/ASME claim.', 'Whole-sheet diagnostics are observed separately, not inferred from own-frame clearance. Unboxed same-settings comparison establishes unchanged own strokes, not historical old-renderer pixel identity.'],
 snapshotExtra: () => ({ drawing: window.__studioDrawing?.() ?? null }),
 inspectorSource: `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toleranceLabelFixture, toleranceLegacyMoves } from '../../packages/barocss-cad-model/test/tolerance-label-placement-fixture';
import { acceptAll } from '@barocss/cad-model/drawing/tolerance';
import { drawingInputs } from '@barocss/cad-model/chat/drawing';
import { drawingIssues, issueContext } from '@barocss/cad-model/drawing/issues';
import { readDrawing } from '@barocss/cad-model/drawing/types';
const extra=JSON.parse(process.argv[3]);
function describe(doc){const input=drawingInputs(doc);assert.ok(typeof input!=='string');const ctx=issueContext(input);return {issues:drawingIssues(ctx),layout:ctx.layout,sheet:ctx.sheet,target:ctx.sheet.groups.find(g=>g.role==='dimension'&&g.id==='d5')};}
if(extra.prepare){const {initial,inputs}=await toleranceLabelFixture(readFileSync(extra.rows,'utf8'));const start=performance.now(),result=acceptAll(inputs),elapsed=performance.now()-start;const legacy=toleranceLegacyMoves(inputs,result.accepted);const baselineDoc={...initial,drawing:readDrawing(legacy)},expectedDoc={...initial,drawing:readDrawing(result.settings)};console.log(JSON.stringify({initial,baselineDoc,expectedDoc,baseline:describe(baselineDoc),expected:describe(expectedDoc),elapsed}));}
else{const doc=JSON.parse(readFileSync(process.argv[2],'utf8'));const plain={...doc,drawing:{...doc.drawing,dimensions:doc.drawing.dimensions.map(d=>{const {basic,...rest}=d;return rest;})}};console.log(JSON.stringify({doc,...describe(doc),unboxed:describe(plain)}));}
`,
 oracleSource: String.raw`
import json,math,re,sys,xml.etree.ElementTree as ET
q=json.load(sys.stdin); ns={'s':'http://www.w3.org/2000/svg'}; root=ET.fromstring(q['svg']); assert root.attrib['width']=='297mm' and root.attrib['height']=='210mm'
EPS=.000050001
# Segment distance with intersection AND containment checks; no product helpers.
def cross(a,b,c):return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])
def pointseg(p,a,b):
 dx=b[0]-a[0];dy=b[1]-a[1]; den=dx*dx+dy*dy;t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
 return math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
def segdist(a,b,c,d):
 if cross(a,b,c)*cross(a,b,d)<=0 and cross(c,d,a)*cross(c,d,b)<=0 and max(min(a[0],b[0]),min(c[0],d[0]))<=min(max(a[0],b[0]),max(c[0],d[0])) and max(min(a[1],b[1]),min(c[1],d[1]))<=min(max(a[1],b[1]),max(c[1],d[1])):return 0
 return min(pointseg(a,c,d),pointseg(b,c,d),pointseg(c,a,b),pointseg(d,a,b))
def edges(p):return list(zip(p,p[1:]+p[:1]))
def inside(p,poly):
 signs=[cross(a,b,p) for a,b in edges(poly)];return all(x>=-1e-10 for x in signs) or all(x<=1e-10 for x in signs)
def near(a,b):return len(a)==len(b) and all(abs(x-y)<=EPS for p,r in zip(a,b) for x,y in zip(p,r))
def pts(s):return [[float(x) for x in p.split(',')] for p in s.split()]
raw=q['dxf'].splitlines();assert len(raw)%2==0; ents=[];cur=[]
for i in range(0,len(raw),2):
 code=int(raw[i]);v=raw[i+1]
 if code==0:
  if cur:ents.append(cur)
  cur=[]
 cur.append((code,v))
if cur:ents.append(cur)
def val(e,c):return next((v for k,v in e if k==c),None)
def decode(s):return re.sub(re.escape(chr(92)+'U+')+r'([0-9a-fA-F]{4})',lambda m:chr(int(m[1],16)),s)
def xy(e,a,b):return [float(val(e,a)),210-float(val(e,b))]
def same_set(a,b):return len(a)==len(b) and all(any(math.dist(p,r)<1e-7 for r in b) for p in a)
results=[]
for ident in ['d1','d2','d3','d4','d5']:
 expected='3× 20' if ident=='d5' else '12'
 g=root.find(".//s:g[@data-dim='%s']"%ident,ns);assert g is not None
 group=next(g for g in q['sheet']['groups'] if g.get('id')==ident and g['role']=='dimension'); own=group['marks']
 text=[m for m in own if m['kind']=='text'];assert len(text)==1 and text[0]['text']==expected
 frames=[m for m in own if m['kind']=='polyline' and m.get('role')=='frame'];assert len(frames)==1
 frame=frames[0]['points'][:-1];assert len(frame)==4
 sf=[p for p in g.findall('s:polyline',ns) if len(pts(p.attrib['points']))==5];assert len(sf)==1 and near(pts(sf[0].attrib['points']),frames[0]['points']);assert float(sf[0].attrib['stroke-width'])==.25
 st=g.findall('s:text',ns);assert len(st)==1 and st[0].text==expected;assert near([[float(st[0].attrib['x']),float(st[0].attrib['y'])]],[text[0]['at']])
 strokes=[]
 for el in g.findall('s:line',ns):strokes.append(([[float(el.attrib['x1']),float(el.attrib['y1'])],[float(el.attrib['x2']),float(el.attrib['y2'])]],float(el.attrib['stroke-width'])/2,False))
 for el in g.findall('s:path',ns):
  assert el.attrib.get('stroke')=='none' and el.attrib['d'].endswith('Z')
  nums=[float(x) for x in re.findall(r'-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?',el.attrib['d'])];poly=list(map(list,zip(nums[::2],nums[1::2])));assert len(poly)==3;strokes.append((poly,0,True))
 assert len(strokes)>2
 gaps=[]
 for ps,pen,closed in strokes:
  assert not any(inside(p,frame) for p in ps),(ident,'stroke inside frame')
  if closed:assert not any(inside(p,ps) for p in frame),(ident,'frame inside arrow')
  se=edges(ps) if closed else [(ps[0],ps[1])]
  gap=min(segdist(a,b,c,d) for a,b in edges(frame) for c,d in se)-.125-pen
  assert gap>2*EPS,(ident,'ink clearance',gap);gaps.append(gap)
 # Each emitted SVG own stroke must exist as matching DXF geometry, y flipped.
 for ps,pen,closed in strokes:
  if closed:
   candidates=[]
   for e in ents:
    if val(e,0)=='SOLID':
     points=[xy(e,k,k+10) for k in [10,11,12,13] if val(e,k) is not None];unique=[]
     for point in points:
      if point not in unique:unique.append(point)
     candidates.append(unique)
   assert any(len(c)==len(ps) and all(any(math.dist(p,r)<2*EPS for r in c) for p in ps) for c in candidates),(ident,'DXF arrow')
  else:assert any(val(e,0)=='LINE' and (near(ps,[xy(e,10,20),xy(e,11,21)]) or near(ps,[xy(e,11,21),xy(e,10,20)])) for e in ents),(ident,'DXF line')
 matches=[]
 for e in ents:
  if val(e,0)!='LWPOLYLINE':continue
  points=[[float(x),210-float(y)] for x,y in zip([v for k,v in e if k==10],[v for k,v in e if k==20])]
  if len(points)==5 and points[0]==points[-1]:points.pop()
  if same_set(frame,points):matches.append(e)
 assert len(matches)==1,(ident,'unique DXF frame',len(matches))
 texts=[e for e in ents if val(e,0)=='TEXT' and decode(val(e,1) or '')==expected and math.dist(xy(e,10,20),text[0]['at'])<1e-7];assert len(texts)==1
 results.append({'id':ident,'text':expected,'minimumOwnInkGapFromSVGmm':min(gaps),'svgDxfFrameTextLineArrow':'PASS'})
print(json.dumps({'status':'PASS','dimensions':results,'parserScope':'own-group SVG stroke geometry and corresponding DXF entities, no product imports'}))
` });
const button = name => f.page.getByRole('button', { name, exact: true });
async function drawing() {
 if (!(await f.page.locator('.dw[aria-label="Drawing"]').count())) await button('Drawing').click();
 await f.page.waitForFunction(() => document.querySelector('svg[aria-label="Drawing sheet"] g[data-dim="d4"]'));
}
function captureBlobs() {
 const create=URL.createObjectURL, click=HTMLAnchorElement.prototype.click, urls=new Map(); window.__basicExports=[];
 URL.createObjectURL=function(blob){const url=create.call(this,blob);urls.set(url,blob);return url;};
 HTMLAnchorElement.prototype.click=function(){const blob=urls.get(this.href);if(blob&&/\.(svg|dxf)$/.test(this.download)){window.__basicExports.push({name:this.download,blob});urls.delete(this.href);return;}return click.call(this);};
}
async function exports(label) {
 const out={};
 for(const [kind,name] of [['svg','Export SVG'],['dxf','Export DXF']]){
  const n=await f.page.evaluate(()=>window.__basicExports.length);await button(name).click();await f.page.waitForFunction(n=>window.__basicExports.length>n,n);
  const data=await f.page.evaluate(async n=>{const x=window.__basicExports[n];return {name:x.name,bytes:Array.from(new Uint8Array(await x.blob.arrayBuffer()))};},n);
  const bytes=Buffer.from(data.bytes);await writeFile(join(f.output,`${label}.${kind}`),bytes);out[kind]=bytes.toString(kind==='dxf'?'latin1':'utf8');f.report.files.push({label,kind,bytes:bytes.length,sha256:sha256(bytes),boundary:'original Blob; download anchor suppressed'});
 }return out;
}
function invariants(actual,prepared){
 assert.deepEqual(actual.doc,prepared.expectedDoc);
 for(const id of ['d1','d2','d3','d4']){
  const original=prepared.initial.drawing.dimensions.find(d=>d.id===id), current=actual.doc.drawing.dimensions.find(d=>d.id===id);
  assert.ok(original&&current,id+' exists before and after acceptance');
  const semantic=d=>Object.fromEntries(Object.entries(d).filter(([key])=>!['tol','basic'].includes(key)));
  assert.deepEqual(semantic(current),semantic(original),id+' original references/place/count unchanged');
 }
 for(const id of ['d1','d2','d3','d4']){
  const group=s=>s.groups.find(g=>g.role==='dimension'&&g.id===id);
  const fixed=g=>g.marks.filter(m=>m.kind!=='text'&&!(m.kind==='polyline'&&m.role==='frame'));
  assert.deepEqual(fixed(group(actual.sheet)),fixed(group(actual.unboxed.sheet)),id+' own line/arrow unchanged by basic decoration');
 }
 assert.deepEqual(actual.sheet.dimensions.map(r=>r.ok?[r.dim.id,r.value,r.text]:r),prepared.expected.sheet.dimensions.map(r=>r.ok?[r.dim.id,r.value,r.text]:r));
}
await f.run(async()=>{
 const prepared=await f.inspect('prepare',{}, {prepare:true,rows:join(f.repo,'packages/barocss-cad-model/samples/rows/fastener-sizes.json')});
 await f.newPage();await f.page.setViewportSize({width:1440,height:1000});await f.page.evaluate(captureBlobs);
 await f.page.locator('input[aria-label="Model file"]').setInputFiles({name:'basic-clearance.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(prepared.initial))});await f.same(prepared.initial);await drawing();
 await button('Accept all suggestions').waitFor();await f.snapshot('01-before-accept');await button('Accept all suggestions').click();await f.same(prepared.expectedDoc);await drawing();
 const state=await f.snapshot('02-basic-frames-clear');const actual=await f.inspect('accepted',state.doc,{prepare:false});invariants(actual,prepared);
 assert.deepEqual(state.doc.nodes,prepared.initial.nodes);
 await f.runOracle({...await exports('accepted'),sheet:actual.sheet},'accepted-clearance');
 f.report.observations.push({label:'observed-whole-sheet-diagnostics',issues:actual.issues,unresolvedTextOverLines:actual.issues.filter(i=>i.code==='TEXT_OVER_LINES'),ownFrameProof:'independent SVG/DXF oracle, not inferred from diagnostics'});
 await f.undo();await f.same(prepared.initial);await button('Accept all suggestions').waitFor();await f.redo();await f.same(state.doc);await drawing();
 const redo=await f.inspect('redo',state.doc,{prepare:false});assert.deepEqual(redo.sheet,actual.sheet);await f.snapshot('03-redo');
 const saved=await f.save('basic-clearance');await f.freshOpen(saved.file,state.doc,'04-fresh-open');await drawing();await f.page.evaluate(captureBlobs);
 const fresh=await f.snapshot('05-fresh-open-drawing');const reopened=await f.inspect('fresh',fresh.doc,{prepare:false});invariants(reopened,prepared);assert.deepEqual(reopened.sheet,actual.sheet);await f.runOracle({...await exports('fresh'),sheet:reopened.sheet},'fresh-clearance');
});
