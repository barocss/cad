import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createFlow, sha256 } from './flow-helper.mjs';

const f = await createFlow({
  name: 'section-hatch-text-clearance-actual', envFrozen: 'SECTION_HATCH_TEXT_CLEARANCE_FROZEN', output: process.argv[2],
  qualification: '#247 bounded screen/SVG hatch clearance, real label drag, Undo/Redo and native Save/fresh Open.',
  initialFiles: ['apps/cad-studio/test/section-hatch-text-clearance-actual-browser.mjs', 'packages/barocss-cad-model/src/drawing/sheet.ts', 'packages/barocss-cad-model/src/drawing/text.ts', 'packages/barocss-cad-model/src/io/svg.ts', 'apps/cad-studio/src/ui/DrawingWorkspace.tsx', 'apps/cad-studio/src/ui/useDrawingSheet.ts', 'apps/cad-studio/src/ui/drawing/ExportActions.tsx', 'packages/barocss-cad-model/src/drawing/hatchClearance.ts', 'packages/barocss-cad-model/src/drawing/sectionTextClearanceScope.ts', 'packages/barocss-cad-model/src/engine/bodyTopology.ts', 'packages/barocss-cad-model/src/chat/drawing.ts'],
  limits: ['Bounded single made base solid full-section/manual horizontal linear acceptance, not complete #247.', 'Synthetic rectangle source and manual dimension prepared using actual projected endpoint references; mouse authoring is not tested.', 'Product textCorners supplies conservative typographic bounds, not glyph ink. Independent Python clips actual downloaded SVG line segments against that quadrilateral; no CAD geometry is recreated.', 'No actual PDF/DXF, tolerances, dual units, multi-body, broken/half/detail/assembly sections, source edits or late worker qualification; those require separate tests.'],
  inspectorSource: `
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rectanglePart} from '@barocss/cad-model/engine/doc';
import {drawingInputs} from '@barocss/cad-model/chat/drawing';
import {issueContext} from '@barocss/cad-model/drawing/issues';
import {defaultDrawing,readDrawing} from '@barocss/cad-model/drawing/types';
import {snapPoints} from '@barocss/cad-model/drawing/dimensions';
import {textCorners} from '@barocss/cad-model/drawing/text';
const supplied=JSON.parse(readFileSync(process.argv[2],'utf8'));
const doc=supplied.nodes?supplied:rectanglePart(60,40,20);
let settings=readDrawing({...defaultDrawing(),scope:{kind:'part'},scale:1,sections:[{id:'A',view:'top',at:-10}],dimensions:[]});
const inputs=()=>{const i=drawingInputs(doc,settings);assert.ok(typeof i!=='string',String(i));return i;};
const first=issueContext(inputs()), section=first.sheet.sections?.find(s=>s.id==='A');assert.ok(section);
const points=snapPoints(section.projection), xs=points.map(p=>p.at[0]),ys=points.map(p=>p.at[1]);
const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
const endpoint=(x,y)=>{const p=points.find(p=>Math.abs(p.at[0]-x)<1e-8&&Math.abs(p.at[1]-y)<1e-8);assert.ok(p);return p.ref;};
settings=readDrawing({...settings,dimensions:[{id:'hatch-width',kind:'linear',view:'section:A',orient:'horizontal',a:endpoint(xmin,ymin),b:endpoint(xmax,ymin),place:[(xmin+xmax)/2,(ymin+ymax)/2]}]});
if(supplied.nodes) settings=readDrawing(supplied.drawing);
const sheet=issueContext(inputs()).sheet,r=sheet.dimensions.find(r=>r.dim.id==='hatch-width');assert.ok(r?.ok);assert.equal(r.value,60);
const group=sheet.groups.find(g=>g.role==='dimension'&&g.id==='hatch-width');assert.ok(group);
const texts=group.marks.filter(m=>m.kind==='text');assert.equal(texts.length,1);
const text=texts[0];assert.ok(!text.angle,'horizontal actual fixture');const quad=textCorners(text.at,text.text,text.size,text.anchor,text.angle??0,text.bold??false);
const hatches=sheet.groups.find(g=>g.role==='section'&&g.id==='A')?.marks.filter(m=>m.kind==='hatch');assert.equal(hatches?.length,1);assert.ok(hatches[0].svgTextExclusions?.length,'production caller enables derived clearance');
console.log(JSON.stringify({doc:{...doc,drawing:settings},value:r.value,text,quad,materialRings:hatches[0].rings,section:'A',dimension:'hatch-width'}));
`,
  oracleSource: String.raw`
import json,sys,xml.etree.ElementTree as ET,math
x=json.load(sys.stdin); root=ET.fromstring(x['svg']); ns={'s':'http://www.w3.org/2000/svg'}
def group(cls,id):
    a=[g for g in root.findall('.//s:g',ns) if cls in g.get('class','').split() and g.get('data-dim')==id and (cls!='section' or g.get('data-view') is None)]
    assert len(a)==1,(cls,id,len(a));return a[0]
dim=group('dimension',x['dimension']);sec=group('section',x['section'])
texts=dim.findall('s:text',ns);assert len(texts)==1
t=texts[0]; m=x['text'];assert ''.join(t.itertext())==m['text']
for key,v in [('x',m['at'][0]),('y',m['at'][1]),('font-size',m['size'])]:assert abs(float(t.get(key))-v)<0.00011
assert t.get('text-anchor','start')==m['anchor'],'actual text anchor matches bound authority'
assert t.get('font-weight','normal')==('bold' if m.get('bold',False) else 'normal'),'actual weight matches bound authority'
assert not t.get('transform'),'baseline horizontal text only'
q=x['quad']
def cross(a,b):return a[0]*b[1]-a[1]*b[0]
def sub(a,b):return [a[0]-b[0],a[1]-b[1]]
area=sum(cross(q[i],q[(i+1)%len(q)]) for i in range(len(q)));sign=1 if area>0 else -1
# Parametric convex half-plane clipping. No product hatch generator or CAD evaluator.
def inside_length(a,b):
    lo,hi=0.,1.; d=sub(b,a)
    for i,p in enumerate(q):
        edge=sub(q[(i+1)%len(q)],p);c=sign*cross(edge,sub(a,p));v=sign*cross(edge,d)
        if abs(v)<1e-12:
            if c<0:return 0.
        elif v>0:lo=max(lo,-c/v)
        else:hi=min(hi,-c/v)
    return max(0.,hi-lo)*math.hypot(*d)
# This simple section has only material hatch as direct thin nondashed LINEs;
# contours are paths/polylines, and the cutting-plane annotation is another group.
segments=[]
for e in sec.findall('s:line',ns):
    if abs(float(e.get('stroke-width','0'))-.25)<1e-9 and not e.get('stroke-dasharray'):
        segments.append(([float(e.get('x1')),float(e.get('y1'))],[float(e.get('x2')),float(e.get('y2'))]))
assert segments,'actual SVG hatch segments missing'
lengths=[inside_length(a,b) for a,b in segments];hits=[v for v in lengths if v>1e-5]
assert not hits,('hatch enters original final text bounds',hits)
# Independent axis-aligned visual clearance oracle for this horizontal fixture.
# Centerlines must remain outside text bounds + .6mm margin + .125mm round-cap radius.
q=[[p[0]+(-.7248 if i in [0,3] else .7248),p[1]+(-.7248 if i in [0,1] else .7248)] for i,p in enumerate(q)]
assert all(inside_length(a,b)<1e-5 for a,b in segments),'round-cap clearance violated'
# Independent point-in-polygon test: text corners really lie inside material,
# rather than the baseline being only a nearby annotation collision.
def inside(p,poly):
    hit=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a[1]>p[1])!=(b[1]>p[1]) and p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]:hit=not hit
    return hit
assert all(sum(inside(p,ring) for ring in x['materialRings'])%2==1 for p in q)
print(json.dumps({'status':'PASS','mode':'ACTUAL_SVG','actualSVGSegments':len(segments),'intersectingSegments':len(hits),'lengthInsideTextBoundsMM':sum(hits),'value':x['value'],'textQuadInsideMaterial':True,'productGeometryRecreated':False}))
`,
});
async function drawing(){
  if(!(await f.page.locator('svg[aria-label="Drawing sheet"]').count())) await f.page.getByRole('button',{name:'Drawing',exact:true}).click();
  await f.page.waitForFunction(()=>window.__studioDrawing?.()?.dimensions?.some(d=>d.id==='hatch-width'&&d.value===60));
  await f.page.locator('svg[aria-label="Drawing sheet"] g.dimension[data-dim="hatch-width"]').waitFor();
}
async function check(label){
  const before=await f.doc(), seed=await f.inspect(label,before);
  await drawing();
  await f.page.getByText('Screen/SVG', {exact:false}).first().waitFor();
  await f.snapshot(label);
  const pending=f.page.waitForEvent('download');await f.page.getByRole('button',{name:'Export SVG',exact:true}).click();
  const download=await pending,file=join(f.output,label+'.svg');await download.saveAs(file);assert.equal(await download.failure(),null);
  const bytes=await readFile(file);f.report.files.push({kind:'svg',file,sha256:sha256(bytes),bytes:bytes.length,originalDownload:true});
  const {doc:_,...geometry}=seed;await f.runOracle({...geometry,svg:bytes.toString('utf8')},label);await f.same(before);
}
await f.run(async()=>{
  f.phase='Prepare real projected reference fixture';const seed=await f.inspect('prepare',{});await f.newPage();
  await f.page.getByLabel('Model file',{exact:true}).setInputFiles({name:'section-text-clearance.bcad',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed.doc))});
  await f.same(seed.doc);const original=await f.doc();await drawing();await check('01-protected');
  f.phase='Move the real dimension label';
  const points=await f.page.locator('svg[aria-label="Drawing sheet"] g.dimension[data-dim="hatch-width"] text').evaluate(n=>{
    const b=n.getBBox(),m=n.getScreenCTM(),p=new DOMPoint(b.x+b.width/2,b.y+b.height/2).matrixTransform(m),q=new DOMPoint(b.x+b.width/2,b.y+b.height/2+8).matrixTransform(m);return [[p.x,p.y],[q.x,q.y]];
  });
  await f.page.mouse.move(...points[0]);await f.page.mouse.down();await f.page.mouse.move(...points[1],{steps:8});await f.page.mouse.up();await f.changed(original);
  const moved=await f.doc();assert.notDeepEqual(moved.drawing.dimensions[0].place,original.drawing.dimensions[0].place);
  const restored=structuredClone(moved);restored.drawing.dimensions[0].place=original.drawing.dimensions[0].place;assert.deepEqual(restored,original,'only label placement changes');
  await check('02-moved');await f.undo();await f.same(original);await check('03-undo');await f.redo();await f.same(moved);await check('04-redo');
  const saved=await f.save('protected-native');assert.deepEqual(saved.doc,moved);await f.freshOpen(saved.file,saved.doc,'05-native-open');await drawing();await check('06-reopened');
  f.report.observations.push({actualDownload:true,nativeSaveFreshOpen:true,oneUndoRedo:true,onlyLabelPlaceChanged:true,referenceValue:60,scope:'single made solid, full section A, manual horizontal linear text'});
});
