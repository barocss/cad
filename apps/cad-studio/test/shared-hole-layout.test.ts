import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedHoleLayoutCommand, sharedHoleLayoutPair } from '../src/app/sharedHoleLayout';
import { rectanglePart, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { editFields } from '@barocss/cad-model/app/editFields';
import type { Ctx } from '@barocss/cad-model/app/commands';

function fixture(circle=false) {
 const pattern=circle?{count:4,about:[20,20] as [number,number]}:{count:3,step:[10,0] as [number,number]};
 const center: [number,number]=circle?[28,20]:[10,10];
 let doc=withNode(rectanglePart(40,40,12),{kind:'hole',parent:{node:1,side:'solid'},center,radius:2,pattern});
 doc=withNode(doc,{kind:'hole',parent:{node:2,side:'solid'},center,radius:3,depth:3,pattern});
 return doc;
}
const context=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{faces:[],edges:[],bodies:[]}});

test('only compatible explicit pair is offered; existing independent fields remain independent',()=>{
 const doc=fixture(),pair=sharedHoleLayoutPair(doc.nodes,3)!;assert.ok(pair);assert.equal(sharedHoleLayoutPair(doc.nodes,2)?.second,pair.second);
 const step=editFields(doc.nodes,3).find(f=>f.key==='step1');assert.ok(step?.kind==='number');if(step.kind!=='number')return;
 const independent=step.set(doc.nodes,2);assert.equal(independent[2],doc.nodes[2]);assert.equal(sharedHoleLayoutPair(independent,3),null);
 for(const patch of [{held:'missing source'},{pattern:{count:NaN,step:[10,0] as [number,number]}},{suppressed:true as const},{center:[11,10] as [number,number]},{axis:'x' as const},{side:'min' as const},{face:'other'},{radius:1},{depth:undefined}]){
  const nodes=doc.nodes.map((n,i)=>i===3?{...pair.second,...patch}:n);assert.equal(sharedHoleLayoutPair(nodes,3),null);
 }
 const bound=doc.nodes.map((n,i)=>i===2?{...pair.first,center:[{parameter:'x'},10] as [{parameter:string},number]}:n);assert.equal(sharedHoleLayoutPair(bound,2),null);
});

test('row and circular shared builds preserve individual sizes and evaluate as one atomic valid solid',()=>{
 for(const circle of [false,true]){
  const doc=fixture(circle),pair=sharedHoleLayoutPair(doc.nodes,3)!,ctx=context(doc),cmd=sharedHoleLayoutCommand(doc,pair);
  const values={...cmd.defaults!(ctx),c0:Number(pair.first.center[0])+1,count:2,...(circle?{about1:19}:{step1:2})};const next=cmd.build!(ctx,values);
  const a=next.nodes[2],b=next.nodes[3];assert.equal(a.kind,'hole');assert.equal(b.kind,'hole');if(a.kind!=='hole'||b.kind!=='hole')return;
  assert.deepEqual(a.center,b.center);assert.equal(a.center[0],Number(pair.first.center[0])+1);assert.equal(a.center[1],pair.first.center[1]);assert.deepEqual(a.pattern,b.pattern);assert.equal(a.radius,2);assert.equal(b.radius,3);assert.equal(b.depth,3);
  assert.deepEqual(next,{...doc,nodes:doc.nodes.map((n,i)=>i===2?{...pair.first,center:a.center,pattern:a.pattern}:i===3?{...pair.second,center:a.center,pattern:a.pattern}:n)});
  const result=evaluateDoc(next,1);assert.ok(result.ok,result.ok?'':result.error.detail);if(!result.ok)return;
  assert.equal(result.bodies.length,1);assert.ok(Math.abs(result.bodies[0].volume!-(19200-2*Math.PI*(4*12+5*3)))<1e-6,JSON.stringify({circle,volume:result.bodies[0].volume!,want:19200-2*Math.PI*(4*12+5*3)}));
  assert.equal(cmd.build!(ctx,cmd.defaults!(ctx)),doc,'no-op returns original owner');
 }
});

test('stale owners, changed identities, noninteger counts and spacing inside the wider counterbore are refused',()=>{
 const doc=fixture(),pair=sharedHoleLayoutPair(doc.nodes,3)!,ctx=context(doc),cmd=sharedHoleLayoutCommand(doc,pair);
 assert.equal(sharedHoleLayoutCommand(doc,pair,()=>false).available(ctx).ok,false);
 assert.throws(()=>cmd.build!({...ctx,doc:{...doc,nodes:doc.nodes.map(n=>({...n}))}},cmd.defaults!(ctx)),/source features changed/);
 for(const count of [0,1.5,65])assert.throws(()=>cmd.build!(ctx,{...cmd.defaults!(ctx),count}),/whole number/);
 assert.throws(()=>cmd.build!(ctx,{...cmd.defaults!(ctx),step0:5}),/longer than the hole diameter/);
 const circular=fixture(true),other=sharedHoleLayoutCommand(circular,sharedHoleLayoutPair(circular.nodes,3)!);const c=context(circular);
 assert.throws(()=>other.build!(c,{...other.defaults!(c),about0:28,about1:20}),/away from the circle centre/);
});


test('shared layout drops downstream creation snapshots spanning the pair but preserves unrelated snapshots',()=>{
 const base=fixture();
 const doc=withNode(base,{kind:'hole',parent:{node:3,side:'solid'},center:[35,35],radius:1,
  made:{command:'legacy-composite',values:{copies:3},nodes:3}});
 const pair=sharedHoleLayoutPair(doc.nodes,3)!,ctx=context(doc),cmd=sharedHoleLayoutCommand(doc,pair);
 assert.equal(cmd.build!(ctx,cmd.defaults!(ctx)),doc,'no-op keeps every snapshot');
 const next=cmd.build!(ctx,{...cmd.defaults!(ctx),c0:11});
 const downstream=doc.nodes[4];assert.ok('made' in downstream && downstream.made);
 assert.equal('made' in next.nodes[4],false,'snapshot spanning the edited pair is invalidated');
 if(!('made' in downstream))return;
 const {made,...unchanged}=downstream;assert.ok(made);assert.deepEqual(next.nodes[4],unchanged);
 assert.equal(next.nodes[1],doc.nodes[1],'unrelated upstream creation snapshot is preserved');
 assert.deepEqual(doc.nodes[4],downstream,'source document is not mutated');
});
