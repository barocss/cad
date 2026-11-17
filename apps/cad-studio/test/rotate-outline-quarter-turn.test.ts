import test from 'node:test';
import assert from 'node:assert/strict';
import { rotateOutline } from '../src/sketch/rotateOutline';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchShape,SketchState } from '@barocss/cad-model/sketch/types';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const shape=():Polygon=>({kind:'polygon',closed:true,points:[[2,3],[8,3],[8,7],[2,7]],hv:{h:[0,2],v:[1,3]},lengths:{0:6},ids:['a','b','c','d']});
const state=(s:Polygon):SketchState=>({shape:s,plane:xyPlane(),tool:'select'});
test('quarter turns about off-origin pivot swap H/V only on odd quarter turns',()=>{
 const cases=[ [90,[[10,1],[10,7],[6,7],[6,1]]],[180,[[12,9],[6,9],[6,5],[12,5]]],[270,[[4,11],[4,5],[8,5],[8,11]]],[-90,[[4,11],[4,5],[8,5],[8,11]]]] as const;
 for(const [angle,expected] of cases){const s=shape(),before=structuredClone(s),r=rotateOutline(state(s),angle,[7,6]);assert.ok('shape'in r);assert.deepEqual(r.shape.points,expected);assert.deepEqual(r.shape.hv,Math.abs(angle)===180?s.hv:{h:s.hv!.v,v:s.hv!.h});assert.equal(r.shape.lengths,s.lengths);assert.equal(r.shape.ids,s.ids);assert.deepEqual(s,before);const settled=settleShape(r.shape,s);assert.equal(settled.error,null);assert.deepEqual((settled.shape as Polygon).points,expected);const back=rotateOutline(state(r.shape),-angle,[7,6]);assert.ok('shape'in back);assert.deepEqual(back.shape,s);}
});
test('whole turns preserve identity; constrained non-quarter angles refuse',()=>{
 const s=shape();for(const angle of [0,360,-720]){const r=rotateOutline(state(s),angle,[7,6]);assert.ok('shape'in r);assert.equal(r.shape,s);}
 for(const angle of [45,89.999999,90.000001,-90.00000000000001,-1e-14])assert.ok('error'in rotateOutline(state(s),angle,[7,6]));
 const free={...s,hv:{h:[],v:[]},lengths:undefined};assert.ok('shape'in rotateOutline(state(free),45,[7,6]));
});
test('length-only oblique triangle supports quarter turns but not arbitrary angles',()=>{
 const s:Polygon={kind:'polygon',closed:true,points:[[0,0],[3,4],[6,0]],hv:{h:[],v:[]},lengths:{0:5}};
 const r=rotateOutline(state(s),90,[0,0]);assert.ok('shape'in r);assert.deepEqual(r.shape.points,[[0,0],[-4,3],[0,6]]);assert.equal(r.shape.lengths,s.lengths);assert.ok('error'in rotateOutline(state(s),45,[0,0]));
});
test('malformed/stale metadata, other rules and solver-rounded snapshots refuse',()=>{
 const patches:Partial<Polygon>[]=[{hv:{h:[0,0],v:[]}},{hv:{h:[0],v:[0]}},{hv:{h:[4],v:[]}},{hv:{h:[1],v:[]}},{lengths:{'00':6} as Record<string,number>},{lengths:{0:NaN}},{lengths:{0:5}},{rules:[{kind:'fix',point:1,at:[8,3]}]}];
 for(const patch of patches){const s={...shape(),...patch},before=structuredClone(s);assert.ok('error'in rotateOutline(state(s),90,[7,6]));assert.deepEqual(s,before);}
 const s=shape();s.points=s.points.map(([x,y])=>[x+1e-8,y]);assert.ok('error'in rotateOutline(state(s),90,[0,0]));
});
