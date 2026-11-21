import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import { commandById, type Ctx } from '../src/app/commands';
import { dispatchTool } from '../src/chat/tools';
import { emptyDoc, isDeleteFaceFilletSource, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { captureSignatures, toSig } from '../src/engine/references';
import { signaturesOf } from '../src/engine/rematch';
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
const twoBorePlate = () => withNode(plate(), { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [27, 20], radius: 2, face: 'n1.top' });

for (const order of [['n2.side0', 'n3.side0'], ['n3.side0', 'n2.side0']]) {
  test(`Delete face atomically heals both original bores in ${order.join(', ')} order`, async () => {
    const doc = twoBorePlate(), pristine = structuredClone(doc), before = await evaluate(doc);
    assert.ok(before.ok);
    const [body] = before.bodies;
    const picks = order.map(name => {
      const index = body.mesh.faces.findIndex(face => face.name === name);
      assert.ok(index >= 0);
      const member = body.mesh.faces[index].nativeFaces?.find(face => face.name === name + '#1');
      assert.ok(member);
      return { index, name: member.name, signature: toSig({ kind: 'curved', at: member.centroid, dir: null, size: member.area, radius: member.radius! }) };
    });
    const ctx = { doc, bodies: before.bodies, selection: { ...emptySel, faces: picks.map(pick => ({ body: 0, face: pick.index })) } };
    assert.equal(command.available(ctx).ok, true);
    const next = command.build!(ctx, {});
    const expected: StudioDoc = { ...doc, nextId: 6, outputs: { b5: { node: 5, side: 'solid' } }, nodes: [
      ...doc.nodes,
      { id: 'n4', kind: 'delete-face', parent: { node: 3, side: 'solid' }, faces: [picks[0].name], sigs: { [picks[0].name]: picks[0].signature } },
      { id: 'n5', kind: 'delete-face', parent: { node: 4, side: 'solid' }, faces: [picks[1].name], sigs: { [picks[1].name]: picks[1].signature } },
    ] };
    assert.deepEqual(next, expected);
    assert.deepEqual(captureSignatures(next, before.bodies), expected);
    // The second stored native signature remains valid on the first heal's result.
    const first = await evaluate(withNode(doc, expected.nodes[4]));
    assert.ok(first.ok);
    assert.deepEqual(signaturesOf(first.bodies[0], 'individual').faces.get(picks[1].name),
      signaturesOf(body, 'individual').faces.get(picks[1].name));
    const reply = await dispatchTool({ doc, bodies: before.bodies }, 'features', {
      action: 'command', command: 'delete-face', faces: order, expectedRevision: revisionOf(doc),
    }, evaluate);
    assert.ok(reply.changed && !reply.isError, reply.content);
    assert.deepEqual(reply.state.doc, expected);
    const reopened = readStudioDoc(JSON.stringify(reply.state.doc));
    assert.ok('doc' in reopened);
    assert.deepEqual(reopened.doc, expected);
    const after = await evaluate(reopened.doc);
    assert.ok(after.ok);
    assert.equal(after.bodies.length, 1);
    assert.deepEqual(after.bodies[0].ref, { node: 5, side: 'solid' });
    assert.equal(after.bodies[0].volume, 12000);
    const original = partBreps(doc)[0].brep, healed = partBreps(reopened.doc)[0].brep;
    const report = checkBrep(healed, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 0);
    const mass = brepMassProperties(healed, 1);
    assert.ok(Math.abs(mass.volume - 40 * 30 * 10) < 1e-7);
    mass.centroid.forEach((coordinate, axis) => assert.ok(Math.abs(coordinate - [20, 15, 5][axis]) < 1e-7));
    assert.deepEqual(healed.faces.map(face => [face.id, face.name, face.surface.id]),
      original.faces.filter(face => face.name?.startsWith('n1.')).map(face => [face.id, face.name, face.surface.id]));
    for (const kind of ['loops', 'coedges', 'edges', 'vertices'] as const)
      for (const item of healed[kind]) assert.deepEqual(item, original[kind].find(candidate => candidate.id === item.id));
    assert.deepEqual(doc, pristine);
  });
}

test('Delete face refuses duplicate and mixed batch picks without a single-face fallback', async () => {
  let doc = twoBorePlate();
  doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [60, 0], max: [100, 30] });
  doc = withNode(doc, { kind: 'extrude', sketch: 4, height: 10 });
  doc = withNode(doc, { kind: 'hole', parent: { node: 5, side: 'solid' }, center: [71, 9], radius: 3, face: 'n5.top' });
  doc = withNode(doc, { kind: 'hole', parent: { node: 6, side: 'solid' }, center: [87, 20], radius: 2, face: 'n5.top' });
  const pristine = structuredClone(doc), before = await evaluate(doc);
  assert.ok(before.ok);
  assert.equal(before.bodies.length, 2);
  const firstBody = before.bodies.findIndex(body => body.ref?.node === 3), otherBody = before.bodies.findIndex(body => body.ref?.node === 7);
  const body = before.bodies[firstBody], first = body.mesh.faces.find(face => face.name === 'n2.side0')!;
  const second = body.mesh.faces.find(face => face.name === 'n3.side0')!, cap = body.mesh.faces.find(face => face.name === 'n1.top')!;
  const other = before.bodies[otherBody].mesh.faces.find(face => face.name === 'n6.side0')!;
  assert.ok(first && second && cap && other);
  const pick = { body: firstBody, face: first.index };
  for (const faces of [
    [pick, pick], [pick, { body: firstBody, face: cap.index }], [pick, { body: otherBody, face: other.index }],
    [pick, { body: firstBody, face: second.index }, pick],
  ]) {
    const ctx: Ctx = { doc, bodies: before.bodies, selection: { ...emptySel, faces } };
    assert.equal(command.available(ctx).ok, false);
    assert.throws(() => command.build!(ctx, {}), /Select the cylindrical wall/);
  }
  for (const faces of [
    [first.name, first.name], [first.name, first.id], [first.name, cap.name], [first.name, other.name],
    [first.name, second.name, first.name],
  ]) {
    const reply = await dispatchTool({ doc, bodies: before.bodies }, 'features', {
      action: 'command', command: 'delete-face', faces, expectedRevision: revisionOf(doc),
    }, evaluate);
    assert.ok(reply.isError && !reply.changed, reply.content);
    assert.equal(reply.state.doc, doc);
    assert.equal(reply.state.bodies, before.bodies);
  }
  const mixed = await dispatchTool({ doc, bodies: before.bodies }, 'features', {
    action: 'command', command: 'delete-face', faces: [first.name, second.name], bodies: [body.key], expectedRevision: revisionOf(doc),
  }, evaluate);
  assert.ok(mixed.isError && !mixed.changed, mixed.content);
  assert.equal(mixed.state.doc, doc);
  assert.deepEqual(doc, pristine);
});

test('a changed second bore signature refuses the whole candidate and keeps the original two bores', async () => {
  const doc = twoBorePlate(), pristine = structuredClone(doc), before = await evaluate(doc);
  assert.ok(before.ok);
  const faces = before.bodies[0].mesh.faces.flatMap(face => face.nativeFaces?.length === 2 ? [{ body: 0, face: face.index }] : []);
  assert.equal(faces.length, 2);
  const next = command.build!({ doc, bodies: before.bodies, selection: { ...emptySel, faces } }, {});
  const second = next.nodes[5];
  assert.ok(second.kind === 'delete-face' && second.sigs);
  second.sigs[second.faces[0]].r = 30;
  const result = await evaluate(next);
  assert.ok(!result.ok);
  assert.equal(result.error.code, 'REFERENCE_MOVED');
  const reply = await dispatchTool({ doc, bodies: before.bodies }, 'features', {
    action: 'add', features: next.nodes.slice(4), expectedRevision: revisionOf(doc),
  }, evaluate);
  assert.ok(reply.isError && !reply.changed, reply.content);
  assert.equal(reply.state.doc, doc);
  assert.equal(reply.state.bodies, before.bodies);
  assert.deepEqual(reply.state.doc.nodes, pristine.nodes);
  assert.equal(reply.state.doc.nodes.length, 4);
  const retained = partBreps(reply.state.doc)[0].brep;
  assert.equal(retained.faces.length, 10);
  assert.ok(Math.abs(brepMassProperties(retained, 1).volume - (12000 - 130 * Math.PI)) < 1e-7);
  assert.deepEqual(doc, pristine);
});

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

for (const [edge, span] of [
  ['n1.side0|n1.side3', 10], ['n1.side0|n1.top', 40], ['n1.bottom|n1.side0', 40],
] as const) test(`Delete face restores sharp box edge ${edge} from its exact outside fillet`, async () => {
  const stock = rectanglePart(40, 30, 10), name = 'n2.face';
  const fillet = { kind: 'fillet', parent: { node: 1, side: 'solid' }, radius: 2 } as const;
  const doc = withNode(stock, { ...fillet, edges: [edge] }), pristine = structuredClone(doc);
  const before = await evaluate(doc);
  assert.ok(before.ok && before.bodies[0].volume !== null);
  assert.ok(Math.abs(before.bodies[0].volume - (12000 - span * (4 - Math.PI))) < 1e-7);
  const { bodies } = before;
  const index = bodies[0].mesh.faces.findIndex(face => face.name === name);
  assert.ok(index >= 0);
  const ctx = { doc, bodies, selection: { ...emptySel, faces: [{ body: 0, face: index }] } };
  assert.equal(command.available(ctx).ok, true);
  const held = withNode(stock, { ...fillet, edges: [edge], section: { kind: 'conic', rho: 0.6 } });
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
