import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentDirectPole, ownsDirectPole, type DirectPoleSelection } from '../src/state/directPoleSelection';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
const direct: DirectGeometry = { sources: {}, objects: [] };
const pole: DirectPoleSelection = { direct, generation: 1, id: 'a', key: '1' };
test('pole selection needs exact source, generation, selected object and existing key', () => {
 assert.equal(currentDirectPole(pole, direct, 1, 'a', ['0','1']), pole);
 for (const result of [currentDirectPole(pole, {...direct},1,'a',['1']), currentDirectPole(pole,direct,2,'a',['1']), currentDirectPole(pole,direct,1,'b',['1']), currentDirectPole(pole,direct,1,'a',['0'])]) assert.equal(result,null);
});
test('late completion fails after deselection/reselection even at the same owner and key', () => {
 assert.equal(ownsDirectPole(pole,pole,direct),true);
 assert.equal(ownsDirectPole(pole,pole,direct,false),false);
 assert.equal(ownsDirectPole(pole,null,direct),false);
 assert.equal(ownsDirectPole(pole,{...pole},direct),false);
 assert.equal(ownsDirectPole(pole,pole,{...direct}),false);
});
test('explicit accepted edit may carry a key; old completion and Undo owner cannot resurrect it', () => {
 const next = {...direct}, carried = {...pole,direct:next};
 assert.equal(currentDirectPole(carried,next,1,'a',['1']),carried);
 assert.equal(currentDirectPole(carried,direct,1,'a',['1']),null);
 assert.equal(ownsDirectPole(pole,carried,next),false);
 assert.equal(currentDirectPole(null,direct,1,'a',['1']),null);
});
