import test from 'node:test';
import assert from 'node:assert/strict';
import { directThickenGuidance } from '../src/ui/directThickenGuidance';
import { thickenCommand } from '@barocss/cad-model/app/thickenCommand';

test('whole surfaces retain the existing independent snapshot hint without promising native support', () => {
  for (const object of [{}, { trims: [] }]) {
    const before = structuredClone(object), result = directThickenGuidance(object);
    assert.equal(result.blocked, false);
    assert.equal(result.text, `${thickenCommand.hint}.`);
    assert.deepEqual(object, before);
  }
});
test('nonempty or malformed trim metadata blocks start without dropping data', () => {
  for (const trims of [[{ keep: 'outside' }], null, {}, '', 0, false]) {
    const object = { trims }, before = structuredClone(object), result = directThickenGuidance(object);
    assert.equal(result.blocked, true);
    assert.match(result.text, /Untrim the surface first; Thicken uses its whole support surface/);
    assert.match(result.text, /separate explicit edit/);
    assert.deepEqual(object, before);
  }
});
test('current source trim state is recomputed after explicit Untrim and Undo', () => {
  const old = { trims: [{ keep: 'outside' }] }, current = { trims: [] };
  assert.equal(directThickenGuidance(old).blocked, true);
  assert.equal(directThickenGuidance(current).blocked, false);
  assert.equal(directThickenGuidance(old).blocked, true);
});
