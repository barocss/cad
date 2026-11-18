import test from 'node:test';
import assert from 'node:assert/strict';
import {rectanglePart} from '../src/engine/doc';
import {addPart} from '../src/assembly/edit';
import {runAssemblyTool} from '../src/chat/assembly';
import {runVariabilityTool} from '../src/chat/variability';
import {checkVariability,variantOf} from '../src/assembly/variability';
import {evaluateDoc} from '../src/engine/evaluate';
const evaluate=async(d:Parameters<typeof evaluateDoc>[0])=>evaluateDoc(d,1);
const fixture=()=>{
 const pin=rectanglePart(10,10,20);pin.parameters={h:20};Object.assign(pin.nodes[1],{height:{parameter:'h'}});
 let d=addPart(rectanglePart(100,50,5),{name:'Original pin',doc:pin}).doc;
 d=addPart(d,{name:'Spare pin',doc:pin,position:[30,0,5]}).doc;
 const r=runVariabilityTool(d,'set_inputs',{inputs:{Height:{type:'number',default:20,bindings:[{to:'parameter',part:'p1',parameter:'h'}]}}});assert.equal(r.isError,false);return r.doc;
};
test('new copied part cannot capture a retained Variant parameter binding',async()=>{
 const original=fixture(),before=structuredClone(original);
 const removed=await runAssemblyTool({doc:original,bodies:[]},'delete_part',{part:'p1'},evaluate);assert.equal(removed.isError,false);assert.deepEqual(removed.doc.variability,original.variability);assert.equal(checkVariability(removed.doc)[0].code,'INPUT_TARGET');
 const added=await runAssemblyTool({doc:removed.doc,bodies:[]},'add_part',{name:'Unrelated pin',copy_of:'p2'},evaluate);assert.equal(added.isError,false);
 if(!checkVariability(added.doc).length){const variant=variantOf(added.doc,{Height:35}).doc;console.log(JSON.stringify({parts:variant.instances!.map(i=>({id:i.id,name:i.name,h:i.doc.parameters.h}))}));}
 assert.deepEqual(original,before);assert.deepEqual(added.doc.variability,original.variability);assert.equal(checkVariability(added.doc)[0]?.code,'INPUT_TARGET');assert.notEqual(added.doc.instances!.at(-1)!.id,'p1');
});

test('suppression and component target or source references reserve local instance ids',async()=>{
 const {takenInstanceIds,nextInstanceId}=await import('../src/assembly/takenIds');
 const doc=fixture();doc.instances=[];doc.variability={version:1,inputs:[
 {name:'Hide',type:'boolean',default:false,bindings:[{to:'suppress',part:'p1',feature:'n1',when:true}]},
 {name:'Kind',type:'choice',default:'original',choices:[{value:'original'},{value:'other'}],bindings:[{to:'component',instance:'p2',options:{original:{like:'p2'},other:{like:'p3'}}}]},
 {name:'Height',type:'number',default:20,bindings:[{to:'parameter',part:'inst1',parameter:'h'}]},
 ]};const before=structuredClone(doc),ids=takenInstanceIds(doc);
 for(const id of ['p1','p2','p3','inst1'])assert.ok(ids.has(id),id);assert.equal(nextInstanceId(doc,'p'),'p4');assert.equal(nextInstanceId(doc,'inst'),'inst2');assert.deepEqual(doc,before);
});

test('reservation does not import child namespaces or confuse mate and library ids',async()=>{
 const {takenInstanceIds,nextInstanceId}=await import('../src/assembly/takenIds');const doc=fixture(),child=structuredClone(doc.variability!);doc.variability=undefined;doc.instances=doc.instances!.map(i=>({...i,doc:{...i.doc,variability:child}}));
 doc.instances[0].id='custom-pin';doc.instances[1].id='other-pin';assert.equal(nextInstanceId(doc,'p'),'p1');
 doc.variability={version:1,inputs:[{name:'Gap',type:'number',default:5,bindings:[{to:'mate',mate:'p1',field:'distance'}]},{name:'Kind',type:'choice',default:'self',choices:[{value:'self'},{value:'other'}],bindings:[{to:'component',instance:'custom-pin',options:{self:{like:'custom-pin'},other:{library:'p2',part:'p3'}}}]}]};
 assert.deepEqual([...takenInstanceIds(doc)].sort(),['custom-pin','other-pin']);assert.equal(nextInstanceId(doc,'p'),'p1');
});

test('native missing references remain stored and restoring the original part restores its variant',async()=>{
 const {encodeStudioFile,readStudioFile}=await import('../src/engine/container');const original=fixture();const removed=await runAssemblyTool({doc:original,bodies:[]},'delete_part',{part:'p1'},evaluate);const opened=await readStudioFile(encodeStudioFile(removed.doc));assert.ok('doc'in opened);assert.deepEqual(opened.doc.variability,original.variability);assert.equal(checkVariability(opened.doc)[0].code,'INPUT_TARGET');const restored={...opened.doc,instances:original.instances};assert.equal(variantOf(restored,{Height:35}).doc.instances![0].doc.parameters.h,35);assert.deepEqual(original.instances![0].doc.parameters,{h:20});
});

test('valid suppress, component target and component source inputs remain missing after delete/add',async()=>{
 const inputs=[
 {type:'boolean',default:false,bindings:[{to:'suppress',part:'p1',feature:'n1',when:true}]},
 {type:'choice',default:'self',choices:[{value:'self'},{value:'other'}],bindings:[{to:'component',instance:'p1',options:{self:{like:'p1'},other:{like:'p2'}}}]},
 {type:'choice',default:'self',choices:[{value:'self'},{value:'other'}],bindings:[{to:'component',instance:'p2',options:{self:{like:'p2'},other:{like:'p1'}}}]},
 ];
 for(const input of inputs){const base={...fixture(),variability:undefined};const set=runVariabilityTool(base,'set_inputs',{inputs:{Option:input}});assert.equal(set.isError,false);const original=set.doc,before=structuredClone(original);
 const removed=await runAssemblyTool({doc:original,bodies:[]},'delete_part',{part:'p1'},evaluate);assert.equal(removed.isError,false);const code=checkVariability(removed.doc)[0]?.code;assert.ok(code==='INPUT_TARGET'||code==='INPUT_CHOICE');const added=await runAssemblyTool({doc:removed.doc,bodies:[]},'add_part',{name:'Unrelated',copy_of:'p2'},evaluate);assert.equal(added.isError,false);assert.equal(checkVariability(added.doc)[0]?.code,code);assert.notEqual(added.doc.instances!.at(-1)!.id,'p1');assert.deepEqual(added.doc.variability,original.variability);assert.deepEqual(original,before);assert.equal(checkVariability({...added.doc,instances:original.instances}).length,0);
 }
});
