import test from 'node:test';
import assert from 'node:assert/strict';
import { brepMassProperties, checkBrep, type Brep } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { runCheck } from '../src/chat/spec';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { directFaceDocumentProblem, emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
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

test('the original lower cap uses signed distance and preserves the upper station and radial wall', async () => {
  const source = sourceDoc(), ctx = context(source, bottom);
  assert.equal(offsetFaceCommand.available(ctx).ok, true);
  assert.deepEqual(offsetFaceCommand.fields!(ctx).map(field => field.key), ['offsetMode', 'd']);
  const [handle] = offsetFaceCommand.handles!(ctx, { d: 2 });
  assert.deepEqual(handle.dir, [0, 0, -1]);
  assert.equal(handle.at[2], 0);
  assert.throws(() => offsetFaceCommand.build!(ctx, { offsetMode: 'to-plane' }), /earlier solid/);

  const outward = offsetFaceCommand.build!(ctx, { d: 2 }), saved = outward.nodes[1];
  assert.ok(saved.kind === 'offset-face');
  assert.deepEqual(saved.faces, [bottom]);
  assert.equal(saved.distance, 2);
  assert.equal(saved.target, undefined);
  assert.deepEqual(outward.nodes[0], source.nodes[0]);
  const edit = editSavedOffsetFaceCommand(outward, 1), current = context(outward, bottom);
  assert.ok(edit?.build);
  assert.deepEqual(edit.fields!(current).map(field => field.key), ['offsetMode', 'd']);
  assert.ok(edit.onPick);
  assert.throws(() => edit.build!(current, { offsetMode: 'to-plane' }), /earlier solid/);
  const inward = edit.build(current, { d: -3 });
  assert.deepEqual(inward.nodes[1], { ...saved, distance: -3 });

  for (const [doc, station] of [[outward, -2], [inward, 3]] as const) {
    const brep = native(doc), z = brep.vertices.map(vertex => vertex.point[2]);
    assert.equal(Math.min(...z), station);
    assert.equal(Math.max(...z), 12);
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 18 * Math.PI * (12 - station)) < 1e-8);
    const result = evaluateDoc(doc, 1);
    assert.ok(result.ok);
    const wall = await runCheck(doc, result.bodies, async next => evaluateDoc(next, 1), {
      query: { fn: 'radial_wall', a: 'n0.normal', b: 'n0.reverse' }, op: '==', value: 2, tol: 0.01, unit: 'mm',
    });
    assert.equal(wall.status, 'pass');
    assert.deepEqual(wall.entities, ['n0.normal', 'n0.reverse']);
    assert.ok(typeof wall.measured === 'number' && Math.abs(wall.measured - 2) < 1e-8);
  }
  const opened = await readStudioFile(encodeStudioFile(inward));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, inward);
  assert.deepEqual(native(opened.doc), native(inward));

  const reverse = offsetFaceCommand.build!(context(sourceDoc(true), top), { d: 2 });
  assert.equal(Math.min(...native(reverse).vertices.map(vertex => vertex.point[2])), -2);
  for (const d of [-12, -13, -12 + 1e-8]) {
    const result = evaluateDoc(edit.build(current, { d }), 1);
    assert.ok(!result.ok, String(d));
    assert.match(result.error.detail, /opposite cap/i);
  }
});

test('Offset refuses collapse, a side face, stale geometry, a missing plane target and chained cap offsets', async () => {
  const source = sourceDoc(), ctx = context(source), other = context(source, 'n0.u-min');
  assert.equal(offsetFaceCommand.available(other).ok, false);
  assert.throws(() => offsetFaceCommand.build!(other, { d: 2 }), /original axial cap/);
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
  const wrongCap = { ...applied, nodes: [applied.nodes[0], { ...saved, faces: ['n0.u-min'], sigs: { 'n0.u-min': saved.sigs[top] } }] } as StudioDoc;
  for (const forged of [chain, wrongCap]) {
    assert.equal(evaluateDoc(forged, 1).ok, false);
    const reopened = await readStudioFile(encodeStudioFile(forged));
    assert.ok('error' in reopened);
    assert.match(reopened.error, /original (Exact semicylinder|axial cap)/);
  }
});

for (const [end, cap, station, delta] of [['upper', top, 14, -5], ['lower', bottom, -2, 5]] as const) {
  test(`the original ${end} cap follows a named parallel plane across reference edits and native Open`, async () => {
    const base = withNode(withNode(withNode(sourceDoc(),
      { kind: 'sketch', profile: 'rectangle', min: [44, 22], max: [56, 33] }),
    { kind: 'extrude', sketch: 1, from: station - 1, height: 1 }),
    { kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] });
    const original = structuredClone(base);
    const bind = async (doc: StudioDoc, reference = 'n2.top') => {
      const evaluation = evaluateDoc(doc, 1);
      assert.ok(evaluation.ok);
      return dispatchTool({ doc, bodies: evaluation.bodies }, 'features', {
        action: 'command', command: 'offset-face', faces: [cap, reference], values: { offsetMode: 'to-plane' },
      }, async next => evaluateDoc(next, 1));
    };
    const bound = await bind(base);
    assert.ok(bound.changed && !bound.isError, bound.content);
    assert.deepEqual(base, original);
    const accepted = bound.state.doc, saved = accepted.nodes[4];
    assert.ok(saved.kind === 'offset-face' && saved.target);
    assert.deepEqual([saved.parent, saved.faces, saved.target.body, saved.target.feature, saved.target.face],
      [{ node: 0, side: 'solid' }, [cap], { node: 3, side: 'solid' }, 'n3', 'n2.top']);
    assert.equal(Object.hasOwn(saved, 'distance'), false);
    assert.deepEqual(accepted.nodes.slice(0, 4), base.nodes);
    const check = (doc: StudioDoc, z: number, reference: string) => {
      const bodies = partBreps(doc);
      assert.deepEqual(bodies.map(body => body.key).sort(), ['b3', 'b4']);
      const solid = bodies.find(body => body.key === 'b4')!.brep;
      const ref = bodies.find(body => body.key === 'b3')!.brep;
      assert.ok(checkBrep(solid, { strict: true }).valid);
      const [lo, hi] = end === 'lower' ? [z, 12] : [0, z];
      assert.equal(Math.min(...solid.vertices.map(vertex => vertex.point[2])), lo);
      assert.equal(Math.max(...solid.vertices.map(vertex => vertex.point[2])), hi);
      const surface = ref.faces.find(face => face.name === reference)?.surface;
      assert.ok(surface?.kind === 'surface' && surface.controlPoints.flat().every(p => p[2] === z));
      assert.ok(Math.abs(brepMassProperties(solid, 1).volume - 18 * Math.PI * (hi - lo)) < 1e-8);
      return solid;
    };
    check(accepted, station, 'n2.top');
    if (end === 'upper') {
      const originalWall = 'n0.normal';
      const linkedResult = evaluateDoc(accepted, 1);
      assert.ok(linkedResult.ok);
      const body = linkedResult.bodies.findIndex(item => item.key === 'b4');
      const face = linkedResult.bodies[body].mesh.faces.findIndex(item => item.name === originalWall);
      assert.ok(face >= 0);
      assert.equal(offsetFaceCommand.available({ doc: accepted, bodies: linkedResult.bodies,
        selection: { faces: [{ body, face }], edges: [], bodies: [] } }).ok, false);
      const initialResult = evaluateDoc(base, 1);
      assert.ok(initialResult.ok);
      const radial = await dispatchTool({ doc: base, bodies: initialResult.bodies }, 'features',
        { action: 'command', command: 'offset-face', faces: [originalWall], values: { d: 2 } }, async doc => evaluateDoc(doc, 1));
      assert.ok(radial.changed && !radial.isError, radial.content);
      const radialNode = radial.state.doc.nodes[4];
      assert.ok(radialNode.kind === 'offset-face' && radialNode.sigs && saved.sigs);
      const parent = { node: 4, side: 'solid' } as const;
      const forgedWall = withNode(accepted, { kind: 'offset-face', parent, faces: [originalWall], distance: 2, sigs: radialNode.sigs });
      const forgedCap = withNode(radial.state.doc, { kind: 'offset-face', parent, faces: [cap], target: saved.target, sigs: saved.sigs });
      for (const candidate of [forgedWall, forgedCap]) {
        assert.match(directFaceDocumentProblem(candidate) ?? '', /one signed Offset of the original Exact semicylinder/);
        assert.ok(!evaluateDoc(candidate, 1).ok);
      }
    }
    const move = (doc: StudioDoc, z: number): StudioDoc => ({ ...doc, nodes: doc.nodes.map((node, i) =>
      i === 3 && node.kind === 'translate' ? { ...node, offset: [0, 0, z] } : node) });
    const movedStation = station + delta;
    const moved = move(accepted, delta), expected = check(moved, movedStation, 'n2.top');
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
    check(retargeted, movedStation - 1, 'n2.bottom');
    const opened = await readStudioFile(encodeStudioFile(moved));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, moved);
    assert.deepEqual(check(opened.doc, movedStation, 'n2.top'), expected);

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
    const [start, opposite] = end === 'lower' ? [0, 12] : [12, 0];
    for (const [change, reason] of [[opposite - station, /opposite cap/], [start - station, /same plane/]] as const) {
      const refused = evaluateDoc(move(accepted, change), 1);
      assert.ok(!refused.ok);
      assert.match(refused.error.detail, reason);
    }
    assert.deepEqual(base, original);
  });
}
