import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, massPropertiesOf } from '@barocss/cad';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { directOps, emptyDirect, geometryOf, importSource } from '@barocss/cad-model/engine/direct';
import { partSnapshot } from '@barocss/cad-model/engine/part';
import { prepareDirectCurveCandidate } from '../src/app/directCurveCandidate';

function fixture() {
  let doc=emptyDoc();
  const ref=(node:number)=>({node,side:'solid'} as const);
  const box=(min:[number,number], max:[number,number])=>{
    const i=doc.nodes.length;
    doc=withNode(withNode(doc,{kind:'sketch',profile:'rectangle',min,max}),{kind:'extrude',sketch:i,height:10});
  };
  box([0,0],[60,40]);box([8,8],[12,10]);doc=withNode(doc,{kind:'difference',parent:ref(1),tool:ref(3)});
  box([8,26],[14,28]);doc=withNode(doc,{kind:'difference',parent:ref(4),tool:ref(6)});
  const direct=importSource(emptyDirect(),'@model path {version:0; length-unit:mm; @curve #rail {type:nurbs; degree:2; knots:[0,0,0,1,1,2,2,2]; control-points:[[0,0,0],[3,-4,0],[12,-16,0],[15,-12,0],[24,0,0]]; weights:[1,1,1,1,1];}}','Oblique rail');
  const objectId=direct.objects[0].id;
  const unlinked={...doc,direct};
  return {
    unlinked,direct,objectId, op:{kind:'stretch',objectId} as const,
    linked:withNode(unlinked,{kind:'curve-feature-pattern',parent:ref(7),path:{objectId},spacing:10,count:4}),
    stretch:(factor:[number,number,number])=>directOps.stretch(direct,[objectId],factor),
  };
}

test('only exact failed span on single consumed quadratic Stretch gets recovery hint',()=>{
  const {linked,stretch,op}=fixture();
  const snapshot=JSON.stringify(linked);
  const candidate=stretch([0.8,1,1]);
  assert.throws(()=>prepareDirectCurveCandidate(linked,candidate,op), /could not keep each span of the linked quadratic path exactly straight.*unchanged.*straight-segment polyline/);
  assert.throws(()=>prepareDirectCurveCandidate(linked,candidate), /must be the exact endpoint midpoint/);
  assert.throws(()=>prepareDirectCurveCandidate(linked,candidate,{...op,objectId:'wrong'}), /must be the exact endpoint midpoint/);
  assert.equal(JSON.stringify(linked),snapshot);
  assert.equal(linked.nodes[8].kind,'curve-feature-pattern');
  const [body]=partSnapshot(linked).outputs;
  assert.ok(checkBrep(body.brep,{strict:true}).valid);
  assert.equal(massPropertiesOf(body).volume,23440);
});

test('true short refusal unchanged, unlinked decimal edit ordinary, and dyadic linked candidate still accepted',()=>{
  const {linked,unlinked,stretch,op,objectId}=fixture();
  assert.throws(()=>prepareDirectCurveCandidate(linked,stretch([0.25,0.25,1]),op), {
    message:'[VALUE] Path cut pattern: the requested distance exceeds the path length.',
  });
  assert.equal(prepareDirectCurveCandidate(unlinked,stretch([0.8,1,1]),op),null);
  const ready=prepareDirectCurveCandidate(linked,stretch([0.875,1,1]),op);
  assert.ok(ready);
  assert.equal(ready.next.nodes,linked.nodes);
  assert.equal(ready.next.direct?.objects[0].id,objectId);
  const shape=geometryOf(ready.next.direct!,ready.next.direct!.objects[0]);
  assert.equal(shape.kind,'curve');
  assert.equal(shape.degree,2);
  const [body]=partSnapshot(ready.input).outputs;
  assert.ok(checkBrep(body.brep,{strict:true}).valid);
  assert.ok(Math.abs(massPropertiesOf(body).volume-23440)<1e-8);
});

test('held, suppressed or non-output consumers keep the ordinary span refusal',()=>{
  const {linked,stretch,op}=fixture();
  const candidate=stretch([0.8,1,1]);
  const node=linked.nodes[8];
  const held={...linked,nodes:[...linked.nodes.slice(0,8),{...node,held:'reference held'}]};
  const suppressed={...linked,nodes:[...linked.nodes.slice(0,8),{...node,suppressed:true as const}]};
  const notCurrent={...linked,outputs:{b7:{node:7,side:'solid' as const}}};
  for(const source of [held,suppressed,notCurrent]) {
    assert.throws(()=>prepareDirectCurveCandidate(source,candidate,op), {message:'[VALUE] Path cut pattern: each quadratic middle point must be the exact endpoint midpoint.'});
    assert.throws(()=>prepareDirectCurveCandidate(source,candidate), {message:'[VALUE] Path cut pattern: each quadratic middle point must be the exact endpoint midpoint.'});
  }
});
