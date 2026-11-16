import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc,withNode} from '../src/engine/doc';
import {evaluateDoc} from '../src/engine/evaluate';
test('Pipe circular radius boundary retains supported equality and explains axis contact',()=>{
 for(const radius of [4.99,5,5.01]){
  const doc=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'circle',center:[0,0],radius:5}),{kind:'sweep',sketch:0,path:[{kind:'straight',length:8},{kind:'bend',radius,angle:90,toward:'x'},{kind:'straight',length:8}]});
  const r=evaluateDoc(doc,1);if (!r.ok) { assert.match(r.error.hint,/Contact at profile vertices may be supported/); assert.doesNotMatch(r.error.detail,/radius larger than/); }assert.equal(r.ok,radius>=5);
 }
});
