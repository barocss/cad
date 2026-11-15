import test from 'node:test';
import assert from 'node:assert/strict';
import { awaitingOffsetPlane, resetOffsetPlane } from '@barocss/cad-model/app/offsetPlanePick';
import type { Active } from '../src/app/commandState';
import { offsetPlanePickFeedback, refuseOffsetPlanePick } from '../src/app/offsetPlanePickFeedback';
const state = (id = 'offset-face') => ({ cmd: { id }, ctx: { doc: {} }, preview: 'ok', values: { offsetMode: 'to-plane', endBody: 1, endFace: 'n3.side3', keepPlane: 1, d: 2 }, error: { title: 'old', hint: '', detail: '' } }) as unknown as Active;
test('invalid current repick retires an old target and owns one row-local warning', () => {
  for (const id of ['offset-face', 'offset-face-edit']) {
    const source = state(id), before = structuredClone(source), next = refuseOffsetPlanePick(source, 'Pick another earlier solid.');
    assert.equal(next.preview, 'input'); assert.equal(next.error, undefined);
    assert.equal(next.ctx, source.ctx); assert.equal(next.values.d, 2);
    for (const key of ['endBody', 'endFace', 'keepPlane']) assert.equal(next.values[key], undefined);
    assert.ok(awaitingOffsetPlane(id, next.values));
    assert.equal(offsetPlanePickFeedback(next), 'Pick another earlier solid.');
    assert.equal(offsetPlanePickFeedback({ ...next, preview: 'input', error: undefined }), 'Pick another earlier solid.', 'awaiting-preview update retains receipt');
    assert.deepEqual(source, before);
  }
});
test('valid target, mode exit, replaced context/command and command restart cannot show stale warning', () => {
  const input = state(), next = refuseOffsetPlanePick(input, 'Pick another solid.');
  for (const changed of [
    { ...next, values: { ...next.values, endBody: 1, endFace: 'n3.side3' }, preview: 'busy' as const },
    { ...next, values: resetOffsetPlane(next.ctx, { ...next.values, offsetMode: 'distance' }, ['offsetMode']) },
    { ...next, ctx: { ...next.ctx } }, { ...next, cmd: { ...next.cmd } }, state(),
  ]) assert.equal(offsetPlanePickFeedback(changed), undefined);
  const extrude = state('extrude'); assert.equal(refuseOffsetPlanePick(extrude, 'no'), extrude);
});
