import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBrep,evaluateCadPart,flatPatternOf,massPropertiesOf,faceGeometry} from '@barocss/cad';
import {partialFlangeRadiusSourceHistoryEdit} from '../src/app/partialFlangeRadiusSourceHistoryEdit';
import type {Ctx,Values} from '../src/app/commands';
import {emptyDoc,withNode,type StudioDoc,type ModelNode} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {captureSignatures} from '../src/engine/references';
import {toPartDocument} from '../src/engine/part';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
function fixture(kind:'rectangular'|'obround'='obround'):StudioDoc{
 const base=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]}),{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
 const e=evaluateDoc(base,1);assert.ok(e.ok);
 return captureSignatures(withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},edges:['n1.side1|n1.top'],length:20,bendRadius:2,offsets:[10,25],relief:{kind,width:1.5,depth:1.5}}),e.bodies);
}
const ctx=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}});
const patch=(doc:StudioDoc,index:number,p:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===index?{...n,...p} as ModelNode:n)});
function build(doc:StudioDoc,v:Values){const c=partialFlangeRadiusSourceHistoryEdit(doc,2);assert.ok(c?.build);return c.build(ctx(doc),v);}
const near=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,`${a} != ${b}`);
function oracle(doc:StudioDoc,kind:'rectangular'|'obround',R:number,w=1.5,d=1.5){
 const rows=evaluateCadPart(toPartDocument(doc)).outputs;assert.equal(rows.length,1);const o=rows[0];assert.equal(o.bodyCount,1);assert.ok(checkBrep(o.brep,{strict:true}).valid);
 const T=1.5,trim=R+T,straight=20-trim,r=w/2,Q=kind==='obround'?w*(trim+d-r)+Math.PI*r*r/2:w*(trim+d);
 near(massPropertiesOf(o).volume,T*(4000-trim*15-2*Q+15*(straight+Math.PI/2*(R+T/2))));
 const flat=flatPatternOf(o);near(flat.area,4000-trim*15-2*Q+15*(straight+Math.PI/2*(R+.44*T)));assert.equal(flat.loops.length,1);assert.equal(flat.bends.length,1);near(flat.bends[0].radius,R);near(flat.bends[0].allowance,Math.PI/2*(R+.44*T));
 assert.ok(o.sheet);near(o.sheet.bendRadius,1.5);near(o.sheet.bends[0].radius,R);
 const bends=o.brep.faces.map(face=>faceGeometry(face)).filter(g=>g.kind==='cylinder'&&Math.abs(g.a[1])>1-1e-9);
 assert.equal(bends.length,2);for(const b of bends){assert.ok(b.kind==='cylinder');near(b.c[0],80-trim);near(b.c[2],trim);assert.ok(Math.abs(b.r-R)<1e-8||Math.abs(b.r-R-T)<1e-8);}
 return o;
}

test('source switches preserve partial recipe while copying or removing only the radius override',()=>{
 for(const kind of ['rectangular','obround'] as const){
  const own=fixture(kind),original=structuredClone(own),n=own.nodes[2];assert.ok(n.kind==='sheet-flange');
  const sheet=build(own,{source:'sheet'}),expected={...n};delete expected.bendRadius;
  assert.deepEqual(sheet,{...own,nodes:[own.nodes[0],own.nodes[1],expected]});
  assert.equal(Object.hasOwn(sheet.nodes[2],'bendRadius'),false);oracle(sheet,kind,1.5);oracle(own,kind,2);
  assert.equal(sheet.nodes[0],own.nodes[0]);assert.equal(sheet.nodes[1],own.nodes[1]);assert.equal(sheet.outputs,own.outputs);
  assert.ok(sheet.nodes[2].kind==='sheet-flange');assert.equal(sheet.nodes[2].sigs,n.sigs);assert.equal(sheet.nodes[2].edges,n.edges);assert.equal(sheet.nodes[2].offsets,n.offsets);assert.equal(sheet.nodes[2].relief,n.relief);
  const copied=build(sheet,{source:'own'});assert.ok(copied.nodes[2].kind==='sheet-flange');assert.equal(copied.nodes[2].bendRadius,1.5);oracle(copied,kind,1.5);
  assert.deepEqual(build(copied,{source:'sheet'}),sheet);assert.deepEqual(own,original);
 }
});
test('same source returns exact original and preserves inherited omission',()=>{
 const own=fixture(),sheet=build(own,{source:'sheet'});
 for(const [doc,value] of [[own,'own'],[sheet,'sheet']] as const){const c=partialFlangeRadiusSourceHistoryEdit(doc,2);assert.ok(c?.build&&c.defaults);assert.deepEqual(c.defaults(ctx(doc)),{source:value});assert.equal(c.build(ctx(doc),{source:value}),doc);}
 assert.equal(Object.hasOwn(sheet.nodes[2],'bendRadius'),false);
});
test('invalid, mixed, stale and foreign input cannot change the accepted source',()=>{
 const doc=fixture(),original=structuredClone(doc);const invalid:Values[]=[{},{source:''},{source:'other'},{source:2},{source:'sheet',r:3},{source:'sheet',length:21},{source:'sheet',rw:2},{source:'sheet',angle:45}];
 for(const v of invalid){assert.throws(()=>build(doc,v));assert.deepEqual(doc,original);}
 const c=partialFlangeRadiusSourceHistoryEdit(doc,2);assert.ok(c?.build);const cloned=structuredClone(doc);assert.equal(c.available(ctx(cloned)).ok,false);assert.throws(()=>c.build!(ctx(cloned),{source:'sheet'}));
 doc.parameters.changed=1;assert.equal(c.available(ctx(doc)).ok,false);assert.throws(()=>c.build!(ctx(doc),{source:'sheet'}));
});
test('unsupported recipes exclude bindings, downstream consumers and uncertain references',()=>{
 const doc=fixture();
 for(const bad of [patch(doc,0,{plane:{}}),patch(doc,1,{bendRadius:{parameter:'R'}}),patch(doc,2,{bendRadius:{parameter:'R'}}),patch(doc,2,{bendRadius:0}),patch(doc,2,{bendRadius:NaN}),patch(doc,2,{offsets:[0,25]}),patch(doc,2,{relief:{kind:'obround',width:{parameter:'W'},depth:1.5}}),patch(doc,2,{angle:45}),patch(doc,2,{measure:'inner'}),patch(doc,2,{position:'material-outside'}),patch(doc,2,{sigs:undefined}),patch(doc,2,{edges:['n1.side0|n1.top']}),patch(doc,2,{held:'test'}),patch(doc,2,{suppressed:true}),{...doc,direct:{} as StudioDoc['direct']},withNode(doc,{kind:'translate',parent:{node:2,side:'solid'},offset:[1,0,0]})])assert.equal(partialFlangeRadiusSourceHistoryEdit(bad,2),null);
 const n=doc.nodes[2];assert.ok(n.kind==='sheet-flange');const forged=patch(doc,2,{sigs:{[n.edges[0]]:{...n.sigs![n.edges[0]],s:49}}});assert.throws(()=>build(forged,{source:'sheet'}));
 const invalid=patch(doc,2,{bendRadius:19}),copy=structuredClone(invalid);assert.throws(()=>build(invalid,{source:'sheet'}));assert.throws(()=>build(invalid,{source:'own'}));assert.deepEqual(invalid,copy);
});
test('valid own original refuses impossible inherited candidate without repairing the original',()=>{
 const doc=patch(fixture(),1,{bendRadius:19}),saved=structuredClone(doc);const rows=evaluateCadPart(toPartDocument(doc)).outputs;assert.equal(rows.length,1);assert.ok(checkBrep(rows[0].brep,{strict:true}).valid);
 assert.equal(build(doc,{source:'own'}),doc);assert.throws(()=>build(doc,{source:'sheet'}));assert.deepEqual(doc,saved);
});
test('source choice and numeric snapshot survive codec with exact key omission',async()=>{
 for(const kind of ['rectangular','obround'] as const)for(const value of ['sheet','own'] as const){
  const sheet=build(fixture(kind),{source:'sheet'}),doc=build(sheet,{source:value});const file=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in file);assert.deepEqual(file.doc,JSON.parse(JSON.stringify(doc)));assert.equal(Object.hasOwn(file.doc.nodes[2],'bendRadius'),value==='own');oracle(file.doc,kind,1.5);
 }
});
