import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
import { editCommand } from '../src/app/editCommand';
import type { Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { emptyDoc, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { toPartDocument } from '../src/engine/part';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
function fixture(dir:[number,number]=[1,0]):StudioDoc {
 return withNode(withNode({...emptyDoc(),parameters:{Position:3}}, {kind:'sketch',profile:'rectangle',min:[10,10],max:[20,30]}),
 {kind:'revolve',sketch:0,axis:'x',origin:[2,3],dir,angle:360});
}
const fields=(doc:StudioDoc,index=doc.nodes.length-1)=>editFields(doc.nodes,index,doc.parameters,undefined,{doc});
function field(doc:StudioDoc){const f=fields(doc).find(f=>f.key==='fixedAxisPosition');assert.ok(f?.kind==='number');return f;}
const patch=(doc:StudioDoc,index:number,value:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===index?{...n,...value} as ModelNode:n)});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);
for(const dir of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][])test(`fixed axis ${dir} changes only perpendicular origin with no binding`,()=>{
 const doc=fixture(dir),before=structuredClone(doc),f=field(doc),k=dir[0]===0?0:1;
 assert.equal(f.label,k===0?'Axis X':'Axis Y');assert.equal('bind' in f,false);assert.equal('param' in f,false);assert.equal(f.get(doc.nodes),[2,3][k]);
 const nodes=f.set(doc.nodes,4),n=nodes[1];assert.ok(n.kind==='revolve');const origin=[2,3];origin[k]=4;
 assert.deepEqual(n,{...doc.nodes[1],origin});assert.equal(nodes[0],doc.nodes[0]);assert.equal(n.dir,(doc.nodes[1] as typeof n).dir);assert.deepEqual(doc,before);
 for(const bad of [NaN,Infinity,-Infinity])assert.deepEqual(f.set(doc.nodes,bad),doc.nodes);
});
test('full-turn cardinal fixed axes match annular volume, centroid, native cylinder radii and file roundtrip',async()=>{
 for(const dir of [[1,0],[-1,0],[0,1],[0,-1]] as [number,number][]){
  const doc=fixture(dir),next={...doc,nodes:field(doc).set(doc.nodes,4)},x=dir[0]!==0;
  const b=evaluateCadPart(toPartDocument(next)).outputs[0],mass=massPropertiesOf(b);assert.ok(checkOutput(b).valid);
  const radii=x?[6,26]:[6,16],length=x?10:20;close(mass.volume,Math.PI*(radii[1]**2-radii[0]**2)*length);
  const centre=x?[15,4,0]:[4,20,0];centre.forEach((v,i)=>close(mass.centroid[i],v));
  const cylinders=b.brep.faces.map(f=>faceGeometry(f)).filter(g=>g.kind==='cylinder');assert.ok(cylinders.length>=2);
  for(const radius of radii)assert.ok(cylinders.some(c=>Math.abs(c.r-radius)<1e-7));
  for(const c of cylinders)close(Math.abs(c.a[x?0:1]),1);
  const opened=await readStudioFile(encodeStudioFile(next));assert.ok('doc' in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(next)));
  close(massPropertiesOf(evaluateCadPart(toPartDocument(opened.doc)).outputs[0]).volume,mass.volume);
 }
});
test('crossing axis is a native refusal and never mutates the accepted document',()=>{
 const doc=fixture(),before=structuredClone(doc);assert.ok(checkOutput(evaluateCadPart(toPartDocument(doc)).outputs[0]).valid);
 const next={...doc,nodes:field(doc).set(doc.nodes,20)};assert.throws(()=>evaluateCadPart(toPartDocument(next)),/profile crosses the axis/);assert.deepEqual(doc,before);
});
const excluded:[number,object][]=[
 [1,{axisRef:{}}],[1,{made:{}}],[1,{held:{reason:'test'}}],[1,{suppressed:true}],[1,{rematched:{a:'b'}}],
 [1,{dir:[1,1]}],[1,{dir:[2,0]}],[1,{dir:[0,0]}],[1,{origin:[NaN,0]}],[1,{origin:[{parameter:'Position'},0]}],
 [1,{sketch:1}],[1,{angle:NaN}],[1,{angle:0}],[1,{angle:361}],[1,{id:'n0'}],[0,{association:{}}],[0,{on:{node:0,side:'solid'}}],[0,{pocketFloor:{}}],
 [0,{held:{reason:'test'}}],[0,{suppressed:true}],[0,{holes:[]}],[0,{plane:{origin:[0,0,0],normal:[0,0,1],xAxis:[1,0,0]}}],[0,{min:[10,10],max:[10,30]}],[0,{min:[NaN,10]}],[0,{profile:'circle',center:[0,0],radius:3}],
];
test('unsupported profiles and axes are not offered and captured setters recheck their current owner',()=>{
 const original=fixture(),f=field(original);
 for(const [index,value] of excluded){const doc=patch(original,index,value),before=structuredClone(doc);assert.equal(fields(doc).some(f=>f.key==='fixedAxisPosition'),false);assert.deepEqual(f.set(doc.nodes,4),doc.nodes);assert.deepEqual(doc,before);}
 const followed=withNode(original,{kind:'translate',parent:{node:1,side:'solid'},offset:[1,0,0]});assert.equal(fields(followed,1).some(f=>f.key==='fixedAxisPosition'),false);assert.deepEqual(f.set(followed.nodes,4),followed.nodes);
});
test('direct and instance documents do not expose the bounded part-only field',()=>{
 const doc=fixture();for(const value of [{direct:{}},{instances:[{}]}])assert.equal(fields({...doc,...value} as StudioDoc).some(f=>f.key==='fixedAxisPosition'),false);
});
test('an independent earlier source box does not invalidate a terminal fixed-axis profile',()=>{
 let doc=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]}),{kind:'extrude',sketch:0,height:10});
 doc=withNode(doc,{kind:'sketch',profile:'rectangle',min:[10,10],max:[20,30]});doc=withNode(doc,{kind:'revolve',sketch:2,axis:'x',origin:[0,0],dir:[1,0],angle:360});
 const next=field(doc).set(doc.nodes,4);assert.equal(next[0],doc.nodes[0]);assert.equal(next[1],doc.nodes[1]);assert.equal(next[2],doc.nodes[2]);assert.ok(next[3].kind==='revolve');assert.deepEqual(next[3].origin,[0,4]);
});

test('History-only position is not exposed or injectable in the drag HUD',()=>{
 const doc=fixture(),cmd=editCommand(1,doc.nodes,doc);assert.ok(cmd?.fields&&cmd.defaults&&cmd.build);
 const ctx:Ctx={doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}};
 assert.equal(cmd.fields(ctx).some(f=>f.key==='fixedAxisPosition'),false);
 const next=cmd.build(ctx,{...cmd.defaults(ctx),fixedAxisPosition:4,deg:180});assert.deepEqual(next.nodes[1],{...doc.nodes[1],angle:180});
});
test('position setter preserves partial-angle and negative direction without rewriting the parallel origin',()=>{
 const doc=patch(fixture([-1,0]),1,{angle:120}),before=structuredClone(doc),nodes=field(doc).set(doc.nodes,-1.234567);
 assert.deepEqual(nodes[1],{...doc.nodes[1],origin:[2,-1.234567]});assert.deepEqual(doc,before);
});
