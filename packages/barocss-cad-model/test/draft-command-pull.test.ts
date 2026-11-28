import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDoc, type BodyResult } from '../src/engine/evaluate';
import { cylinderPart, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { verifyReferences } from '../src/engine/references';
import { commands, patchValues, type Ctx } from '../src/app/commands';
import { editSavedDraftCommand, editSavedPivotFaceCommand } from '../src/app/draftEdit';
import { pivotFaceCommand } from '../src/app/pivotFaceCommand';
import { part, type BodyQuery } from '../src/api';
import { dispatchTool } from '../src/chat/tools';
import { revisionOf } from '../src/util/revision';

// The Studio Draft command's Pull choice (K05 in Studio). +Z keeps the old command's documents byte for byte;
// another axis writes the same draft node as the public API (StudioPart.draft) for the same faces and angle.
const draft = commands.find(c => c.id === 'draft')!;
const bodiesOf = (doc: StudioDoc): BodyResult[] => { const r = evaluateDoc(doc, 1); assert.ok(r.ok, r.ok ? '' : r.error.title); return r.bodies; };
const facing = (b: BodyResult, n: [number, number, number]) => b.mesh.faces.findIndex(f => f.kind === 'plane' && n.every((x, k) => Math.abs(f.normal[k] - x) < 1e-9));
const ctxOn = (doc: StudioDoc, normals: [number, number, number][]): Ctx => {
  const bodies = bodiesOf(doc); return { doc, bodies, selection: { faces: normals.map(n => ({ body: 0, face: facing(bodies[0], n) })), edges: [], bodies: [] } };
};
const volume = (doc: StudioDoc) => { const v = bodiesOf(doc)[0].volume; assert.ok(v !== null); return v; };
const pivotContext = (doc: StudioDoc, face: string, edge: string): Ctx => {
  const bodies = bodiesOf(doc), [body] = bodies;
  return { doc, bodies, selection: { bodies: [],
    faces: [{ body: 0, face: body.mesh.faces.findIndex(member => member.nativePlaneName === face) }],
    edges: [{ body: 0, edge: body.mesh.edges.findIndex(member => member.names.includes(edge)) }],
  } };
};

test('Pivot face History only accepts exact edges on its original face and ignores a no-op', () => {
  const stock = rectanglePart(40, 20, 12), pick = ctxOn(stock, [[0, -1, 0]]);
  const [body] = pick.bodies;
  const upper = 'n1.side0|n1.top', lower = 'n1.bottom|n1.side0';
  const rear = 'n1.side2|n1.top';
  const edge = body.mesh.edges.findIndex(candidate => candidate.names.includes(upper));
  assert.ok(edge >= 0 && body.mesh.edges.some(candidate => candidate.names.includes(rear)));
  pick.selection.edges = [{ body: 0, edge }];
  const doc = pivotFaceCommand.build!(pick, { deg: 12 });
  const ctx = ctxOn(doc, []);
  const serial = JSON.stringify(doc);
  assert.equal(editSavedPivotFaceCommand(doc, 2, ctx.bodies[0]), null, 'A later body cannot stand in for the stock.');
  const command = editSavedPivotFaceCommand(doc, 2, body);
  assert.ok(command?.defaults && command.build);
  const values = command.defaults(ctx);
  assert.equal(command.build(ctx, values), doc);
  assert.throws(() => command.build!(ctx, { ...values, hingeEdge: rear }), /BAD_REFERENCE.*original Pivot face/);
  assert.throws(() => command.build!({ ...ctx, doc: { ...doc } }, values), /BAD_REFERENCE.*History again/);
  assert.equal(JSON.stringify(doc), serial);
  for (const [choice, pull] of [[lower, 'z'], ['n1.side0|n1.side1', '-x'], ['n1.side0|n1.side3', 'x']]) {
    const changed: StudioDoc = command.build(ctx, { ...values, hingeEdge: choice });
    const pivot = changed.nodes[2];
    assert.ok(pivot.kind === 'draft');
    assert.deepEqual([pivot.hingeEdge, pivot.pull, pivot.angle], [choice, pull, 12]);
    assert.deepEqual(Object.keys(pivot.sigs ?? {}).sort(), ['n1.side0', choice].sort());
    assert.equal(bodiesOf(changed)[0].topology?.kind, 'solid');
  }
});

test('Pivot face follows the exact original joint through a Rotate edit and refuses a nonadjacent name on reopen', async () => {
  const original = rectanglePart(40, 20, 12);
  const turned = withNode(original, { kind: 'rotate', parent: { node: 1, side: 'solid' }, axis: 'x', angle: 31, pivot: [9, 3, 5] });
  const bodies = bodiesOf(turned), [body] = bodies;
  const face = 'n1.side0', upper = 'n1.side0|n1.top', lower = 'n1.bottom|n1.side0';
  const ctx: Ctx = { doc: turned, bodies, selection: { bodies: [], faces: [{ body: 0,
    face: body.mesh.faces.findIndex(f => f.nativePlaneName === face) }], edges: [{ body: 0,
    edge: body.mesh.edges.findIndex(e => e.names.includes(upper)) }] } };
  const doc = pivotFaceCommand.build!(ctx, { deg: 12 }), index = 3;
  const pivot = doc.nodes[index];
  assert.ok(pivot.kind === 'draft' && pivot.sigs);
  assert.equal(Object.hasOwn(pivot, 'pull'), false);
  const edit = editSavedPivotFaceCommand(doc, index, body);
  assert.ok(edit?.defaults && edit.build);
  const editCtx = { ...ctx, doc };
  const rebound: StudioDoc = edit.build(editCtx, { ...edit.defaults(editCtx), hingeEdge: lower });
  const hinge = rebound.nodes[index];
  assert.ok(hinge.kind === 'draft' && hinge.sigs);
  assert.equal(Object.hasOwn(hinge, 'pull'), false);
  const retuned: StudioDoc = { ...rebound, nodes: rebound.nodes.map(node => node.kind === 'rotate' ? { ...node, angle: 43 } : node) };
  const rebuilt = bodiesOf(retuned);
  const evaluate = async (prefix: StudioDoc) => evaluateDoc(prefix, 3);
  const verified = await verifyReferences(retuned, rebuilt, evaluate);
  assert.deepEqual([verified.problems, verified.changes], [[], []]);
  const rear = 'n1.side2|n1.top';
  const savedSig = hinge.sigs[lower];
  const broken = { ...retuned, nodes: retuned.nodes.map((node, i) => i === index ?
    { ...hinge, hingeEdge: rear, sigs: { ...hinge.sigs, [rear]: savedSig } } : node) };
  const held = await verifyReferences(broken, [], evaluate);
  assert.ok(held.problems.some(problem => problem.name === rear && problem.candidates.length === 0));
});

test('hexagonal Pivot face accepts both cap edges of the original wall and keeps its signed world pull', () => {
  const box = rectanglePart(20, 16, 10);
  const stock: StudioDoc = { ...box, nodes: [
    { kind: 'sketch', id: 'n0', profile: 'polygon', points: [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]] },
    box.nodes[1],
  ] };
  const moved = withNode(stock, { kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [5, 2, 3] });
  const face = 'n1.side1', lower = 'n1.bottom|n1.side1', upper = 'n1.side1|n1.top';
  const deg = Math.atan(1 / 5) * 180 / Math.PI;
  const ctx = pivotContext(moved, face, lower);
  assert.ok(pivotFaceCommand.available(ctx).ok);
  const command = pivotFaceCommand.build!;
  const accepted = command(ctx, { deg }), index = 3, pivot = accepted.nodes[index];
  assert.ok(pivot.kind === 'draft');
  assert.deepEqual([pivot.faces, pivot.hingeEdge, pivot.pull], [[face], lower, 'z']);
  const expected = 67195 / 18;
  assert.ok(Math.abs(volume(accepted) - expected) < 1e-7);
  const edit = editSavedPivotFaceCommand(accepted, index, ctx.bodies[0]);
  assert.ok(edit?.fields && edit.defaults && edit.build);
  const editCtx = { ...ctx, doc: accepted };
  const choices = edit.fields(editCtx).find(field => field.key === 'hingeEdge');
  assert.ok(choices?.kind === 'choice');
  assert.deepEqual(choices.options.map(option => option.value).sort(), [lower, upper].sort());
  const changed: StudioDoc = edit.build(editCtx, { ...edit.defaults(editCtx), hingeEdge: upper });
  const next = changed.nodes[index];
  assert.ok(next.kind === 'draft');
  assert.deepEqual([next.hingeEdge, next.pull], [upper, '-z']);
  assert.ok(Math.abs(volume(changed) - expected) < 1e-7);

  for (const wrong of [pivotContext(moved, face, 'n1.side0|n1.side1'), pivotContext(moved, 'n1.bottom', lower)]) {
    assert.equal(pivotFaceCommand.available(wrong).ok, false);
    assert.throws(() => command(wrong, { deg }), /original cap edge/);
  }
});

test('triangular and octagonal Pivot faces keep cap-edge choices and the original angle handle', () => {
  const shapes = [
    { points: [[0, 0], [24, 0], [6, 16]], expected: 1690 },
    { points: [[4, 0], [16, 0], [20, 4], [20, 12], [16, 16], [4, 16], [0, 12], [0, 4]], expected: 8240 / 3 },
  ] satisfies { points: [number, number][]; expected: number }[];
  const lower = 'n1.bottom|n1.side0', upper = 'n1.side0|n1.top', deg = Math.atan(1 / 5) * 180 / Math.PI;
  for (const { points, expected } of shapes) {
    const box = rectanglePart(24, 16, 10);
    const stock: StudioDoc = { ...box, nodes: [{ kind: 'sketch', id: 'n0', profile: 'polygon', points }, box.nodes[1]] };
    const ctx = pivotContext(stock, 'n1.side0', lower);
    assert.ok(pivotFaceCommand.available(ctx).ok);
    assert.equal(pivotFaceCommand.handles!(ctx, { deg })[0].arc?.worldPlane, true);
    const first = pivotFaceCommand.build!(ctx, { deg }), edit = editSavedPivotFaceCommand(first, 2, ctx.bodies[0]);
    assert.ok(edit?.build && edit.defaults && edit.handles);
    const history = { ...ctx, doc: first }, values = { ...edit.defaults(history), hingeEdge: upper };
    const revised: StudioDoc = edit.build(history, values);
    const node = revised.nodes[2];
    assert.ok(node.kind === 'draft');
    assert.deepEqual([node.hingeEdge, node.pull, node.angle], [upper, '-z', deg]);
    assert.equal(edit.handles(history, values)[0].arc?.worldPlane, true);
    assert.ok(Math.abs(volume(first) - expected) < 1e-7 && Math.abs(volume(revised) - expected) < 1e-7);
  }
});

test('Rotated polygon Pivot retains the original cap binding on an upstream Rotate edit', async () => {
  const box = rectanglePart(24, 16, 10);
  const stock: StudioDoc = { ...box, nodes: [
    { kind: 'sketch', id: 'n0', profile: 'polygon', points: [[0, 0], [24, 0], [6, 16]] }, box.nodes[1],
  ] };
  const turned = withNode(stock, { kind: 'rotate', parent: { node: 1, side: 'solid' }, axis: 'y', angle: 37, pivot: [9, 3, 5] });
  const face = 'n1.side0', upper = 'n1.side0|n1.top', lower = 'n1.bottom|n1.side0', vertical = 'n1.side0|n1.side1';
  const ctx = pivotContext(turned, face, upper), deg = Math.atan(1 / 5) * 180 / Math.PI;
  assert.ok(pivotFaceCommand.available(ctx).ok);
  assert.equal(pivotFaceCommand.available(pivotContext(turned, face, vertical)).ok, false);
  assert.equal(pivotFaceCommand.available(pivotContext(turned, 'n1.top', upper)).ok, false);
  assert.equal(pivotFaceCommand.handles!(ctx, { deg })[0].arc?.worldPlane, true);
  const doc = pivotFaceCommand.build!(ctx, { deg }), index = 3;
  const edit = editSavedPivotFaceCommand(doc, index, ctx.bodies[0]);
  assert.ok(edit?.build && edit.fields && edit.defaults);
  const editCtx = { ...ctx, doc };
  const choices = edit.fields(editCtx).find(field => field.key === 'hingeEdge');
  assert.ok(choices?.kind === 'choice');
  assert.deepEqual(choices.options.map(option => option.value).sort(), [lower, upper].sort());
  const revised: StudioDoc = edit.build(editCtx, { ...edit.defaults(editCtx), hingeEdge: lower });
  const pivot = revised.nodes[index];
  assert.ok(pivot.kind === 'draft' && pivot.sigs);
  assert.equal(Object.hasOwn(pivot, 'pull'), false);
  const retuned: StudioDoc = { ...revised, nodes: revised.nodes.map(node => node.kind === 'rotate' ? { ...node, angle: 49 } : node) };
  assert.ok(Math.abs(volume(retuned) - 1690) < 1e-7);
  const evaluate = async (prefix: StudioDoc) => evaluateDoc(prefix, 3);
  const verified = await verifyReferences(retuned, bodiesOf(retuned), evaluate);
  assert.deepEqual([verified.problems, verified.changes], [[], []]);
  const broken: StudioDoc = { ...retuned, nodes: retuned.nodes.map((node, i) => i === index ?
    { ...pivot, hingeEdge: vertical, sigs: { [face]: pivot.sigs![face], [vertical]: pivot.sigs![lower] } } : node) };
  const held = await verifyReferences(broken, [], evaluate);
  assert.ok(held.problems.some(problem => problem.name === vertical && problem.candidates.length === 0));
});

test('Studio draft: +Z is the default for a side face and builds the old node, without a pull', () => {
  const doc = rectanglePart(40, 30, 10), ctx = ctxOn(doc, [[0, -1, 0]]);
  assert.equal(draft.available(ctx).ok, true);
  const v = draft.defaults!(ctx); assert.equal(v.pull, 'z');
  const node = draft.build!(ctx, v).nodes.at(-1)!;
  assert.ok(node.kind === 'draft'); assert.equal(Object.hasOwn(node, 'pull'), false); assert.equal(Object.hasOwn(node, 'neutral'), false);
  assert.deepEqual({ ...node, id: undefined }, { kind: 'draft', parent: node.parent, faces: node.faces, angle: 5, id: undefined });
  // Every side of the extrusion, pulled along +Z: still the extrusion's own draft, as before.
  const all = ctxOn(doc, [[0, -1, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0]]), own = draft.build!(all, draft.defaults!(all));
  assert.equal(own.nodes.length, doc.nodes.length); const ex = own.nodes.find(n => n.kind === 'extrude'); assert.ok(ex && ex.kind === 'extrude' && ex.draft === 5);
});

test('Studio draft: a face no +Z draft takes defaults to the first pull that takes it, and builds what the API builds', () => {
  const doc = rectanglePart(40, 30, 10), top = ctxOn(doc, [[0, 0, 1]]);
  assert.equal(draft.available(top).ok, true, 'the top face drafts along X');
  const v = draft.defaults!(top); assert.equal(v.pull, 'x');
  const steps = draft.steps!(top, v); assert.equal(steps[0].done, true);
  const made = draft.build!(top, v), node = made.nodes.at(-1)!;
  assert.ok(node.kind === 'draft' && node.pull === 'x' && node.angle === 5); assert.equal(Object.hasOwn(node, 'neutral'), false);
  const api = part('api', doc).draft((b: BodyQuery) => b.faces().facing('+z'), { angle: 5, pull: 'x' }).doc.nodes.at(-1)!;
  assert.ok(api.kind === 'draft'); assert.deepEqual([api.pull, api.angle, api.faces], [node.pull, node.angle, node.faces]);
  assert.ok(Math.abs(volume(made) - volume(part('api', doc).draft((b: BodyQuery) => b.faces().facing('+z'), { angle: 5, pull: 'x' }).doc)) < 1e-9);
  // −X for the same side face: a different solid from +Z, the node says which.
  const side = ctxOn(doc, [[0, -1, 0]]), negY = draft.build!(side, { deg: 5, pull: '-x' });
  const n = negY.nodes.at(-1)!; assert.ok(n.kind === 'draft' && n.pull === '-x');
  assert.ok(Math.abs(volume(negY) - volume(draft.build!(side, { deg: 5, pull: 'z' }))) > 1e-6);
});

test('Studio draft: a pull the picked face is not square to is refused, naming the axis', () => {
  const doc = rectanglePart(40, 30, 10), top = ctxOn(doc, [[0, 0, 1]]);
  assert.throws(() => draft.build!(top, { deg: 5, pull: 'z' }), /square to Z/);
  const steps = draft.steps!(top, { deg: 5, pull: 'z' }); assert.equal(steps[0].done, false);
});

test('Studio Draft creates a fixed neutral coordinate and preserves its binding when editing the angle', () => {
  const source = rectanglePart(40, 30, 10), ctx = ctxOn(source, [[0, -1, 0]]);
  const automatic = { ...draft.defaults!(ctx), pull: '-x' };
  const fixed = patchValues(draft, ctx, automatic, { neutralMode: 'fixed' });
  assert.equal(fixed.neutral, 40);
  const created = draft.build!(ctx, { ...fixed, neutral: 42 });
  const index = created.nodes.length - 1, made = created.nodes[index];
  assert.ok(made.kind === 'draft');
  assert.equal(made.pull, '-x');
  assert.equal(made.neutral, 42);
  const bound = { ...created, parameters: { Neutral: 42 }, nodes: created.nodes.map((node, i) =>
    i === index ? { ...made, neutral: { parameter: 'Neutral' } } : node) };
  const command = editSavedDraftCommand(bound, index);
  assert.ok(command?.build && command.defaults);
  const editContext = { doc: bound, bodies: [], selection: { faces: [], edges: [], bodies: [] } };
  const values = command.defaults(editContext);
  assert.deepEqual(values, { deg: 5, pull: '-x', neutralMode: 'fixed', neutral: 42 });
  assert.equal(command.build(editContext, values), bound);
  const next = command.build(editContext, { ...values, deg: 6 });
  assert.deepEqual(next.nodes[index], { ...made, angle: 6, neutral: { parameter: 'Neutral' } });
  const restored = command.build(editContext, { ...values, neutralMode: 'auto' }).nodes[index];
  assert.ok(restored.kind === 'draft');
  assert.equal(restored.neutral, undefined);
  assert.throws(() => command.build!({ ...editContext, doc: { ...bound } }, values), /Open the current Draft in History again/);
});

test('Studio Draft binds both native halves of the original cylindrical wall', () => {
  const doc = cylinderPart(10, 20), bodies = bodiesOf(doc), body = bodies[0];
  const face = body.mesh.faces.findIndex(candidate => candidate.exact?.kind === 'cylinder');
  assert.ok(face >= 0);
  const ctx: Ctx = { doc, bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face }] } };
  assert.ok(draft.available(ctx).ok);
  const fixed = patchValues(draft, ctx, { ...draft.defaults!(ctx), pull: '-z' }, { neutralMode: 'fixed' });
  assert.equal(fixed.neutral, 20);
  assert.throws(() => draft.build!(ctx, { ...fixed, pull: 'x' }), /flat side faces/);
  const made = draft.build!(ctx, { ...fixed, pull: 'z', neutral: 8, deg: 10 });
  assert.deepEqual(made.nodes.slice(0, 2), doc.nodes);
  const node = made.nodes[2];
  assert.ok(node.kind === 'draft');
  assert.deepEqual(node.faces, ['n1.side0#1', 'n1.side0#2']);
  const slope = Math.tan(Math.PI / 18), bottom = 10 + 8 * slope, top = 10 - 12 * slope;
  assert.ok(Math.abs(volume(made) - Math.PI * 20 / 3 * (bottom ** 2 + bottom * top + top ** 2)) < 1e-7);
});

test('Studio Draft keeps the world neutral coordinate for an original YZ cylinder', () => {
  const source = cylinderPart(10, 20), sketch = source.nodes[0], extrusion = source.nodes[1];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'circle' && extrusion.kind === 'extrude');
  const doc: StudioDoc = { ...source, nodes: [
    { ...sketch, center: [12, -7], plane: { origin: [10, 20, 30], normal: [1, 0, 0], xAxis: [0, 1, 0] } },
    { ...extrusion, from: 3 },
  ] };
  const bodies = bodiesOf(doc), face = bodies[0].mesh.faces.findIndex(candidate => candidate.exact?.kind === 'cylinder');
  assert.ok(face >= 0);
  const ctx: Ctx = { doc, bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face }] } };
  assert.ok(draft.available(ctx).ok);
  const auto = draft.defaults!(ctx);
  assert.equal(auto.pull, 'x');
  const fixed = patchValues(draft, ctx, auto, { neutralMode: 'fixed' });
  assert.equal(fixed.neutral, 13);
  assert.equal(patchValues(draft, ctx, { ...auto, pull: '-x' }, { neutralMode: 'fixed' }).neutral, 33);
  assert.throws(() => draft.build!(ctx, { ...auto, pull: 'z', deg: 10 }), /flat side faces/);
  const made = draft.build!(ctx, { ...fixed, neutral: 21, deg: 10 });
  const node = made.nodes[2];
  assert.ok(node.kind === 'draft');
  assert.equal(node.pull, 'x');
  assert.equal(node.neutral, 21);
  assert.deepEqual(node.faces, ['n1.side0#1', 'n1.side0#2']);
  assert.ok(Math.abs(volume(made) - 5912.958606927207) < 1e-7);

  const automatic = draft.build!(ctx, { ...auto, deg: 10 });
  const history = editSavedDraftCommand(automatic, 2), editCtx = { ...ctx, doc: automatic, bodies: bodiesOf(automatic) };
  assert.ok(history?.defaults && history.build);
  const savedAuto = history.defaults(editCtx);
  assert.equal(savedAuto.neutralMode, 'auto');
  const fixedAtCap = patchValues(history, editCtx, savedAuto, { neutralMode: 'fixed' });
  assert.equal(fixedAtCap.neutral, 13);
  assert.equal(volume(history.build(editCtx, fixedAtCap)), volume(automatic));
  assert.equal(patchValues(history, editCtx, { ...savedAuto, pull: '-x' }, { neutralMode: 'fixed' }).neutral, 33);
  assert.equal(patchValues(history, editCtx, { ...savedAuto, pull: 'z' }, { neutralMode: 'fixed' }).neutral, '');

  const incomplete: StudioDoc = { ...automatic, nodes: [...automatic.nodes.slice(0, 2), { ...node, neutral: undefined, faces: [node.faces[0]] }] };
  const partialEdit = editSavedDraftCommand(incomplete, 2), partialCtx = { ...editCtx, doc: incomplete };
  assert.ok(partialEdit?.defaults);
  assert.equal(patchValues(partialEdit, partialCtx, partialEdit.defaults(partialCtx), { neutralMode: 'fixed' }).neutral, '');
});

test('Studio Draft on a translated XY cylinder derives signed world caps for new and saved Draft', () => {
  const source = cylinderPart(10, 20), [sketch, extrusion] = source.nodes;
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'circle' && extrusion.kind === 'extrude');
  const doc: StudioDoc = { ...source, nodes: [
    { ...sketch, center: [12, -7], plane: { origin: [10, 20, 30], normal: [0, 0, 1], xAxis: [1, 0, 0] } },
    { ...extrusion, from: 3 },
  ] };
  const bodies = bodiesOf(doc), face = bodies[0].mesh.faces.findIndex(candidate => candidate.exact?.kind === 'cylinder');
  assert.ok(face >= 0);
  const ctx: Ctx = { doc, bodies, selection: { bodies: [], edges: [], faces: [{ body: 0, face }] } };
  assert.ok(draft.available(ctx).ok);
  for (const pull of ['z', '-z'] as const) {
    const auto = { ...draft.defaults!(ctx), pull };
    const fixed = patchValues(draft, ctx, auto, { neutralMode: 'fixed' });
    const cap = pull === 'z' ? 33 : 53;
    assert.equal(fixed.neutral, cap);
    const made = draft.build!(ctx, { ...auto, deg: 10 });
    const node = made.nodes[2];
    assert.ok(node.kind === 'draft');
    assert.deepEqual(node.faces, ['n1.side0#1', 'n1.side0#2']);
    assert.equal(node.pull, pull === 'z' ? undefined : '-z');
    const history = editSavedDraftCommand(made, 2), editCtx = { ...ctx, doc: made, bodies: bodiesOf(made) };
    assert.ok(history?.defaults && history.build);
    const savedFixed = patchValues(history, editCtx, history.defaults(editCtx), { neutralMode: 'fixed' });
    assert.equal(savedFixed.neutral, cap);
    const interior = history.build(editCtx, { ...savedFixed, neutral: 41 });
    const expectedVolume = pull === 'z' ? 5912.958606927207 : 6799.274682484619;
    assert.ok(Math.abs(volume(interior) - expectedVolume) < 1e-7);
  }
});

test('Studio Draft selects both original bore halves and keeps the signed neutral cap through History', async () => {
  const source = cylinderPart(12, 16), [sketch, extrusion] = source.nodes;
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'circle' && extrusion.kind === 'extrude');
  const doc: StudioDoc = { ...source, nodes: [{ ...sketch, center: [14, 9],
    holes: [[{ kind: 'arc', start: [18, 9], center: [14, 9], direction: 'ccw' }]] }, { ...extrusion, from: 3 }] };
  const bodies = bodiesOf(doc), face = bodies[0].mesh.faces.findIndex(candidate => candidate.name === 'n1.hole0.side0');
  assert.ok(face >= 0);
  const ctx: Ctx = { doc, bodies, selection: { bodies: [], faces: [{ body: 0, face }], edges: [] } };
  assert.equal(draft.available(ctx).ok, true);
  const defaults = draft.defaults!(ctx);
  assert.equal(defaults.pull, 'z');
  assert.equal(patchValues(draft, ctx, defaults, { neutralMode: 'fixed' }).neutral, 3);
  assert.equal(patchValues(draft, ctx, { ...defaults, pull: '-z' }, { neutralMode: 'fixed' }).neutral, 19);
  assert.throws(() => draft.build!(ctx, { ...defaults, pull: 'x' }), /flat side faces/);
  const cap = bodies[0].mesh.faces.findIndex(candidate => candidate.nativePlaneName === 'n1.top');
  assert.equal(draft.available({ ...ctx, selection: { ...ctx.selection, faces: [{ body: 0, face }, { body: 0, face: cap }] } }).ok, false);
  const accepted = draft.build!(ctx, { ...defaults, deg: 8 });
  const node = accepted.nodes[2];
  assert.ok(node.kind === 'draft');
  assert.deepEqual(node.faces, ['n1.hole0.side0#1', 'n1.hole0.side0#2']);
  const saved = editSavedDraftCommand(accepted, 2);
  assert.ok(saved?.defaults && saved.build);
  const history = { ...ctx, doc: accepted };
  const values = saved.defaults(history);
  assert.equal(patchValues(saved, history, values, { neutralMode: 'fixed' }).neutral, 3);
  const negativePull = patchValues(saved, history, { ...values, pull: '-z' }, { neutralMode: 'fixed' });
  assert.equal(negativePull.neutral, 19);
  const angle = -8, changed = saved.build(history, { ...negativePull, deg: angle });
  for (const [candidate, cap] of [[accepted, 4 + 16 * Math.tan(8 * Math.PI / 180)],
    [changed, 4 + 16 * Math.tan(angle * Math.PI / 180)]] as const) {
    const expected = Math.PI * 16 * (144 - (16 + 4 * cap + cap * cap) / 3);
    assert.ok(Math.abs(volume(candidate) - expected) < 1e-7);
  }
  const agent = await dispatchTool({ doc, bodies }, 'features', { action: 'command', command: 'draft',
    faces: ['n1.hole0.side0'], values: { deg: 8 }, expectedRevision: revisionOf(doc) }, async next => evaluateDoc(next, 2));
  assert.ok(agent.changed && !agent.isError, agent.content);
  assert.deepEqual(agent.state.doc.nodes[2], node);
});

test('Studio Draft selects both original outside halves of a tube and keeps its bore and saved neutral', async () => {
  const source = cylinderPart(12, 16), [sketch, extrusion] = source.nodes;
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'circle' && extrusion.kind === 'extrude');
  const doc: StudioDoc = { ...source, nodes: [{ ...sketch, center: [14, 9],
    holes: [[{ kind: 'arc', start: [18, 9], center: [14, 9], direction: 'ccw' }]] }, { ...extrusion, from: 3 }] };
  const bodies = bodiesOf(doc), face = bodies[0].mesh.faces.findIndex(candidate => candidate.name === 'n1.side0');
  assert.ok(face >= 0);
  const ctx: Ctx = { doc, bodies, selection: { bodies: [], faces: [{ body: 0, face }], edges: [] } };
  assert.equal(draft.available(ctx).ok, true);
  const defaults = draft.defaults!(ctx);
  assert.equal(defaults.pull, 'z');
  assert.equal(patchValues(draft, ctx, defaults, { neutralMode: 'fixed' }).neutral, 3);
  const candidate = draft.build!(ctx, { ...defaults, deg: 8 });
  const node = candidate.nodes[2];
  assert.ok(node.kind === 'draft');
  assert.deepEqual(node.faces, ['n1.side0#1', 'n1.side0#2']);
  const edit = editSavedDraftCommand(candidate, 2);
  assert.ok(edit?.defaults && edit.build);
  const history = { ...ctx, doc: candidate };
  const neutral = patchValues(edit, history, { ...edit.defaults(history), pull: '-z' }, { neutralMode: 'fixed' });
  assert.equal(neutral.neutral, 19);
  const reverse = edit.build(history, { ...neutral, deg: -8 });
  for (const [part, radius] of [[candidate, 12 - 16 * Math.tan(8 * Math.PI / 180)],
    [reverse, 12 + 16 * Math.tan(8 * Math.PI / 180)]] as const) {
    const expected = Math.PI * 16 * ((144 + 12 * radius + radius * radius) / 3 - 16);
    assert.ok(Math.abs(volume(part) - expected) < 1e-7);
  }
  const agent = await dispatchTool({ doc, bodies }, 'features', { action: 'command', command: 'draft',
    faces: ['n1.side0'], values: { deg: 8 }, expectedRevision: revisionOf(doc) }, async next => evaluateDoc(next, 2));
  assert.ok(agent.changed && !agent.isError, agent.content);
  assert.deepEqual(agent.state.doc.nodes[2], node);
});

test('Studio and Agent Draft both original tube walls in either pick order with one neutral plane', async () => {
  const source = cylinderPart(12, 16), [sketch, extrusion] = source.nodes;
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'circle' && extrusion.kind === 'extrude');
  const doc: StudioDoc = { ...source, nodes: [{ ...sketch, center: [14, 9],
    holes: [[{ kind: 'arc', start: [18, 9], center: [14, 9], direction: 'ccw' }]] }, { ...extrusion, from: 3 }] };
  const bodies = bodiesOf(doc), walls = ['n1.side0', 'n1.hole0.side0'];
  const faces = walls.map(name => ({ body: 0, face: bodies[0].mesh.faces.findIndex(face => face.name === name) }));
  assert.ok(faces.every(face => face.face >= 0));
  const ctx: Ctx = { doc, bodies, selection: { faces, edges: [], bodies: [] } };
  const defaults = draft.defaults!(ctx), deg = Math.atan(1 / 16) * 180 / Math.PI;
  assert.equal(draft.available(ctx).ok, true);
  assert.equal(draft.available({ ...ctx, selection: { faces: [faces[0], faces[0]], edges: [], bodies: [] } }).ok, false);
  const candidate = draft.build!(ctx, { ...defaults, deg });
  const node = candidate.nodes[2];
  assert.ok(node.kind === 'draft');
  assert.deepEqual(node.faces, ['n1.hole0.side0#1', 'n1.hole0.side0#2', 'n1.side0#1', 'n1.side0#2']);
  const reversed = { ...ctx, selection: { ...ctx.selection, faces: [...faces].reverse() } };
  assert.deepEqual(draft.build!(reversed, { ...defaults, deg }), candidate);
  assert.ok(Math.abs(volume(candidate) - 1792 * Math.PI) < 1e-7);
  const edit = editSavedDraftCommand(candidate, 2);
  assert.ok(edit?.defaults);
  const history = { ...ctx, doc: candidate };
  const automatic = edit.defaults(history);
  assert.equal(patchValues(edit, history, automatic, { neutralMode: 'fixed' }).neutral, 3);
  assert.equal(patchValues(edit, history, { ...automatic, pull: '-z' }, { neutralMode: 'fixed' }).neutral, 19);

  const agent = await dispatchTool({ doc, bodies }, 'features', { action: 'command', command: 'draft',
    faces: walls, values: { deg }, expectedRevision: revisionOf(doc) }, async next => evaluateDoc(next, 2));
  assert.ok(agent.changed && !agent.isError, agent.content);
  assert.deepEqual(agent.state.doc.nodes[2], node);
});

test('Studio Draft retains three selected box sides through its editable History command', () => {
  const source = rectanglePart(40, 30, 40), ctx = ctxOn(source, [[1, 0, 0], [0, -1, 0], [0, 1, 0]]);
  const created = draft.build!(ctx, { ...draft.defaults!(ctx), deg: 10, pull: 'z' });
  const index = created.nodes.length - 1, node = created.nodes[index];
  assert.ok(node.kind === 'draft');
  assert.equal(new Set(node.faces).size, 3);
  assert.deepEqual(created.nodes.slice(0, -1), source.nodes);
  const checkVolume = (doc: StudioDoc, angle: number) => {
    const s = Math.tan(angle * Math.PI / 180), h = 40;
    const expected = 40 * 30 * h - 110 * s * h ** 2 / 2 + 2 * s ** 2 * h ** 3 / 3;
    assert.ok(Math.abs(volume(doc) - expected) < 1e-7);
  };
  checkVolume(created, 10);
  const command = editSavedDraftCommand(created, index);
  assert.ok(command?.build && command.defaults);
  const editContext = { doc: created, bodies: [], selection: { faces: [], edges: [], bodies: [] } };
  const edited = command.build(editContext, { ...command.defaults(editContext), deg: -12 });
  assert.deepEqual(edited.nodes[index], { ...node, angle: -12 });
  checkVolume(edited, -12);
});

test('Studio Draft keeps all four original sides and the fixed interior plane through a signed edit', () => {
  const source = rectanglePart(40, 30, 40);
  const ctx = ctxOn(source, [[1, 0, 0], [0, -1, 0], [-1, 0, 0], [0, 1, 0]]);
  const defaults = draft.defaults!(ctx);
  const automatic = draft.build!(ctx, { ...defaults, deg: 10 });
  assert.equal(automatic.nodes.length, source.nodes.length);
  const extrusion = automatic.nodes.at(-1);
  assert.ok(extrusion?.kind === 'extrude');
  assert.equal(extrusion.draft, 10);

  const fixed = draft.build!(ctx, { ...defaults, deg: 10, neutralMode: 'fixed', neutral: 4 });
  const index = source.nodes.length, node = fixed.nodes[index];
  assert.ok(node.kind === 'draft');
  assert.equal(node.neutral, 4);
  assert.equal(new Set(node.faces).size, 4);
  assert.deepEqual(fixed.nodes.slice(0, index), source.nodes);
  const expected = (angle: number) => {
    const slope = Math.tan(angle * Math.PI / 180);
    const area = (z: number) => (40 - 2 * (z - 4) * slope) * (30 - 2 * (z - 4) * slope);
    return 40 * (area(0) + 4 * area(20) + area(40)) / 6;
  };
  assert.ok(Math.abs(volume(fixed) - expected(10)) < 1e-7);
  const edit = editSavedDraftCommand(fixed, index);
  assert.ok(edit?.build && edit.defaults);
  const editContext = { ...ctx, doc: fixed };
  const changed = edit.build(editContext, { ...edit.defaults(editContext), deg: -12 });
  assert.deepEqual(changed.nodes[index], { ...node, angle: -12 });
  assert.deepEqual(changed.nodes.slice(0, index), source.nodes);
  assert.ok(Math.abs(volume(changed) - expected(-12)) < 1e-7);
});
