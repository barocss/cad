import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart,withNode,type StudioDoc,type ModelNode } from '../src/engine/doc';
import { editFields,type BindableField } from '../src/app/editFields';
import { evaluateDoc,partBreps } from '../src/engine/evaluate';
import { encodeStudioFile,readStudioFile } from '../src/engine/container';
function fixture():StudioDoc{return withNode({...rectanglePart(20,20,10),parameters:{Angle:12,Neutral:-2}},{kind:'draft',parent:{node:1,side:'solid'},faces:['n1.side0'],angle:10,pull:'z',neutral:0});}
function field(d:StudioDoc,key:string){const f=editFields(d.nodes,2,d.parameters).find(f=>f.key===key);assert.ok(f?.kind==='number');return f;}
function oracle(d:StudioDoc,angle:number,neutral:number){
 const r=evaluateDoc(d,1);assert.ok(r.ok,JSON.stringify(r));const t=Math.tan(angle*Math.PI/180);
 assert.ok(Math.abs(r.bodies[0].volume!-(4000-20*t*(50-10*neutral)))<1e-7);
 const actual=partBreps(d)[0].brep.vertices.map(v=>v.point),expected:number[][]=[];
 for(const x of [0,20])for(const z of [0,10])for(const y of [(z-neutral)*t,20])expected.push([x,y,z]);
 // Outward draft may retain extra split vertices; compare physical corners, not topology count.
 for(const p of expected)assert.ok(actual.some(v=>v.every((n,i)=>Math.abs(n-p[i])<1e-8)));
 for(const [x,y,z] of actual){assert.ok(x>=-1e-8&&x<=20+1e-8&&z>=-1e-8&&z<=10+1e-8);assert.ok(y>=(z-neutral)*t-1e-8&&y<=20+1e-8);}
}
test('standalone Draft Angle is numeric-only, distinct from Extrude Draft',()=>{
 const d=fixture(),before=structuredClone(d);for(const parameters of [d.parameters,{}, {Angle:NaN},Object.create({Angle:12})]){
 const f=field({...d,parameters},'deg');assert.equal('bind' in f,false);assert.equal('param' in f,false);assert.equal(f.get(d.nodes),10);
 }assert.deepEqual(d,before);
});
test('numeric positive and negative Draft angles match independent wall coordinates and volume without mutation',()=>{
 const d=fixture(),before=structuredClone(d),f=field(d,'deg');for(const angle of [10,12,-8]){
 const nodes=f.set(d.nodes,angle);assert.deepEqual(nodes[2],{...d.nodes[2],angle});assert.equal(nodes[0],d.nodes[0]);assert.equal(nodes[1],d.nodes[1]);oracle({...d,nodes},angle,0);
 }assert.deepEqual(d,before);
});
test('Neutral binding survives Angle editing and native Save/Open',async()=>{
 const d=fixture(),before=structuredClone(d),neutral=field(d,'neutral') as BindableField;assert.equal(typeof neutral.bind,'function');assert.equal(neutral.bind(d.nodes,'Missing'),null);
 const bound=neutral.bind(d.nodes,'Neutral');assert.ok(bound);assert.equal(neutral.param(bound),'Neutral');
 for(const angle of [10,12,-8]){
 const nodes=field(d,'deg').set(bound,angle),n=nodes[2];assert.ok(n.kind==='draft');assert.deepEqual(n.neutral,{parameter:'Neutral'});
 const next={...d,nodes};oracle(next,angle,-2);const read=await readStudioFile(encodeStudioFile(next));assert.ok('doc' in read);assert.deepEqual(read.doc,JSON.parse(JSON.stringify(next)));oracle(read.doc,angle,-2);
 }assert.deepEqual(d,before);
});
test('unsupported Angle object is a native INPUT refusal and leaves accepted document intact',()=>{
 const d=fixture(),before=structuredClone(d),f=field(d,'deg');const nodes='bind' in f?(f as BindableField).bind(d.nodes,'Angle')!:d.nodes.map((n,i)=>i===2?{...n,angle:{parameter:'Angle'}} as unknown as ModelNode:n);
 assert.ok(nodes);const result=evaluateDoc({...d,nodes},1);assert.equal(result.ok,false);if(!result.ok){assert.equal(result.error.code,'INPUT');assert.match(result.error.detail,/angle must be a number/);}
 assert.deepEqual(d,before);oracle(d,10,0);
});
