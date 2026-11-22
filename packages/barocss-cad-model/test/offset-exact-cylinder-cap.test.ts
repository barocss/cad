import test from 'node:test';
import assert from 'node:assert/strict';
import { brepMassProperties, checkBrep, type Brep } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';

const top = 'n0.v-max', bottom = 'n0.v-min';
const profile = [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]];
const sourceDoc = (reverseV = false): StudioDoc => withNode(emptyDoc(), {
  kind: 'thicken', name: 'Semicylinder', mode: 'exact-cylinder', thickness: 2, side: 'reverse',
  surface: {
    degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
    controlPoints: profile.map(([x, y]) => [[x, y, reverseV ? 12 : 0], [x, y, reverseV ? 0 : 12]]),
    weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
  },
});
function context(doc: StudioDoc, name = top): Ctx {
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok, result.ok ? '' : result.error.detail);
  assert.equal(result.bodies.length, 1);
  const face = result.bodies[0].mesh.faces.findIndex(item => item.name === name);
  assert.ok(face >= 0, name);
  return { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face }], edges: [], bodies: [] } };
}
function native(doc: StudioDoc): Brep {
  const results = partBreps(doc);
  assert.equal(results.length, 1);
  const { brep } = results[0], report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology[0]?.genus, 0);
  return brep;
}
function checkVolume(doc: StudioDoc, height: number) {
  const brep = native(doc);
  const { volume } = brepMassProperties(brep, 1);
  assert.ok(Math.abs(volume - 18 * Math.PI * height) < 1e-8);
  assert.equal(Math.min(...brep.vertices.map(vertex => vertex.point[2])), 0);
  assert.equal(Math.max(...brep.vertices.map(vertex => vertex.point[2])), height);
  return brep;
}

test('Offset edits the original semicylinder upper cap through the command, History and native Open', async () => {
  const source = sourceDoc(), original = structuredClone(source), ctx = context(source);
  assert.equal(offsetFaceCommand.available(ctx).ok, true);
  assert.deepEqual(offsetFaceCommand.fields!(ctx).map(field => field.key), ['d']);
  const handles = offsetFaceCommand.handles!(ctx, { d: 2 });
  assert.equal(handles.length, 1);
  assert.deepEqual(handles[0].dir, [0, 0, 1]);
  const [x, y, z] = handles[0].at;
  assert.equal(z, 12);
  assert.ok(y > 20 && Math.abs(Math.hypot(x - 20, y - 20) - 9) < 1e-8);

  const applied = offsetFaceCommand.build!(ctx, { d: 2 }), saved = applied.nodes[1];
  assert.ok(saved.kind === 'offset-face');
  assert.deepEqual(saved.parent, { node: 0, side: 'solid' });
  assert.deepEqual(saved.faces, [top]);
  assert.equal(saved.distance, 2);
  assert.ok(saved.sigs?.[top]);
  assert.equal(saved.target, undefined);
  assert.deepEqual(applied.nodes[0], original.nodes[0]);
  checkVolume(applied, 14);

  const agent = await dispatchTool({ doc: source, bodies: ctx.bodies }, 'features',
    { action: 'command', command: 'offset-face', faces: [top], values: { d: 2 } }, async doc => evaluateDoc(doc, 1));
  assert.ok(agent.changed && !agent.isError, agent.content);
  assert.deepEqual(agent.state.doc, applied);


  const edit = editSavedOffsetFaceCommand(applied, 1), editedCtx = context(applied);
  assert.ok(edit?.build);
  assert.deepEqual(edit.fields!(editedCtx).map(field => field.key), ['d']);
  assert.equal(edit.onPick, undefined);
  assert.throws(() => edit.build!(editedCtx, { d: 2, offsetMode: 'to-plane' }), /signed distance/);
  const inward = edit.build(editedCtx, { d: -3 });
  assert.deepEqual(inward.nodes[1], { ...saved, distance: -3 });
  const expected = checkVolume(inward, 9);
  const opened = await readStudioFile(encodeStudioFile(inward));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, inward);
  assert.deepEqual(native(opened.doc), expected);
  assert.deepEqual(source, original);

  const reverse = sourceDoc(true), reverseCtx = context(reverse, bottom);
  const reverseOffset = offsetFaceCommand.build!(reverseCtx, { d: 2 });
  assert.deepEqual((reverseOffset.nodes[1] as typeof saved).faces, [bottom]);
  const reverseBrep = native(reverseOffset);
  assert.equal(Math.max(...reverseBrep.vertices.map(vertex => vertex.point[2])), 14);
});

test('Offset refuses collapse, the other cap, stale geometry, plane targets and chained cap offsets', async () => {
  const source = sourceDoc(), ctx = context(source), other = context(source, bottom);
  assert.equal(offsetFaceCommand.available(other).ok, false);
  assert.throws(() => offsetFaceCommand.build!(other, { d: 2 }), /original upper cap/);
  assert.throws(() => offsetFaceCommand.build!(ctx, { d: 2, offsetMode: 'to-plane' }), /reference plane/);
  assert.throws(() => offsetFaceCommand.build!(ctx, { d: 10001 }), /signed distance/);

  const changed = { ...source, nodes: source.nodes.map(node => node.kind === 'thicken' ? { ...node, thickness: 3 } : node) };
  assert.throws(() => offsetFaceCommand.build!({ ...ctx, doc: changed }, { d: 2 }), /no longer agrees/);
  for (const distance of [-12, -13, -12 + 1e-8]) {
    const refused = offsetFaceCommand.build!(ctx, { d: distance });
    const result = evaluateDoc(refused, 1);
    assert.equal(result.ok, false, String(distance));
    if (!result.ok) assert.match(result.error.detail, /opposite cap/i);
  }

  const applied = offsetFaceCommand.build!(ctx, { d: 2 }), saved = applied.nodes[1];
  assert.ok(saved.kind === 'offset-face' && saved.sigs?.[top]);
  assert.equal(offsetFaceCommand.available(context(applied)).ok, false);
  const chain = withNode(applied, { ...saved, id: 'n2', parent: { node: 1, side: 'solid' } });
  const wrongCap = { ...applied, nodes: [applied.nodes[0], { ...saved, faces: [bottom], sigs: { [bottom]: saved.sigs[top] } }] } as StudioDoc;
  for (const forged of [chain, wrongCap]) {
    assert.equal(evaluateDoc(forged, 1).ok, false);
    const reopened = await readStudioFile(encodeStudioFile(forged));
    assert.ok('error' in reopened);
    assert.match(reopened.error, /original (Exact semicylinder|upper cap)/);
  }
});
