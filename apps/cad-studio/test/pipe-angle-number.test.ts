import test from 'node:test';
import assert from 'node:assert/strict';
import { commandNumberRule, featureNumberInvalid, featureNumberRange, featureNumberBounds } from '../src/app/featureNumberInput';
test('Pipe bend angle matches kernel exclusive zero and inclusive 180 limit',()=>{
 const rule=commandNumberRule('pipe','bendAngle')!; assert.equal(rule,'pipe-angle');
 for(const v of [0,-1,180.01,270,NaN,Infinity]) assert.equal(featureNumberInvalid(v,rule),true);
 for(const v of [0.5,90,180]) assert.equal(featureNumberInvalid(v,rule),false);
 assert.equal(featureNumberRange(rule),'Greater than 0° and at most 180°');assert.deepEqual(featureNumberBounds(rule),{min:0,max:180});
});
