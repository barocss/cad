import test from 'node:test';
import assert from 'node:assert/strict';
import { translateOutline } from '../src/sketch/translateOutline';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState,SketchShape } from '@barocss/cad-model/sketch/types';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const polygon=():Polygon=>({kind:'polygon',closed:true,points:[[2,3],[8,3],[8,7],[2,7]],hv:{h:[0,2],v:[1,3]},lengths:{0:6},ids:['a','b','c','d']});
const state=(shape=polygon()):SketchState=>({shape,plane:xyPlane(),tool:'select',done:[{kind:'circle',c:[50,50],r:2,construction:true}]});
test('signed XY displacement preserves coordinates, invariant metadata, source and inverse',()=>{
 for(const [dx,dy] of [[10,-20],[-12,5],[0,4],[5,0]]){
  const s=state(),source=s.shape as Polygon,before=structuredClone(s),r=translateOutline(s,dx,dy);assert.ok('shape'in r);
  const expected=[[2+dx,3+dy],[8+dx,3+dy],[8+dx,7+dy],[2+dx,7+dy]];assert.deepEqual(r.shape.points,expected);assert.equal(r.shape.ids,source.ids);assert.equal(r.shape.hv,source.hv);assert.equal(r.shape.lengths,source.lengths);assert.deepEqual(s,before);
  const settled=settleShape(r.shape,source);assert.equal(settled.error,null);assert.deepEqual((settled.shape as Polygon).points,expected);assert.deepEqual(profileOf([r.shape]),profileOf([settled.shape!]));
  const inverse=translateOutline({...s,shape:r.shape},-dx,-dy);assert.ok('shape'in inverse);assert.deepEqual(inverse.shape,source);
 }
});
test('length-only oblique and unconstrained concave outlines retain their authored order',()=>{
 for(const source of [{kind:'polygon',closed:true,points:[[0,0],[3,4],[6,0]],hv:{h:[],v:[]},lengths:{0:5}},{kind:'polygon',closed:true,points:[[0,0],[6,0],[6,2],[2,2],[2,5],[0,5]],hv:{h:[],v:[]}}] as Polygon[]){const r=translateOutline(state(source),-5,7);assert.ok('shape'in r);assert.deepEqual(r.shape.points,source.points.map(([x,y])=>[x-5,y+7]));assert.equal(r.shape.lengths,source.lengths);}
});
test('zero identity follows admission and coordinate range applies to results, not displacement',()=>{
 const s=state(),r=translateOutline(s,0,-0);assert.ok('shape'in r);assert.equal(r.shape,s.shape);
 const source=polygon();source.points=source.points.map(([x,y])=>[x-10002,y]);const far=translateOutline(state(source),19994,0);assert.ok('shape'in far);assert.deepEqual(far.shape.points,[[9994,3],[10000,3],[10000,7],[9994,7]]);
 for(const [dx,dy] of [[NaN,0],[0,Infinity],[Number.MAX_VALUE,0],[9993,0],[0,-10004]])assert.ok('error'in translateOutline(s,dx,dy));
});
test('invalid metadata, unsupported constraints and linked or multiple material sources refuse atomically',()=>{
 const patches:Partial<Polygon>[]=[{hv:undefined},{hv:{h:[0,0],v:[]}},{hv:{h:[1],v:[]}},{hv:{h:[0],v:[0]}},{hv:{h:[4],v:[]}},{lengths:{'00':6} as Record<string,number>},{lengths:{0:NaN}},{lengths:{0:5}},{rules:[{kind:'fix',point:1,at:[8,3]}]},{rules:[{kind:'angle',a:0,b:1,value:90}]},{bulges:[.1]},{fromSpline:true},{fromEllipse:true},{radii:{0:2}},{pending:true},{construction:true}];
 for(const patch of patches){const s=state({...polygon(),...patch}),before=structuredClone(s);for(const d of [0,2])assert.ok('error'in translateOutline(s,d,d));assert.deepEqual(s,before);}
 for(const patch of [{association:{}},{band:{}},{bandPicks:['a']},{done:[{kind:'circle',c:[20,20],r:1}]}])assert.ok('error'in translateOutline({...state(),...patch} as SketchState,2,3));
});
test('solver rounding is refused for constrained snapshots; free coordinates remain exact',()=>{
 const s=state();assert.ok('error'in translateOutline(s,1e-8,0));const source={...polygon(),hv:{h:[],v:[]},lengths:undefined};const r=translateOutline(state(source),1e-8,0);assert.ok('shape'in r);assert.deepEqual(r.shape.points,source.points.map(([x,y])=>[x+1e-8,y]));
});
test('free outlines also reject out-of-range and overflowing translated coordinates',()=>{
 const source={...polygon(),hv:{h:[],v:[]},lengths:undefined},s=state(source),before=structuredClone(s);
 for(const [dx,dy] of [[9993,0],[0,-10004],[Number.MAX_VALUE,Number.MAX_VALUE]])assert.ok('error'in translateOutline(s,dx,dy));
 assert.deepEqual(s,before);
});
