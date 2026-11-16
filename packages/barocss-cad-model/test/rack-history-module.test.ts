import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, featureLabel, type ModelNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { editFields, type BindableField } from '../src/app/editFields';
const gear:ModelNode={kind:'gear',module:2,teeth:20,faceWidth:10,center:[0,0],generator:'spur-gear@0'};
const rack:Extract<ModelNode,{kind:'rack'}>={kind:'rack',module:2,teeth:12,faceWidth:10,height:8,origin:[0,0],generator:'spur-rack@1'};
const standalone=():ModelNode[]=>[gear,{...rack}];
const linked=():ModelNode[]=>[gear,{...rack,mesh:{gear:0}}];
const field=(nodes:ModelNode[])=>editFields(nodes,1,{M:3}).find(f=>f.key==='m') as BindableField|undefined;
function evaluated(nodes:ModelNode[]){const result=evaluateDoc({...emptyDoc(),nodes},1);assert.ok(result.ok,JSON.stringify(result));return result.bodies.find(b=>b.ref?.node===1)!;}

test('native linked rack ignores stored module: History must not offer that no-effect edit',()=>{
 const nodes=linked(),before=structuredClone(nodes),a=evaluated(nodes),b=evaluated([gear,{...rack,module:3,mesh:{gear:0}}]);
 assert.equal(a.volume,b.volume);assert.deepEqual(a.mesh.positions,b.mesh.positions);assert.deepEqual(a.mesh.indices,b.mesh.indices);
 assert.equal(field(nodes),undefined,'module belongs to the parent gear');assert.deepEqual(nodes,before);
});

test('standalone numeric and bound Module edits remain effective and immutable',()=>{
 const nodes=standalone(),before=structuredClone(nodes),f=field(nodes);assert.ok(f);
 const changed=f.set(nodes,3);assert.deepEqual(changed[1],{...rack,module:3});assert.equal(changed[0],nodes[0]);
 assert.notEqual(evaluated(nodes).volume,evaluated(changed).volume);
 const bound=f.bind(nodes,'M');assert.ok(bound);assert.deepEqual(bound[1],{...rack,module:{parameter:'M'}});
 assert.deepEqual(nodes,before);
});

test('captured standalone setter and parameter binding cannot overwrite a newly linked rack module',()=>{
 const f=field(standalone());assert.ok(f);const nodes=linked(),before=structuredClone(nodes);
 assert.deepEqual(f.set(nodes,3),nodes);assert.equal(f.bind(nodes,'M'),null);assert.deepEqual(nodes,before);
});

test('missing parent links remain linked and numeric edits do not normalize legacy stored module',()=>{
 for(const module of [7,{parameter:'M'}]){
  const nodes:ModelNode[]=[gear,{...rack,module,mesh:{gear:99}}],before=structuredClone(nodes);
  assert.equal(field(nodes),undefined);
  const height=editFields(nodes,1,{M:3}).find(f=>f.key==='h');assert.ok(height?.kind==='number');
  const changed=height.set(nodes,9);assert.deepEqual(changed[1],{...nodes[1],height:9});assert.deepEqual(nodes,before);
 }
});

test('linked default root radius follows current parent normal module, with explicit values and bindings retained',()=>{
 const rf=(nodes:ModelNode[])=>editFields(nodes,1,{M:3,R:0.9}).find(f=>f.key==='rf') as BindableField;
 const original=linked(),parent3:ModelNode[]=[{...gear,module:3},original[1]],f=rf(original);
 assert.equal(f.get(parent3),0.38*3);
 assert.equal(evaluated(parent3).rack!.spec.rootFilletRadius,undefined,'native default remains implicit');
 const explicit:ModelNode[]=[parent3[0],{...rack,mesh:{gear:0},rootFillet:0.9}];
 assert.equal(rf(explicit).get(explicit),0.9);
 assert.deepEqual(rf(explicit).set(explicit,0.38*3)[1],parent3[1],'setting the current native default removes only the explicit radius');
 assert.deepEqual(f.set(parent3,0.76)[1],{...parent3[1],rootFillet:0.76},'the obsolete stored-module default is now an explicit radius');
 const param:ModelNode[]=[{...gear,module:{parameter:'M'}},original[1]];assert.equal(rf(param).get(param),0.38*3);
 assert.equal(rf(param).param(param),null,'a parent module parameter is not a root-radius binding');
 const standaloneBound:ModelNode[]=[gear,{...rack,module:{parameter:'M'}}];
 assert.equal(rf(standaloneBound).get(standaloneBound),0.38*3);assert.equal(rf(standaloneBound).param(standaloneBound),null);
 const rootBound:ModelNode[]=[param[0],{...rack,mesh:{gear:0},rootFillet:{parameter:'R'}}];
 assert.equal(rf(rootBound).get(rootBound),0.9);assert.equal(rf(rootBound).param(rootBound),'R');
 assert.equal(f.bind(parent3,'R'),null,'generic binding does not synthesize an absent optional property');
 const bound=rf(explicit).bind(explicit,'R');assert.ok(bound);assert.deepEqual(bound[1],{...explicit[1],rootFillet:{parameter:'R'}});
 for(const helixAngle of [20,-20]){const helical:ModelNode[]=[{...gear,module:3,helixAngle,hand:'right'},original[1]];assert.equal(f.get(helical),0.38*3);}
 const missing:ModelNode[]=[gear,{...rack,mesh:{gear:99}}];assert.ok(Number.isNaN(rf(missing).get(missing)));
 const wrong:ModelNode[]=[rack,{...rack,mesh:{gear:0}}];assert.ok(Number.isNaN(rf(wrong).get(wrong)));
 assert.deepEqual(original,linked());
});


test('rack labels use the linked parent module or identify the link without asserting a stale stored module',()=>{
 const node:ModelNode={...rack,mesh:{gear:0}};
 assert.equal(featureLabel(node,1,[{...gear,module:3},node]),'Rack m3 × 12');
 assert.equal(featureLabel(node,1,[{...gear,module:{parameter:'M'}},node]),'Rack mM × 12');
 assert.equal(featureLabel(node,1,[]),'Rack linked to feature 1 × 12');
 assert.equal(featureLabel(node,1,[rack,node]),'Rack linked to feature 1 × 12');
 assert.equal(featureLabel(node,1,undefined as unknown as readonly ModelNode[]),'Rack linked to feature 1 × 12');
 assert.equal(featureLabel(rack,1,[gear,rack]),'Rack m2 × 12');
 assert.equal(featureLabel({...rack,module:{parameter:'R'}},1,[]),'Rack mR × 12');
});
