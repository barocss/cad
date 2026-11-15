import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDirect, importSource, directOps } from '@barocss/cad-model/engine/direct';
import { friendly } from '@barocss/cad-model/engine/errors';
import { ruledEndpointCorrespondence } from '../src/ui/ruledEndpointCorrespondence';
test('crossed straight correspondence warns without changing source direction', () => {
  let d = importSource(emptyDirect(), '@model p {version:0;length-unit:mm; @curve #a {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,0,0],[20,0,0]];weights:[1,1];} @curve #b {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,20,0],[20,20,0]];weights:[1,1];}}','pair');
  const [a,b]=d.objects.map(o=>o.id);assert.equal(ruledEndpointCorrespondence(d,[a,b])?.crossedStraightPair,false);
  d=directOps.reverseCurve(d,b);const reversed=d.objects.at(-1)!.id,before=structuredClone(d);
  assert.equal(ruledEndpointCorrespondence(d,[a,reversed])?.crossedStraightPair,true);
  assert.equal(ruledEndpointCorrespondence(d,[reversed,a])?.crossedStraightPair,true);
  assert.equal(ruledEndpointCorrespondence(d,['missing',a]),null);assert.deepEqual(d,before);
});
test('undefined-normal Thicken refusal supersedes unrelated outline guidance only for its exact cause',()=>{
  const cause='the surface has no normal at a point (it is degenerate there)';
  const result=friendly(cause);assert.equal(result.title,'The surface normal is undefined');assert.match(result.hint,/Reducing thickness/);assert.equal(result.detail,cause);
  assert.notEqual(friendly('the profile is degenerate').title,result.title);
});

test('endpoint warning is not a general curved or intersecting-pair classifier', () => {
  const curve=(id:string,points:number[][])=>`@curve #${id} {type:nurbs;degree:2;knots:[0,0,0,1,1,1];control-points:${JSON.stringify(points)};weights:[1,1,1];}`;
  for(const second of [[[20,0,0],[10,0,0],[0,0,0]],[[20,20,0],[10,25,0],[0,20,0]],[[20,20,0],[10,15,0],[0,10,0]]]) {
    const d=importSource(emptyDirect(),`@model pair {version:0;length-unit:mm;${curve('a',[[0,0,0],[10,0,0],[20,0,0]])}${curve('b',second)}}`,'pair');
    assert.equal(ruledEndpointCorrespondence(d,[d.objects[0].id,d.objects[1].id])?.crossedStraightPair,false);
  }
});
