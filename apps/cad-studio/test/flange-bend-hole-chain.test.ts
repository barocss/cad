import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { SheetRuleSource } from '../src/state/sharedSheetRules';
import { flangeBendOwners, canOpenFlangeBendOwner } from '../src/state/flangeBendOwners';

// Synthetic guard packets only: no native Hole geometry, margins or constructibility proof.
// The producer and actual D121 baseline independently establish native provenance.
function fixture(count = 1, explicitZ = false) {
  const doc: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
    { id: 'outline-X', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [100, 70] },
    { id: 'rules-Q', kind: 'sheet-base', sketch: 0, thickness: 1.5, bendRadius: 1.5, kFactor: .44 },
    { id: 'flange-Z', kind: 'sheet-flange', parent: { node: 1, side: 'solid' }, edges: ['edge-a'], length: 25 },
    { id: 'flange-A', kind: 'sheet-flange', parent: { node: 2, side: 'solid' }, edges: ['edge-b'], length: 25, bendRadius: 2 },
  ], outputs: {}, nextId: 4 };
  for (let i = 0; i < count; i++) doc.nodes.push({ id: 'drill-' + (31 - i), kind: 'hole', parent: { node: doc.nodes.length - 1, side: 'solid' }, center: [12 + i * 10, 12], radius: 1.6, ...(explicitZ ? { axis: 'z' as const } : {}) });
  const last = doc.nodes.length - 1; doc.outputs.result = { node: last, side: 'solid' }; doc.nextId = last + 1;
  const body = { key: 'result', ref: { node: last, side: 'solid' }, sheet: {}, flat: { bends: [{ name: 'display-1', faces: ['face-b'] }, { name: 'display-2', faces: ['face-a'] }] }, sheetBendOwners: [{ featureId: 'flange-Z', faces: ['face-a'] }, { featureId: 'flange-A', faces: ['face-b'] }] } as unknown as BodyResult;
  const source: SheetRuleSource = { doc, evaluated: { ...doc, nodes: [...doc.nodes] }, bodies: [body], open: {}, generation: {}, worker: 1, available: true };
  return { doc, body, source };
}
type Fixture = ReturnType<typeof fixture>;
function sync(f: Fixture) { f.source.evaluated = { ...f.doc, nodes: [...f.doc.nodes] }; }
function reject(change: (f: Fixture) => void) { const f = fixture(4); change(f); sync(f); assert.deepEqual(flangeBendOwners(f.source, f.body), []); }

test('default and explicit Z through-Hole suffixes of one and four retain exact Flange navigation', () => {
  for (const count of [1, 4]) for (const explicitZ of [false, true]) {
    const f = fixture(count, explicitZ), before = JSON.stringify([f.doc, f.body]);
    const rows = flangeBendOwners(f.source, f.body);
    assert.deepEqual(rows.map(r => [r.index, r.id, r.rulesId, r.radiusSource]), [[3, 'flange-A', 'rules-Q', 'own'], [2, 'flange-Z', 'rules-Q', 'sheet']]);
    for (const row of rows) assert.ok(canOpenFlangeBendOwner(f.source, { ...f.source }, f.body, row));
    assert.equal(JSON.stringify([f.doc, f.body]), before);
  }
});

test('unsupported Hole fields and malformed numeric inputs fail closed, not only the last Hole', () => {
  const patches: Record<string, unknown>[] = [
    { axis: 'x' }, { axis: 'y' }, { depth: 1 }, { depth: 0 }, { face: 'n1.top' }, { side: 'min' }, { side: 'max' },
    { csk: 3 }, { countersink: 3 }, { thread: 'M3' }, { pattern: { count: 2, step: [10, 0] } }, { made: {} },
    { radius: { parameter: 'R' } }, { center: [{ parameter: 'X' }, 12] }, { radius: NaN }, { radius: Infinity }, { radius: 0 }, { radius: -1 },
    { center: [12, NaN] }, { center: [Infinity, 12] }, { center: [12] }, { mystery: true }, { suppressed: true }, { held: 'reference' },
  ];
  for (const patch of patches) reject(f => {
    // Explicit malformed external-data boundary; not a valid Model node construction.
    f.doc.nodes[5] = { ...f.doc.nodes[5], ...patch } as unknown as StudioDoc['nodes'][number];
  });
});

test('Hole phase cannot reenter relief or Flange, skip parents, branch outputs or change side', () => {
  const changes: ((f: Fixture) => void)[] = [
    f => { f.doc.nodes[2] = { id: 'early-hole', kind: 'hole', parent: { node: 1, side: 'solid' }, center: [12, 12], radius: 1 }; },
    f => { f.doc.nodes[3] = { id: 'early-hole', kind: 'hole', parent: { node: 2, side: 'solid' }, center: [12, 12], radius: 1 }; },
    f => { f.doc.nodes[5] = { id: 'reentry', kind: 'sheet-flange', parent: { node: 4, side: 'solid' }, edges: ['edge-c'], length: 20 }; },
    f => { f.doc.nodes[5] = { id: 'reentry', kind: 'sheet-corner-relief', parent: { node: 4, side: 'solid' }, edges: ['corner'], shape: 'square', size: 2 }; },
    f => { const n = f.doc.nodes[5]; if (n.kind === 'hole') n.parent = { node: 3, side: 'solid' }; },
    f => { const n = f.doc.nodes[4]; if (n.kind === 'hole') n.parent = { node: 1, side: 'solid' }; },
    f => { const n = f.doc.nodes[5]; if (n.kind === 'hole') n.parent = { node: 4, side: 'positive' }; },
    f => { f.doc.outputs.result = { node: 3, side: 'solid' }; },
    f => { f.doc.outputs.alias = { ...f.doc.outputs.result }; },
    f => { f.body.ref = { node: f.doc.nodes.length - 1, side: 'negative' }; },
    f => { f.doc.nodes[6] = { ...f.doc.nodes[6], id: f.doc.nodes[5].id }; },
    f => { f.doc.nodes[5] = { id: 'cut', kind: 'difference', parent: { node: 4, side: 'solid' }, tool: { node: 1, side: 'solid' } }; },
  ];
  for (const change of changes) reject(change);
});

test('remaining native owner and flat face evidence must stay complete, disjoint and bijective', () => {
  const changes: ((f: Fixture) => void)[] = [
    f => { f.body.sheetBendOwners = f.body.sheetBendOwners!.slice(0, 1); },
    f => { f.body.sheetBendOwners = [{ featureId: 'flange-Z', faces: ['face-a'] }, { featureId: 'flange-A', faces: ['face-a'] }]; },
    f => { f.body.sheetBendOwners = [{ featureId: 'drill-31', faces: ['face-a'] }, { featureId: 'flange-A', faces: ['face-b'] }]; },
    f => { f.body.sheetBendOwners = [{ featureId: 'flange-Z', faces: ['face-a#1'] }, { featureId: 'flange-A', faces: ['face-b'] }]; },
    f => { const flat = f.body.flat!; f.body.flat = { ...flat, bends: [{ ...flat.bends[0], faces: ['face-a', 'face-b'] }, flat.bends[1]] }; },
    f => { const flat = f.body.flat!; f.body.flat = { ...flat, bends: [flat.bends[0], flat.bends[0]] }; },
  ];
  for (const change of changes) reject(change);
});

test('issued Hole-chain rows cannot survive current generation, owner clone or in-place Hole mutation', () => {
  const f = fixture(4), rows = flangeBendOwners(f.source, f.body); assert.equal(rows.length, 2);
  for (const current of [{ ...f.source, generation: {} }, { ...f.source, open: {} }, { ...f.source, worker: 2 }, { ...f.source, doc: { ...f.doc } }, { ...f.source, available: false }]) {
    for (const row of rows) assert.equal(canOpenFlangeBendOwner(f.source, current, f.body, row), false);
  }
  assert.equal(canOpenFlangeBendOwner(f.source, f.source, f.body, { ...rows[0] }), false);
  const hole = f.doc.nodes[5]; assert.equal(hole.kind, 'hole'); if (hole.kind === 'hole') hole.radius = 2;
  for (const row of rows) assert.equal(canOpenFlangeBendOwner(f.source, f.source, f.body, row), false);
});
