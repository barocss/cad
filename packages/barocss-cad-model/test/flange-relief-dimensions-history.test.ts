import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBrep,evaluateCadPart,faceGeometry,flatPatternOf,massPropertiesOf} from '@barocss/cad';
import {flangeReliefDimensionsHistoryEdit} from '../src/app/flangeReliefDimensionsHistoryEdit';
import type {Ctx,Values} from '../src/app/commands';
import {emptyDoc,withNode,type StudioDoc,type ModelNode} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
import {captureSignatures} from '../src/engine/references';
import {toPartDocument} from '../src/engine/part';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
function fixture(kind:'rectangular'|'obround'='obround'):StudioDoc{
 const base=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]}),{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
 const e=evaluateDoc(base,1);assert.ok(e.ok);
 return captureSignatures(withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},edges:['n1.side1|n1.top'],length:20,offsets:[10,25],relief:{kind,width:1.5,depth:1.5}}),e.bodies);
}
const ctx=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}});
const patch=(doc:StudioDoc,index:number,p:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===index?{...n,...p} as ModelNode:n)});
function build(doc:StudioDoc,v:Values){const c=flangeReliefDimensionsHistoryEdit(doc,2);assert.ok(c?.build);return c.build(ctx(doc),v);}
const near=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,`${a} != ${b}`);
function oracle(doc:StudioDoc,kind:'rectangular'|'obround',w:number,d:number){
 const rows=evaluateCadPart(toPartDocument(doc)).outputs;assert.equal(rows.length,1);const o=rows[0];assert.equal(o.bodyCount,1);assert.ok(checkBrep(o.brep,{strict:true}).valid);
 const r=w/2,Q=kind==='obround'?w*(3+d-r)+Math.PI*r*r/2:w*(3+d),cut=2*Q;
 near(massPropertiesOf(o).volume,1.5*(4000-45-cut+15*(17+Math.PI/2*2.25)));
 const flat=flatPatternOf(o);near(flat.area,4000-45-cut+15*(17+Math.PI/2*2.16));assert.equal(flat.loops.length,1);assert.equal(flat.bends.length,1);near(flat.bends[0].allowance,Math.PI/2*2.16);
 if(kind==='obround'){
  const caps=o.brep.faces.map(face=>faceGeometry(face)).filter(g=>g.kind==='cylinder'&&Math.abs(g.a[2])>1-1e-9);assert.equal(caps.length,2);
  for(const cap of caps){assert.equal(cap.kind,'cylinder');if(cap.kind!=='cylinder')throw Error('cap');near(cap.r,r);near(cap.c[0],80-3-d+r);}
 }
 return o;
}
test('width and depth edit independently preserves all other authored data for both relief kinds',()=>{
 for(const kind of ['rectangular','obround'] as const)for(const [w,d] of [[2,1.5],[1.5,2.5],[2,2.5]]){
  const doc=fixture(kind),saved=structuredClone(doc),next=build(doc,{rw:w,rd:d}),n=doc.nodes[2];assert.ok(n.kind==='sheet-flange'&&n.relief&&n.relief.kind!=='none');
  assert.deepEqual(next,{...doc,nodes:[doc.nodes[0],doc.nodes[1],{...n,relief:{kind,width:w,depth:d}}]});
  assert.equal(next.nodes[0],doc.nodes[0]);assert.equal(next.nodes[1],doc.nodes[1]);assert.equal(next.nodes[2].sigs,n.sigs);assert.equal(next.outputs,doc.outputs);
  assert.ok(next.nodes[2].kind==='sheet-flange');assert.equal(next.nodes[2].edges,n.edges);assert.equal(next.nodes[2].offsets,n.offsets);assert.equal(Object.hasOwn(next.nodes[2],'bendRadius'),false);
  oracle(next,kind,w,d);assert.deepEqual(doc,saved);
 }
});
test('defaults and no-op retain exact original identity without resetting dimensions',()=>{
 const doc=fixture(),c=flangeReliefDimensionsHistoryEdit(doc,2);assert.ok(c?.build&&c.defaults);assert.equal(c.label,'Edit flange relief');assert.deepEqual(c.defaults(ctx(doc)),{rw:1.5,rd:1.5});assert.equal(c.build(ctx(doc),c.defaults(ctx(doc))),doc);
});
test('incomplete invalid mixed and impossible dimensions refuse and preserve source',()=>{
 const doc=fixture(),saved=structuredClone(doc),c=flangeReliefDimensionsHistoryEdit(doc,2);assert.ok(c?.build);
 const invalid:Values[]=[{}, {rw:2},{rd:2},{rw:'',rd:2},{rw:2,rd:''},{rw:0,rd:2},{rw:-1,rd:2},{rw:2,rd:0},{rw:Infinity,rd:2},{rw:2,rd:NaN},{rw:11,rd:6},{rw:4,rd:1},{rw:2,rd:2,kind:'rectangular'},{rw:2,rd:2,o0:12},{rw:2,rd:2,length:21},{rw:2,rd:2,unexpected:1}];
 for(const v of invalid){assert.throws(()=>c.build!(ctx(doc),v),JSON.stringify(v));assert.deepEqual(doc,saved);}
});
test('canonical revision and document identity guard captured commands',()=>{
 const doc=fixture(),c=flangeReliefDimensionsHistoryEdit(doc,2);assert.ok(c?.build);const copy=structuredClone(doc);assert.equal(c.available(ctx(copy)).ok,false);assert.throws(()=>c.build!(ctx(copy),{rw:2,rd:2.5}));
 doc.parameters.foreign=1;assert.equal(c.available(ctx(doc)).ok,false);assert.throws(()=>c.build!(ctx(doc),{rw:2,rd:2.5}));
 const d=fixture(),command=flangeReliefDimensionsHistoryEdit(d,2);assert.ok(command?.build);const n=d.nodes[2];assert.ok(n.kind==='sheet-flange');n.length=21;assert.throws(()=>command.build!(ctx(d),{rw:2,rd:2.5}));
});
test('unsupported original recipes and corrupt native evidence cannot enter or build',()=>{
 const doc=fixture();
 for(const source of [patch(doc,0,{plane:{}}),patch(doc,1,{thickness:{parameter:'T'}}),patch(doc,2,{offsets:[0,0]}),patch(doc,2,{relief:{kind:'none'}}),patch(doc,2,{relief:{kind:'obround',width:{parameter:'W'},depth:1.5}}),patch(doc,2,{bendRadius:2}),patch(doc,2,{angle:45}),patch(doc,2,{measure:'inner'}),patch(doc,2,{position:'material-outside'}),patch(doc,2,{sigs:undefined}),patch(doc,2,{edges:['n1.side0|n1.top']}),patch(doc,2,{held:'test'}),patch(doc,2,{suppressed:true}),patch(doc,2,{made:{}}),{...doc,instances:[]},{...doc,direct:{} as StudioDoc['direct']},withNode(doc,{kind:'translate',parent:{node:2,side:'solid'},offset:[1,0,0]})])assert.equal(flangeReliefDimensionsHistoryEdit(source,2),null);
 assert.ok(flangeReliefDimensionsHistoryEdit({...doc,direct:undefined},2));
 const n=doc.nodes[2];assert.ok(n.kind==='sheet-flange');const stale=patch(doc,2,{sigs:{[n.edges[0]]:{...n.sigs![n.edges[0]],s:49}}});assert.throws(()=>build(stale,{rw:2,rd:2.5}));
 const impossible=patch(doc,2,{relief:{kind:'obround',width:4,depth:1}}),saved=structuredClone(impossible);assert.throws(()=>build(impossible,{rw:2,rd:2.5}));assert.deepEqual(impossible,saved);
});
test('native Dim relief remains supported independently but is excluded from this numeric editor',async()=>{
 for(const kind of ['rectangular','obround'] as const){
  const base=fixture(kind),doc={...patch(base,2,{relief:{kind,width:{parameter:'W'},depth:{parameter:'D'}}}),parameters:{W:2,D:2.5}},saved=structuredClone(doc);
  assert.equal(flangeReliefDimensionsHistoryEdit(doc,2),null);oracle(doc,kind,2,2.5);
  const literal=build(base,{rw:2,rd:2.5});near(massPropertiesOf(oracle(doc,kind,2,2.5)).volume,massPropertiesOf(oracle(literal,kind,2,2.5)).volume);
  const file=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in file);assert.deepEqual(file.doc,JSON.parse(JSON.stringify(doc)));oracle(file.doc,kind,2,2.5);assert.deepEqual(doc,saved);
 }
});
test('numeric edit codec roundtrip preserves relief type and unrelated feature fields',async()=>{
 for(const kind of ['rectangular','obround'] as const){const doc=build(fixture(kind),{rw:2,rd:2.5}),file=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in file);assert.deepEqual(file.doc,JSON.parse(JSON.stringify(doc)));oracle(file.doc,kind,2,2.5);}
});
