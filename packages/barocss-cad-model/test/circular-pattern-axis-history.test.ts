import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields, type BindableField } from '../src/app/editFields';
import type { ModelNode, Dim } from '../src/engine/doc';
type Pattern = Extract<ModelNode, { kind: 'circular-pattern' }>;
const pattern = (pivot?: [Dim, Dim, Dim]): Pattern => ({ kind: 'circular-pattern', id: 'n2', parent: { node: 1, side: 'solid' }, axis: 'z', angle: 90, count: 4, span: 360, ...(pivot ? { pivot } : {}) });
function field(nodes: ModelNode[], k: number, params: Record<string, number> = {}) {
  const f = editFields(nodes, 0, params).find(f => f.key === 'axisAt' + k);
  assert.ok(f?.kind === 'number'); return f as BindableField;
}
test('Z axis coordinates start at origin; only the explicit coordinate changes', () => {
  const nodes: ModelNode[] = [pattern()], before = structuredClone(nodes);
  assert.equal(field(nodes, 0).get(nodes), 0); assert.equal(field(nodes, 1).get(nodes), 0);
  assert.equal(field(nodes, 0).set(nodes, 0)[0], nodes[0]);
  const x = field(nodes, 0).set(nodes, 2), y = field(x, 1).set(x, -3);
  assert.deepEqual(y, [{ ...nodes[0], pivot: [2, -3, 0] }]);
  assert.deepEqual(nodes, before);
});
test('preserves explicit Z, signed/legacy distribution and other coordinate bindings', () => {
  for (const span of [undefined, -180, 360]) {
    const n = pattern([1, { parameter: 'Y' }, 7]); if (span === undefined) delete n.span; else n.span = span;
    const nodes: ModelNode[] = [n], next = field(nodes, 0, { Y: 4 }).set(nodes, -2.5);
    assert.deepEqual(next, [{ ...n, pivot: [-2.5, { parameter: 'Y' }, 7] }]);
    assert.equal(field(next, 1, { Y: 4 }).param(next), 'Y');
  }
});
test('finite admission and captured field do not reinterpret unsupported axes or nodes', () => {
  const nodes: ModelNode[] = [pattern()], f = field(nodes, 0);
  for (const v of [NaN, Infinity, -Infinity]) assert.equal(f.set(nodes, v)[0], nodes[0]);
  for (const axis of ['x', 'y'] as const) {
    const other: ModelNode[] = [{ ...pattern(), axis }];
    assert.ok(!editFields(other, 0).some(f => f.key.startsWith('axisAt')));
    assert.equal(f.set(other, 9)[0], other[0]);
  }
  const other: ModelNode[] = [{ kind: 'extrude', sketch: 0, height: 8 }];
  assert.equal(f.set(other, 9)[0], other[0]);
});
test('existing BindableField contract identifies bound coordinate and explicitly unbinds only it', () => {
  const nodes: ModelNode[] = [pattern([{ parameter: 'X' }, { parameter: 'Y' }, { parameter: 'Z' }])];
  const params = { X: 2, Y: -3, Z: 7, Other: 9 }, f = field(nodes, 0, params);
  assert.equal(f.get(nodes), 2); assert.equal(f.param(nodes), 'X');
  const unbound = f.set(nodes, f.get(nodes));
  assert.deepEqual(unbound, [{ ...nodes[0], pivot: [2, { parameter: 'Y' }, { parameter: 'Z' }] }]);
  assert.equal(field(unbound, 0, params).param(unbound), null);
  assert.deepEqual(field(unbound, 0, params).bind(unbound, 'Other'), [{ ...nodes[0], pivot: [{ parameter: 'Other' }, { parameter: 'Y' }, { parameter: 'Z' }] }]);
  const absent: ModelNode[] = [pattern()];
  assert.equal(field(absent, 0, params).bind(absent, 'Other'), null, 'existing multi-leaf absent pivot binding is not broadened');
});
