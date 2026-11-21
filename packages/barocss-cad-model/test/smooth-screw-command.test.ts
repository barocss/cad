import assert from 'node:assert/strict';
import test from 'node:test';
import { CadNumericPolicy, brepMassProperties, checkBrep, evaluateCurve, evaluateCurveD1 } from '@barocss/cad';
import { compactStepTurnKind } from '@barocss/cad/internal/step-turn-display';
import { commandById, type Ctx } from '../src/app/commands';
import { editFields } from '../src/app/editFields';
import { smoothScrewAngleField, smoothScrewPitchField, smoothScrewWindingRule } from '../src/app/smoothLoftTurn';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { emptyDoc, withNode, type SketchNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, evaluatePart, evaluatePreview, exportStudioStep, partBreps, type BodyResult } from '../src/engine/evaluate';
import { smoothTurnDisplayMesh } from '../src/engine/loftDisplay';
import { bodyMesh, type DisplayMesh } from '../src/engine/mesh';
import type { SketchPlane } from '../src/sketch/plane';
import { revisionOf } from '../src/util/revision';

const command = commandById('smooth-screw')!;
const source = withNode(emptyDoc(), {
  kind: 'sketch', profile: 'rectangle', min: [14, -4], max: [26, 4],
  plane: { origin: [11, -17, 23], normal: [0, .6, .8], xAxis: [1, 0, 0] },
});
const ctx: Ctx = { doc: source, bodies: [], selection: { faces: [], edges: [], bodies: [], sketches: [0] } };
const input = { axisX: 2, axisY: -1, pitch: 80, angle: -180 };

const segmentSketch: SketchNode = {
  kind: 'sketch', profile: 'loop',
  segments: [
    { kind: 'line', start: [13.5, 3 * Math.sin(Math.PI / 3)] },
    { kind: 'arc', start: [13.5, -3 * Math.sin(Math.PI / 3)], center: [12, 0], direction: 'ccw' },
  ],
  plane: { origin: [21, -19.4, 24.8], normal: [0, .6, .8], xAxis: [1, 0, 0] },
};
const segmentSource = withNode(emptyDoc(), segmentSketch);
const segmentCtx: Ctx = { ...ctx, doc: segmentSource };
const segmentInput = { axisX: 0, axisY: 0, pitch: 40, angle: -360 };

test('Smooth Loft accepts both centred circular-segment windings through tilted sketch projection', () => {
  const loft = commandById('loft')!;
  const sweep = 2 * Math.PI / 3;
  const centroid = 4 * 3 * Math.sin(sweep / 2) ** 3 / (3 * (sweep - Math.sin(sweep)));
  const ordinate = 3 * Math.sin(Math.PI / 3);
  for (const angle of [-360, 360]) {
    let doc = emptyDoc();
    const sketches = Array.from({ length: 13 }, (_, i) => i);
    for (const i of sketches) {
      const t = i / 12, phase = angle * t * Math.PI / 180;
      const c = Math.cos(phase), s = Math.sin(phase);
      const spin = (x: number, y: number): [number, number] => [c * x - s * y, s * x + c * y];
      doc = withNode(doc, { kind: 'sketch', profile: 'loop',
        segments: [
          { kind: 'line', start: spin(1.5 - centroid, ordinate) },
          { kind: 'arc', start: spin(1.5 - centroid, -ordinate), center: spin(-centroid, 0), direction: 'ccw' },
        ],
        plane: { origin: [21, -19.4 + 24 * t, 24.8 + 32 * t], normal: [0, .6, .8], xAxis: [1, 0, 0] },
      });
    }
    const next = loft.build!({ ...ctx, doc, selection: { ...ctx.selection, sketches } }, { smooth: 'yes' });
    const [{ brep }] = partBreps(next);
    const check = checkBrep(brep, { strict: true });
    assert.ok(check.valid, JSON.stringify(check.issues));
    assert.deepEqual([check.counts.bodies, check.counts.faces, check.counts.edges], [1, 5, 9]);
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 221.13498549200997) < 1e-7);
  }
});

test('a single circular segment Screw retains the arc and axis through History and native Open', async () => {
  assert.ok(command.available(segmentCtx).ok);
  const prior = command.build!(segmentCtx, segmentInput);
  const index = prior.nodes.length - 1;
  const loft = prior.nodes[index];
  assert.ok(loft.kind === 'loft' && loft.smooth);
  assert.deepEqual(loft.from, [0]);
  assert.equal(loft.sections.length, 13);
  assert.deepEqual(prior.nodes[0], { ...segmentSketch, id: 'n0' });
  assert.deepEqual(editFields(prior.nodes, index, prior.parameters).map(field => field.label), ['Total height']);
  for (const section of loft.sections) {
    const copy = prior.nodes[section.sketch];
    assert.ok(copy.kind === 'sketch' && copy.profile === 'loop');
    assert.deepEqual(copy.plane, segmentSketch.plane);
    assert.deepEqual(copy.segments.map(segment => segment.kind), ['line', 'arc']);
  }
  const angle = smoothScrewAngleField(prior.nodes, index);
  const pitch = smoothScrewPitchField(prior.nodes, index);
  assert.ok(angle?.kind === 'number' && pitch?.kind === 'number');
  assert.equal(angle.get(prior.nodes), -360);
  assert.equal(pitch.get(prior.nodes), 40);
  const reversed = { ...prior, nodes: angle.set(prior.nodes, 360) };
  assert.deepEqual(reversed, command.build!(segmentCtx, { ...segmentInput, angle: 360 }));
  const advanced = { ...reversed, nodes: pitch.set(reversed.nodes, 48) };
  assert.equal(angle.get(advanced.nodes), 360);
  assert.equal(pitch.get(advanced.nodes), 48);
  assert.deepEqual(advanced.nodes.slice(0, index), reversed.nodes.slice(0, index));
  for (const [doc, scale] of [[prior, 1], [reversed, 1], [advanced, 1.2]] as const) {
    const [{ brep }] = partBreps(doc);
    const check = checkBrep(brep, { strict: true });
    assert.ok(check.valid, JSON.stringify(check.issues));
    assert.deepEqual([check.counts.bodies, check.counts.faces, check.counts.edges], [1, 5, 9]);
    assert.ok(Math.abs(brepMassProperties(brep, 1).volume - 221.13498549200997 * scale) < 1e-7);
  }
  const reopened = await readStudioFile(encodeStudioFile(advanced));
  assert.ok('doc' in reopened);
  assert.deepEqual(reopened.doc, advanced);
  assert.deepEqual(partBreps(reopened.doc), partBreps(advanced));
});

test('a circular segment Screw rejects axes inside the supporting disc and guards History copies', () => {
  assert.equal(command.available({ ...segmentCtx, selection: { ...segmentCtx.selection, sketches: [0, 0] } }).ok, false);
  const sweep = 2 * Math.PI / 3;
  const centroidX = 12 + 4 * 3 * Math.sin(sweep / 2) ** 3 / (3 * (sweep - Math.sin(sweep)));
  for (const axisX of [10, 14, centroidX]) {
    assert.throws(() => command.build!(segmentCtx, { ...segmentInput, axisX }), /Screw axis.*outside.*disc/i);
  }
  assert.deepEqual(segmentCtx.doc, withNode(emptyDoc(), segmentSketch));
  const accepted = command.build!(segmentCtx, segmentInput);
  const index = accepted.nodes.length - 1;
  const copy = accepted.nodes[2];
  assert.ok(copy.kind === 'sketch' && copy.profile === 'loop');
  const arc = copy.segments[1];
  assert.ok(arc.kind === 'arc');
  const changed = [...accepted.nodes];
  changed[2] = { ...copy, segments: [copy.segments[0], { ...arc, center: [99, 11] }] };
  assert.equal(smoothScrewAngleField(changed, index), undefined);
  assert.equal(smoothScrewPitchField(changed, index), undefined);
});

test('a circular segment Screw moves its local axis on the tilted source plane', () => {
  const doc = command.build!(segmentCtx, { ...segmentInput, axisX: 2, axisY: -1 });
  const first = doc.nodes[1];
  assert.ok(first.kind === 'sketch' && first.profile === 'loop');
  assert.ok(first.plane);
  const origin = [23, -20.2, 25.4];
  assert.ok(Math.hypot(...first.plane.origin.map((value, i) => value - origin[i])) < 1e-12);
  assert.deepEqual(first.segments[1], {
    kind: 'arc', start: [11.5, 1 - 3 * Math.sin(Math.PI / 3)], center: [10, 1], direction: 'ccw',
  });
  const [{ brep }] = partBreps(doc);
  assert.ok(checkBrep(brep, { strict: true }).valid);
});

test('Agent creates a circular segment Screw only from an explicit current sketch', async () => {
  const state = { doc: segmentSource, bodies: [] };
  const unevaluated = () => assert.fail('Out-of-scope Agent requests must not evaluate.');
  const revision = revisionOf(segmentSource);
  const request = { action: 'command', command: 'smooth-screw', values: { ...segmentInput, sketch: 'n0' } };
  for (const args of [request,
    { ...request, expectedRevision: '0'.repeat(16) },
    { ...request, expectedRevision: revision, values: { ...request.values, sketch: 'n9' } },
    { ...request, expectedRevision: revision, values: { ...request.values, axisX: 14 } },
  ]) {
    const rejected = await dispatchTool(state, 'features', args, unevaluated);
    assert.ok(rejected.isError && !rejected.changed, rejected.content);
    assert.equal(rejected.state, state);
  }
  const result = await dispatchTool(state, 'features', { ...request, expectedRevision: revision },
    async doc => evaluateDoc(doc, 1));
  assert.ok(result.changed && !result.isError, result.content);
  assert.deepEqual(result.state.doc, command.build!(segmentCtx, segmentInput));
});

test('circular segment Screw special History edits stay scoped to Studio', async () => {
  const unevaluated = () => assert.fail('Out-of-scope Agent requests must not evaluate.');
  const doc = command.build!(segmentCtx, segmentInput), index = doc.nodes.length - 1;
  const state = { doc, bodies: [] };
  const discovered = await dispatchTool(state, 'features', { action: 'edit', index }, unevaluated);
  assert.doesNotMatch(discovered.content, /smoothScrewPitch|smoothScrewAngle/);
  for (const values of [{ smoothScrewPitch: 48 }, { smoothScrewAngle: 360 }]) {
    const edited = await dispatchTool(state, 'features', {
      action: 'edit', index, values, expectedRevision: revisionOf(doc),
    }, unevaluated);
    assert.ok(edited.isError && !edited.changed, edited.content);
    assert.equal(edited.state, state);
  }
});

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

test('live preview refines the new compact Loft output with the applied packet', () => {
  const existing: StudioDoc = command.build!(ctx, input);
  const plane: SketchPlane = { origin: [111, -17, 23], normal: [0, .6, .8], xAxis: [1, 0, 0] };
  for (const id of ['smooth-screw', 'smooth-turn', 'ruled-turn']) {
    const sketch: SketchNode = id === 'smooth-screw'
      ? { kind: 'sketch', profile: 'polygon', points: [[3, -7], [12, -6], [6, -2]], plane }
      : { kind: 'sketch', profile: 'rectangle', min: [-6, -4], max: [6, 4], plane };
    const doc = withNode(existing, sketch);
    const next: StudioDoc = commandById(id)!.build!({ ...ctx, doc, selection: { ...ctx.selection, sketches: [existing.nodes.length] } },
      id === 'smooth-screw' ? { axisX: 10, axisY: -3, pitch: 40, angle: -360 } : { height: 40, angle: 360 });
    const preview = evaluatePreview(next, 1), model = evaluateDoc(next, 2, 8, true);
    const section = evaluatePreview(next, 3, 8, 'section'), otherQuality = evaluatePreview(next, 4, 12);
    assert.ok(preview.ok && model.ok && section.ok && otherQuality.ok);
    assert.equal(preview.bodies.length, 2);
    for (const body of preview.bodies) {
      const applied: BodyResult | undefined = model.bodies.find(candidate => candidate.key === body.key);
      assert.ok(applied);
      const { loftDetail, ...canonical } = body.mesh;
      const { loftDetail: appliedDetail, ...appliedCanonical }: DisplayMesh = applied.mesh;
      assert.deepEqual(canonical, appliedCanonical);
      assert.equal(body.volume, null);
      assert.equal(body.mass, null);
      if (body.ref?.node === next.nodes.length - 1 && id !== 'ruled-turn') {
        assert.ok(loftDetail && 'kind' in loftDetail && loftDetail.kind === 'smooth-turn');
        assert.deepEqual(loftDetail, appliedDetail);
        assert.equal(Boolean(loftDetail.screwGrid), id === 'smooth-screw');
      } else assert.equal(loftDetail, undefined);
    }
    for (const body of [...section.bodies, ...otherQuality.bodies]) assert.equal(body.mesh.loftDetail, undefined);
  }
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

test('Agent Screw winding requires the current revision and a verified native edit', async () => {
  const doc = command.build!(ctx, { ...input, angle: 450 }), index = doc.nodes.length - 1;
  const initial = evaluateDoc(doc, 1);
  assert.ok(initial.ok);
  const state = { doc, bodies: initial.bodies }, revision = revisionOf(doc);
  const request = { action: 'edit', index, values: { smoothScrewAngle: -360 }, expectedRevision: revision };
  const unevaluated = () => assert.fail('Invalid winding requests must not evaluate.');
  for (const args of [
    { ...request, expectedRevision: undefined }, { ...request, expectedRevision: '0'.repeat(16) },
    { ...request, values: { ...request.values, smoothScrewPitch: 64 } },
    { ...request, feature: doc.nodes[index] }, { ...request, index: 0 },
    ...[450, 0, 451, -451, '360', Infinity, 1e-10].map(angle => ({ ...request, values: { smoothScrewAngle: angle } })),
  ]) {
    const rejected = await dispatchTool(state, 'features', args, unevaluated);
    assert.ok(rejected.isError && !rejected.changed, rejected.content);
    assert.equal(rejected.state, state);
  }
  const discovered = await dispatchTool(state, 'features', { action: 'edit', index }, unevaluated);
  assert.match(discovered.content, /smoothScrewAngle.*Turn angle = 450/);
  const unverified = await dispatchTool(state, 'features', request, async next => evaluatePart(next, 2));
  assert.ok(unverified.isError && !unverified.changed, unverified.content);
  assert.equal(unverified.state, state);
  assert.match(unverified.content, /winding was not verified/);
  const checks: number[] = [];
  const accepted = await dispatchTool(state, 'features', request, async (next, check) => {
    if (check !== undefined) checks.push(check);
    return evaluatePart(next, 2, 8, 'agent', check);
  });
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  assert.deepEqual(checks, [index]);
  const expected = smoothScrewAngleField(doc.nodes, index);
  assert.ok(expected?.kind === 'number');
  assert.deepEqual(accepted.state.doc.nodes, expected.set(doc.nodes, -360));
});

test('Imported circular segment Screws refine the native view and keep canonical STEP owners', () => {
  for (const angle of [-450, 450]) {
    const native = command.build!(segmentCtx, { ...segmentInput, angle });
    const withControl = withNode(native, { kind: 'sketch', profile: 'rectangle', min: [100, 100], max: [104, 104] });
    const twoBodies = withNode(withControl, { kind: 'extrude', sketch: native.nodes.length, height: 4 });
    const step = exportStudioStep(twoBodies, { name: 'Untitled geometry' }).text;
    const opened = withNode(emptyDoc(), { kind: 'import', name: 'Arbitrary source', step, solids: 2 });
    const base = evaluateDoc(opened, 1);
    const display = evaluateDoc(opened, 1, 8, true);
    assert.ok(base.ok && display.ok);
    const outputs = partBreps(opened);
    for (const [i, { brep }] of outputs.entries()) {
      const actual: BodyResult = display.bodies[i];
      const { loftDetail, ...canonical } = actual.mesh;
      assert.deepEqual({ ...actual, mesh: canonical }, base.bodies[i]);
      if (brep.faces.length !== 5) {
        assert.equal(compactStepTurnKind(brep), undefined);
        assert.equal(loftDetail, undefined);
        continue;
      }
      assert.equal(compactStepTurnKind(brep), 'curved-screw');
      assert.ok(loftDetail && 'kind' in loftDetail);
      assert.equal(loftDetail.screwGrid, undefined);
      assert.ok(loftDetail.indices.length > canonical.indices.length);
      assert.deepEqual([...new Set(loftDetail.edgeOfSegment)].sort((a, b) => a - b), canonical.edges.map(edge => edge.index));
      assert.deepEqual([...new Set(loftDetail.faceOfVertex)].sort((a, b) => a - b), canonical.faces.map(face => face.index));
      const renamed = { ...brep,
        faces: brep.faces.map((face, j) => ({ ...face, name: `surface-${j}` })).reverse(),
        edges: brep.edges.map((edge, j) => ({ ...edge, name: `edge-${j}` })).reverse() };
      assert.equal(compactStepTurnKind(renamed), 'curved-screw');

      // This interior weight changes the wall without changing any of its four edge curves.
      const changed = structuredClone(brep);
      const curved = changed.faces.find(face => face.surface.kind === 'surface'
        && face.surface.degreeU === 2 && face.surface.degreeV === 3)?.surface;
      assert.ok(curved?.kind === 'surface');
      curved.weights[1][7] *= 0.999;
      const check = checkBrep(changed, { strict: true });
      assert.ok(check.valid, JSON.stringify(check.issues));
      assert.equal(compactStepTurnKind(changed), undefined);
      const baseMesh = bodyMesh(changed, 0, 8);
      assert.equal(smoothTurnDisplayMesh(baseMesh, changed), baseMesh);

      // Move both recovered circle centres by 2e-9 mm radially. Keep each cap bound
      // to its wall and carry the changed middle controls through the same V law.
      const pseudoArc = structuredClone(brep);
      const local = ([x, y, z]: [number, number, number]): [number, number] =>
        [x - 21, .8 * (y + 19.4) - .6 * (z - 24.8)];
      const isSeam = (point: [number, number, number]) => {
        const [u, v] = local(point);
        return Math.abs(u - 15) < 1e-8 && Math.abs(v) < 1e-8;
      };
      const seam = pseudoArc.edges.find(({ curve }) => curve.degree === 3 && isSeam(curve.controlPoints[0]))?.curve;
      assert.ok(seam);
      for (const { surface } of pseudoArc.faces) {
        if (surface.kind !== 'surface' || surface.degreeU !== 2 || surface.degreeV !== 3) continue;
        const [left, middle, right] = surface.controlPoints;
        const [x0, y0] = local(left[0]), [x1, y1] = local(right[0]), [oldX, oldY] = local(middle[0]);
        const centre = 12 + 2e-9;
        const dx = (x0 + x1) / 2 - centre, dy = (y0 + y1) / 2;
        const reach = 3 / (surface.weights[1][0] * Math.hypot(dx, dy));
        const deltaX = centre + reach * dx - oldX, deltaY = reach * dy - oldY;
        const altered = middle.map(([x, y, z], j): [number, number, number] => {
          const [u, v] = local(seam.controlPoints[j]);
          const east = (u * deltaX - v * deltaY) / 15, north = (v * deltaX + u * deltaY) / 15;
          return [x + east, y + .8 * north, z - .6 * north];
        });
        for (const end of [0, middle.length - 1]) {
          const cap = pseudoArc.edges.find(({ curve }) => curve.degree === 2
            && curve.controlPoints[1].every((value, axis) => value === middle[end][axis]));
          assert.ok(cap);
          cap.curve.controlPoints[1] = altered[end];
        }
        surface.controlPoints[1] = altered;
      }
      const pseudoArcCheck = checkBrep(pseudoArc, { strict: true });
      assert.ok(pseudoArcCheck.valid, JSON.stringify(pseudoArcCheck.issues));
      assert.equal(compactStepTurnKind(pseudoArc), undefined);
    }
  }
});

test('Imported compact Screws get the structured grid under the native STEP owners', () => {
  for (const angle of [180, -360, 450]) {
    const native = command.build!(ctx, { ...input, angle });
    const otherSketch = native.nodes.length;
    const withControl = withNode(native, { kind: 'sketch', profile: 'rectangle', min: [100, 100], max: [104, 104] });
    const box = withNode(withControl, { kind: 'extrude', sketch: otherSketch, height: 4 });
    const step = exportStudioStep(box, { name: 'Arbitrary file title' }).text;
    const opened = withNode(emptyDoc(), { kind: 'import', name: 'Unrelated name', step, solids: 2 });
    const base = evaluateDoc(opened, 3), result = evaluateDoc(opened, 3, 8, true);
    assert.ok(base.ok && result.ok);
    const openedParts = partBreps(opened);
    for (const [i, { brep }] of openedParts.entries()) {
      const actual: BodyResult = result.bodies[i];
      const { loftDetail, ...canonical } = actual.mesh;
      assert.deepEqual({ ...actual, mesh: canonical }, base.bodies[i]);
      if (!brep.edges.some(edge => edge.curve.degree === 3)) {
        assert.equal(loftDetail, undefined);
        assert.equal(compactStepTurnKind(brep), undefined);
        continue;
      }
      assert.equal(compactStepTurnKind(brep), 'screw');
      assert.ok(loftDetail && 'kind' in loftDetail && loftDetail.screwGrid);
      assert.ok(loftDetail.indices.length > canonical.indices.length);
      assert.deepEqual([...new Set(loftDetail.edgeOfSegment)].sort((a, b) => a - b), canonical.edges.map(edge => edge.index));
      assert.deepEqual([...new Set(loftDetail.faceOfVertex)].sort((a, b) => a - b), canonical.faces.map(face => face.index));
      const renamed = { ...brep, faces: brep.faces.map((face, j) => ({ ...face, name: `surface-${j}` })).reverse(),
        edges: brep.edges.map((edge, j) => ({ ...edge, name: `edge-${j}` })).reverse() };
      assert.equal(compactStepTurnKind(renamed), 'screw');

      // Keep all rail/side bindings exact while perturbing a common control column.
      // It is still a strictly valid solid, but no longer has one constant screw law.
      const shifted = structuredClone(brep);
      for (const { curve } of shifted.edges) if (curve.degree === 3) {
        const original = JSON.stringify(curve.controlPoints);
        const [x, y, z] = curve.controlPoints[3];
        const target: [number, number, number] = [x + .01, y, z];
        for (const { surface } of shifted.faces) if (surface.kind === 'surface')
          for (const row of surface.controlPoints) if (JSON.stringify(row) === original) row[3] = target;
        curve.controlPoints[3] = target;
      }
      const check = checkBrep(shifted, { strict: true });
      assert.ok(check.valid, JSON.stringify(check.issues));
      assert.equal(compactStepTurnKind(shifted), undefined);
      const shiftedMesh = bodyMesh(shifted, 0, 8);
      assert.equal(smoothTurnDisplayMesh(shiftedMesh, shifted), shiftedMesh);
    }
  }
});
