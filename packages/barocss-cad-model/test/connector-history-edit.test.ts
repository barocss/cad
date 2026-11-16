import { friendlyCause } from '../src/engine/errors';
import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { editConnectorRows } from '../src/engine/connectors';
import { connectorCommands } from '../src/app/connectorCommands';
import { connectorHistoryEdit } from '../src/app/connectorEdit';
import type { Ctx } from '../src/app/commands';
const row = { id: 'usb-c', name: 'USB-C', opening: { shape: 'stadium', width: 8.34, height: 2.56, depth: 6.2 }, body: { shape: 'stadium', width: 8.25, height: 2.4, length: 6.51 }, keepOut: { margin: 1, depth: 15 }, source: 'test' };
const context = (doc: StudioDoc): Ctx => ({ doc, bodies: [], selection: { bodies: [], edges: [], faces: [] } });
function fixture(noKeepout = false) {
  const loaded = editConnectorRows(rectanglePart(40, 30, 10), [{ ...row, ...(noKeepout ? { keepOut: undefined } : {}) }]);
  assert.ok(!('error' in loaded));
  const doc = loaded.doc, result = evaluateDoc(doc, 0); assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.findIndex(f => f.name === 'n1.top');
  const ctx = { ...context(doc), bodies: result.bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face }] } };
  return connectorCommands[0].build!(ctx, { row: row.id, u: 0, v: 0, rot: 90 });
}
test('both terminal History rows edit placement atomically, preserving body identity and outputs', () => {
  const doc = fixture(), snapshot = JSON.stringify(doc), ctx = context(doc);
  for (const index of [2, 3]) {
    const cmd = connectorHistoryEdit(doc, index); assert.ok(cmd);
    const values = cmd.defaults!(ctx); assert.equal(cmd.build!(ctx, values), doc);
    const next = cmd.build!(ctx, { ...values, x: 16, y: 10, rot: 0 });
    assert.equal(next.nodes[3], doc.nodes[3]); assert.equal(next.outputs, doc.outputs);
    assert.equal(next.connectors, doc.connectors); assert.equal(next.nodes[2].id, doc.nodes[2].id);
    assert.notDeepEqual(next.references!.keepouts[0].frame, doc.references!.keepouts[0].frame);
    const before = evaluateDoc(doc, 1), after = evaluateDoc(next, 2); assert.ok(before.ok); assert.ok(after.ok);
    before.bodies.forEach((b, i) => assert.ok(Math.abs(b.volume! - after.bodies[i].volume!) < 1e-6));
    assert.throws(() => cmd.build!(context({ ...doc }), values), /current connector/);
    assert.throws(() => cmd.build!(ctx, { ...values, x: '' }), /finite center/);
    const offPlane = cmd.build!(ctx, { ...values, z: 20 }); assert.equal(evaluateDoc(offPlane, 3).ok, false);
  }
  assert.equal(JSON.stringify(doc), snapshot);
});
test('missing, changed and duplicate owned keepouts fail closed', () => {
  for (const change of ['missing', 'modified', 'duplicate']) {
    const doc = fixture();
    if (change === 'missing') doc.references!.keepouts = [];
    if (change === 'modified') doc.references!.keepouts[0].clearance = 1;
    if (change === 'duplicate') doc.references!.keepouts.push(doc.references!.keepouts[0]);
    const cmd = connectorHistoryEdit(doc, 2); assert.ok(cmd);
    assert.throws(() => cmd.build!(context(doc), { ...cmd.defaults!(context(doc)), x: 16 }), error => {
      const notice = friendlyCause(error); assert.equal(notice.code, 'CONNECTOR_EDIT_KEEPOUT');
      assert.equal(notice.title, 'Connector keep-out cannot be moved'); assert.match(notice.hint, /instead of overwriting/); return true;
    });
  }
});
test('terminal structure and unique rows are required; absent row keepout is not synthesized', () => {
  const doc = fixture();
  assert.equal(connectorHistoryEdit({ ...doc, nodes: [...doc.nodes, doc.nodes[0]] }, 2), null);
  assert.equal(connectorHistoryEdit({ ...doc, nodes: doc.nodes.map((n, i) => i === 2 ? { ...n, held: 'test' } : n) }, 2), null);
  assert.equal(connectorHistoryEdit({ ...doc, connectors: { ...doc.connectors!, rows: [doc.connectors!.rows[0], doc.connectors!.rows[0]] } }, 2), null);
  const plain = fixture(true), cmd = connectorHistoryEdit(plain, 2); assert.ok(cmd);
  const next = cmd.build!(context(plain), { ...cmd.defaults!(context(plain)), x: 16 });
  assert.equal(next.references, plain.references);
});
test('lost or merged source faces refuse; an explicitly absent body is not regenerated', () => {
  const doc = fixture(), opening = doc.nodes[2]; assert.equal(opening.kind, 'connector-opening');
  if (opening.kind !== 'connector-opening') return;
  const missing = { ...doc, nodes: doc.nodes.map((n, i) => i === 2 ? { ...opening, face: 'missing' } : n) };
  const cmd = connectorHistoryEdit(missing, 2); assert.ok(cmd);
  assert.throws(() => cmd.build!(context(missing), cmd.defaults!(context(missing))), /face is missing/);
  const merged = { ...doc, nodes: doc.nodes.map((n, i) => i === 2 ? { ...opening, face: 'n1.top+other' } : n) };
  assert.equal(connectorHistoryEdit(merged, 2), null);
  const lostParent = { ...doc, nodes: doc.nodes.map((n, i) => i === 2 ? { ...opening, parent: { node: 99, side: 'solid' as const } } : n) };
  assert.equal(connectorHistoryEdit(lostParent, 2), null);
  const alone = { ...doc, nodes: doc.nodes.slice(0, 3) }, edit = connectorHistoryEdit(alone, 2); assert.ok(edit);
  const next = edit.build!(context(alone), { ...edit.defaults!(context(alone)), x: 16 });
  assert.equal(next.nodes.length, 3);
});
