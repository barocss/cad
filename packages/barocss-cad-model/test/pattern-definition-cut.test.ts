import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,rectanglePart} from '../src/engine/doc';
import {addPart} from '../src/assembly/edit';
import {addInstancePattern} from '../src/assembly/patterns';
import {addAssemblyCut} from '../src/assembly/cuts';
import {editDefinition} from '../src/assembly/definitions';
import {readStudioDoc} from '../src/engine/migrate';
import {cutsOf} from '../src/engine/assemblyCut';
const fixture=()=>{
 const seed=addPart(emptyDoc(),{name:'Plate',doc:rectanglePart(40,40,10)}).doc;
 const patterned=addInstancePattern(seed,{seed:'p1',kind:'linear',count:3,dir:[1,0,0],spacing:60}).doc;
 // Native files may omit optional shared-definition metadata.
 const plain={...patterned,instances:patterned.instances!.map(i=>({...i,part:undefined}))};
 const saved=readStudioDoc(JSON.stringify(plain));assert.ok('doc'in saved);
 return addAssemblyCut(saved.doc,{profile:{kind:'circle',radius:5},at:[140,20,20],dir:[0,0,-1],depth:'through',targets:['pat1-2']}).doc;
};
const nested=()=>addPart(rectanglePart(40,40,10),{name:'Child',doc:rectanglePart(10,10,10)}).doc;
test('seed and sibling edits cannot turn a cut driven copy into an uncuttable subassembly',()=>{
 for(const owner of ['p1','pat1-1','pat1-2']){
  const doc=fixture(),before=structuredClone(doc),replacement=nested(),original=structuredClone(replacement);
  assert.equal(cutsOf(doc.instances!.find(i=>i.id==='pat1-2')!,doc).length,1);
  const result=editDefinition(doc,owner,replacement);
  assert.ok('error'in result,'cut on another driven copy must protect its seed definition');
  assert.match(result.error,/cut1.*cuts/);assert.deepEqual(doc,before);assert.deepEqual(replacement,original);
 }
});
test('plain edits preserve the cut and unrelated definitions remain editable',()=>{
 const doc=fixture(),changed=editDefinition(doc,'p1',rectanglePart(40,40,12));assert.ok('doc'in changed);
 assert.deepEqual(changed.doc.assemblyCuts,doc.assemblyCuts);
 assert.equal(cutsOf(changed.doc.instances!.find(i=>i.id==='pat1-2')!,changed.doc).length,1);
 const unrelated=addPart(doc,{name:'Other',doc:rectanglePart(20,20,10)});
 assert.ok('doc'in editDefinition(unrelated.doc,unrelated.id,nested()));
 const cleared={...doc,assemblyCuts:undefined};assert.ok('doc'in editDefinition(cleared,'p1',nested()));
});
test('shared definition guard, unchanged existing subassembly data and cut recovery remain intact',()=>{
 const doc=fixture(),shared={...doc,instances:doc.instances!.map(i=>({...i,part:{id:'plate',rev:'A'}}))};
 assert.ok('error'in editDefinition(shared,'p1',nested()));
 const legacy={...doc,instances:doc.instances!.map(i=>({...i,doc:nested()}))};
 const before=structuredClone(legacy),same=editDefinition(legacy,'p1',legacy.instances[0].doc);
 assert.ok('doc'in same);assert.equal(same.changed,false);assert.deepEqual(legacy,before);
});
