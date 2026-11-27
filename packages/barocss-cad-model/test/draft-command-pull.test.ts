import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDoc, type BodyResult } from '../src/engine/evaluate';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { commands, patchValues, type Ctx } from '../src/app/commands';
import { editSavedDraftCommand, editSavedPivotFaceCommand } from '../src/app/draftEdit';
import { pivotFaceCommand } from '../src/app/pivotFaceCommand';
import { part, type BodyQuery } from '../src/api';

// The Studio Draft command's Pull choice (K05 in Studio). +Z keeps the old command's documents byte for byte;
// another axis writes the same draft node as the public API (StudioPart.draft) for the same faces and angle.
const draft = commands.find(c => c.id === 'draft')!;
const bodiesOf = (doc: StudioDoc): BodyResult[] => { const r = evaluateDoc(doc, 1); assert.ok(r.ok, r.ok ? '' : r.error.title); return r.bodies; };
const facing = (b: BodyResult, n: [number, number, number]) => b.mesh.faces.findIndex(f => f.kind === 'plane' && n.every((x, k) => Math.abs(f.normal[k] - x) < 1e-9));
const ctxOn = (doc: StudioDoc, normals: [number, number, number][]): Ctx => {
  const bodies = bodiesOf(doc); return { doc, bodies, selection: { faces: normals.map(n => ({ body: 0, face: facing(bodies[0], n) })), edges: [], bodies: [] } };
};
const volume = (doc: StudioDoc) => { const v = bodiesOf(doc)[0].volume; assert.ok(v !== null); return v; };

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
