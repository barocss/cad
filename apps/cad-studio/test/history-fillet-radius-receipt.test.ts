import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '@barocss/cad-model/app/commands';
import { editCommand } from '@barocss/cad-model/app/editCommand';
import { emptyDoc,prefixDoc,withNode,type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc,evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
import { createHistoryFilletReads,historyFilletCanPatch,historyFilletPreviewCurrent,historyFilletReceipt,ordinaryHistoryFillet,ownedHistoryFilletHandle } from '../src/state/historyFilletRadiusReceipt';
import { captureScalarHandleDrag,historyFilletEndOnBlocked,historyFilletPendingPress,scalarHandleDragValue } from '../src/viewport/scalarHandleDrag';
import type { FeatureHandle,Projector } from '../src/viewport/gizmo';
import type { Active } from '../src/app/commandState';

function fixture(){
 const base=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]}),{kind:'extrude',sketch:0,height:10});
 const initial=evaluateDoc(base,1);assert.ok(initial.ok);
 const edge=initial.bodies[0].mesh.edges.find(e=>e.names[0]==='n1.side0|n1.top');assert.ok(edge);
 const root={doc:base,bodies:initial.bodies,selection:{faces:[],edges:[{body:0,edge:edge.index}],bodies:[]}};
 const newFillet=commandById('fillet');assert.ok(newFillet?.build);
 const doc=captureSignatures(newFillet.build(root,{...newFillet.defaults?.(root),radius:2}),initial.bodies);
 const accepted=evaluateDoc(doc,2);assert.ok(accepted.ok);
 const prefix=prefixDoc(doc,2),reply=evaluatePart(prefix,3,8,'refs');assert.ok(reply.ok);
 let live=true;const current=()=>live;
 const evidence=historyFilletReceipt(doc,doc,2,accepted.bodies,reply,3,current);assert.ok(evidence);
 const ctx={doc,bodies:accepted.bodies,selection:{faces:[],edges:[],bodies:[0]}};
 const cmd=editCommand(2,doc.nodes,doc);assert.ok(cmd?.defaults&&cmd.handles);
 const values=cmd.defaults(ctx);
 const [handle]=cmd.handles(ctx,values);
 const active:Active={cmd,ctx,values,preview:'busy',historyFilletRadius:true,ownsSource:evidence.isCurrent};
 return {doc,accepted,reply,ctx,cmd,handle,evidence,active,current,revoke:()=>{live=false;}};
}
const plane:Projector={project:p=>[p[0]*15,(p[1]+p[2])*15],size:5.6,forward:[0,1,-1]};

test('ordinary exact accepted History receipt survives idle→active and preview refresh while the pointer conversion stays frozen',()=>{
 const x=fixture();
 assert.equal(ownedHistoryFilletHandle(x.evidence,x.cmd,x.ctx,x.handle,null),x.evidence);
 assert.ok(historyFilletCanPatch(x.evidence,x.cmd,x.ctx,null,null));
 const h:FeatureHandle={id:'r',at:x.handle.at,dir:x.handle.dir,label:'Radius',value:2,format:String,owner:x.cmd,onDrag:()=>{},
  scalarDragSession:x.evidence,toValue:(value,mm)=>Math.round((value+mm)*2)/2};
 const captured=captureScalarHandleDrag(h,plane);assert.ok(captured?.fallback);
 for(const preview of ['busy','ok','error'] as const){
  const active={...x.active,preview};
  assert.equal(ownedHistoryFilletHandle(x.evidence,x.cmd,x.ctx,x.handle,active),x.evidence);
  assert.ok(historyFilletCanPatch(x.evidence,x.cmd,x.ctx,active,x.active));
  assert.equal(scalarHandleDragValue(captured,{...h,value:4,toValue:()=>99},[0,0],[0,-22.5]),3.5);
 }
 assert.equal(scalarHandleDragValue(captured,h,[0,0],[0,0]),2);
});

test('native preflight rejects wrong revision, borrowed or ambiguous stock/signature, and unsupported authored variants',()=>{
 const x=fixture();
 assert.equal(historyFilletReceipt(x.doc,x.doc,2,x.accepted.bodies,x.reply,4,x.current),null);
 const wrongStock={...x.reply,bodies:x.reply.bodies.map(b=>({...b,ref:{node:0,side:'solid' as const}}))};
 assert.equal(historyFilletReceipt(x.doc,x.doc,2,x.accepted.bodies,wrongStock,3,x.current),null);
 const fillet=ordinaryHistoryFillet(x.doc,2);assert.ok(fillet);
 const edits:Partial<typeof fillet>[]=[{held:'held'},{suppressed:true},{edges:[...fillet.edges,'other']},
  {sigs:{[fillet.edges[0]]:{k:'line',p:[2,0,10],d:[1,0,0],s:40}}}];
 for(const edit of edits){
  const doc:StudioDoc={...x.doc,nodes:[...x.doc.nodes.slice(0,2),{...fillet,...edit}]};
  assert.equal(historyFilletReceipt(doc,doc,2,x.accepted.bodies,x.reply,3,x.current),null);
 }
});

test('wrong active context, replacement command, revoked owner or Cancel cannot inherit the captured edit',()=>{
 const x=fixture();
 const replaced={...x.active,cmd:{...x.cmd}};
 const ctx={...x.ctx};
 for(const active of [replaced,{...x.active,ctx},{...x.active,ownsSource:()=>true}]){
  assert.equal(ownedHistoryFilletHandle(x.evidence,x.cmd,x.ctx,x.handle,active),undefined);
  assert.equal(historyFilletCanPatch(x.evidence,x.cmd,x.ctx,active,x.active),false);
 }
 assert.equal(historyFilletCanPatch(x.evidence,x.cmd,x.ctx,null,x.active),false);
 assert.equal(historyFilletPreviewCurrent(x.active),true);
 x.revoke();
 assert.equal(historyFilletPreviewCurrent(x.active),false);
 assert.equal(historyFilletPreviewCurrent({...x.active,historyFilletRadius:undefined}),true);
 assert.equal(ownedHistoryFilletHandle(x.evidence,x.cmd,x.ctx,x.handle,null),undefined);
 assert.equal(historyFilletCanPatch(x.evidence,x.cmd,x.ctx,null,null),false);
});

test('while evidence is pending the exact end-on pointer cannot begin, but projected and generic pointers still can',()=>{
  const x=fixture();
  const h:FeatureHandle={id:'r',at:x.handle.at,dir:x.handle.dir,label:'Radius',value:2,format:String,owner:x.cmd,onDrag:()=>{},
    historyFilletProofPending:true,toValue:(v,mm)=>v+mm};
  const side:Projector={...plane,project:p=>[p[0]*15,-p[2]*15]};
  assert.equal(historyFilletEndOnBlocked(h,plane),true);
  assert.equal(historyFilletEndOnBlocked(h,side),false);
  assert.equal(historyFilletEndOnBlocked({...h,historyFilletProofPending:undefined},plane),false);
  assert.equal(historyFilletEndOnBlocked({...h,scalarDragSession:x.evidence},plane),false);
  assert.equal(historyFilletPendingPress(h,plane,false),'consume');
  assert.equal(historyFilletPendingPress(h,plane,true),'shift-pick-only');
  assert.equal(historyFilletPendingPress(h,side,true),undefined);
  assert.equal(historyFilletPendingPress({...h,scalarDragSession:x.evidence},plane,true),undefined);
  // A null frame reserved on that Shift press cannot begin a drag after movement, even after proof arrives.
  assert.equal(scalarHandleDragValue(null,{...h,scalarDragSession:x.evidence},[0,0],[0,6]),null);
});

test('only plain rectangle/ordinary stock; revocation preserves unrelated drag bookkeeping',()=>{
  const x=fixture();
  const [sketch,stock,fillet]=x.doc.nodes;
  for (const field of ['on','association','outline','regions','holes','holeOutlines','regionLengths','construction','pocketFloor','sideTags']) {
    const doc={...x.doc,nodes:[{...sketch,[field]:[]},stock,fillet]};
    assert.equal(ordinaryHistoryFillet(doc,2),null,field);
  }
  assert.equal(ordinaryHistoryFillet({...x.doc,nodes:[sketch,{...stock,held:'held'},fillet]},2),null);
  const other={...x.active,cmd:{...x.cmd},historyFilletRadius:undefined};
  const unrelatedBookkeeping={key:'unrelated',want:8,lastOk:8};
  const before={...unrelatedBookkeeping};
  const write=(current:Active|null)=>{
    if(!historyFilletCanPatch(x.evidence,x.cmd,x.ctx,current,x.active)) return;
    unrelatedBookkeeping.want=4;
  };
  write(other);assert.deepEqual(unrelatedBookkeeping,before);
  x.revoke();write(x.active);assert.deepEqual(unrelatedBookkeeping,before);
});

test('single-flight exact source reads survive reentry and old delayed source cannot re-admit',async()=>{
  const x=fixture(), oldSource={}, newSource={};
  type Packet=typeof x.reply;
  let oldDone:(p:Packet)=>void=()=>{}, newDone:(p:Packet)=>void=()=>{}, calls=0;
  const reads=createHistoryFilletReads<Packet>();
  const a=reads(oldSource,()=>new Promise(resolve=>{calls++;oldDone=resolve;}));
  const retry=reads(oldSource,()=>{throw Error('duplicate stock read');});
  assert.equal(a,retry);await Promise.resolve();assert.equal(calls,1);
  let current=oldSource;
  const admit=(s:object,p:Promise<Packet>)=>p.then(reply=>historyFilletReceipt(x.doc,x.doc,2,x.accepted.bodies,reply,3,()=>current===s));
  const old=admit(oldSource,a);
  current=newSource;
  const b=reads(newSource,()=>new Promise(resolve=>{calls++;newDone=resolve;}));
  const newer=admit(newSource,b);
  await Promise.resolve();newDone(x.reply);
  assert.ok(await newer);assert.equal(reads(newSource,()=>{throw Error('should reuse exact completed read');}),b);
  oldDone(x.reply);assert.equal(await old,null);assert.equal(calls,2);
});
