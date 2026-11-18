import assert from 'node:assert/strict';
import test from 'node:test';
import {rectanglePart} from '../src/engine/doc';
import {partCopy,addPart} from '../src/assembly/edit';
import {dispatchTool} from '../src/chat/tools';
import {evaluatePart} from '../src/engine/evaluate';
const fixture=()=>addPart(rectanglePart(40,30,5),{name:'Pin',doc:rectanglePart(12,10,8)}).doc;
test('partCopy refuses nonexistent nested target instead of copying its host',()=>{
 const doc=fixture(),before=structuredClone(doc);assert.throws(()=>partCopy(doc,'p1/missing'),/NO_PART/);assert.deepEqual(doc,before);
});
test('public assembly copy_of refuses nonexistent nested target atomically',async()=>{
 const doc=fixture(),before=structuredClone(doc);const r=await dispatchTool({doc,bodies:[]},'assembly',{action:'add_part',name:'Wrong copy',copy_of:'p1/missing'},async d=>evaluatePart(d,1));
 console.log(JSON.stringify({changed:r.changed,isError:r.isError,content:r.content,count:r.state.doc.instances?.length}));
 assert.equal(r.isError,true);assert.equal(r.changed,false);assert.deepEqual(r.state.doc,doc);assert.deepEqual(doc,before);
});
test('ordinary top-level and base copies preserve their own source',()=>{const doc=fixture(),before=structuredClone(doc);for(const id of ['base','p1']){const copied=partCopy(doc,id);assert.deepEqual(copied.nodes,id==='base'?doc.nodes:doc.instances![0].doc.nodes);}assert.deepEqual(doc,before);});

test('copy does not silently treat an existing nested occurrence as its host',()=>{
 const nested=addPart(rectanglePart(12,10,8),{name:'Nested',doc:rectanglePart(2,3,4)}).doc;
 const doc=addPart(rectanglePart(40,30,5),{name:'Host',doc:nested}).doc,before=structuredClone(doc);
 assert.throws(()=>partCopy(doc,'p1/p1'),/NO_PART/);
 assert.deepEqual(partCopy(doc,'p1').nodes,nested.nodes);assert.deepEqual(doc,before);
});
