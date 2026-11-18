import assert from 'node:assert/strict';
import test from 'node:test';
import {rectanglePart} from '../src/engine/doc';
import {addPart,lockPart} from '../src/assembly/edit';
import {isRefusal} from '../src/engine/refusal';
import {dispatchTool} from '../src/chat/tools';
import {evaluatePart} from '../src/engine/evaluate';
function fixture(){const sub=addPart(rectanglePart(10,10,5),{name:'Child',doc:rectanglePart(3,3,2)}).doc;return addPart(addPart(rectanglePart(40,30,5),{name:'Sub',doc:sub,position:[100,0,0]}).doc,{name:'Pin',doc:rectanglePart(12,10,8),position:[20,0,0]}).doc;}
for(const end of ['part','to'] as const)test(`lock rejects nested ${end} with typed refusal and unchanged source`,()=>{const doc=fixture(),before=structuredClone(doc),o=end==='part'?{part:'p1/p1',to:'base'}:{part:'p2',to:'p1/p1'};let result,error;try{result=lockPart(doc,o);}catch(e){error=e;}console.log(JSON.stringify({end,error:String(error),positions:result?.doc.instances?.map(i=>i.position)}));assert.deepEqual(doc,before);assert.ok(isRefusal(error,'NO_PART'));});
test('dispatcher refuses nested target instead of moving a part while locking',async()=>{const doc=fixture(),before=structuredClone(doc);const r=await dispatchTool({doc,bodies:[]},'assembly',{action:'lock',part:'p2',to:'p1/p1'},async d=>evaluatePart(d,1));console.log(JSON.stringify({changed:r.changed,isError:r.isError,content:r.content,positions:r.state.doc.instances?.map(i=>i.position)}));assert.deepEqual(doc,before);assert.equal(r.isError,true);assert.equal(r.changed,false);assert.deepEqual(r.state.doc,before);});

test('direct and base locks preserve poses; fixed/free swap and both-fixed refusal remain',()=>{
 const doc=fixture(),before=structuredClone(doc);
 for(const to of ['p1','base']){const r=lockPart(doc,{part:'p2',to});assert.deepEqual(r.doc.instances?.map(i=>i.position),doc.instances?.map(i=>i.position));assert.equal(r.mate.kind,'lock');}
 const grounded={...doc,instances:doc.instances!.map(i=>i.id==='p2'?{...i,grounded:true}:i)};
 const swapped=lockPart(grounded,{part:'p2',to:'p1'});assert.equal(swapped.mate.a.part,'p2');assert.equal(swapped.mate.b.part,'p1');assert.deepEqual(swapped.doc.instances?.map(i=>i.position),grounded.instances.map(i=>i.position));
 assert.throws(()=>lockPart(grounded,{part:'p2',to:'base'}),e=>isRefusal(e,'MATE_BOTH_FIXED'));
 assert.deepEqual(doc,before);
});
for(const part of ['p1/missing','missing'])test(`unknown moving target ${part} is typed and atomic`,()=>{const doc=fixture(),before=structuredClone(doc);assert.throws(()=>lockPart(doc,{part,to:'base'}),e=>isRefusal(e,'NO_PART'));assert.deepEqual(doc,before);});
