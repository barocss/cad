import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '../src/engine/doc';
import { drawingInputs } from '../src/chat/drawing';
import { issueContext } from '../src/drawing/issues';
import { defaultDrawing, readDrawing, type XY, type DrawingSection } from '../src/drawing/types';
import { snapPoints } from '../src/drawing/dimensions';
import { hatch, type Mark } from '../src/drawing/sheet';
import { hatchTextExclusion, subtractHatchText } from '../src/drawing/hatchClearance';
import { marksSvg, sheetSvg } from '../src/io/svg';
import { sheetPdf } from '../src/io/pdf';
import { sheetDxf } from '../src/io/dxf';

const box = (a: number, b: number, c: number, d: number): XY[] => [[a,b],[c,b],[c,d],[a,d]];
const line = (a: XY, b: XY): Extract<Mark,{kind:'line'}> => ({kind:'line',a,b,pen:'thin'});
const spans = (lines: readonly Extract<Mark,{kind:'line'}>[]) => lines.map(l=>[l.a[0],l.b[0]]);

test('union subtraction never fills an existing material hole and preserves original inputs',()=>{
  const lines=[line([0,5],[8,5]),line([12,5],[20,5])], before=JSON.stringify(lines);
  assert.deepEqual(spans(subtractHatchText(lines,[box(6,4,14,6)])),[[0,6],[14,20]]);
  assert.deepEqual(spans(subtractHatchText(lines,[box(6,4,11,6),box(9,4,14,6)])),[[0,6],[14,20]]);
  assert.deepEqual(spans(subtractHatchText(lines,[box(6,4,14,6),box(6,4,14,6)])),[[0,6],[14,20]]);
  assert.equal(JSON.stringify(lines),before);
});
test('outside, whole, diagonal, reversed winding and malformed boxes have bounded behavior',()=>{
  const lines=[line([0,0],[10,10])];
  assert.deepEqual(subtractHatchText(lines,[box(20,20,30,30)]),lines);
  assert.deepEqual(subtractHatchText(lines,[box(-1,-1,11,11)]),[]);
  const clipped=subtractHatchText(lines,[box(4,4,6,6).reverse()]);
  assert.deepEqual(clipped,[line([0,0],[4,4]),line([6,6],[10,10])]);
  assert.deepEqual(subtractHatchText(lines,[[[0,0],[NaN,0],[1,1],[0,1]]]),lines);
});
test('text clearance follows rotated conservative bounds and includes half stroke plus visible gap',()=>{
  const q=hatchTextExclusion({kind:'text',at:[10,10],text:'60',size:2.5,anchor:'middle',angle:90},.25)!;
  assert.equal(q.length,4);
  const width=Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1]);
  assert.ok(Math.abs(width-(2*.556*2.5+2*(.6+.125+.0002)))<1e-10);
  assert.equal(hatchTextExclusion({kind:'text',at:[0,0],text:'',size:2.5,anchor:'middle'},.25),null);
});

function fixture() {
  const doc=rectanglePart(60,40,20);
  let settings=readDrawing({...defaultDrawing(),scope:{kind:'part'},scale:1,sections:[{id:'A',view:'top',at:-10}],dimensions:[]});
  const input=()=>{const i=drawingInputs(doc,settings);assert.ok(typeof i!=='string',String(i));return i;};
  const first=issueContext(input()).sheet.sections!.find(s=>s.id==='A')!, points=snapPoints(first.projection);
  const xs=points.map(p=>p.at[0]),ys=points.map(p=>p.at[1]);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys);
  const at=(x:number,y:number)=>{const p=points.find(p=>Math.abs(p.at[0]-x)<1e-8&&Math.abs(p.at[1]-y)<1e-8);assert.ok(p);return p.ref;};
  settings=readDrawing({...settings,dimensions:[{id:'inside',view:'section:A',kind:'linear',orient:'horizontal',a:at(xmin,ymin),b:at(xmax,ymin),place:[(xmin+xmax)/2,(ymin+ymax)/2]}]});
  const i=input();return {doc,i,make:(on?:boolean)=>issueContext({...i,meta:{...i.meta,svgSectionTextClearance:on}})};
}
const exclusions=(c:ReturnType<typeof issueContext>)=>c.sheet.groups.flatMap(g=>g.marks.filter((m):m is Extract<Mark,{kind:'hatch'}>=>m.kind==='hatch'&&!!m.svgTextExclusions));
test('opt-in adds only transient section hatch metadata; absent/false and PDF/DXF retain exact output',()=>{
  const {doc,i,make}=fixture(),before=JSON.stringify({doc,i}),plain=make(),off=make(false),on=make(true);
  assert.deepEqual(off.sheet,plain.sheet);
  assert.equal(exclusions(plain).length,0);assert.equal(exclusions(on).length,1);
  const stripped={...on.sheet,groups:on.sheet.groups.map(g=>({...g,marks:g.marks.map(m=>{if(m.kind!=='hatch')return m;const rest={...m};delete rest.svgTextExclusions;return rest;})}))};
  assert.deepEqual(stripped,plain.sheet);
  assert.notEqual(sheetSvg(on.sheet,'clearance'),sheetSvg(plain.sheet,'clearance'));
  assert.deepEqual(sheetPdf(on.sheet,'clearance'),sheetPdf(plain.sheet,'clearance'));
  for(const version of ['AC1009','AC1015'] as const) assert.equal(sheetDxf(on.sheet,on.layout,version).text,sheetDxf(plain.sheet,plain.layout,version).text);
  assert.equal(JSON.stringify({doc,i}),before);
  const h=exclusions(on)[0];
  const raw=hatch(h.rings,h.spacing,h.angle);assert.ok(subtractHatchText(raw,h.svgTextExclusions!).length>0);
});
test('basic, unresolved, duplicate dimension and duplicate section identities receive no clearance',()=>{
  const {i}=fixture(),make=(next:typeof i)=>issueContext({...next,meta:{...next.meta,svgSectionTextClearance:true}});
  const d=i.settings.dimensions[0];
  assert.equal(exclusions(make({...i,settings:{...i.settings,dimensions:[{...d,basic:true}]}})).length,0);
  assert.equal(exclusions(make({...i,settings:{...i.settings,dimensions:[{...d,view:'section:Z'}]}})).length,0);
  assert.equal(exclusions(make({...i,settings:{...i.settings,dimensions:[d,{...d}]}})).length,0);
  assert.equal(exclusions(make({...i,sections:[...i.sections!,...i.sections!]})).length,0);
  assert.equal(exclusions(make({...i,settings:{...i.settings,scope:undefined,balloons:true}})).length,0,'implicit assembly is not a base part');
});
test('SVG marks without opt-in metadata, including annotation hatch, remain original hatch lines',()=>{
  const h:Extract<Mark,{kind:'hatch'}>={kind:'hatch',rings:[box(0,0,20,10),box(8,3,12,7)],spacing:2.5,angle:45,pen:'thin'};
  assert.equal(marksSvg([h]),marksSvg(hatch(h.rings,h.spacing,h.angle)));
  assert.deepEqual(h.rings,[box(0,0,20,10),box(8,3,12,7)]);
});


test('production sheet protects stacked single-unit deviations and the complete inline dual label',()=>{
  const {i}=fixture(), d=i.settings.dimensions[0];
  for(const dual of [false,true]) {
  const settings={...i.settings,dual,dimensions:[{...d,tol:{kind:'deviation' as const,upper:.05,lower:-.1}}]};
  const before=JSON.stringify({settings,sections:i.sections});
  const on=issueContext({...i,settings,meta:{...i.meta,svgSectionTextClearance:true}});
  const off=issueContext({...i,settings,meta:{...i.meta,svgSectionTextClearance:false}});
  const resolved=on.sheet.dimensions[0];assert.ok(resolved.ok);assert.equal(resolved.value,60);
  const texts=on.sheet.groups.find(g=>g.role==='dimension'&&g.id===d.id)!.marks.filter((m):m is Extract<Mark,{kind:'text'}>=>m.kind==='text');
  // Existing valueMarks policy stacks deviations only without an alternate unit.
  assert.equal(texts.length,dual?1:3,dual?'dual deviations intentionally stay inline':'single-unit nominal and two deviations are separate marks');
  if(dual) assert.match(texts[0].text,/\[.*\]/,'the one protected label includes the alternate-unit payload');
  const h=exclusions(on)[0];assert.ok(h);
  assert.equal(h.svgTextExclusions!.length,texts.length);
  assert.deepEqual(h.svgTextExclusions,texts.map(t=>hatchTextExclusion(t,.25)),'each final label text has its own expanded quad');
  assert.deepEqual(on.sheet.groups.filter(g=>g.role!=='section'),off.sheet.groups.filter(g=>g.role!=='section'));
  assert.deepEqual(on.sheet.sections,off.sheet.sections);
  assert.equal(JSON.stringify({settings,sections:i.sections}),before);
  }
});

test('production alternate section forms and broken view do not acquire SVG text-clearance metadata',()=>{
  const {doc,i}=fixture();
  const forms:DrawingSection[]=[
    {id:'A',view:'top',at:-10,half:{line:'vertical',at:30,cut:'after'}},
    {id:'A',view:'top',at:-10,steps:[{past:30,at:-12}]},
    {id:'A',view:'top',at:-10,removed:{at:[220,100],scale:1}},
    {id:'A',view:'top',at:-10,revolved:true},
  ];
  for(const section of forms){
    const settings={...i.settings,sections:[section]}, before=JSON.stringify(settings);
    const input=drawingInputs(doc,settings);assert.ok(typeof input!=='string',String(input));
    assert.ok(input.sections?.some(s=>s.id==='A'),'actual section projection exists');
    const made=issueContext({...input,meta:{...input.meta,svgSectionTextClearance:true}});
    assert.equal(exclusions(made).length,0,JSON.stringify(section));
    assert.equal(JSON.stringify(settings),before);
  }
  const settings={...i.settings,breaks:[{axis:'x' as const,from:20,to:30}]};
  const made=issueContext({...i,settings,meta:{...i.meta,svgSectionTextClearance:true}});
  assert.ok(made.layout.views.top.breaks?.length,'real parent view is broken');
  assert.equal(exclusions(made).length,0);
});

test('deleting or losing the label removes its derived clearance without mutating the prior sheet or source rings',()=>{
  const {i,make}=fixture(), protectedSheet=make(true);
  assert.equal(exclusions(protectedSheet).length,1);
  const prior=JSON.stringify(protectedSheet.sheet), source=JSON.stringify(i);
  const deleted=issueContext({...i,settings:{...i.settings,dimensions:[]},meta:{...i.meta,svgSectionTextClearance:true}});
  assert.equal(exclusions(deleted).length,0);
  const d=i.settings.dimensions[0];assert.equal(d.kind,'linear');if(d.kind!=='linear')return;
  const lost=issueContext({...i,settings:{...i.settings,dimensions:[{...d,a:{...d.a,edge:'missing-original-edge'}}]},meta:{...i.meta,svgSectionTextClearance:true}});
  assert.equal(lost.sheet.dimensions[0].ok,false);
  assert.equal(exclusions(lost).length,0);
  assert.deepEqual(deleted.sheet.sections,protectedSheet.sheet.sections);
  assert.deepEqual(lost.sheet.sections,protectedSheet.sheet.sections);
  assert.equal(JSON.stringify(protectedSheet.sheet),prior);
  assert.equal(JSON.stringify(i),source);
});
