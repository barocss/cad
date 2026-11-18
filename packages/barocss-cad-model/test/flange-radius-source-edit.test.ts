import test from 'node:test';
import assert from 'node:assert/strict';
import { flangeRadiusSourceEdit, isFlangeRadiusSourceChange } from '../src/app/flangeRadiusSourceEdit';
import { flangeRadiusEdit } from '../src/app/flangeRadiusEdit';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';

function fixture(own?: number): StudioDoc {
 const sk=withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]});
 const base=withNode(sk,{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
 return withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},edges:['n1.side1|n1.top'],length:20,
  sigs:{'n1.side1|n1.top':{k:'line',p:[80,25,1.5],d:[0,1,0],s:50}},...(own===undefined?{}:{bendRadius:own})});
}
function choice(doc:StudioDoc,nodes=doc.nodes){
 const f=flangeRadiusSourceEdit(doc,nodes,2);assert.ok(f?.kind==='choice');
 if(!f||f.kind!=='choice')throw Error('Expected radius source choice');return f;
}
function patch(doc:StudioDoc,index:number,changes:object):StudioDoc {
 return {...doc,nodes:doc.nodes.map((n,i)=>i===index?{...n,...changes} as typeof n:n)};
}

test('radius source transition preserves authored parents, edge and signature; Own starts at current sheet radius',()=>{
 const doc=fixture(),snapshot=structuredClone(doc),f=choice(doc);
 assert.equal(f.key,'flangeRadiusSource');assert.equal(f.label,'Radius source');assert.deepEqual(f.options.map(o=>o.value),['sheet','own']);
 const own=f.set(doc.nodes,'own');assert.deepEqual(own[2],{...doc.nodes[2],bendRadius:1.5});
 assert.equal(own[0],doc.nodes[0]);assert.equal(own[1],doc.nodes[1]);
 const a=doc.nodes[2],b=own[2];if(a.kind!=='sheet-flange'||b.kind!=='sheet-flange')throw Error('flange');
 assert.equal(b.edges,a.edges);assert.equal(b.sigs,a.sigs);
 const owned={...doc,nodes:own},sheet=choice(owned).set(owned.nodes,'sheet');
 assert.equal(Object.hasOwn(sheet[2],'bendRadius'),false);assert.deepEqual(sheet,doc.nodes);assert.deepEqual(doc,snapshot);
 const changedParent=patch(doc,1,{bendRadius:2.5});
 assert.deepEqual(choice(changedParent).set(changedParent.nodes,'own')[2],{...changedParent.nodes[2],bendRadius:2.5});
});

test('source no-op retains node identity and omission, including equal-valued own radius',()=>{
 for(const own of [undefined,1.5,2]){
  const doc=fixture(own),f=choice(doc),value=own===undefined?'sheet':'own';
  assert.equal(f.get(doc.nodes),value);const next=f.set(doc.nodes,value);
  assert.deepEqual(next,doc.nodes);next.forEach((n,i)=>assert.equal(n,doc.nodes[i]));
  assert.equal(Object.hasOwn(next[2],'bendRadius'),own!==undefined);
 }
 const doc=fixture(1.5),nodes=choice(doc).set(doc.nodes,'sheet');
 assert.equal(Object.hasOwn(nodes[2],'bendRadius'),false,'Equal effective radius still has distinct inheritance intent');
});

test('source setters refuse foreign arrays, canonical mutation and unknown choices without changing source',()=>{
 const doc=fixture(),f=choice(doc),saved=structuredClone(doc);
 assert.throws(()=>f.set([...doc.nodes],'own'));assert.throws(()=>f.set(structuredClone(doc.nodes),'own'));
 for(const value of ['', 'invalid', '0', '2'])assert.throws(()=>f.set(doc.nodes,value));
 assert.deepEqual(doc,saved);doc.parameters.changed=1;assert.throws(()=>f.set(doc.nodes,'own'));
 const d=fixture(),g=choice(d),flange=d.nodes[2];if(flange.kind!=='sheet-flange')throw Error('flange');
 flange.length=21;assert.throws(()=>g.set(d.nodes,'own'));
});

test('source choice excludes unsupported recipes, bindings, metadata and mixed edits',()=>{
 const doc=fixture();
 for(const d of [patch(doc,2,{angle:45}),patch(doc,2,{position:'material-outside'}),patch(doc,2,{measure:'inner'}),
  patch(doc,2,{offsets:[0,0]}),patch(doc,2,{relief:{kind:'none'}}),patch(doc,2,{held:true}),patch(doc,2,{suppressed:true}),
  patch(doc,2,{bendRadius:0}),patch(doc,2,{bendRadius:-1}),patch(doc,2,{bendRadius:NaN}),patch(doc,2,{bendRadius:Infinity}),patch(doc,2,{bendRadius:{parameter:'R'}}),
  patch(doc,1,{bendRadius:{parameter:'R'}}),patch(doc,1,{bendRadius:0}),patch(doc,1,{thickness:0}),patch(doc,1,{kFactor:1.1}),patch(doc,1,{bendTable:{}}),
  patch(doc,0,{plane:{}}),patch(doc,0,{max:[0,50]}),patch(doc,2,{edges:['a','b']}),patch(doc,2,{unknownOwner:true}),
  {...doc,direct:{sources:{},objects:[]}}, {...doc,instances:[]}, {...doc,nodes:[...doc.nodes,doc.nodes[0]]}, {...doc,outputs:{b1:{node:1,side:'solid' as const}}}])
  assert.equal(flangeRadiusSourceEdit(d,d.nodes,2),null);
 for(const changes of [{length:21},{angle:45},{position:'material-outside'},{measure:'inner'}]){
  const next=patch(doc,2,changes);assert.equal(flangeRadiusSourceEdit(doc,next.nodes,2),null);
 }
 assert.equal(flangeRadiusSourceEdit(doc,structuredClone(doc.nodes),2),null);
 assert.equal(flangeRadiusSourceEdit(doc,doc.nodes,1),null);
});

test('existing own-radius numeric admission is not broadened by source choice',()=>{
 const inherited=fixture();assert.ok(choice(inherited));assert.equal(flangeRadiusEdit(inherited,inherited.nodes,2),null);
 const explicit=fixture(2);assert.ok(flangeRadiusEdit(explicit,explicit.nodes,2));
 for(const radius of [0,-1,NaN,Infinity]){const invalid=fixture(radius);assert.equal(flangeRadiusEdit(invalid,invalid.nodes,2),null);}
 const inner=patch(explicit,2,{measure:'inner'});assert.equal(flangeRadiusEdit(inner,inner.nodes,2),null);
});

 test('source change proof accepts only explicit inheritance switches and keeps numeric-only edits separate',()=>{
 const doc=fixture(),own={...doc,nodes:choice(doc).set(doc.nodes,'own')};
 assert.equal(isFlangeRadiusSourceChange(doc,own,2),true);
 assert.equal(isFlangeRadiusSourceChange(own,{...own,nodes:choice(own).set(own.nodes,'sheet')},2),true);
 assert.equal(isFlangeRadiusSourceChange(doc,doc,2),false);
 assert.equal(isFlangeRadiusSourceChange(doc,patch(doc,2,{bendRadius:2}),2),false,'source switch cannot inject a different radius');
 assert.equal(isFlangeRadiusSourceChange(own,patch(own,2,{bendRadius:2}),2),false,'existing numeric own edits are not source changes');
 assert.equal(isFlangeRadiusSourceChange(doc,{...own,parameters:{extra:1}},2),false);
 assert.equal(isFlangeRadiusSourceChange(doc,patch(own,2,{length:21}),2),false);
 assert.equal(isFlangeRadiusSourceChange(doc,own,1),false);
 });
