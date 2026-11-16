import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode } from '../src/engine/doc';
import { commands, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { evaluateDoc } from '../src/engine/evaluate';
test('Keyway history edits dimensions without changing bore ownership', () => {
 const c=commands.find(c=>c.id==='tube')!, ctx:Ctx={doc:emptyDoc(),bodies:[],selection:{faces:[],edges:[],bodies:[]}};
 const tube=c.build!(ctx,{...c.defaults!(ctx),r:20,ri:10,h:22});
 const index=tube.nodes.length, parent={node:index-1,side:'solid' as const};
 const doc=withNode(tube,{kind:'keyway',parent,face:`n${index-1}.hole0.side0`,width:6,depth:2.8});
 let nodes=doc.nodes; const fields=editFields(nodes,index);
 for(const [key,value] of [['b',7],['t2',3.4],['angle',90]] as const){
  const field=fields.find(f=>f.key===key); assert.ok(field?.kind==='number'); nodes=field.set(nodes,value); assert.equal(field.get(nodes),value);
  const r=evaluateDoc({...doc,nodes},1); assert.ok(r.ok,r.ok?'':r.error.detail); assert.ok(r.bodies[0].volume!>0);
  assert.deepEqual(nodes.slice(0,index),tube.nodes); assert.deepEqual((nodes[index] as typeof doc.nodes[number] & {parent:unknown}).parent,parent);
 }
 const angle=fields.find(f=>f.key==='angle'); assert.ok(angle?.kind==='number'); assert.equal('angle' in angle.set(nodes,0)[index],false);
});
