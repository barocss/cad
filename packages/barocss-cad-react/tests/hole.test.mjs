/** Public flat Hole lowering only. No native geometry certificate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSource} from './compile.mjs';
const stock=()=>({kind:'extrude',key:'stock',distance:20,children:[{kind:'rectangle',min:[0,0],max:[60,40]}]});
const part=(...children)=>({kind:'part',units:'mm',children});
const model=(extra={})=>part({kind:'hole',key:'bore',center:[30,20],radius:4,children:[stock()],...extra});
const accepted=r=>{assert.equal(r.ok,true,r.error?.message);return r.value;};
test('Hole lowers to the existing native node and preserves omitted defaults and explicit fields',async t=>{
 const {CompositionCompiler}=await loadSource(t,'src/compiler.ts'),c=new CompositionCompiler();
 const a=accepted(c.compile(model()));assert.deepEqual(a.doc.nodes.at(-1),{id:'n2',kind:'hole',parent:{node:1,side:'solid'},center:[30,20],radius:4});assert.equal(a.doc.nodes.length,3);
 const b=accepted(c.compile(model({axis:'x',side:'min',depth:6,center:[-2,0]})));assert.deepEqual(b.doc.nodes.at(-1),{id:'n2',kind:'hole',parent:{node:1,side:'solid'},center:[-2,0],radius:4,axis:'x',side:'min',depth:6});
 assert.deepEqual(accepted(c.compile(model())).doc,a.doc);
});
test('invalid numeric parameters retain the immutable checkpoint and allocate no accepted IDs',async t=>{
 const {CompositionCompiler}=await loadSource(t,'src/compiler.ts'),c=new CompositionCompiler(),prior=accepted(c.compile(model())),sparse=[30,20];delete sparse[0];
 for(const extra of [{center:sparse},{center:[NaN,20]},{center:[30,Infinity]},{center:[30]},{center:[0,0,0]},{radius:0},{radius:-1},{radius:NaN},{radius:Infinity},{depth:0},{depth:-1},{depth:NaN},{depth:Infinity},{axis:'q'},{side:'front'}]){
  const result=c.compile(model(extra));assert.equal(result.ok,false);assert.equal(result.error.code,'INVALID_PARAMETER');assert.equal(result.previous,prior);
 }
 assert.equal(accepted(c.compile(model())),prior);
});
test('Hole uses one scoped solid input and refuses mixed, missing, wrong-kind and cyclic refs',async t=>{
 const {CompositionCompiler}=await loadSource(t,'src/compiler.ts'),c=new CompositionCompiler(),token={},shape={kind:'hole',center:[30,20],radius:4,solid:token};
 const got=accepted(c.compile(part(shape,{kind:'definitions',children:[{...stock(),bind:token}]})));assert.equal(got.doc.nodes.at(-1).parent.node,1);
 for(const [input,code]of [[model({solid:token}),'EXCLUSIVE_INPUT'],[model({children:[]}),'CARDINALITY'],[model({children:[stock(),{...stock(),key:'other'}]}),'CARDINALITY'],[part(shape),'MISSING_REFERENCE'],[model({children:[{kind:'circle',center:[0,0],radius:2}]}),'TYPE'],[part({...shape,bind:token}),'CYCLE']]){
  const result=c.compile(input);assert.equal(result.ok,false);assert.equal(result.error.code,code);
 }
});
