import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { commands, patchValues, type Ctx, type Values } from '../src/app/commands';
import { editCommand } from '../src/app/editCommand';
import { fastenerNodes, withFastenerInstance } from '../src/app/fasteners';
import { withSampleRows } from './person-file';
const doc=withSampleRows(emptyDoc()),ctx:Ctx={doc,bodies:[],selection:{faces:[],edges:[],bodies:[]}},cmd=commands.find(c=>c.id==='fastener')!;
const values=(patch:Values={}):Values=>({...cmd.defaults!(ctx),size:'M8',length:'20',joint:'free',grip:8,holeD:6.6,holeDepth:8,through:'1',x:32,y:16,z:8,...patch});
const native=(d:StudioDoc)=>{const e=evaluateDoc(d,1);assert.ok(e.ok,JSON.stringify(e));return e.bodies;};

test('known tight holes refuse direct and assembly bolt/screw creation without changing documents',()=>{
 const snapshot=structuredClone(doc);
 for(const kind of ['hex-bolt','socket-screw','csk-screw'])for(const joint of ['free','nut','tapped'])for(const model of ['cosmetic','modelled']){
  const v=values({kind,joint,model});
  for(const build of [()=>fastenerNodes(doc,v),()=>withFastenerInstance(doc,v),()=>cmd.build!(ctx,v)])assert.throws(build,/FASTENER_HOLE_FIT/);
 }
 assert.deepEqual(doc,snapshot);
});

test('tap-sized, clearance and no-information placement preserve the existing native geometry',()=>{
 for(const patch of [{joint:'tapped',holeD:6.8},{joint:'nut',holeD:9},{joint:'free',holeD:0}]){
  const v=values(patch),a=native(cmd.build!(ctx,v)),b=native(cmd.build!(ctx,{...v,holeD:0}));
  assert.deepEqual(a.map(b=>b.volume),b.map(b=>b.volume));assert.deepEqual(a.map(b=>b.mesh.positions),b.map(b=>b.mesh.positions));
 }
 const unknown=values();delete unknown.holeD;assert.ok(native(cmd.build!(ctx,unknown)).length);
 for(const kind of ['hex-nut','washer'])assert.ok(native(cmd.build!(ctx,values({kind}))).length);
});

function legacy(){
 const built=cmd.build!(ctx,values({holeD:0})),last=built.nodes.length-1,top=built.nodes[last];
 assert.ok('made' in top&&top.made);
 const bad:StudioDoc={...built,nodes:built.nodes.map((n,i)=>i===last?{...top,made:{...top.made!,values:{...top.made!.values,holeD:6.6}}}:n)};
 return {bad,last};
}
test('legacy tight-hole history is recognized exactly, but every ordinary rebuild still enforces fit',()=>{
 const {bad,last}=legacy(),snapshot=structuredClone(bad),edit=editCommand(last,bad.nodes,bad);assert.ok(edit);assert.equal(edit.label,'Edit Fastener');
 const c={...ctx,doc:bad},v=edit.defaults!(c);assert.equal(v.holeD,6.6);assert.equal(v.holeDepth,8);
 assert.throws(()=>edit.build!(c,v),/FASTENER_HOLE_FIT/);
 assert.ok(native(edit.build!(c,{...v,size:'M6'})).length);
 const modified={...bad,nodes:bad.nodes.map((n,i)=>i===1&&n.kind==='extrude'?{...n,height:(n.height as number)+1}:n)};
 assert.notEqual(editCommand(last,modified.nodes,modified)?.label,'Edit Fastener','the replay exception does not hide authored geometry changes');
 assert.deepEqual(bad,snapshot);
});

test('manual position edits clear placement evidence, while a simultaneous new hole pick retains it',()=>{
 const v=values(),snapshot={...v};
 for(const axis of ['x','y','z']){
  const moved=patchValues(cmd,ctx,v,{[axis]:99});assert.deepEqual([moved.holeD,moved.holeDepth,moved.through],[0,0,'0']);
  assert.ok(native(cmd.build!(ctx,moved)).length);
 }
 const picked=patchValues(cmd,ctx,v,{x:10,holeD:6.6});assert.equal(picked.holeD,6.6);assert.equal(picked.holeDepth,8);assert.equal(picked.size,'M6');
 const free=cmd.place!(v,[0,0,0],[0,0,1]);assert.deepEqual([free.holeD,free.holeDepth,free.through],[0,0,'0']);
 const {bad,last}=legacy(),edit=editCommand(last,bad.nodes,bad)!;
 const moved=patchValues(edit,{...ctx,doc:bad},edit.defaults!({...ctx,doc:bad}),{x:99});assert.ok(native(edit.build!({...ctx,doc:bad},moved)).length);
 assert.deepEqual(v,snapshot);
});


test('same numeric or string coordinates never discard hole evidence, including legacy History',()=>{
 const v=values();
 const patches:Values[]=[{x:32},{x:'32'},{y:16},{z:'8'}];
 for(const patch of patches){
  const same=patchValues(cmd,ctx,v,patch);
  assert.deepEqual([same.holeD,same.holeDepth,same.through],[6.6,8,'1']);
  assert.throws(()=>cmd.build!(ctx,same),/FASTENER_HOLE_FIT/);
 }
 const unknown=cmd.derive!(ctx,{...v,x:44},['x']);assert.equal(unknown.holeD,6.6,'without previous values no movement is inferred');
 const moved=patchValues(cmd,ctx,v,{x:44});assert.equal(moved.holeD,0);assert.ok(native(cmd.build!(ctx,moved)).length);
 const {bad,last}=legacy(),edit=editCommand(last,bad.nodes,bad)!;const c={...ctx,doc:bad};
 const same=patchValues(edit,c,edit.defaults!(c),{x:'32'});assert.equal(same.holeD,6.6);assert.throws(()=>edit.build!(c,same),/FASTENER_HOLE_FIT/);
});


test('clearing then restoring a coordinate retains fit evidence', () => {
 const v = values();
 for (const blank of ['', '   ']) {
  const empty = patchValues(cmd, ctx, v, { x: blank });
  assert.equal(empty.holeD, 6.6);
  const restored = patchValues(cmd, ctx, empty, { x: '32' });
  assert.equal(restored.holeD, 6.6);
  assert.throws(() => cmd.build!(ctx, restored), /FASTENER_HOLE_FIT/);
 }
});
