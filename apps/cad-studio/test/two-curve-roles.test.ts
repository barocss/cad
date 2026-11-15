import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDirect, importSource } from '@barocss/cad-model/engine/direct';
import { ruledMidpointNormal } from '../src/ui/ruledMidpointNormal';
test('read-only ruled midpoint orientation follows selected order without editing sources', () => {
  const d = importSource(emptyDirect(), '@model pair { version:0; length-unit:mm; @curve #a {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,0,0],[20,0,0]];weights:[1,1];} @curve #b {type:nurbs;degree:1;knots:[0,0,1,1];control-points:[[0,20,0],[20,20,0]];weights:[1,1];}}', 'pair');
  const [a,b] = d.objects.map(o => o.id), before = structuredClone(d);
  assert.deepEqual(ruledMidpointNormal(d,a,b), [0,0,1]);
  const reverse = ruledMidpointNormal(d,b,a)!;
  assert.equal(reverse[2], -1); assert.equal(Math.abs(reverse[0]) + Math.abs(reverse[1]), 0);
  assert.equal(ruledMidpointNormal(d,'missing',b), null);
  assert.deepEqual(d, before);
});
