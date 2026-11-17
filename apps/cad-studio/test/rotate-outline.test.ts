import test from 'node:test';
import assert from 'node:assert/strict';
import { rotateOutline } from '../src/sketch/rotateOutline';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState,SketchShape } from '@barocss/cad-model/sketch/types';
const source:Extract<SketchShape,{kind:'polygon'}>={kind:'polygon',closed:true,points:[[2,3],[8,3],[7,7],[2,6]],hv:{h:[],v:[]},ids:['e0','e1','e2','e3']};
const state=():SketchState=>({shape:structuredClone(source),tool:'select',plane:xyPlane(),done:[{kind:'circle',c:[50,50],r:2,construction:true,ids:['e4']}]});
function accepted(s:SketchState,angle:number,pivot:readonly[number,number]){const r=rotateOutline(s,angle,pivot);assert.ok('shape' in r,JSON.stringify(r));return r.shape;}
test('exact cardinal rotations about first point and explicit off-origin pivot preserve metadata/source',()=>{
 const s=state(),before=structuredClone(s),r=accepted(s,90,[2,3]);
 assert.deepEqual(r.points,[[2,3],[2,9],[-2,8],[-1,3]]);assert.equal(r.ids,s.shape!.ids);assert.equal(r.hv,(s.shape as typeof source).hv);assert.deepEqual(s,before);
 assert.deepEqual(accepted(s,-90,[2,3]).points,[[2,3],[2,-3],[6,-2],[5,3]]);
 assert.deepEqual(accepted(s,180,[10,20]).points,[[18,37],[12,37],[13,33],[18,34]]);
 for(const angle of [0,360,-720])assert.equal(accepted(s,angle,[10,20]),s.shape);
});
test('45 degree independent coordinates, area/length invariants, settle and profile snapshots',()=>{
 const s=state(),r=accepted(s,45,[2,3]),q=Math.SQRT1_2;
 const expected=[[2,3],[2+6*q,3+6*q],[2+q,3+9*q],[2-3*q,3+3*q]];
 r.points.forEach((p,i)=>p.forEach((v,k)=>assert.ok(Math.abs(v-expected[i][k])<1e-12)));
 const area=(p:number[][])=>p.reduce((a,v,i)=>{const n=p[(i+1)%p.length];return a+v[0]*n[1]-n[0]*v[1];},0)/2;
 assert.ok(Math.abs(area(r.points)-area(source.points))<1e-12);
 for(let i=0;i<4;i++){const j=(i+1)%4;assert.ok(Math.abs(Math.hypot(r.points[i][0]-r.points[j][0],r.points[i][1]-r.points[j][1])-Math.hypot(source.points[i][0]-source.points[j][0],source.points[i][1]-source.points[j][1]))<1e-12);}
 const before=structuredClone(r),settled=settleShape(r,s.shape);assert.equal(settled.error,null);assert.deepEqual((settled.shape as typeof source).points,r.points);assert.deepEqual(r,before);
 const direct=profileOf([r,...s.done!]),downstream=profileOf([settled.shape!,...s.done!]);assert.deepEqual(downstream,direct);assert.ok('node' in direct);if('node' in direct){assert.equal(direct.node.profile,'polygon');assert.deepEqual(direct.node.sideTags?.outer,r.ids);if(direct.node.profile==='polygon')assert.deepEqual(direct.node.points,r.points);}
});
test('constraints and derived/linked/multiple geometry refuse atomically instead of dropping state',()=>{
 const changes:Partial<typeof source>[]=[{hv:undefined},{radii:{0:2}},{rules:[{kind:'fix',point:0,at:[2,3]}]},{tangents:[0]},{equalRadii:[[0,1]]},{concentric:[[0,1]]},{bulges:[.1,0,0,0]},{fromSpline:true},{fromEllipse:true},{circles:[{c:[4,4],r:1}]},{circleIds:['e4']},{pending:true},{closed:false},{construction:true}];
 for(const change of changes){const s=state();s.shape={...source,...change};const before=structuredClone(s);assert.ok('error' in rotateOutline(s,90,[0,0]));assert.deepEqual(s,before);}
 const s=state();s.done!.push({kind:'circle',c:[20,20],r:1});assert.ok('error' in rotateOutline(s,90,[0,0]));
 for(const change of [{association:{}},{band:{}},{bandPicks:['e4']}])assert.ok('error' in rotateOutline({...state(),...change} as SketchState,90,[0,0]));
});
test('invalid numeric/range/collapsed/intersecting/short inputs are refused without source mutation',()=>{
 for(const angle of [NaN,Infinity])assert.ok('error' in rotateOutline(state(),angle,[0,0]));
 for(const pivot of [[NaN,0],[10001,0],[0,Infinity]])assert.ok('error' in rotateOutline(state(),90,pivot as [number,number]));
 assert.ok('error' in rotateOutline(state(),180,[10000,10000]));
 for(const points of [[[0,0],[1,0],[2,0]],[[0,0],[1e-9,0],[1,2]],[[0,0],[4,4],[0,4],[4,0]],[[0,0],[NaN,0],[1,2]]]){
  const s=state();s.shape={...source,points:points as [number,number][],ids:undefined};const before=structuredClone(s);assert.ok('error' in rotateOutline(s,90,[0,0]));assert.deepEqual(s,before);
 }
});
