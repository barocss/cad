import test from 'node:test';
import assert from 'node:assert/strict';
import {rectanglePart} from '../src/engine/doc';
import {addPart,addMate} from '../src/assembly/edit';
import {runAssemblyTool} from '../src/chat/assembly';
import {runVariabilityTool} from '../src/chat/variability';
import {variantOf,checkVariability} from '../src/assembly/variability';
import {evaluateDoc} from '../src/engine/evaluate';
const fixture=()=>{
 let d=addPart(rectanglePart(100,50,5),{name:'Original pin',doc:rectanglePart(10,10,20),position:[0,0,5]}).doc;
 d=addPart(d,{name:'Other pin',doc:rectanglePart(10,10,20),position:[30,0,5]}).doc;
 d=addMate(d,{kind:'distance',a:{part:'base',face:'n1.top'},b:{part:'p1',face:'n1.bottom'},distance:5}).doc;
 return runVariabilityTool(d,'set_inputs',{inputs:{Gap:{type:'number',default:5,bindings:[{to:'mate',mate:'m1',field:'distance'}]}}}).doc;
};
test('a new mate must not capture a retained input for a deleted mate',async()=>{
 const master=fixture(),before=structuredClone(master);
 const removed=await runAssemblyTool({doc:master,bodies:[]},'delete_mate',{id:'m1'},async d=>evaluateDoc(d,1));assert.equal(removed.isError,false);assert.deepEqual(removed.doc.variability,master.variability);assert.equal(checkVariability(removed.doc)[0]?.code,'INPUT_TARGET');
 const added=await runAssemblyTool({doc:removed.doc,bodies:[]},'add_mate',{kind:'distance',a:{part:'base',face:'n1.top'},b:{part:'p2',face:'n1.bottom'},distance:5},async d=>evaluateDoc(d,1));assert.equal(added.isError,false);
 if(!checkVariability(added.doc).length){const v=variantOf(added.doc,{Gap:15}).doc;console.log(JSON.stringify({newMate:added.doc.mates,positionsBefore:added.doc.instances!.map(i=>[i.id,i.position]),positionsAfter:v.instances!.map(i=>[i.id,i.position])}));}
 assert.deepEqual(master,before);assert.notEqual(added.doc.mates![0].id,'m1');assert.equal(checkVariability(added.doc)[0]?.code,'INPUT_TARGET');
});

test('core and facade locks reserve retained mate names without mutating bindings',async()=>{
 const {lockPart}=await import('../src/assembly/edit');const {lockDoc}=await import('../src/api/assemblyCore');
 const master=fixture(),held={...master,mates:[]},before=structuredClone(held);
 for(const result of [lockPart(held,{part:'p2',to:'base'}).doc,lockDoc(held,'p2','base').doc]){assert.notEqual(result.mates![0].id,'m1');assert.deepEqual(result.variability,held.variability);}
 assert.deepEqual(held,before);
});

test('native files retain missing bindings; restored original mate restores its original target',async()=>{
 const {encodeStudioFile,readStudioFile}=await import('../src/engine/container');const master=fixture(),held={...master,mates:[]};const opened=await readStudioFile(encodeStudioFile(held));assert.ok('doc'in opened);assert.deepEqual(opened.doc.variability,master.variability);assert.equal(checkVariability(opened.doc)[0].code,'INPUT_TARGET');
 const restored={...opened.doc,mates:master.mates};const variant=variantOf(restored,{Gap:15}).doc;assert.equal(variant.instances![0].position[2],20);assert.equal(variant.instances![1].position[2],5);assert.deepEqual(held.mates,[]);
});

test('interface snap reserves each generated mate beside retained references',async()=>{
 const {emptyDoc}=await import('../src/engine/doc');const {libraryInstance,snapByInterfaces}=await import('../src/library/libraries');let doc=emptyDoc();({doc}=libraryInstance(doc,'tslot-20','profile',{variant:'2020',params:{L:120},name:'Rail'}));({doc}=libraryInstance(doc,'tslot-20','slot-nut-m5',{name:'Nut',position:[50,50,50]}));doc.variability=fixture().variability;const before=structuredClone(doc);const r=snapByInterfaces(doc,{part:'p1',interface:'slot-t1'},{part:'p2',interface:'seat'});assert.ok(!('error'in r));assert.ok(r.mates.length>0);assert.ok(r.mates.every(m=>m.id!=='m1'));assert.equal(new Set(r.mates.map(m=>m.id)).size,r.mates.length);assert.deepEqual(doc,before);
});

test('reservation is local and preserves arbitrary ids and historical starting rules',async()=>{
 const {takenMateIds,nextMateId}=await import('../src/assembly/mateIds');const master=fixture();
 const current={...master,mates:master.mates!.map(m=>({...m,id:'custom-mate'})),variability:undefined};
 current.instances=current.instances!.map(i=>({...i,doc:{...i.doc,variability:master.variability}}));
 assert.deepEqual([...takenMateIds(current)],['custom-mate']);assert.equal(nextMateId(current),'m1');assert.equal(nextMateId(current,2),'m2');
 const held={...current,variability:master.variability};assert.equal(nextMateId(held),'m2');assert.deepEqual(held.mates![0].id,'custom-mate');
 const plain={...master,mates:[],variability:undefined};assert.equal(addMate(plain,{kind:'distance',a:{part:'base',face:'n1.top'},b:{part:'p2',face:'n1.bottom'},distance:5}).mate.id,'m1');
});
