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

test('Flange own History radius rejects invalid drafts before its strict setter without changing other fields', () => {
 const nodes = [{id:'n2',kind:'sheet-flange' as const,parent:{node:1,side:'solid' as const},edges:['edge'] as [string],length:20,bendRadius:2}];
 const rule = historyNumberRule(nodes,0,'ownBendRadius'); assert.equal(rule,'positive');
 for (const value of [0,-1,'', ' ', NaN,Infinity,-Infinity,'NaN']) assert.equal(featureNumberInvalid(value,rule!),true);
 for (const value of [.001,2,3,20,'3.25']) assert.equal(featureNumberInvalid(value,rule!),false);
 assert.deepEqual(featureNumberBounds(rule),{min:0});
 for (const key of ['length','angle','o0','o1','r']) assert.equal(historyNumberRule(nodes,0,key),undefined);
 assert.equal(commandNumberRule('sheet-flange','r'),undefined,'creation zero still means inherited');
 assert.equal(historyNumberRule([{id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]}],0,'ownBendRadius'),undefined);
 const snapshot=structuredClone(nodes); let setterCalls=0;
 for(const text of ['0','-1','NaN','Infinity']) {const value=Number(text);if(Number.isFinite(value)&&!featureNumberInvalid(value,rule!))setterCalls++;}
 assert.equal(setterCalls,0);assert.deepEqual(nodes,snapshot);
});
