import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import { heldFinishCandidate, heldFinishReplaceable, heldFinishReplacement, type HeldFinish } from '../src/state/heldFinishReplacement';
const finish:Extract<HeldFinish,{kind:'fillet'}>={id:'repair',kind:'fillet',parent:{node:1,side:'solid'},edges:['missing'],radius:1,held:'missing edge',suppressed:true,radii:[{at:[0,0,0],radius:1,atEnd:true},{at:[10,0,0],radius:3,atEnd:true}]};
const edge:DisplayEdge={index:0,faces:[0,1],a:[0,20,10],b:[30,20,10],straight:true,axis:'x',names:['new-edge'],nativeLine:true};
const sig={k:'curve' as const,p:[15,20,10] as [number,number,number],s:30};
const doc=withNode(rectanglePart(30,20,10),finish);
test('explicit replacement preserves radius values and feature identity and assigns candidate endpoint order atomically',()=>{
 const before=structuredClone(doc), result=heldFinishReplacement(doc,2,edge,[edge],sig);assert.ok(result);
 const changed=result.nodes[2];assert.equal(changed.kind,'fillet');if(changed.kind!=='fillet')return;
 assert.equal(changed.id,doc.nodes[2].id);assert.equal(changed.parent,finish.parent);assert.equal(changed.radius,1);
 assert.deepEqual(changed.radii,finish.radii!.map((point,i)=>({...point,at:i?edge.b:edge.a})));
 assert.equal(changed.held,undefined);assert.equal(changed.suppressed,undefined);assert.deepEqual(changed.edges,['new-edge']);assert.equal(changed.sigs?.['new-edge'],sig);
 assert.equal(result.nodes[0],doc.nodes[0]);assert.equal(result.outputs,doc.outputs);assert.deepEqual(doc,before);
 const reverse={...edge,a:edge.b,b:edge.a};const candidate=heldFinishCandidate(finish,reverse,[reverse]);assert.ok('endpoints'in candidate);if('endpoints'in candidate)assert.deepEqual(candidate.endpoints,{start:edge.b,end:edge.a});
});
test('only terminal numeric unshaped two-end laws are offered',()=>{
 assert.ok(heldFinishReplaceable(finish));
 const cases:HeldFinish[]=[{...finish,held:undefined},{...finish,edges:['a','b']},{...finish,section:{kind:'conic',rho:0.5}},{...finish,radius:{parameter:'R'}},{...finish,radii:[]},{...finish,radii:[finish.radii![0]]},{...finish,radii:finish.radii!.map(p=>({...p,atEnd:undefined}))},{...finish,radii:finish.radii!.map(p=>({...p,fraction:0.5}))},{...finish,radii:finish.radii!.map(p=>({...p,radius:{parameter:'R'}}))},{...finish,radii:finish.radii!.map(p=>({...p,radius:NaN}))},{...finish,radii:finish.radii!.map(p=>({...p,radius:0}))},{...finish,radii:finish.radii!.map(p=>({...p,at:[0,0,0]}))}];
 for(const item of cases)assert.equal(heldFinishReplaceable(item),false);
 assert.equal(heldFinishReplacement({...doc,nodes:[...doc.nodes,doc.nodes[0]]},2,edge,[edge],sig),null);
});
test('varying candidates require unique exact unmerged straight finite distinct endpoints',()=>{
 for(const candidate of [{...edge,nativeLine:undefined},{...edge,names:['a','b']},{...edge,names:['a+b']},{...edge,a:[NaN,0,0] as [number,number,number]},{...edge,b:edge.a}])assert.ok('error'in heldFinishCandidate(finish,candidate,[candidate]));
 assert.ok('error'in heldFinishCandidate(finish,edge,[edge,{...edge,index:1}]));
 assert.ok('error'in heldFinishCandidate(finish,{...edge},[edge]));
 assert.ok('error'in heldFinishCandidate(finish,undefined,[edge]));
 const nativeFinish={...edge,nativeLine:undefined,nativeFinishLine:true as const};assert.ok('name'in heldFinishCandidate(finish,nativeFinish,[nativeFinish]));
});
test('constant fillet and chamfer keep their existing unconstrained edge replacement behavior',()=>{
 const constant={...finish,radii:undefined}, curved={...edge,nativeLine:undefined,straight:false};
 for(const node of [constant,{id:'chamfer',kind:'chamfer' as const,parent:finish.parent,edges:['missing'],distance:2,held:'missing edge'}]){
  assert.ok(heldFinishReplaceable(node));const source=withNode(rectanglePart(30,20,10),node),next=heldFinishReplacement(source,2,curved,[curved],sig);assert.ok(next);assert.equal(next.nodes[2].kind,node.kind);assert.ok('edges'in next.nodes[2]);if('edges'in next.nodes[2])assert.deepEqual(next.nodes[2].edges,['new-edge']);
 }
});
