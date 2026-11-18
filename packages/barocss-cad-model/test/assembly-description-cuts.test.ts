import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyDoc,rectanglePart,placedBase} from '../src/engine/doc';
import {addPart} from '../src/assembly/edit';
import {addAssemblyCut} from '../src/assembly/cuts';
import {evaluateDoc} from '../src/engine/evaluate';
import {dispatchTool} from '../src/chat/tools';
const evaluate=async(doc:Parameters<typeof evaluateDoc>[0])=>evaluateDoc(doc,1);
test('get_assembly reports the cut occurrence volume without changing its shared definition',async()=>{
 const plate=rectanglePart(40,40,10),one=addPart(emptyDoc(),{name:'Plate',doc:plate}).doc,inst=one.instances![0];
 const source={...one,instances:[inst,{...inst,id:'p2',name:'Plate 2',position:[0,0,10] as [number,number,number]}]};
 const doc=addAssemblyCut(source,{profile:{kind:'circle',radius:5},at:[20,20,20],dir:[0,0,-1],depth:'through',targets:['p2']}).doc,before=structuredClone(doc);
 const physical=await evaluate(placedBase(doc.instances![1],doc));assert.ok(physical.ok);const actual=physical.bodies.reduce((n,b)=>n+(b.volume??0),0);
 const reply=await dispatchTool({doc,bodies:[]},'get_assembly',{},evaluate),report=JSON.parse(reply.content);console.log(JSON.stringify({actual,instances:report.instances}));
 assert.equal(reply.changed,false);assert.equal(reply.isError,false);assert.deepEqual(doc,before);assert.equal(doc.instances![1].doc,plate);
 assert.equal(report.instances[0].volume,16000);assert.ok(Math.abs(report.instances[1].volume-actual)<0.001);
});

test('edge cut updates world bounds while preserving authored keys and mate faces',async()=>{
 const source=addPart(emptyDoc(),{name:'Plate',doc:rectanglePart(40,40,10),position:[50,0,0]}).doc;
 const doc=addAssemblyCut(source,{profile:{kind:'rectangle',w:20,d:60},at:[50,20,10],dir:[0,0,-1],depth:'through',targets:['p1']}).doc,before=structuredClone(doc);
 const query=async(d:typeof doc)=>JSON.parse((await dispatchTool({doc:d,bodies:[]},'get_assembly',{faces_of:'p1'},evaluate)).content).instances[0];
 const normal=await query(source),cut=await query(doc);
 assert.equal(normal.volume,16000);assert.equal(cut.volume,12000);assert.deepEqual(cut.world_bounds,{min:[60,0,0],max:[90,40,10]});
 assert.deepEqual(cut.body_keys,normal.body_keys);assert.deepEqual(cut.faces,normal.faces);assert.equal(cut.feature_count,normal.feature_count);assert.deepEqual(doc,before);
});

test('failed cut evaluation reports its error rather than uncut geometry',async()=>{
 const source=addPart(emptyDoc(),{name:'Plate',doc:rectanglePart(40,40,10)}).doc;
 const doc=addAssemblyCut(source,{profile:{kind:'circle',radius:5},at:[20,20,10],dir:[0,0,-1],depth:'through',targets:['p1']}).doc,before=structuredClone(doc);
 const result=await dispatchTool({doc,bodies:[]},'get_assembly',{},async d=>d.nodes.length>2?{ok:false,revision:1,error:{title:'Controlled cut failure',hint:'',detail:''},wallTime:0}:evaluate(d));
 const part=JSON.parse(result.content).instances[0];assert.equal(part.error,'Controlled cut failure');assert.equal(part.bodies,0);assert.equal(part.world_bounds,undefined);assert.notEqual(part.volume,16000);assert.deepEqual(doc,before);
});
