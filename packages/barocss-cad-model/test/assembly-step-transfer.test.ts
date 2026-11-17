import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, type StudioDoc } from '../src/engine/doc';
import { readStudioDoc } from '../src/engine/migrate';
import { moveAssemblyStepParts, stepHolding, stepStateOf } from '../src/assembly/steps';
const source = (): StudioDoc => ({ ...emptyDoc(), instances: ['plate', 'bolt', 'cap', 'spare'].map((id, k) => ({ id, name: id, doc: rectanglePart(10, 10, 5), position: [k * 20, 0, 0], rotation: [0, 0, 0], grounded: k === 0 })), assemblySteps: [
  { id: 'mount', name: 'Mount', add: ['plate', 'bolt'], note: 'Preserve', explode: 0.5, view: { eye: [100, -100, 100], target: [0, 0, 0], up: [0, 0, 1] } },
  { id: 'finish', name: 'Finish', add: ['cap'] },
] });
test('explicit transfer moves membership atomically, preserves order/metadata/geometry, and introduces an unassigned part once', () => {
  const doc = source(), before = JSON.stringify(doc);
  const next = moveAssemblyStepParts(doc, 'finish', ['bolt', 'plate', 'bolt', 'spare']).doc;
  assert.deepEqual(next.assemblySteps!.map(s => s.add), [[], ['cap', 'bolt', 'plate', 'spare']]);
  assert.deepEqual(next.assemblySteps![0], { ...doc.assemblySteps![0], add: [] });
  assert.equal(next.instances, doc.instances); assert.equal(next.nodes, doc.nodes); assert.equal(next.mates, doc.mates);
  assert.deepEqual(stepStateOf(next, 0).waiting, ['plate', 'bolt', 'cap', 'spare']);
  assert.deepEqual(stepStateOf(next, 1).active, ['cap', 'bolt', 'plate', 'spare']);
  assert.deepEqual(stepStateOf(next, 1).unassigned, []);
  assert.equal(stepHolding(next, id => id === 'plate')!.id, 'finish', 'removal lock follows destination');
  assert.equal(JSON.stringify(doc), before);
});
test('empty or already-owned selection is an identity no-op; duplicate requests never duplicate membership', () => {
  const doc = source(); assert.equal(moveAssemblyStepParts(doc, 'finish', []).doc, doc);
  assert.equal(moveAssemblyStepParts(doc, 'mount', ['plate', 'plate']).doc, doc);
  const next = moveAssemblyStepParts(doc, 'finish', ['cap', 'bolt', 'bolt']).doc;
  assert.deepEqual(next.assemblySteps!.map(s => s.add), [['plate'], ['cap', 'bolt']]);
});
test('unknown destination or a mixed valid/invalid selection refuses without partial transfer', () => {
  const doc = source(), before = JSON.stringify(doc);
  for (const bad of ['missing', 'base', 'plate/child']) assert.throws(() => moveAssemblyStepParts(doc, 'finish', ['bolt', bad]));
  assert.throws(() => moveAssemblyStepParts(doc, 'missing', ['plate']));
  assert.equal(JSON.stringify(doc), before);
});
test('unrelated unresolved references stay held, and native read keeps reassigned occurrences', () => {
  const doc = source();doc.assemblySteps![0].add.push('lost');
  const next = moveAssemblyStepParts(doc, 'finish', ['bolt']).doc;
  assert.deepEqual(next.assemblySteps![0].add, ['plate', 'lost']);
  assert.deepEqual(stepStateOf(next, 0).unresolved, ['lost']);
  const read = readStudioDoc(JSON.stringify(next));assert.ok('doc' in read);
  assert.deepEqual(read.doc.assemblySteps, next.assemblySteps);
});
