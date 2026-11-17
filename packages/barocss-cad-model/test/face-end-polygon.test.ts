import test from 'node:test';
import assert from 'node:assert/strict';
import {checkOutput,evaluateCadPart,faceGeometry,massPropertiesOf} from '@barocss/cad';
import type {DocPlane,StudioDoc} from '../src/engine/doc';
import {isFaceEndExtrudeSketch} from '../src/engine/faceEndExtrude';
import {toPartDocument} from '../src/engine/part';
import {readStudioDoc} from '../src/engine/migrate';
type P=[number,number];
const hex:P[]=[[0,3],[2,0],[8,0],[10,3],[8,6],[2,6]];
const frames:DocPlane[]=[{origin:[12,100,-7],normal:[0,0,1],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[0,-1,0],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[1,0,0],xAxis:[0,1,0]}];
const world=(f:number,u:number,v:number,t:number)=>f===0?[12+u,100+v,-7+t]:f===1?[12+u,100-t,-7+v]:[12+t,100+u,-7+v];
function fixture(points:P[]=hex,f=0,h=20):StudioDoc{return {format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nextId:4,nodes:[
{id:'n0',kind:'sketch',profile:'rectangle',min:[-5,-3],max:[15,9],plane:frames[f]},
{id:'n1',kind:'extrude',sketch:0,from:h,height:5},
{id:'n2',kind:'sketch',profile:'polygon',points,plane:frames[f],outline:{points,hv:{h:[],v:[]}},sideTags:{outer:points.map((_,i)=>'p'+i)}},
{id:'n3',kind:'face-end-extrude',sketch:2,target:{body:{node:1,side:'solid'},feature:'n1',face:'n1.bottom'}}],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}}};}
// Independent signed shoelace first moments, from authored input only.
function mass2(p:P[]){let a=0,x=0,y=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length],c=p[i][0]*q[1]-q[0]*p[i][1];a+=c;x+=(p[i][0]+q[0])*c;y+=(p[i][1]+q[1])*c;}return {area:Math.abs(a)/2,centroid:[x/(3*a),y/(3*a)]};}
test('literal convex4/6/8 sources retain native physical walls in three frames and both windings',()=>{
 const cases:P[][]=[[[0,3],[5,0],[10,3],[5,6]],hex,[[0,2],[2,0],[8,0],[10,2],[10,4],[8,6],[2,6],[0,4]]];
 for(const p0 of cases)for(const reverse of [false,true])for(let f=0;f<3;f++)for(const h of [20,30]){
  const p=reverse?[...p0].reverse():p0,doc=fixture(p,f,h),before=structuredClone(doc),expected=mass2(p);assert.ok(isFaceEndExtrudeSketch(doc.nodes[2]));assert.deepEqual(readStudioDoc(JSON.stringify(doc)),{doc,notes:[]});
  const body=evaluateCadPart(toPartDocument(doc)).outputs[1];assert.ok(checkOutput(body).valid);const mass=massPropertiesOf(body);assert.ok(Math.abs(mass.volume-expected.area*h)<1e-7);mass.centroid.forEach((v,i)=>assert.ok(Math.abs(v-world(f,...expected.centroid as P,h/2)[i])<1e-7));
  for(let i=0;i<p.length;i++){const face=body.brep.faces.find(face=>face.name===`n3.side[p${i}]`);assert.ok(face);const uses=body.brep.coedges.filter(c=>body.brep.loops.some(l=>face.loops.includes(l.id)&&l.coedges.includes(c.id)));const edges=body.brep.edges.filter(e=>uses.some(c=>c.edge===e.id));const vertices=body.brep.vertices.filter(v=>edges.some(e=>e.vertices.includes(v.id)));assert.equal(vertices.length,4);for(const q of [p[i],p[(i+1)%p.length]])for(const t of [0,h])assert.ok(vertices.some(v=>v.point.every((n,j)=>n===world(f,...q,t)[j])));}
  const cap=body.brep.faces.find(face=>face.name==='n3.top');assert.ok(cap);const plane=faceGeometry(cap);assert.ok(plane.kind==='plane');assert.deepEqual(plane.n,frames[f].normal);assert.deepEqual(doc,before);
 }
});
test('source change preserves recipe and changes independent volume and centroid',()=>{
 const p:P[]=[[-1,3],...hex.slice(1)],doc=fixture(p),mass=massPropertiesOf(evaluateCadPart(toPartDocument(doc)).outputs[1]);assert.ok(Math.abs(mass.volume-51*20)<1e-7);assert.ok(Math.abs(mass.centroid[0]-(12+241/51))<1e-7);
});
test('concave, repeated, collinear, star and nine-point sources refuse without widening native scope',()=>{
 const star=Array.from({length:5},(_,i)=>[5+5*Math.cos(i*4*Math.PI/5),3+3*Math.sin(i*4*Math.PI/5)] as P);
 for(const p of [[...hex,hex[0]],[[0,0],[10,0],[5,2],[10,6],[0,6]],[[0,0],[5,0],[10,0],[10,6],[0,6]],star,Array.from({length:9},(_,i)=>[5+5*Math.cos(i*2*Math.PI/9),3+3*Math.sin(i*2*Math.PI/9)] as P)] as P[][]){const doc=fixture(p);assert.equal(isFaceEndExtrudeSketch(doc.nodes[2]),false);assert.throws(()=>toPartDocument(doc));}
});
test('new polygon source refuses short edges, out-of-range points and alternate outline/dependencies',()=>{
 for(const p of [[[0,0],[1e-8,0],[10,6],[0,6]],[[0,0],[10001,0],[10,6],[0,6]]] as P[][])assert.equal(isFaceEndExtrudeSketch(fixture(p).nodes[2]),false);
 const source=fixture().nodes[2];assert.ok(source.kind==='sketch'&&source.profile==='polygon');
 for(const patch of [{holes:[]},{regions:[]},{holeOutlines:[]},{regionLengths:[]},{outline:{points:hex,bulges:[.1,0,0,0,0,0]}},{outline:{points:[[1,3] as P,...hex.slice(1)]}}])assert.equal(isFaceEndExtrudeSketch({...source,...patch}),false);
});
test('whole native polygon footprint must fit rectangular and sloping convex targets',()=>{
 const doc=fixture(),target=doc.nodes[0];assert.ok(target.kind==='sketch'&&target.profile==='rectangle');doc.nodes[0]={...target,max:[9,9]};assert.throws(()=>toPartDocument(doc),/entire projected profile/);
 doc.nodes[0]={id:'n0',kind:'sketch',profile:'polygon',points:[[-5,-3],[15,-3],[-5,9]],plane:frames[0]};assert.throws(()=>toPartDocument(doc),/entire projected profile/);
});
test('world rounding cannot admit a local polygon whose translated altitude crosses the native limit',()=>{
 const h=1.00000001e-7,p:P[]=[[0,0],[1,0],[1,h],[0,h]],doc=fixture(p),source=doc.nodes[2];assert.ok(source.kind==='sketch'&&source.profile==='polygon');
 assert.equal(isFaceEndExtrudeSketch({...source,plane:{origin:[0,0,0],normal:[0,0,1],xAxis:[1,0,0]}}),true);
 assert.ok(100+h-100<1e-7);assert.equal(isFaceEndExtrudeSketch({...source,plane:{origin:[0,100,0],normal:[0,0,1],xAxis:[1,0,0]}}),false);
 assert.equal(isFaceEndExtrudeSketch({...source,plane:{origin:[10000,0,0],normal:[0,0,1],xAxis:[1,0,0]}}),false);
});
