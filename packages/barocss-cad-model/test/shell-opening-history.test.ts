import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { editFields } from '../src/app/editFields';
import { editCommand } from '../src/app/editCommand';
import type { Ctx } from '../src/app/commands';
const fixture = () => withNode(rectanglePart(40,30,20), {kind:'shell',parent:{node:1,side:'solid'},thickness:2,open:[]});
function field(doc:StudioDoc) { const f=editFields(doc.nodes,2).find(f=>f.key==='shellOpening');assert.ok(f?.kind==='choice');return f; }
test('opening draft changes only open and retains signatures until native History proof',()=>{
 const doc=fixture(),before=structuredClone(doc),f=field(doc);assert.equal(f.get(doc.nodes),'closed');
 const sides = { top: 'top', bottom: 'bottom', left: 'side3', right: 'side1', front: 'side0', back: 'side2' };
 for (const [mode, suffix] of Object.entries(sides)) {
   const nodes = f.set(doc.nodes, mode);
   assert.equal(nodes[0], doc.nodes[0]); assert.equal(nodes[1], doc.nodes[1]);
   assert.deepEqual(nodes[2], { ...doc.nodes[2], open: [`n1.${suffix}`] });
   assert.equal(f.get(nodes), mode);
   assert.deepEqual(f.set(nodes, 'closed'), doc.nodes);
 }
 assert.deepEqual(f.set(doc.nodes,'side'),doc.nodes);assert.deepEqual(doc,before);
});
test('special or downstream Shells never expose or accept a captured opening setter',()=>{
 const doc=fixture(),f=field(doc);
 for(const [i,patch] of [[0,{plane:{}}],[0,{association:{}}],[1,{draft:1}],[1,{height:{parameter:'H'}}],[2,{held:{}}],[2,{open:['n1.side4']}],[2,{open:['n1.top','n1.bottom']}],[2,{thickness:{parameter:'T'}}],[2,{made:{}}]] as [number,object][]){
 const nodes=doc.nodes.map((n,k)=>k===i?{...n,...patch} as typeof n:n);assert.equal(editFields(nodes,2).some(f=>f.key==='shellOpening'),false);assert.deepEqual(f.set(nodes,'top'),nodes);
 }
 const nodes=[...doc.nodes,doc.nodes[0]];assert.equal(editFields(nodes,2).some(f=>f.key==='shellOpening'),false);assert.deepEqual(f.set(nodes,'top'),nodes);
});
test('drag HUD preserves numeric Wall edits without injecting an opening change',()=>{
 const doc=fixture(),command=editCommand(2,doc.nodes,doc);assert.ok(command?.build&&command.fields&&command.defaults);
 const ctx:Ctx={doc,bodies:[],selection:{faces:[],edges:[],bodies:[]}};
 assert.equal(command.fields(ctx).some(f=>f.key==='shellOpening'),false);
 const next=command.build(ctx,{...command.defaults(ctx),shellOpening:'top',t:3});assert.deepEqual(next.nodes[2],{...doc.nodes[2],thickness:3});
});
test('document scopes with direct geometry or instances hide opening options',()=>{
 const doc=fixture();
 for(const scope of [{direct:{}},{instances:[{}]}])assert.equal(editFields(doc.nodes,2,{},undefined,{doc:scope as StudioDoc}).some(f=>f.key==='shellOpening'),false);
});
