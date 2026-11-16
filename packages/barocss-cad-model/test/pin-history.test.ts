import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields } from '../src/app/editFields';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
const fixture = (): StudioDoc => ({ ...emptyDoc(), nodes: [
  { id: 'n0', kind: 'shaft', generator: 'shaft@0', center: [0, 0], steps: [{ diameter: 20, length: 60 }], holes: [{ diameter: 4, at: 30 }] },
  { id: 'n1', kind: 'pin', shaft: 0, hole: 1, fit: false },
], outputs: { b0: { node: 0, side: 'solid' }, b1: { node: 1, side: 'solid' } }, nextId: 2 });
function field(doc: StudioDoc, key: string) {
  const f = editFields(doc.nodes, 1).find(f => f.key === key);
  assert.ok(f, `History pin ${key} field exists`); assert.equal(f.kind, 'number');
  if (f.kind !== 'number') throw new Error('number');
  return f;
}
test('Dowel pin History exposes creation-aligned optional diameter and length', () => {
  const doc = fixture();
  assert.equal(field(doc, 'd').label, "Ø (0: the hole's)");
  assert.equal(field(doc, 'L').label, 'Length (0: shaft step diameter)');
  assert.equal(field(doc, 'd').get(doc.nodes), 0); assert.equal(field(doc, 'L').get(doc.nodes), 0);
});
test('explicit pin dimensions and zero reset preserve references and source', () => {
  const doc = fixture(), snapshot = JSON.stringify(doc);
  const next = { ...doc, nodes: field(doc, 'L').set(field(doc, 'd').set(doc.nodes, 3.8), 25) };
  assert.deepEqual(next.nodes[1], { ...doc.nodes[1], diameter: 3.8, length: 25 });
  const before = evaluateDoc(doc, 1), after = evaluateDoc(next, 2); assert.ok(before.ok); assert.ok(after.ok);
  const volume = (r: typeof before) => r.ok ? r.bodies.find(b => b.ref?.node === 1)!.volume! : NaN;
  assert.ok(Math.abs(volume(before) - Math.PI * 4 * 20) < 1e-7);
  assert.ok(Math.abs(volume(after) - Math.PI * 1.9 ** 2 * 25) < 1e-7);
  const reset = field(next, 'L').set(field(next, 'd').set(next.nodes, 0), 0);
  assert.deepEqual(reset, doc.nodes); assert.equal(JSON.stringify(doc), snapshot);
  const fitted = { ...doc, nodes: doc.nodes.map((n, i) => i === 1 && n.kind === 'pin' ? { ...n, fit: true } : n) };
  assert.deepEqual(field(fitted, 'L').set(fitted.nodes, 25)[1], { ...fitted.nodes[1], length: 25 });
});
test('oversize fit refuses and invalid values are never silently changed to the default', () => {
  const doc = fixture(), f = field(doc, 'd');
  const oversized = evaluateDoc({ ...doc, nodes: f.set(doc.nodes, 8) }, 3);
  assert.equal(oversized.ok, false); if (!oversized.ok) assert.match(oversized.error.detail, /PIN_FIT/);
  for (const key of ['d', 'L']) for (const value of [-1, NaN, Infinity]) {
    const next = field(doc, key).set(doc.nodes, value), pin = next[1]; assert.equal(pin.kind, 'pin');
    if (pin.kind === 'pin') assert.equal(pin[key === 'd' ? 'diameter' : 'length'], value);
    assert.equal(evaluateDoc({ ...doc, nodes: next }, 4).ok, false);
  }
});
