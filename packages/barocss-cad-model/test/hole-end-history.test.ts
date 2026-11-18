import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type StudioDoc, type ModelNode } from '../src/engine/doc';
import { editFields } from '../src/app/editFields';
import { editCommand } from '../src/app/editCommand';
import type { Ctx } from '../src/app/commands';

type Hole = Extract<ModelNode, { kind: 'hole' }>;
function fixture(patch: Record<string, unknown> = {}): StudioDoc {
  const doc = rectanglePart(40, 30, 12);
  return { ...doc, parameters: { R: 2, D: 5, X: 10 }, nodes: [...doc.nodes,
    { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [10, 15], radius: 2, ...patch } as Hole] };
}
const fields = (doc: StudioDoc) => editFields(doc.nodes, 2, doc.parameters);
function end(doc: StudioDoc) {
  const f = fields(doc).find(f => f.key === 'end');
  assert.ok(f?.kind === 'choice', 'ordinary terminal Hole exposes Ends choice');
  return f;
}
const excluded: [string, Record<string, unknown>][] = [
  ['bound depth', { depth: { parameter: 'D' } }], ['bound radius', { radius: { parameter: 'R' } }],
  ['bound centre', { center: [{ parameter: 'X' }, 15] }],
  ...[0, -1, NaN, Infinity].map(value => [`depth ${value}`, { depth: value }] as [string, Record<string, unknown>]),
  ...[0, -1, NaN, Infinity].map(value => [`radius ${value}`, { radius: value }] as [string, Record<string, unknown>]),
  ['nonfinite centre', { center: [Infinity, 15] }], ['thread', { thread: 'M6×1' }],
  ['pattern', { pattern: { count: 2, step: [5, 0] } }], ['countersink', { countersink: 8 }],
  ['legacy csk', { csk: 8 }], ['made', { made: { command: 'mount', values: {} } }],
  ['held', { held: 'reference moved' }], ['suppressed', { suppressed: true }],
  ['route member', { routeBundleMember: { bundleId: 'bundle', memberId: 'member' } }],
  ['missing parent', { parent: { node: 99, side: 'solid' } }],
  ['self parent', { parent: { node: 2, side: 'solid' } }],
  ['negative parent', { parent: { node: -1, side: 'solid' } }],
  ['fractional parent', { parent: { node: 1.5, side: 'solid' } }],
];

test('ordinary Through Hole switches to numeric Depth 6 and back to absent depth without mutation', () => {
  const doc = fixture(), before = structuredClone(doc), f = end(doc);
  assert.equal(f.label, 'Ends'); assert.equal(f.get(doc.nodes), 'through');
  assert.deepEqual(f.options.map(o => o.value).sort(), ['blind', 'through']);
  const nodes = f.set(doc.nodes, 'blind');
  assert.deepEqual(nodes[2], { ...doc.nodes[2], depth: 6 });
  assert.equal(nodes[0], doc.nodes[0]); assert.equal(nodes[1], doc.nodes[1]);
  const blind = { ...doc, nodes }, bf = end(blind);
  assert.equal(bf.get(nodes), 'blind');
  const depth = fields(blind).find(f => f.key === 'depth'); assert.ok(depth?.kind === 'number');
  assert.equal(depth.get(nodes), 6);
  const through = bf.set(nodes, 'through'); assert.deepEqual(through, doc.nodes);
  assert.equal(Object.hasOwn(through[2], 'depth'), false);
  assert.equal(fields({ ...doc, nodes: through }).some(f => f.key === 'depth'), false);
  assert.deepEqual(doc, before);
});

test('all axes, entry sides and saved face identity survive termination changes', () => {
  for (const axis of ['x', 'y', 'z'] as const) for (const side of ['min', 'max'] as const) {
    const doc = fixture({ axis, side, face: 'n1.side0', depth: 3, name: 'mount hole' });
    const before = structuredClone(doc), h = doc.nodes[2] as Hole;
    const nodes = end(doc).set(doc.nodes, 'through');
    const { depth, ...expected } = h; assert.equal(depth, 3); assert.deepEqual(nodes[2], expected);
    const next = nodes[2] as Hole;
    assert.equal(next.parent, h.parent); assert.equal(next.center, h.center);
    assert.deepEqual(doc, before);
  }
});

test('same choice and unknown values preserve current custom depth and source', () => {
  for (const patch of [{}, { depth: 3.25 }]) {
    const doc = fixture(patch), before = structuredClone(doc), f = end(doc);
    for (const value of [f.get(doc.nodes), '', 'invalid', 'Through']) {
      assert.deepEqual(f.set(doc.nodes, value), doc.nodes); assert.deepEqual(doc, before);
    }
  }
});

test('unsupported scalar, special and invalid parent variants do not expose Ends; existing fields remain', () => {
  for (const [label, patch] of excluded) {
    const doc = fixture(patch), before = structuredClone(doc), fs = fields(doc);
    assert.equal(fs.some(f => f.key === 'end'), false, label);
    assert.ok(fs.some(f => f.key === 'dia'), label); assert.ok(fs.some(f => f.key === 'c0'), label);
    if (patch.depth !== undefined) assert.ok(fs.some(f => f.key === 'depth'), label);
    assert.deepEqual(doc, before);
  }
});

test('following nodes and counterbore child Hole cannot convert termination', () => {
  const doc = fixture();
  const followed = { ...doc, nodes: [...doc.nodes, { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [10, 15], radius: 4, depth: 2 } as Hole] };
  assert.equal(fields(followed).some(f => f.key === 'end'), false);
  assert.equal(editFields(followed.nodes, 3, followed.parameters).some(f => f.key === 'end'), false);
});

test('captured setter rechecks current nodes and refuses newly ineligible targets', () => {
  const original = fixture(), f = end(original), originalBefore = structuredClone(original);
  for (const [label, patch] of excluded) {
    const current = fixture(patch), before = structuredClone(current);
    assert.deepEqual(f.set(current.nodes, 'blind'), current.nodes, label);
    assert.deepEqual(current, before, label);
  }
  const followed = [...original.nodes, original.nodes[0]];
  assert.deepEqual(f.set(followed, 'blind'), followed);
  const changedKind = original.nodes.slice(0, 2).concat(original.nodes[0]);
  assert.deepEqual(f.set(changedKind, 'blind'), changedKind);
  assert.deepEqual(original, originalBefore);
});

test('drag-edit HUD does not expose History-only Ends and retains numeric diameter/depth edits', () => {
  for (const patch of [{}, { depth: 5 }]) {
    const doc = fixture(patch), before = structuredClone(doc), command = editCommand(2, doc.nodes, doc);
    assert.ok(command?.fields && command.defaults && command.build);
    const ctx: Ctx = { doc, bodies: [], selection: { faces: [], edges: [], bodies: [] } };
    assert.equal(command.fields(ctx).some(field => field.key === 'end'), false);
    const values = command.defaults(ctx);
    const next = command.build(ctx, { ...values, end: patch.depth === undefined ? 'blind' : 'through', dia: 6 });
    assert.deepEqual(next.nodes[2], { ...doc.nodes[2], radius: 3 });
    assert.deepEqual(doc, before);
  }
});
