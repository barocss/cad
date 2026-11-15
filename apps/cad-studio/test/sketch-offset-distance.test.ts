import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetShape } from '@barocss/cad-model/sketch/offset';
import type { SketchShape } from '../src/viewport/Viewport';
import { applyOffsetMagnitude, parseOffsetMagnitude, offsetRecoveryMessage, OFFSET_MAGNITUDE_ERROR } from '../src/app/sketchOffsetDistance';

test('positive magnitudes include small offsets; invalid text never reaches the application', () => {
  for (const raw of ['', ' ', '0', '-2', 'NaN', 'Infinity', '1e999']) {
    assert.equal(parseOffsetMagnitude(raw), null);
    assert.equal(applyOffsetMagnitude(raw, 'out', () => assert.fail('invalid magnitude must not apply')), OFFSET_MAGNITUDE_ERROR);
  }
  for (const raw of ['0.05', '2', '1e-3']) {
    assert.equal(parseOffsetMagnitude(raw), Number(raw));
    const signed: number[] = [];
    applyOffsetMagnitude(raw, 'out', n => { signed.push(n); return undefined; });
    applyOffsetMagnitude(raw, 'in', n => { signed.push(n); return undefined; });
    assert.deepEqual(signed, [Number(raw), -Number(raw)]);
  }
});
test('actual rectangle collapse refuses unchanged source; smaller magnitude recovers', () => {
  const source: SketchShape = { kind: 'rectangle', a: [10, 10], b: [30, 22] }, before = structuredClone(source);
  let accepted: SketchShape | null = null;
  const apply = (n: number) => {
    const result = offsetShape(source, n);
    if ('error' in result) return offsetRecoveryMessage(result.error);
    accepted = result.shape; return undefined;
  };
  const refused = applyOffsetMagnitude('6', 'in', apply);
  assert.match(refused!, /Reduce Offset distance/); assert.equal(accepted, null); assert.deepEqual(source, before);
  assert.equal(applyOffsetMagnitude('2', 'in', apply), undefined);
  assert.deepEqual(accepted, { kind: 'rectangle', a: [12, 12], b: [28, 20] });
  assert.equal(applyOffsetMagnitude('0.05', 'out', apply), undefined);
  assert.deepEqual(accepted, { kind: 'rectangle', a: [9.95, 9.95], b: [30.05, 22.05] });
});
test('small circle offsets remain supported; collapse preserves source and advice is not duplicated', () => {
  const circle: SketchShape = { kind: 'circle', c: [0, 0], r: 5 }, before = structuredClone(circle);
  assert.deepEqual(offsetShape(circle, 0.05), { shape: { ...circle, r: 5.05 } });
  assert.ok('error' in offsetShape(circle, -5)); assert.deepEqual(circle, before);
  const message = 'That offset turns the outline inside out: use a smaller one.';
  assert.equal(offsetRecoveryMessage(message), message);
});
