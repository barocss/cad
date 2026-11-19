import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { sharedSheetRuleOwner, ownsSharedSheetRules, type SheetRuleSource } from '../src/state/sharedSheetRules';
function fixture() {
  const doc: StudioDoc = { format:'barocss-cad-model', schema:3, units:'mm', parameters:{}, nodes:[{id:'n7',kind:'sheet-contour',path:[[0,30],[0,0],[40,0],[40,30]],side:'left',width:25,thickness:1.5,bendRadius:2,kFactor:.44}],outputs:{b7:{node:0,side:'solid'}},nextId:8 };
  const evaluated={...doc,nodes:[...doc.nodes]};
  const body={key:'b7',ref:{node:0,side:'solid'},flat:{},sheet:{}} as BodyResult;
  const source:SheetRuleSource={doc,evaluated,bodies:[body],open:{},worker:1,generation:{},available:true};
  return {doc,evaluated,body,source};
}
test('typed output resolves exact source node without parsing stable IDs or bend names',()=>{
  const {doc,evaluated,body,source}=fixture();assert.notEqual(doc,evaluated);
  assert.deepEqual(sharedSheetRuleOwner(doc,evaluated,body),{index:0,node:doc.nodes[0]});assert.ok(ownsSharedSheetRules(source,{...source},body));
});
for(const key of ['doc','evaluated','open','worker','generation','available','bodies'] as const)test(`deferred navigation refuses changed ${key}`,()=>{
  const {source,body}=fixture();const current={...source};
  if(key==='doc'||key==='evaluated')current[key]={...current[key]};else if(key==='open'||key==='generation')current[key]={};else if(key==='available')current.available=false;else if(key==='bodies')current.bodies=[{...body}];else current[key]++;
  assert.equal(ownsSharedSheetRules(source,current,body),false);
});
test('default-hide missing, downstream, mismatched and cloned source ownership',()=>{
  const {doc,evaluated,body}=fixture();
  for(const b of [{...body,ref:undefined},{...body,key:'other'},{...body,flat:undefined},{...body,sheet:undefined}])assert.equal(sharedSheetRuleOwner(doc,evaluated,b),null);
  assert.equal(sharedSheetRuleOwner(doc,{...evaluated,nodes:[{...doc.nodes[0]}]},body),null);
  assert.equal(sharedSheetRuleOwner(doc,{...evaluated,outputs:{b7:{node:1,side:'solid'}}},body),null);
  const downstream={...doc,nodes:[...doc.nodes,{id:'n8',kind:'mirror' as const} as StudioDoc['nodes'][number]]};assert.equal(sharedSheetRuleOwner(downstream,{...downstream},body),null);
});

test('same-key new document never adopts an old dialog owner',()=>{
  const a=fixture(),b=fixture();assert.equal(a.body.key,b.body.key);assert.equal(ownsSharedSheetRules(a.source,b.source,a.body),false);
});

test('suppressed contour and source/output alias mismatches fail closed',()=>{
  const {doc,evaluated,body}=fixture();const suppressed={...doc,nodes:[{...doc.nodes[0],suppressed:true as const}]};
  assert.equal(sharedSheetRuleOwner(suppressed,{...suppressed},body),null);
  assert.equal(sharedSheetRuleOwner({...doc,outputs:{}},evaluated,body),null);
  assert.equal(sharedSheetRuleOwner({...doc,outputs:{b7:{node:0,side:'positive'}}},evaluated,body),null);
});
