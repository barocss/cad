import test from 'node:test';
import assert from 'node:assert/strict';
import { mirrorOutline } from '../src/sketch/mirrorOutline';
import { settleShape } from '@barocss/cad-model/sketch/settle';
import { profileOf } from '@barocss/cad-model/sketch/loops';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const polygon=():Polygon=>({kind:'polygon',closed:true,points:[[2,3],[8,3],[8,7],[2,7]],hv:{h:[0,2],v:[1,3]},ids:['e0','e1','e2','e3']});
const state=(shape:Polygon):SketchState=>({shape,tool:'select',plane:xyPlane(),done:[]});
test('H/V rectangle and driven length reflect without repairing geometry or metadata',()=>{
 for(const lengths of [undefined,{0:6}])for(const axis of ['x','y'] as const){
  const source={...polygon(),lengths},before=structuredClone(source),r=mirrorOutline(state(source),axis,10);
  assert.ok('shape'in r);const expected=axis==='x'?[[18,3],[12,3],[12,7],[18,7]]:[[2,17],[8,17],[8,13],[2,13]];
  assert.deepEqual(r.shape.points,expected);assert.equal(r.shape.hv,source.hv);assert.equal(r.shape.lengths,source.lengths);assert.equal(r.shape.ids,source.ids);
  const settled=settleShape(r.shape,source);assert.equal(settled.error,null);assert.deepEqual((settled.shape as Polygon).points,expected);assert.deepEqual(profileOf([r.shape]),profileOf([settled.shape!]));
  const twice=mirrorOutline(state(r.shape),axis,10);assert.ok('shape'in twice);assert.deepEqual(twice.shape,source);assert.deepEqual(source,before);
 }
});
test('invalid, duplicate, overlapping or stale H/V is refused',()=>{
 for(const hv of [undefined,{h:[-1],v:[]},{h:[4],v:[]},{h:[.5],v:[]},{h:[NaN],v:[]},{h:[0,0],v:[]},{h:[0],v:[0]},{h:[1],v:[]}]){const s=state({...polygon(),hv}),before=structuredClone(s);assert.ok('error'in mirrorOutline(s,'x',10));assert.deepEqual(s,before);}
});
test('lengths require canonical valid indices, positive finite values and source agreement',()=>{
 for(const lengths of [{'00':6},{'-1':6},{'4':6},{'0.5':6},{'NaN':6},{0:0},{0:-6},{0:Infinity},{0:NaN},{0:5}] as Record<string,number>[]){const s=state({...polygon(),lengths}),before=structuredClone(s);assert.ok('error'in mirrorOutline(s,'y',10));assert.deepEqual(s,before);}
});
test('fixed and angle rules remain refused with invariant constraints',()=>{
 for(const rules of [[{kind:'fix' as const,point:1,at:[8,3] as [number,number]}],[{kind:'angle' as const,a:0,b:1,value:90}]])assert.ok('error'in mirrorOutline(state({...polygon(),lengths:{0:6},rules}),'x',10));
});
test('constrained off-grid reflection that settle rounds is refused, free path stays exact',()=>{
 const source=polygon();source.points=source.points.map(([x,y])=>[x+1e-8,y]);const candidate={...source,points:source.points.map(([x,y])=>[20-x,y] as [number,number])};
 const settled=settleShape(candidate,source);assert.equal(settled.error,null);assert.notDeepEqual((settled.shape as Polygon).points,candidate.points);assert.ok('error'in mirrorOutline(state(source),'x',10));
 const r=mirrorOutline(state({...source,hv:{h:[],v:[]}}),'x',10);assert.ok('shape'in r);assert.deepEqual(r.shape.points,candidate.points);
});
test('oblique length-only triangle retains its driving length under either reflection',()=>{
 for(const axis of ['x','y'] as const){
  const source:Polygon={kind:'polygon',closed:true,points:[[0,0],[3,4],[6,0]],hv:{h:[],v:[]},lengths:{0:5},ids:['a','b','c']},before=structuredClone(source);
  const r=mirrorOutline(state(source),axis,10);assert.ok('shape'in r);
  const expected=axis==='x'?[[20,0],[17,4],[14,0]]:[[0,20],[3,16],[6,20]];
  assert.deepEqual(r.shape.points,expected);assert.equal(r.shape.lengths,source.lengths);assert.equal(r.shape.hv,source.hv);assert.equal(r.shape.ids,source.ids);
  const settled=settleShape(r.shape,source);assert.equal(settled.error,null);assert.deepEqual((settled.shape as Polygon).points,expected);assert.deepEqual(source,before);
 }
});
