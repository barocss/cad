import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields, type BindableField } from '../src/app/editFields';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
function fixture(): StudioDoc {
  return withNode(withNode({ ...emptyDoc(), parameters: { Angle: 90, Run: 12, Radius: 25 } },
    { kind: 'sketch', profile: 'circle', center: [0, 0], radius: 5 }),
  { kind: 'sweep', sketch: 0, path: [{ kind: 'straight', length: 8 }, { kind: 'bend', radius: 20, angle: 90, toward: 'x' }, { kind: 'straight', length: 8 }, { kind: 'bend', radius: 30, angle: 45, toward: '-y' }] });
}
function field(doc: StudioDoc, key: string, parameters = doc.parameters) {
  const f = editFields(doc.nodes, 1, parameters).find(f => f.key === key); assert.ok(f?.kind === 'number'); return f;
}
test('Every Pipe bend angle remains numeric with no unsupported parameter binding API', () => {
  const doc = fixture(), before = structuredClone(doc);
  for (const parameters of [doc.parameters, {}, { Angle: NaN }, { Angle: Infinity }, Object.create({ Angle: 90 })]) {
    for (const [key, value] of [['bendAngle1', 90], ['bendAngle3', 45]] as const) {
      const angle = field(doc, key, parameters); assert.equal('bind' in angle, false); assert.equal('param' in angle, false);
      assert.equal(angle.get(doc.nodes), value); assert.equal(angle.unit, '°');
    }
  }
  assert.deepEqual(doc, before);
});
test('Numeric bend edits preserve the rest of the path, profile and original document', () => {
  const doc = fixture(), before = structuredClone(doc), f = field(doc, 'bendAngle1');
  for (const value of [30, 60, 120, 180]) {
    const nodes = f.set(doc.nodes, value), node = nodes[1], old = doc.nodes[1];
    assert.ok(node.kind === 'sweep' && old.kind === 'sweep'); if (node.kind !== 'sweep' || old.kind !== 'sweep') throw new Error('sweep');
    assert.deepEqual(node.path[1], { ...old.path[1], angle: value });
    for (const i of [0, 2, 3]) assert.equal(node.path[i], old.path[i]);
    assert.equal(nodes[0], doc.nodes[0]); assert.equal(f.get(nodes), value);
  }
  assert.deepEqual(doc, before);
});
test('Run and Bend radius retain supported Dim bindings without replacing numeric angles', () => {
  const doc = fixture(), before = structuredClone(doc);
  for (const [key, name, value] of [['run0', 'Run', 12], ['bend1', 'Radius', 25]] as const) {
    const f = field(doc, key); assert.ok('bind' in f); const bind = f as BindableField;
    const nodes = bind.bind(doc.nodes, name); assert.ok(nodes); assert.equal(bind.get(nodes), value); assert.equal(bind.param(nodes), name);
    assert.equal(field(doc, 'bendAngle1').get(nodes), 90); assert.equal(nodes[0], doc.nodes[0]);
    assert.equal(bind.bind(doc.nodes, 'Missing'), null);
  }
  assert.deepEqual(doc, before);
});
test('Captured numeric field edits only the provided document and does not resolve angle parameter names', () => {
  const first = fixture(), other = { ...fixture(), parameters: { Angle: 120, Run: 15, Radius: 30 } }, old = structuredClone(other);
  const f = field(first, 'bendAngle1'), nodes = f.set(other.nodes, 60); assert.equal(f.get(nodes), 60);
  assert.deepEqual(other, old); assert.deepEqual(first, fixture());
});
