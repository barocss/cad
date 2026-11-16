import test from 'node:test';
import assert from 'node:assert/strict';
import { part } from '../src/api';
import { evaluateDoc } from '../src/engine/evaluate';
import { editFields } from '../src/app/editFields';
import { friendly } from '../src/engine/errors';
const shaft=part('shaft').cylinder({r:3,h:30}).thread(b=>b.faces().curved().first(),{pitch:1,length:12}).doc;
const hole=part('hole').box({w:30,d:30,h:10}).hole(b=>b.faces().facing('+z'),{d:5,x:15,y:15}).thread(b=>b.faces().curved().first(),{pitch:1,diameter:6}).doc;
test('face thread saved fields edit shaft and bore without touching parent geometry',()=>{
 for(const doc of [shaft,hole]){
  const i=doc.nodes.length-1; let nodes=doc.nodes;
  for(const [key,value] of [['pitch',0.75],['len',5],['hand','left'],['end','-']] as const){
   const f=editFields(nodes,i).find(f=>f.key===key)!; assert.ok(f);
   nodes=f.kind==='number'?f.set(nodes,value as number):f.kind==='choice'?f.set(nodes,String(value)):nodes;
   const r=evaluateDoc({...doc,nodes},1);assert.ok(r.ok,r.ok?'':JSON.stringify(r.error));
  }
  assert.deepEqual(nodes.slice(0,i),doc.nodes.slice(0,i));
  const length=editFields(nodes,i).find(f=>f.key==='len');assert.ok(length?.kind==='number');
  nodes=length.set(nodes,0);assert.equal('length' in nodes[i],false);
 }
});
test('thread size and length refusal guidance is visible without opening kernel detail',()=>{
 for(const [doc,key,value,title] of [[shaft,'len',31,'Thread length exceeds'],[hole,'diameter',5,'Thread nominal diameter']] as const){
  const i=doc.nodes.length-1,field=editFields(doc.nodes,i).find(f=>f.key===key);assert.ok(field?.kind==='number');
  const result=evaluateDoc({...doc,nodes:field.set(doc.nodes,value)},1);assert.equal(result.ok,false);
  if(!result.ok) {assert.match(result.error.title,new RegExp(title));assert.ok(result.error.detail.includes('FACE_THREAD_SIZE'));}
 }
 assert.match(friendly('[PARAMETER] [FACE_THREAD_SIZE] a 10 mm pitch is too coarse for a 6 mm shaft').title,/pitch/);
});
