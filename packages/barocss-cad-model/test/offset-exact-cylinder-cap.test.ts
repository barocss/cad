import test from 'node:test';
import assert from 'node:assert/strict';
import { brepMassProperties, checkBrep, type Brep } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { runCheck } from '../src/chat/spec';
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
  assert.deepEqual(offsetFaceCommand.fields!(ctx).map(field => field.key), ['offsetMode', 'd']);
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
  assert.deepEqual(edit.fields!(editedCtx).map(field => field.key), ['offsetMode', 'd']);
  assert.ok(edit.onPick);
  assert.throws(() => edit.build!(editedCtx, { d: 2, offsetMode: 'to-plane' }), /earlier solid/);
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

test('Offset refuses collapse, the other cap, stale geometry, a missing plane target and chained cap offsets', async () => {
  const source = sourceDoc(), ctx = context(source), other = context(source, bottom);
  assert.equal(offsetFaceCommand.available(other).ok, false);
  assert.throws(() => offsetFaceCommand.build!(other, { d: 2 }), /original upper cap/);
  assert.throws(() => offsetFaceCommand.build!(ctx, { d: 2, offsetMode: 'to-plane' }), /earlier solid/);
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

test('the original upper cap follows a named parallel plane across reference edits and native Open', async () => {
  const base = withNode(withNode(withNode(sourceDoc(),
    { kind: 'sketch', profile: 'rectangle', min: [44, 22], max: [56, 33] }),
  { kind: 'extrude', sketch: 1, from: 13, height: 1 }),
  { kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] });
  const original = structuredClone(base);
  const bind = async (doc: StudioDoc, reference = 'n2.top') => {
    const evaluation = evaluateDoc(doc, 1);
    assert.ok(evaluation.ok);
    return dispatchTool({ doc, bodies: evaluation.bodies }, 'features', {
      action: 'command', command: 'offset-face', faces: [top, reference], values: { offsetMode: 'to-plane' },
    }, async next => evaluateDoc(next, 1));
  };
  const bound = await bind(base);
  assert.ok(bound.changed && !bound.isError, bound.content);
  assert.deepEqual(base, original);
  const accepted = bound.state.doc, saved = accepted.nodes[4];
  assert.ok(saved.kind === 'offset-face' && saved.target);
  assert.deepEqual([saved.parent, saved.faces, saved.target.body, saved.target.feature, saved.target.face],
    [{ node: 0, side: 'solid' }, [top], { node: 3, side: 'solid' }, 'n3', 'n2.top']);
  assert.equal(Object.hasOwn(saved, 'distance'), false);
  assert.deepEqual(accepted.nodes.slice(0, 4), base.nodes);
  const check = (doc: StudioDoc, height: number, reference: string) => {
    const bodies = partBreps(doc);
    assert.deepEqual(bodies.map(body => body.key).sort(), ['b3', 'b4']);
    const cap = bodies.find(body => body.key === 'b4')!.brep;
    const ref = bodies.find(body => body.key === 'b3')!.brep;
    assert.ok(checkBrep(cap, { strict: true }).valid);
    assert.equal(Math.min(...cap.vertices.map(vertex => vertex.point[2])), 0);
    assert.equal(Math.max(...cap.vertices.map(vertex => vertex.point[2])), height);
    const surface = ref.faces.find(face => face.name === reference)?.surface;
    assert.ok(surface?.kind === 'surface' && surface.controlPoints.flat().every(p => p[2] === height));
    assert.ok(Math.abs(brepMassProperties(cap, 1).volume - 18 * Math.PI * height) < 1e-8);
    return cap;
  };
  check(accepted, 14, 'n2.top');
  const move = (doc: StudioDoc, z: number): StudioDoc => ({ ...doc, nodes: doc.nodes.map((node, i) =>
    i === 3 && node.kind === 'translate' ? { ...node, offset: [0, 0, z] } : node) });
  const moved = move(accepted, -5), expected = check(moved, 9, 'n2.top');
  assert.deepEqual(moved.nodes[4], saved);
  const evaluated = evaluateDoc(moved, 1);
  assert.ok(evaluated.ok);
  const edit = editSavedOffsetFaceCommand(moved, 4);
  const ctx: Ctx = { doc: moved, bodies: evaluated.bodies, selection: { bodies: [], edges: [], faces: [] } };
  assert.ok(edit?.build && edit.onPick);
  const defaults = edit.defaults!(ctx);
  assert.equal(defaults.offsetMode, 'to-plane');
  assert.equal(defaults.keepPlane, 1);
  assert.equal(edit.build(ctx, defaults), moved);
  const body = evaluated.bodies.findIndex(item => item.key === 'b3');
  const bottomFace = evaluated.bodies[body].mesh.faces.find(face => face.name === 'n2.bottom');
  assert.ok(bottomFace);
  const retarget = edit.onPick(ctx, defaults, { face: { body, face: bottomFace.index }, edge: null });
  assert.ok(retarget && !retarget.error);
  const retargeted = edit.build(ctx, retarget);
  assert.equal(retargeted.nodes[4].id, saved.id);
  check(retargeted, 8, 'n2.bottom');
  const opened = await readStudioFile(encodeStudioFile(moved));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, moved);
  assert.deepEqual(check(opened.doc, 9, 'n2.top'), expected);

  const later = withNode(opened.doc, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 10] });
  for (const candidate of [accepted, moved, opened.doc, later]) {
    const current = evaluateDoc(candidate, 1);
    assert.ok(current.ok);
    const wall = await runCheck(candidate, current.bodies, async doc => evaluateDoc(doc, 1), {
      query: { fn: 'radial_wall', a: 'n0.normal', b: 'n0.reverse' }, op: '==', value: 2, tol: 0.01, unit: 'mm',
    });
    assert.equal(wall.status, 'pass');
    assert.deepEqual(wall.entities, ['n0.normal', 'n0.reverse']);
    assert.ok(typeof wall.measured === 'number' && Math.abs(wall.measured - 2) < 1e-8);
  }


  const unaligned = await bind(base, 'n2.side0');
  assert.ok(unaligned.isError && !unaligned.changed);
  assert.match(unaligned.content, /parallel/i);
  assert.equal(unaligned.state.doc, base);
  for (const [delta, reason] of [[-14, /opposite cap/], [-2, /same plane/]] as const) {
    const refused = evaluateDoc(move(accepted, delta), 1);
    assert.ok(!refused.ok);
    assert.match(refused.error.detail, reason);
  }
  assert.deepEqual(base, original);
});
