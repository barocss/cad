import test from 'node:test';
import assert from 'node:assert/strict';
import { outlineMobility, type PointMotion } from '../src/sketch/mobility';
import { solveShape, type Polygon } from '../src/sketch/rules';
function rounded(): Polygon {
 const b = Math.tan(Math.PI / 8);
 return { kind: 'polygon', closed: true, points: [[0,0],[36,0],[40,4],[40,30],[4,30],[0,26]], bulges: [0,b,0,0,b,0], hv: {h:[0,3],v:[2,5]}, tangents:[1,2,4,5], radii:{1:4,4:4} };
}
test('two Round corners retain authored directions and solver/input exactly', () => {
 const s=rounded(), snapshot=structuredClone(s), solved=solveShape(s), result=outlineMobility(s);
 assert.ok(result); assert.deepEqual(result.points,[1,2,3,4,5]); assert.deepEqual(result.edges,[0,1,2,3,4,5]);
 for(const [point,axis] of [[1,0],[2,0],[4,1],[5,1]]) { const m: PointMotion=result.directions.find(d=>d.point===point)!.motion; assert.ok(m?.dimension===1); assert.ok(Math.abs(Math.abs(m.direction[axis])-1)<1e-12); }
 assert.equal(result.directions.find(d=>d.point===3)!.motion?.dimension,2);
 assert.deepEqual(s,snapshot); assert.deepEqual(solveShape(s),solved); assert.equal(result.circleDirections,undefined);
});
test('equal radii couple two center-only motions without exposing helper points', () => {
 const s=rounded(); s.rules=s.points.map((at,point)=>({kind:'fix',point,at})); s.tangents=[]; s.radii={};
 for(const [extra,dof] of [[{},2],[{equalRadii:[[1,4]]},1],[{equalRadii:[[1,4]],radii:{1:4}},0]] as const) {
  const shape={...s,...extra} as Polygon, snapshot=structuredClone(shape), solve=solveShape(shape); assert.ok(solve.ok); assert.equal(solve.dof,dof);
  assert.deepEqual(outlineMobility(shape),{points:[],edges:dof?[1,4]:[],directions:[]}); assert.deepEqual(shape,snapshot);
 }
});
test('released radii and equal-radius relation retain the existing diagnostic rank', () => {
 const base=rounded();
 for(const [radii,equalRadii,dof] of [[{},undefined,4],[{},[[1,4]],3],[{1:4},[[1,4]],2]] as const) {
  const s={...base,radii,equalRadii} as Polygon, solve=solveShape(s); assert.ok(solve.ok); assert.equal(solve.dof,dof); assert.ok(outlineMobility(s));
 }
});
test('malformed or unsupported metadata is not silently ignored for either arc', () => {
 const s=rounded(), b=s.bulges![1], sparseBulges=[0,b,0,0,b,0]; delete sparseBulges[2];
 const bad: unknown[]=[{radii:{0:4}},{radii:{4:NaN}},{radii:Object.create({4:4})},{lengths:{4:4}},{hv:{h:[4],v:[]}},
  {tangents:[0]},{tangents:new Array(1)},{equalRadii:new Array(1)},{equalRadii:[[1]]},{equalRadii:[[1,1]]},{equalRadii:[[1,2]]},{equalRadii:[[4,1]]},{equalRadii:[[1,4],[1,4]]},
  {rules:[{kind:'parallel',a:0,b:4}]},{rules:[{kind:'symmetric',a:0,b:3,line:4}]},{bulges:[0,b,b,0,0,0]},{bulges:[b,0,0,0,0,b]},{bulges:[b,b,0,0,b,0]},
  {bulges:[0,b,0,0,b,NaN]},{bulges:sparseBulges},{circles:[{c:[10,10],r:2}]},{concentric:[[1,4]]},{fromSpline:true},{fromEllipse:true}];
 for(const patch of bad) assert.equal(outlineMobility({...s,...patch as object}),null,JSON.stringify(patch));
});
test('unsatisfied radius and near singular constraints remain unavailable', () => {
 assert.equal(outlineMobility({...rounded(),radii:{1:5,4:4}}),null);
 const b=1-1e-9, points: Polygon['points']=[[0,0],[20,0],[20,20],[0,20]], r=Math.hypot(10,10*(1-b*b)/(2*b));
 const s:Polygon={kind:'polygon',closed:true,points,bulges:[b,0,b,0],hv:{h:[],v:[]},rules:points.map((at,point)=>({kind:'fix',point,at})),radii:{0:r,2:r}};
 assert.equal(outlineMobility(s),null);
 const singular={...s,bulges:[1,0,1,0],radii:{0:10,2:10}};
 assert.deepEqual(outlineMobility(singular),{points:[],edges:[0,2],directions:[]});
});
