import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,rectanglePart,type StudioDoc} from '@barocss/cad-model/engine/doc';
import {placementOf,rotationMatrix,matMul,type Mat3} from '@barocss/cad-model/engine/placement';
import {rotateSelection} from '../src/assembly/rotateSelection';
const fixture=():StudioDoc=>({...emptyDoc(),instances:['a','b','c'].map((id,k)=>({id,name:id,doc:rectanglePart(10,20,30),position:[10+60*k,10,3],rotation:k===1?[20,30,40]:[0,0,0]}))});
const near=(a:readonly number[],b:readonly number[])=>a.forEach((v,k)=>assert.ok(Math.abs(v-b[k])<1e-8,`${v} != ${b[k]}`));
test('common world Z pivot rotates positions and composes existing orientation atomically',()=>{
 const d=fixture(),before=structuredClone(d),r=rotateSelection(d,['a','b'],{axis:'Z',angle:90,pivot:[50,20,0]});assert.ok(r.instances);
 near(r.instances[0].position,[60,-20,3]);near(r.instances[1].position,[60,40,3]);
 near(placementOf(r.instances[1]).m,matMul(rotationMatrix([0,0,90]),placementOf(d.instances![1]).m as Mat3));
 assert.equal(r.instances[0].doc,d.instances![0].doc);assert.equal(r.instances[2],d.instances![2]);assert.deepEqual(d,before);
});
test('each world axis, oblique poses and inverse rotations preserve rigid geometry',()=>{
 for(const axis of ['X','Y','Z'] as const){const d=fixture(),value={axis,angle:37.25,pivot:[7,-8,9]},r=rotateSelection(d,['a','b'],value);assert.ok(r.instances);const back=rotateSelection({...d,instances:r.instances},['a','b'],{...value,angle:-37.25});assert.ok(back.instances);for(let j=0;j<2;j++){near(back.instances[j].position,d.instances![j].position);near(placementOf(back.instances[j]).m,placementOf(d.instances![j]).m);}}
});
test('whole turns are no-ops and invalid input cannot change any part',()=>{
 const d=fixture(),before=structuredClone(d);for(const angle of [0,360,-720]){const r=rotateSelection(d,['a','b'],{axis:'X',angle,pivot:[0,0,0]});assert.equal(r.instances,d.instances);}
 for(const value of [{axis:'Q',angle:90,pivot:[0,0,0]},{axis:'Z',angle:Infinity,pivot:[0,0,0]},{axis:'Z',angle:90,pivot:[NaN,0,0]},{axis:'Z',angle:90,pivot:[0,0]}])assert.ok(rotateSelection(d,['a','b'],value as never).error);assert.deepEqual(d,before);
});
test('all existing group restrictions refuse the entire operation',()=>{
 for(const patch of [{grounded:true},{hidden:true},{savedPlacement:{position:[0,0,0],rotation:[0,0,0]}},{pattern:{id:'pat',k:1}},{joints:{'a~b':1}},{doc:{...emptyDoc(),instances:fixture().instances}}]){
 const d=fixture();d.instances![1]={...d.instances![1],...patch} as NonNullable<typeof d.instances>[number];const before=structuredClone(d);assert.ok(rotateSelection(d,['a','b'],{axis:'Z',angle:90,pivot:[0,0,0]}).error);assert.deepEqual(d,before);
 }
 const d=fixture();assert.ok(rotateSelection(d,['a','missing'],{axis:'Z',angle:90,pivot:[0,0,0]}).error);
});
test('overflow and pivot precision collapse fail without partial results',()=>{
 const d=fixture(),before=structuredClone(d);for(const pivot of [[Number.MAX_VALUE,Number.MAX_VALUE,0],[1e20,1e20,0]]){const r=rotateSelection(d,['a','b'],{axis:'Z',angle:45,pivot});assert.ok(r.error);assert.equal(r.instances,undefined);}assert.deepEqual(d,before);
});

test('sparse pivot and small angle lost by existing Euler snapping are explicitly refused',()=>{
 const d=fixture();assert.ok(rotateSelection(d,['a','b'],{axis:'Z',angle:90,pivot:Array(3)}).error);
 assert.ok(rotateSelection(d,['a','b'],{axis:'Z',angle:0.0000005,pivot:[0,0,0]}).error);
});
