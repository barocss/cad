import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode } from '@barocss/cad-model/engine/doc';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import { toSig } from '@barocss/cad-model/engine/references';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { heldFinishRadiusText, heldFinishCandidate, heldFinishProblem, heldFinishReplaceable, heldFinishReplacement, type HeldFinish } from '../src/state/heldFinishReplacement';
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
test('unshaped two-end laws require valid values or resolvable parameters and terminal replacement',()=>{
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

test('paired Constant Fillet replaces only the held slot and its signature', () => {
 const stock = rectanglePart(30, 20, 10);
 const evaluated = evaluatePart(stock, 1);
 assert.ok(evaluated.ok);
 const [body] = evaluated.bodies;
 const edges = body.mesh.edges;
 const [retained, missing, picked] = edges.filter(edge => edge.nativeLine && edge.names.length === 1);
 const [keep, old, next] = [retained, missing, picked].map(edge => edge.names[0]);
 const signatures = signaturesOf(body).edges;
 const saved = { [keep]: toSig(signatures.get(keep)!), [old]: toSig(signatures.get(old)!) };
 const problem = { index: 1, where: 'feature 2', node: 2, name: old, candidates: [next] };
 for (const names of [[keep, old], [old, keep]]) {
  const node = { ...finish, radii: undefined, edges: names, sigs: saved };
  const source = withNode(stock, node);
  assert.equal(heldFinishProblem(source, 2, [problem], body), problem);
  assert.equal(heldFinishProblem(source, 2, [problem, { ...problem, name: keep }], body), undefined);
  const stale = withNode(stock, { ...node, sigs: { ...saved, [keep]: { ...saved[keep], s: 99 } } });
  assert.equal(heldFinishProblem(stale, 2, [problem], body), undefined);
  assert.equal(heldFinishProblem({ ...source, nodes: [...source.nodes, stock.nodes[0]] }, 2, [problem], body), undefined);
  assert.ok('error' in heldFinishCandidate(node, retained, edges, {}, old));
  assert.ok('error' in heldFinishCandidate(node, picked, [...edges, { ...picked }], {}, old));
  const result = heldFinishReplacement(source, 2, picked, edges, toSig(signatures.get(next)!), old);
  assert.ok(result);
  const changed = result.nodes[2];
  assert.ok(changed.kind === 'fillet');
  assert.deepEqual(changed.edges, names.map(name => name === old ? next : name));
  assert.equal(changed.sigs?.[keep], saved[keep]);
  assert.deepEqual(changed.sigs?.[next], toSig(signatures.get(next)!));
  assert.equal(changed.sigs?.[old], undefined);
  assert.equal(changed.held, undefined);
  assert.equal(changed.suppressed, undefined);
  assert.deepEqual(source.nodes[2], node);
 }
});

test('one and two interior positions reassign along candidate direction without changing the authored law',()=>{
 for(const fractions of [[0.12345678912345678],[0.25,0.75]])for(const reverse of [false,true]){
  const controls=[finish.radii![0],...fractions.map(fraction=>({at:[fraction*10,0,0] as [number,number,number],radius:2,fraction})),finish.radii![1]];
  const node={...finish,radii:controls},source=withNode(rectanglePart(30,20,10),node),before=structuredClone(source),selected=reverse?{...edge,a:edge.b,b:edge.a}:edge;
  assert.ok(heldFinishReplaceable(node));const candidate=heldFinishCandidate(node,selected,[selected]);assert.ok('endpoints'in candidate);if(!('endpoints'in candidate))return;
  assert.deepEqual(candidate.endpoints!.stations,fractions.map((fraction,i)=>({label:fractions.length===1?'Interior':`Interior ${i+1}`,fraction,at:selected.a.map((v,k)=>v+(selected.b[k]-v)*fraction)})));
  const next=heldFinishReplacement(source,2,selected,[selected],sig);assert.ok(next);const changed=next.nodes[2];assert.equal(changed.kind,'fillet');if(changed.kind!=='fillet')return;
  assert.deepEqual(changed.radii!.map(p=>p.radius),controls.map(p=>p.radius));assert.deepEqual(changed.radii!.map(p=>p.fraction),controls.map(p=>p.fraction));
  assert.deepEqual(changed.radii!.map(p=>p.at),[selected.a,...candidate.endpoints!.stations!.map(p=>p.at),selected.b]);
  assert.equal(changed.id,source.nodes[2].id);assert.deepEqual(source,before);
 }
});
test('invalid interior geometry and unresolved bound radii are not offered',()=>{
 const interior={at:[5,0,0] as [number,number,number],radius:2,fraction:0.5};
 const laws=[...[-1,0,1e-9,1-1e-9,1,NaN,Infinity].map(fraction=>[ {...interior,fraction} ]),
  [{...interior,fraction:0.75},{...interior,fraction:0.25}], [{...interior,fraction:0.5},{...interior,fraction:0.5+1e-10}],
  [{...interior,atEnd:true as const}], [{...interior,fraction:undefined}], [{...interior,radius:{parameter:'Inner'}}],
  [{...interior,radius:0}], [{...interior,radius:Infinity}], [{...interior,at:[NaN,0,0] as [number,number,number]}],
  [{...interior,fraction:0.2},{...interior,fraction:0.4},{...interior,fraction:0.6}]];
 for(const inner of laws)assert.equal(heldFinishReplaceable({...finish,radii:[finish.radii![0],...inner,finish.radii![1]]}),false);
});

test('bound and mixed radii retain their exact authored objects while candidate direction assigns positions',()=>{
 const start={parameter:'StartR'},end={parameter:'EndR'},inner={parameter:'InnerR'};
 for(const reverse of [false,true]) {
  const node={...finish,radius:start,radii:[{...finish.radii![0],radius:start},{at:[2.5,0,0] as [number,number,number],radius:inner,fraction:0.25},{at:[7.5,0,0] as [number,number,number],radius:2,fraction:0.75},{...finish.radii![1],radius:end}]};
  const source={...withNode(rectanglePart(30,20,10),node),parameters:{StartR:1,EndR:3,InnerR:2}},before=structuredClone(source);
  const selected=reverse?{...edge,a:edge.b,b:edge.a}:edge;
  assert.ok(heldFinishReplaceable(node,source.parameters));
  assert.ok('name'in heldFinishCandidate(node,selected,[selected],source.parameters));
  const next=heldFinishReplacement(source,2,selected,[selected],sig);assert.ok(next);
  const changed=next.nodes[2];assert.equal(changed.kind,'fillet');if(changed.kind!=='fillet')return;
  assert.equal(changed.radius,start);assert.equal(changed.radii![0].radius,start);assert.equal(changed.radii![1].radius,inner);assert.equal(changed.radii![3].radius,end);
  assert.deepEqual(changed.radii!.map(p=>p.at),[selected.a,...[0.25,0.75].map(f=>selected.a.map((v,k)=>v+(selected.b[k]-v)*f)),selected.b]);
  assert.deepEqual(changed.radii!.map(p=>p.fraction),node.radii.map(p=>p.fraction));
  assert.equal(next.parameters,source.parameters);assert.equal(changed.parent,node.parent);assert.equal(next.outputs,source.outputs);assert.deepEqual(source,before);
  assert.equal(heldFinishReplacement({...source,parameters:{...source.parameters,InnerR:0}},2,selected,[selected],sig),null);
 }
});

test('bound radius admission requires an exact reference and an own finite positive parameter at every station',()=>{
 const bound={parameter:'R'};
 for(const position of ['base','start','interior','end'] as const){
  const controls=[finish.radii![0],{at:[5,0,0] as [number,number,number],radius:2,fraction:0.5},finish.radii![1]];
  const node={...finish,radius:position==='base'?bound:1,radii:controls.map((p,i)=>({...p,radius:i===({start:0,interior:1,end:2,base:-1}[position])?bound:p.radius}))};
  assert.ok(heldFinishReplaceable(node,{R:1}));
  for(const parameters of [{},...[-1,0,NaN,Infinity,-Infinity].map(R=>({R})),Object.create({R:1}) as Record<string,number>]){
   assert.equal(heldFinishReplaceable(node,parameters),false);
   assert.ok('error'in heldFinishCandidate(node,edge,[edge],parameters));
   assert.equal(heldFinishReplacement({...withNode(rectanglePart(30,20,10),node),parameters},2,edge,[edge],sig),null);
  }
 }
 const malformed={parameter:'R',extra:1};
 assert.equal(heldFinishReplaceable({...finish,radius:malformed},{R:1}),false);
 const inherited=Object.assign(Object.create({parameter:'R'}),{extra:1});
 assert.equal(heldFinishReplaceable({...finish,radius:inherited},{R:1}),false);
 assert.equal(heldFinishReplaceable({...finish,radius:{parameter:'constructor'}},{}),false);
});

 test('replacement radius review distinguishes bound current values from unavailable bindings',()=>{
  assert.equal(heldFinishRadiusText(1.234567891,{}),'1.234567891');
  assert.equal(heldFinishRadiusText({parameter:'StartR'},{StartR:1}),'StartR (1)');
  assert.equal(heldFinishRadiusText({parameter:'StartR'},{StartR:2}),'StartR (2)');
  for(const parameters of [{},{StartR:NaN},{StartR:0}] as Record<string,number>[])assert.equal(heldFinishRadiusText({parameter:'StartR'},parameters),'StartR (unavailable)');
 });
