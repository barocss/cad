import test from 'node:test';
import assert from 'node:assert/strict';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, offsetFaceDocumentProblem, withNode, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';

const targetFace = 'n1.top';
const area = 40 * 30 - 9 * Math.PI;

function plate() {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] });
  const stock = withNode(sketch, { kind: 'extrude', sketch: 0, height: 10 });
  return withNode(stock, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [11, 9], radius: 3 });
}

function context(doc: StudioDoc, name = targetFace) {
  const result = evaluateDoc(doc, 0);
  assert.ok(result.ok, result.ok ? '' : result.error.detail);
  const face = result.bodies[0].mesh.faces.find(face => face.name === name);
  assert.ok(face);
  return { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face: face.index }], edges: [], bodies: [] } };
}

function expectVolume(doc: StudioDoc, height: number) {
  const { bodies } = context(doc);
  assert.equal(bodies.length, 1);
  assert.ok(bodies[0].volume !== null && Math.abs(bodies[0].volume - area * height) < 1e-7);
}

test('Studio and the agent share a native bored cap recipe with editable signed distance', async () => {
  const source = plate(), baseline = structuredClone(source), ctx = context(source);
  const [handle] = offsetFaceCommand.handles!(ctx, { d: 2 });
  assert.equal(handle.at[2], 10);
  assert.deepEqual(handle.dir, [0, 0, 1]);
  assert.deepEqual(offsetFaceCommand.defaults!(ctx), { d: 2 });
  assert.throws(() => offsetFaceCommand.build!(ctx, { offsetMode: 'to-plane' }), /does not support moving to a reference plane/);
  const run = (d: number) => dispatchTool({ doc: source, bodies: ctx.bodies }, 'run_command', { command: 'offset-face', faces: [targetFace], values: { d } },
    async doc => evaluateDoc(doc, 0));

  const accepted = await run(2);
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  const added = accepted.state.doc;
  assert.deepEqual(added, offsetFaceCommand.build!(ctx, { d: 2 }));
  const node = added.nodes[3];
  assert.ok(node.kind === 'offset-face');
  assert.deepEqual(node.parent, { node: 2, side: 'solid' });
  assert.equal(node.distance, 2);
  assert.ok(node.sigs?.[targetFace]);
  expectVolume(added, 12);

  const addedCtx = context(added), edit = editSavedOffsetFaceCommand(added, 3)!;
  assert.ok(edit.fields!(addedCtx, {}).every(field => field.key !== 'offsetMode'));
  assert.deepEqual(edit.defaults!(addedCtx), { d: 2 });
  assert.throws(() => edit.build!(addedCtx, { offsetMode: 'to-plane' }), /needs a signed distance/);
  const edited = edit.build!(addedCtx, { d: -2 });
  assert.equal(edited.nodes[3].id, node.id);
  expectVolume(edited, 8);
  const opened = await readStudioFile(encodeStudioFile(edited));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(edited)));
  expectVolume(opened.doc, 8);

  const collapse = await run(-10);
  assert.ok(collapse.isError && !collapse.changed, collapse.content);
  assert.equal(collapse.state.doc, source);
  assert.deepEqual(source, baseline);
});

test('a second cap move retains the distance-only rule through History and raw file admission', () => {
  const source = plate();
  const root = offsetFaceCommand.build!(context(source, 'n1.bottom'), { d: 1 });
  const ctx = context(root);
  assert.deepEqual(offsetFaceCommand.defaults!(ctx), { d: 2 });
  assert.throws(() => offsetFaceCommand.build!(ctx, { offsetMode: 'to-plane' }), /does not support moving to a reference plane/);
  const chain = offsetFaceCommand.build!(ctx, { d: -2 });
  expectVolume(chain, 9);
  assert.equal(offsetFaceDocumentProblem(chain), null);
  const last = chain.nodes[4];
  assert.ok(last.kind === 'offset-face');
  const forged: ModelNode = { kind: 'offset-face', id: last.id, parent: last.parent, faces: last.faces, sigs: last.sigs, target: {
    body: { node: 1, side: 'solid' }, feature: 'n1', face: targetFace, localAnchor: [0, 0, 10], localSupport: 10, normal: [0, 0, 1],
  } };
  assert.match(offsetFaceDocumentProblem({ ...chain, nodes: [...chain.nodes.slice(0, 4), forged] }) ?? '', /needs a signed distance/);
});
