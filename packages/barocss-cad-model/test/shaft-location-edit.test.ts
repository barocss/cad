import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields } from '../src/app/editFields';
import { emptyDoc, withNode, type StudioDoc, type ModelNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';

type Shaft = Extract<ModelNode, { kind: 'shaft' }>;
const source = () => withNode(emptyDoc(), { kind: 'shaft', generator: 'shaft@0', center: [12, -8], from: 7, steps: [
  { diameter: 20, length: 30, keyseats: [{ width: 4, depth: 3, length: 10, offset: 4, ends: 'square' }] },
  { diameter: 30, length: 40 }, { diameter: 20, length: 30, grooves: [{ diameter: 18, width: 2, at: 8 }] },
] });
function field(doc: StudioDoc, key: string) {
  const f = editFields(doc.nodes, 0, doc.parameters).find(f => f.key === key);
  assert.ok(f && f.kind === 'number', key); return f;
}
const put = (doc: StudioDoc, key: string, value: number): StudioDoc => ({ ...doc, nodes: field(doc, key).set(doc.nodes, value) as StudioDoc['nodes'] });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const keyArea = 2 * Math.sqrt(96) + 100 * Math.asin(.2) - 28;
const removedKey = keyArea * 10, removedGroove = Math.PI * 19 * 2;
function geometry(doc: StudioDoc, keyOffset: number, grooveAt: number) {
  const r = evaluateDoc(doc, 1); assert.ok(r.ok, r.ok ? '' : r.error.detail); assert.equal(r.bodies.length, 1);
  const body = r.bodies[0], stock = Math.PI * 15000, volume = stock - removedKey - removedGroove;
  near(body.volume!, volume);
  near(body.centroid![2], (stock * 57 - removedKey * (7 + keyOffset + 5) - removedGroove * (7 + 70 + grooveAt + 1)) / volume);
  near(body.centroid![0], 12 - 10 * (51 * 2 - 8 / 3) / volume); near(body.centroid![1], -8);
  assert.ok(body.notes!.some(n => n.text.includes(`10 long from ${keyOffset}`)));
  assert.ok(body.notes!.some(n => n.text.includes(`2 wide from ${70 + grooveAt}`)));
}

test('each shaft axial field identifies its item and immutably updates only its existing number leaf', () => {
  const doc = source(), shaft = doc.nodes[0] as Shaft;
  shaft.steps[0].keyseats!.push({ width: 2, depth: 1, length: 3, offset: 22, ends: 'square', angle: 90 });
  doc.parameters = { Position: 11 };
  assert.ok('bind' in field(doc, 'd1'), 'existing step diameter binding remains available');
  const frozen = structuredClone(doc);
  for (const [key, step, kind, item, label] of [
    ['keyseatOffset0.0', 0, 'keyseats', 0, 'Keyseat 1 (step 1) from step start'],
    ['keyseatOffset0.1', 0, 'keyseats', 1, 'Keyseat 2 (step 1) from step start'],
    ['grooveOffset2.0', 2, 'grooves', 0, 'Groove 1 (step 3) from step start'],
  ] as const) {
    const f = field(doc, key); assert.equal(f.label, label); assert.equal(f.unit, 'mm');
    assert.equal(f.get(doc.nodes), kind === 'keyseats' ? shaft.steps[step].keyseats![item].offset : shaft.steps[step].grooves![item].at);
    assert.equal('bind' in f, false); assert.equal('param' in f, false);
    const next = put(doc, key, 11), expected = structuredClone(doc), node = expected.nodes[0] as Shaft;
    if (kind === 'keyseats') node.steps[step].keyseats![item].offset = 11;
    else node.steps[step].grooves![item].at = 11;
    assert.deepEqual(next, expected); assert.deepEqual(doc, frozen);
  }
});

test('axial moves keep size but change independent mass centroid and survive a document roundtrip', () => {
  const first = source(), keyed = put(first, 'keyseatOffset0.0', 10), grooved = put(keyed, 'grooveOffset2.0', 15);
  geometry(first, 4, 8); geometry(keyed, 10, 8); geometry(grooved, 10, 15);
  const parsed = readStudioDoc(JSON.stringify(grooved)); assert.ok('doc' in parsed); assert.deepEqual(parsed.doc.nodes, grooved.nodes); geometry(parsed.doc, 10, 15);
  assert.deepEqual(first, source());
});

test('negative, nonfinite, out-of-step and overlapping groove locations retain native refusal', () => {
  const doc = source(), before = structuredClone(doc);
  for (const [key, values] of [['keyseatOffset0.0', [-1, 25, NaN, Infinity]], ['grooveOffset2.0', [-1, 29, NaN, Infinity]]] as const) {
    for (const value of values) {
      const result = evaluateDoc(put(doc, key, value), 1); assert.equal(result.ok, false, `${key} ${value}`);
      assert.deepEqual(doc, before);
    }
  }
  const multiple = source(); (multiple.nodes[0] as Shaft).steps[2].grooves!.push({ diameter: 17, width: 1, at: 20 });
  assert.equal(editFields(multiple.nodes, 0, {}).some(f => f.key.startsWith('grooveOffset')), false);
  (multiple.nodes[0] as Shaft).steps[2].grooves![1].at = 9;
  const overlap = evaluateDoc(multiple, 1); assert.equal(overlap.ok, false);
  geometry(put(doc, 'keyseatOffset0.0', 10), 10, 8);
});


test('multi-groove steps do not expose axial edits that could reorder native groove names', () => {
  const doc = source(), shaft = doc.nodes[0] as Shaft;
  shaft.steps[2].grooves!.push({ diameter: 17, width: 1, at: 22 });
  shaft.steps[1].grooves = [{ diameter: 28, width: 2, at: 10 }];
  const keys = editFields(doc.nodes, 0, {}).map(f => f.key);
  assert.ok(keys.includes('grooveOffset1.0'));
  assert.equal(field(doc, 'grooveOffset1.0').get(doc.nodes), 10);
  assert.ok(!keys.some(k => k.startsWith('grooveOffset2.')));
  assert.ok(keys.includes('g3.1d') && keys.includes('g3.2w'), 'existing size fields retained');
  assert.ok(keys.includes('keyseatOffset0.0'));
});


test('existing key and retaining-ring keep their ordinal references and follow the moved slots', () => {
  let doc = source();
  doc = withNode(doc, { kind: 'key', shaft: 0, keyseat: 1, height: 5, ends: 'square' });
  doc = withNode(doc, { kind: 'retaining-ring', shaft: 0, groove: 1, thickness: 1, outerDiameter: 22 });
  const moved = put(put(doc, 'keyseatOffset0.0', 10), 'grooveOffset2.0', 15);
  assert.deepEqual(moved.nodes.slice(1), doc.nodes.slice(1));
  for (const [d, offset, at] of [[doc, 4, 8], [moved, 10, 15]] as const) {
    const r = evaluateDoc(d, 1); assert.ok(r.ok, r.ok ? '' : r.error.detail);
    const key = r.bodies.find(b => b.ref?.node === 1), ring = r.bodies.find(b => b.ref?.node === 2);
    assert.ok(key && ring); near(key.centroid![2], 7 + offset + 5); near(key.volume!, 4 * 5 * 10);
    near(ring.centroid![2], 7 + 70 + at + 1); near(ring.volume!, Math.PI * (121 - 81));
  }
});
