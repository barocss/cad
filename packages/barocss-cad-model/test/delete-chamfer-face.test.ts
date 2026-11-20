import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { deleteFaceCommand } from '../src/app/deleteFaceCommand';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { directFaceDocumentProblem, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

const source = (edge = 'n1.side0|n1.side3') => withNode(rectanglePart(40, 30, 10),
  { kind: 'chamfer', parent: { node: 1, side: 'solid' }, edges: [edge], distance: 2 });

const chamfers = [
  ['n1.side0|n1.side3', 2],
  ['n1.side0|n1.top', 0],
  ['n1.bottom|n1.side0', 0],
] as const;

for (const [sharpEdge, span] of chamfers) test(`Delete face restores ${sharpEdge} from its exact bevel and reopens`, async () => {
  const doc = source(sharpEdge), original = structuredClone(doc), before = evaluateDoc(doc, 1), name = 'n2.face';
  assert.ok(before.ok);
  const [body] = before.bodies, selection = { faces: [{ body: 0, face: body.mesh.faces.findIndex(face => face.name === name) }], bodies: [], edges: [] };
  assert.ok(selection.faces[0].face >= 0);
  const ctx = { doc, bodies: before.bodies, selection }, state = { doc, bodies: before.bodies };
  assert.ok(deleteFaceCommand.available(ctx).ok);
  const run = (face: string) => dispatchTool(state, 'features',
    { action: 'command', command: 'delete-face', faces: [face], expectedRevision: revisionOf(doc) },
    async (candidate: StudioDoc) => evaluateDoc(candidate, 1));
  const refused = await run('n1.top');
  assert.ok(refused.isError && !refused.changed);
  assert.equal(refused.state.doc, doc);
  const accepted = await run(name);
  assert.ok(!accepted.isError && accepted.changed, accepted.content);
  const healed = accepted.state.doc, node = healed.nodes.at(-1);
  assert.deepEqual(deleteFaceCommand.build!(ctx, {}), healed);
  assert.ok(node?.kind === 'delete-face');
  assert.deepEqual(node.faces, [name]);
  assert.deepEqual(node.parent, { node: 2, side: 'solid' });
  assert.equal(node.sigs?.[name].k, 'plane');
  assert.ok(node.sigs?.[name].d?.[span] === 0);
  assert.deepEqual(healed.nodes.slice(0, -1), doc.nodes);
  const [{ brep: originalNative }] = partBreps(doc), [{ brep: native }] = partBreps(healed);
  assert.ok(checkBrep(native, { strict: true }).valid);
  assert.equal(native.faces.length, 6);
  assert.ok(native.faces.every(face => originalNative.faces.some(original => original.id === face.id && original.name === face.name)));
  assert.ok(native.edges.some(edge => edge.name === sharpEdge));
  assert.ok(Math.abs(brepMassProperties(native, 1).volume - 12000) < 1e-7);
  const opened = await readStudioFile(encodeStudioFile(healed));
  assert.ok('doc' in opened);
  assert.deepEqual(partBreps(opened.doc), partBreps(healed));
  const wrong = structuredClone(healed), saved = wrong.nodes.at(-1);
  assert.ok(saved?.kind === 'delete-face' && saved.sigs?.[name]);
  saved.sigs[name].d = [0, 0, 1];
  assert.match(directFaceDocumentProblem(wrong) ?? '', /original planar chamfer/);
  assert.deepEqual(doc, original);
});

test('Delete face does not admit adjacent chamfers', () => {
  const doc = withNode(rectanglePart(40, 30, 10),
    { kind: 'chamfer', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.side3', 'n1.side0|n1.side1'], distance: 2 });
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok);
  const [body] = evaluated.bodies, face = body.mesh.faces.findIndex(item => item.name.startsWith('n2.face'));
  assert.ok(face >= 0);
  const selection = { bodies: [], edges: [], faces: [{ body: 0, face }] };
  assert.equal(deleteFaceCommand.available({ doc, bodies: evaluated.bodies, selection }).ok, false);
});

test('Delete face binds either exact opposite chamfer and refuses their shared display alias', async () => {
  const doc = withNode(rectanglePart(40, 30, 10),
    { kind: 'chamfer', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.side3', 'n1.side1|n1.side2'], distance: 2 });
  const original = structuredClone(doc), before = evaluateDoc(doc, 1);
  assert.ok(before.ok);
  const state = { doc, bodies: before.bodies }, expected = ['n2.face#1', 'n2.face#2'];
  const evaluate = async (candidate: StudioDoc) => evaluateDoc(candidate, 1);
  const run = (face: string) => dispatchTool(state, 'features',
    { action: 'command', command: 'delete-face', faces: [face], expectedRevision: revisionOf(doc) }, evaluate);
  const summary = await dispatchTool(state, 'query', { action: 'summary' }, evaluate);
  const faces = JSON.parse(summary.content).bodies[0].faces;
  assert.deepEqual(faces.filter((face: { name: string }) => face.name === 'n2.face')
    .map((face: { native_name: string }) => face.native_name).sort(), expected);
  const duplicate = await run('n2.face');
  assert.ok(duplicate.isError && !duplicate.changed);
  assert.match(duplicate.content, /could not resolve a unique target/);
  assert.equal(duplicate.state.doc, doc);
  const [{ brep: originalNative }] = partBreps(doc);
  for (const [index, selected] of expected.entries()) {
    const peer = expected[1 - index], reply = await run(selected);
    assert.ok(reply.changed && !reply.isError, reply.content);
    const healed = reply.state.doc, landmark = healed.nodes.at(-1);
    assert.ok(landmark?.kind === 'delete-face');
    assert.deepEqual(landmark.faces, [selected]);
    assert.equal(landmark.sigs?.[selected].k, 'plane');
    const [{ brep }] = partBreps(healed);
    assert.ok(checkBrep(brep, { strict: true }).valid);
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 11980) < 1e-7);
    assert.ok(brep.faces.every(face => face.name !== selected));
    assert.deepEqual(brep.faces.find(face => face.name === peer), originalNative.faces.find(face => face.name === peer));
    const opened = await readStudioFile(encodeStudioFile(healed));
    assert.ok('doc' in opened);
    assert.deepEqual(partBreps(opened.doc), partBreps(healed));
  }
  assert.deepEqual(doc, original);
});
