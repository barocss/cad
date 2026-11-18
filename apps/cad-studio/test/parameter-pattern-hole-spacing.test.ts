import test from 'node:test';
import assert from 'node:assert/strict';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import { prepareParameterPatternHoleSpacing as prepare } from '../src/state/parameterPatternHoleSpacing';
function fixture(axis:'x'|'y'='x',old=16,nextPitch=16.25){
 const centre:[number,number]=[52,13];centre[axis==='x'?0:1]+=2*old;
 const before:StudioDoc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{S:old,U:7},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[50,10],max:[54,16]},
  {id:'n1',kind:'extrude',sketch:0,height:8},
  {id:'n2',kind:'linear-pattern',parent:{node:1,side:'solid'},axis,spacing:{parameter:'S'},count:3},
  {id:'n3',kind:'hole',parent:{node:2,side:'solid'},radius:1,center:centre,face:'n1.top@2'},
 ],outputs:{b3:{node:3,side:'solid'}},nextId:4};
 return {before,next:{...before,parameters:{...before.parameters,S:nextPitch}}};
}
function patch(doc:StudioDoc,index:number,changes:Record<string,unknown>):StudioDoc{return {...doc,nodes:doc.nodes.map((n,i)=>i===index?{...n,...changes} as ModelNode:n)};}
function frozen<T>(v:T):T{if(v&&typeof v==='object'){for(const child of Object.values(v))frozen(child);Object.freeze(v);}return v;}
function refused(before:StudioDoc,next:StudioDoc,label:string){const saved=structuredClone({before,next});assert.throws(()=>prepare(before,next),label);assert.deepEqual({before,next},saved,label+' input preservation');}
for(const axis of ['x','y'] as const)for(const sign of [1,-1])test(`${axis} signed pitch ${sign}: only terminal centre changes, bindings and source ownership stay exact`,()=>{
 const {before,next}=fixture(axis,sign*16,sign*16.25),saved=structuredClone({before,next});frozen(before);frozen(next);
 const out=prepare(before,next),wanted:[number,number]=axis==='x'?[52+sign*32.5,13]:[52,13+sign*32.5];
 assert.notEqual(out,next);assert.equal(out.parameters,next.parameters);assert.equal(out.outputs,next.outputs);
 for(let i=0;i<3;i++)assert.equal(out.nodes[i],next.nodes[i]);
 const hole=out.nodes[3];assert.equal(hole.kind,'hole');if(hole.kind!=='hole')throw Error('hole');assert.deepEqual(hole.center,wanted);
 assert.deepEqual(out,{...next,nodes:next.nodes.map((n,i)=>i===3?{...n,center:wanted}:n)});
 const pattern=out.nodes[2];assert.equal(pattern.kind,'linear-pattern');if(pattern.kind==='linear-pattern'){assert.deepEqual(pattern.spacing,{parameter:'S'});assert.equal(pattern.spacing,(next.nodes[2] as typeof pattern).spacing);}
 assert.deepEqual({before,next},saved);
 // Independent local point and clearance equations, not the implementation formula.
 assert.equal(wanted[axis==='x'?0:1]-2*sign*16.25,axis==='x'?52:13);
});
test('unrelated parameter and exact no-op return the candidate identity; undefined UI field is not metadata',()=>{
 const {before,next}=fixture();assert.equal(prepare(before,before),before);
 const unrelated={...before,parameters:{...before.parameters,U:9}};assert.equal(prepare(before,unrelated),unrelated);
 const equivalent=structuredClone(before);assert.equal(prepare(before,equivalent),equivalent);
 const ui={...next,direct:undefined};assert.deepEqual(prepare(before,ui).nodes[3],{...before.nodes[3],center:[84.5,13]});
});
test('active dependency rejects extra consumers, multiple parameter changes and changed source/operation data',()=>{
 const {before,next}=fixture();
 for(const [label,a,b] of [
  ['two values',before,{...next,parameters:{S:16.25,U:8}}],
  ['removed parameter',before,{...next,parameters:{S:16.25}}],
  ['added parameter',before,{...next,parameters:{...next.parameters,V:1}}],
  ['shared extrusion',patch(before,1,{height:{parameter:'S'}}),patch(next,1,{height:{parameter:'S'}})],
  ['shared radius',patch(before,3,{radius:{parameter:'S'}}),patch(next,3,{radius:{parameter:'S'}})],
  ['changed height',before,patch(next,1,{height:9})],
  ['changed centre',before,patch(next,3,{center:[84.25,13]})],
  ['changed count',before,patch(next,2,{count:4})],
  ['changed axis',before,patch(next,2,{axis:'y'})],
  ['changed binding',before,patch(next,2,{spacing:{parameter:'U'}})],
 ] as [string,StudioDoc,StudioDoc][])refused(a,b,label);
 for(const metadata of [{direct:{sources:{},objects:[]}},{drawing:{}},{instances:[]},{configurations:{}},{unknownConsumer:true}])refused({...before,...metadata} as StudioDoc,{...next,...metadata} as StudioDoc,'defined metadata '+Object.keys(metadata)[0]);
});
test('unsupported active hole, stock and pattern recipes refuse rather than silently keep stale centre',()=>{
 const {before,next}=fixture();
 const cases:[number,Record<string,unknown>][]=[
  [0,{outline:{}}],[0,{plane:{origin:[0,0,1],normal:[0,0,1],xAxis:[1,0,0]}}],
  [1,{draft:2}],[1,{held:'held'}],[1,{suppressed:true}],
  [2,{axis:'z'}],[2,{count:2.5}],[2,{held:'held'}],[2,{suppressed:true}],
  [2,{parent:{node:1,side:'negative'}}],
  [3,{depth:4}],[3,{thread:{}}],[3,{countersink:4}],[3,{csk:{}}],[3,{pattern:{}}],[3,{made:{}}],
  [3,{axis:'x'}],[3,{side:'min'}],[3,{parent:{node:2,side:'negative'}}],
 ];
 for(const [i,p] of cases)refused(patch(before,i,p),patch(next,i,p),`${i} ${JSON.stringify(p)}`);
 const downstream=(d:StudioDoc):StudioDoc=>({...d,nodes:[...d.nodes,{id:'n4',kind:'translate',parent:{node:3,side:'solid'},offset:[1,0,0]}],outputs:{b4:{node:4,side:'solid'}},nextId:5});refused(downstream(before),downstream(next),'downstream');
});
test('invalid binding values, old wrong bore, copy overlap and boundary contact fail closed',()=>{
 const {before,next}=fixture();
 for(const value of [NaN,Infinity,-Infinity,0]){refused(before,{...next,parameters:{...next.parameters,S:value}},'new invalid '+value);refused({...before,parameters:{...before.parameters,S:value}},next,'old invalid '+value);}
 const missing={...next,parameters:{U:7}};refused(before,missing,'missing spacing value');
 for(const binding of [{parameter:'S',extra:1},{parameter:4},{}])refused(before,patch(next,2,{spacing:binding}),'changed malformed binding');
 for(const centre of [[83,13],[84,11],[52,13],[84,10.9999999]])refused(patch(before,3,{center:centre}),patch(next,3,{center:centre}),'old boundary/wrong centre');
 for(const pitch of [4,4.0000001,-4])refused(before,{...next,parameters:{...next.parameters,S:pitch}},'overlap or tolerance gap');
 refused(before,{...next,parameters:{...next.parameters,S:1e20}},'range overflow');
});

test('inactive held/suppressed Hole stays unchanged; active-to-inactive composite edits refuse',()=>{
 const {before,next}=fixture();for(const flag of [{held:'held'},{suppressed:true}]){const a=patch(before,3,flag),b=patch(next,3,flag);assert.equal(prepare(a,b),b);refused(before,b,'active dependency cannot disappear during parameter edit');}
});
