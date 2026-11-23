import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, type Curve } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { savedPairedElbowOutletOffsetHandle } from '../src/app/pairedElbowOutletOffsetHandle';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, isPairedElbowInletOffsetSource, prefixDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';

const path: Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'> = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [20, 0, 0], [20, 20, 0], [20, 27, 0], [20, 34, 0]],
  weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1],
};
const arcLinePath: typeof path = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [[20, 20, 0], [20, 0, 0], [0, 0, 0], [-5, 0, 0], [-10, 0, 0]],
  weights: [1, Math.SQRT1_2, 1, 1, 1],
};
const hole = (center: number) => ([[-1, center - 1], [-1, center + 1], [1, center + 1], [1, center - 1]] as [number, number][])
  .map(start => ({ kind: 'line' as const, start }));
function fixture(rail = path): StudioDoc {
  return withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5],
    holes: [hole(-2), hole(2)], sideTags: { outer: ['e1', 'e2', 'e3', 'e4'],
      holes: [['e5', 'e6', 'e7', 'e8'], ['e9', 'e10', 'e11', 'e12']] } }),
  { kind: 'sweep-curve', sketch: 0, name: 'Paired duct rail', path: rail, mode: 'exact' });
}
function context(doc: StudioDoc, name = 'n1.end'): Ctx {
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok, result.ok ? '' : result.error.detail);
  assert.equal(result.bodies.length, 1);
  const face = result.bodies[0].mesh.faces.findIndex(candidate => candidate.name === name);
  assert.ok(face >= 0);
  return { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face }], edges: [], bodies: [] } };
}
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);
function checkHandle(doc: StudioDoc, distance: number, savedDistance: number) {
  const ctx = context(doc), original = context(prefixDoc(doc, 2));
  const handles = savedPairedElbowOutletOffsetHandle(doc, 2, ctx, { d: distance }, () => original);
  assert.equal(handles.length, 1);
  const [handle] = handles;
  assert.equal(handle.key, 'd'); assert.equal(handle.step, .5);
  handle.at.forEach((value, axis) => near(value, [20, 34 + distance, 0][axis]));
  handle.dir.forEach((value, axis) => near(value, [0, 1, 0][axis]));
  assert.equal(distance < 0 ? handle.max : handle.min,
    distance < 0 ? Math.max(-.1, distance, savedDistance) : Math.min(.1, distance, savedDistance));
  return { ctx, original, handle };
}

test('saved paired outlet uses its original signed origin, cached native receipt and typed reverse', () => {
  const source = fixture(), sourceBefore = structuredClone(source), original = context(source);
  const originalVolume = brepMassProperties(partBreps(source)[0].brep, 1).volume;
  for (const savedDistance of [-4, 4]) {
    const doc = offsetFaceCommand.build!(original, { d: savedDistance }), before = structuredClone(doc);
    const { ctx, handle } = checkHandle(doc, savedDistance, savedDistance);
    let calls = 0;
    const getSource = () => { calls++; return original; };
    const fresh = { ...ctx, bodies: [{ ...ctx.bodies[0] }] };
    assert.equal(savedPairedElbowOutletOffsetHandle(doc, 2, fresh, { d: savedDistance }, getSource).length, 1);
    const [draft] = savedPairedElbowOutletOffsetHandle(doc, 2, fresh, { d: savedDistance * 1.5 }, getSource);
    assert.equal(calls, 1, 'Pointer distance changes reuse the native receipt');
    draft.at.forEach((value, axis) => near(value - handle.at[axis], [0, savedDistance * .5, 0][axis]));
    for (const distance of [0, -savedDistance, Number.NaN, Number.POSITIVE_INFINITY])
      assert.deepEqual(savedPairedElbowOutletOffsetHandle(doc, 2, ctx, { d: distance }, getSource), []);
    assert.deepEqual(savedPairedElbowOutletOffsetHandle(doc, 2, ctx, { d: savedDistance, offsetMode: 'to-plane' }, getSource), []);
    const edit = editSavedOffsetFaceCommand(doc, 2);
    assert.ok(edit?.build);
    for (const distance of [savedDistance * 1.5, -savedDistance]) {
      const changed: StudioDoc = edit.build(ctx, { d: distance });
      const { brep: native } = partBreps(changed)[0];
      assert.ok(checkBrep(native, { strict: true }).valid);
      near(brepMassProperties(native, 1).volume - originalVolume, 32 * distance);
      assert.deepEqual(changed.nodes.slice(0, 2), source.nodes);
      checkHandle(changed, distance, distance);
    }
    assert.deepEqual(doc, before);
  }
  assert.deepEqual(source, sourceBefore);
});

test('fresh native Open and a retained Direct rail keep the original owner and cap frame', async () => {
  const direct: NonNullable<StudioDoc['direct']> = { sources: { rails: `@model rails { version:0; length-unit:mm;
    @curve #rail { type:nurbs; degree:2; knots:[0,0,0,1,1,2,2,3,3,3];
      control-points:[[-10,0,0],[-5,0,0],[0,0,0],[20,0,0],[20,20,0],[20,27,0],[20,34,0]];
      weights:[1,1,1,0.7071067811865476,1,1,1]; } }` },
  objects: [{ id: 'rail', name: 'Paired duct rail', source: 'rails', geometry: 'rail' }] };
  const source = { ...fixture(), direct }, saved = offsetFaceCommand.build!(context(source), { d: -4 });
  const opened = await readStudioFile(encodeStudioFile(saved));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(saved)));
  const { ctx, original } = checkHandle(opened.doc, -6, -4);
  assert.deepEqual(opened.doc.direct, direct);
  assert.deepEqual(savedPairedElbowOutletOffsetHandle(opened.doc, 2, { ...ctx, direct: ['rail'] }, { d: -4 }, () => original), []);
});

test('saved outlet rejects stale document, changed cap, body owner and stored original signature', () => {
  const source = fixture(), original = context(source), doc = offsetFaceCommand.build!(original, { d: -4 });
  const ctx = context(doc), getSource = () => original;
  assert.equal(savedPairedElbowOutletOffsetHandle(doc, 2, ctx, { d: -4 }, getSource).length, 1);
  assert.deepEqual(savedPairedElbowOutletOffsetHandle(doc, 2, { ...ctx, doc: structuredClone(doc) }, { d: -4 }, getSource), []);
  const [body] = ctx.bodies;
  for (const patch of [{ key: 'b1' }, { ref: { node: 1, side: 'solid' as const } }, { pieces: 2 }])
    assert.deepEqual(savedPairedElbowOutletOffsetHandle(doc, 2, { ...ctx, bodies: [{ ...body, ...patch }] }, { d: -4 }, getSource), []);
  const faceIndex = body.mesh.faces.findIndex(face => face.name === 'n1.end'), face = body.mesh.faces[faceIndex];
  assert.ok(face.exact?.kind === 'plane');
  const wrong = { ...body, mesh: { ...body.mesh, faces: body.mesh.faces.map((candidate, index) => index === faceIndex
    ? { ...candidate, exact: { kind: 'plane' as const, o: [20, 31, 0] as [number, number, number], n: [0, 1, 0] as [number, number, number] } } : candidate) } };
  assert.deepEqual(savedPairedElbowOutletOffsetHandle(doc, 2, { ...ctx, bodies: [wrong] }, { d: -4 }, getSource), []);
  const ref = body.ref!;
  body.ref = { node: 1, side: 'solid' };
  assert.deepEqual(savedPairedElbowOutletOffsetHandle(doc, 2, ctx, { d: -4 }, getSource), []);
  body.ref = ref;
  const saved = doc.nodes[2];
  assert.ok(saved.kind === 'offset-face' && saved.sigs);
  const signature = saved.sigs['n1.end'];
  saved.sigs['n1.end'] = { ...signature, p: [20, 30, 0] };
  assert.deepEqual(savedPairedElbowOutletOffsetHandle(doc, 2, ctx, { d: -4 }, getSource), []);
  saved.sigs['n1.end'] = signature;
});

test('arc-first outlet Offset reopens with its original signed frame and native cap handle', async () => {
  const source = fixture(arcLinePath), original = context(source);
  const sourceVolume = brepMassProperties(partBreps(source)[0].brep, 1).volume;
  for (const distance of [4, -4]) {
    const saved = offsetFaceCommand.build!(original, { d: distance });
    const opened = await readStudioFile(encodeStudioFile(saved));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(saved)));
    const ctx = context(opened.doc);
    const [handle] = savedPairedElbowOutletOffsetHandle(opened.doc, 2, ctx, { d: distance }, () => original);
    assert.ok(handle);
    handle.at.forEach((value, axis) => near(value, [-10 - distance, 0, 0][axis]));
    handle.dir.forEach((value, axis) => near(value, [-1, 0, 0][axis]));
    const [{ brep }] = partBreps(opened.doc);
    near(brepMassProperties(brep, 1).volume - sourceVolume, 32 * distance);
    assert.ok(checkBrep(brep, { strict: true }).valid);
  }
});

test('the straight inlet reopens with its original outward frame and an editable signed handle', async () => {
  const source = fixture(), before = structuredClone(source), original = context(source, 'n1.start');
  assert.ok(isPairedElbowInletOffsetSource(source.nodes, 1, 'n1.start'));
  assert.equal(isPairedElbowInletOffsetSource(source.nodes, 1, 'n1.end'), false);
  const volume = brepMassProperties(partBreps(source)[0].brep, 1).volume;
  for (const distance of [4, -4]) {
    const saved = offsetFaceCommand.build!(original, { d: distance });
    const opened = await readStudioFile(encodeStudioFile(saved));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(saved)));
    const [handle] = savedPairedElbowOutletOffsetHandle(opened.doc, 2, context(opened.doc, 'n1.start'), { d: distance }, () => original);
    assert.ok(handle);
    handle.at.forEach((value, axis) => near(value, [-10 - distance, 0, 0][axis]));
    handle.dir.forEach((value, axis) => near(value, [-1, 0, 0][axis]));
    const [{ brep }] = partBreps(opened.doc);
    assert.ok(checkBrep(brep, { strict: true }).valid);
    near(brepMassProperties(brep, 1).volume - volume, 32 * distance);
  }
  assert.deepEqual(source, before);
});

test('the arc-first start remains outside the straight inlet recipe', () => {
  const source = fixture(arcLinePath), before = structuredClone(source);
  assert.equal(isPairedElbowInletOffsetSource(source.nodes, 1, 'n1.start'), false);
  assert.throws(() => offsetFaceCommand.build!(context(source, 'n1.start'), { d: 4 }), /\[VALUE\] Offset face: only native cardinal prism or cylinder caps are supported/);
  assert.deepEqual(source, before);
});
