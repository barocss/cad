import test from 'node:test';
import assert from 'node:assert/strict';
import { cageBeginPolicy } from '../src/subd/cageBeginPolicy';
const source = Object.freeze({ kind: 'subd' });
const session = Object.freeze({ node: 2 });

test('same cage identity keeps its session even with discard approval, while a first edit begins', () => {
  for (const discard of [false, true]) assert.equal(cageBeginPolicy(2, source, session, source, discard), 'keep');
  assert.equal(cageBeginPolicy(2, source, null, null), 'begin');
});
test('different cage or replaced same-index source requires explicit discard approval', () => {
  const other = Object.freeze({ kind: 'subd' });
  assert.equal(cageBeginPolicy(3, other, session, source), 'refuse');
  assert.equal(cageBeginPolicy(3, other, session, source, false), 'refuse');
  assert.equal(cageBeginPolicy(3, other, session, source, true), 'begin');
  assert.equal(cageBeginPolicy(2, other, session, source), 'refuse');
  assert.equal(cageBeginPolicy(2, other, session, source, true), 'begin');
  assert.equal(cageBeginPolicy(2, source, session, null), 'refuse');
});
test('invalid target or index cannot begin even when discard was approved', () => {
  for (const discard of [false, true]) {
    for (const target of [null, undefined, { kind: 'extrude' }]) assert.equal(cageBeginPolicy(2, target, session, source, discard), 'refuse');
    for (const node of [-1, 0.5, NaN, Infinity]) assert.equal(cageBeginPolicy(node, source, null, null, discard), 'refuse');
  }
  assert.deepEqual(source, { kind: 'subd' }); assert.deepEqual(session, { node: 2 });
});
