import assert from 'node:assert/strict';
import test from 'node:test';
import { rectanglePart } from '../src/engine/doc';
import { dispatchTool } from '../src/chat/tools';
import { evaluatePart } from '../src/engine/evaluate';
for(const [action,base] of [['add_part',{name:'Copy',copy_of:'base'}],['insert',{library:'enclosure',part:'enclosure-base'}]] as const){
 test(`${action}: explicit malformed placement cannot silently become the origin`,async()=>{
  const doc=rectanglePart(12,10,8),before=structuredClone(doc);
  const result=await dispatchTool({doc,bodies:[]},'assembly',{action,...base,position:[40,20]},async d=>evaluatePart(d,1));
  console.log('PLACEMENT',JSON.stringify({action,changed:result.changed,isError:result.isError,position:result.state.doc.instances?.[0]?.position,content:result.content}));
  assert.equal(result.isError,true);assert.equal(result.changed,false);assert.deepEqual(result.state.doc,doc);assert.deepEqual(doc,before);
 });
}

import {encodeStudioFile,readStudioFile} from '../src/engine/container';
test('new part placement rejects explicit invalid vectors without evaluation or mutation',async()=>{
 const sparse=Array(3);sparse[0]=1;sparse[2]=2;
 const bad=[null,'90',[],[1,2],[1,2,3,4],[1,'2',3],[1,NaN,3],[1,Infinity,3],sparse];
 for(const action of ['add_part','insert'])for(const key of ['position','rotation'])for(const value of bad){
  const doc=rectanglePart(12,10,8),before=structuredClone(doc);let evaluations=0;
  const result=await dispatchTool({doc,bodies:[]},'assembly',{action,...(action==='insert'?{library:'enclosure',part:'enclosure-base'}:{name:'Copy',copy_of:'base'}),[key]:value},async d=>{evaluations++;return evaluatePart(d,1);});
  assert.equal(result.changed,false,`${action} ${key}`);assert.equal(result.isError,true);assert.match(result.content,/three finite numbers/);assert.equal(evaluations,0);assert.deepEqual(result.state.doc,doc);assert.deepEqual(doc,before);
 }
});
test('omitted and finite explicit placements keep defaults, orientation and native roundtrip',async()=>{
 for(const action of ['add_part','insert'])for(const explicit of [false,true]){
  const doc=rectanglePart(12,10,8),before=structuredClone(doc);
  const position:[number,number,number]=[40,-20,12],rotation:[number,number,number]=[0,0,90];
  const result=await dispatchTool({doc,bodies:[]},'assembly',{action,...(action==='insert'?{library:'enclosure',part:'enclosure-base'}:{name:'Copy',copy_of:'base'}),...(explicit?{position,rotation}:{})},async d=>evaluatePart(d,1));
  assert.equal(result.changed,true);assert.equal(result.isError,false);assert.deepEqual(result.state.doc.instances?.[0].position,explicit?position:[0,0,0]);assert.deepEqual(result.state.doc.instances?.[0].rotation,explicit?rotation:[0,0,0]);assert.deepEqual(doc,before);
  const read=await readStudioFile(encodeStudioFile(result.state.doc));assert.ok('doc' in read);assert.deepEqual(read.doc,JSON.parse(JSON.stringify(result.state.doc)));
 }
});
