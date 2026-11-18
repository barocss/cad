import test from 'node:test';
import assert from 'node:assert/strict';
import {rectanglePart,type StudioDoc} from '../src/engine/doc';
import {checkVariability,variantOf} from '../src/assembly/variability';
import {bomPanelDataOf} from '../src/bom/bom';
import {runVariabilityTool} from '../src/chat/variability';
import {evaluateDoc} from '../src/engine/evaluate';
const fixture=():StudioDoc=>{
 const part=rectanglePart(10,10,5);part.nodes[1].suppressed=true;
 return {...rectanglePart(20,20,5),instances:[{id:'optional',name:'Optional bracket',doc:part,position:[30,0,0],rotation:[0,0,0]}],variability:{version:1,inputs:[{name:'Include bracket',type:'boolean',default:false,bindings:[{to:'suppress',part:'optional',feature:'n1',when:false}]}],variants:[{name:'With bracket',values:{'Include bracket':true}}]}};
};
test('an admitted suppression input can enable a feature suppressed in the master',()=>{
 const initial=fixture(),{variability,...plain}=initial;const input=variability!.inputs[0];const admitted=runVariabilityTool(plain,'set_inputs',{inputs:{[input.name]:input}});assert.equal(admitted.isError,false);
 const master={...admitted.doc,variability:{...admitted.doc.variability!,variants:variability!.variants}},before=structuredClone(master);assert.deepEqual(checkVariability(master),[]);
 const result=variantOf(master,{'Include bracket':true});assert.deepEqual(result.problems,[]);assert.deepEqual(master,before);
 const states=[master,result.doc].map(d=>evaluateDoc(d.instances![0].doc,1));for(const s of states)assert.ok(s.ok);
 const mass=bomPanelDataOf(result.doc,d=>evaluateDoc(d,1)).bom.lines.find(l=>l.parts.includes('optional'))!.mass;assert.ok(mass!==null&&Math.abs(mass-1.35)<1e-8);
 const counts=states.map(s=>s.ok?s.bodies.length:-1);console.log(JSON.stringify({counts,suppressed:result.doc.instances![0].doc.nodes[1].suppressed}));assert.deepEqual(counts,[0,1]);
});

test('nonmatching defaults preserve independently authored suppression',()=>{
 const master=fixture();master.variability={version:1,inputs:[{name:'Option',type:'choice',default:'A',choices:[{value:'A'},{value:'B'},{value:'C'}],bindings:[{to:'suppress',part:'optional',feature:'n1',when:['B']}]}]};
 assert.deepEqual(checkVariability(master),[]);const before=structuredClone(master);
 assert.equal(variantOf(master,{Option:'C'}).doc.instances![0].doc.nodes[1].suppressed,true);
 assert.equal(variantOf(master,{Option:'B'}).doc.instances![0].doc.nodes[1].suppressed,true);
 assert.deepEqual(master,before);
});

test('existing active-default to suppressed variant stays supported',()=>{
 const master=fixture();delete master.instances![0].doc.nodes[1].suppressed;master.variability!.inputs[0].default=true;
 assert.deepEqual(checkVariability(master),[]);const before=structuredClone(master);
 assert.equal(variantOf(master,{'Include bracket':false}).doc.instances![0].doc.nodes[1].suppressed,true);
 assert.equal(variantOf(master,{'Include bracket':true}).doc,master);assert.deepEqual(master,before);
});

test('choice-driven base suppression lifts only in the derived variant and survives native roundtrip',async()=>{
 const {encodeStudioFile,readStudioFile}=await import('../src/engine/container');
 const master:StudioDoc=rectanglePart(10,10,5);master.nodes[1].suppressed=true;
 master.variability={version:1,inputs:[{name:'Mode',type:'choice',default:'off',choices:[{value:'off'},{value:'hidden'},{value:'on'}],bindings:[{to:'suppress',part:'base',feature:'n1',when:['off','hidden']}]}],variants:[{name:'Enabled',values:{Mode:'on'}}],active:'Enabled'};
 const before=structuredClone(master);assert.deepEqual(checkVariability(master),[]);
 const on=variantOf(master,{Mode:'on'}).doc,hidden=variantOf(master,{Mode:'hidden'}).doc;
 assert.equal(on.nodes[1].suppressed,undefined);assert.equal(hidden.nodes[1].suppressed,true);assert.deepEqual(variantOf(master,{Mode:'on'}).doc,on);
 assert.equal(variantOf(master,{Mode:'off'}).doc,master);assert.deepEqual(master,before);
 const opened=await readStudioFile(encodeStudioFile(master));assert.ok('doc'in opened);assert.equal(opened.doc.nodes[1].suppressed,true);assert.deepEqual(variantOf(opened.doc,{Mode:'on'}).doc,on);
 const e=evaluateDoc(on,1);assert.ok(e.ok);assert.ok(Math.abs(e.bodies[0].volume!-500)<1e-8);
});
