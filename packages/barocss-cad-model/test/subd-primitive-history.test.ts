import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { readStudioDoc } from '../src/engine/migrate';
import { evaluateDoc } from '../src/engine/evaluate';
import { primitives } from '../src/app/primitives';
import { subdPrimitiveHistoryEdit } from '../src/app/subdPrimitiveEdit';
import { updateSubdCage } from '../src/subd/cageProvenance';
import type { Ctx, Values } from '../src/app/commands';
const context = (doc: StudioDoc): Ctx => ({ doc, bodies: [], selection: { bodies: [], edges: [], faces: [] } });
function fixture(kind: string) {
  const cmd = primitives.find(c => c.id === kind)!, ctx = context(emptyDoc());
  return cmd.build!(ctx, { ...cmd.defaults!(ctx), nu: 6, ...(kind === 'subd-torus' ? { nv: 4 } : { nh: 1 }) });
}
test('new numeric recipes replay and edit without changing identity or outputs', () => {
  for (const kind of ['subd-torus', 'subd-tube']) {
    const doc = fixture(kind), snapshot = JSON.stringify(doc), node = doc.nodes[0]; assert.equal(node.kind, 'subd');
    if (node.kind !== 'subd') continue;
    assert.equal(node.made!.nodes, 1); assert.ok(Object.values(node.made!.values).every(v => typeof v === 'number'));
    const edit = subdPrimitiveHistoryEdit(doc, 0); assert.ok(edit);
    assert.equal(edit.build!(context(doc), edit.defaults!(context(doc))), doc);
    const next = edit.build!(context(doc), { ...edit.defaults!(context(doc)), r: kind === 'subd-torus' ? 5 : 22 });
    assert.equal(next.nodes[0].id, node.id); assert.equal(next.outputs, doc.outputs);
    assert.notDeepEqual(next.nodes[0], node); assert.ok(subdPrimitiveHistoryEdit(next, 0));
    assert.throws(() => edit.build!(context({ ...doc }), edit.defaults!(context(doc))), /current SubD/);
    const loaded = readStudioDoc(JSON.stringify(next)); assert.ok(!('error' in loaded));
    assert.ok(subdPrimitiveHistoryEdit(loaded.doc, 0));
    assert.equal(JSON.stringify(doc), snapshot);
  }
});
test('creation refuses malformed counts, dimensions and overflowing coordinates before saving a recipe', () => {
  for (const kind of ['subd-torus', 'subd-tube']) {
    const cmd = primitives.find(c => c.id === kind)!, ctx = context(emptyDoc()), defaults = cmd.defaults!(ctx);
    const patches: Values[] = [{ nu: 1e12 }, { nu: 4.5 }, { nu: Infinity }, { r: NaN }, { x: '' }, { x: Number.MAX_VALUE }, { r: -1 }];
    for (const patch of patches)
      assert.throws(() => cmd.build!(ctx, { ...defaults, ...patch }), /SubD primitive/);
  }
});
test('legacy, manual cage edits and malformed unbounded recipes never regain primitive editing', () => {
  const doc = fixture('subd-torus'), node = doc.nodes[0]; if (node.kind !== 'subd') throw new Error('subd');
  const variants = [
    { ...node, made: undefined }, { ...node, mirror: 'x' as const }, { ...node, held: 'test' },
    { ...node, name: 'changed' }, { ...node, cage: { ...node.cage, positions: node.cage.positions.map((v, i) => i ? v : v + 1) } },
    { ...node, cage: { ...node.cage, faces: node.cage.faces.map((f, i) => i ? f : [...f].reverse()) } },
    { ...node, cage: { ...node.cage, creases: [[0, 1] as [number, number]] } },
    ...[Infinity, 1e12, 4.5, -1, NaN].map(nu => ({ ...node, made: { ...node.made!, values: { ...node.made!.values, nu } } })),
  ];
  for (const variant of variants) assert.equal(subdPrimitiveHistoryEdit({ ...doc, nodes: [variant] }, 0), null);
  assert.equal(subdPrimitiveHistoryEdit({ ...doc, nodes: [...doc.nodes, { ...node, id: 'n2' }] }, 0), null);
});
test('actual cage and mirror changes discard recipes, unchanged sessions preserve them', () => {
  const node = fixture('subd-tube').nodes[0]; if (node.kind !== 'subd') throw new Error('subd');
  assert.equal(updateSubdCage(node, structuredClone(node.cage)), node);
  assert.equal(updateSubdCage(node, node.cage, 'x').made, undefined);
  assert.equal(updateSubdCage(node, { ...node.cage, positions: node.cage.positions.map((v, i) => i ? v : v + 1) }).made, undefined);
  assert.ok(node.made);
});
test('small saved SubD primitive remains evaluable after radius edit', () => {
  const doc = fixture('subd-torus'), edit = subdPrimitiveHistoryEdit(doc, 0)!;
  const result = evaluateDoc(edit.build!(context(doc), { ...edit.defaults!(context(doc)), R: 24 }), 1);
  assert.ok(result.ok, result.ok ? '' : result.error.detail);
  assert.ok(result.bodies[0].volume! > 0);
});
