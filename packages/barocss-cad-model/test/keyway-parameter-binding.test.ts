import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc,withNode,featureLabel,type StudioDoc,type ModelNode } from '../src/engine/doc';
import { commands,type Ctx } from '../src/app/commands';
import { editFields,type BindableField } from '../src/app/editFields';
import { evaluateDoc,partBreps } from '../src/engine/evaluate';
import { checkBrep } from '@barocss/cad';
import { encodeStudioFile,readStudioFile } from '../src/engine/container';
function fixture():StudioDoc {
 const c=commands.find(c=>c.id==='tube')!,ctx:Ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
 const tube=c.build!(ctx,{...c.defaults!(ctx),r:20,ri:10,h:22}),i=tube.nodes.length;
 return withNode({...tube,parameters:{Width:7,Depth:3.4,Angle:90,Height:24}},{kind:'keyway',parent:{node:i-1,side:'solid'},face:`n${i-1}.hole0.side0`,width:6,depth:2.8,angle:30});
}
function field(d:StudioDoc,key:string,index=d.nodes.length-1){const f=editFields(d.nodes,index,d.parameters).find(f=>f.key===key);assert.ok(f?.kind==='number');return f;}
function native(d:StudioDoc){const r=evaluateDoc(d,1);assert.ok(r.ok,JSON.stringify(r));assert.ok(checkBrep(partBreps(d)[0].brep,{strict:true}).valid);assert.ok(r.bodies[0].volume!>0);return r.bodies[0];}
for(const [key,param,property] of [['angle','Angle','angle']] as const){
 test(`Keyway ${property} has no unsupported binding interface`,()=>{
 const d=fixture(),before=structuredClone(d);for(const parameters of [d.parameters,{}, {[param]:NaN},Object.create({[param]:1})]){const f=field({...d,parameters},key);assert.equal('bind' in f,false);assert.equal('param' in f,false);}assert.deepEqual(d,before);
 });
 test(`malformed Keyway ${property} parameter object refuses without mutating accepted source`,()=>{
 const d=fixture(),before=structuredClone(d),f=field(d,key),i=d.nodes.length-1;
 const nodes='bind' in f?(f as BindableField).bind(d.nodes,param)!:d.nodes.map((n,k)=>k===i?{...n,[property]:{parameter:param}} as unknown as ModelNode:n);
 assert.ok(nodes);const r=evaluateDoc({...d,nodes},1);assert.equal(r.ok,false);assert.deepEqual(d,before);native(d);
 });
}
test('numeric edits retain bore ownership and geometry across saved file read',async()=>{
 const d=fixture(),before=structuredClone(d),index=d.nodes.length-1;let nodes=d.nodes;
 for(const [key,value,property] of [['b',7,'width'],['t2',3.4,'depth'],['angle',90,'angle']] as const){
 const previous=nodes;nodes=field(d,key).set(nodes,value);assert.deepEqual(nodes[index],{...previous[index],[property]:value});assert.deepEqual(nodes.slice(0,index),d.nodes.slice(0,index));
 const next={...d,nodes},b=native(next),read=await readStudioFile(encodeStudioFile(next));assert.ok('doc' in read);assert.deepEqual(read.doc,JSON.parse(JSON.stringify(next)));const reopened=native(read.doc);assert.ok(Math.abs(b.volume!-reopened.volume!)<1e-8);b.centroid!.forEach((v,k)=>assert.ok(Math.abs(v-reopened.centroid![k])<1e-8));
 }
 assert.equal(Object.hasOwn(field(d,'angle').set(nodes,0)[index],'angle'),false);assert.deepEqual(d,before);
});
test('supported tube Extrude Height binding survives numeric Keyway edits',()=>{
 const d=fixture(),i=d.nodes.findIndex(n=>n.kind==='extrude');assert.ok(i>=0);const h=field(d,'h',i) as BindableField;assert.equal(typeof h.bind,'function');const bound=h.bind(d.nodes,'Height');assert.ok(bound);assert.equal(h.param(bound),'Height');assert.equal(h.bind(d.nodes,'Missing'),null);
 const changed=field(d,'b').set(bound,7),next={...d,nodes:changed};assert.equal(h.param(changed),'Height');native(next);
 const literal={...next,nodes:changed.map((n,k)=>k===i&&n.kind==='extrude'?{...n,height:24}:n)},a=native(next),b=native(literal);assert.ok(Math.abs(a.volume!-b.volume!)<1e-8);a.centroid!.forEach((v,k)=>assert.ok(Math.abs(v-b.centroid![k])<1e-8));
});

test('Width and Depth bindings are native-supported and survive reader roundtrip',async()=>{
 const d=fixture(),before=structuredClone(d),index=d.nodes.length-1;
 for(const [key,param,property] of [['b','Width','width'],['t2','Depth','depth']] as const){
  const f=field(d,key) as BindableField;assert.equal(typeof f.bind,'function');const nodes=f.bind(d.nodes,param);assert.ok(nodes);
  const next={...d,nodes},a=native(next),literal={...d,nodes:nodes.map((n,i)=>i===index?{...n,[property]:d.parameters[param]}:n)},b=native(literal);
  assert.ok(Math.abs(a.volume!-b.volume!)<1e-8);a.centroid!.forEach((v,k)=>assert.ok(Math.abs(v-b.centroid![k])<1e-8));
  const read=await readStudioFile(encodeStudioFile(next));assert.ok('doc' in read);assert.deepEqual(read.doc,JSON.parse(JSON.stringify(next)));native(read.doc);
  assert.equal(f.get(nodes),d.parameters[param]);assert.equal(f.param(nodes),param);
  assert.equal(featureLabel(nodes[index],index,nodes),property==='width'?'Keyway Width × 2.8':'Keyway 6 × Depth');
  const angled=field(d,'angle').set(nodes,90);assert.deepEqual((angled[index] as unknown as Record<string,unknown>)[property],{parameter:param});native({...d,nodes:angled});
  const newValue=property==='width'?8:4,updated={...d,nodes,parameters:{...d.parameters,[param]:newValue}},updatedBody=native(updated);
  assert.equal(field(updated,key).get(nodes),newValue);
  const literalUpdated={...updated,nodes:nodes.map((n,i)=>i===index?{...n,[property]:newValue}:n)},literalBody=native(literalUpdated);assert.ok(Math.abs(updatedBody.volume!-literalBody.volume!)<1e-8);
  const missing={...d,nodes,parameters:{}};assert.equal(evaluateDoc(missing,1).ok,false);assert.equal(f.bind(d.nodes,'Missing'),null);
 }
 assert.deepEqual(d,before);
});
