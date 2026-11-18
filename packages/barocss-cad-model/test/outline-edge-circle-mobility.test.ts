import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineMobility, type PointMotion } from '../src/sketch/mobility';
import { solveShape, type Polygon } from '../src/sketch/rules';

type EdgeDistance = Extract<NonNullable<Polygon['rules']>[number], {kind:'cedge'}>;
const x: EdgeDistance = {kind:'cedge',edge:3,circle:0,axis:0,value:12};
const y: EdgeDistance = {kind:'cedge',edge:0,circle:0,axis:1,value:10};
function shape(rules: NonNullable<Polygon['rules']> = []): Polygon {
 return {kind:'polygon',closed:true,points:[[0,0],[40,0],[40,30],[0,30]],
  hv:{h:[0,2],v:[1,3]},lengths:{0:40,1:30},circles:[{c:[12,10],r:3}],circleIds:['circle1'],rules};
}
function direction(motion: PointMotion | undefined, expected: readonly [number,number]) {
 assert.ok(motion && motion.dimension===1);
 if (!motion || motion.dimension!==1) return;
 assert.ok(Math.abs(Math.hypot(...motion.direction)-1)<1e-12);
 assert.ok(Math.abs(motion.direction[0]*expected[1]-motion.direction[1]*expected[0])<1e-12);
}
function centre(s: Polygon, expected: 0 | 2 | readonly [number,number]) {
 const result=outlineMobility(s);assert.ok(result);
 assert.deepEqual(result.points,[]);assert.deepEqual(result.edges,[]);assert.deepEqual(result.directions,[]);
 if(expected===0)assert.deepEqual(result.circleDirections,[]);
 else {assert.equal(result.circleDirections?.length,1);assert.equal(result.circleDirections?.[0].circle,0);
  if(expected===2)assert.deepEqual(result.circleDirections?.[0].motion,{dimension:2});
  else direction(result.circleDirections?.[0].motion,expected);}
}
test('perpendicular edge distances constrain centre X then Y, and removing X restores only X',()=>{
 centre(shape(),2);centre(shape([x]),[0,1]);centre(shape([x,y]),0);centre(shape([y]),[1,0]);
});
test('opposite edges and exterior centres retain unsigned distance derivatives',()=>{
 centre(shape([{...x,edge:1,value:28}]),[0,1]);
 centre(shape([{...y,edge:2,value:20}]),[1,0]);
 centre(shape([{...x,edge:1,value:28},{...y,edge:2,value:20}]),0);
 const outside=shape([{...x,value:7},{...y,value:6}]);outside.circles=[{c:[-7,-6],r:3}];centre(outside,0);
 const beyond=shape([{...x,edge:1,value:7}]);beyond.circles=[{c:[47,10],r:3}];centre(beyond,[0,1]);
});
test('implicit horizontal/vertical constraints agree with explicit saved HV',()=>{
 for(const rules of [[x],[y],[x,y]]) {const explicit=shape(rules),implicit=structuredClone(explicit);delete implicit.hv;
  assert.deepEqual(outlineMobility(implicit),outlineMobility(explicit));assert.ok(outlineMobility(implicit));}
});
test('invalid edge, axis, circle, value and conflicting or absent HV are unavailable',()=>{
 const badRules: EdgeDistance[]=[
  ...[-1,4,.5,NaN,Infinity].map(edge=>({...x,edge})),
  ...[-1,1,.5,NaN,Infinity].map(circle=>({...x,circle})),
  ...[-1,2,.5,NaN,Infinity].map(axis=>({...x,axis} as EdgeDistance)),
  ...[0,-1,.000999,NaN,Infinity].map(value=>({...x,value})),
  {...x,axis:1}, // vertical edge cannot supply a Y distance
  {...y,axis:0},
  {...x,value:13}, // no implicit repair of unsatisfied geometry
 ];
 for(const rule of badRules)assert.equal(outlineMobility(shape([rule])),null,JSON.stringify(rule));
 const invalid: Polygon[]=[
  {...shape([x]),hv:{h:[],v:[]}},
  {...shape([x]),hv:{h:[0,2,3],v:[1,3]}},
  {...shape([x]),points:[[0,0],[40,0],[40,30],[0,0]]}, // selected edge zero length
  {...shape([x]),points:[[0,0],[40,0],[40,30],[1,30]]}, // explicit V residual is not satisfied
 ];
 const sparse=shape([x]);delete sparse.points[3];invalid.push(sparse);
 const nullEndpoint=shape([x]);nullEndpoint.points[3]=null as unknown as Polygon['points'][number];invalid.push(nullEndpoint);
 for(const candidate of invalid){assert.doesNotThrow(()=>outlineMobility(candidate));assert.equal(outlineMobility(candidate),null);}
});
test('moving support edge couples circle X to rectangle width rather than fixing it globally',()=>{
 const coupled=shape([{...x,edge:1,value:28},{kind:'cdy',a:0,circle:0,value:10}]);
 coupled.lengths={1:30}; // only width can change; point 0 remains the native anchor
 const result=outlineMobility(coupled);assert.ok(result);
 assert.deepEqual(result.points,[1,2]);assert.deepEqual(result.edges,[0,1,2]);
 assert.deepEqual(result.directions.map(d=>d.point),[1,2]);
 for(const row of result.directions)direction(row.motion,[1,0]);
 assert.equal(result.circleDirections?.length,1);direction(result.circleDirections?.[0].motion,[1,0]);
 // Independent exact family: W grows, centre X grows by the same amount, signed gap stays -28.
 for(const delta of [-.25,.25]) {const moved=structuredClone(coupled);
  moved.points[1][0]+=delta;moved.points[2][0]+=delta;moved.circles![0].c[0]+=delta;
  assert.equal(moved.circles![0].c[0]-moved.points[1][0],-28);
  assert.equal(moved.points[2][1]-moved.points[1][1],30);
  const motion=outlineMobility(moved);assert.ok(motion);assert.deepEqual(motion.points,[1,2]);assert.deepEqual(motion.edges,[0,1,2]);
  for(const row of motion.directions)direction(row.motion,[1,0]);assert.equal(motion.circleDirections?.length,1);direction(motion.circleDirections?.[0].motion,[1,0]);}
});
function freeze<T>(value:T):T {if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}return value;}
test('read-only diagnosis leaves source identities, radius and ordinary solver output unchanged',()=>{
 for(const rules of [[],[x],[x,y],[y]]) {const s=shape(rules),copy=structuredClone(s),solved=solveShape(structuredClone(s));assert.ok(solved.ok);
  const points=s.points,circle=s.circles![0],hv=s.hv,lengths=s.lengths;
  freeze(s);assert.ok(outlineMobility(s));assert.deepEqual(s,copy);
  assert.equal(s.points,points);assert.equal(s.circles![0],circle);assert.equal(s.hv,hv);assert.equal(s.lengths,lengths);assert.equal(circle.r,3);
  assert.deepEqual(solveShape(structuredClone(s)),solved);}
});
