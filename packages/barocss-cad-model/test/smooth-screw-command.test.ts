import assert from 'node:assert/strict';
import test from 'node:test';
import { CadNumericPolicy, brepMassProperties, checkBrep, evaluateCurve, evaluateCurveD1 } from '@barocss/cad';
import { commandById, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { smoothScrewAngleField, smoothScrewPitchField, smoothScrewWindingRule } from '../src/app/smoothLoftTurn';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode } from '../src/engine/doc';
import { evaluateDoc, evaluatePart, partBreps } from '../src/engine/evaluate';
import { bodyMesh } from '../src/engine/mesh';
import { revisionOf } from '../src/util/revision';

const command = commandById('smooth-screw')!;
const source = withNode(emptyDoc(), {
  kind: 'sketch', profile: 'rectangle', min: [14, -4], max: [26, 4],
  plane: { origin: [11, -17, 23], normal: [0, .6, .8], xAxis: [1, 0, 0] },
});
const ctx: Ctx = { doc: source, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] } };
const input = { axisX: 2, axisY: -1, pitch: 80, angle: -180 };

test('Smooth Screw keeps its external axis, signed pitch and display through native Open', async () => {
  for (const angle of [180, -180]) {
    const doc = command.build!(ctx, { ...input, angle });
    assert.equal(doc.nodes[0], source.nodes[0]);
    const index = doc.nodes.length - 1, loft = doc.nodes[index];
    assert.ok(loft.kind === 'loft' && loft.smooth);
    assert.deepEqual(loft.from, [0]);
    assert.deepEqual(loft.sections.map(s => s.z), Array.from({ length: 7 }, (_, i) => 40 * (i / 6)));
    assert.deepEqual(editFields(doc.nodes, index, doc.parameters).map(field => field.label), ['Total height']);
    const [{ brep }] = partBreps(doc);
    assert.ok(checkBrep(brep, { strict: true }).valid);
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 840.4060323005599 * 96 / 21) < 1e-7);
    const rails = brep.edges.filter(edge => /^c[0-3]$/.test(edge.id));
    assert.equal(rails.length, 4);
    for (const [i, { curve }] of rails.entries()) {
      const [x, y] = [[12, -3], [24, -3], [24, 5], [12, 5]][i];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6, a = angle * Math.PI / 180 * t;
        const u = Math.cos(a) * x - Math.sin(a) * y, v = Math.sin(a) * x + Math.cos(a) * y;
        const want = [13 + u, -17 + .8 * (v - 1) + 24 * t, 23 - .6 * (v - 1) + 32 * t];
        assert.ok(Math.hypot(...evaluateCurve(curve, t).map((value, k) => value - want[k])) < 1e-8);
      }
    }
    const displayed = evaluateDoc(doc, 2, 8, true);
    assert.ok(displayed.ok);
    const detail = displayed.bodies[0].mesh.loftDetail;
    assert.ok(detail && 'kind' in detail && detail.kind === 'smooth-turn');
    const original = bodyMesh(brep, 0, 24), shown = displayed.bodies[0].mesh;
    assert.notDeepEqual(detail.positions, original.positions);
    assert.equal(detail.indices.length / 3, 96 * 16 + 16);
    assert.deepEqual([...new Set(detail.edgeOfSegment)].sort((a, b) => a - b), shown.edges.map(edge => edge.index));
    assert.deepEqual([...new Set(detail.faceOfVertex)].sort((a, b) => a - b), shown.faces.map(face => face.index));
    assert.deepEqual(shown.edges.map(edge => edge.nativeJoint?.edgeId), original.edges.map(edge => edge.nativeJoint?.edgeId));
    const triangleEdges = new Map<string, { forward: number; reverse: number }>();
    const pointKey = (i: number) => detail.positions.subarray(3 * i, 3 * i + 3).join(',');
    for (let i = 0; i < detail.indices.length; i += 3) {
      const corners = [...detail.indices.subarray(i, i + 3)].map(pointKey);
      for (const [j, a] of corners.entries()) {
        const b = corners[(j + 1) % 3];
        assert.notEqual(a, b);
        const order = a < b;
        const key = order ? a + '/' + b : b + '/' + a;
        const count = triangleEdges.get(key) ?? { forward: 0, reverse: 0 };
        if (order) count.forward++;
        else count.reverse++;
        triangleEdges.set(key, count);
      }
    }
    assert.ok([...triangleEdges.values()].every(edge => edge.forward === 1 && edge.reverse === 1));
    const reopened = await readStudioFile(encodeStudioFile(doc));
    assert.ok('doc' in reopened);
    assert.deepEqual(reopened.doc, doc);
    assert.deepEqual(partBreps(reopened.doc)[0].brep, brep);
  }
});

test('Only the display evaluation of a sole Screw supplies the proposal grid', () => {
  const doc = command.build!(ctx, input);
  const preview = evaluatePart(doc, 2, 8, 'proposal-display');
  const agent = evaluatePart(doc, 2, 8, 'agent');
  const accepted = evaluateDoc(doc, 2, 8, true);
  assert.ok(preview.ok && agent.ok && accepted.ok);
  const candidate = preview.bodies[0].mesh, base = agent.bodies[0].mesh, detail = candidate.loftDetail;
  assert.ok(detail && 'kind' in detail && detail.screwGrid);
  assert.deepEqual(detail, accepted.bodies[0].mesh.loftDetail);
  assert.deepEqual(candidate.positions, base.positions);
  assert.deepEqual(candidate.indices, base.indices);
  assert.equal(base.loftDetail, undefined);
  const centred = commandById('smooth-turn')!.build!(ctx, { height: 40, angle: -180 });
  const turnPreview = evaluatePart(centred, 3, 8, 'proposal-display');
  assert.ok(turnPreview.ok);
  assert.equal(turnPreview.bodies[0].mesh.loftDetail, undefined);
});

test('Smooth Screw History changes pitch and preserves the tilted axis, signed winding and section copies', async () => {
  for (const angle of [450, -180]) {
    const doc = command.build!(ctx, { ...input, angle });
    const index = doc.nodes.length - 1;
    const pitch = smoothScrewPitchField(doc.nodes, index);
    assert.ok(pitch?.kind === 'number');
    assert.equal(pitch.get(doc.nodes), input.pitch);
    assert.equal(pitch.label, 'Pitch per revolution');
    const turns = Math.abs(angle) / 360;
    for (const value of [0, -1, Infinity, NaN, CadNumericPolicy.linearTolerance / (2 * turns),
      CadNumericPolicy.coordinateAbs + 1, CadNumericPolicy.coordinateAbs / turns + 1, input.pitch]) {
      assert.deepEqual(pitch.set(doc.nodes, value), doc.nodes);
    }
    const edited = { ...doc, nodes: pitch.set(doc.nodes, 56) };
    assert.deepEqual(edited.nodes.slice(0, index), doc.nodes.slice(0, index));
    assert.equal(pitch.get(edited.nodes), 56);
    assert.equal(edited.nodes[index].id, doc.nodes[index].id);
    const authored = command.build!(ctx, { ...input, angle, pitch: 56 });
    const [{ brep }] = partBreps(edited), expected = partBreps(authored)[0].brep;
    assert.ok(checkBrep(brep, { strict: true }).valid);
    assert.deepEqual(brep.faces.map(face => face.id), expected.faces.map(face => face.id));
    assert.deepEqual(brep.edges.map(edge => edge.id), expected.edges.map(edge => edge.id));
    for (const [i, { curve }] of brep.edges.entries()) {
      for (let j = 0; j <= 30; j++) {
        const t = j / 30, want = evaluateCurve(expected.edges[i].curve, t);
        assert.ok(Math.hypot(...evaluateCurve(curve, t).map((value, axis) => value - want[axis])) < 1e-8);
      }
    }
    const reopened = await readStudioFile(encodeStudioFile(edited));
    assert.ok('doc' in reopened);
    assert.deepEqual(reopened.doc, edited);
    assert.equal(pitch.get(reopened.doc.nodes), 56);
    assert.deepEqual(partBreps(reopened.doc)[0].brep, brep);
    const followed = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [1, 1] });
    assert.equal(smoothScrewPitchField(followed.nodes, index), undefined);
    assert.deepEqual(pitch.set(followed.nodes, 56), followed.nodes);
  }
});

test('Screw winding edits keep pitch, tilted axis, section count and native identities', async () => {
  for (const [initialAngle, angle] of [[450, -360], [-180, 180]]) {
    const doc = command.build!(ctx, { ...input, angle: initialAngle }), index = doc.nodes.length - 1;
    const loft = doc.nodes[index];
    assert.ok(loft.kind === 'loft');
    const winding = smoothScrewAngleField(doc.nodes, index);
    assert.ok(winding?.kind === 'number');
    assert.equal(winding.get(doc.nodes), initialAngle);
    const rule = smoothScrewWindingRule(doc.nodes, index);
    assert.ok(rule);
    assert.ok(rule.accepts(angle));
    for (const value of [NaN, Infinity, 0, 1e-9, Math.abs(initialAngle) + 1])
      assert.ok(!rule.accepts(value) && winding.set(doc.nodes, value).every((node, i) => node === doc.nodes[i]));
    const edited = { ...doc, nodes: winding.set(doc.nodes, angle) };
    const editedLoft = edited.nodes[index];
    assert.ok(editedLoft.kind === 'loft');
    assert.equal(winding.get(edited.nodes), angle);
    const pitch = smoothScrewPitchField(edited.nodes, index);
    assert.ok(pitch?.kind === 'number');
    assert.ok(Math.abs(pitch.get(edited.nodes) - input.pitch) < 1e-9);
    assert.deepEqual(edited.nodes.map(node => node.id), doc.nodes.map(node => node.id));
    assert.deepEqual(editedLoft.sections.map(section => section.sketch), loft.sections.map(section => section.sketch));
    assert.equal(editedLoft.sections.at(-1)?.z, input.pitch * Math.abs(angle) / 360);
    assert.ok(evaluateDoc(edited, 2, 8, true, index).ok);
    const [{ brep, key }] = partBreps(edited), [before] = partBreps(doc);
    assert.equal(key, before.key);
    assert.ok(checkBrep(brep, { strict: true }).valid);
    for (const kind of ['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices'] as const)
      assert.deepEqual(brep[kind].map(item => item.id), before.brep[kind].map(item => item.id));
    const rails = brep.edges.filter(edge => /^c[0-3]$/.test(edge.id));
    const localCorners = [[12, -3], [24, -3], [24, 5], [12, 5]];
    for (const [rail, { curve }] of rails.entries()) {
      const [u0, v0] = localCorners[rail];
      const u = (x: number) => x - 13;
      const v = (y: number, z: number) => .8 * (y + 17.8) - .6 * (z - 23.6);
      let cumulative = 0, previous = [u0, v0];
      for (let i = 0; i <= 120; i++) {
        const { point: [x, y, z], derivative: [dx, dy, dz] } = evaluateCurveD1(curve, i / 120);
        const a = u(x), b = v(y, z), dv = .8 * dy - .6 * dz;
        assert.ok(Math.sign(angle) * (a * dv - b * dx) > 0);
        cumulative += Math.atan2(previous[0] * b - previous[1] * a, previous[0] * a + previous[1] * b);
        previous = [a, b];
      }
      assert.ok(Math.abs(cumulative * 180 / Math.PI - angle) < 1e-8);
    }
    const reopened = await readStudioFile(encodeStudioFile(edited));
    assert.ok('doc' in reopened);
    assert.deepEqual(reopened.doc, edited);
    assert.deepEqual(partBreps(reopened.doc)[0].brep, brep);
  }
});

test('One Screw draft accepts pitch and non-integer winding edits in either order', () => {
  const doc = command.build!(ctx, { ...input, angle: 450 });
  const index = doc.nodes.length - 1;
  const pitch = smoothScrewPitchField(doc.nodes, index), winding = smoothScrewAngleField(doc.nodes, index);
  assert.ok(pitch?.kind === 'number' && winding?.kind === 'number');
  const angle = -271.234567890123;
  for (const nodes of [
    pitch.set(winding.set(doc.nodes, angle), 56),
    winding.set(pitch.set(doc.nodes, 56), angle),
  ]) {
    assert.ok(Math.abs(winding.get(nodes) - angle) < 1e-9);
    assert.ok(Math.abs(pitch.get(nodes) - 56) < 1e-9);
    assert.ok(evaluateDoc({ ...doc, nodes }, 2, 8, true, index).ok);
  }
});

test('Screw winding rejects legacy angles whose centroid shift cannot prove the external axis', () => {
  const ambiguous = command.build!(ctx, { ...input, pitch: 10000, angle: 1e-8 });
  const index = ambiguous.nodes.length - 1;
  assert.equal(smoothScrewAngleField(ambiguous.nodes, index), undefined);
  assert.equal(evaluateDoc(ambiguous, 1, 8, false, index).ok, false);
  const measurable = command.build!(ctx, { ...input, pitch: 10000, angle: 0.001 });
  const field = smoothScrewAngleField(measurable.nodes, index);
  assert.ok(field?.kind === 'number');
  const edited = { ...measurable, nodes: field.set(measurable.nodes, -.001) };
  assert.ok(field.get(edited.nodes) < 0);
  assert.ok(evaluateDoc(edited, 2, 8, false, index).ok);
});

test('Smooth Screw rejects nonexterior axes, malformed values and ambiguous source selection', () => {
  for (const values of [
    { axisX: 14, axisY: 0 }, { axisX: 20, axisY: 0 }, { axisX: NaN }, { pitch: 0 }, { pitch: -80 },
    { angle: 0 }, { angle: Infinity }, { angle: 451 }, { pitch: 10000, angle: 450 }, { angle: 1e-8 },
  ]) assert.throws(() => command.build!(ctx, { ...input, ...values }));
  assert.equal(command.available({ ...ctx, selection: { ...ctx.selection, sketches: [0, 0] } }).ok, false);
});

test('Agent Smooth Screw uses an explicit current sketch and revision', async () => {
  const state = { doc: source, bodies: [] };
  const args = { action: 'command', command: 'smooth-screw', values: { ...input, sketch: source.nodes[0].id } };
  const revision = revisionOf(source);
  for (const request of [args, { ...args, expectedRevision: '0'.repeat(16) },
    { ...args, expectedRevision: revision, values: { ...args.values, sketch: 'unknown' } }]) {
    const rejected = await dispatchTool(state, 'features', request, () => assert.fail('Rejected commands must not evaluate.'));
    assert.ok(rejected.isError && !rejected.changed, rejected.content);
    assert.equal(rejected.state, state);
  }
  const accepted = await dispatchTool(state, 'features', { ...args, expectedRevision: revision }, async doc => evaluateDoc(doc, 1));
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  assert.deepEqual(accepted.state.doc, command.build!(ctx, input));
});

test('Agent Smooth Screw pitch requires one current, valid change on the terminal Screw', async () => {
  const doc = command.build!(ctx, input), index = doc.nodes.length - 1;
  const initial = evaluateDoc(doc, 1);
  assert.ok(initial.ok);
  const state = { doc, bodies: initial.bodies };
  const revision = revisionOf(doc);
  const pitch = 56;
  const request = { action: 'edit', index, values: { smoothScrewPitch: pitch }, expectedRevision: revision };
  const unevaluated = () => assert.fail('Rejected pitch requests must not evaluate.');
  for (const args of [
    { ...request, expectedRevision: undefined }, { ...request, expectedRevision: '0'.repeat(16) },
    { ...request, values: { ...request.values, smoothLoftHeight: 99 } },
    { ...request, feature: doc.nodes[index] }, { ...request, index: 0 },
    ...[input.pitch, 0, -56, '56', Infinity, 1e-10, 10001].map(value => ({ ...request, values: { smoothScrewPitch: value } })),
  ]) {
    const rejected = await dispatchTool(state, 'features', args, unevaluated);
    assert.ok(rejected.isError && !rejected.changed, rejected.content);
    assert.equal(rejected.state, state);
  }
  const discovery = await dispatchTool(state, 'features', { action: 'edit', index }, unevaluated);
  assert.match(discovery.content, /smoothScrewPitch.*Pitch per revolution = 80/);
  const expected = smoothScrewPitchField(doc.nodes, index);
  assert.ok(expected?.kind === 'number');
  const accepted = await dispatchTool(state, 'features', request, async next => evaluateDoc(next, 2));
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  assert.deepEqual(accepted.state.doc.nodes, expected.set(doc.nodes, pitch));
});
