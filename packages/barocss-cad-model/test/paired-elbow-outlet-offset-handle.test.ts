import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, faceGeometry, type Curve } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { savedPairedElbowOutletOffsetHandle } from '../src/app/pairedElbowOutletOffsetHandle';
import { offsetFaceCommand } from '../src/app/profileCommands';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, isPairedElbowInletOffsetSource, offsetFaceDocumentProblem, parentsOf, prefixDoc, usesOf, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

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
const sBendPath: typeof path = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5],
  controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 16, 0],
    [12, 20, 0], [12, 38, 0], [30, 38, 0], [33, 38, 0], [36, 38, 0]],
  weights: [1, 1, 1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1, 1, 1],
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

function outletAndDonor(rail = sBendPath, min: [number, number] = [40, 52], max: [number, number] = [44, 58]) {
  let doc = withNode(fixture(rail), { kind: 'sketch', profile: 'rectangle', min, max });
  doc = withNode(doc, { kind: 'extrude', sketch: 2, height: 4, from: 10 });
  return withNode(doc, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 0] });
}

function pickedPair(doc: StudioDoc, sourceFace = 'n1.end', referenceFace = 'n3.side3') {
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok, result.ok ? '' : result.error.detail);
  const find = (key: string, name: string) => {
    const body = result.bodies.findIndex(value => value.key === key);
    const match = result.bodies[body]?.mesh.faces.find(face => face.name === name);
    assert.ok(match, name);
    return { body, face: match.index };
  };
  const ctx: Ctx = { doc, bodies: result.bodies, selection: { faces: [find('b1', sourceFace)], edges: [], bodies: [] } };
  return { ctx, donor: find('b4', referenceFace) };
}

test('the original five-span outlet accepts a current inward tilted plane through the same named local command', async () => {
  const n = Math.sqrt(17);
  const sketch = withNode(fixture(sBendPath), { kind: 'sketch', profile: 'rectangle', min: [-3, -3], max: [3, 3],
    plane: { origin: [39.25, 55, 12], normal: [4 / n, -1 / n, 0], xAxis: [0, 0, 1] } });
  const extrude = withNode(sketch, { kind: 'extrude', sketch: 2, height: .5 });
  const doc = withNode(extrude, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 0] });
  const before = structuredClone(doc), { ctx } = pickedPair(doc, 'n1.end', 'n3.bottom');
  const run = (faces: string[], expectedRevision = revisionOf(doc)) => dispatchTool({ doc, bodies: ctx.bodies }, 'features', {
    action: 'command', command: 'replace-face', faces, expectedRevision,
  }, async candidate => evaluateDoc(candidate, 1));
  const edited = await run(['n1.end', 'n3.bottom']);
  assert.ok(!edited.isError && edited.changed, edited.content);
  assert.deepEqual(doc, before);
  const next = edited.state.doc, node = next.nodes[5];
  assert.ok(node.kind === 'replace-face' && node.sigs?.['n1.end']?.k === 'plane');
  assert.deepEqual([node.faces, node.target.feature, node.target.face], [['n1.end'], 'n4', 'n3.bottom']);
  assert.deepEqual(usesOf(node), [1, 4]);
  assert.equal(offsetFaceDocumentProblem(next), null);
  const read = await readStudioFile(encodeStudioFile(next));
  assert.ok('doc' in read);
  assert.deepEqual(read.doc, next);
  near(brepMassProperties(partBreps(read.doc).find(body => body.key === 'b5')!.brep, 1).volume, 32 * (23 + 15 * Math.PI));
  const held = { ...next, nodes: next.nodes.map((entry, index) => index === 4 ? { ...entry, held: 'stale donor' } : entry) };
  assert.match(offsetFaceDocumentProblem(held) ?? '', /available reference body/);
  const refused = evaluateDoc(held, 2);
  assert.ok(!refused.ok);
  assert.match(refused.error.detail, /available reference body|reference body.*held/);
  for (const bad of [await run(['n1.end', 'n3.top']), await run(['n1.start', 'n3.bottom']),
    await run(['n1.end', 'n3.bottom'], '0000000000000000')]) {
    assert.ok(bad.isError && !bad.changed);
    assert.equal(bad.state.doc, doc);
  }
});

test('a parallel native reference drives the original five-span outlet through signed reevaluation, History and reopen', async () => {
  const original = outletAndDonor(), { ctx, donor } = pickedPair(original);
  const picked = offsetFaceCommand.onPick!(ctx, { offsetMode: 'to-plane' }, { face: donor, edge: null });
  assert.ok(picked && !picked.error);
  const linked = offsetFaceCommand.build!(ctx, picked), node = linked.nodes[5];
  assert.ok(node.kind === 'offset-face' && node.target);
  assert.equal(node.target.feature, 'n4');
  assert.equal(node.target.face, 'n3.side3');
  assert.deepEqual(usesOf(node), [1, 4]);
  assert.deepEqual(parentsOf(node), [1]);
  assert.equal(offsetFaceDocumentProblem(linked), null);
  assert.ok(!Object.hasOwn(node, 'distance'));
  const donorBefore = partBreps(original).find(body => body.key === 'b4')!.brep;
  assert.deepEqual(partBreps(linked).find(body => body.key === 'b4')!.brep, donorBefore);
  const nativeCheck = (doc: StudioDoc, x: number) => {
    const bodies = partBreps(doc), body = bodies.find(record => record.key === 'b5')!.brep;
    const sign = x - 36, direct = offsetFaceCommand.build!(ctx, { d: sign });
    assert.deepEqual(body, partBreps(direct).find(record => record.key === 'b5')!.brep);
    const report = checkBrep(body, { strict: true });
    assert.ok(report.valid);
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 62, loops: 66, coedges: 264, edges: 132, vertices: 72 });
    assert.equal(report.topology[0].genus, 2);
    const cap = body.faces.find(face => face.name === 'n1.end')!, plane = faceGeometry(cap);
    assert.ok(plane.kind === 'plane' && cap.loops.length === 3);
    near(plane.o[0], x);
    near(brepMassProperties(body, 1).volume, 32 * (24 + sign + 15 * Math.PI));
  };
  nativeCheck(linked, 40);
  const moved = { ...linked, nodes: linked.nodes.map((node, index) => index === 4 && node.kind === 'translate'
    ? { ...node, offset: [-8, 0, 0] as [number, number, number] } : node) };
  assert.deepEqual(moved.nodes[5], node);
  nativeCheck(moved, 32);
  const history = editSavedOffsetFaceCommand(moved, 5)!;
  const current = evaluateDoc(moved, 1);
  assert.ok(current.ok);
  const historyCtx: Ctx = { doc: moved, bodies: current.bodies, selection: { faces: [], edges: [], bodies: [] } };
  assert.equal(history.defaults!(historyCtx).offsetMode, 'to-plane');
  assert.equal(history.build!(historyCtx, history.defaults!(historyCtx)), moved);
  const opened = await readStudioFile(encodeStudioFile(moved));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(moved)));
  nativeCheck(opened.doc, 32);
});

test('the outlet refuses a nonparallel or exhausted reference and leaves shorter sweep caps distance-only', () => {
  const original = outletAndDonor();
  const bind = (doc: StudioDoc, face = 'n3.side3') => {
    const { ctx, donor } = pickedPair(doc, 'n1.end', face);
    const picked = offsetFaceCommand.onPick!(ctx, { offsetMode: 'to-plane' }, { face: donor, edge: null });
    assert.ok(picked && !picked.error);
    return offsetFaceCommand.build!(ctx, picked);
  };
  const before = structuredClone(original), linked = bind(original);
  const result = evaluateDoc(bind(original, 'n3.top'), 1);
  assert.ok(!result.ok && /parallel/i.test(result.error.detail));
  for (const [offset, error] of [[-4, /same plane/i], [-10, /retained bend-to-outlet join/i]] as const) {
    const next = { ...linked, nodes: linked.nodes.map((node, index) => index === 4 && node.kind === 'translate'
      ? { ...node, offset: [offset, 0, 0] as [number, number, number] } : node) };
    const denied = evaluateDoc(next, 1);
    assert.ok(!denied.ok && error.test(denied.error.detail));
  }
  const node = linked.nodes[5];
  assert.ok(node.kind === 'offset-face' && node.target);
  const stale = { ...linked, nodes: [...linked.nodes.slice(0, 5), { ...node, target: { ...node.target, localSupport: node.target.localSupport + 1 } }] };
  const staleResult = evaluateDoc(stale, 1);
  assert.ok(!staleResult.ok && /original reference face changed/i.test(staleResult.error.detail));
  for (const [doc, face] of [[outletAndDonor(path), 'n1.end'], [outletAndDonor(path), 'n1.start']] as const) {
    const { ctx } = pickedPair(doc, face);
    assert.ok(!offsetFaceCommand.fields!(ctx).some(field => field.key === 'offsetMode'));
  }
  assert.deepEqual(original, before);
});

test('the original five-span inlet follows a parallel reference and retains exact signed native geometry', async () => {
  const original = outletAndDonor(sBendPath, [-19, -14], [-14, -8]);
  const { ctx, donor } = pickedPair(original, 'n1.start', 'n3.side1');
  const picked = offsetFaceCommand.onPick!(ctx, { offsetMode: 'to-plane' }, { face: donor, edge: null });
  assert.ok(picked && !picked.error);
  const linked = offsetFaceCommand.build!(ctx, picked), node = linked.nodes[5];
  assert.ok(node.kind === 'offset-face' && node.target);
  assert.deepEqual(node.faces, ['n1.start']);
  assert.deepEqual([node.target.feature, node.target.face], ['n4', 'n3.side1']);
  assert.equal(offsetFaceDocumentProblem(linked), null);
  assert.deepEqual(usesOf(node), [1, 4]);
  assert.deepEqual(parentsOf(node), [1]);
  assert.ok(!Object.hasOwn(node, 'distance'));

  const originalOutlet = partBreps(original).find(record => record.key === 'b1')!.brep.faces.find(face => face.name === 'n1.end');
  const check = (doc: StudioDoc, x: number) => {
    const body = partBreps(doc).find(record => record.key === 'b5')!.brep;
    const distance = -x - 10;
    const signed = partBreps(offsetFaceCommand.build!(ctx, { d: distance })).find(record => record.key === 'b5')!.brep;
    assert.deepEqual(body, signed);
    assert.deepEqual(body.faces.find(face => face.name === 'n1.end'), originalOutlet);
    const cap = body.faces.find(face => face.name === 'n1.start')!, support = faceGeometry(cap);
    assert.ok(support.kind === 'plane' && cap.loops.length === 3);
    near(support.o[0], x);
    const topology = checkBrep(body, { strict: true });
    assert.ok(topology.valid);
    assert.equal(topology.topology[0].genus, 2);
    const mass = brepMassProperties(body, 1), length = 24 + 15 * Math.PI + distance;
    near(mass.volume, 32 * length);
    near(mass.centroid[0], (270 * Math.PI + 64 - 10 * distance - distance ** 2 / 2) / length);
    near(mass.centroid[1], (252 * Math.PI + 536) / length);
    near(mass.centroid[2], 0);
  };
  const move = (x: number): StudioDoc => ({ ...linked, nodes: linked.nodes.map((entry, index) =>
    index === 4 && entry.kind === 'translate' ? { ...entry, offset: [x, 0, 0] } : entry) });
  check(linked, -14);
  const moved = move(8);
  assert.deepEqual(moved.nodes[5], node);
  check(moved, -6);
  const history = editSavedOffsetFaceCommand(moved, 5)!;
  const result = evaluateDoc(moved, 1);
  assert.ok(result.ok);
  const historyCtx: Ctx = { doc: moved, bodies: result.bodies, selection: { faces: [], edges: [], bodies: [] } };
  assert.equal(history.defaults!(historyCtx).offsetMode, 'to-plane');
  assert.equal(history.build!(historyCtx, history.defaults!(historyCtx)), moved);
  const reopened = await readStudioFile(encodeStudioFile(moved));
  assert.ok('doc' in reopened);
  assert.deepEqual(reopened.doc, JSON.parse(JSON.stringify(moved)));
  check(reopened.doc, -6);

  const top = pickedPair(original, 'n1.start', 'n3.top').donor;
  const tilted = offsetFaceCommand.onPick!(ctx, { offsetMode: 'to-plane' }, { face: top, edge: null });
  assert.ok(tilted && !tilted.error);
  const badPlane = evaluateDoc(offsetFaceCommand.build!(ctx, tilted), 1);
  assert.ok(!badPlane.ok && /parallel/i.test(badPlane.error.detail));
  for (const [x, error] of [[4, /same plane/i], [14, /retained inlet-to-bend join/i]] as const) {
    const denied = evaluateDoc(move(x), 1);
    assert.ok(!denied.ok && error.test(denied.error.detail));
  }
});

test('the current-revision local command describes the two accepted native faces in the bound outlet result', async () => {
  const doc = outletAndDonor(), { ctx } = pickedPair(doc);
  const run = (faces: string[], expectedRevision = revisionOf(doc)) => dispatchTool({ doc, bodies: ctx.bodies }, 'features', {
    action: 'command', command: 'offset-face', faces, values: { offsetMode: 'to-plane' }, expectedRevision,
  }, async candidate => evaluateDoc(candidate, 1));
  const applied = await run(['n1.end', 'n3.side3']);
  assert.ok(applied.changed && !applied.isError, applied.content);
  const { did } = JSON.parse(applied.content), node = applied.state.doc.nodes[5];
  assert.ok(node.kind === 'offset-face' && node.target);
  assert.equal(did, 'Offset face ' + JSON.stringify({
    offsetMode: 'to-plane', sourceFace: node.faces[0], referenceFeature: node.target.feature, referenceFace: node.target.face,
  }));
  for (const result of [await run(['n1.end', 'n3.top']), await run(['n1.end', 'n3.side3'], '0000000000000000')]) {
    assert.ok(result.isError && !result.changed, result.content);
    assert.equal(result.state.doc, doc);
  }
});

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

test('the five-span inlet preserves its editable signed handle and original owner after native Open', async () => {
  const source = fixture(sBendPath), before = structuredClone(source), original = context(source, 'n1.start');
  assert.ok(isPairedElbowInletOffsetSource(source.nodes, 1, 'n1.start'));
  assert.equal(isPairedElbowInletOffsetSource(source.nodes, 1, 'n1.end'), false);
  const wrongKnots = fixture({ ...sBendPath, knots: sBendPath.knots.map((value, index) => index === 7 ? 2 : value) });
  assert.equal(isPairedElbowInletOffsetSource(wrongKnots.nodes, 1, 'n1.start'), false);
  const collapse = evaluateDoc(offsetFaceCommand.build!(original, { d: -10 }), 2);
  assert.ok(!collapse.ok);
  assert.match(collapse.error.detail, /retained inlet-to-bend join/);
  for (const distance of [4, -4]) {
    const saved = offsetFaceCommand.build!(original, { d: distance });
    const opened = await readStudioFile(encodeStudioFile(saved));
    assert.ok('doc' in opened);
    assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(saved)));
    const ctx = context(opened.doc, 'n1.start');
    const [handle] = savedPairedElbowOutletOffsetHandle(opened.doc, 2, ctx, { d: distance }, () => original);
    assert.ok(handle);
    assert.deepEqual(handle.at, [-10 - distance, 0, 0]);
    handle.dir.forEach((value, axis) => near(value, [-1, 0, 0][axis]));
    const edit = editSavedOffsetFaceCommand(opened.doc, 2);
    assert.ok(edit?.build);
    const reversed = edit.build(ctx, { d: -distance });
    assert.deepEqual(reversed.nodes.slice(0, 2), source.nodes);
    const [{ brep }] = partBreps(reversed);
    assert.ok(checkBrep(brep, { strict: true }).valid);
    near(brepMassProperties(brep, 1).volume, 32 * (24 + 15 * Math.PI - distance));
  }
  assert.deepEqual(source, before);
});
