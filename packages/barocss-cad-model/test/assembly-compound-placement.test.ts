import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import type {StudioDoc} from '../src/engine/doc';
import {evaluatePart} from '../src/engine/evaluate';
import {heldLooks} from '../src/assembly/looks';
import {dispatchTool} from '../src/chat/tools';
const fixture=()=>JSON.parse(readFileSync(resolve(import.meta.dirname,'../../../apps/cad-studio/test/fixtures/flexible-hinge.bcad'),'utf8')) as StudioDoc;
test('place_part applies both joint and body appearance in one request',async()=>{
 const doc=fixture(), before=structuredClone(doc);
 const result=await dispatchTool({doc,bodies:[]},'assembly',{action:'place',part:'sub2',joints:{'base~lid':45},looks:{b1:{color:'#00ff00',material:'steel'}}},async d=>evaluatePart(d,1));
 console.log('COMPOUND',JSON.stringify({changed:result.changed,isError:result.isError,instance:result.state.doc.instances?.find(i=>i.id==='sub2'),content:result.content}));
 assert.equal(result.isError,false);assert.equal(result.changed,true);assert.deepEqual(heldLooks(result.state.doc),[]);assert.deepEqual(result.state.doc.instances?.find(i=>i.id==='sub2')?.looks?.b1,{color:'#00ff00',material:'steel'});assert.deepEqual(doc,before);
});
test('invalid appearance refuses the whole joint-plus-appearance request',async()=>{
 const doc=fixture(), before=structuredClone(doc);
 const result=await dispatchTool({doc,bodies:[]},'assembly',{action:'place',part:'sub2',joints:{'base~lid':45},looks:{b1:{color:'invalid-colour'}}},async d=>evaluatePart(d,1));
 console.log('COMPOUND INVALID',JSON.stringify({changed:result.changed,isError:result.isError,content:result.content}));
 assert.equal(result.isError,true);assert.equal(result.changed,false);assert.deepEqual(result.state.doc,doc);assert.deepEqual(doc,before);
});

import {encodeStudioFile,readStudioFile} from '../src/engine/container';
const run=(doc:StudioDoc,args:Record<string,unknown>)=>dispatchTool({doc,bodies:[]},'assembly',{action:'place',part:'sub2',...args},async d=>evaluatePart(d,1));
test('combined result equals valid joint-only then looks-only operations and keeps both reports',async()=>{
 const doc=fixture(),joints={'base~lid':45},looks={b1:{color:'#00ff00',material:'steel'}};
 const jointOnly=await run(doc,{joints});assert.equal(jointOnly.isError,false);assert.equal(jointOnly.state.doc.instances?.find(i=>i.id==='sub2')?.looks,undefined);
 const looksOnly=await run(doc,{looks});assert.equal(looksOnly.isError,false);assert.equal(looksOnly.state.doc.instances?.find(i=>i.id==='sub2')?.joints,undefined);
 const sequential=await run(jointOnly.state.doc,{looks}),combined=await run(doc,{joints,looks});assert.deepEqual(combined.state.doc,sequential.state.doc);assert.match(combined.content,/joints/);assert.match(combined.content,/looks/);
 assert.deepEqual(combined.state.doc.instances?.find(i=>i.id==='sub1'),doc.instances?.find(i=>i.id==='sub1'));
 const saved=await readStudioFile(encodeStudioFile(combined.state.doc));assert.ok('doc' in saved);assert.deepEqual(saved.doc,JSON.parse(JSON.stringify(combined.state.doc)));
 const reset=await run(combined.state.doc,{joints:{'base~lid':null},looks:{b1:null}});assert.equal(reset.isError,false);assert.equal(reset.state.doc.instances?.find(i=>i.id==='sub2')?.joints,undefined);assert.equal(reset.state.doc.instances?.find(i=>i.id==='sub2')?.looks,undefined);
});
test('either invalid joint or later invalid appearance discards placement, name, and all compound edits',async()=>{
 for(const patch of [{joints:{missing:10},looks:{b1:{color:'#00ff00'}}},{joints:{'base~lid':45},looks:{b1:{color:'bad'}}},{joints:{'base~lid':45},looks:{b1:{material:'not-material'}}}]){
  const doc=fixture(),before=structuredClone(doc);const result=await run(doc,{name:'Should not commit',position:[250,10,5],...patch});assert.equal(result.isError,true);assert.equal(result.changed,false);assert.deepEqual(result.state.doc,doc);assert.deepEqual(doc,before);
 }
});
