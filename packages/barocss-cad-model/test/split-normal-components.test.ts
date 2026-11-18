import assert from 'node:assert/strict';
import test from 'node:test';
import {checkBrep,evaluateCadPart,massPropertiesOf} from '@barocss/cad';
import {editFields} from '../src/app/editFields';
import {splitNormalComponentsField} from '../src/app/splitNormalComponents';
import {emptyDoc,withNode,type StudioDoc,type ModelNode} from '../src/engine/doc';
import {toPartDocument} from '../src/engine/part';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
function fixture(axis:'x'|'y'|'z'='x',side?:'negative'|'positive'):StudioDoc{
 let d=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]}),{kind:'extrude',sketch:0,height:10});
 d=withNode(d,{kind:'split',parent:{node:1,side:'solid'},axis,at:axis==='z'?5:15,...(side?{outputSide:side}:{})});return d;
}
function field(doc:StudioDoc,nodes=doc.nodes){const f=splitNormalComponentsField(doc,nodes,2);assert.ok(f?.kind==='choice');return f;}
const native=(doc:StudioDoc)=>evaluateCadPart(toPartDocument(doc)).outputs;
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const axis of ['x','y','z'] as const)for(const side of [undefined,'negative','positive'] as const)test(`${axis}/${side??'both'} conversion preserves native outputs and stored identity`,async()=>{
 const d=fixture(axis,side),before=structuredClone(d),next={...d,nodes:field(d).set(d.nodes,'n')};
 const s=next.nodes[2];assert.ok(s.kind==='split');const n=[0,0,0];n['xyz'.indexOf(axis)]=1;assert.deepEqual(s,{...d.nodes[2],normal:n});assert.equal(next.outputs,d.outputs);assert.equal(next.nodes[0],d.nodes[0]);assert.deepEqual(d,before);
 const a=native(d),b=native(next);assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){
 assert.equal(checkBrep(b[i].brep,{strict:true}).valid,true);near(massPropertiesOf(a[i]).volume,massPropertiesOf(b[i]).volume);assert.deepEqual(a[i].brep.vertices,b[i].brep.vertices);}
 const open=await readStudioFile(encodeStudioFile(next));assert.ok('doc'in open);assert.deepEqual(open.doc,JSON.parse(JSON.stringify(next)));assert.equal(native(open.doc).length,b.length);
});
test('oblique follow-up uses n dot p = At and native failure never mutates source',()=>{
 const d=fixture(),converted={...d,nodes:field(d).set(d.nodes,'n')};
 const oblique={...converted,nodes:converted.nodes.map((n,i)=>i===2?{...n,normal:[1,1,0],at:30} as ModelNode:n)};
 const volumes=native(oblique).map(o=>massPropertiesOf(o).volume).sort((a,b)=>a-b);near(volumes[0],4500);near(volumes[1],7500);
 for(const change of [{normal:[0,0,0]},{at:1000}]){const before=structuredClone(converted);const bad={...converted,nodes:converted.nodes.map((n,i)=>i===2?{...n,...change} as ModelNode:n)};assert.throws(()=>native(bad));assert.deepEqual(converted,before);}
});
test('captured field refuses foreign or stale arrays and content; current draft axis/At may change before capture',()=>{
 const d=fixture(),f=field(d);assert.throws(()=>f.set([...d.nodes],'n'));assert.throws(()=>f.set(d.nodes,'invalid'));
 const draft=d.nodes.map((n,i)=>i===2?{...n,axis:'y',at:20} as ModelNode:n);assert.ok(splitNormalComponentsField(d,draft,2));
 d.parameters.changed=1;assert.throws(()=>f.set(d.nodes,'n'));
 const other=fixture(),g=field(other);(other.nodes[2] as Extract<ModelNode,{kind:'split'}>).at=16;assert.throws(()=>g.set(other.nodes,'n'));
});
test('unsupported metadata, sources, downstream, bounds and parameter dimensions are excluded',()=>{
 const d=fixture();const patch=(i:number,p:object)=>({...d,nodes:d.nodes.map((n,j)=>i===j?{...n,...p} as ModelNode:n)});
 const docs=[{...d,direct:{}},{...d,drawing:{}},{...d,nodes:[...d.nodes,d.nodes[0]]},patch(0,{plane:{}}),patch(0,{min:[0,0],max:[0,30]}),patch(1,{height:{parameter:'H'}}),patch(1,{draft:2}),patch(2,{made:{}}),patch(2,{id:'n0'}),patch(2,{parent:{node:0,side:'solid'}}),patch(2,{axis:'n'}),patch(2,{at:0}),patch(2,{at:40}),patch(2,{at:NaN}),patch(2,{at:{parameter:'A'}}),patch(2,{normal:[1,0,0]})];
 for(const doc of docs)assert.equal(splitNormalComponentsField(doc,doc.nodes,2),null);
 assert.ok(splitNormalComponentsField({...d,direct:undefined},d.nodes,2));assert.equal(splitNormalComponentsField({},d.nodes,2),null);
});
test('History opts into components while generic HUD fields stay cardinal',()=>{
 const d=fixture();
 const history=editFields(d.nodes,2,d.parameters,undefined,{doc:d}),f=history.find(f=>f.key==='axis');assert.ok(f?.kind==='choice');assert.ok(f.options.some(o=>o.value==='n'));
 const hud=editFields(d.nodes,2,d.parameters).find(f=>f.key==='axis');assert.ok(hud?.kind==='choice');assert.deepEqual(hud.options.map(o=>o.value),['x','y','z']);
 const converted=f.set(d.nodes,'n'),fields=editFields(converted,2,d.parameters,undefined,{doc:d});for(const key of ['nx','ny','nz'])assert.ok(fields.some(f=>f.key===key));assert.equal(fields.some(f=>f.key==='axis'),false);
});
