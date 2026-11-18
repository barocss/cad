import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { commands, type Ctx } from '../src/app/commands';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { toPartDocument } from '../src/engine/part';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
const command=commands.find(c=>c.id==='circular-pattern')!;
function fixture(){return withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[50,10],max:[54,16]}),{kind:'extrude',sketch:0,height:8});}
function create(doc:StudioDoc,span:number,count:number,axis='z',result='separate'){
 const evaluated=evaluateDoc(doc,1);assert.ok(evaluated.ok);
 const ctx:Ctx={doc,bodies:evaluated.bodies,selection:{faces:[],edges:[],bodies:[0]}};
 return command.build!(ctx,{axis,span,count,px:12,py:4,result});
}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function turn(p:readonly number[],angle:number,axis:string):number[]{
 const pivot=axis==='z'?[12,4,0]:[0,0,0],q=p.map((v,i)=>v-pivot[i]),t=angle*Math.PI/180,c=Math.cos(t),s=Math.sin(t);
 const r=axis==='z'?[c*q[0]-s*q[1],s*q[0]+c*q[1],q[2]]:axis==='x'?[q[0],c*q[1]-s*q[2],s*q[1]+c*q[2]]:[c*q[0]+s*q[2],q[1],-s*q[0]+c*q[2]];
 return r.map((v,i)=>v+pivot[i]);
}
for(const [span,count,axis] of [[360,7,'z'],[120.123456789,4,'z'],[360,4,'x'],[360,4,'y']] as const){
 test(`Separate ${axis} span ${span} count ${count} stores unrounded step multiples`,()=>{
  const doc=fixture(),before=structuredClone(doc),next=create(doc,span,count,axis),step=axis==='z'?(span>=360?360/count:span/(count-1)):90;
  const rotations=next.nodes.filter(n=>n.kind==='rotate');assert.equal(rotations.length,count-1);
  rotations.forEach((n,i)=>{assert.equal(n.angle,step*(i+1));assert.equal(n.axis,axis);assert.deepEqual(n.pivot,axis==='z'?[12,4,0]:undefined);});
  assert.deepEqual(doc,before);assert.equal(next.nodes.some(n=>n.kind==='circular-pattern'),false);assert.equal(Object.keys(next.outputs).length,count);
 });
 test(`Separate ${axis} span ${span} native geometry and file replay follow independent angles`,async()=>{
  const doc=fixture(),next=create(doc,span,count,axis),opened=await readStudioFile(encodeStudioFile(next));assert.ok('doc'in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(next)));
  const step=axis==='z'?(span>=360?360/count:span/(count-1)):90;
  for(const saved of [next,opened.doc]){
   const outputs=evaluateCadPart(toPartDocument(saved)).outputs;assert.equal(outputs.length,count);
   const expected=Array.from({length:count},(_,i)=>({centre:turn([52,13,4],step*i,axis),points:[50,54].flatMap(x=>[10,16].flatMap(y=>[0,8].map(z=>turn([x,y,z],step*i,axis))))}));
   const unused=new Set(expected);
   for(const out of outputs){assert.equal(checkBrep(out.brep,{strict:true}).valid,true);const mass=massPropertiesOf(out);near(mass.volume,192);
    const match=[...unused].find(e=>Math.hypot(...e.centre.map((v,i)=>v-mass.centroid[i]))<1e-8);assert.ok(match,'each independent expected copy occurs once');unused.delete(match);
    const vertices=out.brep.vertices.map(v=>v.point);assert.equal(vertices.length,8);const remaining=new Set(vertices);
    for(const p of match.points){const vertex=[...remaining].find(v=>Math.hypot(...p.map((q,i)=>q-v[i]))<1e-8);assert.ok(vertex,'unique expected rotated native corner');remaining.delete(vertex);}assert.equal(remaining.size,0);
   }assert.equal(unused.size,0);
  }
 });
}
test('Separate invalid count refuses without mutation and One body retains its established rounded step',async()=>{
 const doc=fixture(),before=structuredClone(doc);
 for(const [count,axis] of [[1,'z'],[2.5,'z'],[65,'z'],[5,'x'],[NaN,'z']] as const)assert.throws(()=>create(doc,360,count,axis));
 assert.deepEqual(doc,before);
 const one=create(doc,360,7,'z','one'),pattern=one.nodes.at(-1);assert.ok(pattern?.kind==='circular-pattern');assert.equal(pattern.angle,51.428571);assert.equal(pattern.span,360);
 const opened=await readStudioFile(encodeStudioFile(one));assert.ok('doc'in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(one)));
});
test('previously saved rounded Separate angles reopen unchanged without reinterpretation',async()=>{
 const current=create(fixture(),360,7),legacy={...current,nodes:current.nodes.map(n=>n.kind==='rotate'?{...n,angle:Math.round(n.angle*1e6)/1e6}:n)};
 const before=structuredClone(legacy),opened=await readStudioFile(encodeStudioFile(legacy));assert.ok('doc'in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(legacy)));assert.deepEqual(legacy,before);
 assert.notDeepEqual(opened.doc.nodes.filter(n=>n.kind==='rotate').map(n=>n.angle),current.nodes.filter(n=>n.kind==='rotate').map(n=>n.angle));
 const original=evaluateCadPart(toPartDocument(legacy)).outputs,replayed=evaluateCadPart(toPartDocument(opened.doc)).outputs;assert.equal(original.length,7);assert.equal(replayed.length,7);
 original.forEach((out,i)=>{assert.equal(checkBrep(replayed[i].brep,{strict:true}).valid,true);assert.deepEqual(replayed[i].brep.vertices,out.brep.vertices);near(massPropertiesOf(replayed[i]).volume,massPropertiesOf(out).volume);});
});
