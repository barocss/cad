import test from 'node:test';
import assert from 'node:assert/strict';
import { mirrorOutline } from '../src/sketch/mirrorOutline';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { tagsOf } from '@barocss/cad-model/sketch/entityIds';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState,SketchShape } from '@barocss/cad-model/sketch/types';
const source:Extract<SketchShape,{kind:'polygon'}>={kind:'polygon',closed:true,points:[[2,3],[8,3],[7,7],[2,6]],hv:{h:[],v:[]},ids:['e0','e1','e2','e3']};
const state=():SketchState=>({shape:structuredClone(source),tool:'select',plane:xyPlane(),done:[{kind:'circle',c:[50,50],r:2,construction:true,ids:['e4']}]});
const area=(p:readonly (readonly number[])[])=>p.reduce((a,v,i)=>{const n=p[(i+1)%p.length];return a+v[0]*n[1]-n[0]*v[1];},0)/2;
function accepted(s:SketchState,axis:'x'|'y',value:number){const r=mirrorOutline(s,axis,value);assert.ok('shape'in r,JSON.stringify(r));return r.shape;}
test('X/Y reflection independently mirrors coordinates, reverses winding and retains each side identity',()=>{
 for(const [axis,value,expected] of [['x',10,[[18,3],[12,3],[13,7],[18,6]]],['y',-2,[[2,-7],[8,-7],[7,-11],[2,-10]]]] as const){
  const s=state(),before=structuredClone(s),r=accepted(s,axis,value);assert.deepEqual(r.points,expected);assert.equal(r.ids,s.shape!.ids);assert.equal(r.hv,(s.shape as typeof source).hv);assert.deepEqual(s,before);assert.equal(area(r.points),-area(source.points));
  for(let i=0;i<4;i++){const j=(i+1)%4;assert.equal(Math.hypot(r.points[i][0]-r.points[j][0],r.points[i][1]-r.points[j][1]),Math.hypot(source.points[i][0]-source.points[j][0],source.points[i][1]-source.points[j][1]));}
  assert.deepEqual(accepted({...s,shape:r},axis,value),s.shape);
 }
});
test('settle/profile keep reflected snapshot and tags; reverse loop normalization maps IDs to the same sides',()=>{
 const s=state(),r=accepted(s,'x',10),before=structuredClone(r),settled=settleShape(r,s.shape);assert.equal(settled.error,null);assert.deepEqual((settled.shape as typeof source).points,r.points);assert.deepEqual(r,before);
 const a=profileOf([r,...s.done!]),b=profileOf([settled.shape!,...s.done!]);assert.deepEqual(a,b);assert.ok('node'in a);if('node'in a){assert.equal(a.node.profile,'polygon');assert.deepEqual(a.node.sideTags?.outer,r.ids);if(a.node.profile==='polygon')assert.deepEqual(a.node.points,r.points);}
 const reversed=[...r.points].reverse().map(start=>({kind:'line' as const,start}));assert.deepEqual(tagsOf(r,reversed),['e2','e1','e0','e3']);
});
test('concave straight outline remains a valid line-loop snapshot, not a silently convexified polygon',()=>{
 const s=state();s.shape={...source,points:[[0,0],[6,0],[6,2],[2,2],[2,5],[0,5]],ids:['e0','e1','e2','e3','e5','e6']};
 const r=accepted(s,'y',1);assert.deepEqual(r.points,[[0,2],[6,2],[6,0],[2,0],[2,-3],[0,-3]]);
 const p=profileOf([r]);assert.ok('node'in p);if('node'in p){assert.equal(p.node.profile,'loop');assert.deepEqual(p.node.sideTags?.outer,r.ids);}
 assert.deepEqual(accepted({...s,shape:r},'y',1),s.shape);
});
test('constrained/derived/linked/multiple source refusal preserves source without dropping metadata',()=>{
 for(const patch of [{hv:undefined},{hv:{h:[0],v:[]}},{rules:[{kind:'fix' as const,point:0,at:[2,3] as [number,number]}]},{lengths:{0:6}},{radii:{0:3}},{bulges:[.2]},{fromSpline:true as const},{fromEllipse:true as const},{construction:true as const},{circles:[{c:[4,4] as [number,number],r:1}]}]){const s=state();s.shape={...source,...patch};const before=structuredClone(s);assert.ok('error'in mirrorOutline(s,'x',0));assert.deepEqual(s,before);}
 for(const patch of [{association:{}},{band:{}},{bandPicks:['e4']},{done:[{kind:'circle',c:[20,20],r:1}]}])assert.ok('error'in mirrorOutline({...state(),...patch} as SketchState,'x',0));
});
test('finite range, malformed axis, collapsed and self-crossing guards apply before and after mirror',()=>{
 for(const value of [NaN,Infinity,10001])assert.ok('error'in mirrorOutline(state(),'x',value));
 assert.ok('error'in mirrorOutline(state(),'z' as 'x',0));assert.ok('error'in mirrorOutline(state(),'x',-10000));
 for(const points of [[[0,0],[1,0],[2,0]],[[0,0],[4,4],[0,4],[4,0]],[[0,0],[1e-9,0],[1,2]]]){const s=state();s.shape={...source,points:points as [number,number][],ids:undefined};const before=structuredClone(s);assert.ok('error'in mirrorOutline(s,'y',0));assert.deepEqual(s,before);}
});
