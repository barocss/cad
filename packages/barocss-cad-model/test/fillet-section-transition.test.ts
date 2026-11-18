import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { editFields } from '../src/app/editFields';
import { editCommand } from '../src/app/editCommand';
import { evaluateDoc } from '../src/engine/evaluate';
import { signaturesOf } from '../src/engine/rematch';
import { toSig } from '../src/engine/references';
import type { Ctx } from '../src/app/commands';
function fixture(){const base=rectanglePart(40,30,10),r=evaluateDoc(base,1);assert.ok(r.ok);const name='n1.side0|n1.top';return withNode(base,{kind:'fillet',parent:{node:1,side:'solid'},edges:[name],radius:4,sigs:{[name]:toSig(signaturesOf(r.bodies[0]).edges.get(name)!)}});}
function field(doc:StudioDoc){const f=editFields(doc.nodes,2).find(f=>f.key==='filletSection');assert.ok(f?.kind==='choice');return f;}
test('section draft keeps its radius and signed source edge, uses creation default and deletes section on Circular',()=>{
 const doc=fixture(),saved=structuredClone(doc),f=field(doc);assert.equal(f.get(doc.nodes),'circular');
 const next=f.set(doc.nodes,'conic');assert.deepEqual(next[2],{...doc.nodes[2],section:{kind:'conic',rho:.5}});assert.equal(next[0],doc.nodes[0]);assert.equal(next[1],doc.nodes[1]);assert.deepEqual(f.set(next,'circular'),doc.nodes);assert.deepEqual(f.set(doc.nodes,'g2'),doc.nodes);assert.deepEqual(doc,saved);
});
test('special, unsigned, shared, downstream and scoped documents do not offer a section switch',()=>{
 const doc=fixture(),f=field(doc);
 for(const [i,patch] of [[0,{plane:{}}],[1,{draft:1}],[2,{radii:[]}],[2,{section:{kind:'g2',tension:.5}}],[2,{radius:{parameter:'R'}}],[2,{sigs:{}}],[2,{sigs:{'n1.side0|n1.top':{n:2}}}],[2,{held:{}}],[2,{edges:['a','b']}]] as [number,object][]){const nodes=doc.nodes.map((n,k)=>k===i?{...n,...patch} as typeof n:n);assert.equal(editFields(nodes,2).some(f=>f.key==='filletSection'),false);assert.deepEqual(f.set(nodes,'conic'),nodes);}
 const nodes=[...doc.nodes,doc.nodes[0]];assert.equal(editFields(nodes,2).some(f=>f.key==='filletSection'),false);assert.deepEqual(f.set(nodes,'conic'),nodes);
 for(const scope of [{direct:{}},{instances:[{}]}])assert.equal(editFields(doc.nodes,2,{},undefined,{doc:scope as StudioDoc}).some(f=>f.key==='filletSection'),false);
});
test('HUD excludes section transitions but preserves constant radius edits',()=>{
 const doc=fixture(),command=editCommand(2,doc.nodes,doc);assert.ok(command?.build&&command.fields&&command.defaults);const ctx:Ctx={doc,bodies:[],selection:{faces:[],edges:[],bodies:[]}};
 assert.equal(command.fields(ctx).some(f=>f.key==='filletSection'),false);assert.deepEqual(command.build(ctx,{...command.defaults(ctx),filletSection:'conic',r:3}).nodes[2],{...doc.nodes[2],radius:3});
});
