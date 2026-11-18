import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, evaluateCadPart, faceGeometry, flatPatternOf, massPropertiesOf } from '@barocss/cad';
import { flangeWidthHistoryEdit } from '../src/app/flangeWidthHistoryEdit';
import type { Ctx, Values } from '../src/app/commands';
import { emptyDoc, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { captureSignatures } from '../src/engine/references';
import { toPartDocument } from '../src/engine/part';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
function fixture():StudioDoc {
 const base=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]}),{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
 const evaluated=evaluateDoc(base,1);assert.ok(evaluated.ok);
 return captureSignatures(withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},edges:['n1.side1|n1.top'],length:20}),evaluated.bodies);
}
const ctx=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}});
const patch=(doc:StudioDoc,index:number,value:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===index?{...n,...value} as ModelNode:n)});
const values=(relief='obround'):Values=>({o0:10,o1:25,relief,rw:1.5,rd:1.5});
function build(doc:StudioDoc,v:Values){const c=flangeWidthHistoryEdit(doc,2);assert.ok(c?.build);return c.build(ctx(doc),v);}
const near=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<1e-7,`${a} != ${b}`);
function oracle(doc:StudioDoc,kind:'none'|'rectangular'|'obround') {
 const outputs=evaluateCadPart(toPartDocument(doc)).outputs;assert.equal(outputs.length,1);const o=outputs[0];assert.equal(o.bodyCount,1);assert.ok(checkBrep(o.brep,{strict:true}).valid);
 const cut=kind==='none'?0:kind==='rectangular'?2*1.5*4.5:2*(1.5*3.75+Math.PI*.75**2/2);
 near(massPropertiesOf(o).volume,1.5*(4000-3*15-cut+15*(17+Math.PI/2*2.25)));
 const flat=flatPatternOf(o);near(flat.area,4000-3*15-cut+15*(17+Math.PI/2*2.16));assert.equal(flat.loops.length,1);assert.equal(flat.bends.length,1);near(flat.bends[0].allowance,Math.PI/2*2.16);
 const cylinders=o.brep.faces.map(faceGeometry).filter(g=>g.kind==='cylinder');
 const bend=cylinders.filter(g=>Math.abs(g.a[1])>1-1e-9);assert.ok(bend.some(g=>Math.abs(g.r-1.5)<1e-9));assert.ok(bend.some(g=>Math.abs(g.r-3)<1e-9));
 for(const g of bend){near(g.c[0],77);near(g.c[2],3);}
 if(kind==='obround'){const caps=cylinders.filter(g=>Math.abs(g.r-.75)<1e-9);assert.equal(caps.length,2);for(const g of caps)near(Math.abs(g.a[2]),1);}
 const top=o.brep.vertices.filter(v=>v.point[2]>1.5+1e-8);near(Math.max(...top.map(v=>v.point[1]))-Math.min(...top.map(v=>v.point[1])),15);near(Math.max(...top.map(v=>v.point[2])),20);
}
test('full-width defaults and explicit no-op retain omitted offsets, relief and radius',()=>{
 const doc=fixture(),saved=structuredClone(doc),c=flangeWidthHistoryEdit(doc,2);assert.ok(c?.build && c.defaults);assert.equal(c.label,'Edit flange width');
 const defaults=c.defaults(ctx(doc));assert.deepEqual(defaults,{o0:0,o1:0,relief:'',rw:'',rd:''});assert.equal(c.build(ctx(doc),defaults),doc);
 for(const key of ['offsets','relief','bendRadius'])assert.equal(Object.hasOwn(doc.nodes[2],key),false);assert.deepEqual(doc,saved);
});
test('explicit partial relief changes only offsets and relief; independent native solid and flat oracles',()=>{
 for(const kind of ['none','rectangular','obround'] as const){const doc=fixture(),saved=structuredClone(doc),v=kind==='none'?{...values(kind),rw:'',rd:''}:values(kind),next=build(doc,v);
 const old=doc.nodes[2];assert.ok(old.kind==='sheet-flange');assert.deepEqual(next,{...doc,nodes:[doc.nodes[0],doc.nodes[1],{...old,offsets:[10,25],relief:kind==='none'?{kind}:{kind,width:1.5,depth:1.5}}]});
 assert.equal(next.nodes[0],doc.nodes[0]);assert.equal(next.nodes[1],doc.nodes[1]);assert.equal(next.nodes[2].sigs,old.sigs);assert.equal(next.outputs,doc.outputs);assert.equal(next.nextId,doc.nextId);oracle(next,kind);assert.deepEqual(doc,saved);
 assert.equal(flangeWidthHistoryEdit(next,2),null,'Existing partial-width editor is not replaced');
 }
});
test('invalid, missing, mixed, impossible offsets and relief refuse without source mutation',()=>{
 const doc=fixture(),saved=structuredClone(doc),c=flangeWidthHistoryEdit(doc,2);assert.ok(c?.build);
 const invalid:Values[]=[{}, {...values(),relief:''},{...values(),relief:'unknown'},{...values(),o0:''},{...values(),o0:-1},{...values(),o1:NaN},{...values(),o0:Infinity},{...values(),rw:''},{...values(),rd:''},{...values(),rw:0},{...values(),rd:-1},{...values(),rw:Infinity},{...values(),rd:NaN},{...values(),o0:30,o1:25},{...values(),o0:.5},{...values(),rw:4,rd:1},{...values(),length:21},{...values(),unexpected:1}];
 for(const v of invalid){assert.throws(()=>c.build!(ctx(doc),v),JSON.stringify(v));assert.deepEqual(doc,saved);}
});
test('captured identity and canonical source revision guard reject foreign and mutated owners',()=>{
 const doc=fixture(),c=flangeWidthHistoryEdit(doc,2);assert.ok(c?.build);assert.equal(c.available(ctx(structuredClone(doc))).ok,false);assert.throws(()=>c.build!(ctx(structuredClone(doc)),values()));
 doc.parameters.changed=1;assert.equal(c.available(ctx(doc)).ok,false);assert.throws(()=>c.build!(ctx(doc),values()));
 const second=fixture(),d=flangeWidthHistoryEdit(second,2);assert.ok(d?.build);const n=second.nodes[2];assert.ok(n.kind==='sheet-flange');n.length=21;assert.throws(()=>d.build!(ctx(second),values()));
});
test('unsupported source metadata, bindings, consumers and original native evidence refuse',()=>{
 const doc=fixture();
 const unsupported:StudioDoc[]=[patch(doc,0,{plane:{}}),patch(doc,0,{max:[{parameter:'W'},50]}),patch(doc,1,{thickness:{parameter:'T'}}),patch(doc,1,{bendRadius:{parameter:'R'}}),patch(doc,2,{bendRadius:2}),patch(doc,2,{angle:45}),patch(doc,2,{measure:'inner'}),patch(doc,2,{position:'material-outside'}),patch(doc,2,{offsets:[0,0]}),patch(doc,2,{relief:{kind:'none'}}),patch(doc,2,{held:'test'}),patch(doc,2,{suppressed:true}),patch(doc,2,{made:{}}),patch(doc,2,{sigs:undefined}),patch(doc,2,{edges:['n1.side0|n1.top']}),{...doc,instances:[]},{...doc,direct:{} as StudioDoc['direct']},withNode(doc,{kind:'translate',parent:{node:2,side:'solid'},offset:[1,0,0]})];
 for(const d of unsupported)assert.equal(flangeWidthHistoryEdit(d,2),null);
 assert.ok(flangeWidthHistoryEdit({...doc,direct:undefined},2));
 const f=doc.nodes[2];assert.ok(f.kind==='sheet-flange');const stale=patch(doc,2,{sigs:{[f.edges[0]]:{...f.sigs![f.edges[0]],s:49}}});assert.throws(()=>build(stale,values()));
 const invalid=patch(doc,2,{length:1}),saved=structuredClone(invalid);assert.throws(()=>build(invalid,{o0:0,o1:0,relief:'',rw:'',rd:''}));assert.deepEqual(invalid,saved);
});
test('partial saved container roundtrip preserves explicit relief, omission and native geometry',async()=>{
 for(const kind of ['none','rectangular','obround'] as const){const doc=build(fixture(),kind==='none'?{...values(kind),rw:'',rd:''}:values(kind)),file=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in file);assert.deepEqual(file.doc,JSON.parse(JSON.stringify(doc)));assert.equal(Object.hasOwn(file.doc.nodes[2],'bendRadius'),false);oracle(file.doc,kind);}
});
