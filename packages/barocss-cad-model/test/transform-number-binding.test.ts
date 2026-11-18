import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields, type BindableField } from '../src/app/editFields';
import { rectanglePart, withNode, type StudioDoc, type ModelNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
function fixture(kind: 'rotate' | 'scale'): StudioDoc {
 const doc=rectanglePart(10,6,4), parent={node:1,side:'solid' as const}, pivot:[number,number,number]=[1,2,3];
 const node:ModelNode=kind==='rotate'?{kind, parent,axis:'z',angle:90,pivot}:{kind,parent,factor:2,pivot};
 return withNode({...doc,parameters:{Value:kind==='rotate'?120:1.5,P:5,Width:12,Height:7}},node);
}
function field(doc:StudioDoc,key:string,index=2){const f=editFields(doc.nodes,index,doc.parameters).find(f=>f.key===key);assert.ok(f?.kind==='number');return f;}
function body(doc:StudioDoc){const r=evaluateDoc(doc,1);assert.ok(r.ok,JSON.stringify(r));return r.bodies[0];}
function close(a:number,b:number){assert.ok(Math.abs(a-b)<1e-7,`${a} vs ${b}`);}
for(const kind of ['rotate','scale'] as const){
 const key=kind==='rotate'?'deg':'k';
 test(`${kind} scalar field does not expose an unsupported parameter API`,()=>{
  const doc=fixture(kind),before=structuredClone(doc);for(const parameters of [doc.parameters,{}, {Value:NaN},Object.create({Value:2})]){
   const f=field({...doc,parameters},key);assert.equal('bind' in f,false);assert.equal('param' in f,false);
  }assert.deepEqual(doc,before);
 });
 test(`${kind} numeric edits preserve inputs and independently match transformed box mass`,()=>{
  const doc=fixture(kind),before=structuredClone(doc),f=field(doc,key);
  for(const value of kind==='rotate'?[90,120]:[2,1.5]){
   const nodes=f.set(doc.nodes,value),next={...doc,nodes},b=body(next);assert.equal(nodes[0],doc.nodes[0]);assert.equal(nodes[1],doc.nodes[1]);assert.equal(f.get(nodes),value);
   const p=[1,2,3],c=[5,3,2],expected=kind==='rotate'?[
    p[0]+(c[0]-p[0])*Math.cos(value*Math.PI/180)-(c[1]-p[1])*Math.sin(value*Math.PI/180),
    p[1]+(c[0]-p[0])*Math.sin(value*Math.PI/180)+(c[1]-p[1])*Math.cos(value*Math.PI/180),c[2]
   ]:c.map((v,i)=>p[i]+value*(v-p[i]));
   close(b.volume!,240*(kind==='scale'?value**3:1));expected.forEach((v,i)=>close(b.centroid![i],v));
  }
  const other=fixture(kind),saved=structuredClone(other);f.set(other.nodes,kind==='rotate'?45:3);assert.deepEqual(other,saved);assert.deepEqual(doc,before);
 });
 test(`${kind} unsupported serialized scalar objects are refused, not silently evaluated`,()=>{
  const doc=fixture(kind),before=structuredClone(doc),f=field(doc,key);
  // Baseline uses the actual exposed binder; after the fix keep the malformed consumer regression.
  const nodes='bind' in f?(f as BindableField).bind(doc.nodes,'Value')!:doc.nodes.map((n,i)=>i===2?{...n,[kind==='rotate'?'angle':'factor']:{parameter:'Value'}} as ModelNode:n);
  assert.ok(nodes);const result=evaluateDoc({...doc,nodes},1);assert.equal(result.ok,false);assert.match(JSON.stringify(result),/INPUT/);assert.deepEqual(doc,before);
 });
 test(`${kind} each pivot binding remains native-equivalent after parameter change and file roundtrip`,async()=>{
  for(let axis=0;axis<3;axis++){
   const doc=fixture(kind),f=field(doc,'p'+axis) as BindableField;assert.equal(typeof f.bind,'function');const nodes=f.bind(doc.nodes,'P');assert.ok(nodes);assert.equal(f.param(nodes),'P');
   assert.equal(f.bind(doc.nodes,'Missing'),null);
   for(const value of [5,8]){
    const bound:StudioDoc={...doc,nodes,parameters:{...doc.parameters,P:value}};const node:ModelNode=nodes[2];assert.ok(node.kind==='rotate'||node.kind==='scale');
    const pivot=[...node.pivot!] as [number,number,number];pivot[axis]=value;
    const literal={...bound,nodes:nodes.map((n,i)=>i===2?{...node,pivot}:n)},a=body(bound),b=body(literal);close(a.volume!,b.volume!);a.centroid!.forEach((v,i)=>close(v,b.centroid![i]));
   }
   const opened=await readStudioFile(encodeStudioFile({...doc,nodes}));assert.ok('doc' in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify({...doc,nodes})));body(opened.doc);
  }
 });
}
test('ordinary Width and Height dimension bindings remain supported',()=>{
 const doc=fixture('rotate');for(const [key,name] of [['w','Width'],['h','Height']]){const f=field(doc,key,1) as BindableField;assert.equal(typeof f.bind,'function');const nodes=f.bind(doc.nodes,name);assert.ok(nodes);assert.equal(f.param(nodes),name);assert.equal(f.get(nodes),doc.parameters![name]);body({...doc,nodes});}
});
