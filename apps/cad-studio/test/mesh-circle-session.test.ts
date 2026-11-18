import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import type { DisplayMesh } from '@barocss/cad-model/engine/mesh';
import type { MeshVertexTarget } from '../src/viewport/vertexPick';
import { appendMeshCircle, emptyMeshCircle } from '../src/app/useMeshCircleMeasurement';
const doc=emptyDoc(),mesh={} as DisplayMesh;
const point=(id:string,at:[number,number,number]):MeshVertexTarget=>({doc,body:'b1',mesh,id,at});
test('explicit three-point sequence produces only a transient reference result',()=>{
 const a=point('a',[5,0,0]),b=point('b',[0,5,0]),c=point('c',[-5,0,0]);
 const before=JSON.stringify(doc);let state=appendMeshCircle(emptyMeshCircle(),a);assert.equal(state.result,null);
 state=appendMeshCircle(state,b);assert.equal(state.result,null);state=appendMeshCircle(state,c);
 assert.ok(state.result?.ok);assert.ok(Math.abs(state.result.radius-5)<1e-9);assert.equal(state.points.length,3);
 const full=state;state=appendMeshCircle(state,point('d',[0,-5,0]));assert.equal(state.points,full.points);assert.equal(state.result,full.result);assert.match(state.reason!,/Reset/);
 assert.equal(JSON.stringify(doc),before);
});
test('duplicate welded identity or coincident coordinates do not advance capture',()=>{
 const state=appendMeshCircle(emptyMeshCircle(),point('a',[5,0,0]));
 for(const p of [point('a',[0,5,0]),point('other',[5,0,0])]){
 const refused=appendMeshCircle(state,p);assert.equal(refused.points,state.points);assert.equal(refused.result,null);assert.match(refused.reason!,/different welded/);}
});
test('different body, document or evaluated mesh cannot be combined',()=>{
 const state=appendMeshCircle(emptyMeshCircle(),point('a',[5,0,0])),b=point('b',[0,5,0]);
 for(const p of [{...b,body:'b2'},{...b,doc:emptyDoc()},{...b,mesh:{} as DisplayMesh}]){
 const refused=appendMeshCircle(state,p);assert.equal(refused.points,state.points);assert.match(refused.reason!,/same current base body/);}
});
test('invalid third point retains A/B and permits a valid retry',()=>{
 let state=appendMeshCircle(emptyMeshCircle(),point('a',[5,0,0]));state=appendMeshCircle(state,point('b',[-5,0,0]));
 const before=state;state=appendMeshCircle(state,point('bad',[0,0,0]));assert.equal(state.points,before.points);assert.equal(state.result,null);assert.ok(state.reason);
 state=appendMeshCircle(state,point('c',[0,5,0]));assert.ok(state.result?.ok);assert.equal(state.points.length,3);
 assert.deepEqual(emptyMeshCircle(),{points:[],result:null,reason:null});
});
