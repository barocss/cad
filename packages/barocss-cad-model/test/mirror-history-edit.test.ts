import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, dropStaleMade, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { commands, type Ctx } from '../src/app/commands';
import { mirrorHistoryEdit } from '../src/app/mirrorEdit';
const ctx = (doc: StudioDoc): Ctx => ({ doc, bodies: [], selection: { bodies: [], edges: [], faces: [] } });
function fixture(at = 40) {
  const doc = rectanglePart(40, 30, 10), result = evaluateDoc(doc, 0); assert.ok(result.ok);
  return commands.find(c => c.id === 'mirror')!.build!({ ...ctx(doc), bodies: result.bodies, selection: { bodies: [0], edges: [], faces: [] } }, { plane: 'yz', at });
}
test('each terminal group row opens one saved edit, 3→1→3 preserves terminal identity and outputs', () => {
  const doc = fixture(), snapshot = JSON.stringify(doc), id = doc.nodes.at(-1)!.id;
  for (const index of [2, 3, 4]) {
    const cmd = mirrorHistoryEdit(doc, index); assert.ok(cmd);
    assert.equal(cmd.build!(ctx(doc), cmd.defaults!(ctx(doc))), doc);
    const zero = cmd.build!(ctx(doc), { plane: 'xy', at: 0 });
    assert.equal(zero.nodes.length, 3); assert.equal(zero.nodes.at(-1)!.id, id);
    assert.deepEqual(Object.keys(zero.outputs), Object.keys(doc.outputs));
    const reopen = mirrorHistoryEdit(zero, 2); assert.ok(reopen);
    const negative = reopen.build!(ctx(zero), { plane: 'xz', at: -10 });
    assert.equal(negative.nodes.length, 5); assert.equal(negative.nodes.at(-1)!.id, id);
    assert.deepEqual(Object.keys(negative.outputs), Object.keys(doc.outputs));
    const read = readStudioDoc(JSON.stringify(negative)); assert.ok(!('error' in read)); assert.ok(mirrorHistoryEdit(read.doc, 4));
    assert.throws(() => cmd.build!(ctx({ ...doc }), { plane: 'yz', at: 40 }), /current Mirror/);
  }
  assert.equal(JSON.stringify(doc), snapshot);
});
test('native reflected bounds agree with the three fixed planes and signed offsets', () => {
  const doc = fixture(), cmd = mirrorHistoryEdit(doc, 4)!;
  for (const [plane, at, min, max] of [
    ['yz', 40, [0, 0, 0], [80, 30, 10]], ['xy', 20, [0, 0, 0], [40, 30, 40]],
    ['xy', 0, [0, 0, -10], [40, 30, 10]], ['xz', -10, [0, -50, 0], [40, 30, 10]],
  ] as const) {
    const result = evaluateDoc(cmd.build!(ctx(doc), { plane, at }), 1); assert.ok(result.ok, result.ok ? '' : result.error.detail);
    assert.deepEqual(result.bodies[0].mesh.bounds, { min: [...min], max: [...max] });
    assert.ok(Math.abs(result.bodies[0].volume! - 24000) < 1e-6);
  }
});
test('manual edits, legacy transforms, nonterminal groups and malformed values fail closed', () => {
  const doc = fixture(), cmd = mirrorHistoryEdit(doc, 4)!;
  for (const values of [{ plane: 'bad', at: 2 }, { plane: 'yz', at: '' }, { plane: 'yz', at: Infinity }, { plane: 'yz', at: NaN }])
    assert.throws(() => cmd.build!(ctx(doc), values), /finite Plane/);
  const manual = doc.nodes.map((node, i) => i === 2 && node.kind === 'translate' ? { ...node, offset: [1, 0, 0] as [number, number, number] } : node);
  assert.equal(mirrorHistoryEdit({ ...doc, nodes: manual }, 4), null);
  const invalidated = dropStaleMade(doc.nodes, manual);
  assert.ok(!('made' in invalidated[4]) || !invalidated[4].made);
  const legacy = structuredClone(doc); const last = legacy.nodes[4]; if ('made' in last) delete last.made;
  assert.equal(mirrorHistoryEdit(legacy, 4), null);
  assert.equal(mirrorHistoryEdit({ ...doc, nodes: [...doc.nodes, { ...doc.nodes[0], id: 'n99' }] }, 4), null);
});
