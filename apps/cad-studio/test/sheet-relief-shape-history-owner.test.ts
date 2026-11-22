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
  const doc = captureSignatures(withNode(base,{kind:'sheet-corner-relief',parent:{node:1,side:'solid'},
    edges:['n1.side0|n1.side1'],shape:'square',size:3}), evaluated.bodies);
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
test('relief Shape and existing Corner are independent guarded History commands',()=>{
  const f=fixture(), e=f.editor();
  assert.equal(e.savedFeatureEdit?.label,'Edit relief corner');
  assert.equal(e.savedReliefShapeEdit?.label,'Edit relief shape');
  e.savedReliefShapeEdit!.start();assert.deepEqual(f.events,['discard','close']);
  assert.equal(f.active.get()?.cmd.label,'Edit relief shape');assert.equal(f.active.get()?.values.shape,'square');
  assert.equal(f.active.get()?.ctx.doc,f.doc);assert.equal(f.active.get()?.ownsSource?.(),true);
});
for(const boundary of ['document','evaluated','worker','marker','variant','draft','source','fresh','busy','permission','ctx'] as const){
 test(`relief Shape entry refuses ${boundary} without retiring current work`,()=>{
  const f=fixture(), action=f.editor().savedReliefShapeEdit;assert.ok(action);
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
  if(['fresh','busy','ctx','source','permission'].includes(boundary))f.editor().savedReliefShapeEdit?.start();else action.start();
  assert.deepEqual(f.events,[]);assert.equal(f.active.get(),null);
 });
}
for(const boundary of ['document','evaluated','worker','marker','variant'] as const){
 test(`started Shape command loses ownership after ${boundary} changes`,()=>{
  const f=fixture();f.editor().savedReliefShapeEdit!.start();const owns=f.active.get()?.ownsSource;assert.ok(owns);assert.equal(owns(),true);
  if(boundary==='document')f.props.owner.document=()=>({...f.doc});
  if(boundary==='evaluated')f.props.owner.evaluated=()=>({...f.doc});
  if(boundary==='worker')f.props.owner.worker=()=>2;
  if(boundary==='marker')f.props.owner.marker=()=>0;
  if(boundary==='variant')f.props.owner.variant=()=> 'other';
  assert.equal(owns(),false);
 });
}
test('Shape command is absent on a source row and in-place mutation invalidates a captured command',()=>{
 const f=fixture();f.props.model.editNode=1;assert.equal(f.editor().savedReliefShapeEdit,undefined);
 f.props.model.editNode=2;const action=f.editor().savedReliefShapeEdit;assert.ok(action);
 f.doc.parameters.changed=1;action.start();assert.deepEqual(f.events,[]);assert.equal(f.active.get(),null);
});
