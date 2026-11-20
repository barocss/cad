import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '../src/app/commands';
import { dispatchTool } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { revisionOf } from '../src/util/revision';

function plate(depth?: number) {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] });
  const stock = withNode(sketch, { kind: 'extrude', sketch: 0, height: 10 });
  return withNode(stock, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [11, 9], radius: 3,
    face: 'n1.top', ...(depth === undefined ? {} : { depth }) });
}

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
const command = commandById('delete-face')!;
const emptySel = { edges: [], bodies: [] };

test('Delete face consumes the current bore solid, preserving the Hole recipe and surviving native names', async () => {
  const doc = plate(), pristine = structuredClone(doc);
  const before = await evaluate(doc);
  assert.ok(before.ok);
  const [body] = before.bodies;
  const index = body.mesh.faces.findIndex(face => face.nativeFaces?.length === 2);
  assert.ok(index >= 0);
  const face = body.mesh.faces[index];
  const ctx = { doc, bodies: before.bodies, selection: { ...emptySel, faces: [{ body: 0, face: index }] } };
  assert.equal(command.available(ctx).ok, true);
  const next = command.build!(ctx, {});
  const node = next.nodes[3];
  assert.ok(node.kind === 'delete-face');
  assert.ok(face.nativeFaces?.some(member => member.name === node.faces[0]));
  assert.equal(node.sigs?.[node.faces[0]].k, 'curved');
  assert.deepEqual(next.nodes.slice(0, 3), pristine.nodes);
  const reopened = readStudioDoc(JSON.stringify(next));
  assert.ok('doc' in reopened);
  assert.deepEqual(reopened.doc, next);
  const after = await evaluate(reopened.doc);
  assert.ok(after.ok);
  assert.ok(Math.abs((after.bodies[0].volume ?? 0) - 12000) < 1e-7);
  const priorBrep = partBreps(doc)[0].brep, healedBrep = partBreps(next)[0].brep;
  assert.deepEqual(healedBrep.faces.map(f => [f.id, f.name]), priorBrep.faces.filter(f => !face.nativeFaces?.some(member => member.name === f.name)).map(f => [f.id, f.name]));
  const reply = await dispatchTool({ doc, bodies: before.bodies }, 'features', {
    action: 'command', command: 'delete-face', faces: [face.name], expectedRevision: revisionOf(doc),
  }, evaluate);
  assert.ok(reply.changed && !reply.isError, reply.content);
  assert.deepEqual(reply.state.doc, next);
  assert.deepEqual(doc, pristine);
});

test('Delete face refuses the cap, blind hole and a changed stored signature', async () => {
  for (const depth of [undefined, 4]) {
    const doc = plate(depth);
    const before = await evaluate(doc);
    assert.ok(before.ok);
    const [body] = before.bodies;
    const index = body.mesh.faces.findIndex(face => depth === undefined ? face.name === 'n1.top' : face.kind === 'curved');
    assert.ok(index >= 0);
    const ctx = { doc, bodies: before.bodies, selection: { ...emptySel, faces: [{ body: 0, face: index }] } };
    assert.equal(command.available(ctx).ok, false);
    assert.throws(() => command.build!(ctx, {}), /Select the cylindrical wall/);
  }
  const doc = plate(), before = await evaluate(doc);
  assert.ok(before.ok);
  const index = before.bodies[0].mesh.faces.findIndex(face => face.nativeFaces?.length === 2);
  const next = command.build!({ doc, bodies: before.bodies, selection: { ...emptySel, faces: [{ body: 0, face: index }] } }, {});
  const draft = structuredClone(next), node = draft.nodes[3];
  assert.ok(node.kind === 'delete-face' && node.sigs);
  node.sigs[node.faces[0]].r = 30;
  const result = await evaluate(draft);
  assert.ok(!result.ok);
  assert.equal(result.error.code, 'REFERENCE_MOVED');
});

test('Delete face heals the exact inside fillet of a straight L-section', async () => {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon',
    points: [[0, 0], [3, 0], [3, 27], [40, 27], [40, 30], [0, 30]] });
  const sharp = withNode(sketch, { kind: 'extrude', sketch: 0, height: 20 });
  const doc = withNode(sharp, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side1|n1.side2'], radius: 2 });
  const before = await evaluate(doc);
  assert.ok(before.ok);
  const index = before.bodies[0].mesh.faces.findIndex(face => face.name === 'n2.face');
  assert.ok(index >= 0);
  const ctx = { doc, bodies: before.bodies, selection: { ...emptySel, faces: [{ body: 0, face: index }] } };
  assert.equal(command.available(ctx).ok, true);
  const reply = await dispatchTool({ doc, bodies: before.bodies }, 'features', {
    action: 'command', command: 'delete-face', faces: ['n2.face'], expectedRevision: revisionOf(doc),
  }, evaluate);
  assert.ok(reply.changed && !reply.isError, reply.content);
  assert.deepEqual(reply.state.doc.nodes.slice(0, 3), doc.nodes);
  const healed = reply.state.doc.nodes[3];
  assert.ok(healed.kind === 'delete-face');
  assert.deepEqual(healed.faces, ['n2.face']);
  const reopened = readStudioDoc(JSON.stringify(reply.state.doc));
  assert.ok('doc' in reopened);
  const after = await evaluate(reopened.doc);
  assert.ok(after.ok);
  const volume = after.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - 4020) < 1e-7);
  assert.deepEqual(partBreps(reopened.doc)[0].brep.faces.map(face => face.name).sort(),
    partBreps(sharp)[0].brep.faces.map(face => face.name).sort());
});
