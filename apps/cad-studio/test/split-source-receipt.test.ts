import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { splitParentBounds, splitSourceCurrent, type SplitSourceOwner } from '../src/state/splitSourceReceipt';

const source = (): SplitSourceOwner => {
  const doc = emptyDoc();
  return { doc, commandDoc: doc, evaluated: doc, worker: {}, open: {}, engine: {}, marker: null, variant: null,
    fresh: true, busy: false, instances: false, inPlace: false };
};
test('split evidence belongs to exact accepted source and open/worker scope', () => {
  const a = source();
  assert.equal(splitSourceCurrent(a, { ...a }), true);
  for (const patch of [{ doc: emptyDoc() }, { commandDoc: emptyDoc() }, { evaluated: emptyDoc() },
    { worker: {} }, { open: {} }, { engine: {} }, { marker: 1 }, { variant: 'v' },
    { fresh: false }, { busy: true }, { instances: true }, { inPlace: true }]) {
    assert.equal(splitSourceCurrent(a, { ...a, ...patch }), false);
    assert.equal(splitSourceCurrent({ ...a, ...patch }, a), false);
  }
});
test('only exact unique parent key/ref supplies copied finite bounds', () => {
  const base = rectanglePart(40, 30, 10);
  const doc: StudioDoc = { ...base, nodes: [...base.nodes,
    { kind: 'split', parent: { node: 1, side: 'solid' }, axis: 'x', normal: [1, 1, 0], at: 10 },
  ] };
  const body = { key: 'b1', ref: { node: 1, side: 'solid' }, mesh: { bounds: { min: [0, 0, 0], max: [40, 30, 10] } } } as BodyResult;
  const box = splitParentBounds(doc, 2, [body]);
  assert.deepEqual(box, body.mesh.bounds);
  assert.notEqual(box?.min, body.mesh.bounds.min);
  assert.equal(splitParentBounds(doc, 2, [body, body]), null);
  assert.equal(splitParentBounds(doc, 2, [{ ...body, key: 'other' }]), null);
  assert.equal(splitParentBounds(doc, 2, [{ ...body, ref: { node: 1, side: 'negative' } }]), null);
  assert.equal(splitParentBounds(doc, 2, []), null);
  assert.equal(splitParentBounds(doc, 2, [{ ...body, mesh: { ...body.mesh, bounds: { min: [NaN, 0, 0], max: [40, 30, 10] } } }]), null);
});
test('late source completion cannot install after replacement but captured evidence survives editor close', async () => {
  const a = source(); let current = a; let editor = true; let installed = false;
  const evidenceCurrent = () => splitSourceCurrent(a, current);
  const pending = Promise.resolve().then(() => { if (editor && evidenceCurrent()) installed = true; });
  editor = false; await pending;
  assert.equal(installed, false);
  assert.equal(evidenceCurrent(), true);
  current = { ...a, open: {} };
  assert.equal(evidenceCurrent(), false);
});
