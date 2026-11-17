import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import { commitOutlineRotation } from '../src/sketch/outlineRotationCommit';
const shape: SketchShape={kind:'polygon',closed:true,points:[[0,0],[10,0],[0,10]],hv:{h:[],v:[]}};
const owner: SketchState={tool:'select',shape,plane:xyPlane()};
const doc=emptyDoc(), candidate={...shape,points:[[0,0],[0,10],[-10,0]]} as SketchShape;
const current=()=>({doc,rendered:owner,liveShape:shape,generation:7,renderedGeneration:7});
test('current action commits once, whole turn identity does not dispatch',()=>{
 const calls:SketchShape[]=[];assert.equal(commitOutlineRotation(owner,doc,candidate,current(),s=>calls.push(s)),true);assert.deepEqual(calls,[candidate]);
 assert.equal(commitOutlineRotation(owner,doc,shape,current(),s=>calls.push(s)),true);assert.deepEqual(calls,[candidate]);
});
test('held render callback cannot cross doc, live shape or generation changes before rerender',()=>{
 for(const patch of [{doc:emptyDoc()},{rendered:{...owner}},{rendered:null},{liveShape:{...shape}},{liveShape:null},{generation:8},{renderedGeneration:6}]){
  let calls=0;assert.equal(commitOutlineRotation(owner,doc,candidate,{...current(),...patch},()=>calls++),false);assert.equal(calls,0);
 }
});
