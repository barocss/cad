import test from 'node:test';
import assert from 'node:assert/strict';
import {part} from '../src/api';
import {editFields,type BindableField} from '../src/app/editFields';
import {featureLabel,type StudioDoc,type ModelNode} from '../src/engine/doc';
import {evaluateDoc,partBreps} from '../src/engine/evaluate';
import {checkBrep} from '@barocss/cad';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
function fixture(bore=false):StudioDoc{
 const base=bore?part('bore').box({w:30,d:30,h:10}).hole(b=>b.faces().facing('+z'),{d:5,x:15,y:15}):part('shaft').cylinder({r:3,h:30});
 const doc=base.thread(b=>b.faces().curved().first(),bore?{pitch:1,diameter:6}:{pitch:1,length:12}).doc;
 return {...doc,parameters:{Pitch:.75,Length:4,Diameter:6,Relief:.5}};
}
function field(d:StudioDoc,key:string){const f=editFields(d.nodes,d.nodes.length-1,d.parameters).find(f=>f.key===key);assert.ok(f?.kind==='number');return f as BindableField;}
function native(d:StudioDoc){const r=evaluateDoc(d,1);assert.ok(r.ok,JSON.stringify(r));assert.ok(r.bodies[0].volume!>0);return {body:r.bodies[0],strict:checkBrep(partBreps(d)[0].brep,{strict:true}).valid};}
const cases=[['pitch','Pitch','pitch',false],['len','Length','length',false],['relief','Relief','relief',false],['diameter','Diameter','diameter',true]] as const;
function prepared(key:string,bore:boolean){const d=fixture(bore);return key==='relief'?{...d,nodes:field(d,key).set(d.nodes,1)}:d;}
for(const [key,param,property,bore] of cases){
 test(`${property} binding native and reader support matches a literal dimension`,async()=>{
  const d=prepared(key,bore),before=structuredClone(d),f=field(d,key),nodes=f.bind(d.nodes,param);assert.ok(nodes);
  const next={...d,nodes},i=nodes.length-1,literal={...d,nodes:nodes.map((n,k)=>k===i?{...n,[property]:d.parameters[param]} as ModelNode:n)};
  const a=native(next),b=native(literal);assert.equal(a.strict,true,'bound strict B-rep');assert.equal(b.strict,true,'literal strict B-rep');assert.ok(Math.abs(a.body.volume!-b.body.volume!)<1e-7);a.body.centroid!.forEach((v,k)=>assert.ok(Math.abs(v-b.body.centroid![k])<1e-7));
  const read=await readStudioFile(encodeStudioFile(next));assert.ok('doc' in read);assert.deepEqual(read.doc,JSON.parse(JSON.stringify(next)));native(read.doc);assert.deepEqual(d,before);
 });
 test(`${property} bound editor resolves value and identifies parameter without crashing feature label`,()=>{
  const d=prepared(key,bore),f=field(d,key),nodes=f.bind(d.nodes,param);assert.ok(nodes);assert.equal(f.get(nodes),d.parameters[param]);assert.equal(f.param(nodes),param);
  const label=featureLabel(nodes.at(-1)!,nodes.length-1,nodes);assert.equal(label,property==='pitch'?'Thread ×Pitch':property==='diameter'?'Thread MDiameter×1':'Thread ×1');
 });
}
test('bound dimensions survive Hand/From and numeric whole-face length edits',async()=>{
 for(const bore of [false,true]){
  const d=fixture(bore),nodes=field(d,'pitch').bind(d.nodes,'Pitch');assert.ok(nodes);let changed=nodes;
  for(const [key,value] of [['hand','left'],['end','-']] as const){const f=editFields(changed,changed.length-1,d.parameters).find(f=>f.key===key);assert.ok(f?.kind==='choice');changed=f.set(changed,value);}
  const whole=field(d,'len').set(changed,0),n=whole.at(-1)!;assert.ok(n.kind==='face-thread');assert.equal(Object.hasOwn(n,'length'),false);assert.deepEqual(n.pitch,{parameter:'Pitch'});assert.equal(n.hand,'left');assert.equal(n.end,'-');native({...d,nodes:whole});
  const read=await readStudioFile(encodeStudioFile({...d,nodes:whole}));assert.ok('doc' in read);assert.deepEqual(read.doc,JSON.parse(JSON.stringify({...d,nodes:whole})));native(read.doc);
 }
});
test('missing or invalid parameters refuse natively and preserve accepted source',()=>{
 for(const [key,param,,bore] of cases){const d=prepared(key,bore),before=structuredClone(d),f=field(d,key);assert.equal(f.bind(d.nodes,'Missing'),null);const nodes=f.bind(d.nodes,param);assert.ok(nodes);
 for(const parameters of [{},{[param]:NaN},{[param]:-1}])assert.equal(evaluateDoc({...d,nodes,parameters},1).ok,false);
 assert.deepEqual(d,before);native(d);
 }
});
test('omitted Relief follows bound Pitch without claiming an explicit Relief binding',async()=>{
 const source=fixture(),nodes=field(source,'pitch').bind(source.nodes,'Pitch');assert.ok(nodes);
 const doc={...source,nodes},before=structuredClone(doc),index=nodes.length-1,relief=field(doc,'relief');
 assert.equal(Object.hasOwn(nodes[index],'relief'),false);assert.equal(relief.get(nodes),.75);assert.equal(relief.param(nodes),null);
 const updated={...doc,parameters:{...doc.parameters,Pitch:.8}};assert.equal(field(updated,'relief').get(nodes),.8);assert.equal(field(updated,'relief').param(nodes),null);native(updated);
 // Materialize the ordinary numeric default before explicitly binding this previously absent leaf.
 const materialized=relief.set(nodes,.75),explicit=field({...doc,nodes:materialized},'relief').bind(materialized,'Relief');assert.ok(explicit);
 const explicitDoc={...doc,nodes:explicit};assert.equal(field(explicitDoc,'relief').get(explicit),.5);assert.equal(field(explicitDoc,'relief').param(explicit),'Relief');
 const numeric=field(explicitDoc,'relief').set(explicit,.6),n=numeric[index];assert.ok(n.kind==='face-thread');assert.equal(n.relief,.6);assert.deepEqual(n.pitch,{parameter:'Pitch'});
 assert.equal(field({...doc,nodes:numeric},'relief').param(numeric),null);
 for(const candidate of [doc,explicitDoc,{...doc,nodes:numeric}]){native(candidate);const read=await readStudioFile(encodeStudioFile(candidate));assert.ok('doc' in read);assert.deepEqual(read.doc,JSON.parse(JSON.stringify(candidate)));native(read.doc);}
 assert.deepEqual(doc,before);
});
