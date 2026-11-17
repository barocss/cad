import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
import type { DocPlane, StudioDoc } from '../src/engine/doc';
import { readStudioDoc } from '../src/engine/migrate';
import { currentFaceEndDistance, toPartDocument } from '../src/engine/part';
const fixture=(travel:number):StudioDoc=>{
 const plane:DocPlane={origin:[12,100,-7],normal:[0,-1,0],xAxis:[1,0,0]};
 return {format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[-1,-2],max:[11,8],plane},
  {id:'n1',kind:'extrude',sketch:0,from:travel,height:5},
  {id:'n2',kind:'sketch',profile:'rectangle',min:[0,0],max:[10,6],plane},
  {id:'n3',kind:'face-end-extrude',sketch:2,target:{body:{node:1,side:'solid'},feature:'n1',face:'n1.bottom'}},
 ],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}},nextId:4};
};
test('Front XZ positive local travel reaches the -Y target with exact translated asymmetric native oracles',()=>{
 for(const travel of [20,30]){
  const doc=fixture(travel),before=structuredClone(doc);assert.deepEqual(readStudioDoc(JSON.stringify(doc)),{doc,notes:[]});
  const part=toPartDocument(doc);assert.deepEqual(part.features[3],{id:'n3',kind:'extrude',sketch:'n2',height:travel});assert.equal(currentFaceEndDistance(doc,3),travel);
  const outputs=evaluateCadPart(part).outputs;assert.deepEqual(outputs.map(o=>o.id),['n1','n3']);
  for(const [i,xs,zs,ts,volume,center,cap,sense] of [
   [0,[-1,11],[-2,8],[travel,travel+5],600,[17,100-travel-2.5,-4],'n1.bottom',1],
   [1,[0,10],[0,6],[0,travel],60*travel,[17,100-travel/2,-4],'n3.top',-1],
  ] as const){const output=outputs[i];assert.ok(checkOutput(output).valid);assert.equal(output.brep.vertices.length,8);assert.equal(output.brep.faces.length,6);
   for(const x of xs)for(const z of zs)for(const t of ts)assert.ok(output.brep.vertices.some(v=>v.point.every((n,j)=>n===[12+x,100-t,-7+z][j])));
   const mass=massPropertiesOf(output);assert.ok(Math.abs(mass.volume-volume)<1e-7);mass.centroid.forEach((n,j)=>assert.ok(Math.abs(n-center[j])<1e-7));
   const faces=output.brep.faces.filter(f=>f.name===cap);assert.equal(faces.length,1);const face=faceGeometry(faces[0]);assert.ok(face.kind==='plane');assert.ok(Math.abs(face.o[1]-(100-travel))<1e-7);face.n.forEach((n,j)=>assert.ok(Math.abs(n-(j===1?sense:0))<1e-7));
  }
  assert.deepEqual(doc,before);
 }
});
test('Front frame refuses tilted, reversed, scaled axes and nonpositive local travel',()=>{
 for(const plane of [
  {origin:[12,100,-7],normal:[0,1,0],xAxis:[1,0,0]},
  {origin:[12,100,-7],normal:[0,-2,0],xAxis:[1,0,0]},
  {origin:[12,100,-7],normal:[0,-1,1e-13],xAxis:[1,0,0]},
  {origin:[12,100,-7],normal:[0,-1,0],xAxis:[2,0,0]},
  {origin:[12,100,-7],normal:[0,-1,0],xAxis:[-1,0,0]},
 ] as DocPlane[]){const doc=fixture(20),source=doc.nodes[2];assert.ok(source.kind==='sketch');doc.nodes[2]={...source,plane};assert.throws(()=>toPartDocument(doc));}
 for(const travel of [0,-10,1e-8])assert.throws(()=>toPartDocument(fixture(travel)),/positive extrusion direction/);
});
test('Front end requires contained asymmetric trim and opposing cap, refusing range overflow',()=>{
 const doc=fixture(20),target=doc.nodes[0],end=doc.nodes[3],source=doc.nodes[2];assert.ok(target.kind==='sketch'&&target.profile==='rectangle'&&end.kind==='face-end-extrude'&&source.kind==='sketch');
 assert.throws(()=>toPartDocument({...doc,nodes:doc.nodes.map((n,i)=>i===0?{...target,max:[11,5]}:n)}),/entire projected profile/);
 assert.throws(()=>toPartDocument({...doc,nodes:doc.nodes.map((n,i)=>i===3?{...end,target:{...end.target,face:'n1.top'}}:n)}),/normal must oppose/);
 assert.throws(()=>toPartDocument({...doc,nodes:doc.nodes.map((n,i)=>i===2?{...source,plane:{origin:[9995,100,-7],normal:[0,-1,0],xAxis:[1,0,0]}}:n)}),/coordinate range/);
});
