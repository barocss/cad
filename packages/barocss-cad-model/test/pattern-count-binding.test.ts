import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields, type BindableField } from '../src/app/editFields';
import type { ModelNode } from '../src/engine/doc';
const parameters = { Copies: 4, Spacing: 35, Pivot: 3 };
const parent = { node: 1, side: 'solid' as const };
const linear: ModelNode = { id: 'n2', kind: 'linear-pattern', parent, axis: 'x', spacing: 30, count: 3 };
function circular(axis: 'x'|'y'|'z'): ModelNode {
 return { id:'n2',kind:'circular-pattern',parent,axis,count:3,angle:axis==='z'?120:90,...(axis==='z'?{span:360,pivot:[0,0,0] as [number,number,number]}:{}) };
}
function field(nodes: ModelNode[], key: string, params: Record<string,number>|undefined = parameters) {
 const f=editFields(nodes,0,params).find(f=>f.key===key);assert.ok(f?.kind==='number');return f;
}
test('ordinary body-pattern Count is number-only with or without parameters, unlike supported Dim fields',()=>{
 for(const node of [linear,circular('x'),circular('y'),circular('z')]) {
  const nodes=[node],before=structuredClone(nodes);
  for(const params of [parameters,{},undefined]) {
   const f=editFields(nodes,0,params).find(f=>f.key==='count');assert.ok(f?.kind==='number');
   assert.equal('bind'in f,false);assert.equal('param'in f,false);assert.equal(f.get(nodes),3);
   const next=f.set(nodes,4);assert.equal(f.get(next),4);
   assert.deepEqual(next,[{...node,count:4,...(node.kind==='circular-pattern'&&node.axis==='z'?{angle:90}:{})}]);
  }
  assert.deepEqual(nodes,before);
 }
});
test('circular Count ranges and authored/legacy spread calculations remain numeric',()=>{
 for(const axis of ['x','y','z'] as const) {
  const nodes=[circular(axis)],f=field(nodes,'count');assert.deepEqual(f.integerRange,{min:2,max:axis==='z'?36:4});
 }
 const z=circular('z');assert.equal(z.kind,'circular-pattern');if(z.kind!=='circular-pattern')return;
 const partial=[{...z,span:270,angle:135}];assert.deepEqual(field(partial,'count').set(partial,4),[{...partial[0],count:4,angle:90}]);
 const {span,...legacy}=z;assert.equal(span,360);const nodes=[legacy];assert.deepEqual(field(nodes,'count').set(nodes,4),[{...legacy,count:4,angle:90}]);
 assert.equal('bind'in field([z],'span'),false);
});
test('Linear Spacing and Circular Z pivot retain binding getters, parameter identity and immutability',()=>{
 for(const [node,key,name,value] of [[linear,'spacing','Spacing',35],[circular('z'),'axisAt0','Pivot',3]] as const) {
  const nodes:ModelNode[]=[node],before=structuredClone(nodes),f=field(nodes,key) as BindableField;
  assert.equal(typeof f.bind,'function');const bound=f.bind(nodes,name);assert.ok(bound);
  assert.equal(f.get(bound),value);assert.equal(f.param(bound),name);
  const changed=field(bound,key,{...parameters,[name]:value+2}) as BindableField;
  assert.equal(changed.get(bound),value+2);assert.equal(changed.param(bound),name);
  assert.equal(f.bind(nodes,'missing'),null);assert.deepEqual(nodes,before);
 }
});
test('linear span and feature-cut Count policies are not broadened by the body-pattern exclusion',()=>{
 const span:ModelNode={kind:'linear-span-pattern',parent,axis:'x',span:60,count:3};
 assert.equal('bind'in field([span],'count'),false);assert.equal('bind'in field([span],'span'),false);
 const cut:ModelNode={kind:'linear-feature-pattern',parent,axis:'x',spacing:30,count:3};
 const f=field([cut],'count') as BindableField;assert.equal(typeof f.bind,'function');assert.equal(f.bind([cut],'Copies'),null);
 assert.deepEqual(f.set([cut],4),[{...cut,count:4}]);
});
