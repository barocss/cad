import test from 'node:test';
import assert from 'node:assert/strict';
import { commandNumberRule, historyNumberRule, featureNumberInvalid, featureNumberRange, featureNumberBounds } from '../src/app/featureNumberInput';
test('thread length and relief use their own zero guidance, not fillet radius guidance',()=>{
 const nodes=[{kind:'face-thread' as const,parent:{node:0,side:'solid' as const},face:'n0.side0',pitch:1}];
 for(const key of ['pitch','len','relief','diameter']){
  const rule=commandNumberRule('face-thread',key)!;assert.equal(historyNumberRule(nodes,0,key),rule);
  assert.equal(featureNumberInvalid(-1,rule),true);assert.equal(featureNumberInvalid(Infinity,rule),true);
  assert.equal(featureNumberInvalid(0,rule),key==='pitch'||key==='diameter');assert.deepEqual(featureNumberBounds(rule),{min:0});
  assert.doesNotMatch(featureNumberRange(rule),/same radius/);
 }
 assert.match(featureNumberRange(commandNumberRule('face-thread','len')!),/whole face/);
});
