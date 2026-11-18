import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,rectanglePart} from '../src/engine/doc';
import {readStudioDoc} from '../src/engine/migrate';
import {addPart} from '../src/assembly/edit';
import {addInstancePattern,expandPatterns} from '../src/assembly/patterns';
import {addAssemblyCut} from '../src/assembly/cuts';
import {acceptRevision,dismissRevision} from '../src/assembly/definitions';
import {cutsOf} from '../src/engine/assemblyCut';
const nested=()=>addPart(rectanglePart(40,40,10),{name:'Child',doc:rectanglePart(10,10,10)}).doc;
function fixture(replacement=nested()){
 const seed=addPart(emptyDoc(),{name:'Plate',doc:rectanglePart(40,40,10)}).doc;
 const pattern=addInstancePattern(seed,{seed:'p1',kind:'linear',count:2,dir:[1,0,0],spacing:60}).doc;
 const cut=addAssemblyCut(pattern,{profile:{kind:'circle',radius:5},at:[80,20,20],dir:[0,0,-1],depth:'through',targets:['pat1-1']}).doc;
 const id=cut.instances![0].part!.id;
 const read=readStudioDoc(JSON.stringify({...cut,instances:cut.instances!.map(i=>i.pattern?{...i,part:undefined}:i),pendingParts:{[id]:{doc:replacement,rev:'B',name:'Next.bcad'}}}));
 assert.ok('doc'in read);return {doc:read.doc,id};
}
test('stored pending revision refuses a cut copy omitted from the shared metadata list',()=>{
 const {doc,id}=fixture(),before=structuredClone(doc);
 assert.equal(doc.instances![1].part,undefined);assert.equal(cutsOf(doc.instances![1],doc).length,1);
 assert.throws(()=>acceptRevision(doc,id),(error:unknown)=>{assert.equal((error as {code:string}).code,'VALUE');assert.match(String(error),/Accepting this revision.*cut1/);return true;});assert.deepEqual(doc,before);
 assert.throws(()=>acceptRevision(expandPatterns(doc),id),/Accepting this revision.*cut1/);
});
test('waiting revision can be kept or dismissed without rewriting definitions and cut records',()=>{
 const {doc,id}=fixture(),before=structuredClone(doc),dismissed=dismissRevision(doc,id);
 assert.equal(dismissed.pendingParts,undefined);assert.deepEqual(dismissed.instances,doc.instances);assert.deepEqual(dismissed.assemblyCuts,doc.assemblyCuts);assert.deepEqual(doc,before);
});
test('valid plain revision and explicit cut removal remain accepted',()=>{
 const {doc,id}=fixture(rectanglePart(45,40,10)),before=structuredClone(doc),next=acceptRevision(doc,id);
 assert.equal(next.pendingParts,undefined);assert.equal(next.instances![1].part!.rev,'B');assert.equal(cutsOf(next.instances![1],next).length,1);assert.deepEqual(next.assemblyCuts,doc.assemblyCuts);assert.deepEqual(doc,before);
 const sub=fixture(),uncut={...sub.doc,assemblyCuts:undefined};assert.equal(acceptRevision(uncut,sub.id).instances![1].doc.instances!.length,1);
});
