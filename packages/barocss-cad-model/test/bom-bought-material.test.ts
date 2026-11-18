import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,rectanglePart,type StudioDoc} from '../src/engine/doc';
import {evaluateDoc,type EvalResult} from '../src/engine/evaluate';
import {setInstanceLook} from '../src/assembly/looks';
import {bomPanelDataOf,purchaseCsv} from '../src/bom/bom';
import {Assembly} from '../src/api/assembly';
import {runTool} from '../src/chat/tools';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
const part=()=>{const d=rectanglePart(10,10,10);d.nodes[d.nodes.length-1]={...d.nodes[d.nodes.length-1],bought:true};return d;};
const fixture=():StudioDoc=>({...emptyDoc(),instances:['a','b'].map((id,k)=>({id,name:id,doc:part(),position:[k*20,0,0],rotation:[0,0,0]}))});
const read=(d:StudioDoc)=>bomPanelDataOf(d,x=>evaluateDoc(x,1));
const steel=(d:StudioDoc,id='a',key='b1')=>setInstanceLook(d,{part:id,body:key,patch:{material:'steel'}}).doc;
test('bought detail uses occurrence density without changing totals, grouping or CSV',()=>{
 const a=fixture(),b=steel(a),before=structuredClone(b),old=read(a),next=read(b);
 assert.deepEqual(next.view.elements!.map(e=>e.mass),[7.85,2.7]);
 assert.equal(next.bom.lines.find(l=>l.kind==='extrude')!.mass,10.55);
 assert.equal(next.bom.totalMass,10.55);assert.equal(next.bom.elementQty,2);
 const priorDetail=structuredClone(next);for(const l of priorDetail.bom.lines)if(l.kind==='extrude')l.mass=5.4;
 assert.equal(purchaseCsv(next),purchaseCsv(priorDetail));assert.deepEqual(b,before);
 const reset=setInstanceLook(b,{part:'a',body:'b1',patch:{material:null}}).doc;
 assert.deepEqual(read(reset).view.elements,old.view.elements);
});
test('nested material override changes only its own bought occurrence',()=>{
 const leaf=fixture().instances![0],sub={...emptyDoc(),instances:[leaf]};
 const root:StudioDoc={...emptyDoc(),instances:['x','y'].map(id=>({id,name:id,doc:sub,position:[0,0,0],rotation:[0,0,0]}))};
 const changed=steel(root,'x','a/b1');
 assert.deepEqual(read(changed).view.elements!.map(e=>[e.part,e.mass]),[['x/a',7.85],['y/a',2.7]]);
 assert.deepEqual(read(root).view.elements!.map(e=>e.mass),[2.7,2.7]);
});
test('catalogue coupling and base document materials use the same exact density',()=>{
 const d:StudioDoc={...emptyDoc(),nodes:[{kind:'coupling',row:'sleeve',center:[0,0],generator:'coupling@0'}],drives:{version:1,rows:[{kind:'coupling',id:'sleeve',bore:[12,14],outside:30,length:40,boreStep:18,estimate:true}]}};
 const e=evaluateDoc(d,1);assert.ok(e.ok);const volume=e.bodies[0].volume!;
 d.bodies={[e.bodies[0].key]:{material:'steel'}};
 const result=read(d);assert.ok(Math.abs(result.view.elements![0].mass!-volume*7.85/1000)<1e-6);
 assert.deepEqual(result.view.elements!.map(e=>e.kind),['coupling']);
});
test('public BOM/dispatcher JSON and native roundtrip preserve corrected detail and document',async()=>{
 const d=steel(fixture()),before=structuredClone(d),api=await new Assembly('Kit',d).bom();
 const tool=await runTool({doc:d,bodies:[]},'output_bom',{},async x=>evaluateDoc(x,1));assert.ok(!tool.isError);
 const content=JSON.parse(tool.content),file=content.files.find((f:{path:string})=>f.path==='bom.json'),data=JSON.parse(file.text);
 assert.equal(data.view.elements[0].mass,7.85);assert.deepEqual(api.bom,content.bom);assert.deepEqual(d,before);
 const opened=await readStudioFile(encodeStudioFile(d));assert.ok('doc'in opened);assert.deepEqual(read(opened.doc).view.elements,read(d).view.elements);
});
test('unmeasured null, absent-volume fallback and shared evaluation bodies remain untouched',()=>{
 const d=part();d.bodies={b1:{material:'steel'}};const e=evaluateDoc(d,1);assert.ok(e.ok);
 for(const patch of [{mass:null},{volume:null,mass:4.2}]){
  const evaluated: Extract<EvalResult,{ok:true}>={...e,bodies:e.bodies.map(b=>({...b,...patch}))};
  const before: EvalResult=structuredClone(evaluated);
  const data=bomPanelDataOf(d,()=>evaluated);assert.equal(data.view.elements![0].mass,patch.mass);
  assert.deepEqual(evaluated,before);
 }
});
