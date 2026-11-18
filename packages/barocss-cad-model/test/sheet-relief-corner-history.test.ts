import assert from 'node:assert/strict';
import test from 'node:test';
import {checkBrep,evaluateCadPart,flatPatternOf,massPropertiesOf} from '@barocss/cad';
import {sheetReliefCornerHistoryEdit} from '../src/app/sheetReliefCornerHistoryEdit';
import type {Ctx} from '../src/app/commands';
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
function build(doc:StudioDoc,corner:string){const command=sheetReliefCornerHistoryEdit(doc,2);assert.ok(command?.build);return command.build(ctx(doc),{corner});}
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
test('all four explicit square and round corners preserve source nodes and only replace edge/signature',()=>{
 for(const shape of ['square','round'] as const){const doc=fixture(shape),before=structuredClone(doc),command=sheetReliefCornerHistoryEdit(doc,2);assert.ok(command);assert.equal(command.label,'Edit relief corner');assert.equal(command.defaults?.(ctx(doc)).corner,corners[1].name);
  const field=command.fields?.(ctx(doc)).find(f=>f.key==='corner');assert.ok(field?.kind==='choice');assert.deepEqual(new Set(field.options.map(o=>o.value)),new Set(corners.map(c=>c.name)));
  for(const corner of corners){const next=build(doc,corner.name);assert.equal(next.nodes[0],doc.nodes[0]);assert.equal(next.nodes[1],doc.nodes[1]);assert.equal(next.outputs,doc.outputs);assert.equal(next.nextId,doc.nextId);const old=doc.nodes[2],n=next.nodes[2];assert.ok(n.kind==='sheet-corner-relief'&&old.kind==='sheet-corner-relief');assert.deepEqual(n,{...old,edges:[corner.name],sigs:n.sigs});assert.deepEqual(Object.keys(n.sigs??{}),[corner.name]);oracle(next,corner,shape);}
  assert.equal(build(doc,corners[1].name),doc);assert.deepEqual(doc,before);
 }
});
test('file roundtrip retains moved corner and supports returning to the original corner',async()=>{
 for(const shape of ['square','round'] as const){const doc=build(fixture(shape),corners[3].name);const opened=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(doc)));oracle(opened.doc,corners[3],shape);oracle(build(opened.doc,corners[1].name),corners[1],shape);}
});
test('invalid choice, cloned owner and in-place changed owner cannot use captured command',()=>{
 const doc=fixture(),command=sheetReliefCornerHistoryEdit(doc,2);assert.ok(command?.build);const before=structuredClone(doc);
 assert.throws(()=>command.build!(ctx(doc),{corner:'not-a-corner'}));assert.deepEqual(doc,before);
 assert.equal(command.available(ctx(structuredClone(doc))).ok,false);assert.throws(()=>command.build!(ctx(structuredClone(doc)),{corner:corners[0].name}));
 doc.parameters.changed=1;assert.equal(command.available(ctx(doc)).ok,false);assert.throws(()=>command.build!(ctx(doc),{corner:corners[0].name}));
});
test('downstream, metadata, direct, bound dimensions and invalid original signatures refuse',()=>{
 const doc=fixture();const bad:StudioDoc[]=[{...doc,direct:{} as StudioDoc['direct']},{...doc,instances:[]},{...doc,nodes:[...doc.nodes,{id:'n3',kind:'translate',parent:{node:2,side:'solid'},offset:[1,0,0]}]},
  patch(doc,0,{plane:{}}),patch(doc,0,{max:[{parameter:'W'},50]}),patch(doc,1,{thickness:{parameter:'T'}}),patch(doc,2,{size:{parameter:'R'}}),patch(doc,2,{held:true}),patch(doc,2,{made:{}}),patch(doc,2,{sigs:undefined}),patch(doc,2,{sigs:{}}),patch(doc,2,{edges:[corners[0].name,corners[1].name]}),{...doc,outputs:{wrong:{node:1,side:'solid'}}}];
 for(const d of bad){const before=structuredClone(d);assert.equal(sheetReliefCornerHistoryEdit(d,2),null);assert.deepEqual(d,before);}
 const relief=doc.nodes[2];assert.ok(relief.kind==='sheet-corner-relief'&&relief.sigs);const signature=relief.sigs[corners[1].name];
 for(const sig of [{...signature,p:[79,0,.75]},{...signature,n:2},{...signature,s:Infinity}]){const d=patch(doc,2,{sigs:{[corners[1].name]:sig}}),before=structuredClone(d);const c=sheetReliefCornerHistoryEdit(d,2);if(c){assert.ok(c.build);assert.throws(()=>c.build!(ctx(d),{corner:corners[0].name}));}assert.deepEqual(d,before);}
 assert.equal(sheetReliefCornerHistoryEdit(doc,1),null);
});
test('runtime undefined direct is admitted without dropping the authored property',()=>{
 const doc={...fixture(),direct:undefined},before=structuredClone(doc);
 assert.ok(sheetReliefCornerHistoryEdit(doc,2));const next=build(doc,corners[0].name);
 assert.ok(Object.hasOwn(next,'direct'));assert.equal(next.direct,undefined);oracle(next,corners[0],'square');assert.deepEqual(doc,before);
});
test('an oversized invalid original cannot be rescued by no-op or moving its corner',()=>{
 const doc=patch(fixture(),2,{size:80}),before=structuredClone(doc);
 assert.throws(()=>evaluateCadPart(toPartDocument(doc)));
 const command=sheetReliefCornerHistoryEdit(doc,2);assert.ok(command?.build);
 for(const corner of [corners[1].name,corners[0].name]){assert.throws(()=>command.build!(ctx(doc),{corner}));assert.deepEqual(doc,before);}
});
test('shifted unequal-width rectangle proves actual corners rather than origin or square assumptions',()=>{
 const x0=-12.5,y0=7.25,x1=47.5,y1=32.25,t=2,size=3,width=x1-x0,height=y1-y0;
 const base=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[x0,y0],max:[x1,y1]}),{kind:'sheet-base',sketch:0,thickness:t,bendRadius:1.5,kFactor:.44});
 const evaluated=evaluateDoc(base,0);assert.ok(evaluated.ok);
 const doc=captureSignatures(withNode(base,{kind:'sheet-corner-relief',parent:{node:1,side:'solid'},edges:[corners[1].name],shape:'square',size}),evaluated.bodies),before=structuredClone(doc);
 const points=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
 for(const [i,[x,y]] of points.entries()){
  const next=build(doc,corners[i].name),node=next.nodes[2];assert.ok(node.kind==='sheet-corner-relief');assert.deepEqual(node.sigs?.[corners[i].name].p,[x,y,t/2]);
  assert.equal(next.nodes[0],doc.nodes[0]);assert.equal(next.nodes[1],doc.nodes[1]);assert.equal(node.size,size);
  const outputs=evaluateCadPart(toPartDocument(next)).outputs;assert.equal(outputs.length,1);const o=outputs[0];assert.equal(o.bodyCount,1);assert.ok(checkBrep(o.brep,{strict:true}).valid);
  const area=width*height-size*size,m=massPropertiesOf(o),cutX=x+(x===x0?size/2:-size/2),cutY=y+(y===y0?size/2:-size/2);
  near(m.volume,area*t);near(m.centroid[0],(width*height*(x0+x1)/2-size*size*cutX)/area);near(m.centroid[1],(width*height*(y0+y1)/2-size*size*cutY)/area);near(m.centroid[2],t/2);
  const local=[[0,size],[size,size],[size,0],[width,0],[width,height],[0,height]],remaining=new Set(o.brep.vertices);assert.equal(remaining.size,12);
  for(const [u,v] of local)for(const z of [0,t]){const p=[x===x0?x0+u:x1-u,y===y0?y0+v:y1-v,z];const match=[...remaining].filter(vertex=>p.every((n,j)=>Math.abs(n-vertex.point[j])<=1e-7));assert.equal(match.length,1);remaining.delete(match[0]);}assert.equal(remaining.size,0);
  const flat=flatPatternOf(o);assert.equal(flat.loops.length,1);near(Math.abs(flat.loops[0].area),area);assert.equal(flat.bends.length,0);
 }
 assert.deepEqual(doc,before);
});
