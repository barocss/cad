import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '@barocss/cad-model/app/commands';
import { editCommand } from '@barocss/cad-model/app/editCommand';
import { emptyDoc,prefixDoc,withNode,type SketchNode,type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc,evaluatePart,placeBody } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
import { createHistoryFilletReads,historyFilletCanPatch,historyFilletReceipt,ordinaryHistoryFillet,ownedHistoryFilletHandle } from '../src/state/historyFilletRadiusReceipt';
import { captureScalarHandleDrag,historyFilletEndOnBlocked,historyFilletPendingPress,scalarHandleDragValue } from '../src/viewport/scalarHandleDrag';
import type { FeatureHandle,Projector } from '../src/viewport/gizmo';
import { historyHandleIsCurrent, type Active } from '../src/app/commandState';

const rectangle: SketchNode = {kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]};
const quarterSector: SketchNode = {kind:'sketch',profile:'loop',segments:[
  {kind:'line',start:[0,0]},{kind:'arc',start:[8,0],center:[0,0],direction:'ccw'},{kind:'line',start:[0,8]},
]};
function evaluatedFixture(sketch: SketchNode, edges: string | string[], radius: number) {
 const base=withNode(withNode(emptyDoc(),sketch),{kind:'extrude',sketch:0,height:10});
 const initial=evaluateDoc(base,1);assert.ok(initial.ok);
 const picked=[edges].flat().map(name=>{
  const edge=initial.bodies[0].mesh.edges.find(e=>e.names[0]===name);assert.ok(edge);
  return {body:0,edge:edge.index};
 });
 const root={doc:base,bodies:initial.bodies,selection:{faces:[],edges:picked,bodies:[]}};
 const newFillet=commandById('fillet');assert.ok(newFillet?.build);
 const doc=captureSignatures(newFillet.build(root,{...newFillet.defaults?.(root),radius}),initial.bodies);
 const accepted=evaluateDoc(doc,2);assert.ok(accepted.ok);
 const prefix=prefixDoc(doc,2),reply=evaluatePart(prefix,3,8,'refs');assert.ok(reply.ok);
 return {doc,accepted,reply};
}
function fixture(sketch: SketchNode = rectangle, edges: string | string[] = 'n1.side0|n1.top', radius = 2) {
 const {doc,accepted,reply}=evaluatedFixture(sketch,edges,radius);
 let live=true;const current=()=>live;
 const evidence=historyFilletReceipt(doc,doc,2,accepted.bodies,reply,3,current);
 assert.ok(evidence);
 const ctx={doc,bodies:accepted.bodies,selection:{faces:[],edges:[],bodies:[0]}};
 const cmd=editCommand(2,doc.nodes,doc);assert.ok(cmd?.defaults&&cmd.handles);
 const values=cmd.defaults(ctx);
 const [handle]=cmd.handles(ctx,values);
 const active:Active={cmd,ctx,values,preview:'busy',historyFilletRadius:true,ownsSource:current};
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
 assert.equal(historyHandleIsCurrent(x.active),true);
 x.revoke();
 assert.equal(historyHandleIsCurrent(x.active),false);
 assert.equal(historyHandleIsCurrent({...x.active,historyFilletRadius:undefined,historyOffsetDistance:true}),false);
 assert.equal(historyHandleIsCurrent({...x.active,historyFilletRadius:undefined}),true);
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

test('the circular History frame uses the verified original quarter rim and the exact accepted toroidal result',()=>{
  const x=fixture(quarterSector,'n1.side1|n1.top',.6);
  const frame=x.evidence.frame;
  assert.ok(frame);
  const expected=[8*Math.SQRT1_2+.3,8*Math.SQRT1_2+.3,10+.6*Math.SQRT1_2];
  assert.ok(frame.at.every((value,axis)=>Math.abs(value-expected[axis])<1e-12));
  assert.ok(frame.dir.every((value,axis)=>Math.abs(value-[.5,.5,Math.SQRT1_2][axis])<1e-12));
  assert.equal(ownedHistoryFilletHandle(x.evidence,x.cmd,x.ctx,x.handle,null),x.evidence);
  assert.equal(ownedHistoryFilletHandle(x.evidence,x.cmd,x.ctx,x.handle,x.active),x.evidence);
  const [accepted]=x.accepted.bodies, [stock]=x.reply.bodies;
  const torus=accepted.nativeFilletTorus;
  assert.ok(torus && torus.edge===x.evidence.edge);
  const reject=(body=accepted,source=stock)=>assert.equal(
    historyFilletReceipt(x.doc,x.doc,2,[body],{...x.reply,bodies:[source]},3,x.current),null);
  reject({...accepted,nativeFilletTorus:undefined});
  reject({...accepted,nativeFilletTorus:{...torus,edge:'n1.bottom|n1.side1'}});
  reject({...accepted,nativeFilletTorus:{...torus,radius:.5}});
  reject({...accepted,nativeFilletTorus:{...torus,majorRadius:8}});
  reject({...accepted,nativeFilletTorus:{...torus,axis:[1,0,0]}});
  reject({...accepted,nativeFilletTorus:{...torus,centre:[0,0,10]}});
  reject({...accepted,nativeFilletTorus:{...torus,centre:[NaN,0,0]}});
  reject({...accepted,topology:{kind:'sheet',bodyCount:1,openShells:1,boundaryEdges:4}});
  const edges=stock.mesh.edges.map(edge=>edge.names.includes(x.evidence.edge)
    ? {...edge,nativeFilletRim:undefined} : edge);
  reject(accepted,{...stock,mesh:{...stock.mesh,edges}});
  const placed=placeBody(structuredClone(accepted),[1,0,0,0,1,0,0,0,1],[2,0,0]);
  assert.equal(placed.nativeFilletTorus,undefined);
  reject(placed);
});

test('curved History candidates outside the plain sector and pending pointer proof refuse exactly',()=>{
  const x=fixture(quarterSector,'n1.side1|n1.top',.6);
  const [sketch,stock,fillet]=x.doc.nodes;
  assert.ok(sketch.kind==='sketch' && sketch.profile==='loop' && fillet.kind==='fillet');
  const [first,arc,last]=sketch.segments;
  assert.ok(arc.kind==='arc');
  const modified: SketchNode[]=[
    {...sketch,segments:[first,arc,{...last,start:[4,4]}]},
    {...sketch,segments:[first,{...arc,direction:'cw'},last]},
    {...sketch,segments:[first,arc,last,{kind:'line',start:[-1,0]}]},
    {...sketch,plane:{origin:[0,0,1],normal:[0,0,1],xAxis:[1,0,0]}},
  ];
  for (const variant of modified) {
    assert.equal(ordinaryHistoryFillet({...x.doc,nodes:[variant,stock,fillet]},2),null);
  }
  const edge=x.evidence.edge, sig=fillet.sigs?.[edge];
  assert.ok(sig);
  const forged:StudioDoc={...x.doc,nodes:[sketch,stock,{...fillet,sigs:{[edge]:{...sig,p:[4,5,10]}}}]};
  assert.equal(historyFilletReceipt(forged,forged,2,x.accepted.bodies,x.reply,3,x.current),null);
  const h:FeatureHandle={id:'r',at:x.handle.at,dir:x.handle.dir,label:'Radius',value:.6,format:String,owner:x.cmd,onDrag:()=>{},
    historyFilletProofPending:'circular',toValue:(value,mm)=>value+mm};
  const side:Projector={...plane,project:p=>[p[0]*15,-p[2]*15]};
  assert.equal(historyFilletPendingPress(h,side,false),'consume');
  assert.equal(historyFilletPendingPress(h,side,true),'shift-pick-only');
  assert.equal(historyFilletPendingPress({...h,scalarDragSession:x.evidence},side,false),undefined);
});

test('two original circular rims share the upper History anchor and require two independently matched tori', () => {
  const upper = 'n1.side1|n1.top';
  const lower = 'n1.bottom|n1.side1';
  const expected = [8 * Math.SQRT1_2 + .3, 8 * Math.SQRT1_2 + .3, 10 + .6 * Math.SQRT1_2];
  for (const order of [[lower, upper], [upper, lower]]) {
    const x = fixture(quarterSector, order, .6);
    const [body] = x.accepted.bodies;
    const metadata = body.nativeFilletTorusPair;
    assert.ok(metadata);
    const [a, b] = metadata.tori;
    const receipt = (pair: typeof metadata | undefined) =>
      historyFilletReceipt(x.doc, x.doc, 2, [{ ...body, nativeFilletTorusPair: pair }], x.reply, 3, x.current);
    for (const result of [x.evidence, receipt({ ...metadata, tori: [b, a] })]) {
      assert.equal(result?.edge, upper);
      const frame = result?.frame;
      assert.ok(frame);
      assert.ok(frame.at.every((value, axis) => Math.abs(value - expected[axis]) < 1e-12));
      assert.ok(frame.dir.every((value, axis) => Math.abs(value - [.5, .5, Math.SQRT1_2][axis]) < 1e-12));
    }
    assert.equal(ownedHistoryFilletHandle(x.evidence, x.cmd, x.ctx, x.handle, null), x.evidence);
    assert.equal(receipt(undefined), null);
    assert.equal(receipt({ ...metadata, targets: [upper, upper] }), null);
    assert.equal(receipt({ ...metadata, tori: [a, { ...b, centre: a.centre }] }), null);
    assert.equal(receipt({ ...metadata, tori: [a, { ...b, faceId: a.faceId }] }), null);
    assert.equal(receipt({ ...metadata, tori: [a, { ...b, majorRadius: 8 }] }), null);
  }
});

test('opposite original top edges give one stable History frame regardless of the input and native face order',()=>{
 const edges=['n1.side0|n1.top','n1.side2|n1.top'];
 for (const picked of [edges,[...edges].reverse()]) {
  const x=fixture(rectangle,picked);
  const frame=x.evidence.frame;
  const norm=Math.SQRT1_2;
  assert.ok(frame && Math.hypot(frame.at[0]-20,frame.at[1]+2*norm,frame.at[2]-10-2*norm)<1e-12);
  assert.ok(Math.hypot(...frame.dir.map((value,i)=>value-[0,-norm,norm][i]))<1e-12);
  assert.equal(ownedHistoryFilletHandle(x.evidence,x.cmd,x.ctx,x.handle,null),x.evidence);
  assert.equal(ownedHistoryFilletHandle(x.evidence,x.cmd,x.ctx,x.handle,x.active),x.evidence);
 }
});

test('adjacent original top edges retain one canonical History frame and require shared native ownership',()=>{
 const edges=['n1.side0|n1.top','n1.side1|n1.top'];
 for (const picked of [edges,[...edges].reverse()]) {
  const x=fixture(rectangle,picked), frame=x.evidence.frame;
  const [body]=x.accepted.bodies, [stock]=x.reply.bodies, pair=body.nativeFilletPair;
  assert.ok(pair?.adjacentTop && frame);
  assert.equal(x.evidence.edge,edges[0]);
  assert.ok(Math.hypot(frame.at[0]-20,frame.at[1]+2*Math.SQRT1_2,frame.at[2]-10-2*Math.SQRT1_2)<1e-12);
  assert.ok(Math.hypot(...frame.dir.map((value,i)=>value-[0,-Math.SQRT1_2,Math.SQRT1_2][i]))<1e-12);
  assert.equal(ownedHistoryFilletHandle(x.evidence,x.cmd,x.ctx,x.handle,null),x.evidence);

  const receipt=(finished=body, source=stock, live=x.current)=>historyFilletReceipt(
   x.doc,x.doc,2,[finished],{...x.reply,bodies:[source]},3,live);
  const [first,second]=pair.cylinders;
  assert.deepEqual(receipt({...body,nativeFilletPair:{...pair,cylinders:[second,first]}})?.frame,frame);
  const uncertified = {...body,nativeFilletPair:{...pair,adjacentTop:undefined}};
  assert.equal(ordinaryHistoryFillet(x.doc,2,[uncertified]),null);
  assert.equal(receipt(uncertified),null);
  assert.equal(receipt({...body,nativeFilletPair:{...pair,cylinders:[first,first]}}),null);
  assert.equal(receipt({...body,nativeFilletPair:{...pair,cylinders:[first,{...second,c:[37,0,8]}]}}),null);
  assert.equal(receipt(body,{...stock,mesh:{...stock.mesh,edges:stock.mesh.edges.map(edge=>edge.names.includes(edges[1])
   ? {...edge,nativeVertices:['other-a','other-b']} : edge)}}),null);
  assert.equal(receipt(body,stock,()=>false),null);
 }
});

test('paired History rejects the wrong target, cylinder, unmerged source or stored signature',()=>{
 const x=fixture(rectangle,['n1.side0|n1.top','n1.side2|n1.top']);
 const [body]=x.accepted.bodies, [stock]=x.reply.bodies, pair=body.nativeFilletPair;
 assert.ok(pair);
 const [first,second]=pair.cylinders;
 const reject=(finished=body, source=stock, doc=x.doc)=>assert.equal(
  historyFilletReceipt(doc,doc,2,[finished],{...x.reply,bodies:[source]},3,x.current),null);
 reject({...body,nativeFilletPair:undefined});
 reject({...body,nativeFilletPair:{...pair,targets:[pair.targets[0],'other']}});
 reject({...body,nativeFilletPair:{...pair,cylinders:[first,first]}});
 reject({...body,nativeFilletPair:{...pair,cylinders:[first,{...second,r:3}]}});
 reject({...body,nativeFilletPair:{...pair,cylinders:[first,{...second,c:[0,28,7]}]}});
 reject({...body,nativeFilletPair:{...pair,cylinders:[{...first,a:[0,1,0]},second]}});
 reject({...body,mesh:{...body.mesh,faces:body.mesh.faces.filter(face=>face.id!==x.evidence.face.id)}});
 const placed=placeBody(structuredClone(body),[1,0,0,0,1,0,0,0,1],[2,0,0]);
 assert.equal(placed.nativeFilletPair,undefined);
 reject(placed);
 reject(body,{...stock,mesh:{...stock.mesh,edges:stock.mesh.edges.map(edge=>edge.names.includes(pair.targets[1])
  ? {...edge,nativeJoint:undefined} : edge)}});
 const fillet=ordinaryHistoryFillet(x.doc,2);
 assert.ok(fillet?.sigs);
 reject(body,stock,{...x.doc,nodes:[...x.doc.nodes.slice(0,2),{...fillet,sigs:{
  ...fillet.sigs, [pair.targets[1]]:{...fillet.sigs[pair.targets[1]],p:[0,0,10]},
 }}]});
 const handle:FeatureHandle={id:'r',at:x.handle.at,dir:x.handle.dir,label:'Radius',value:2,format:String,owner:x.cmd,
  onDrag:()=>{},historyFilletProofPending:'pair',toValue:(value,mm)=>value+mm};
 const side:Projector={...plane,project:p=>[p[0]*15,-p[2]*15]};
 assert.equal(historyFilletPendingPress(handle,side,false),'consume');
 assert.equal(historyFilletPendingPress({...handle,scalarDragSession:x.evidence},side,false),undefined);
});
