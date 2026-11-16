import test from 'node:test';
import assert from 'node:assert/strict';
import {commandNumberRule,historyNumberRule,featureNumberBounds,featureNumberInvalid,featureNumberRange} from '../src/app/featureNumberInput';
import {draggedScaleFactor} from '../src/viewport/draggedScaleFactor';
test('Scale creation and history share positive finite factor range without rejecting existing .005',()=>{
 assert.equal(commandNumberRule('scale','factor'),'scale-factor');
 assert.equal(historyNumberRule([{kind:'scale',id:'n2',parent:{node:1,side:'solid'},factor:1}],0,'k'),'scale-factor');
 assert.deepEqual(featureNumberBounds('scale-factor'),{min:0,max:1000});
 assert.match(featureNumberRange('scale-factor'),/Unitless/);
 for(const x of ['',0,-1,1001,Infinity,NaN])assert.equal(featureNumberInvalid(x,'scale-factor'),true);
 for(const x of [.005,.001,.00000001,1,1000])assert.equal(featureNumberInvalid(x,'scale-factor'),false);
 assert.equal(draggedScaleFactor(.1,.01),.001);
 assert.equal(draggedScaleFactor(.005,.01),.00005);
 assert.equal(draggedScaleFactor(.1,1),.1);
 assert.equal(draggedScaleFactor(1000,2),1000);
});
