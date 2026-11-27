import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, type BodyResult } from '../src/engine/evaluate';
import { pivotFaceCommand } from '../src/app/pivotFaceCommand';
import { pivotFaceAngleHandle } from '../src/app/pivotFaceHandle';
import { editSavedPivotFaceCommand } from '../src/app/draftEdit';
import type { Ctx, HandleSpec } from '../src/app/commands';

const face = 'n1.side0', upper = 'n1.side0|n1.top', lower = 'n1.bottom|n1.side0';
const near = (actual: readonly number[], expected: readonly number[]) => actual.forEach((value, axis) =>
  assert.ok(Number.isFinite(value) && Math.abs(value - expected[axis]) < 1e-9, `${axis}: ${value} vs ${expected[axis]}`));

function fixture() {
  let doc = rectanglePart(40, 20, 12);
  const nodes = [...doc.nodes];
  assert.ok(nodes[0].kind === 'sketch' && nodes[0].profile === 'rectangle' && nodes[1].kind === 'extrude');
  nodes[0] = { ...nodes[0], min: [4, -3], max: [44, 17] }; nodes[1] = { ...nodes[1], from: 6 };
  doc = { ...doc, nodes };
  doc = withNode(doc, { kind: 'rotate', parent: { node: 1, side: 'solid' }, axis: 'y', angle: 37, pivot: [10, 20, 30] });
  return withNode(doc, { kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [7, -11, 13] });
}

function context(doc: StudioDoc, hinge = upper): Ctx {
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok, result.ok ? '' : result.error.title);
  const body = result.bodies[0];
  return { doc, bodies: result.bodies, selection: { bodies: [],
    faces: [{ body: 0, face: body.mesh.faces.findIndex(member => member.nativePlaneName === face) }],
    edges: [{ body: 0, edge: body.mesh.edges.findIndex(member => member.names.includes(hinge)) }] } };
}

// Independent Rodrigues only evaluates the HandleSpec; expected coordinates below are authored world values.
function tip(handle: HandleSpec, degrees: number) {
  assert.ok(handle.arc);
  const { centre: c, axis: k, from: f } = handle.arc, r = f.map((value, axis) => value - c[axis]);
  const a = degrees * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), d = k.reduce((sum, value, axis) => sum + value * r[axis], 0);
  return c.map((value, i) => value + r[i] * co + (k[(i + 1) % 3] * r[(i + 2) % 3] - k[(i + 2) % 3] * r[(i + 1) % 3]) * si + k[i] * d * (1 - co));
}

test('Pivot angle grip uses an exact oblique hinge and positive inward world coordinates', () => {
  const ctx = context(fixture()), before = structuredClone(ctx.doc);
  const handles = pivotFaceCommand.handles!(ctx, { deg: 5 });
  assert.equal(handles.length, 1);
  const [handle] = handles;
  assert.deepEqual([handle.key, handle.min, handle.max, handle.step, handle.arc?.worldPlane], ['deg', -45, 45, 1, true]);
  near(handle.arc!.centre, [20.959116862837522, -14, 24.990963555303807]);
  near(handle.arc!.axis, [0.7986355100472928, 0, -0.6018150231520483]);
  near(handle.arc!.from, [17.34822672392523, -14, 20.19915049502005]);
  near(tip(handle, 5), [17.361967251061333, -13.477065543514051, 20.21738479040235]);
  near(tip(handle, 15), [17.47126482176962, -12.447085729384876, 20.36242756562647]);
  near(tip(handle, -5), [17.361967251061333, -14.522934456485949, 20.21738479040235]);
  assert.deepEqual(pivotFaceCommand.defaults!(ctx), { deg: 5 });
  const changed = pivotFaceCommand.build!(ctx, { deg: 15 }), node = changed.nodes.at(-1)!;
  assert.ok(node.kind === 'draft');
  assert.deepEqual([node.faces, node.hingeEdge, node.angle, Object.hasOwn(node, 'pull')], [[face], upper, 15, false]);
  for (const deg of [0, 45, -45]) assert.throws(() => pivotFaceCommand.build!(ctx, { deg }), /DRAFT_ANGLE/);
  assert.deepEqual(ctx.doc, before);
});

test('native edge endpoint order cannot reverse the angle sign', () => {
  const ctx = context(fixture()), body = structuredClone(ctx.bodies[0]);
  const edge = body.mesh.edges.find(member => member.names.includes(upper))!;
  [edge.a, edge.b] = [edge.b, edge.a];
  assert.ok(edge.nativeVertices); edge.nativeVertices = [edge.nativeVertices[1], edge.nativeVertices[0]];
  assert.deepEqual(pivotFaceAngleHandle(body, face, upper), pivotFaceAngleHandle(ctx.bodies[0], face, upper));
});

test('cardinal upper and lower hinges keep explicit pulls and opposite inward angle signs', () => {
  const doc = rectanglePart(40, 20, 12);
  for (const [hinge, axis, centre, pull] of [
    [upper, [1, 0, 0], [20, 0, 12], '-z'],
    [lower, [-1, 0, 0], [20, 0, 0], 'z'],
  ] as const) {
    const ctx = context(doc, hinge), handles = pivotFaceCommand.handles!(ctx, { deg: 5 });
    assert.equal(handles.length, 1);
    near(handles[0].arc!.centre, centre); near(handles[0].arc!.axis, axis);
    near(handles[0].arc!.from, [20, 0, 6]);
    const inward = tip(handles[0], 15);
    assert.ok(inward[1] > 0, 'positive angle points into original stock for either fixed edge');
    const node = pivotFaceCommand.build!(ctx, { deg: 5 }).nodes.at(-1)!;
    assert.ok(node.kind === 'draft'); assert.equal(node.pull, pull);
  }
});

test('saved History uses original stock and updates the hinge frame only for an offered replacement', () => {
  const ctx = context(fixture()), saved = pivotFaceCommand.build!(ctx, { deg: 12 });
  const command = editSavedPivotFaceCommand(saved, saved.nodes.length - 1, ctx.bodies[0]);
  assert.ok(command?.handles && command.defaults && command.build);
  const editCtx = { ...ctx, doc: saved }, values = command.defaults(editCtx);
  assert.deepEqual(command.handles(editCtx, values), pivotFaceCommand.handles!(ctx, { deg: 12 }));
  assert.deepEqual(command.handles({ ...editCtx, doc: { ...saved } }, values), []);
  assert.deepEqual(command.handles(editCtx, { ...values, hingeEdge: 'n1.side2|n1.top' }), []);
  const lowerHandle = command.handles(editCtx, { ...values, hingeEdge: lower });
  assert.equal(lowerHandle.length, 1);
  near(lowerHandle[0].arc!.axis, [-0.7986355100472928, 0, 0.6018150231520483]);
  assert.notDeepEqual(lowerHandle[0].arc!.centre, command.handles(editCtx, values)[0].arc!.centre);
  const rebound = command.build(editCtx, { ...values, hingeEdge: lower });
  assert.ok(rebound.nodes.at(-1)?.kind === 'draft');
  assert.equal(Object.hasOwn(rebound.nodes.at(-1)!, 'pull'), false);
  const result = evaluateDoc(saved, 1); assert.ok(result.ok);
  assert.equal(editSavedPivotFaceCommand(saved, saved.nodes.length - 1, result.bodies[0]), null, 'preview output cannot replace original stock');
});

test('the handle is absent without finite exact native face, edge and corner ownership', () => {
  const ctx = context(fixture());
  const reject = (mutate: (body: BodyResult) => void) => {
    const body = structuredClone(ctx.bodies[0]); mutate(body);
    assert.equal(pivotFaceAngleHandle(body, face, upper), undefined);
  };
  reject(body => { body.mesh.edges.find(member => member.names.includes(upper))!.nativeLine = undefined; });
  reject(body => { body.mesh.edges.find(member => member.names.includes(upper))!.nativeJoint = undefined; });
  reject(body => { body.mesh.edges.find(member => member.names.includes(upper))!.nativeVertices = undefined; });
  reject(body => { body.mesh.edges.find(member => member.names.includes(upper))!.a[0] = NaN; });
  reject(body => { const plane = body.mesh.faces.find(member => member.nativePlaneName === face)!.exact; assert.ok(plane?.kind === 'plane'); plane.n = [0, -2, 0]; });
  reject(body => { const edge = body.mesh.edges.find(member => member.names.includes(upper))!; edge.nativeJoint = { ...edge.nativeJoint!, faces: ['wrong', 'owner'] }; });
  reject(body => { const member = body.mesh.edges.find(member => member.names.includes(lower))!; member.nativeVertices = ['wrong-0', 'wrong-1']; });
  const wrongOwner = structuredClone(ctx); wrongOwner.bodies[0].key = 'another-body';
  assert.deepEqual(pivotFaceCommand.handles!(wrongOwner, { deg: 5 }), []);
});
