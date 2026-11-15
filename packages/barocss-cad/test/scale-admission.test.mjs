import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, checkBrep, massPropertiesOf, exportStep } from '../dist/index.js';
const D = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });
const box = (size=1) => [{id:'s',kind:'sketch',profile:'rectangle',min:[10,20],max:[10+12*size,20+8*size]}, {id:'e',kind:'extrude',sketch:'s',height:6*size,from:30}];
const scale = (features,factor,pivot=[4,-6,10],target='e') => D([...features,{id:'k',kind:'scale',target,factor,pivot}]);
test('Scale refuses empty, construction-collapse and planar sliver instead of committing a positive-mass empty body',()=>{
 for(const factor of [5e-9,1e-8,2e-8]){
  const doc=scale(box(),factor), before=JSON.stringify(doc);
  assert.throws(()=>evaluateCadPart(doc),e=>/Scale cannot preserve valid geometry for this body\./.test(e.message) && (e.details?.category ?? e.code) === 'GEOMETRY'&&/Increase Factor/.test(e.message));
  assert.equal(JSON.stringify(doc),before);
 }
});
test('valid small geometry remains usable and admission depends on actual dimensions, not a universal factor floor',()=>{
 for(const pivot of [[4,-6,10],[0,0,0]]) for(const [size,factor] of [[1,.005],[100,2e-8],[1,1]]){
  const output=evaluateCadPart(scale(box(size),factor,pivot)).outputs[0];
  assert.equal(output.brep.bodies.length,1);assert.equal(checkBrep(output.brep,{strict:true}).valid,true);
  assert.ok(output.brep.vertices.every(v=>v.point.every(Number.isFinite)));
  assert.ok(Math.abs(massPropertiesOf(output).volume/(576*size**3*factor**3)-1)<1e-6);
 }
});
test('ordinary curved and STEP-imported bodies retain Scale support',()=>{
 const cylinder=[{id:'s',kind:'sketch',profile:'circle',center:[0,0],radius:5},{id:'e',kind:'extrude',sketch:'s',height:10}];
 for(const factor of [.005,1,2]){
  const output=evaluateCadPart(scale(cylinder,factor)).outputs[0];assert.equal(checkBrep(output.brep).valid,true);
 }
 const source=evaluateCadPart(D(box())).outputs[0];
 const step=exportStep(source.brep,{name:'seed'});
 const imported=[{id:'e',kind:'import',step}];
 const output=evaluateCadPart(scale(imported,.005)).outputs[0];assert.equal(checkBrep(output.brep).valid,true);
});
test('faceted mesh Scale keeps ordinary nonempty topology',()=>{
 const mesh=[{id:'e',kind:'mesh',representation:'facets',positions:[0,0,0,1,0,0,0,1,0,0,0,1],indices:[0,2,1,0,1,3,1,2,3,2,0,3]}];
 const output=evaluateCadPart(scale(mesh,2)).outputs[0];
 assert.equal(output.brep.bodies.length,1);assert.equal(checkBrep(output.brep).valid,true);
});

test('multi-part Scale preserves per-output native IDs instead of caching one validation ID',()=>{
 const split=[...box(),{id:'sp',kind:'split',target:'e',axis:'x',at:16}];
 const outputs=evaluateCadPart(scale(split,2,[0,0,0],'sp')).outputs;
 assert.equal(outputs.length,2);
 assert.deepEqual(outputs.map(o=>o.id),['k/0','k/1']);
 assert.deepEqual(outputs.map(o=>o.brep.source.id),['k_0','k_1']);
 const ids=outputs.flatMap(o=>o.brep.bodies.map(b=>b.id));
 assert.equal(new Set(ids).size,ids.length);
 for(const output of outputs) assert.equal(checkBrep(output.brep).valid,true);
});
