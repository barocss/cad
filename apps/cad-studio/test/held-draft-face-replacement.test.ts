import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDoc, evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { MeshSender, MeshReceiver } from '@barocss/cad-model/engine/meshWire';
import { verifyReferences } from '@barocss/cad-model/engine/references';
import { withLook } from '@barocss/cad-model/app/bodies';
import { isBodyEyeVisibilityOnly } from '../src/state/bodyVisibilityReferenceProblems';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { createHeldDraftFaceSession, heldDraftFacePreviewClear, heldDraftFaceWorkCurrent, heldDraftFaceAvailable, type HeldDraftFaceView } from '../src/state/heldDraftFaceSession';
import { pickHeldDraftFace, planHeldDraftReplacement, readyHeldDraftReplacement } from '../src/state/heldDraftFaceReplacement';

const cap='n2.cut.side1';
const target='n2.cut.side3';
const doc:StudioDoc={format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
  {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[60,30]},
  {id:'n1',kind:'extrude',sketch:0,height:10},
  {id:'n2',kind:'split',parent:{node:1,side:'solid'},axis:'x',normal:[-1,0,0],at:-30},
  {id:'n3',kind:'draft',parent:{node:2,side:'negative'},faces:[cap],angle:10,pull:'z',neutral:0,
    sigs:{[cap]:{k:'plane',p:[24,15,5],d:[1,0,0],s:300}}},
],outputs:{b2_positive:{node:2,side:'positive'},b3:{node:3,side:'solid'}},nextId:4};
async function fixture() {
  const checked=await verifyReferences(doc,[],async d=>evaluatePart(d,10,8,'refs'));
  assert.deepEqual(checked.problems.map(p=>[p.name,p.candidates]),[[cap,[]]]);
  const ev=evaluateDoc(checked.doc,11);assert.ok(ev.ok,JSON.stringify(ev));
  let live=true;
  const owner={doc:checked.doc,index:3,problems:checked.problems,bodies:ev.bodies,isCurrent:()=>live};
  const body=ev.bodies.findIndex(b=>b.key==='b3');
  const mesh=ev.bodies[body].mesh;
  const face=mesh.faces.findIndex(f=>f.name===target);
  assert.ok(face>=0);
  return {owner,hit:{face:{body,face},faceMesh:mesh},retire:()=>{live=false;}};
}

test('D1001 exact user-picked cap gives a candidate without replacing the held feature identity',async()=>{
  const {owner,hit}=await fixture();
  const picked=pickHeldDraftFace(owner,hit);assert.ok(picked);
  const sender=new MeshSender(),receiver=new MeshReceiver();
  const wire=(ev: ReturnType<typeof evaluatePart>)=>receiver.unpack('refs',sender.pack('refs',ev).result);
  const prefix=wire(evaluatePart(picked.prefix,71,8,'refs'));
  const plan=planHeldDraftReplacement(picked,prefix,71);assert.ok(plan);
  const candidate=wire(evaluatePart(plan.next,72,8,'refs')); const next=readyHeldDraftReplacement(plan,candidate,72);
  assert.equal(next,plan.next);assert.ok(next);
  assert.equal(next.outputs,owner.doc.outputs);assert.equal(next.nextId,owner.doc.nextId);
  for(let i=0;i<3;i++)assert.equal(next.nodes[i],owner.doc.nodes[i]);
  assert.deepEqual(JSON.parse(JSON.stringify(next.nodes[3])),{...(doc.nodes[3]),faces:[target],sigs:{[target]:{k:'plane',p:[30,15,5],d:[-1,0,0],s:300}}});
  assert.ok(owner.doc.nodes[3].suppressed);
  const accepted=evaluateDoc(next,73);assert.ok(accepted.ok);
  assert.deepEqual(accepted.bodies.map(b=>b.key),['b2_positive','b3']);
  assert.equal(accepted.bodies[0].volume,9000);
  assert.ok(Math.abs(accepted.bodies[1].volume!-30*(30*10-50*Math.tan(Math.PI/18)))<1e-8);
  const recheck=await verifyReferences(next,accepted.bodies,async d=>evaluatePart(d,74,8,'refs'));
  assert.equal(recheck.problems.length,0);assert.equal(recheck.changes.length,0);
});

test('wrong mate, stale hit mesh, ordinary face, external instance and existing candidates are not picks',async()=>{
  const {owner,hit}=await fixture();
  const body=owner.bodies.findIndex(b=>b.key==='b2_positive'), mesh=owner.bodies[body].mesh;
  const face=mesh.faces.findIndex(f=>f.name===cap);assert.ok(face>=0);
  assert.equal(pickHeldDraftFace(owner,{face:{body,face},faceMesh:mesh}),null);
  assert.equal(pickHeldDraftFace(owner,{...hit,faceMesh:{...hit.faceMesh}}),null);
  assert.equal(pickHeldDraftFace(owner,{...hit,instance:'placed'}),null);
  const ordinary=hit.faceMesh.faces.findIndex(f=>f.name==='n1.top');assert.ok(ordinary>=0);
  assert.equal(pickHeldDraftFace(owner,{...hit,face:{...hit.face,face:ordinary}}),null);
  assert.equal(pickHeldDraftFace({...owner,problems:owner.problems.map(p=>({...p,candidates:[target]}))},hit),null);
  assert.equal(pickHeldDraftFace({...owner,doc:{...owner.doc,nextId:5,nodes:[...owner.doc.nodes,doc.nodes[0]]}},hit),null);
});

test('qualification refuses wrong phase revisions/body identity, changed sister geometry and revoked ownership',async()=>{
  const {owner,hit,retire}=await fixture();
  const picked=pickHeldDraftFace(owner,hit);assert.ok(picked);
  const prefix=evaluatePart(picked.prefix,71,8,'refs');assert.ok(prefix.ok);
  assert.equal(planHeldDraftReplacement(picked,prefix,70),null);
  assert.equal(planHeldDraftReplacement(picked,{...prefix,bodies:prefix.bodies.filter(b=>b.key!=='b2_negative')},71),null);
  const plan=planHeldDraftReplacement(picked,prefix,71);assert.ok(plan);
  const preview=evaluatePart(plan.next,72,8,'refs');assert.ok(preview.ok);
  assert.equal(readyHeldDraftReplacement(plan,preview,71),null);
  assert.equal(readyHeldDraftReplacement(plan,{...preview,revision:71},71),null);
  assert.equal(readyHeldDraftReplacement(plan,{...preview,bodies:prefix.bodies},72),null);
  assert.equal(readyHeldDraftReplacement(plan,{...preview,bodies:[...owner.bodies]},72),null);
  const sibling=preview.bodies.find(b=>b.key==='b2_positive')!;
  const changed={...sibling,mesh:{...sibling.mesh,faces:sibling.mesh.faces.slice(1)}};
  assert.equal(readyHeldDraftReplacement(plan,{...preview,bodies:preview.bodies.map(b=>b===sibling?changed:b)},72),null);
  retire();
  assert.equal(pickHeldDraftFace(owner,hit),null);
  assert.equal(planHeldDraftReplacement(picked,prefix,71),null);
  assert.equal(readyHeldDraftReplacement(plan,preview,72),null);
});

type Reply = ReturnType<typeof evaluatePart>;
async function sessionFixture(previewClear:()=>boolean=()=>true) {
  const f=await fixture();
  const waiters: {doc:StudioDoc; revision:number; finish(reply:Reply):void}[]=[];
  const accepted: StudioDoc[]=[];
  let revision=100, view:HeldDraftFaceView|null=null;
  const driver=createHeldDraftFaceSession({...f.owner,isCurrent:()=>f.owner.isCurrent() && previewClear()},{
    revision:()=>++revision,
    evaluate:(doc,revision)=>new Promise(finish=>waiters.push({doc,revision,finish})),
    publish:next=>{view=next;},
    accept:next=>{accepted.push(next); return true;},
  });
  const finish=async(i:number, wrong=false)=>{
    const cycle=waiters[i]; assert.ok(cycle,`request ${i} not issued`);
    cycle.finish(evaluatePart(cycle.doc,cycle.revision-(wrong?1:0),8,'refs')); await Promise.resolve();
  };
  const wrongBody = f.owner.bodies.findIndex(b=>b.key==='b2_positive');
  const mesh=f.owner.bodies[wrongBody].mesh;
  const side={face:{body:wrongBody,face:mesh.faces.findIndex(f=>f.name===cap)},faceMesh:mesh};
  return {...f,driver,waiters,accepted,finish,view:()=>view,side};
}

test('session publishes pending then qualified preview; Apply is explicit and exactly once',async()=>{
  const s=await sessionFixture(); s.driver.start();
  assert.equal(s.view()?.kind,'picking'); assert.equal(s.waiters.length,0);
  const task=s.driver.pick(s.hit); assert.equal(s.view()?.kind,'pending'); assert.equal(s.driver.apply(),false);
  await s.finish(0); assert.equal(s.waiters.length,2); assert.equal(s.driver.apply(),false);
  await s.finish(1); await task;
  assert.equal(s.view()?.kind,'ready'); assert.equal(s.accepted.length,0);
  assert.equal(s.driver.apply(),true); assert.equal(s.driver.apply(),false); assert.equal(s.accepted.length,1);
  assert.equal(s.accepted[0].nodes[3].id,'n3'); assert.equal(s.view(),null);
});

test('wrong side or repick, Cancel, stale owner, and wrong revision never commit',async()=>{
  for(const phase of ['prefix','final'] as const) {
    for(const invalidation of ['repick','cancel','source','revision','wrong side'] as const) {
      const s=await sessionFixture();s.driver.start();
      const task=s.driver.pick(s.hit);
      if(phase==='final') await s.finish(0);
      if(invalidation==='repick') s.driver.repick();
      if(invalidation==='cancel') s.driver.cancel();
      if(invalidation==='source') s.retire();
      if(invalidation==='wrong side') await s.driver.pick(s.side);
      await s.finish(phase==='prefix'?0:1,invalidation==='revision'); await task;
      assert.notEqual(s.view()?.kind,'ready',`${phase}/${invalidation}`);
      assert.equal(s.driver.apply(),false); assert.equal(s.accepted.length,0);
      assert.equal(s.waiters.length,phase==='prefix'?1:2);
    }
  }
});

test('Apply also refuses when source closes after a qualified preview',async()=>{
  const s=await sessionFixture();s.driver.start();
  const task=s.driver.pick(s.hit);await s.finish(0);await s.finish(1);await task;
  assert.equal(s.view()?.kind,'ready');
  s.retire(); assert.equal(s.driver.apply(),false);assert.equal(s.accepted.length,0);
  s.driver.cancel(); assert.equal(s.view(),null);
});

test('a competing preview on the same document prevents start or retires authority at every stage',async()=>{
  const alternatives=[
    {proposal:{id:'p',after:false}},{proposalBusy:true},{comparison:{id:'v'}},{comparisonOverlay:{}},{candidateShown:true},
  ];
  for(const alternate of alternatives) {
    for(const phase of ['start','prefix','final','ready'] as const) {
      let ownerMode:Parameters<typeof heldDraftFacePreviewClear>[0]={};
      const s=await sessionFixture(()=>heldDraftFacePreviewClear(ownerMode));
      if(phase==='start') {
        ownerMode=alternate; s.driver.start();
        assert.equal(s.view(),null); assert.equal(s.waiters.length,0);
      } else {
        s.driver.start(); const task=s.driver.pick(s.hit);
        if(phase!=='prefix') await s.finish(0);
        if(phase==='ready') { await s.finish(1); await task; assert.equal(s.view()?.kind,'ready'); }
        ownerMode=alternate; // Same document, body array, worker and editor; only competing preview changed.
        if(phase!=='ready') { await s.finish(phase==='prefix'?0:1); await task; assert.notEqual(s.view()?.kind,'ready'); }
      }
      assert.equal(s.driver.apply(),false); assert.equal(s.accepted.length,0);
      s.driver.cancel();
      assert.equal(s.view(),null);
    }
  }
});

test('unsupported stored format or route involvement never admits a session',async()=>{
  const {owner,hit}=await fixture();
  for(const delta of [
    {format:'other'}, {schema:5}, {units:'in'}, {routeBundles:undefined}, {routeBundleMember:undefined},
    {nodes:owner.doc.nodes.map((n,i)=>i===2 ? {...n,routeBundleMember:undefined}:n)},
  ]) {
    const other={...owner,doc:{...owner.doc,...delta} as StudioDoc};
    assert.equal(heldDraftFaceAvailable(other),false);
    assert.equal(pickHeldDraftFace(other,hit),null);
  }
});

test('finished same-source work cannot make an old scope or generation current again',async()=>{
  for (const phase of ['prefix','final','ready'] as const) {
    for (const key of ['scope','generation'] as const) {
      const original={scope:{},generation:{}};
      let live=original;
      const s=await sessionFixture(()=>heldDraftFaceWorkCurrent(original,live));
      s.driver.start();const task=s.driver.pick(s.hit);
      if(phase!=='prefix') await s.finish(0);
      if(phase==='ready') { await s.finish(1); await task; assert.equal(s.view()?.kind,'ready'); }
      live={...original,[key]:{}}; // other work began and finished before any render; only its identity changed.
      if(phase!=='ready') { await s.finish(phase==='prefix'?0:1); await task; assert.notEqual(s.view()?.kind,'ready'); }
      assert.equal(s.driver.apply(),false);assert.equal(s.accepted.length,0);
    }
  }
});

test('the normal Browser eye hide/show retains held recovery without transferring changed metadata',async()=>{
  const {owner,hit}=await fixture();
  const sister=owner.bodies.find(body=>body.key==='b2_positive')!;
  const looks=withLook(owner.doc,sister,{name:'untouched name',material:'steel'});
  const hidden=withLook(looks,sister,{hidden:true});
  const shown=withLook(hidden,sister,{hidden:false});
  assert.equal(isBodyEyeVisibilityOnly(looks,hidden),true);
  assert.equal(isBodyEyeVisibilityOnly(hidden,shown),true);
  const hiddenFromNoLook=withLook(owner.doc,sister,{hidden:true});
  assert.equal(isBodyEyeVisibilityOnly(owner.doc,hiddenFromNoLook),true);
  assert.equal(isBodyEyeVisibilityOnly(hiddenFromNoLook,withLook(hiddenFromNoLook,sister,{hidden:false})),true);
  const map=new WeakMap([[looks,owner.problems]]);
  // App's eye-only path associates the existing problem, not a fabricated match, with a newly committed owner.
  if(isBodyEyeVisibilityOnly(looks,hidden))map.set(hidden,map.get(looks)!);
  assert.equal(map.get(looks),owner.problems);
  assert.equal(map.get(hidden),owner.problems);
  assert.ok(pickHeldDraftFace({...owner,doc:hidden,problems:map.get(hidden)!},hit));

  for (const changed of [
    withLook(looks,sister,{hidden:true,name:'rename'}),
    withLook(looks,sister,{hidden:true,material:'aluminium'}),
    withLook(looks,sister,{hidden:true,faces:{['n2.cut.side1']:'#fff'}}),
    withLook(hidden,owner.bodies.find(body=>body.key==='b3')!,{hidden:true}),
    {...hidden,nodes:[...looks.nodes]}, {...hidden,outputs:{...looks.outputs}},
    {...hidden,parameters:{...looks.parameters}},
    {...hidden,references:{version:1 as const,references:[],datums:[],keepouts:[]}},
  ]) assert.equal(isBodyEyeVisibilityOnly(looks,changed),false);
  assert.equal(isBodyEyeVisibilityOnly(looks,looks),false);
});
