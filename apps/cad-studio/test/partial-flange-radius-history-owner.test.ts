import assert from 'node:assert/strict';
import test from 'node:test';
import type { ComponentProps, ReactElement } from 'react';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { captureSignatures } from '@barocss/cad-model/engine/references';
import { HistoryFeatureEditor } from '../src/ui/HistoryFeatureEditor';
import type { NodeEditor } from '../src/ui/NodeEditor';
import { createValueStore } from '../src/state/valueStore';
import type { Active } from '../src/app/commandState';

function fixture() {
  const base = withNode(withNode(emptyDoc(), {kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]}),
    {kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
  const evaluated = evaluateDoc(base, 0); assert.ok(evaluated.ok);
  const doc = captureSignatures(withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},
    edges:['n1.side1|n1.top'],length:20,bendRadius:2,offsets:[10,25],relief:{kind:'obround',width:1.5,depth:1.5}}), evaluated.bodies);
  const active = createValueStore<Active|null>(null), events:string[]=[];
  const props:ComponentProps<typeof HistoryFeatureEditor> = {
    model:{doc,evaluated:doc,commandDoc:doc,editNode:2,fresh:true,busy:false,workerSession:1},
    owner:{document:()=>doc,evaluated:()=>doc,marker:()=>null,variant:()=>null,worker:()=>1,
      hasDraft:()=>false,ownsEvaluatedSource:()=>true,scope:()=>doc,open:()=>doc,bodies:()=>[]},
    commands:{ctx:{doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}},
      discardFeatureDraft:()=>{events.push('discard');},closeForCommand:()=>{events.push('close');},
      setActive:active.set,editSketch:()=>{events.push('sketch');}},
    inset:{roundedPending:false,detach:()=>{},relink:undefined},
    editor:{onClose:()=>{}},
    worker:{engine:{faceEndDistance:async()=>{throw new Error('Not used');},
      evaluate:async()=>{throw new Error('Not used');},part:async()=>{throw new Error('Not used');}},nextRevision:()=>1},
    changes:{canChangeDocument:()=>true,commit:()=>{},stageFeatureCandidate:()=>{}},onNotice:()=>{},
  };
  const editor=()=>(HistoryFeatureEditor(props) as ReactElement<ComponentProps<typeof NodeEditor>>).props;
  return {doc,props,active,events,editor};
}
test('partial own-radius flange offers captured radius-only command',()=>{
 const f=fixture(),e=f.editor();assert.equal(e.savedFeatureEdit?.label,'Edit partial flange radius');
 assert.equal(e.savedReliefShapeEdit,undefined);e.savedFeatureEdit!.start();
 assert.deepEqual(f.events,['discard','close']);const active=f.active.get();assert.ok(active);
 assert.equal(active.cmd.label,'Edit partial flange radius');assert.deepEqual(active.values,{r:2});
 assert.equal(active.ctx.doc,f.doc);assert.equal(active.ownsSource?.(),true);
 assert.equal(active.cmd.available(active.ctx).ok,true);
});
for(const boundary of ['document','evaluated','worker','marker','variant','draft','source','fresh','busy','permission','ctx'] as const){
 test(`partial Radius entry refuses ${boundary} without retiring current work`,()=>{
  const f=fixture(), action=f.editor().savedFeatureEdit;assert.ok(action);
  switch(boundary){
   case 'document':f.props.owner.document=()=>({...f.doc});break;
   case 'evaluated':f.props.owner.evaluated=()=>({...f.doc});break;
   case 'worker':f.props.owner.worker=()=>2;break;
   case 'marker':f.props.owner.marker=()=>0;break;
   case 'variant':f.props.owner.variant=()=> 'other';break;
   case 'draft':f.props.owner.hasDraft=()=>true;break;
   case 'source':f.props.owner.ownsEvaluatedSource=()=>false;break;
   case 'fresh':f.props.model.fresh=false;break;
   case 'busy':f.props.model.busy=true;break;
   case 'permission':f.props.changes.canChangeDocument=()=>false;break;
   case 'ctx':f.props.commands.ctx={...f.props.commands.ctx,doc:{...f.doc}};break;
  }
  // Render flags/ctx are captured by a new render; live owner guards also cover old callbacks.
  if(['fresh','busy','ctx','source','permission'].includes(boundary))f.editor().savedFeatureEdit?.start();else action.start();
  assert.deepEqual(f.events,[]);assert.equal(f.active.get(),null);
 });
}
for(const boundary of ['document','evaluated','worker','marker','variant'] as const){
 test(`started partial Radius command loses ownership after ${boundary} changes`,()=>{
  const f=fixture();f.editor().savedFeatureEdit!.start();const owns=f.active.get()?.ownsSource;assert.ok(owns);assert.equal(owns(),true);
  if(boundary==='document')f.props.owner.document=()=>({...f.doc});
  if(boundary==='evaluated')f.props.owner.evaluated=()=>({...f.doc});
  if(boundary==='worker')f.props.owner.worker=()=>2;
  if(boundary==='marker')f.props.owner.marker=()=>0;
  if(boundary==='variant')f.props.owner.variant=()=> 'other';
  assert.equal(owns(),false);
 });
}
test('partial Radius command is absent on a source row and in-place mutation invalidates a captured command',()=>{
 const f=fixture();f.props.model.editNode=1;assert.equal(f.editor().savedFeatureEdit,undefined);
 f.props.model.editNode=2;const action=f.editor().savedFeatureEdit;assert.ok(action);
 f.doc.parameters.changed=1;action.start();assert.deepEqual(f.events,[]);assert.equal(f.active.get(),null);
});

for(const mutation of ['cloned-shape','changed-shape'] as const)test(`captured partial Radius command refuses ${mutation} after rendering`,()=>{
 const f=fixture(),action=f.editor().savedFeatureEdit;assert.ok(action);
 if(mutation==='cloned-shape'){
  // A semantically equal node clone is not itself a canonical content change.
  // Replacing the document owner still invalidates this old rendered action.
  const replacement={...f.doc,nodes:structuredClone(f.doc.nodes)};
  f.props.owner.document=()=>replacement;
 }else{const sk=f.doc.nodes[0];assert.ok(sk.kind==='sketch'&&sk.profile==='rectangle');sk.max=[100,50];}
 action.start();assert.deepEqual(f.events,[]);assert.equal(f.active.get(),null);
});
test('active command canonical validation refuses same-object geometry mutation before build',()=>{
 const f=fixture();f.editor().savedFeatureEdit!.start();const active=f.active.get();assert.ok(active?.cmd.build);
 const sk=f.doc.nodes[0];assert.ok(sk.kind==='sketch'&&sk.profile==='rectangle');sk.max=[100,50];
 assert.equal(active.cmd.available(active.ctx).ok,false);
 assert.throws(()=>active.cmd.build!(active.ctx,{r:3}));
 // ownsSource is the existing document/session guard; canonical revision is an additional command guard.
 assert.equal(f.events.filter(e=>e==='close').length,1);
});
