import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDoc, rectanglePart, withNode, type StudioDoc, type PartInstance } from '../src/engine/doc';
import { offerRevision, acceptRevision } from '../src/assembly/definitions';
import { jointsOfInstance, setInstanceJoints } from '../src/assembly/flexible';
import { dispatchTool } from '../src/chat/tools';
import { evaluateDoc } from '../src/engine/evaluate';
import { solveDoc } from '../src/assembly/edit';
const plate=(w:number,d:number,h:number,c:[number,number])=>{const p=rectanglePart(w,d,h);return withNode(p,{kind:'hole',parent:{node:p.nodes.length-1,side:'solid'},center:c,radius:5} as never);};
function revisionJointFixture(){
 const lid:PartInstance={id:'lid',name:'Lid',doc:plate(60,20,5,[10,10]),position:[0,0,30],rotation:[0,0,0]};
 const sub=solveDoc({...plate(100,40,10,[20,20]),instances:[lid],mates:[{id:'c',kind:'concentric',a:{part:'base',face:'n2.side0'},b:{part:'lid',face:'n2.side0'}},{id:'f',kind:'coincident',a:{part:'base',face:'n1.top'},b:{part:'lid',face:'n1.bottom'}}]}).doc;
 const door:PartInstance={id:'door',name:'Door',part:{id:'door-def',rev:'A'},doc:sub,position:[0,0,0],rotation:[0,0,0],grounded:true};
 const doc=setInstanceJoints({...emptyDoc(),instances:[door]},{part:'door',joints:{'base~lid':30}}).doc;
 return {doc,incoming:rectanglePart(80,30,8)};
}

const evaluate=async(doc:StudioDoc)=>evaluateDoc(doc,1);

test('get_assembly reports retained joint problems after a normal revision',async()=>{
 const {doc,incoming}=revisionJointFixture();const offered=offerRevision(doc,'door-def',incoming,'plate.bcad');assert.ok('doc' in offered);if(!('doc' in offered))return;
 const accepted=acceptRevision(offered.doc,'door-def'),before=structuredClone(accepted);
 const expected=jointsOfInstance(accepted.instances![0]);assert.match(expected.problem!,/not a sub-assembly/);
 const reply=await dispatchTool({doc:accepted,bodies:[]},'get_assembly',{},evaluate),listed=JSON.parse(reply.content).instances[0];
 console.log('STALE_JOINT_SUMMARY',JSON.stringify({stored:accepted.instances![0].joints,expected,listed}));
 assert.equal(reply.isError,false);assert.equal(reply.changed,false);assert.deepEqual(accepted,before);
 assert.equal(listed.joint_problem,expected.problem);
});

test('joint diagnostics preserve normal plain and nested reports and disappear only after explicit reset',async()=>{
 const {doc}=revisionJointFixture();
 const plain:PartInstance={id:'plain',name:'Plain',doc:rectanglePart(10,20,3),position:[0,0,0],rotation:[0,0,0]};
 const noMates={...doc.instances![0],doc:{...doc.instances![0].doc,mates:undefined}};
 for(const instance of [plain,doc.instances![0],noMates]){
  const source={...emptyDoc(),instances:[instance]},before=structuredClone(source);
  const reply=await dispatchTool({doc:source,bodies:[]},'get_assembly',{},evaluate),listed=JSON.parse(reply.content).instances[0];
  assert.equal(reply.isError,false);assert.equal(reply.changed,false);assert.deepEqual(source,before);
  const expected=jointsOfInstance(instance);
  if(instance.joints&&expected.problem)assert.equal(listed.joint_problem,expected.problem);
  else assert.equal(listed.joint_problem,undefined);
  if(instance===doc.instances![0]){assert.ok(listed.joints.length);assert.equal(listed.joints[0].value,expected.joints[0].value);}
  if(instance===noMates){
   const reset=setInstanceJoints(source,{part:instance.id,joints:{},replace:true}).doc;
   const clean=await dispatchTool({doc:reset,bodies:[]},'get_assembly',{},evaluate);
   assert.equal(JSON.parse(clean.content).instances[0].joint_problem,undefined);
   assert.deepEqual(source,before);
  }
 }
});
