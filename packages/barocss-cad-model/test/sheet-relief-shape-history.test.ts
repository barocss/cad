import assert from 'node:assert/strict';
import test from 'node:test';
import {checkBrep,evaluateCadPart,flatPatternOf,massPropertiesOf} from '@barocss/cad';
import {sheetReliefShapeHistoryEdit} from '../src/app/sheetReliefShapeHistoryEdit';
import type {Ctx,Values} from '../src/app/commands';
import {emptyDoc,withNode,type StudioDoc,type ModelNode} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {captureSignatures} from '../src/engine/references';
import {toPartDocument} from '../src/engine/part';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
const corners=[{name:'n1.side0|n1.side3',x:0,y:0},{name:'n1.side0|n1.side1',x:80,y:0},{name:'n1.side1|n1.side2',x:80,y:50},{name:'n1.side2|n1.side3',x:0,y:50}];
function fixture(shape:'square'|'round'='square'):StudioDoc {
 const base=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]}),{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
 const evaluated=evaluateDoc(base,0);assert.ok(evaluated.ok);
 const doc=captureSignatures(withNode(base,{kind:'sheet-corner-relief',parent:{node:1,side:'solid'},edges:[corners[1].name],shape,size:3}),evaluated.bodies);
 const relief=doc.nodes[2];assert.ok(relief.kind==='sheet-corner-relief'&&relief.sigs?.[corners[1].name]);return doc;
}
const ctx=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}});
function build(doc:StudioDoc,shape:'square'|'round'){const command=sheetReliefShapeHistoryEdit(doc,2);assert.ok(command?.build);return command.build(ctx(doc),{shape});}
const near=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-7,`${a} != ${b}`);
function oracle(doc:StudioDoc,corner:typeof corners[number],shape:'square'|'round') {
 const rows=evaluateCadPart(toPartDocument(doc)).outputs;assert.equal(rows.length,1);const o=rows[0];assert.equal(o.bodyCount,1);assert.equal(checkBrep(o.brep,{strict:true}).valid,true);
 const removed=shape==='square'?9:9*Math.PI/4,area=4000-removed,inset=shape==='square'?1.5:4/Math.PI;
 const cx=corner.x+(corner.x===0?inset:-inset),cy=corner.y+(corner.y===0?inset:-inset),m=massPropertiesOf(o);
 near(m.volume,area*1.5);near(m.centroid[0],(4000*40-removed*cx)/area);near(m.centroid[1],(4000*25-removed*cy)/area);near(m.centroid[2],.75);
 const flat=flatPatternOf(o);assert.equal(flat.bends.length,0);assert.equal(flat.loops.length,1);near(Math.abs(flat.loops[0].area),area);
 if(shape==='square') {
  const local=[[0,3],[3,3],[3,0],[80,0],[80,50],[0,50]];
  const expected=local.flatMap(([x,y])=>[0,1.5].map(z=>[corner.x===0?x:80-x,corner.y===0?y:50-y,z]));
  assert.equal(o.brep.vertices.length,12);const remaining=new Set(o.brep.vertices);
  for(const p of expected){const matches=[...remaining].filter(v=>p.every((n,j)=>Math.abs(n-v.point[j])<=1e-7));assert.equal(matches.length,1);remaining.delete(matches[0]);}assert.equal(remaining.size,0);
  assert.equal(flat.loops[0].segments.length,6);assert.ok(flat.loops[0].segments.every(s=>s.kind==='line'));
 } else {assert.equal(flat.loops[0].segments.filter(s=>s.kind==='arc').length,1);}
}
const patch=(doc:StudioDoc,index:number,value:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===index?{...n,...value} as ModelNode:n)});
test('shape-only transitions at all four corners preserve native source, size and signature',()=>{
 for(const corner of corners){const initial=fixture(),parent=evaluateDoc({...initial,nodes:initial.nodes.slice(0,2),outputs:{b1:{node:1,side:'solid'}}},1);assert.ok(parent.ok);
 const doc=captureSignatures(patch(initial,2,{edges:[corner.name],sigs:undefined}),parent.bodies),snapshot=structuredClone(doc),command=sheetReliefShapeHistoryEdit(doc,2);assert.ok(command);assert.equal(command.label,'Edit relief shape');
 assert.equal(build(doc,'square'),doc);const next=build(doc,'round'),back=build(next,'square');
 for(const [d,shape] of [[next,'round'],[back,'square']] as const){oracle(d,corner,shape);assert.equal(d.nodes[0],doc.nodes[0]);assert.equal(d.nodes[1],doc.nodes[1]);assert.equal(d.outputs,doc.outputs);assert.equal(d.nextId,doc.nextId);const old=doc.nodes[2],n=d.nodes[2];assert.ok(old.kind==='sheet-corner-relief'&&n.kind==='sheet-corner-relief');assert.deepEqual(n,{...old,shape});assert.equal(n.sigs,old.sigs);assert.equal(n.edges,old.edges);}
 assert.deepEqual(doc,snapshot);assert.deepEqual(back,doc);
 }
});
test('invalid and mixed values, foreign identity and in-place mutation refuse without changing source',()=>{
 const doc=fixture(),command=sheetReliefShapeHistoryEdit(doc,2);assert.ok(command?.build);const saved=structuredClone(doc);
 const invalidValues:Values[]=[{shape:'triangle'},{shape:'round',size:4},{shape:'round',corner:corners[0].name},{}];
 for(const values of invalidValues)assert.throws(()=>command.build!(ctx(doc),values));assert.deepEqual(doc,saved);
 assert.equal(command.available(ctx(structuredClone(doc))).ok,false);assert.throws(()=>command.build!(ctx(structuredClone(doc)),{shape:'round'}));
 doc.parameters.changed=1;assert.equal(command.available(ctx(doc)).ok,false);assert.throws(()=>command.build!(ctx(doc),{shape:'round'}));
});
test('unsupported consumers, bound dimensions, absent and stale signatures refuse',()=>{
 const doc=fixture();
 for(const d of [{...doc,direct:{} as StudioDoc['direct']},{...doc,instances:[]},withNode(doc,{kind:'translate',parent:{node:2,side:'solid'},offset:[1,0,0]}),patch(doc,0,{plane:{}}),patch(doc,1,{thickness:{parameter:'T'}}),patch(doc,2,{size:{parameter:'S'}}),patch(doc,2,{made:{}}),patch(doc,2,{sigs:undefined}),patch(doc,2,{edges:[]})])assert.equal(sheetReliefShapeHistoryEdit(d,2),null);
 const n=doc.nodes[2];assert.ok(n.kind==='sheet-corner-relief');const stale=patch(doc,2,{sigs:{[n.edges[0]]:{...n.sigs![n.edges[0]],s:99}}});assert.throws(()=>build(stale,'round'));
 const oversized=patch(doc,2,{size:80}),saved=structuredClone(oversized);assert.throws(()=>build(oversized,'round'));assert.throws(()=>build(oversized,'square'));assert.deepEqual(oversized,saved);
 assert.ok(sheetReliefShapeHistoryEdit({...doc,direct:undefined},2));
});
test('codec roundtrip preserves both shapes and supports reverse transition',async()=>{
 for(const shape of ['square','round'] as const){const doc=build(fixture(),shape),opened=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(doc)));oracle(opened.doc,corners[1],shape);oracle(build(opened.doc,shape==='square'?'round':'square'),corners[1],shape==='square'?'round':'square');}
});
test('shifted non-square plate obeys independent quarter-disk mass and flat formulas',()=>{
 const base=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[-12.5,7.25],max:[47.5,32.25]}),{kind:'sheet-base',sketch:0,thickness:2,bendRadius:1.5,kFactor:.44});const r=evaluateDoc(base,1);assert.ok(r.ok);
 const source=captureSignatures(withNode(base,{kind:'sheet-corner-relief',parent:{node:1,side:'solid'},edges:[corners[1].name],shape:'square',size:3}),r.bodies);
 const next=build(source,'round'),o=evaluateCadPart(toPartDocument(next)).outputs[0],m=massPropertiesOf(o),removed=9*Math.PI/4,area=1500-removed;
 assert.ok(checkBrep(o.brep,{strict:true}).valid);near(m.volume,area*2);near(m.centroid[0],(1500*17.5-removed*(47.5-4/Math.PI))/area);near(m.centroid[1],(1500*19.75-removed*(7.25+4/Math.PI))/area);near(m.centroid[2],1);near(Math.abs(flatPatternOf(o).loops[0].area),area);
});
