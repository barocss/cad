import { isFaceEndExtrudeSketch } from '../src/engine/faceEndExtrude';
import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput,evaluateCadPart,faceGeometry,massPropertiesOf } from '@barocss/cad';
import type { DocPlane,SketchNode,StudioDoc } from '../src/engine/doc';
import { currentFaceEndDistance,toPartDocument } from '../src/engine/part';
import { readStudioDoc } from '../src/engine/migrate';
type Triangle=Extract<SketchNode,{profile:'polygon'}>;
const points: [number,number][]=[[0,0],[10,0],[0,6]];
const frames:DocPlane[]=[{origin:[12,100,-7],normal:[0,0,1],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[0,-1,0],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[1,0,0],xAxis:[0,1,0]}];
const world=(frame:number,u:number,v:number,t:number)=>frame===0?[12+u,100+v,-7+t]:frame===1?[12+u,100-t,-7+v]:[12+t,100+u,-7+v];
function fixture(travel=20,frame=0):StudioDoc{return {format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
 {id:'n0',kind:'sketch',profile:'rectangle',min:[-1,-2],max:[11,8],plane:frames[frame]},
 {id:'n1',kind:'extrude',sketch:0,from:travel,height:5},
 {id:'n2',kind:'sketch',profile:'polygon',points:structuredClone(points),plane:frames[frame],sideTags:{outer:['base','slope','upright']},outline:{points:structuredClone(points),hv:{h:[0],v:[2]}}},
 {id:'n3',kind:'face-end-extrude',sketch:2,target:{body:{node:1,side:'solid'},feature:'n1',face:'n1.bottom'}},
 ],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}},nextId:4};}
test('literal triangle reaches named face in XY, Front and YZ with independent native oracles',()=>{
 for(let frame=0;frame<3;frame++)for(const height of [20,30]){
  const doc=fixture(height,frame),before=structuredClone(doc);assert.deepEqual(readStudioDoc(JSON.stringify(doc)),{doc,notes:[]});
  const part=toPartDocument(doc);assert.deepEqual(part.features[3],{id:'n3',kind:'extrude',sketch:'n2',height});assert.equal(currentFaceEndDistance(doc,3),height);
  const outputs=evaluateCadPart(part).outputs;assert.deepEqual(outputs.map(o=>o.id),['n1','n3']);const body=outputs[1];assert.ok(checkOutput(body).valid);assert.equal(body.brep.vertices.length,6);assert.equal(body.brep.faces.length,5);
  for(const [u,v]of points)for(const t of [0,height])assert.ok(body.brep.vertices.some(p=>p.point.every((n,j)=>n===world(frame,u,v,t)[j])));
  const mass=massPropertiesOf(body);assert.ok(Math.abs(mass.volume-30*height)<1e-7);mass.centroid.forEach((n,j)=>assert.ok(Math.abs(n-world(frame,10/3,2,height/2)[j])<1e-7));
  for(const tag of ['base','slope','upright'])assert.equal(body.brep.faces.filter(f=>f.name===`n3.side[${tag}]`).length,1);
  for(const [output,name,sign]of [[outputs[0],'n1.bottom',-1],[body,'n3.top',1]] as const){const face=output.brep.faces.find(f=>f.name===name);assert.ok(face);const plane=faceGeometry(face);assert.ok(plane.kind==='plane');plane.n.forEach((n,j)=>assert.ok(Math.abs(n-sign*frames[frame].normal[j])<1e-7));const w=frame===0?2:frame===1?1:0;assert.ok(Math.abs(plane.o[w]-world(frame,0,0,height)[w])<1e-7);}
  assert.deepEqual(doc,before);
 }
});
test('triangle containment uses literal points and rejects a narrow target',()=>{
 const doc=fixture(),target=doc.nodes[0];assert.ok(target.kind==='sketch'&&target.profile==='rectangle');
 assert.throws(()=>toPartDocument({...doc,nodes:doc.nodes.map((n,i)=>i===0?{...target,max:[11,5]}:n)}),/entire projected profile/);
});
test('nonliteral, nontriangle and degenerate source points are refused',()=>{
 const variants:Triangle['points'][]=[[[0,0],[10,0],[5,0]],[[0,0],[0,0],[0,6]],[[0,0],[NaN,0],[0,6]],[[0,0],[10001,0],[0,6]],[[0,0],[10,0],[10,6],[0,6]],[[0,0],[{parameter:'width'},0],[0,6]]];
 for(const p of variants){const doc=fixture(),source=doc.nodes[2] as Triangle;doc.parameters={width:10};doc.nodes[2]={...source,points:p,outline:undefined};assert.throws(()=>toPartDocument(doc));}
});
test('stale or curved outline metadata cannot override the actual triangle profile',()=>{
 const outlines:NonNullable<Triangle['outline']>[]=[{points:[[0,0],[9,0],[0,6]]},{points,bulges:[.2,0,0]},{points,spline:{fit:points,closed:true}},{points,ellipse:{center:[0,0],rx:5,ry:3,angle:0}},{points,circles:[{c:[2,2],r:1}]}];
 for(const outline of outlines){const doc=fixture(),source=doc.nodes[2] as Triangle;doc.nodes[2]={...source,outline};assert.throws(()=>toPartDocument(doc));}
});
test('CW triangle keeps authored side IDs on their physical walls',()=>{
 for(const reverse of [false,true]){
  const doc=fixture(),source=doc.nodes[2] as Triangle;
  const p=reverse?[points[0],points[2],points[1]]:points;doc.nodes[2]={...source,points:p,outline:{points:p}};
  const body=evaluateCadPart(toPartDocument(doc)).outputs[1];assert.ok(checkOutput(body).valid);
  for(const [i,tag]of ['base','slope','upright'].entries()){
   const face=body.brep.faces.find(f=>f.name===`n3.side[${tag}]`);assert.ok(face);
   const loops=body.brep.loops.filter(l=>face.loops.includes(l.id));const uses=body.brep.coedges.filter(c=>loops.some(l=>l.coedges.includes(c.id)));const edges=body.brep.edges.filter(e=>uses.some(c=>c.edge===e.id));const vertices=body.brep.vertices.filter(v=>edges.some(e=>e.vertices.includes(v.id)));
   assert.equal(vertices.length,4);
   for(const [u,v]of [p[i],p[(i+1)%3]])for(const t of [0,20])assert.ok(vertices.some(vertex=>vertex.point.every((n,j)=>n===world(0,u,v,t)[j])));
  }
 }
});
test('triangle admission rejects short edges and near-collinear altitude',()=>{
 for(const p of [[[0,0],[1e-8,0],[0,6]],[[0,0],[10,0],[5,1e-8]]] as [number,number][][]){const doc=fixture(),source=doc.nodes[2] as Triangle;doc.nodes[2]={...source,points:p,outline:undefined};assert.throws(()=>toPartDocument(doc));}
});

test('malformed outline metadata is a safe false capability result, never a TypeError',()=>{
 const source=fixture().nodes[2] as Triangle;
 const malformed:unknown[]=[null,[], 'outline', {points,bulges:{}},{points,bulges:'bad'},{points,bulges:[0]},{points,bulges:[0,NaN,0]},
  ...['circles','tangents','equalRadii','concentric'].flatMap(key=>[{points,[key]:{}},{points,[key]:'bad'},{points,[key]:null},{points,[key]:[0]}]),
  {points,radii:[]},{points,radii:null},{points,radii:{0:2}},{points,spline:null},{points,ellipse:false}];
 for(const outline of malformed){const candidate={...source,outline} as Triangle;assert.doesNotThrow(()=>isFaceEndExtrudeSketch(candidate));assert.equal(isFaceEndExtrudeSketch(candidate),false);}
 for(const bulges of [[],[0,0,0]])assert.equal(isFaceEndExtrudeSketch({...source,outline:{points,bulges}}),true);
});
