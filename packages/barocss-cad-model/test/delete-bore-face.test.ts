import assert from 'node:assert/strict';
import test from 'node:test';
import { commandById } from '../src/app/commands';
import { dispatchTool } from '../src/chat/tools';
import { emptyDoc, isDeleteFaceFilletSource, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
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

test('Delete face reopens the two-bore plate after filling each bore in either order', async () => {
  const source = withNode(plate(), { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [27, 20], radius: 2, face: 'n1.top' });
  for (const order of [['n2.side0', 'n3.side0'], ['n3.side0', 'n2.side0']]) {
    let doc = source;
    for (const face of order) {
      const before = await evaluate(doc);
      assert.ok(before.ok);
      const edit = { action: 'command', command: 'delete-face', faces: [face], expectedRevision: revisionOf(doc) };
      const reply = await dispatchTool({ doc, bodies: before.bodies }, 'features', edit, evaluate);
      assert.ok(reply.changed && !reply.isError, reply.content);
      const reopened = readStudioDoc(JSON.stringify(reply.state.doc));
      assert.ok('doc' in reopened);
      const node = reopened.doc.nodes.at(-1);
      assert.ok(node?.kind === 'delete-face');
      assert.deepEqual(node.parent, { node: doc.nodes.length - 1, side: 'solid' });
      assert.ok(node.faces[0].startsWith(face + '#'));
      assert.deepEqual(reopened.doc.nodes.slice(0, -1), doc.nodes);
      doc = reopened.doc;
    }
    const finished = await evaluate(doc);
    assert.ok(finished.ok);
    assert.equal(finished.bodies[0].volume, 12000);
    assert.equal(partBreps(doc)[0].brep.faces.length, 6);
  }
});

test('Delete face restores a sharp box corner from its exact outside fillet', async () => {
  const stock = rectanglePart(40, 30, 10), edge = 'n1.side0|n1.side3', name = 'n2.face';
  const fillet = { kind: 'fillet', parent: { node: 1, side: 'solid' }, radius: 2 } as const;
  const doc = withNode(stock, { ...fillet, edges: [edge] }), pristine = structuredClone(doc);
  const before = await evaluate(doc);
  assert.ok(before.ok && before.bodies[0].volume !== null);
  assert.ok(Math.abs(before.bodies[0].volume - (12000 - 10 * (4 - Math.PI))) < 1e-7);
  const { bodies } = before;
  const index = bodies[0].mesh.faces.findIndex(face => face.name === name);
  assert.ok(index >= 0);
  const ctx = { doc, bodies, selection: { ...emptySel, faces: [{ body: 0, face: index }] } };
  assert.equal(command.available(ctx).ok, true);
  const held = withNode(stock, { ...fillet, edges: ['n1.side0|n1.top'] });
  assert.equal(isDeleteFaceFilletSource(held.nodes, 2), false);
  const run = (face: string) => dispatchTool({ doc, bodies }, 'features',
    { action: 'command', command: 'delete-face', faces: [face], expectedRevision: revisionOf(doc) }, evaluate);
  const unrelated = await run('n1.top');
  assert.ok(unrelated.isError && !unrelated.changed);
  assert.equal(unrelated.state.doc, doc);
  const reply = await run(name);
  assert.ok(reply.changed && !reply.isError, reply.content);
  const healed = reply.state.doc, edit = healed.nodes.at(-1);
  assert.deepEqual(command.build!(ctx, {}), healed);
  assert.deepEqual(healed.nodes.slice(0, -1), doc.nodes);
  assert.ok(edit?.kind === 'delete-face' && edit.sigs?.[name]);
  assert.deepEqual(edit.faces, [name]);
  assert.equal(edit.sigs[name].r, 2);
  const reopened = readStudioDoc(JSON.stringify(healed));
  assert.ok('doc' in reopened);
  const after = await evaluate(reopened.doc);
  assert.ok(after.ok && after.bodies[0].volume !== null && Math.abs(after.bodies[0].volume - 12000) < 1e-7);
  const [{ brep: original }] = partBreps(doc), [{ brep: result }] = partBreps(reopened.doc);
  assert.deepEqual(result.faces.map(face => [face.name, face.id]).sort(),
    original.faces.filter(face => face.name !== name).map(face => [face.name, face.id]).sort());
  assert.ok(result.edges.some(item => item.name === edge));
  assert.deepEqual(doc, pristine);
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

test('Delete face heals a two-box union fillet through the reviewed Model command and raw reopen', async () => {
  const foot = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 20] });
  const base = withNode(foot, { kind: 'extrude', sketch: 0, height: 3 });
  const upright = withNode(base, { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [3, 20] });
  const stock = withNode(upright, { kind: 'extrude', sketch: 2, height: 30 });
  const sharp = withNode(stock, { kind: 'union', left: { node: 1, side: 'solid' }, right: { node: 3, side: 'solid' } });
  const doc = withNode(sharp, { kind: 'fillet', parent: { node: 4, side: 'solid' }, edges: ['n1.top|n3.side1'], radius: 2 });
  const before = await evaluate(doc);
  assert.ok(before.ok);
  const { bodies } = before;
  const index = bodies[0].mesh.faces.findIndex(face => face.name === 'n5.face');
  assert.ok(index >= 0);
  const ctx = { doc, bodies, selection: { ...emptySel, faces: [{ body: 0, face: index }] } };
  assert.equal(command.available(ctx).ok, true);
  const forged = structuredClone(doc);
  const node = forged.nodes[5];
  assert.ok(node.kind === 'fillet');
  node.edges.push('n1.side2|n1.top');
  assert.equal(command.available({ ...ctx, doc: forged }).ok, false);

  const reply = await dispatchTool({ doc, bodies }, 'features', {
    action: 'command', command: 'delete-face', faces: ['n5.face'], expectedRevision: revisionOf(doc),
  }, evaluate);
  assert.ok(reply.changed && !reply.isError, reply.content);
  assert.deepEqual(reply.state.doc.nodes.slice(0, -1), doc.nodes);
  const healed = reply.state.doc.nodes.at(-1);
  assert.ok(healed?.kind === 'delete-face' && healed.sigs);
  assert.deepEqual(healed.faces, ['n5.face']);
  assert.equal(healed.sigs['n5.face'].r, 2);
  const reopened = readStudioDoc(JSON.stringify(reply.state.doc));
  assert.ok('doc' in reopened);
  const after = await evaluate(reopened.doc);
  assert.ok(after.ok);
  assert.ok(Math.abs((after.bodies[0].volume ?? 0) - 4020) < 1e-7);
  const original = partBreps(doc)[0].brep, final = partBreps(reopened.doc)[0].brep;
  assert.deepEqual(final.faces.map(face => [face.id, face.name]).sort(),
    original.faces.filter(face => face.name !== 'n5.face').map(face => [face.id, face.name]).sort());
});
