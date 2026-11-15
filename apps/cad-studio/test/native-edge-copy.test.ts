import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { edgeCurve } from '@barocss/cad-model/engine/curveSource';
import test from 'node:test';
import assert from 'node:assert/strict';
import { exactDecimal, nativeEdgeCurveSource } from '../src/app/nativeEdgeCurveSource';
import { readOwnedNativeEdges, ownsNativeEdgeCopy } from '../src/app/ownedNativeEdgeCopy';
import { emptyDirect, importSource, geometryOf } from '@barocss/cad-model/engine/direct';
const curve={degree:2,knots:[0,0,0,1,1,1],points:[[1e-12,0,0],[.12345678912345678,1,0],[2,0,0]] as [number,number,number][],weights:[1,.8944271909999159,1]};
test('source decimal expansion retains double values and import appends without rounding',()=>{
 for(const n of [0,-0,1e-12,-2.2250738585072014e-308,5e-324,Number('1.2345678912345678'),1e21,Number.MAX_VALUE]){const s=exactDecimal(n);assert.ok(!/[eE]/.test(s));assert.ok(Object.is(Number(s),n));}
 assert.throws(()=>exactDecimal(NaN));assert.throws(()=>exactDecimal(Infinity));
 const before=importSource(emptyDirect(),nativeEdgeCurveSource([curve]),'Existing'),snapshot=structuredClone(before);
 const next=importSource(before,nativeEdgeCurveSource([curve]),'Edge curve');assert.equal(next.objects.length,2);assert.deepEqual(before,snapshot);
 const out=geometryOf(next,next.objects[1]);assert.equal(out.kind,'curve');if(out.kind!=='curve')return;
 assert.equal(out.degree,curve.degree);assert.deepEqual(out.knots,curve.knots);assert.deepEqual(out.controlPoints,curve.points);assert.deepEqual(out.weights,curve.weights);
});
test('native edge read is all-or-nothing and obsolete success/error is silent',async()=>{
 const reply={curve,edgeId:'e1',edgeName:'e1'};let current=true;
 assert.deepEqual(await readOwnedNativeEdges([1,2],async()=>reply,()=>true),[curve,curve]);
 await assert.rejects(readOwnedNativeEdges([1,2],async i=>i===1?reply:{error:'not native'},()=>true),/not native/);
 assert.equal(await readOwnedNativeEdges([1],async()=>{current=false;return reply;},()=>current),undefined);
 current=true;assert.equal(await readOwnedNativeEdges([1],async()=>{current=false;throw Error('old');},()=>current),undefined);
 await assert.rejects(readOwnedNativeEdges(Array(17).fill(1),async()=>reply,()=>true),/16/);
});

test('legacy merged circular rim and straight displayed edge remain copyable without native-coefficient claims',()=>{
 const doc=withNode(rectanglePart(32,32,8),{kind:'hole',parent:{node:1,side:'solid'},center:[16,16],radius:4});
 const result=evaluateDoc(doc,1);assert.ok(result.ok);const mesh=result.bodies[0].mesh;
 const rim=mesh.edges.findIndex(e=>!e.nativeJoint&&!!e.nativeCircle),line=mesh.edges.findIndex(e=>e.straight);assert.ok(rim>=0,JSON.stringify(mesh.edges.map(e=>({native:!!e.nativeJoint,circle:!!e.nativeCircle,straight:e.straight}))));assert.ok(line>=0);
 for(const index of [rim,line]){const copied=edgeCurve(mesh,index);assert.ok(copied);const next=importSource(emptyDirect(),nativeEdgeCurveSource([copied]),index===rim?'Display approximation':'Line');assert.equal(next.objects.length,1);}
});

test('copy owner requires current accepted geometry as well as document, selection and scope',()=>{
 const owner={doc:{},evaluated:{},bodies:[],selection:{},scope:{},fresh:true,busy:false};assert.ok(ownsNativeEdgeCopy(owner,{...owner}));
 for(const key of ['doc','evaluated','bodies','selection','scope'] as const)assert.equal(ownsNativeEdgeCopy(owner,{...owner,[key]:{}}),false);
 for(const state of [{fresh:false},{busy:true}]){assert.equal(ownsNativeEdgeCopy(owner,{...owner,...state}),false);assert.equal(ownsNativeEdgeCopy({...owner,...state},owner),false);}
});
