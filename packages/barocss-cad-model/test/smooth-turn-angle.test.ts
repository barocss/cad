import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCurve, type Point } from '@barocss/cad';
import { isCompactStepTurn } from '@barocss/cad/internal/step-turn-display';
import { commandById, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { smoothTurnAngleKey, smoothTurnWidthBounds, smoothTurnWidthKey } from '../src/app/smoothLoftTurn';
import { dispatchTool } from '../src/chat/tools';
import { emptyDoc, withNode, type LoopSegment, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, evaluatePart, exportStudioStep, partBreps, placeBody, shareMeshes, type BodyResult } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';
import { MeshReceiver, MeshSender } from '../src/engine/meshWire';

const source = withNode(emptyDoc(), {
  kind: 'sketch', profile: 'rectangle', min: [1, 2], max: [13, 10],
  plane: { origin: [11, -17, 23], normal: [0, 0.6, 0.8], xAxis: [1, 0, 0] },
});
const context: Ctx = { doc: source, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] } };
const create = (angle: number) => commandById('smooth-turn')!.build!(context, { angle, height: 70 });
const field = (doc: StudioDoc, index = doc.nodes.length - 1) =>
  editFields(doc.nodes, index, doc.parameters).find(field => field.key === smoothTurnAngleKey);

test('an existing Smooth Turn changes signed winding without changing its station count or native identities', () => {
  for (const [beforeAngle, afterAngle] of [[360, -360], [-450, 360], [450, 0], [72, 180]]) {
    const original = create(beforeAngle), angle = field(original);
    assert.ok(angle?.kind === 'number');
    assert.equal(angle.get(original.nodes), beforeAngle);
    assert.equal('bind' in angle, false);
    assert.deepEqual(angle.set(original.nodes, beforeAngle), original.nodes);
    const limit = Math.max(6, Math.ceil(Math.abs(beforeAngle) / 30)) * 30;
    for (const invalid of [limit + 1, -limit - 1, Infinity, NaN])
      assert.deepEqual(angle.set(original.nodes, invalid), original.nodes);

    const next = { ...original, nodes: angle.set(original.nodes, afterAngle) };
    assert.equal(angle.get(next.nodes), afterAngle);
    assert.equal(next.nodes[0], original.nodes[0]);
    assert.equal(next.nodes[1], original.nodes[1]);
    assert.equal(next.nodes.at(-1), original.nodes.at(-1));
    assert.deepEqual(next.nodes.map(node => node.id), original.nodes.map(node => node.id));
    const [before] = partBreps(original), [after] = partBreps(next);
    assert.equal(after.key, before.key);
    assert.equal(checkBrep(after.brep, { strict: true }).valid, true);
    assert.deepEqual(after.brep.faces.map(face => face.name), before.brep.faces.map(face => face.name));
    assert.deepEqual(after.brep.edges.map(edge => edge.name), before.brep.edges.map(edge => edge.name));
    assert.deepEqual([after.brep.faces.length, after.brep.edges.length], [6, 12]);
    if (afterAngle === 0) assert.ok(Math.abs(brepMassProperties(after.brep, 1).volume - 6720) < 1e-7);

    const first = after.brep.edges.find(edge => edge.id === 'c0')!;
    for (let station = 0; station <= limit / 30; station++) {
      const t = station / (limit / 30), radians = afterAngle * Math.PI / 180 * t;
      const c = Math.cos(radians), s = Math.sin(radians);
      const x = 7 - 6 * c + 4 * s, y = 6 - 6 * s - 4 * c, z = 70 * t;
      const expected = [11 + x, -17 + 0.8 * y + 0.6 * z, 23 - 0.6 * y + 0.8 * z];
      const actual = evaluateCurve(first.curve, t);
      assert.ok(Math.hypot(...actual.map((value, i) => value - expected[i])) < 1e-8);
    }
  }
});

test('only an intact terminal Smooth Turn owns the regenerated section copies', () => {
  const doc = create(450);
  assert.equal(field(doc)?.kind, 'number');
  const resizedSource: StudioDoc = { ...doc, nodes: doc.nodes.map((node, i) =>
    i === 0 && node.kind === 'sketch' && node.profile === 'rectangle' ? { ...node, max: [14, 10] } : node) };
  assert.ok(field(resizedSource));

  const changed: StudioDoc = { ...doc, nodes: doc.nodes.map((node, i) =>
    i === 2 && node.kind === 'sketch' && node.profile === 'loop' ? {
      ...node, segments: node.segments.map((segment, k): LoopSegment =>
        k === 1 ? { ...segment, start: [Number(segment.start[0]) + 0.001, segment.start[1]] } : segment),
    } : node) };
  assert.equal(field(changed), undefined);
  const ruled = commandById('ruled-turn')!.build!(context, { angle: 450, height: 70 });
  assert.equal(field(ruled), undefined);
  assert.equal(field(withNode(doc, { kind: 'sketch', profile: 'circle', center: [30, 0], radius: 3 }), doc.nodes.length - 1), undefined);
  const shared = withNode(doc, { kind: 'extrude', sketch: 2, height: 2 });
  assert.equal(field(shared, doc.nodes.length - 1), undefined);
});

test('a Smooth Turn width edit resizes the entire rectangular section around its original axis', () => {
  const widthField = (doc: StudioDoc, index = doc.nodes.length - 1) =>
    editFields(doc.nodes, index, doc.parameters).find(candidate => candidate.key === smoothTurnWidthKey);
  const railKey = (id: string) => /^c[0-3]$/.test(id);
  for (const angle of [360, -360, 450, -450, 0, 87.123456789123]) {
    const doc = create(angle), index = doc.nodes.length - 1, width = widthField(doc);
    assert.ok(width?.kind === 'number');
    assert.equal(width.get(doc.nodes), 12);
    assert.equal('bind' in width, false);
    for (const invalid of [12, 0, -1, smoothTurnWidthBounds.min, smoothTurnWidthBounds.max + 1, NaN, Infinity])
      assert.deepEqual(width.set(doc.nodes, invalid), doc.nodes);
    const next = { ...doc, nodes: width.set(doc.nodes, 16) };
    assert.equal(next.nodes[0], doc.nodes[0]);
    assert.equal(next.nodes[index], doc.nodes[index]);
    assert.deepEqual(next.nodes.map(node => node.id), doc.nodes.map(node => node.id));
    assert.equal(width.get(next.nodes), 16);
    const editedAngle = field(next);
    assert.ok(editedAngle?.kind === 'number' && Math.abs(editedAngle.get(next.nodes) - angle) < 1e-9);
    const [before] = partBreps(doc), [after] = partBreps(next);
    assert.equal(before.key, after.key);
    assert.equal(checkBrep(after.brep, { strict: true }).valid, true);
    assert.ok(after.brep.shells.length === 1 && after.brep.shells[0].closed);
    assert.deepEqual([after.brep.bodies.length, after.brep.faces.length, after.brep.edges.length], [1, 6, 12]);
    const ids = (brep: typeof before.brep) => [brep.vertices, brep.edges, brep.coedges, brep.loops, brep.faces, brep.shells, brep.bodies]
      .map(items => items.map(item => item.id));
    assert.deepEqual(ids(after.brep), ids(before.brep));
    const expectedVolume = (16 / 12) * brepMassProperties(before.brep, 1).volume;
    assert.ok(Math.abs(brepMassProperties(after.brep, 1).volume - expectedVolume) < 1e-7);
    const last = Math.max(6, Math.ceil(Math.abs(angle) / 30));
    const rails = after.brep.edges.filter(edge => railKey(edge.id));
    assert.equal(rails.length, 4);
    for (const [corner, [x, y]] of [[-8, -4], [8, -4], [8, 4], [-8, 4]].entries()) {
      const rail = rails.find(edge => edge.id === 'c' + corner)!;
      if (angle !== 0) {
        assert.equal(rail.curve.degree, 3);
        assert.equal(rail.curve.controlPoints.length, last + 1);
        assert.ok(rail.curve.knots.slice(4, -4).every((knot, i, interior) => !i || knot > interior[i - 1]));
      }
      for (let i = 0; i <= last; i++) {
        const t = i / last, rad = angle * Math.PI / 180 * t;
        const u = 7 + x * Math.cos(rad) - y * Math.sin(rad);
        const v = 6 + x * Math.sin(rad) + y * Math.cos(rad);
        const expected = [11 + u, -17 + 0.8 * v + 42 * t, 23 - 0.6 * v + 56 * t];
        const point = evaluateCurve(rail.curve, t);
        assert.ok(Math.hypot(...point.map((value, k) => value - expected[k])) < 1e-8);
      }
    }
    assert.equal(widthField(withNode(doc, { kind: 'extrude', sketch: 2, height: 2 }), index), undefined);
  }
  assert.equal(widthField(commandById('ruled-turn')!.build!(context, { angle: 360, height: 70 })), undefined);
});

test('only the compact Smooth Turn gets a denser display packet with canonical picking in a multi-body part', () => {
  shareMeshes(true);
  try {
    for (const [first, second] of [['smooth-turn', 'ruled-turn'], ['ruled-turn', 'smooth-turn']]) {
      const built = commandById(first)!.build!(context, { angle: 360, height: 70 });
      const sketch = built.nodes.length;
      const next = withNode(built, { kind: 'sketch', profile: 'rectangle', min: [50, 2], max: [62, 10] });
      const doc = commandById(second)!.build!({ ...context, doc: next, selection: { ...context.selection, sketches: [sketch] } },
        { angle: -450, height: 50 });
      const base = evaluateDoc(doc, 1), refined = evaluateDoc(doc, 2, 8, true);
      assert.ok(base.ok && refined.ok);
      for (const [b, original] of base.bodies.entries()) {
        const actual: BodyResult = refined.bodies[b];
        const expectedTurn = [first, second][b] === 'smooth-turn';
        const { loftDetail, ...canonical } = actual.mesh;
        assert.deepEqual({ ...actual, mesh: canonical }, original);
        if (!expectedTurn) {
          assert.equal(loftDetail, undefined);
          continue;
        }
        assert.ok(loftDetail && 'kind' in loftDetail && loftDetail.kind === 'smooth-turn');
        assert.ok(loftDetail.indices.length > original.mesh.indices.length);
        assert.deepEqual([...new Set(loftDetail.edgeOfSegment)].sort((a, b) => a - b), canonical.edges.map(edge => edge.index));
        assert.deepEqual([...new Set(loftDetail.faceOfVertex)].sort((a, b) => a - b), canonical.faces.map(face => face.index));
        assert.equal(placeBody(actual, [1, 0, 0, 0, 1, 0, 0, 0, 1], [1, 2, 3]).mesh.loftDetail, undefined);
      }
      const sender = new MeshSender(), receiver = new MeshReceiver();
      const packed = sender.pack('evaluate', refined);
      const decoded = receiver.unpack('evaluate', structuredClone(packed.result, { transfer: packed.transfer }));
      assert.deepEqual(decoded, refined);
    }
  } finally {
    shareMeshes(false);
  }
});

test('STEP turns refine by native controls and ownership without feature history or labels', () => {
  for (const angle of [360, -450]) {
    const original = create(angle);
    const sketch = original.nodes.length;
    const withControl = withNode(original, { kind: 'sketch', profile: 'rectangle', min: [50, 2], max: [62, 10] });
    const doc = commandById('ruled-turn')!.build!({ ...context, doc: withControl, selection: { ...context.selection, sketches: [sketch] } },
      { angle: 360, height: 50 });
    const step = exportStudioStep(doc, { name: 'Exchange display proof' }).text;
    const opened = withNode(emptyDoc(), { kind: 'import', name: 'Unrelated title', step, solids: 2 });
    const baseline = evaluateDoc(opened, 0), refined = evaluateDoc(opened, 1, 8, true);
    assert.ok(baseline.ok && refined.ok);
    assert.equal(opened.nodes.length, 1);
    for (const [i, { brep }] of partBreps(opened).entries()) {
      const actual: BodyResult = refined.bodies[i];
      const { loftDetail, ...canonical } = actual.mesh;
      assert.deepEqual({ ...actual, mesh: canonical }, baseline.bodies[i]);
      if (brep.faces.length !== 6) {
        assert.equal(loftDetail, undefined);
        assert.equal(isCompactStepTurn(brep), false);
        continue;
      }
      assert.ok(loftDetail && 'kind' in loftDetail && loftDetail.kind === 'smooth-turn');
      assert.ok(loftDetail.indices.length > canonical.indices.length);
      assert.deepEqual([...new Set(loftDetail.edgeOfSegment)].sort((a, b) => a - b), canonical.edges.map(edge => edge.index));
      assert.deepEqual([...new Set(loftDetail.faceOfVertex)].sort((a, b) => a - b), canonical.faces.map(face => face.index));
      const relabelled = { ...brep, faces: brep.faces.map((face, j) => ({ ...face, name: `surface-${j}` })).reverse(),
        edges: brep.edges.map((edge, j) => ({ ...edge, name: `edge-${j}` })).reverse() };
      assert.equal(isCompactStepTurn(relabelled), true, 'Reordered and relabelled imported geometry');

      const lifted = structuredClone(brep);
      const cap = lifted.faces.find(face => face.surface.kind === 'surface' && face.surface.degreeV === 1)!.surface;
      assert.ok(cap.kind === 'surface');
      for (const row of cap.controlPoints) for (const point of row) {
        point[1] += 0.0000006;
        point[2] += 0.0000008;
      }
      assert.equal(isCompactStepTurn(lifted), false, 'A slightly shifted cap support is outside this display profile');

      const displaced = structuredClone(brep);
      const rail = displaced.edges.find(edge => edge.curve.degree === 3)!.curve;
      const serialized = JSON.stringify(rail.controlPoints);
      const [x, y, z] = rail.controlPoints[5];
      const moved: Point = [x + 0.01, y, z];
      for (const { surface } of displaced.faces) if (surface.kind === 'surface') {
        for (const row of surface.controlPoints) if (JSON.stringify(row) === serialized) row[5] = moved;
      }
      rail.controlPoints[5] = moved;
      const displacedCheck = checkBrep(displaced, { strict: true });
      assert.equal(displacedCheck.valid, true, JSON.stringify(displacedCheck.issues));
      assert.equal(isCompactStepTurn(displaced), false);
    }
  }
});

test('Agent Smooth Turn angle edits require an exact pin and refuse out-of-range and combined inputs', async () => {
  const doc = create(450), index = doc.nodes.length - 1;
  const evaluate = async (document: StudioDoc) => evaluatePart(document, 0);
  const evaluated = await evaluate(doc);
  assert.ok(evaluated.ok);
  const state = { doc, bodies: evaluated.bodies };
  const args = { action: 'edit', index, values: { [smoothTurnAngleKey]: -360 } };
  const expectedRevision = revisionOf(doc);
  for (const [request, code] of [
    [args, 'EDIT_INPUT'],
    [{ ...args, expectedRevision: revisionOf(create(-450)) }, 'EDIT_STALE'],
    [{ ...args, expectedRevision, values: { [smoothTurnAngleKey]: 451 } }, 'EDIT_INPUT'],
    [{ ...args, expectedRevision, values: { ...args.values, smoothLoftHeight: 60 } }, 'EDIT_INPUT'],
    [{ ...args, expectedRevision, feature: doc.nodes[index] }, 'EDIT_INPUT'],
  ] as const) {
    const result = await dispatchTool(state, 'features', request, () => {
      assert.fail('A refused angle edit must remain outside candidate evaluation');
    });
    assert.ok(result.isError && !result.changed, result.content);
    assert.equal(result.state, state);
    assert.equal(JSON.parse(result.content).code, code);
  }
  const result = await dispatchTool(state, 'features', { ...args, expectedRevision }, evaluate);
  assert.ok(result.changed && !result.isError, result.content);
  const angle = field(result.state.doc);
  assert.ok(angle?.kind === 'number');
  assert.equal(angle.get(result.state.doc.nodes), -360);
  assert.deepEqual(result.state.doc.nodes.at(-1), doc.nodes.at(-1));
});

test('Agent Smooth Turn width edits require the current revision and one bounded width value', async () => {
  const doc = create(-360), index = doc.nodes.length - 1;
  const evaluated = evaluateDoc(doc, 1);
  assert.ok(evaluated.ok);
  const state = { doc, bodies: evaluated.bodies }, expectedRevision = revisionOf(doc);
  const args = { action: 'edit', index, values: { [smoothTurnWidthKey]: 20 } };
  for (const [request, code] of [
    [args, 'EDIT_INPUT'],
    [{ ...args, expectedRevision: revisionOf(create(360)) }, 'EDIT_STALE'],
    [{ ...args, expectedRevision, values: { ...args.values, [smoothTurnAngleKey]: 360 } }, 'EDIT_INPUT'],
    [{ ...args, expectedRevision, feature: doc.nodes[index] }, 'EDIT_INPUT'],
    ...[0, 12, smoothTurnWidthBounds.min, smoothTurnWidthBounds.max + 1, '20', Infinity].map(width =>
      [{ ...args, expectedRevision, values: { [smoothTurnWidthKey]: width } }, 'EDIT_INPUT'] as const),
  ] as const) {
    const result = await dispatchTool(state, 'features', request, () => assert.fail('Refuse before native evaluation'));
    assert.ok(result.isError && !result.changed, result.content);
    assert.equal(result.state, state);
    assert.equal(JSON.parse(result.content).code, code);
  }
  const result = await dispatchTool(state, 'features', { ...args, expectedRevision }, async candidate => evaluatePart(candidate, 0));
  assert.ok(result.changed && !result.isError, result.content);
  const width = editFields(doc.nodes, index).find(field => field.key === smoothTurnWidthKey);
  assert.ok(width?.kind === 'number');
  assert.deepEqual(result.state.doc, { ...doc, nodes: width.set(doc.nodes, 20) });
  assert.equal(width.get(result.state.doc.nodes), 20);
});
