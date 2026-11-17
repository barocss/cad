import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields } from '../src/app/editFields';
import { rectanglePart, type ModelNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
type Pattern = Extract<ModelNode, { kind: 'circular-pattern' }>;
const pattern = (): Pattern => ({ kind: 'circular-pattern', id: 'n2', parent: { node: 1, side: 'solid' }, axis: 'z', count: 4, angle: 90, span: 360, pivot: [{ parameter: 'X' }, 3, 7] });
function field(nodes: ModelNode[], key = 'span') {
  const f = editFields(nodes, 0, { X: 2, Spread: 720 }).find(f => f.key === key);
  assert.ok(f?.kind === 'number'); return f;
}
test('authored spread updates only span and angle atomically, then Count uses the new intent', () => {
  const nodes: ModelNode[] = [pattern()], before = structuredClone(nodes), f = field(nodes);
  assert.equal(f.set(nodes, 360)[0], nodes[0]);
  const partial = f.set(nodes, 270);
  assert.deepEqual(partial, [{ ...nodes[0], span: 270, angle: 90 }]);
  assert.deepEqual(field(partial, 'count').set(partial, 2), [{ ...nodes[0], span: 270, count: 2, angle: 270 }]);
  assert.deepEqual(nodes, before);
});
test('signed, large and historical Count1 recipes preserve the existing step contract without clamping', () => {
  for (const [span, angle] of [[-270, -90], [-900, -300], [720, 90], [0, 0]]) {
    const nodes: ModelNode[] = [pattern()];
    assert.deepEqual(field(nodes).set(nodes, span), [{ ...nodes[0], span, angle }]);
  }
  const nodes: ModelNode[] = [{ ...pattern(), count: 1, angle: 360 }];
  assert.deepEqual(field(nodes).set(nodes, -900), [{ ...nodes[0], span: -900 }]);
});
test('captured setter refuses missing, nonfinite or unsupported intent and never creates legacy metadata', () => {
  const nodes: ModelNode[] = [pattern()], f = field(nodes);
  for (const value of [NaN, Infinity, -Infinity]) assert.equal(f.set(nodes, value)[0], nodes[0]);
  const legacy = pattern(); delete legacy.span;
  for (const n of [legacy, { ...pattern(), axis: 'x' as const }, { ...pattern(), span: NaN }, { kind: 'extrude' as const, sketch: 0, height: 3 }]) {
    assert.equal(editFields([n], 0).some(f => f.key === 'span'), false);
    assert.equal(f.set([n], 180)[0], n);
  }
});
test('numeric-only spread never offers generic binding, including full-turn same-angle edits', () => {
  const nodes: ModelNode[] = [pattern()];
  assert.equal('bind' in field(nodes), false);
  assert.equal('param' in field(nodes), false);
  assert.ok('bind' in field(nodes, 'axisAt0'));
  assert.deepEqual(field(nodes).set(nodes, 720)[0], { ...nodes[0], span: 720 });
});
test('zero and excessive negative steps reach existing evaluation refusal without repairing accepted source', () => {
  const base = rectanglePart(4, 6, 8), p = { ...pattern(), pivot: [0, 0, 0] as [number, number, number] };
  const doc = { ...base, nodes: [...base.nodes, p], outputs: { b2: { node: 2, side: 'solid' as const } }, nextId: 3 }, before = structuredClone(doc);
  for (const span of [0, -2000]) {
    const edited = field([p]).set([p], span)[0];
    const result = evaluateDoc({ ...doc, nodes: [...base.nodes, edited] }, 1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error.detail, /angle must be a nonzero step of at most 360/);
    assert.deepEqual(doc, before);
  }
});
