import test from 'node:test';
import assert from 'node:assert/strict';
import {checkBrep,evaluateCadPart,flatPatternOf,massPropertiesOf,faceGeometry} from '@barocss/cad';
import {partialFlangeRadiusHistoryEdit} from '../src/app/partialFlangeRadiusHistoryEdit';
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
function build(doc:StudioDoc,v:Values){const c=partialFlangeRadiusHistoryEdit(doc,2);assert.ok(c?.build);return c.build(ctx(doc),v);}
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
test('partial radius-only edits preserve relief offsets signature and source for both native relief kinds',()=>{
 for(const kind of ['rectangular','obround'] as const){const doc=fixture(kind),saved=structuredClone(doc),next=build(doc,{r:3}),n=doc.nodes[2];assert.ok(n.kind==='sheet-flange');assert.deepEqual(next,{...doc,nodes:[doc.nodes[0],doc.nodes[1],{...n,bendRadius:3}]});assert.equal(next.nodes[0],doc.nodes[0]);assert.equal(next.nodes[2].sigs,n.sigs);assert.ok(next.nodes[2].kind==='sheet-flange');assert.equal(next.nodes[2].relief,n.relief);assert.equal(next.nodes[2].offsets,n.offsets);oracle(next,kind,3);oracle(doc,kind,2);assert.deepEqual(doc,saved);}
});
test('no-op returns exact document and existing own radius default',()=>{const doc=fixture(),c=partialFlangeRadiusHistoryEdit(doc,2);assert.ok(c?.build&&c.defaults);assert.deepEqual(c.defaults(ctx(doc)),{r:2});assert.equal(c.build(ctx(doc),{r:2}),doc);});
test('invalid and mixed radius drafts refuse atomically',()=>{
 const doc=fixture(),saved=structuredClone(doc);const invalid:Values[]=[{},{r:''},{r:0},{r:-1},{r:Infinity},{r:NaN},{r:19},{r:3,length:21},{r:3,angle:45},{r:3,rw:2},{r:3,source:'sheet'}];for(const v of invalid){assert.throws(()=>build(doc,v));assert.deepEqual(doc,saved);}
});
test('captured document identity and canonical revision reject stale owners',()=>{const doc=fixture(),c=partialFlangeRadiusHistoryEdit(doc,2);assert.ok(c?.build);const copy=structuredClone(doc);assert.equal(c.available(ctx(copy)).ok,false);assert.throws(()=>c.build!(ctx(copy),{r:3}));doc.parameters.changed=1;assert.equal(c.available(ctx(doc)).ok,false);assert.throws(()=>c.build!(ctx(doc),{r:3}));});
test('unsupported recipes and original invalid evidence remain excluded',()=>{
 const doc=fixture();for(const d of [patch(doc,0,{plane:{}}),patch(doc,1,{thickness:{parameter:'T'}}),patch(doc,2,{bendRadius:undefined}),patch(doc,2,{bendRadius:{parameter:'R'}}),patch(doc,2,{offsets:[0,0]}),patch(doc,2,{offsets:[{parameter:'O'},25]}),patch(doc,2,{relief:{kind:'none'}}),patch(doc,2,{angle:45}),patch(doc,2,{measure:'inner'}),patch(doc,2,{position:'material-outside'}),patch(doc,2,{sigs:undefined}),patch(doc,2,{edges:['n1.side0|n1.top']}),patch(doc,2,{held:'test'}),patch(doc,2,{suppressed:true}),{...doc,direct:{} as StudioDoc['direct']},withNode(doc,{kind:'translate',parent:{node:2,side:'solid'},offset:[1,0,0]})])assert.equal(partialFlangeRadiusHistoryEdit(d,2),null);
 const n=doc.nodes[2];assert.ok(n.kind==='sheet-flange');const forged=patch(doc,2,{sigs:{[n.edges[0]]:{...n.sigs![n.edges[0]],s:49}}});assert.throws(()=>build(forged,{r:3}));const impossible=patch(doc,2,{bendRadius:19});assert.throws(()=>build(impossible,{r:3}));assert.throws(()=>build(impossible,{r:19}));
});
test('existing relief Dim native and codec support remain unchanged and numeric editor excludes them',async()=>{
 for(const kind of ['rectangular','obround'] as const){const original=fixture(kind),doc={...patch(original,2,{relief:{kind,width:{parameter:'W'},depth:{parameter:'D'}}}),parameters:{W:2,D:2.5}},saved=structuredClone(doc);assert.equal(partialFlangeRadiusHistoryEdit(doc,2),null);oracle(doc,kind,2,2,2.5);const file=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in file);assert.deepEqual(file.doc,JSON.parse(JSON.stringify(doc)));oracle(file.doc,kind,2,2,2.5);assert.deepEqual(doc,saved);}
});
test('edited numeric own radius survives codec without changing inherited sheet rule',async()=>{for(const kind of ['rectangular','obround'] as const){const doc=build(fixture(kind),{r:3}),file=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in file);assert.deepEqual(file.doc,JSON.parse(JSON.stringify(doc)));oracle(file.doc,kind,3);}});
