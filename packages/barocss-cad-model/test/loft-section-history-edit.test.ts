import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { loftSectionHistoryEdit } from '../src/app/loftSectionHistoryEdit';
import { loftSections } from '../src/app/profiles';
import { emptyDoc, withNode, type StudioDoc, type ModelNode } from '../src/engine/doc';
import { toPartDocument } from '../src/engine/part';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
function fixture():StudioDoc {
 let doc=emptyDoc();
 for(const [z,size] of [[0,20],[10,10],[20,20]])doc=withNode(doc,{kind:'sketch',profile:'rectangle',min:[-size/2,-size/2],max:[size/2,size/2],...(z?{plane:{origin:[0,0,z],normal:[0,0,1],xAxis:[1,0,0]}}:{})});
 const copied=loftSections(doc.nodes,[0,1,2]);assert.ok('sections' in copied);
 for(const section of copied.sections)doc=withNode(doc,section.node);
 return withNode(doc,{kind:'loft',sections:copied.sections.map((s,i)=>({sketch:i+3,z:s.z})),from:[0,1,2]});
}
const ctx=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}});
function build(doc:StudioDoc,middle='remove'){const c=loftSectionHistoryEdit(doc,6);assert.ok(c?.build);return c.build(ctx(doc),{middle});}
const patch=(d:StudioDoc,i:number,p:object):StudioDoc=>({...d,nodes:d.nodes.map((n,j)=>i===j?{...n,...p} as ModelNode:n)});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function output(doc:StudioDoc){const o=evaluateCadPart(toPartDocument(doc)).outputs;assert.equal(o.length,1);assert.equal(checkBrep(o[0].brep,{strict:true}).valid,true);return o[0];}
test('remove is a section/from-only edit with all source/copy nodes, IDs and outputs preserved',()=>{
 const doc=fixture(),before=structuredClone(doc),next=build(doc);const loft=doc.nodes[6];assert.ok(loft.kind==='loft');
 assert.equal(build(doc,'keep'),doc);assert.equal(next.nodes.length,7);assert.equal(next.nextId,doc.nextId);assert.equal(next.outputs,doc.outputs);
 for(let i=0;i<6;i++)assert.equal(next.nodes[i],doc.nodes[i]);
 assert.deepEqual(next.nodes[6],{...loft,sections:[loft.sections[0],loft.sections[2]],from:[0,2]});assert.deepEqual(doc,before);
 assert.equal(loftSectionHistoryEdit(next,6),null);
});
test('native independent volume, centroid and box corners survive Save/Open',async()=>{
 const doc=fixture();near(massPropertiesOf(output(doc)).volume,14000/3);
 const next=build(doc),opened=await readStudioFile(encodeStudioFile(next));assert.ok('doc' in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(next)));
 for(const d of [next,opened.doc]){const out=output(d),mass=massPropertiesOf(out);near(mass.volume,8000);[0,0,10].forEach((v,i)=>near(mass.centroid[i],v));
  const points=out.brep.vertices.map(v=>v.point);for(const x of [-10,10])for(const y of [-10,10])for(const z of [0,20])assert.ok(points.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-7));
 }
});
test('editing original source rectangles does not regenerate the private saved copies',()=>{
 const doc=patch(fixture(),0,{min:[-30,-40],max:[30,40]}),before=structuredClone(doc),next=build(doc);
 near(massPropertiesOf(output(next)).volume,8000);assert.equal(next.nodes[0],doc.nodes[0]);assert.deepEqual(doc,before);
});
test('owner identity, content revision and invalid choice refuse without mutation',()=>{
 const doc=fixture(),before=structuredClone(doc),c=loftSectionHistoryEdit(doc,6);assert.ok(c?.build&&c.available);
 const foreign=structuredClone(doc);assert.equal(c.available(ctx(foreign)).ok,false);assert.throws(()=>c.build!(ctx(foreign),{middle:'remove'}));
 assert.throws(()=>c.build!(ctx(doc),{middle:'other'}));assert.deepEqual(doc,before);
 doc.parameters.changed=1;assert.equal(c.available(ctx(doc)).ok,false);assert.throws(()=>c.build!(ctx(doc),{middle:'remove'}));
});
test('nonrectangular copies, metadata, IDs, references and adversarial stations are not offered',()=>{
 const base=fixture(),loft=base.nodes[6];assert.ok(loft.kind==='loft');
 const loops=[[[0,0],[10,10],[0,10],[10,0]],[[0,0],[10,1],[10,10],[0,10]],[[0,0],[0,0],[10,10],[0,10]],[[0,0],[Infinity,0],[10,10],[0,10]]];
 const docs:StudioDoc[]=loops.map(points=>patch(base,4,{segments:points.map(start=>({kind:'line',start}))}));
 for(const props of [{smooth:true},{guide:{}},{guides:[]},{made:{}},{from:[0,0,2]},{from:[0,1,3]},{from:[0,1]},{id:'n0'},
 {sections:[loft.sections[0],{sketch:4,z:0},loft.sections[2]]},{sections:[loft.sections[0],{sketch:4,z:NaN},loft.sections[2]]},
 {sections:[loft.sections[0],{sketch:4,z:10,frame:{}},loft.sections[2]]}])docs.push(patch(base,6,props));
 docs.push({...base,nodes:[...base.nodes,base.nodes[0]]},{...base,drawing:{} as StudioDoc['drawing']},patch(base,0,{association:{}}),patch(base,4,{sideTags:{}}),{...base,outputs:{Body:{node:5,side:'solid'}}});
 for(const doc of docs)assert.equal(loftSectionHistoryEdit(doc,6),null,JSON.stringify(doc));
});
test('native failure preserves source and explicit valid outputs retain their identity',()=>{
 const base=fixture(),loft=base.nodes[6];assert.ok(loft.kind==='loft');
 const tiny=patch(base,6,{sections:[loft.sections[0],{sketch:4,z:1e-12},{sketch:5,z:2e-12}]}),before=structuredClone(tiny);
 assert.ok(loftSectionHistoryEdit(tiny,6));assert.throws(()=>build(tiny));assert.deepEqual(tiny,before);
 const doc={...base,outputs:{Body:{node:6,side:'solid' as const}}};assert.equal(build(doc).outputs,doc.outputs);
});
test('existing native cyclic seam alignment preserves rectangular geometry, not a forced twist',()=>{
 const base=fixture(),nodes=base.nodes.map((n,i)=>{
  if(i!==4&&i!==5)return n;
  assert.ok(n.kind==='sketch'&&n.profile==='loop');const shift=i===4?1:2;
  return {...n,segments:[...n.segments.slice(shift),...n.segments.slice(0,shift)]};
 });
 const doc={...base,nodes},before=structuredClone(doc);near(massPropertiesOf(output(doc)).volume,14000/3);
 const result=build(doc),out=output(result);near(massPropertiesOf(out).volume,8000);
 const points=out.brep.vertices.map(v=>v.point);assert.equal(points.length,8);
 for(const x of [-10,10])for(const y of [-10,10])for(const z of [0,20])assert.ok(points.some(p=>Math.hypot(p[0]-x,p[1]-y,p[2]-z)<1e-7));
 assert.deepEqual(doc,before);
});

test('live absent Direct has the same admission and saved result; defined Direct stays excluded',()=>{
 const live={...fixture(),direct:undefined},saved=JSON.parse(JSON.stringify(live));
 assert.ok(loftSectionHistoryEdit(live,6));assert.ok(loftSectionHistoryEdit(saved,6));
 assert.deepEqual(JSON.parse(JSON.stringify(build(live))),build(saved));
 for(const direct of [null,{}, {objects:[]}])assert.equal(loftSectionHistoryEdit({...live,direct} as unknown as StudioDoc,6),null);
});
