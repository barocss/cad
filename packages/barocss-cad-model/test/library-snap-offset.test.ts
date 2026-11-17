import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc, type StudioDoc} from '../src/engine/doc';
import {libraryInstance,snapByInterfaces} from '../src/library/libraries';
import {solveDoc} from '../src/assembly/edit';
import {dispatchTool} from '../src/chat/tools';
import {evaluatePart} from '../src/engine/evaluate';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
const a={part:'p1',interface:'slot-t1'},b={part:'p2',interface:'seat'};
function fixture(){let doc=emptyDoc();({doc}=libraryInstance(doc,'tslot-20','profile',{variant:'2020',params:{L:120},name:'Rail'}));({doc}=libraryInstance(doc,'tslot-20','slot-nut-m5',{name:'Nut',position:[50,50,50]}));return doc;}
const pos=(d:StudioDoc)=>d.instances!.find(i=>i.id==='p2')!.position;
const run=(doc:StudioDoc,offset:number[])=>dispatchTool({doc,bodies:[]},'assembly',{action:'snap',a,b,offset},async d=>evaluatePart(d,1));
test('normal offset is refused atomically by snap and the actual grouped dispatcher',async()=>{
 for(const z of [5,-5,0.000002,-0.000002]){
  const doc=fixture(),before=structuredClone(doc),offset=[30,0,z];
  const raw=snapByInterfaces(doc,a,b,offset);assert.ok('error' in raw);assert.match(raw.error,/Offset conflicts/);
  const result=await run(doc,offset);assert.equal(result.isError,true);assert.equal(result.changed,false);assert.deepEqual(result.state.doc,before);assert.deepEqual(doc,before);
 }
});
test('zero and tangential offsets retain solver placement and native roundtrip',async()=>{
 for(const offset of [[0,0,0],[30,0,0],[-20,3,0],[30,0,0.0000005]]){
  const doc=fixture(),before=structuredClone(doc),raw=snapByInterfaces(doc,a,b,offset);assert.ok(!('error' in raw));
  const solved=solveDoc(raw.doc);assert.equal(solved.problems.length,0);assert.ok(Math.hypot(...pos(solved.doc).map((v,k)=>v-pos(raw.doc)[k]))<=1e-6);
  const result=await run(doc,offset);assert.equal(result.isError,false);assert.equal(result.changed,true);assert.deepEqual(result.state.doc,solved.doc);assert.deepEqual(doc,before);
  const opened=await readStudioFile(encodeStudioFile(result.state.doc));assert.ok('doc' in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(result.state.doc)));
 }
});
test('rotated rail retains frame-local free offsets and rejects normal movement',()=>{
 const doc=fixture();doc.instances![0].rotation=[25,30,40];doc.instances![0].position=[10,20,30];
 for(const offset of [[30,2,0],[30,0,5]]){const r=snapByInterfaces(doc,a,b,offset);if(offset[2])assert.ok('error' in r);else{assert.ok(!('error' in r));const s=solveDoc(r.doc);assert.equal(s.problems.length,0);assert.ok(Math.hypot(...pos(s.doc).map((v,k)=>v-pos(r.doc)[k]))<1e-6);}}
});
test('named plane normal, not an assumed interface frame z, determines constrained movement',()=>{
 const doc=fixture(),node=doc.instances![0].doc.nodes.find(n=>n.kind==='library');assert.ok(node?.kind==='library');
 node.interfaces=node.interfaces.map(itf=>itf.id==='slot-t1'?{...itf,frame:{...itf.frame,x:[0,1,0],z:[0,0,1]}}:itf);
 // This saved custom frame has its x along the actual mate normal; z is tangent.
 assert.ok('error' in snapByInterfaces(doc,a,b,[5,0,0]));assert.ok(!('error' in snapByInterfaces(doc,a,b,[0,0,5])));
});
test('cylinder interface keeps axial offset but refuses transverse movement',()=>{
 let doc=emptyDoc();for(const name of ['Boss A','Boss B'])({doc}=libraryInstance(doc,'enclosure','screw-boss',{variant:'M3',name}));
 for(const inst of doc.instances!){const node=inst.doc.nodes.find(n=>n.kind==='library');assert.ok(node?.kind==='library');node.interfaces=node.interfaces.map(itf=>itf.id==='screw'?{...itf,accepts:['screw-hole']}:itf);}
 const aa={part:'p1',interface:'screw'},bb={part:'p2',interface:'screw'};
 assert.ok('error' in snapByInterfaces(doc,aa,bb,[2,0,10]));const r=snapByInterfaces(doc,aa,bb,[0,0,10]);assert.ok(!('error' in r));const s=solveDoc(r.doc);assert.equal(s.problems.length,0);assert.ok(Math.hypot(...pos(s.doc).map((v,k)=>v-pos(r.doc)[k]))<1e-6);
});
