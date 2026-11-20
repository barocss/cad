import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { deleteFaceCommand } from '../src/app/deleteFaceCommand';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { directFaceDocumentProblem, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

function sourceDoc() {
  const outline = withNode(rectanglePart(40, 30, 10), { kind: 'sketch', profile: 'circle', center: [11, 9], radius: 3 });
  const cylinder = withNode(outline, { kind: 'extrude', sketch: 2, from: 8, height: 8 });
  return withNode(cylinder, { kind: 'union', left: { node: 1, side: 'solid' }, right: { node: 3, side: 'solid' } });
}

test('Delete face binds the exact boss cap and reopens the healed rectangular plate', async () => {
  const doc = sourceDoc(), original = structuredClone(doc), before = evaluateDoc(doc, 1), cap = 'n3.top';
  assert.ok(before.ok);
  const [body] = before.bodies, selection = { faces: [{ body: 0, face: body.mesh.faces.findIndex(face => face.name === cap) }], bodies: [], edges: [] };
  assert.ok(selection.faces[0].face >= 0);
  const ctx = { doc, bodies: before.bodies, selection }, state = { doc, bodies: before.bodies };
  assert.ok(deleteFaceCommand.available(ctx).ok);
  const run = (face: string) => dispatchTool(state, 'features',
    { action: 'command', command: 'delete-face', faces: [face], expectedRevision: revisionOf(doc) },
    async (candidate: StudioDoc) => evaluateDoc(candidate, 1));
  const refused = await run('n1.top');
  assert.ok(refused.isError && !refused.changed);
  assert.equal(refused.state.doc, doc);
  const accepted = await run(cap);
  assert.ok(!accepted.isError && accepted.changed, accepted.content);
  const healed = accepted.state.doc, node = healed.nodes.at(-1);
  assert.deepEqual(deleteFaceCommand.build!(ctx, {}), healed);
  assert.ok(node?.kind === 'delete-face');
  assert.deepEqual(node.faces, [cap]);
  assert.deepEqual(node.parent, { node: 4, side: 'solid' });
  assert.equal(node.sigs?.[cap].k, 'plane');
  assert.deepEqual(node.sigs?.[cap].d, [0, 0, 1]);
  assert.deepEqual(healed.nodes.slice(0, -1), doc.nodes);
  const [{ brep: originalNative }] = partBreps(doc), [{ brep: native }] = partBreps(healed);
  assert.ok(checkBrep(native, { strict: true }).valid);
  assert.equal(native.faces.length, 6);
  assert.ok(native.faces.every(face => originalNative.faces.some(original => original.id === face.id && original.name === face.name)));
  assert.ok(Math.abs(brepMassProperties(native, 1).volume - 12000) < 1e-7);
  const opened = await readStudioFile(encodeStudioFile(healed));
  assert.ok('doc' in opened);
  assert.deepEqual(partBreps(opened.doc), partBreps(healed));
  const bad = structuredClone(healed), saved = bad.nodes.at(-1);
  assert.ok(saved?.kind === 'delete-face' && saved.sigs?.[cap]);
  saved.sigs[cap].d = [0, 0, -1];
  assert.match(directFaceDocumentProblem(bad) ?? '', /original cylindrical boss top/);
  assert.deepEqual(doc, original);
});
