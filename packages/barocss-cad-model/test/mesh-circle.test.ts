import test from 'node:test';
import assert from 'node:assert/strict';
import { meshCircle } from '../src/app/meshCircle';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('reference circles preserve non-axis geometry and all input permutations',()=>{
 const points=[[10,23,34],[15,20,30],[10,17,26]],before=structuredClone(points);
 for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
  const r=meshCircle(order.map(i=>points[i]));assert.ok(r.ok);r.center.forEach((x,i)=>near(x,[10,20,30][i]));near(r.radius,5);near(r.diameter,10);near(Math.hypot(...r.normal),1);
 }
 assert.deepEqual(points,before);
});
test('translation and uniform scale retain reference circle values without rounding',()=>{
 for(const scale of [1e-3,1,1e6])for(const shift of [0,1000]){
  const r=meshCircle([[5,0,0],[0,5,0],[-5,0,0]].map(p=>p.map(x=>x*scale+shift)));
  assert.ok(r.ok);r.center.forEach(x=>near(x,shift));near(r.radius,5*scale);
 }
});
test('malformed, repeated, short, nearly collinear and excessive coordinates refuse',()=>{
 for(const p of [[],[[0,0,0],[1,0,0]],[[0,0,0],[NaN,1,0],[1,1,0]],[[0,0,0],[0,0,0],[1,1,0]],[[0,0,0],[1e-7,0,0],[0,1,0]],[[0,0,0],[1,0,0],[2,1e-10,0]],[[1e13,0,0],[0,1,0],[0,0,1]],new Array(3)])assert.equal(meshCircle(p).ok,false);
});
