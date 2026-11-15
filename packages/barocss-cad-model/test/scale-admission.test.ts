import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDoc, evaluatePreview } from '../src/engine/evaluate';
import { emptyDoc, withNode } from '../src/engine/doc';
import { readStudioDoc } from '../src/engine/migrate';
import { friendly } from '../src/engine/errors';
const base=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[10,20],max:[22,28]}),{kind:'extrude',sketch:0,height:6,from:30});
const scaled=(factor:number)=>withNode(base,{kind:'scale',parent:{node:1,side:'solid'},factor,pivot:[4,-6,10]});
test('Scale failure has specific recovery without replacing unrelated geometry errors',()=>{
 const e=friendly('n2: Scale cannot preserve valid geometry for this body. reason','GEOMETRY');
 assert.equal(e.title,'Scale would lose usable geometry');assert.match(e.hint,/Increase Factor/);assert.equal(e.code,'GEOMETRY');
 assert.equal(friendly('unexpected kernel failure: cap','GEOMETRY').title,'The kernel could not build this');
});
test('tiny Scale preview and reopened document fail consistently; valid small Scale remains usable',()=>{
 const original=JSON.stringify(base);
 for(const factor of [5e-9,1e-8,2e-8]){
  const doc=scaled(factor),bytes=JSON.stringify(doc), reopened=readStudioDoc(bytes);
  if('error' in reopened)throw new Error(reopened.error);
  for(const result of [evaluateDoc(doc,1),evaluatePreview(doc,1),evaluateDoc(reopened.doc,1)]){
   assert.equal(result.ok,false);if(result.ok)throw new Error('Unexpected accepted scale');
   assert.equal(result.error.title,'Scale would lose usable geometry');assert.match(result.error.hint,/Increase Factor/);
  }
  assert.equal(JSON.stringify(doc),bytes);
 }
 const accepted=evaluateDoc(scaled(.005),1);assert.equal(accepted.ok,true);
 assert.equal(accepted.bodies.length,1);assert.ok([...accepted.bodies[0].mesh.bounds.min,...accepted.bodies[0].mesh.bounds.max].every(Number.isFinite));assert.equal(JSON.stringify(base),original);
});
