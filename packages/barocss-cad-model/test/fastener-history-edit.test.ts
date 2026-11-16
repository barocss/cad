import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { commands, patchValues, type Ctx } from '../src/app/commands';
import { fastenerHistoryEdit, editCommand } from '../src/app/editCommand';
import { evaluateDoc } from '../src/engine/evaluate';
import { withSampleRows } from './person-file';
const ctx:Ctx={doc:withSampleRows(emptyDoc()),bodies:[],selection:{faces:[],edges:[],bodies:[]}},create=commands.find(c=>c.id==='fastener')!;
function fixture(){return create.build!(ctx,{...create.defaults!(ctx),size:'M8',length:'25',joint:'nut',grip:8,holeD:9,holeDepth:8,through:'1',x:20,y:10,z:8});}
const open=(doc:StudioDoc,index=doc.nodes.length-1)=>fastenerHistoryEdit(index,doc.nodes,doc);

test('every exact saved Fastener member opens the same complete owner and atomically rebuilds it',()=>{
 const doc=fixture(),snapshot=structuredClone(doc),last=doc.nodes.length-1;
 for(let i=0;i<=last;i++){
  const result=open(doc,i);assert.ok(result);assert.equal(result.ownerIndex,last);assert.equal(result.startIndex,0);
  const c={...ctx,doc};assert.equal(result.command.label,'Edit Fastener');assert.equal(result.command.available(c).ok,true);
  assert.deepEqual(result.command.defaults!(c),open(doc)!.command.defaults!(c));
 }
 const command=open(doc,0)!.command,c={...ctx,doc},changed=command.build!(c,{...command.defaults!(c),length:'30'});
 const evaluated=evaluateDoc(changed,1);assert.ok(evaluated.ok);assert.equal(evaluated.bodies.length,3);
 const final=changed.nodes.at(-1)!;assert.ok('made' in final&&final.made);assert.equal(final.made.values.length,'30');
 assert.deepEqual(doc,snapshot);
});

test('partial, malformed, changed or overlapping saved groups never gain a History command',()=>{
 const doc=fixture(),last=doc.nodes.length-1,owner=doc.nodes[last];assert.ok('made' in owner&&owner.made);
 assert.equal(open({...doc,nodes:doc.nodes.slice(0,-1)}),null);
 for(const count of [0,-1,1.5,NaN,Infinity,last+2]){
  const bad:StudioDoc={...doc,nodes:doc.nodes.map((n,i)=>i===last?{...owner,made:{...owner.made!,nodes:count}}:n)};assert.equal(open(bad,0),null);
 }
 const modified={...doc,nodes:doc.nodes.map((n,i)=>i===1&&n.kind==='extrude'?{...n,height:123}:n)};assert.equal(open(modified,0),null);
 const nested={...doc,nodes:doc.nodes.map((n,i)=>i===1?{...n,made:{...owner.made!,nodes:2}}:n)};assert.equal(open(nested,0),null);
 assert.equal(fastenerHistoryEdit(-1,doc.nodes,doc),null);assert.equal(fastenerHistoryEdit(0.5,doc.nodes,doc),null);
 assert.equal(open({...doc,fastenerSizes:undefined}),null);
 const thread=create.build!(ctx,{...create.defaults!(ctx),size:'M8',length:'20',model:'modelled'});assert.equal(open(thread),null,'terminal thread recognition remains outside the existing shapeEdit scope');
});

test('legacy incompatible hole evidence can open for repair, but unchanged Apply remains refused',()=>{
 const doc=fixture(),last=doc.nodes.length-1,owner=doc.nodes[last];assert.ok('made' in owner&&owner.made);
 const legacy={...doc,nodes:doc.nodes.map((n,i)=>i===last?{...owner,made:{...owner.made!,values:{...owner.made!.values,holeD:6.6}}}:n)};
 const edit=open(legacy,0)!.command,c={...ctx,doc:legacy},values=edit.defaults!(c);assert.equal(values.holeD,6.6);
 assert.throws(()=>edit.build!(c,values),/FASTENER_HOLE_FIT/);
 const repaired=edit.build!(c,{...values,size:'M6'});assert.ok(evaluateDoc(repaired,1).ok);
});

test('captured ownership refuses replaced nodes or size rows, while equivalent node-array views remain usable',()=>{
 const doc=fixture(),command=open(doc)!.command,c={...ctx,doc},values=command.defaults!(c);
 assert.equal(command.available({...c,doc:{...doc,nodes:[...doc.nodes]}}).ok,true);
 for(const changed of [{...doc,nodes:structuredClone(doc.nodes)},{...doc,fastenerSizes:structuredClone(doc.fastenerSizes)}]){
  assert.equal(command.available({...c,doc:changed}).ok,false);assert.throws(()=>command.build!({...c,doc:changed},values),/source changed/);
 }
});


test('History fixes the existing part ownership and refuses an injected assembly insert',()=>{
 const doc=fixture(),snapshot=structuredClone(doc),command=open(doc)!.command,c={...ctx,doc},values=command.defaults!(c);
 assert.ok(command.fields);assert.equal(command.fields(c,values).some(field=>field.key==='insert'),false);
 assert.throws(()=>command.build!(c,{...values,insert:'instance'}),/current part/);
 assert.deepEqual(doc,snapshot);
 const edited=command.build!(c,{...values,insert:'part',length:'30'});assert.equal(edited.instances,doc.instances);assert.ok(edited.nodes.length>0);assert.ok(evaluateDoc(edited,1).ok);
});


test('saved fit is an unchecked snapshot in grouped and direct History, not a current hole measurement',()=>{
 const doc=fixture(),c={...ctx,doc},last=doc.nodes.length-1,group=open(doc)!.command,direct=editCommand(last,doc.nodes,doc)!;
 const original=structuredClone(doc);
 for(const edit of [group,direct]){
  const values=edit.defaults!(c),steps=edit.steps!(c,values),saved=steps.find(s=>s.label==='Saved hole');
  assert.ok(saved);assert.equal(saved.done,false);assert.match(saved.text,/Ø9: clearance for M8/);
  assert.match(saved.text,/Snapshot only, not linked to the current hole/);assert.match(saved.text,/Axis at X\/Y and Seat at Z/);
  assert.equal(steps.some(s=>s.label==='Hole'),false);
  const same=patchValues(edit,c,values,{x:'20'});assert.ok(edit.steps!(c,same).some(s=>s.label==='Saved hole'));
  const moved=patchValues(edit,c,values,{x:44});assert.equal(moved.holeD,0);assert.equal(edit.steps!(c,moved).some(s=>s.label==='Saved hole'),false);
  const tight={...values,holeD:6.6};assert.equal(edit.steps!(c,tight).find(s=>s.label==='Saved hole')?.done,false);assert.throws(()=>edit.build!(c,tight),/FASTENER_HOLE_FIT/);
 }
 const live=create.steps!(ctx,group.defaults!(c));assert.equal(live.find(s=>s.label==='Hole')?.done,true);assert.equal(live.some(s=>s.label==='Saved hole'),false);
 assert.deepEqual(doc,original);
});
