import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc, type ModelNode } from '../src/engine/doc';
import { evaluateDoc, exportStudioStep } from '../src/engine/evaluate';
import { partSnapshot } from '../src/engine/part';
import { readStudioDoc } from '../src/engine/migrate';
import { evaluatedPart } from '../src/engine/wireDoc';
import { setSplitOutputSide } from '../src/engine/splitOutput';
import { editFields } from '../src/app/editFields';
import { editCommand } from '../src/app/editCommand';
import type { Ctx } from '../src/app/commands';
const both = () => withNode(rectanglePart(40, 30, 10), { kind: 'split', parent: { node: 1, side: 'solid' }, axis: 'x', at: 16 });
const select = (doc: StudioDoc, side: string) => prefixDoc({ ...doc, nodes: setSplitOutputSide(doc.nodes, 2, side) }, doc.nodes.length);
test('selected side preserves native ID, bounds and volume through prefixes, worker input and Open', () => {
  const source = both();
  for (const [side, volume, min, max] of [
    ['negative', 4800, [0, 0, 0], [16, 30, 10]], ['positive', 7200, [16, 0, 0], [40, 30, 10]],
  ] as const) {
    const doc = select(source, side), key = `b2_${side}`;
    assert.deepEqual(Object.keys(doc.outputs), [key]);
    const loaded = readStudioDoc(JSON.stringify(doc)); assert.ok(!('error' in loaded));
    for (const input of [doc, prefixDoc(doc, 3), evaluatedPart(doc), loaded.doc]) {
      const result = evaluateDoc(input, 1); assert.ok(result.ok, result.ok ? '' : result.error.detail);
      assert.equal(result.bodies.length, 1); assert.equal(result.bodies[0].key, key);
      assert.deepEqual(result.bodies[0].mesh.bounds, { min: [...min], max: [...max] });
      assert.ok(Math.abs(result.bodies[0].volume! - volume) < 1e-7);
      assert.deepEqual(partSnapshot(input).outputs.map(o => o.id), [`n2/${side === 'negative' ? 0 : 1}`]);
    }
    assert.equal(evaluateDoc(select(doc, 'both'), 2).ok, true);
  }
  assert.deepEqual(Object.keys(source.outputs), ['b2_negative', 'b2_positive']);
});
test('retained-side downstream is allowed; excluded-side and stale selectors refuse', () => {
  const doc = select(both(), 'negative');
  const move: ModelNode = { kind: 'translate', parent: { node: 2, side: 'negative' }, offset: [0, 0, 5] };
  const next = withNode(doc, move), result = evaluateDoc(next, 1); assert.ok(result.ok);
  assert.equal(result.bodies.length, 1); assert.equal(result.bodies[0].key, 'b3');
  assert.equal(editFields(next.nodes, 2).some(f => f.key === 'outputSide'), false);
  assert.throws(() => setSplitOutputSide(next.nodes, 2, 'positive'), /last History/);
  const bad = { ...next, nodes: next.nodes.map((n, i) => i === 3 && n.kind === 'translate' ? { ...n, parent: { node: 2, side: 'positive' as const } } : n) };
  assert.equal(evaluateDoc(bad, 2).ok, false);
  assert.ok('error' in readStudioDoc(JSON.stringify(bad)));
  assert.throws(() => prefixDoc(bad, 4), /excluded output/);
});
test('invalid saved side is rejected and generic edit command normalizes output maps', () => {
  const doc = both(), cmd = editCommand(2, doc.nodes)!;
  const ctx: Ctx = { doc, bodies: [], selection: { bodies: [], faces: [], edges: [] } };
  const edited = cmd.build!(ctx, { ...cmd.defaults!(ctx), outputSide: 'positive' });
  assert.deepEqual(Object.keys(edited.outputs), ['b2_positive']);
  assert.throws(() => setSplitOutputSide(doc.nodes, 2, 'invalid'), /output side/);
  const bad = JSON.parse(JSON.stringify(doc)); bad.nodes[2].outputSide = 'both';
  assert.ok('error' in readStudioDoc(JSON.stringify(bad)));
  assert.equal(evaluateDoc(bad, 1).ok, false);
});
test('oblique normal reversal changes the spatial negative side; STEP exports only selected shapes', () => {
  for (const sign of [1, -1]) {
    const doc = withNode(rectanglePart(40, 30, 10), { kind: 'split', parent: { node: 1, side: 'solid' }, axis: 'x', normal: [sign, sign, 0], at: 30 * sign, outputSide: 'negative' });
    const result = evaluateDoc(doc, 1); assert.ok(result.ok, result.ok ? '' : result.error.detail);
    assert.equal(result.bodies.length, 1); assert.equal(result.bodies[0].key, 'b2_negative');
    assert.ok(Math.abs(result.bodies[0].volume! - (sign === 1 ? 4500 : 7500)) < 1e-6);
    const step = exportStudioStep(doc, { name: 'selected-split' });
    assert.equal(step.scope.rootBodies, 1); assert.equal(step.scope.nativeBodies, 1);
  }
});
test('unrelated bodies survive output filtering and nested invalid side references refuse Open', () => {
  const doc = select(both(), 'negative');
  const other = withNode(doc, { kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [100, 0, 0] });
  const result = evaluateDoc(other, 1); assert.ok(result.ok);
  assert.deepEqual(result.bodies.map(b => b.key).sort(), ['b2_negative', 'b3']);
  const invalid = JSON.parse(JSON.stringify(doc)); invalid.nodes[2].outputSide = 'invalid';
  const outer = { ...rectanglePart(10, 10, 10), instances: [{ id: 'p', doc: invalid, position: [0, 0, 0], rotation: [0, 0, 0] }] };
  assert.ok('error' in readStudioDoc(JSON.stringify(outer)));
});
