import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode, type StudioDoc, type PartInstance } from '../src/engine/doc';
import { exportStudioStep } from '../src/engine/evaluate';
const options = { name: 'scope', timestamp: '2026-11-01T00:00:00' };
const box = (): StudioDoc => ({ ...emptyDoc(), nodes: [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 10] }, { id: 'n1', kind: 'extrude', sketch: 0, height: 6 }], nextId: 2 });
const two = () => withNode(withNode(box(), { kind: 'sketch', profile: 'rectangle', min: [20, 0], max: [30, 10] }), { kind: 'extrude', sketch: 2, height: 20 });
const occurrence = (id: string, doc: StudioDoc): PartInstance => ({ id, name: id, doc, position: [0, 0, 0], rotation: [0, 0, 0], part: { id: 'shared', rev: '1' } });
const infill = (doc: StudioDoc) => withNode(doc, { kind: 'mesh', name: 'infill', unit: 'mm', role: 'infill', positions: [0,0,0,1,0,0,0,1,0,0,0,1], indices: [0,2,1,0,1,3,1,2,3,2,0,3] });
test('STEP includes hidden root outputs and reports actual count without changing geometry or inputs', () => {
  const plain = exportStudioStep(two(), options);
  for (const hidden of [0, 1, 2]) {
    const doc = { ...two(), bodies: { b1: { hidden: hidden === 2 }, b3: { hidden: hidden > 0 } } };
    const before = JSON.stringify(doc), result = exportStudioStep(doc, options);
    assert.deepEqual(result.scope, { rootBodies: 2, hiddenRootBodies: hidden, placedBodies: 0, occurrences: 0, nativeBodies: 2 });
    assert.equal(result.text.split('DATA;')[1], plain.text.split('DATA;')[1]);
    assert.equal((result.text.match(/=MANIFOLD_SOLID_BREP\(/g) ?? []).length, 2);
    assert.equal(JSON.stringify(doc), before);
  }
});
test('counts use actual infill and hidden-occurrence filtering, not candidate lengths', () => {
  const doc = { ...infill(box()), instances: [occurrence('visible', two()), { ...occurrence('hidden', two()), hidden: true }, occurrence('only-infill', infill(emptyDoc()))] };
  const before = JSON.stringify(doc), result = exportStudioStep(doc, options);
  assert.deepEqual(result.scope, { rootBodies: 1, hiddenRootBodies: 0, placedBodies: 2, occurrences: 1, nativeBodies: 3 });
  assert.equal((result.text.match(/=MANIFOLD_SOLID_BREP\(/g) ?? []).length, 3);
  assert.match(result.omitted!.join(' '), /infill/);
  assert.equal(JSON.stringify(doc), before);
});
test('nested outputs count separately but contributing top-level occurrence counts once', () => {
  const nested = { ...emptyDoc(), instances: [occurrence('a', box()), occurrence('b', box()), { ...occurrence('hidden', box()), hidden: true }] };
  const result = exportStudioStep({ ...emptyDoc(), instances: [occurrence('top', nested)] }, options);
  assert.deepEqual(result.scope, { rootBodies: 0, hiddenRootBodies: 0, placedBodies: 2, occurrences: 1, nativeBodies: 2 });
});

test('empty intersection outputs contribute no body count while the writer input stays unchanged', () => {
  const empty = withNode(two(), { kind: 'intersect', left: { node: 1, side: 'solid' }, right: { node: 3, side: 'solid' } });
  const doc = { ...box(), instances: [occurrence('empty', empty)] };
  const result = exportStudioStep(doc, options);
  assert.deepEqual(result.scope, { rootBodies: 1, hiddenRootBodies: 0, placedBodies: 0, occurrences: 0, nativeBodies: 1 });
  assert.equal((result.text.match(/=MANIFOLD_SOLID_BREP\(/g) ?? []).length, 1);
});
