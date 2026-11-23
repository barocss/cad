import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode, type StudioDoc, type PartInstance } from '../src/engine/doc';
import { exportStudioStep, type StudioStepRootScope } from '../src/engine/evaluate';
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

test('visible root scope filters the actual STEP solids and preserves the default file and source revision', () => {
  const doc: StudioDoc = { ...two(), bodies: { b3: { hidden: true } } };
  const before = structuredClone(doc), all = exportStudioStep(doc, options);
  assert.deepEqual(exportStudioStep(doc, { ...options, rootScope: 'all' }), all);
  const visible = exportStudioStep(doc, { ...options, rootScope: 'visible' });
  assert.deepEqual(visible.scope, { rootBodies: 1, hiddenRootBodies: 0, excludedHiddenRootBodies: 1, placedBodies: 0, occurrences: 0, nativeBodies: 1 });
  assert.deepEqual([...visible.text.matchAll(/=MANIFOLD_SOLID_BREP\('([^']+)'/g)].map(match => match[1]), ['n1_b0']);
  assert.equal(visible.source, all.source);
  assert.deepEqual(doc, before);
  assert.throws(() => exportStudioStep(doc, { ...options, rootScope: 'selected' as StudioStepRootScope }), /valid STEP root body scope/);
});

test('visible roots leave the occurrence rules intact and refuse an empty scope', () => {
  const doc: StudioDoc = { ...two(), bodies: { b1: { hidden: true }, b3: { hidden: true } },
    instances: [occurrence('shown', box()), { ...occurrence('hidden', box()), hidden: true }] };
  const visible = exportStudioStep(doc, { ...options, rootScope: 'visible' });
  assert.deepEqual(visible.scope, { rootBodies: 0, hiddenRootBodies: 0, excludedHiddenRootBodies: 2, placedBodies: 1, occurrences: 1, nativeBodies: 1 });
  const hidden = { ...doc, instances: doc.instances!.map(instance => ({ ...instance, hidden: true as const })) };
  assert.throws(() => exportStudioStep(hidden, { ...options, rootScope: 'visible' }), /no visible root or placed bodies/);
  assert.equal(exportStudioStep(hidden, options).scope.rootBodies, 2);
});

test('an excluded hidden mesh cannot change or block the visible B-rep export', () => {
  const doc: StudioDoc = { ...withNode(box(), { kind: 'mesh', name: 'Mesh candidate', unit: 'mm', representation: 'facets',
    positions: [20, 0, 0, 30, 0, 0, 20, 10, 0, 20, 0, 10], indices: [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3] }), bodies: { b2: { hidden: true } } };
  const visible = exportStudioStep(doc, { ...options, meshes: 'planar', rootScope: 'visible' });
  assert.match(visible.text, /AUTOMOTIVE_DESIGN/);
  assert.equal(visible.scope.excludedHiddenRootBodies, 1);
  assert.equal(visible.text.split('DATA;')[1], exportStudioStep(box(), options).text.split('DATA;')[1]);
  const defaultFile = exportStudioStep(doc, { ...options, meshes: 'tessellated' });
  assert.equal(defaultFile.scope.hiddenRootBodies, 1);
  assert.match(defaultFile.text, /AP242_/);
});

test('a hidden exact sheet that stops default STEP is outside visible-root geometry admission', () => {
  const doc: StudioDoc = { ...withNode(box(), { kind: 'subd', name: 'Open quad', cage: {
    positions: [20, 0, 0, 30, 0, 0, 30, 10, 0, 20, 10, 0], faces: [[0, 1, 2, 3]],
  } }), bodies: { b2: { hidden: true } } };
  assert.throws(() => exportStudioStep(doc, options), /contains an exact surface that STEP export does not support/);
  const visible = exportStudioStep(doc, { ...options, rootScope: 'visible' });
  assert.equal(visible.scope.excludedHiddenRootBodies, 1);
  assert.equal(visible.scope.nativeBodies, 1);
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
