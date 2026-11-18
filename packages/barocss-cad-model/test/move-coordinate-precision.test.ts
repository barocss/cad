import test from 'node:test';
import assert from 'node:assert/strict';
import { commands, cornerOf, type Ctx, type Values } from '../src/app/commands';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
const move=commands.find(c=>c.id==='move')!;
function context(offset?:[number,number,number]):Ctx {
 let doc=rectanglePart(10,6,4);
 if(offset)doc=withNode(doc,{kind:'translate',parent:{node:1,side:'solid'},offset});
 const r=evaluateDoc(doc,0);assert.ok(r.ok);
 return {doc,bodies:r.bodies,selection:{bodies:[0],faces:[],edges:[]}};
}
function derive(ctx:Ctx,v:Values,changed:string[]){return move.derive!(ctx,v,changed);}
function native(doc:StudioDoc){const r=evaluateDoc(doc,1);assert.ok(r.ok);return r.bodies[0];}
function close(a:number,b:number){assert.ok(Math.abs(a-b)<1e-10,`${a} vs ${b}`);}
test('explicit To coordinate preserves sub-micron digits instead of imposing a 0.001 mm grid',()=>{
 const ctx=context(),v=derive(ctx,{...move.defaults!(ctx),ax:1.234567},['ax']);
 assert.equal(v.x,1.234567);assert.equal(v.ax,1.234567);
 const doc=move.build!(ctx,v),n=doc.nodes.at(-1)!;assert.ok(n.kind==='translate');assert.equal(n.offset[0],1.234567);
 close(native(doc).mesh.bounds.min[0],1.234567);
});
test('defaults retain current display bounds and zero offsets without moving the body',()=>{
 for(const ctx of [context(),context([.123456789,-.234567891,.345678912])]){
  const v=move.defaults!(ctx),min=ctx.bodies[0].mesh.bounds.min;
  assert.deepEqual([v.x,v.y,v.z],[0,0,0]);assert.deepEqual([v.ax,v.ay,v.az],min);
  assert.deepEqual(derive(ctx,v,[]),v);
 }
});
test('positive and negative To XYZ use the current display corner without rounding either operand',()=>{
 const ctx=context([.123456789,-.234567891,.345678912]),min=ctx.bodies[0].mesh.bounds.min;
 for(const target of [[1.234567,-2.345678,3.456789],[-1.234567,2.345678,-3.456789]]){
  const v=derive(ctx,{...move.defaults!(ctx),ax:target[0],ay:target[1],az:target[2]},['ax','ay','az']);
  assert.deepEqual([v.x,v.y,v.z],target.map((x,i)=>x-min[i]));
  const b=native(move.build!(ctx,v));target.forEach((x,i)=>close(b.mesh.bounds.min[i],x));close(b.volume!,240);
 }
});
test('explicit Delta values remain unchanged and paired To fields retain full binary64 arithmetic',()=>{
 const ctx=context([.123456789,-.234567891,.345678912]),min=ctx.bodies[0].mesh.bounds.min,delta=[.0001234567,-.0002345678,.0003456789];
 const v=derive(ctx,{...move.defaults!(ctx),x:delta[0],y:delta[1],z:delta[2]},['x','y','z']);
 assert.deepEqual([v.x,v.y,v.z],delta);assert.deepEqual([v.ax,v.ay,v.az],delta.map((x,i)=>min[i]+x));
 const n=move.build!(ctx,v).nodes.at(-1)!;assert.ok(n.kind==='translate');assert.deepEqual(n.offset,delta);
});
test('repeated derivation is stable and never mutates command input or source document',()=>{
 const ctx=context(),before=structuredClone(ctx.doc),input={...move.defaults!(ctx),ax:-1.234567},saved=structuredClone(input);
 const first=derive(ctx,input,['ax']);let v=first;for(let i=0;i<10;i++)v=derive(ctx,v,[]);
 assert.deepEqual(v,first);assert.equal(v.ax,-1.234567);assert.equal(v.x,-1.234567);
 move.build!(ctx,v);assert.deepEqual(input,saved);assert.deepEqual(ctx.doc,before);
});
test('Move offset, native box mass and display corner survive encoded file read',async()=>{
 const ctx=context(),target=[1.234567,-2.345678,3.456789];
 const v=derive(ctx,{...move.defaults!(ctx),ax:target[0],ay:target[1],az:target[2]},['ax','ay','az']),doc=move.build!(ctx,v);
 const opened=await readStudioFile(encodeStudioFile(doc));assert.ok('doc' in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(doc)));
 const n=opened.doc.nodes.at(-1)!;assert.ok(n.kind==='translate');assert.deepEqual(n.offset,target);
 const b=native(opened.doc);close(b.volume!,240);target.forEach((x,i)=>{close(b.mesh.bounds.min[i],x);close(b.centroid![i],x+[5,3,2][i]);});
});
test('Delta-only build already preserves explicit digits and leaves source nodes unchanged',()=>{
 const ctx=context(),before=structuredClone(ctx.doc),delta=[.0001234567,-.0002345678,.0003456789];
 const v=derive(ctx,{...move.defaults!(ctx),x:delta[0],y:delta[1],z:delta[2]},['x','y','z']);
 assert.deepEqual([v.x,v.y,v.z],delta);
 const doc=move.build!(ctx,v),n=doc.nodes.at(-1)!;assert.ok(n.kind==='translate');assert.deepEqual(n.offset,delta);
 const b=native(doc);delta.forEach((x,i)=>close(b.mesh.bounds.min[i],x));assert.deepEqual(ctx.doc,before);
});

test('corner is copied and nonfinite input remains a native refusal, not a zero move',()=>{
 const ctx=context(),before=structuredClone(ctx.doc),original=[...ctx.bodies[0].mesh.bounds.min];
 const corner=cornerOf(ctx.bodies[0]);corner[0]=99;assert.deepEqual(ctx.bodies[0].mesh.bounds.min,original);
 assert.deepEqual(cornerOf(null),[0,0,0]);assert.deepEqual(cornerOf(undefined),[0,0,0]);
 for(const value of [NaN,Infinity,-Infinity])for(const key of ['x','ax']){
  const v=derive(ctx,{...move.defaults!(ctx),[key]:value},[key]);assert.equal(Number.isFinite(Number(v.x)),false);
  const result=evaluateDoc(move.build!(ctx,v),1);assert.equal(result.ok,false);
 }
 assert.deepEqual(ctx.doc,before);
});
