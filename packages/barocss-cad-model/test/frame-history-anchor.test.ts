import test from 'node:test';
import assert from 'node:assert/strict';
import { editFields } from '../src/app/editFields';
import { memberCommand, frameCommand } from '../src/app/frameCommands';
import { emptyDoc, withNode, type ModelNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import type { Ctx } from '../src/app/commands';

const member: Extract<ModelNode, { kind: 'frame-member' }> = { kind: 'frame-member', section: { kind: 'rect-tube', width: 40, height: 20, wall: 2, outerRadius: 0 }, start: [0, 0, 0], end: [0, 0, 100], up: [0, 1, 0] };
const frame: Extract<ModelNode, { kind: 'frame' }> = { kind: 'frame', section: member.section, points: [[0, 0, 0], [0, 0, 100], [100, 0, 0], [100, 0, 100]], segments: [[0, 1], [2, 3]], up: [0, 1, 0], overrides: [{ member: 1, anchor: 'top-right', offset: [3, 4], roll: 15 }] };
function field(nodes: readonly ModelNode[]) {
  const f = editFields(nodes, 0).find(f => f.key === 'anchor');
  assert.ok(f, 'History anchor field must exist'); assert.equal(f.kind, 'choice');
  if (f.kind !== 'choice') throw new Error('choice');
  return f;
}
test('History Line through choices exactly match creation for member and frame', () => {
  for (const [node, cmd] of [[member, memberCommand], [frame, frameCommand]] as const) {
    const ctx: Ctx = { doc: withNode(emptyDoc(), node), bodies: [], selection: { bodies: [], edges: [], faces: [] } };
    const creation = cmd.fields!(ctx).find(f => f.key === 'anchor'); assert.ok(creation && creation.kind === 'choice');
    const history = field(ctx.doc.nodes);
    assert.equal(history.label, creation.label); assert.deepEqual(history.options, creation.options);
    assert.equal(history.get(ctx.doc.nodes), 'centroid');
  }
});
test('anchor changes preserve offsets, roll, estimates and per-member overrides; default resets without mutation', () => {
  for (const original of [member, frame]) {
    const node = { ...original, offset: [2, 3] as [number, number], roll: 20, estimates: ['outerRadius'] }, nodes = [node];
    const snapshot = JSON.stringify(nodes), f = field(nodes), next = f.set(nodes, 'bottom-left');
    assert.deepEqual(next[0], { ...node, anchor: 'bottom-left' });
    if (node.kind === 'frame' && next[0].kind === 'frame') assert.equal(next[0].overrides, node.overrides);
    assert.deepEqual(f.set(next, 'centroid'), nodes);
    assert.deepEqual(f.set(nodes, 'invalid'), nodes);
    assert.deepEqual(f.set([{ kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [1, 1] }], 'origin'), [{ kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [1, 1] }]);
    assert.equal(JSON.stringify(nodes), snapshot);
  }
});
test('vertical member anchor changes exact bounds, not section area or length', () => {
  const doc = withNode(emptyDoc(), member), f = field(doc.nodes);
  const before = evaluateDoc(doc, 0), after = evaluateDoc({ ...doc, nodes: f.set(doc.nodes, 'bottom-left') }, 1);
  assert.ok(before.ok); assert.ok(after.ok);
  assert.deepEqual(before.bodies[0].mesh.bounds, { min: [-20, -10, 0], max: [20, 10, 100] });
  assert.deepEqual(after.bodies[0].mesh.bounds, { min: [0, 0, 0], max: [40, 20, 100] });
  assert.ok(Math.abs(before.bodies[0].volume! - after.bodies[0].volume!) < 1e-8);
  assert.ok(Math.abs(after.bodies[0].volume! - (40 * 20 - 36 * 16) * 100) < 1e-8);
});

test('global frame anchor moves only members without an explicit override', () => {
  const doc = withNode(emptyDoc(), frame), f = field(doc.nodes);
  const before = evaluateDoc(doc, 2), after = evaluateDoc({ ...doc, nodes: f.set(doc.nodes, 'bottom-left') }, 3);
  assert.ok(before.ok); assert.ok(after.ok);
  assert.equal(before.bodies.length, 2); assert.equal(after.bodies.length, 2);
  assert.notDeepEqual(before.bodies[0].mesh.bounds, after.bodies[0].mesh.bounds);
  assert.deepEqual(before.bodies[1].mesh.bounds, after.bodies[1].mesh.bounds);
  assert.equal(before.bodies[1].volume, after.bodies[1].volume);
  assert.deepEqual(before.bodies[1].mesh.positions, after.bodies[1].mesh.positions);
});
