import test from 'node:test';
import assert from 'node:assert/strict';
import { featureLabel, shapeLabel, type ModelNode } from '../src/engine/doc';

test('offset labels preserve the signed stored distance without display rounding', () => {
  for (const distance of [-35.918, -35.916, 0.00123456789, -0.0000001, 3, -2]) {
    const expected = `Offset face ${distance > 0 ? '+' : ''}${distance} mm`;
    const node: ModelNode = { kind: 'offset-face', parent: { node: 0, side: 'solid' }, faces: ['wall'], distance };
    assert.equal(featureLabel(node, 1, [node]), expected);
    assert.equal(shapeLabel({ command: 'offset-face', nodes: 3, values: { d: distance, face: 'wall' } }), expected);
    assert.equal(Number(expected.slice('Offset face '.length, -3)), distance);
  }
});
