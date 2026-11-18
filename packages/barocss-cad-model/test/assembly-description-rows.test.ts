import assert from 'node:assert/strict';
import test from 'node:test';
import {catalogueFixture} from './fixtures/inherited-catalogue';
import {placedBase} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {dispatchTool} from '../src/chat/tools';
test('public assembly summary evaluates an inherited coupling in its parent row context',async()=>{
 const doc=catalogueFixture('drives'),before=structuredClone(doc),actual=evaluateDoc(placedBase(doc.instances![0],doc),1);assert.ok(actual.ok);const volume=actual.bodies.reduce((n,b)=>n+(b.volume??0),0);
 const reply=await dispatchTool({doc,bodies:[]},'get_assembly',{},async d=>evaluateDoc(d,1)),report=JSON.parse(reply.content).instances[0];console.log(JSON.stringify({actual:volume,report}));
 assert.deepEqual(doc,before);assert.equal(reply.changed,false);assert.equal(reply.isError,false);assert.equal(report.error,undefined);assert.equal(report.bodies,actual.bodies.length);assert.ok(Math.abs(report.volume-volume)<0.001);assert.ok(report.body_keys.length);
});

test('local coupling row overrides the parent without changing either registry',async()=>{
 const root=catalogueFixture('drives'),inst=root.instances![0];
 const doc={...root,instances:[{...inst,doc:{...inst.doc,drives:{version:1 as const,rows:root.drives!.rows.map(row=>row.kind==='coupling'?{...row,outside:40}:row)}}}]},before=structuredClone(doc);
 const actual=evaluateDoc(placedBase(doc.instances[0],doc),1);assert.ok(actual.ok);const volume=actual.bodies.reduce((n,b)=>n+(b.volume??0),0);
 const report=JSON.parse((await dispatchTool({doc,bodies:[]},'get_assembly',{},async d=>evaluateDoc(d,1))).content).instances[0];
 assert.equal(report.error,undefined);assert.ok(Math.abs(report.volume-volume)<0.001);assert.deepEqual(doc,before);assert.ok(volume>22851.95);
});

for(const kind of ['rings','connectors'])test(`inherited ${kind} summary retains original rows and actual geometry`,async()=>{
 const doc=catalogueFixture(kind),before=structuredClone(doc),physical=evaluateDoc(placedBase(doc.instances![0],doc),1);assert.ok(physical.ok);
 const report=JSON.parse((await dispatchTool({doc,bodies:[]},'get_assembly',{},async d=>evaluateDoc(d,1))).content).instances[0];
 assert.equal(report.error,undefined);assert.equal(report.bodies,physical.bodies.length);assert.ok(Math.abs(report.volume-physical.bodies.reduce((n,b)=>n+(b.volume??0),0))<0.001);assert.deepEqual(doc,before);
});
