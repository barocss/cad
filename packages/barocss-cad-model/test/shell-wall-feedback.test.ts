import test from 'node:test';
import assert from 'node:assert/strict';
import { featureLabel, type ModelNode } from '../src/engine/doc';
import { friendly } from '../src/engine/errors';

test('Shell labels retain exact entered wall values rather than rounding to a refused limit',()=>{
  for(const thickness of [2,2.499,2.499999,0.00001,1e-7]) {
    const shell:ModelNode={kind:'shell',parent:{node:0,side:'solid'},open:['face0'],thickness};
    assert.equal(featureLabel(shell,1,[shell]),`Shell ${thickness} mm`);
  }
  const bound:ModelNode={kind:'shell',parent:{node:0,side:'solid'},open:['face0'],thickness:{parameter:'wall'}};
  assert.equal(featureLabel(bound,1,[bound]),'Shell wall');
});

test('only the exact native measured shell opening limit becomes actionable default guidance',()=>{
  for(const limit of ['2.5','0.0001','1e-7']){
    const message=`a wall of 2.5 mm leaves no hollow at imported.face0; use a wall less than ${limit} mm`;
    const result=friendly(message,'PARAMETER');
    assert.equal(result.hint,`Enter Wall less than ${limit} mm to keep the selected face open.`);
    assert.equal(result.detail,message);
    assert.equal(result.code,'PARAMETER');
  }
  for(const limit of ['NaN','Infinity','-2','0','1e309','2.5 mm extra']) {
    const result=friendly(`a wall of 2.5 mm leaves no hollow at face0; use a wall less than ${limit} mm`,'PARAMETER');
    assert.equal(result.hint,'Reduce Wall to keep the selected face open.');
  }
  for (const [message,code] of [[
    'a wall of 1 mm leaves no hollow at face0; use a wall less than 2.5 mm','PARAMETER'],
    ['a wall of 2.5 mm leaves no hollow at face0; use a wall less than 2.5 mm','GEOMETRY'],
    ['a wall of 2.5 mm leaves no hollow at face0; use a wall less than 2.5 mm extra','PARAMETER'],
    ['a wall of Infinity mm leaves no hollow at face0; use a wall less than 2.5 mm','PARAMETER'],
    ['a wall of 2.5 mm leaves no hollow at face0\nother; use a wall less than 2.5 mm','PARAMETER']]) {
    assert.doesNotMatch(friendly(message,code).hint,/Enter Wall less than/);
  }
  assert.equal(friendly('a wall of 3 mm leaves no hollow inside this body','PARAMETER').hint,'Use a thinner wall: it must leave room inside the body.');
});
