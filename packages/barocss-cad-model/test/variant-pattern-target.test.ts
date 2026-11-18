import test from 'node:test';
import assert from 'node:assert/strict';
import {rectanglePart} from '../src/engine/doc';
import {addPart} from '../src/assembly/edit';
import {addInstancePattern} from '../src/assembly/patterns';
import {runVariabilityTool} from '../src/chat/variability';
import {variantOf} from '../src/assembly/variability';
import {evaluateDoc} from '../src/engine/evaluate';
const fixture=()=>{
 const pin=rectanglePart(10,10,20);pin.parameters={h:20};Object.assign(pin.nodes[1],{height:{parameter:'h'}});
 return addInstancePattern(addPart(rectanglePart(100,50,5),{name:'Pin',doc:pin,position:[0,0,5]}).doc,{seed:'p1',kind:'linear',count:3,dir:[1,0,0],spacing:20}).doc;
};
test('pattern copy parameter input must not report success and silently keep the seed geometry',()=>{
 const master=fixture(),before=structuredClone(master);
 const r=runVariabilityTool(master,'set_inputs',{inputs:{Height:{type:'number',default:20,bindings:[{to:'parameter',part:'pat1-1',parameter:'h'}]}}});
 if(!r.isError){const v=variantOf(r.doc,{Height:35});console.log(JSON.stringify({admission:r.content,parts:v.doc.instances!.map(i=>({id:i.id,h:i.doc.parameters.h,volume:(()=>{const e=evaluateDoc(i.doc,1);return e.ok?e.bodies[0]?.volume:e.error})()}))}));}
 assert.deepEqual(master,before);assert.equal(r.isError,true);assert.equal(r.doc,master);
});

test('seed parameter positive control changes every occurrence geometry',()=>{
 const master=fixture();const r=runVariabilityTool(master,'set_inputs',{inputs:{Height:{type:'number',default:20,bindings:[{to:'parameter',part:'p1',parameter:'h'}]}}});assert.equal(r.isError,false);
 const out=variantOf(r.doc,{Height:35});for(const i of out.doc.instances!){const e=evaluateDoc(i.doc,1);assert.ok(e.ok);assert.ok(Math.abs(e.bodies[0].volume!-3500)<1e-8);}
});

test('suppression and component writes to driven copies are refused atomically',()=>{
 const master=fixture(),before=structuredClone(master);
 const inputs=[{type:'boolean',default:false,bindings:[{to:'suppress',part:'pat1-1',feature:'n1',when:true}]},{type:'choice',default:'same',choices:[{value:'same'},{value:'other'}],bindings:[{to:'component',instance:'pat1-1',options:{same:{like:'pat1-1'},other:{like:'p1'}}}]}];
 for(const input of inputs){const r=runVariabilityTool(master,'set_inputs',{inputs:{Option:input}});assert.equal(r.isError,true);assert.match(r.content,/INPUT_TARGET.*seed p1/);assert.equal(r.changed,false);assert.equal(r.doc,master);assert.deepEqual(master,before);}
});

test('stored invalid bindings are retained by native roundtrip, diagnosed and explicitly repairable',async()=>{
 const {encodeStudioFile,readStudioFile}=await import('../src/engine/container');
 const master=fixture();master.variability={version:1,inputs:[{name:'Height',type:'number',default:20,bindings:[{to:'parameter',part:'pat1-1',parameter:'h'}]}],variants:[{name:'Tall',values:{Height:35}}]};const before=structuredClone(master);
 const open=await readStudioFile(encodeStudioFile(master));assert.ok('doc'in open);assert.deepEqual(open.doc.variability,master.variability);
 assert.throws(()=>variantOf(open.doc,{Height:35}),/INPUT_TARGET.*seed p1/);assert.throws(()=>variantOf(open.doc),/INPUT_TARGET.*seed p1/);
 const bad=runVariabilityTool(open.doc,'set_variants',{active:'Tall'});assert.equal(bad.isError,true);assert.equal(bad.doc,open.doc);
 const repaired=runVariabilityTool(open.doc,'set_inputs',{inputs:{Height:{type:'number',default:20,bindings:[{to:'parameter',part:'p1',parameter:'h'}]}}});assert.equal(repaired.isError,false);assert.deepEqual(variantOf(repaired.doc,{Height:35}).doc.instances!.map(i=>i.doc.parameters.h),[35,35,35]);assert.deepEqual(master,before);
});

test('seed suppression and component choice still propagate; copying a driven source is read-only',()=>{
 const master=fixture();
 const suppress=runVariabilityTool(master,'set_inputs',{inputs:{Hide:{type:'boolean',default:false,bindings:[{to:'suppress',part:'p1',feature:'n1',when:true}]}}});assert.equal(suppress.isError,false);assert.ok(variantOf(suppress.doc,{Hide:true}).doc.instances!.every(i=>i.doc.nodes[1].suppressed));
 const extra=addPart(master,{name:'Tall',doc:rectanglePart(10,10,35),position:[0,30,5]}).doc;
 const choice=runVariabilityTool(extra,'set_inputs',{inputs:{Option:{type:'choice',default:'same',choices:[{value:'same'},{value:'tall'}],bindings:[{to:'component',instance:'p1',options:{same:{like:'p1'},tall:{like:'p2'}}}]}}});assert.equal(choice.isError,false);const tall=variantOf(choice.doc,{Option:'tall'}).doc;assert.ok(tall.instances!.every(i=>i.doc===tall.instances![0].doc));
 const read=runVariabilityTool(extra,'set_inputs',{inputs:{Option:{type:'choice',default:'same',choices:[{value:'same'},{value:'copy'}],bindings:[{to:'component',instance:'p2',options:{same:{like:'p2'},copy:{like:'pat1-1'}}}]}}});assert.equal(read.isError,false);assert.equal(variantOf(read.doc,{Option:'copy'}).doc.instances!.find(i=>i.id==='p2')!.doc,master.instances![0].doc);
});
