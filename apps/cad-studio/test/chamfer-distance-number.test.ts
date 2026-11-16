import test from 'node:test';
import assert from 'node:assert/strict';
import { commandNumberRule, historyNumberRule, featureNumberInvalid, featureNumberBounds } from '../src/app/featureNumberInput';
test('Chamfer creation and History distance allow finite small positive values only', () => {
 const rule = commandNumberRule('chamfer', 'distance'); assert.equal(rule, 'positive');
 assert.equal(historyNumberRule([{id:'n2',kind:'chamfer',parent:{node:1,side:'solid'},edges:['edge'],distance:.1}],0,'d'),rule);
 for(const value of [0,-.1,'',NaN,Infinity]) assert.equal(featureNumberInvalid(value,rule!),true);
 for(const value of [.001,.05,.1,2]) assert.equal(featureNumberInvalid(value,rule!),false);
 assert.deepEqual(featureNumberBounds(rule),{min:0});
 assert.equal(commandNumberRule('chamfer','radius'),undefined);
});
