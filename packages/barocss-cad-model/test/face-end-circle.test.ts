import assert from 'node:assert/strict';
import test from 'node:test';
import {checkOutput,evaluateCadPart,faceGeometry,massPropertiesOf} from '@barocss/cad';
import type {DocPlane,SketchNode,StudioDoc} from '../src/engine/doc';
import {currentFaceEndDistance,toPartDocument} from '../src/engine/part';
import {readStudioDoc} from '../src/engine/migrate';
import {isFaceEndExtrudeSketch} from '../src/engine/faceEndExtrude';
type Circle=Extract<SketchNode,{profile:'circle'}>;
const frames:DocPlane[]=[{origin:[12,100,-7],normal:[0,0,1],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[0,-1,0],xAxis:[1,0,0]},{origin:[12,100,-7],normal:[1,0,0],xAxis:[0,1,0]}];
const world=(f:number,u:number,v:number,t:number)=>f===0?[12+u,100+v,-7+t]:f===1?[12+u,100-t,-7+v]:[12+t,100+u,-7+v];
function fixture(radius=3,height=20,frame=0):StudioDoc{return {format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
{id:'n0',kind:'sketch',profile:'rectangle',min:[-1,-2],max:[11,8],plane:frames[frame]},
{id:'n1',kind:'extrude',sketch:0,from:height,height:5},
{id:'n2',kind:'sketch',profile:'circle',center:[5,3],radius,plane:frames[frame],sideTags:{outer:['rim']}},
{id:'n3',kind:'face-end-extrude',sketch:2,target:{body:{node:1,side:'solid'},feature:'n1',face:'n1.bottom'}}],outputs:{b1:{node:1,side:'solid'},b3:{node:3,side:'solid'}},nextId:4};}
test('literal circle To face preserves native radius, axis, caps, mass and source IDs in three frames',()=>{
 for(let f=0;f<3;f++)for(const r of [3,4])for(const h of [20,30]){
 const doc=fixture(r,h,f),before=structuredClone(doc);assert.deepEqual(readStudioDoc(JSON.stringify(doc)),{doc,notes:[]});const part=toPartDocument(doc);assert.equal(currentFaceEndDistance(doc,3),h);assert.deepEqual(part.features[3],{id:'n3',kind:'extrude',sketch:'n2',height:h});
 const outputs=evaluateCadPart(part).outputs,body=outputs[1];assert.ok(checkOutput(body).valid);const mass=massPropertiesOf(body);assert.ok(Math.abs(mass.volume-Math.PI*r*r*h)<1e-7);const center=world(f,5,3,h/2);mass.centroid.forEach((v,j)=>assert.ok(Math.abs(v-center[j])<1e-7));
 const axis=frames[f].normal,w=f===0?2:f===1?1:0;const sides=body.brep.faces.filter(face=>faceGeometry(face).kind==='cylinder');assert.ok(sides.length>0);
 for(const face of sides){assert.ok(face.name?.startsWith('n3.side[rim]'));const g=faceGeometry(face);assert.ok(g.kind==='cylinder');assert.equal(g.out,1);assert.ok(Math.abs(g.r-r)<1e-7);assert.ok(Math.abs(Math.abs(g.a.reduce((s,v,j)=>s+v*axis[j],0))-1)<1e-7);const o=world(f,5,3,0);for(let j=0;j<3;j++)if(j!==w)assert.ok(Math.abs(g.c[j]-o[j])<1e-7);}
 for(const vertex of body.brep.vertices){const p=vertex.point,o=world(f,5,3,0),t=(p[w]-o[w])*axis[w];assert.ok(Math.min(Math.abs(t),Math.abs(t-h))<1e-7);assert.ok(Math.abs(Math.hypot(...p.map((v,j)=>j===w?0:v-o[j]))-r)<1e-7);}
 for(const [name,sign,t]of [['n3.bottom',-1,0],['n3.top',1,h]] as const){const face=body.brep.faces.find(x=>x.name===name);assert.ok(face);const g=faceGeometry(face);assert.ok(g.kind==='plane');assert.ok(Math.abs(g.o[w]-world(f,5,3,t)[w])<1e-7);g.n.forEach((v,j)=>assert.ok(Math.abs(v-sign*axis[j])<1e-7));}
 assert.deepEqual(doc,before);
 }
});
test('circle containment needs the whole disk, not its center',()=>{const doc=fixture(),target=doc.nodes[0];assert.ok(target.kind==='sketch'&&target.profile==='rectangle');doc.nodes[0]={...target,max:[7,8]};assert.throws(()=>toPartDocument(doc),/entire projected profile/);});
test('literal circle admission safely refuses invalid parameters and alternate outline metadata',()=>{
 const source=fixture().nodes[2] as Circle;
 const patches:Partial<Circle>[]=[{radius:0},{radius:-1},{radius:NaN},{radius:Infinity},{radius:{parameter:'r'}},{center:[{parameter:'x'},3]},{center:[NaN,3]},{outline:{points:[[0,0],[1,0],[0,1]]}},{center:[9999,3],radius:3},{center:[5,-9999],radius:3}];
 for(const patch of patches){const s={...source,...patch};assert.doesNotThrow(()=>isFaceEndExtrudeSketch(s));assert.equal(isFaceEndExtrudeSketch(s),false);const doc=fixture();doc.nodes[2]=s;assert.throws(()=>toPartDocument(doc));}
});
test('translated circle extrema must stay within world coordinate range',()=>{const doc=fixture(),source=doc.nodes[2] as Circle;doc.nodes[2]={...source,plane:{...frames[0],origin:[9994,100,-7]}};assert.throws(()=>toPartDocument(doc),/coordinate range/);});

test('circle capability rejects malformed and alternate metadata without throwing, retaining native radius floor',()=>{
 const source=fixture().nodes[2] as Circle;
 const patches:unknown[]=[{center:null},{center:{}},{center:'bad'},{center:[5]},{center:[5,3,1]},{radius:null},{radius:{}},{radius:'3'},{radius:.009},
  ...['outline','holes','regions','on','association','pocketFloor','holeOutlines','regionLengths'].flatMap(key=>[{[key]:null},{[key]:{}},{[key]:[]}])];
 for(const patch of patches){const candidate={...source,...patch as object} as Circle;assert.doesNotThrow(()=>isFaceEndExtrudeSketch(candidate));assert.equal(isFaceEndExtrudeSketch(candidate),false);}
 assert.equal(isFaceEndExtrudeSketch({...source,radius:.01}),true);
});
