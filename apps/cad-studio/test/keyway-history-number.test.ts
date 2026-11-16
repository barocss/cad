import test from 'node:test';
import assert from 'node:assert/strict';
import { commandNumberRule, historyNumberRule, featureNumberInvalid } from '../src/app/featureNumberInput';
test('Keyway width and depth are positive in creation and history; angle allows zero',()=>{
 const nodes=[{kind:'keyway' as const,parent:{node:0,side:'solid' as const},face:'n0.hole0.side0',width:6,depth:2.8}];
 for(const key of ['b','t2']) {
  assert.equal(commandNumberRule('keyway',key),'positive');assert.equal(historyNumberRule(nodes,0,key),'positive');
  for(const value of [0,-1,NaN,Infinity]) assert.equal(featureNumberInvalid(value,'positive'),true);
  assert.equal(featureNumberInvalid(2.8,'positive'),false);
 }
 assert.equal(historyNumberRule(nodes,0,'angle'),undefined);
});
