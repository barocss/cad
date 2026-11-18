import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOutput, evaluateCadPart, massPropertiesOf } from '@barocss/cad';
import { editCommand } from '../src/app/editCommand';
import type { Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { rectanglePart, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { readStudioDoc } from '../src/engine/migrate';
import { toPartDocument } from '../src/engine/part';
function fixture(): StudioDoc {
  const base = rectanglePart(40, 30, 10), parent = { node: 1, side: 'solid' } as const;
  const sketch = withNode(base, { kind: 'sketch', profile: 'rectangle', min: [12, 10], max: [20, 18], on: parent,
    plane: { origin: [0, 0, 10], xAxis: [1, 0, 0], normal: [0, 0, 1] } });
  return withNode(withNode(sketch, { kind: 'extrude', sketch: 2, height: 11, from: -11, cutDepth: 'through' }),
    { kind: 'difference', parent, tool: { node: 3, side: 'solid' } });
}
function mode(nodes: readonly ModelNode[]) {
  const field = editFields(nodes, 3).find(f => f.key === 'cutDepthMode');
  assert.ok(field?.kind === 'choice'); return field;
}
const patch = (doc: StudioDoc, index: number, change: object): StudioDoc => ({ ...doc, nodes: doc.nodes.map((n, i) => i === index ? { ...n, ...change } as ModelNode : n) });
test('terminal Cut changes only the cutter, with explicit draft depth and same-mode no-op', () => {
  const source = fixture(), before = structuredClone(source), field = mode(source.nodes);
  assert.equal(field.get(source.nodes), 'through');
  assert.deepEqual(field.set(source.nodes, 'through'), source.nodes);
  assert.deepEqual(field.set(source.nodes, 'bogus'), source.nodes);
  const nodes = field.set(source.nodes, 'distance'), tool = nodes[3];
  assert.ok(tool.kind === 'extrude'); assert.equal(tool.height, 8); assert.equal(tool.from, -8); assert.equal(tool.cutDepth, undefined);
  nodes.forEach((n, i) => { if (i !== 3) assert.equal(n, source.nodes[i]); });
  assert.deepEqual(source, before);
  assert.deepEqual(mode(nodes).set(nodes, 'distance'), nodes);
  const restored = mode(nodes).set(nodes, 'through');
  assert.deepEqual(restored[3], { ...tool, cutDepth: 'through' });
});
test('numeric depth preserves native geometry, codec and original graph', () => {
  const source = fixture(), nodes = mode(source.nodes).set(source.nodes, 'distance');
  const h = editFields(nodes, 3).find(f => f.key === 'h'); assert.ok(h?.kind === 'number');
  const pocket = { ...source, nodes: h.set(nodes, 4) };
  const through = { ...pocket, nodes: mode(pocket.nodes).set(pocket.nodes, 'through') };
  for (const [doc, volume] of [[source, 11360], [pocket, 11744], [through, 11360]] as const) {
    const copy = structuredClone(doc), [out] = evaluateCadPart(toPartDocument(doc)).outputs;
    assert.ok(checkOutput(out).valid); assert.ok(Math.abs(massPropertiesOf(out).volume - volume) < 1e-7);
    assert.deepEqual(readStudioDoc(JSON.stringify(doc)), { doc, notes: [] }); assert.deepEqual(doc, copy);
  }
});
const excluded: [string, number, object][] = [
  ['held cutter', 3, { held: { reason: 'test' } }], ['suppressed cutter', 3, { suppressed: true }], ['made cutter', 3, { made: {} }],
  ['bound height', 3, { height: { parameter: 'H' } }], ['negative representation', 3, { height: -11, from: 0, cutDepth: undefined }],
  ['wrong start', 3, { from: -2 }], ['draft', 3, { draft: 5 }], ['nonfinite', 3, { height: Infinity }],
  ['self sketch', 3, { sketch: 3 }], ['held sketch', 2, { held: { reason: 'test' } }], ['suppressed sketch', 2, { suppressed: true }],
  ['associated', 2, { association: {} }], ['pocket floor', 2, { pocketFloor: {} }],
  ['tilted plane', 2, { plane: { origin: [0, 0, 10], xAxis: [1, 0, 0], normal: [0, 1, 0] } }],
  ['wrong parent', 4, { parent: { node: 0, side: 'solid' } }], ['held difference', 4, { held: { reason: 'test' } }],
  ['made difference', 4, { made: {} }], ['too long', 3, { height: 10001, from: -10001 }],
  ['suppressed difference', 4, { suppressed: true }], ['held target', 1, { held: { reason: 'test' } }],
  ['suppressed target', 1, { suppressed: true }], ['self target', 2, { on: { node: 2, side: 'solid' } }],
];
test('ineligible graphs omit the mode and captured setters recheck current ownership', () => {
  const source = fixture(), captured = mode(source.nodes);
  for (const [label, index, change] of excluded) {
    const doc = patch(source, index, change), before = structuredClone(doc);
    assert.equal(editFields(doc.nodes, 3).some(f => f.key === 'cutDepthMode'), false, label);
    assert.deepEqual(captured.set(doc.nodes, 'distance'), doc.nodes, label); assert.deepEqual(doc, before);
  }
  const followed = [...source.nodes, source.nodes[0]];
  assert.equal(editFields(followed, 3).some(f => f.key === 'cutDepthMode'), false);
  assert.deepEqual(captured.set(followed, 'distance'), followed);
});

test('an impossible numeric depth refuses evaluation without mutating the accepted document', () => {
  const original = fixture(), nodes = mode(original.nodes).set(original.nodes, 'distance');
  const h = editFields(nodes, 3).find(f => f.key === 'h'); assert.ok(h?.kind === 'number');
  const draft = { ...original, nodes: h.set(nodes, 10001) }, saved = structuredClone(original);
  assert.throws(() => evaluateCadPart(toPartDocument(draft)), /10000|height|dimension|range/i);
  assert.deepEqual(original, saved);
});

test('an underside sketch retains its inward direction rather than using world Z depth', () => {
  const source = patch(fixture(), 2, { plane: { origin: [0, 30, 0], xAxis: [1, 0, 0], normal: [0, 0, -1] } });
  const nodes = mode(source.nodes).set(source.nodes, 'distance');
  const h = editFields(nodes, 3).find(f => f.key === 'h'); assert.ok(h?.kind === 'number');
  const pocket = { ...source, nodes: h.set(nodes, 4) };
  const [body] = evaluateCadPart(toPartDocument(pocket)).outputs;
  assert.ok(checkOutput(body).valid); assert.ok(Math.abs(massPropertiesOf(body).volume - 11744) < 1e-7);
  assert.deepEqual(pocket.nodes[2], source.nodes[2]);
});

test('drag HUD cannot apply a History-only mode and preserves its numeric edit contract', () => {
  const source = fixture();
  for (const doc of [source, { ...source, nodes: mode(source.nodes).set(source.nodes, 'distance') }]) {
    const before = structuredClone(doc), command = editCommand(3, doc.nodes, doc);
    assert.ok(command?.fields && command.defaults && command.build);
    const ctx: Ctx = { doc, bodies: [], selection: { faces: [], edges: [], bodies: [] } };
    assert.equal(command.fields(ctx).some(field => field.key === 'cutDepthMode'), false);
    const values = command.defaults(ctx), next = command.build(ctx, { ...values, cutDepthMode: 'through', h: 4 });
    if (doc.nodes[3].kind !== 'extrude') assert.fail('fixture');
    assert.deepEqual(next.nodes[3], doc.nodes[3].cutDepth === 'through' ? doc.nodes[3] : { ...doc.nodes[3], height: 4, from: -4 });
    assert.deepEqual(doc, before);
  }
});
