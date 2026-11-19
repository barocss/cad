import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { SheetRuleSource } from '../src/state/sharedSheetRules';
import { flangeBendOwners, canOpenFlangeBendOwner } from '../src/state/flangeBendOwners';

// Synthetic navigation-guard packets only. These tests do not prove native geometry,
// physical constructibility of arbitrary-length chains, or editing admission.
function fixture(count = 4, reliefs = 2) {
  const doc: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
    { id: 'outline-custom', kind: 'sketch', profile: 'rectangle', min: [-4, 8], max: [76, 58] },
    { id: 'shared-custom', kind: 'sheet-base', sketch: 0, thickness: 1.5, bendRadius: 1.5, kFactor: .44 },
  ], outputs: {}, nextId: 2 };
  for (let i = 0; i < reliefs; i++) doc.nodes.push({ id: 'relief-' + i, kind: 'sheet-corner-relief', parent: { node: doc.nodes.length - 1, side: 'solid' }, edges: ['corner-' + i], shape: i % 2 ? 'round' : 'square', size: 3 });
  const start = doc.nodes.length;
  const owners = Array.from({ length: count }, (_, i) => ({ featureId: 'authored-' + (97 - i * 3), faces: ['native-face-' + i] }));
  for (let i = 0; i < count; i++) doc.nodes.push({ id: owners[i].featureId, kind: 'sheet-flange', parent: { node: doc.nodes.length - 1, side: 'solid' }, edges: ['edge-' + i], length: 20, ...(i % 2 ? { bendRadius: 2 } : {}) });
  const last = doc.nodes.length - 1;
  doc.outputs.result = { node: last, side: 'solid' }; doc.nextId = doc.nodes.length;
  const body = { key: 'result', ref: { node: last, side: 'solid' }, sheet: {}, flat: { bends: [...owners].reverse().map((o, i) => ({ name: 'unrelated-label-' + i, faces: [...o.faces] })) }, sheetBendOwners: owners } as unknown as BodyResult;
  const source: SheetRuleSource = { doc, evaluated: { ...doc, nodes: [...doc.nodes] }, bodies: [body], open: {}, generation: {}, worker: 1, available: true };
  return { doc, body, source, start, count, owners };
}
type Fixture = ReturnType<typeof fixture>;
function sync(f: Fixture) { f.source.evaluated = { ...f.doc, nodes: [...f.doc.nodes] }; }
function reject(change: (f: Fixture) => void) {
  const f = fixture(); change(f); sync(f);
  assert.deepEqual(flangeBendOwners(f.source, f.body), []);
}

test('synthetic 2, 3, 4 and 7-Flange chains with zero or multiple prior reliefs have complete owner bijections', () => {
  for (const count of [2, 3, 4, 7]) for (const reliefs of [0, 1, 3]) {
    const f = fixture(count, reliefs), before = JSON.stringify([f.doc, f.body]);
    const rows = flangeBendOwners(f.source, f.body);
    assert.equal(rows.length, count);
    assert.deepEqual(rows.map(r => r.id), [...f.owners].reverse().map(o => o.featureId));
    for (const row of rows) {
      assert.equal(row.node, f.doc.nodes[row.index]); assert.equal(row.rulesIndex, 1);
      assert.equal(row.rulesId, 'shared-custom'); assert.equal(row.rulesNode, f.doc.nodes[1]);
      assert.equal(row.radiusSource, (row.index - f.start) % 2 ? 'own' : 'sheet');
      assert.ok(canOpenFlangeBendOwner(f.source, { ...f.source }, f.body, row));
    }
    assert.equal(JSON.stringify([f.doc, f.body]), before);
  }
});

test('only a contiguous relief prefix then at least two Flanges is admitted', () => {
  const one = fixture(1, 0); assert.deepEqual(flangeBendOwners(one.source, one.body), []);
  const cases: ((f: Fixture) => void)[] = [
    f => { f.doc.nodes[f.start + 1] = { id: 'reentered-relief', kind: 'sheet-corner-relief', parent: { node: f.start, side: 'solid' }, edges: ['corner'], shape: 'square', size: 2 }; },
    f => { f.doc.nodes[f.start + 1] = { id: 'unknown-branch', kind: 'translate', parent: { node: f.start, side: 'solid' }, offset: [0, 0, 0] }; },
    f => { const n = f.doc.nodes[f.start + 2]; if (n.kind === 'sheet-flange') n.parent = { node: f.start, side: 'solid' }; },
    f => { const n = f.doc.nodes[3]; if (n.kind === 'sheet-corner-relief') n.parent = { node: 1, side: 'solid' }; },
    f => { f.doc.nodes[f.start + 1] = { ...f.doc.nodes[f.start + 1], suppressed: true }; },
    f => { const n = f.doc.nodes[f.start]; if (n.kind === 'sheet-flange') n.parent = { node: f.start - 1, side: 'positive' }; },
    f => { f.doc.outputs.result = { node: f.start, side: 'solid' }; },
    f => { f.doc.outputs.alias = { ...f.doc.outputs.result }; },
    f => { f.body.ref = { node: f.doc.nodes.length - 1, side: 'negative' }; },
    f => { f.doc.nodes[f.start + 1] = { ...f.doc.nodes[f.start + 1], id: f.doc.nodes[f.start].id }; },
  ];
  for (const change of cases) reject(change);
});

test('no last missing owner, middle duplicate, nonadjacent face overlap or repeated consumption passes', () => {
  const cases: ((f: Fixture) => void)[] = [
    f => { f.body.sheetBendOwners = f.owners.slice(0, -1); },
    f => { f.body.sheetBendOwners = f.owners.map((o, i) => i === 2 ? { ...o, featureId: f.owners[1].featureId } : o); },
    f => { f.body.sheetBendOwners = f.owners.map((o, i) => i === 3 ? { ...o, faces: [...f.owners[0].faces] } : o); },
    f => { f.body.sheetBendOwners = f.owners.map((o, i) => i === 3 ? { ...o, featureId: 'not-in-chain' } : o); },
    f => { const flat = f.body.flat!; f.body.flat = { ...flat, bends: flat.bends.map((b, i) => i === 0 ? { ...b, faces: [...b.faces, ...flat.bends[2].faces] } : b) }; },
    f => { const flat = f.body.flat!; f.body.flat = { ...flat, bends: flat.bends.map((b, i) => i === 2 ? flat.bends[0] : b) }; },
    f => { const flat = f.body.flat!; f.body.flat = { ...flat, bends: flat.bends.slice(0, -1) }; },
  ];
  for (const change of cases) reject(change);
});

test('downstream blind Hole or cut remains unsupported even with output and evaluated identity updated', () => {
  for (const kind of ['hole', 'difference'] as const) reject(f => {
    const last = f.doc.nodes.length - 1;
    f.doc.nodes.push(kind === 'hole'
      ? { id: 'after-hole', kind: 'hole', parent: { node: last, side: 'solid' }, center: [20, 20], radius: 1, depth: 1 }
      : { id: 'after-cut', kind: 'difference', parent: { node: last, side: 'solid' }, tool: { node: 1, side: 'solid' } });
    f.doc.outputs.result = { node: last + 1, side: 'solid' }; f.body.ref = { node: last + 1, side: 'solid' };
  });
});

test('issued longer-chain rows reject late document, source, worker and body changes', () => {
  for (const key of ['doc', 'evaluated', 'open', 'generation', 'worker', 'available', 'bodies'] as const) {
    const f = fixture(), rows = flangeBendOwners(f.source, f.body); assert.equal(rows.length, 4);
    const current = { ...f.source };
    if (key === 'doc' || key === 'evaluated') current[key] = { ...current[key] };
    else if (key === 'open' || key === 'generation') current[key] = {};
    else if (key === 'worker') current.worker++;
    else if (key === 'available') current.available = false;
    else current.bodies = [{ ...f.body }];
    for (const row of rows) assert.equal(canOpenFlangeBendOwner(f.source, current, f.body, row), false);
  }
  for (const change of [
    (f: Fixture) => { const n = f.doc.nodes[f.start + 1]; if (n.kind === 'sheet-flange' && typeof n.length === 'number') n.length++; },
    (f: Fixture) => { f.body.sheetBendOwners = [...f.owners].reverse(); },
    (f: Fixture) => { f.body.flat = { ...f.body.flat!, bends: [...f.body.flat!.bends].reverse() }; },
  ]) {
    const f = fixture(), row = flangeBendOwners(f.source, f.body)[0]; assert.ok(row);
    change(f); assert.equal(canOpenFlangeBendOwner(f.source, f.source, f.body, row), false);
  }
});
