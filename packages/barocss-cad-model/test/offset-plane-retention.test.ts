import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { patchValues, type Values } from '../src/app/commands';
import { awaitingOffsetPlane, offsetPlaneStep, restoreOffsetPlaneValues } from '../src/app/offsetPlanePick';
function fixture() {
  let doc = withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon', points: [[0,0],[18,0],[24,8],[18,16],[0,16],[-6,8]] });
  doc = withNode(doc, { kind: 'extrude', sketch: 0, height: 10 });
  doc = withNode(doc, { kind: 'sketch', profile: 'polygon', points: [[20,1],[24,-2],[27,2],[23,5]] });
  doc = withNode(doc, { kind: 'extrude', sketch: 2, height: 10, from: 30 });
  const result = evaluateDoc(doc, 1); assert.ok(result.ok);
  const body = result.bodies.findIndex(b => b.ref?.node === 1), reference = result.bodies.findIndex(b => b.ref?.node === 3);
  const face = result.bodies[body].mesh.faces.find(f => f.name === 'n1.side1')!;
  const target = result.bodies[reference].mesh.faces.find(f => f.name === 'n3.side3')!;
  const ctx = { doc, bodies: result.bodies, selection: { faces: [{ body, face: face.index }], edges: [], bodies: [] } };
  const values = offsetFaceCommand.onPick!(ctx, { offsetMode: 'to-plane', d: 2 }, { face: { body: reference, face: target.index }, edge: null });
  assert.ok(values && !values.error);
  const saved = offsetFaceCommand.build!(ctx, values), built = evaluateDoc(saved, 2); assert.ok(built.ok);
  return { ctx, values: values as Values, saved, historyCtx: { ...ctx, doc: saved, bodies: built.bodies }, command: editSavedOffsetFaceCommand(saved, 4)! };
}
test('creation and History mode roundtrips retain reference without persisting scratch values', () => {
  const { ctx, values, saved, historyCtx, command } = fixture(), before = structuredClone(saved);
  for (const [cmd, context, initial] of [[offsetFaceCommand, ctx, values], [command, historyCtx, command.defaults!(historyCtx)]] as const) {
    assert.equal(initial.endFace, 'n3.side3');
    for (let i = 0; i < 3; i++) {
      const distance = patchValues(cmd, context, initial, { offsetMode: 'distance' });
      const back = patchValues(cmd, context, distance, { offsetMode: 'to-plane' });
      assert.equal(back.endBody, initial.endBody); assert.equal(back.endFace, initial.endFace);
      assert.deepEqual(cmd.build!(context, back), saved);
      const appliedDistance = cmd.build!(context, distance);
      assert.ok(evaluateDoc(appliedDistance, 3).ok);
      assert.ok(!('target' in appliedDistance.nodes.at(-1)!));
    }
  }
  assert.deepEqual(saved, before);
  const row = command.steps!(historyCtx, command.defaults!(historyCtx)).find(s => s.label === 'Reference plane')!;
  assert.match(row.text, /\(b3\).*n3.side3/);
});
test('saved restoration rejects missing, ambiguous and wrong feature refs; cleared repick is not resurrected', () => {
  const { saved, historyCtx, command } = fixture(), node = saved.nodes.at(-1)!;
  assert.ok(node.kind === 'offset-face' && node.target);
  const initial = { offsetMode: 'to-plane', d: 2 };
  for (const ctx of [{ ...historyCtx, bodies: [] }, { ...historyCtx, bodies: [...historyCtx.bodies, ...historyCtx.bodies] }])
    assert.equal(restoreOffsetPlaneValues(ctx, initial, node.target), initial);
  assert.equal(restoreOffsetPlaneValues(historyCtx, initial, { ...node.target, feature: 'n999' }), initial);
  const gone = { ...command.defaults!(historyCtx) }; delete gone.endBody; delete gone.endFace; delete gone.keepPlane;
  const roundtrip = patchValues(command, historyCtx, patchValues(command, historyCtx, gone, { offsetMode: 'distance' }), { offsetMode: 'to-plane' });
  assert.ok(awaitingOffsetPlane(command.id, roundtrip));
  assert.equal(offsetPlaneStep(roundtrip, node.target, historyCtx).done, false);
});
