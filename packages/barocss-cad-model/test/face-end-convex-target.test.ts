import test from 'node:test';
import assert from 'node:assert/strict';
import {checkOutput,evaluateCadPart,faceGeometry,massPropertiesOf} from '@barocss/cad';
import type {DocPlane,StudioDoc} from '../src/engine/doc';
import {currentFaceEndDistance,toPartDocument} from '../src/engine/part';
import {readStudioDoc} from '../src/engine/migrate';
type P=[number,number];
const points:P[]=[[-5,-3],[15,-3],[15,9],[-5,7]];
const frames:DocPlane[]=[{origin:[12,100,-7],normal:[0,0,1],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[0,-1,0],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[1,0,0],xAxis:[0,1,0]}];
const world=(f:number,u:number,v:number,t:number)=>f===0?[12+u,100+v,-7+t]:f===1?[12+u,100-t,-7+v]:[12+t,100+u,-7+v];
function fixture(target:P[]=points,frame=0,height=20,triangle=false):StudioDoc{return {format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
{id:'n0',kind:'sketch',profile:'polygon',points:target,plane:frames[frame]},
{id:'n1',kind:'extrude',sketch:0,from:height,height:5},
triangle?{id:'n2',kind:'sketch',profile:'polygon',points:[[0,0],[10,0],[0,6]],plane:frames[frame]}:{id:'n2',kind:'sketch',profile:'rectangle',min:[0,0],max:[10,6],plane:frames[frame]},
{id:'n3',kind:'face-end-extrude',sketch:2,target:{body:{node:1,side:'solid'},feature:'n1',face:'n1.bottom'}}],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}},nextId:4};}
test('convex target supports both winding orders, three frames and upstream motion with exact source identity',()=>{
 for(let f=0;f<3;f++)for(const h of [20,30])for(const triangle of [false,true])for(const reverse of [false,true]){
 const doc=fixture(reverse?[...points].reverse():points,f,h,triangle),before=structuredClone(doc);
 assert.deepEqual(readStudioDoc(JSON.stringify(doc)),{doc,notes:[]});const part=toPartDocument(doc);assert.equal(currentFaceEndDistance(doc,3),h);
 const outputs=evaluateCadPart(part).outputs;assert.ok(outputs.every(o=>checkOutput(o).valid));
 const mass=massPropertiesOf(outputs[1]);assert.ok(Math.abs(mass.volume-(triangle?30:60)*h)<1e-7);mass.centroid.forEach((v,i)=>assert.ok(Math.abs(v-world(f,triangle?10/3:5,triangle?2:3,h/2)[i])<1e-7));
 assert.ok(Math.abs(massPropertiesOf(outputs[0]).volume-1100)<1e-7);
 for(const p of points)for(const t of [h,h+5])assert.ok(outputs[0].brep.vertices.some(v=>v.point.every((x,i)=>x===world(f,...p,t)[i])));
 const cap=outputs[1].brep.faces.find(f=>f.name==='n3.top');assert.ok(cap);const plane=faceGeometry(cap);assert.ok(plane.kind==='plane');plane.n.forEach((v,i)=>assert.ok(Math.abs(v-frames[f].normal[i])<1e-7));assert.deepEqual(doc,before);
 }
});
test('sloping half planes reject a source inside the target bbox but beyond its actual face',()=>{
 assert.throws(()=>toPartDocument(fixture([[-5,-3],[15,-3],[-5,9]])),/entire projected profile/);
 const fits=fixture([[-5,-3],[25,-3],[-5,15]],0,20,true);assert.equal(currentFaceEndDistance(fits,3),20);
});
test('tangent source boundary is accepted, one representable coordinate outside is rejected',()=>{
 const d=fixture([[0,0],[10,0],[10,6],[-2,6]]); d.nodes=d.nodes.map(n=>n.kind==='sketch'?{...n,plane:{origin:[0,0,0],normal:[0,0,1],xAxis:[1,0,0]}}:n);assert.equal(currentFaceEndDistance(d,3),20);
 const source=d.nodes[2];assert.ok(source.kind==='sketch'&&source.profile==='rectangle');d.nodes[2]={...source,max:[10+Number.EPSILON*8,6]};assert.throws(()=>toPartDocument(d),/entire projected profile/);
});
test('nonconvex, collinear and over-budget target profiles fail closed',()=>{
 const bad:P[][]=[[[0,0],[20,0],[10,3],[20,12],[0,12]],[[-5,-3],[5,-3],[15,-3],[15,9],[-5,9]],Array.from({length:17},(_,i)=>[5+20*Math.cos(i*2*Math.PI/17),3+20*Math.sin(i*2*Math.PI/17)] as P)];
 for(const p of bad)assert.throws(()=>toPartDocument(fixture(p)));
});
test('circles retain axis-aligned rectangle targets but refuse newly generalized convex targets',()=>{
 const d=fixture();d.nodes[2]={id:'n2',kind:'sketch',profile:'circle',center:[5,3],radius:2,plane:frames[0]};assert.throws(()=>toPartDocument(d),/circle.*axis-aligned rectangle/i);
 d.nodes[0]={id:'n0',kind:'sketch',profile:'rectangle',min:[-5,-3],max:[15,9],plane:frames[0]};assert.equal(currentFaceEndDistance(d,3),20);
});
test('curved or perforated target faces remain unsupported',()=>{
 const d=fixture();const variants:StudioDoc['nodes']=[{id:'n0',kind:'sketch',profile:'circle',center:[5,3],radius:20,plane:frames[0]}, {id:'n0',kind:'sketch',profile:'rectangle',min:[-5,-3],max:[15,9],plane:frames[0],holes:[[{kind:'arc',start:[13,6],center:[12,6],direction:'ccw'}]]}];
 for(const target of variants)assert.throws(()=>toPartDocument({...d,nodes:[target,...d.nodes.slice(1)]}));
});

test('sixteen-edge budget is admitted and native self-crossing rings are refused',()=>{
 for(const count of [6,16]){const target=Array.from({length:count},(_,i)=>[5+20*Math.cos(i*2*Math.PI/count),3+20*Math.sin(i*2*Math.PI/count)] as P);assert.equal(currentFaceEndDistance(fixture(target),3),20);}
 assert.throws(()=>toPartDocument(fixture([[-5,-3],[15,9],[15,-3],[-5,9]])));
});
test('one ULP across a sloping edge is rejected even when rounded sum and bbox would accept',()=>{
 const d=fixture([[0,0],[16,0],[0,16]],0,20,true);
 d.nodes=d.nodes.map(n=>n.kind==='sketch'?{...n,plane:{origin:[0,0,0],normal:[0,0,1],xAxis:[1,0,0]}}:n);
 const source=d.nodes[2];assert.ok(source.kind==='sketch'&&source.profile==='polygon');d.nodes[2]={...source,points:[[0,0],[8,8],[0,8]]};assert.equal(currentFaceEndDistance(d,3),20);
 const outside=8+Number.EPSILON*8;assert.equal(outside+8,16);d.nodes[2]={...source,points:[[0,0],[outside,8],[0,8]]};assert.throws(()=>toPartDocument(d),/entire projected profile/);
});
