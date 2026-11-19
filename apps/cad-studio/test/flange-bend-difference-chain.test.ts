import test from 'node:test';
import assert from 'node:assert/strict';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { SheetRuleSource } from '../src/state/sharedSheetRules';
import { flangeBendOwners, canOpenFlangeBendOwner } from '../src/state/flangeBendOwners';

// Synthetic authenticated guard packets, not a native Difference or material-removal oracle.
// Actual D121/native producer coverage is separate; names below deliberately carry no node indices.
function fixture(flangeCount = 2, holeCount = 0) {
  const doc: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
    { id: 'outline', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [100, 70] },
    { id: 'rules', kind: 'sheet-base', sketch: 0, thickness: 1.5, bendRadius: 1.5, kFactor: .44 },
    { id: 'corner', kind: 'sheet-corner-relief', parent: { node: 1, side: 'solid' }, edges: ['corner-edge'], shape: 'square', size: 3 },
  ], outputs: {} };
  for (let i = 0; i < flangeCount; i++) doc.nodes.push({ id: 'flange-' + (20 - i), kind: 'sheet-flange', parent: { node: doc.nodes.length - 1, side: 'solid' }, edges: ['rim-' + i], length: 25 });
  for (let i = 0; i < holeCount; i++) doc.nodes.push({ id: 'hole-' + i, kind: 'hole', parent: { node: doc.nodes.length - 1, side: 'solid' }, center: [12 + i * 10, 12], radius: 1.6 });
  const start = doc.nodes.length;
  doc.nodes.push(
    { id: 'tool-outline', kind: 'sketch', profile: 'rectangle', min: [40, -16], max: [60, -8], plane: { origin: [0, -1, 0], normal: [0, 1, 0], xAxis: [1, 0, 0] } },
    { id: 'tool-solid', kind: 'extrude', sketch: start, height: 4 },
    { id: 'result-cut', kind: 'difference', parent: { node: start - 1, side: 'solid' }, tool: { node: start + 1, side: 'solid' } },
  );
  const last = doc.nodes.length - 1; doc.outputs.result = { node: last, side: 'solid' }; doc.nextId = last + 1;
  const owners = Array.from({ length: flangeCount }, (_, i) => ({ featureId: 'flange-' + (20 - i), faces: ['native-face-' + i] }));
  const body = { key: 'result', ref: { node: last, side: 'solid' }, sheet: {}, flat: { bends: [...owners].reverse().map(o => ({ name: 'not-an-owner', faces: [...o.faces] })) }, sheetBendOwners: owners } as unknown as BodyResult;
  const source: SheetRuleSource = { doc, evaluated: { ...doc, nodes: [...doc.nodes] }, bodies: [body], open: {}, generation: {}, worker: 1, available: true };
  return { doc, body, source, start };
}
type Fixture = ReturnType<typeof fixture>;
type Node = StudioDoc['nodes'][number];
const sync = (f: Fixture) => { f.source.evaluated = { ...f.doc, nodes: [...f.doc.nodes] }; };
// Deliberately invalid decoded-data boundary, not an assertion that these are valid Model nodes.
const patch = (f: Fixture, index: number, fields: Record<string, unknown>) => { f.doc.nodes[index] = { ...f.doc.nodes[index], ...fields } as unknown as Node; };
function reject(change: (f: Fixture) => void) {
  const f = fixture(4, 2); change(f); sync(f);
  const before = JSON.stringify([f.doc, f.body]);
  assert.deepEqual(flangeBendOwners(f.source, f.body), []);
  assert.equal(JSON.stringify([f.doc, f.body]), before);
}

test('terminal plain Difference retains every exact owner through variable sheet/Hole prefixes', () => {
  for (const n of [2, 4]) for (const holes of [0, 2]) {
    const f = fixture(n, holes), before = JSON.stringify([f.doc, f.body]);
    const rows = flangeBendOwners(f.source, f.body);
    assert.equal(rows.length, n);
    assert.deepEqual(rows.map(r => r.id), [...f.body.sheetBendOwners!].reverse().map(o => o.featureId));
    for (const row of rows) {
      assert.equal(row.node, f.doc.nodes[row.index]); assert.equal(row.rulesNode, f.doc.nodes[1]);
      assert.equal(row.rulesId, 'rules'); assert.equal(row.radiusSource, 'sheet');
      assert.ok(canOpenFlangeBendOwner(f.source, { ...f.source }, f.body, row));
    }
    assert.equal(JSON.stringify([f.doc, f.body]), before);
  }
});

test('finite orthogonal frames are geometric, not a fixture plane enumeration', () => {
  const f = fixture();
  patch(f, f.start, { plane: { origin: [3, 4, 5], normal: [0, 0, 2], xAxis: [3, 4, 0] } }); sync(f);
  assert.equal(flangeBendOwners(f.source, f.body).length, 2);
  // No spatial/constructibility assertion: native mapping is supplied as an authenticated packet.
});

test('tail reference ownership, exact consumption and sole solid output fail closed', () => {
  const cases: ((f: Fixture) => void)[] = [
    f => patch(f, f.start + 2, { parent: { node: f.start + 1, side: 'solid' }, tool: { node: f.start - 1, side: 'solid' } }),
    f => patch(f, f.start + 2, { parent: { node: f.start - 2, side: 'solid' } }),
    f => patch(f, f.start + 2, { tool: { node: f.start - 1, side: 'solid' } }),
    f => patch(f, f.start + 1, { sketch: 0 }),
    f => patch(f, f.start + 2, { parent: { node: f.start - 1, side: 'positive' } }),
    f => patch(f, f.start + 2, { tool: { node: f.start + 1, side: 'negative' } }),
    f => { f.doc.outputs.tool = { node: f.start + 1, side: 'solid' }; },
    f => { f.doc.outputs.result = { node: f.start - 1, side: 'solid' }; },
    f => { f.body.ref = { node: f.start + 2, side: 'negative' }; },
    f => patch(f, f.start, { id: f.doc.nodes[0].id }),
    f => patch(f, f.start - 1, { parent: { node: 1, side: 'solid' } }),
    f => patch(f, f.start + 2, { kind: 'union', left: f.start - 1, right: f.start + 1 }),
  ];
  for (const change of cases) reject(change);
  const tooFew = fixture(1); assert.deepEqual(flangeBendOwners(tooFew.source, tooFew.body), []);
});

test('tool bindings, unknown metadata, nonfinite/degenerate geometry and unsupported modes reject', () => {
  const planes: unknown[] = [undefined, null, {}, { origin: [0, 0], normal: [0, 1, 0], xAxis: [1, 0, 0] },
    { origin: [0, NaN, 0], normal: [0, 1, 0], xAxis: [1, 0, 0] },
    { origin: [0, 0, 0], normal: [0, 0, 0], xAxis: [1, 0, 0] },
    { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [0, 0, 0] },
    { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [1, 1, 0] },
    { origin: [0, 0, 0], normal: [0, Infinity, 0], xAxis: [1, 0, 0] },
    { origin: [0, 0, 0], normal: [0, 1, 0], xAxis: [1, 0, 0], extra: true }];
  for (const plane of planes) reject(f => patch(f, f.start, { plane }));
  for (const fields of [{ min: [40, -16], max: [40, -8] }, { min: [60, -8], max: [40, -16] }, { min: [NaN, 0] }, { max: [{ parameter: 'W' }, 10] }, { suppressed: true }, { held: 'bad' }, { unknown: true }]) reject(f => patch(f, f.start, fields));
  for (const fields of [{ height: 0 }, { height: -1 }, { height: Infinity }, { height: { parameter: 'H' } }, { from: 1 }, { symmetric: true }, { draft: 2 }, { suppressed: true }]) reject(f => patch(f, f.start + 1, fields));
  for (const fields of [{ suppressed: true }, { held: 'bad' }, { unknown: true }]) reject(f => patch(f, f.start + 2, fields));
  reject(f => patch(f, 1, { thickness: { parameter: 'T' } }));
  reject(f => patch(f, 3, { length: { parameter: 'L' } }));
  reject(f => { (f.doc as unknown as Record<string, unknown>).direct = { objects: [] }; });
  reject(f => patch(f, f.start + 1, { kind: 'translate', parent: { node: f.start - 1, side: 'solid' }, offset: [1, 0, 0] }));
});

test('native sidecar and current flat must retain a complete unique disjoint bijection', () => {
  const cases: ((f: Fixture) => void)[] = [
    f => { f.body.sheetBendOwners = f.body.sheetBendOwners!.slice(1); },
    f => { f.body.sheetBendOwners = f.body.sheetBendOwners!.map((o, i) => i === 0 ? { ...o, featureId: 'result-cut' } : o); },
    f => { f.body.sheetBendOwners = f.body.sheetBendOwners!.map((o, i) => i === 0 ? { ...o, faces: ['native-face-1'] } : o); },
    f => { f.body.sheetBendOwners = f.body.sheetBendOwners!.map((o, i) => i === 0 ? { ...o, faces: ['native-face-0#split'] } : o); },
    f => { const flat = f.body.flat!; f.body.flat = { ...flat, bends: [{ ...flat.bends[0], faces: ['native-face-0', 'native-face-1'] }, ...flat.bends.slice(1)] }; },
    f => { const flat = f.body.flat!; f.body.flat = { ...flat, bends: [flat.bends[0], ...flat.bends.slice(0, -1)] }; },
    f => { f.body.flatRefused = 'cut across bend'; },
  ];
  for (const change of cases) reject(change);
});

test('deferred Difference rows retire on source/generation changes and in-place tool mutation', () => {
  const f = fixture(4, 2), rows = flangeBendOwners(f.source, f.body); assert.equal(rows.length, 4);
  for (const current of [{ ...f.source, generation: {} }, { ...f.source, open: {} }, { ...f.source, worker: 2 }, { ...f.source, doc: { ...f.doc } }, { ...f.source, evaluated: { ...f.source.evaluated } }, { ...f.source, bodies: [] }, { ...f.source, available: false }]) {
    for (const row of rows) assert.equal(canOpenFlangeBendOwner(f.source, current, f.body, row), false);
  }
  assert.equal(canOpenFlangeBendOwner(f.source, f.source, f.body, { ...rows[0] }), false);
  patch(f, f.start + 1, { height: 5 });
  for (const row of rows) assert.equal(canOpenFlangeBendOwner(f.source, f.source, f.body, row), false);
});
