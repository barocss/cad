import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields, type BindableField } from '../src/app/editFields';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
function fixture(): StudioDoc {
  const doc = { ...emptyDoc(), parameters: { Angle: 180, Width: 8 } };
  return withNode(withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [5, 10] }),
    { kind: 'revolve', sketch: 0, axis: 'y', origin: [0, 0], angle: 360 });
}
function field(doc: StudioDoc, key: string, parameters: Record<string, number> | undefined = doc.parameters) {
  const found = editFields(doc.nodes, 1, parameters).find(f => f.key === key);
  assert.ok(found?.kind === 'number'); return found;
}
test('Revolve Angle stays a raw numeric field with no unsupported binding API', () => {
  const doc = fixture(), before = structuredClone(doc);
  for (const params of [doc.parameters, {}, { Angle: 360 }, { Angle: NaN }, { Angle: Infinity }, Object.create({ Angle: 90 })]) {
    const angle = field(doc, 'deg', params);
    assert.equal('bind' in angle, false); assert.equal('param' in angle, false);
    assert.equal(angle.get(doc.nodes), 360); assert.equal(angle.unit, '°');
  }
  assert.deepEqual(doc, before);
});
test('Numeric Angle edits preserve sketch, axis, origin and other documents without mutating inputs', () => {
  const doc = fixture(), before = structuredClone(doc), angle = field(doc, 'deg');
  for (const value of [90, 180, 270, 360]) {
    const nodes = angle.set(doc.nodes, value), n = nodes[1], old = doc.nodes[1];
    assert.ok(n.kind === 'revolve' && old.kind === 'revolve');
    if (n.kind !== 'revolve' || old.kind !== 'revolve') throw new Error('revolve');
    assert.equal(n.angle, value); assert.equal(angle.get(nodes), value); assert.equal(nodes[0], doc.nodes[0]);
    assert.deepEqual(n, { ...old, angle: value }); assert.equal(n.origin, old.origin);
  }
  const other = { ...fixture(), parameters: { Angle: 45, Width: 12 } }, otherBefore = structuredClone(other);
  const edited = field(other, 'deg').set(other.nodes, 270); assert.equal(field(other, 'deg').get(edited), 270);
  assert.deepEqual(other, otherBefore); assert.deepEqual(doc, before);
});
test('Supported rectangle Width binding remains available inside Revolve and leaves numeric Angle unchanged', () => {
  const doc = fixture(), before = structuredClone(doc), width = field(doc, 'w'); assert.ok('bind' in width);
  const binding = width as BindableField, nodes = binding.bind(doc.nodes, 'Width'); assert.ok(nodes);
  assert.equal(binding.get(nodes), 8); assert.equal(binding.param(nodes), 'Width');
  assert.equal(nodes[1], doc.nodes[1]); assert.equal(field(doc, 'deg').get(nodes), 360);
  const changed = field(doc, 'deg').set(nodes, 180); assert.equal(binding.get(changed), 8); assert.equal(binding.param(changed), 'Width');
  assert.deepEqual(doc, before);
});
test('Missing or inherited parameter requests do not change the source or numeric Angle', () => {
  const doc = fixture(), before = structuredClone(doc);
  const inherited = Object.create({ HiddenWidth: 12 });
  for (const [parameters, name] of [[doc.parameters, 'Missing'], [inherited, 'HiddenWidth']] as [Record<string, number>, string][]) {
    const width = field(doc, 'w', parameters); assert.ok('bind' in width);
    assert.equal((width as BindableField).bind(doc.nodes, name), null);
    assert.equal(field(doc, 'deg', parameters).get(doc.nodes), 360);
    assert.deepEqual(doc, before);
  }
});
