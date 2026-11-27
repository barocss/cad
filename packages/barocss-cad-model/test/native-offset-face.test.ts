import test from 'node:test';
import assert from 'node:assert/strict';
import { exportStep } from '@barocss/cad';
import { cylinderPart, emptyDoc, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { resolveNativeOffsetFace, validateNativeOffsetDistance } from '../src/app/nativeOffsetFace';
import { buildNativeOffsetFace } from '../src/app/profileCommands';
import { editSavedOffsetFaceCommand } from '../src/app/offsetFaceEdit';
import { isRefusal } from '../src/engine/refusal';
import type { Ctx } from '../src/app/commands';
import { dispatchTool } from '../src/chat/tools';
function context(doc: StudioDoc, name = 'n1.top'): Ctx {
  const result = evaluateDoc(doc, 1); assert.ok(result.ok, JSON.stringify(result));
  const face = result.bodies[0].mesh.faces.findIndex(f => f.name === name); assert.ok(face >= 0, name);
  return { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face }], edges: [], bodies: [] } };
}
const rejected = (run: () => unknown, code: 'VALUE' | 'BAD_REFERENCE' | 'FACE_DISTANCE') => assert.throws(run, e => isRefusal(e, code));

test('native Offset face: six fractional box caps use signed cardinal native coordinates and owned loops', () => {
  const doc = rectanglePart(20.00003, 10, 5), ctx = context(doc), before = structuredClone(doc);
  for (let face = 0; face < ctx.bodies[0].mesh.faces.length; face++) {
    const p = resolveNativeOffsetFace({ ...ctx, selection: { ...ctx.selection, faces: [{ body: 0, face }] } });
    assert.equal(p.kind, 'polygon'); assert.ok(p.thickness > 0); assert.equal(p.sketch.profile, 'loop');
    assert.equal(p.sketch.plane!.origin[p.axis], p.coordinate); assert.equal(p.sketch.plane!.normal[p.axis], p.sign);
    assert.deepEqual(p.sketch.on, { node: 1, side: 'solid' });
    validateNativeOffsetDistance(p, 2); validateNativeOffsetDistance(p, -1);
    rejected(() => validateNativeOffsetDistance(p, -p.thickness), 'FACE_DISTANCE');
    rejected(() => validateNativeOffsetDistance(p, -p.thickness - 1), 'FACE_DISTANCE');
  }
  const top = resolveNativeOffsetFace(ctx); if (top.sketch.profile !== 'loop') throw new Error('Expected loop');
  assert.ok(top.sketch.segments.some(s => s.start[0] === 20.00003));
  const topLoop = top.sketch;
  assert.throws(() => { topLoop.segments[0].start[0] = 123; }, TypeError);
  assert.throws(() => { top.sketch.on!.node = 123; }, TypeError);
  assert.notEqual(resolveNativeOffsetFace(ctx).sketch, top.sketch); assert.deepEqual(doc, before);
});

test('native Offset face: translated plane and triangle footprint preserve native fractions', () => {
  const doc = withNode(rectanglePart(20.00003, 10, 5), { kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [.1234567, -.2345678, .3456789] });
  const p = resolveNativeOffsetFace(context(doc)); assert.equal(p.coordinate, 5.3456789); assert.equal(p.sketch.plane!.origin[2], 5.3456789); validateNativeOffsetDistance(p, 2);
  const triangle = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'loop', segments: [{ kind: 'line', start: [.125, .25] }, { kind: 'line', start: [7.75, .25] }, { kind: 'line', start: [.125, 4.625] }] }), { kind: 'extrude', sketch: 0, height: 3.375 });
  const t = resolveNativeOffsetFace(context(triangle)); assert.equal(t.kind, 'polygon'); if (t.sketch.profile !== 'loop') throw new Error('Expected loop'); assert.equal(t.sketch.segments.length, 3); assert.equal(t.coordinate, 3.375);
});

test('native Offset face: integer native circle control survives without display fitting', () => {
  for (const name of ['n1.top', 'n1.bottom']) {
    const p = resolveNativeOffsetFace(context(cylinderPart(3, 5), name)); assert.equal(p.kind, 'circle');
    if (p.sketch.profile !== 'loop') throw new Error('Expected loop');
    assert.deepEqual(p.sketch.segments, [{ kind: 'arc', start: [3, 0], center: [0, 0], direction: 'ccw' }]);
    validateNativeOffsetDistance(p, 2); validateNativeOffsetDistance(p, -2);
  }
});

test('native Offset face: unsupported drafted/holed caps and ambiguous picks refuse atomically', () => {
  const base = rectanglePart(20, 10, 5), draft = { ...base, nodes: base.nodes.map((n, i) => i === 1 ? { ...n, draft: 5 } : n) } as StudioDoc;
  rejected(() => resolveNativeOffsetFace(context(draft)), 'VALUE');
  const hole = withNode(rectanglePart(20, 10, 5), { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [8, 5], radius: 1 }); rejected(() => resolveNativeOffsetFace(context(hole)), 'VALUE');
  const doc = rectanglePart(20, 10, 5), ctx = context(doc), before = structuredClone(doc);
  const ambiguous = structuredClone(ctx); ambiguous.bodies.push(structuredClone(ambiguous.bodies[0])); rejected(() => resolveNativeOffsetFace(ambiguous), 'BAD_REFERENCE');
  const merged = structuredClone(ctx); merged.bodies[0].mesh.faces[merged.selection.faces[0].face].name += '+other.top'; rejected(() => resolveNativeOffsetFace(merged), 'BAD_REFERENCE');
  const missing = structuredClone(ctx); missing.bodies[0].mesh.faces[missing.selection.faces[0].face].id = 'missing'; rejected(() => resolveNativeOffsetFace(missing), 'BAD_REFERENCE');
  const faceted = structuredClone(ctx); faceted.bodies[0].mesh.faces[faceted.selection.faces[0].face].facet = true; rejected(() => resolveNativeOffsetFace(faceted), 'BAD_REFERENCE'); assert.deepEqual(doc, before);
});

test('native Offset face: mutated current source invalidates the cache and old display consistency', () => {
  const doc = rectanglePart(20, 10, 5), old = context(doc); assert.equal(resolveNativeOffsetFace(old).coordinate, 5);
  const node = doc.nodes[1]; if (node.kind !== 'extrude') throw new Error('Expected extrusion'); node.height = 6;
  rejected(() => resolveNativeOffsetFace(old), 'BAD_REFERENCE'); assert.equal(resolveNativeOffsetFace(context(doc)).coordinate, 6);
});

test('native Offset face: distance refuses zero, nonfinite, rounded no-move and inverted caps', () => {
  const p = resolveNativeOffsetFace(context(rectanglePart(20.00003, 10, 5)));
  for (const d of [0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, -Number.MIN_VALUE, -5, -6, 10000]) rejected(() => validateNativeOffsetDistance(p, d), 'FACE_DISTANCE');
  for (const d of [.125, -.125, 2]) validateNativeOffsetDistance(p, d);
});

test('native Offset face: a mutated owned profile cannot reuse its earlier geometric proof', () => {
  const ctx = context(cylinderPart(3, 5));
  const coordinate = resolveNativeOffsetFace(ctx);
  assert.throws(() => Object.defineProperty(coordinate, 'coordinate', { get: () => 123 }), TypeError);
  const sketch = resolveNativeOffsetFace(ctx); if (sketch.sketch.profile !== 'loop') throw new Error('Expected loop');
  const sketchLoop = sketch.sketch;
  assert.throws(() => { sketchLoop.segments[0].start[0] = 4; }, TypeError);
  validateNativeOffsetDistance(sketch, 2);
  const clone = structuredClone(resolveNativeOffsetFace(ctx)); rejected(() => validateNativeOffsetDistance(clone, 2), 'FACE_DISTANCE');
  validateNativeOffsetDistance(resolveNativeOffsetFace(ctx), 2);
});

test('native Offset face: cardinally rotated native circle caps retain the actual signed frame', () => {
  for (const axis of ['x', 'y'] as const) {
    const doc = withNode(cylinderPart(3, 5), { kind: 'rotate', parent: { node: 1, side: 'solid' }, axis, angle: 90 });
    for (const name of ['n1.top', 'n1.bottom']) {
      const p = resolveNativeOffsetFace(context(doc, name)); assert.equal(p.kind, 'circle'); assert.notEqual(p.axis, 2);
      validateNativeOffsetDistance(p, 2); validateNativeOffsetDistance(p, -2);
    }
  }
});


test('native Offset face: cached display consistency owns its records and rejects a tampered caller clone', () => {
  const ctx = context(rectanglePart(20, 10, 5)); resolveNativeOffsetFace(ctx);
  const tampered = { ...ctx, bodies: structuredClone(ctx.bodies) };
  tampered.bodies[0].mesh.faces[tampered.selection.faces[0].face].centroid[0] += 1;
  rejected(() => resolveNativeOffsetFace(tampered), 'BAD_REFERENCE');
  validateNativeOffsetDistance(resolveNativeOffsetFace(ctx), 2);
});


test('native Offset face: mixed selections cannot bypass command availability', () => {
  const ctx = context(rectanglePart(20, 10, 5));
  for (const selection of [
    { ...ctx.selection, edges: [{ body: 0, edge: 0 }] },
    { ...ctx.selection, bodies: [0] },
    { ...ctx.selection, sketches: [0] },
    { ...ctx.selection, vertices: [{ body: 0, at: [0, 0, 0] as [number, number, number] }] },
  ]) rejected(() => resolveNativeOffsetFace({ ...ctx, selection }), 'BAD_REFERENCE');
  rejected(() => resolveNativeOffsetFace({ ...ctx, direct: ['curve'] }), 'BAD_REFERENCE');
});

test('native Offset face: full native curved coefficients reject a noncircular ruled cap with unchanged endpoints', () => {
  const original = partBreps(cylinderPart(3, 5))[0].brep, changed = structuredClone(original);
  // Keep endpoints, weights, all cap bounds and native incidence. Move the interior tangent pole
  // in both arc edges and ruled supports, so endpoint-only and bounding-box circle fits would pass.
  for (const edge of changed.edges) for (const p of edge.curve.controlPoints) if (p[0] === 3 && p[1] > 2.9) p[0] = 2.5;
  for (const face of changed.faces) if (face.surface.kind === 'surface' && face.surface.degreeU === 2) for (const row of face.surface.controlPoints) for (const p of row) if (p[0] === 3 && p[1] > 2.9) p[0] = 2.5;
  const doc = withNode(emptyDoc(), { kind: 'import', name: 'noncircular.step', step: exportStep(changed) });
  const evaluated = evaluateDoc(doc, 1); assert.ok(evaluated.ok, JSON.stringify(evaluated));
  const face = evaluated.bodies[0].mesh.faces.findIndex(f => f.kind === 'plane' && f.normal[2] > .99); assert.ok(face >= 0);
  const ctx: Ctx = { doc, bodies: evaluated.bodies, selection: { faces: [{ body: 0, face }], edges: [], bodies: [] } };
  const before = structuredClone(doc);
  assert.throws(() => resolveNativeOffsetFace(ctx), e => isRefusal(e, 'VALUE') && /complete native circular quotient/.test(e.message));
  assert.deepEqual(doc, before);
});

test('native Offset face: positive represented near-full residue must also pass native strict target validity', () => {
  const doc = withNode(rectanglePart(20.00003, 10.00007, 5.00009), { kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [.1234567, -.2345678, .3456789] });
  const ctx = context(doc), p = resolveNativeOffsetFace(ctx), distance = -(p.coordinate - p.opposite), next = p.coordinate + p.sign * distance, before = structuredClone(doc);
  assert.ok(next > p.opposite); assert.equal(next - p.opposite, 2.220446049250313e-16);
  assert.throws(() => validateNativeOffsetDistance(p, distance), e => isRefusal(e, 'FACE_DISTANCE') && /native strict validity/.test(e.message));
  assert.deepEqual(doc, before);
  validateNativeOffsetDistance(p, distance + .001);
});

test('native Offset face: curved strict-valid near-full residue retains a representable mass interval after longitudinal repair', () => {
  const doc = withNode(cylinderPart(3, 5.00009), { kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [.1234567, -.2345678, .3456789] });
  const ctx = context(doc), p = resolveNativeOffsetFace(ctx), distance = -(p.coordinate - p.opposite), before = structuredClone(doc);
  assert.ok(p.coordinate + distance > p.opposite);
  validateNativeOffsetDistance(p, distance);
  assert.deepEqual(doc, before);
  // The unchanged current-source proof must retain corrected success after an ordinary retry.
  validateNativeOffsetDistance(resolveNativeOffsetFace(ctx), distance + .001);
  validateNativeOffsetDistance(resolveNativeOffsetFace(ctx), distance);
  validateNativeOffsetDistance(resolveNativeOffsetFace(ctx), distance + .001);
});

test('native Offset face: ordinary small positive remaining intervals pass on every signed cardinal cap', () => {
  const offset: [number, number, number] = [.1234567, -.2345678, .3456789];
  const documents = [withNode(rectanglePart(20.00003, 10.00007, 5.00009), { kind: 'translate', parent: { node: 1, side: 'solid' }, offset })];
  for (const axis of ['x', 'y', 'z'] as const) {
    const rotated = withNode(cylinderPart(3, 5.00009), { kind: 'rotate', parent: { node: 1, side: 'solid' }, axis, angle: axis === 'z' ? 0 : 90 });
    documents.push(withNode(rotated, { kind: 'translate', parent: { node: 2, side: 'solid' }, offset }));
  }
  let controls = 0;
  for (const doc of documents) {
    const evaluated = evaluateDoc(doc, 1); assert.ok(evaluated.ok, JSON.stringify(evaluated)); const before = structuredClone(doc);
    for (let face = 0; face < evaluated.bodies[0].mesh.faces.length; face++) {
      if (evaluated.bodies[0].mesh.faces[face].kind !== 'plane') continue;
      const ctx: Ctx = { doc, bodies: evaluated.bodies, selection: { faces: [{ body: 0, face }], edges: [], bodies: [] } }, p = resolveNativeOffsetFace(ctx);
      validateNativeOffsetDistance(p, -Math.abs(p.coordinate - p.opposite) + .001); controls++;
    }
    assert.deepEqual(doc, before);
  }
  assert.equal(controls, 12);
});

test('native Offset face: ordinary negative-cap outward offsets keep direct native interval endpoints', () => {
  const doc = withNode(rectanglePart(20.00003, 10.00007, 5.00009), { kind: 'translate', parent: { node: 1, side: 'solid' }, offset: [.1234567, -.2345678, .3456789] });
  const evaluated = evaluateDoc(doc, 1); assert.ok(evaluated.ok, JSON.stringify(evaluated)); const before = structuredClone(doc);
  for (const axis of [0, 1] as const) {
    const face = evaluated.bodies[0].mesh.faces.findIndex(f => f.normal[axis] === -1), ctx: Ctx = { doc, bodies: evaluated.bodies, selection: { faces: [{ body: 0, face }], edges: [], bodies: [] } };
    const p = resolveNativeOffsetFace(ctx), next = p.coordinate - 2.125, lo = Math.min(next, p.opposite), hi = Math.max(next, p.opposite);
    assert.notEqual(lo + (hi - lo), hi, 'This ordinary interval must exercise the extra-reassociation regression');
    validateNativeOffsetDistance(p, 2.125);
    validateNativeOffsetDistance(resolveNativeOffsetFace(ctx), 2.125);
  }
  assert.deepEqual(doc, before);
});

test('features.command offsets the exact triangle wall at the current revision and keeps it on refusal', async () => {
  let doc = withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon', points: [[0, 0], [24, 0], [6, 16]] });
  doc = withNode(doc, { kind: 'extrude', sketch: 0, height: 10 });
  const { bodies } = context(doc, 'n1.side0');
  const state = { doc, bodies };
  const evaluate = async (candidate: StudioDoc) => evaluateDoc(candidate, 1);
  const current = await dispatchTool(state, 'query', { action: 'rebuild' }, evaluate);
  assert.ok(!current.isError, current.content);
  const args = { action: 'command', command: 'offset-face', faces: ['n1.side0'], expectedRevision: JSON.parse(current.content).revision };
  const result = await dispatchTool(state, 'features', { ...args, values: { d: -2 } }, evaluate);
  assert.ok(result.changed && !result.isError, result.content);
  const feature = result.state.doc.nodes[2];
  assert.ok(feature.kind === 'offset-face');
  assert.deepEqual([feature.faces, feature.distance], [['n1.side0'], -2]);
  const volume = result.state.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - 1470) < 1e-8);

  const stale = await dispatchTool(result.state, 'features', { ...args, values: { d: 2 } }, evaluate);
  assert.ok(stale.isError && !stale.changed && stale.state.doc === result.state.doc);

  const collapsed = await dispatchTool(state, 'features', { ...args, values: { d: -16 } }, evaluate);
  assert.ok(collapsed.isError && !collapsed.changed && collapsed.state.doc === doc, collapsed.content);
  assert.match(collapsed.content, /collapse or cross a wall/);
});

test('Offset face on the original box wall has one native node and retains the legacy extrusion route', async () => {
  const doc = rectanglePart(40, 30, 20), ctx = context(doc, 'n1.side0');
  const composed = buildNativeOffsetFace(ctx, 2), operation = composed.nodes[4];
  assert.deepEqual(composed.nodes.slice(2).map(node => node.kind), ['sketch', 'extrude', 'union']);
  assert.ok(operation.kind === 'union');
  const legacy: StudioDoc = { ...composed, nodes: [...composed.nodes.slice(0, 4),
    { ...operation, made: { command: 'offset-face', nodes: 3, values: { d: 2, face: 'n1.side0' } } }] };
  const opened = readStudioDoc(JSON.stringify(legacy));
  assert.ok('doc' in opened);
  const legacyGeometry = evaluateDoc(opened.doc, 1);
  assert.ok(legacyGeometry.ok);
  assert.ok(Math.abs(legacyGeometry.bodies[0].volume! - 25600) < 1e-7);
  const history = editSavedOffsetFaceCommand(opened.doc, 4);
  assert.ok(history?.build);
  const edited = history.build({ doc: opened.doc, bodies: legacyGeometry.bodies, selection: { faces: [], edges: [], bodies: [] } }, { d: 3 });
  const editedLegacy = evaluateDoc(edited, 2);
  assert.ok(editedLegacy.ok);
  assert.ok(Math.abs(editedLegacy.bodies[0].volume! - 26400) < 1e-7);
  assert.equal(edited.nodes[4].id, operation.id);

  const state = { doc, bodies: ctx.bodies };
  const evaluate = async (candidate: StudioDoc) => evaluateDoc(candidate, 1);
  const current = await dispatchTool(state, 'query', { action: 'rebuild' }, evaluate);
  assert.ok(!current.isError, current.content);
  const result = await dispatchTool(state, 'features', { action: 'command', command: 'offset-face',
    expectedRevision: JSON.parse(current.content).revision, faces: ['n1.side0'], values: { d: 2 } }, evaluate);
  assert.ok(result.changed && !result.isError, result.content);
  const applied = result.state.doc;
  assert.equal(applied.nodes.length, 3);
  const node = applied.nodes[2];
  assert.ok(node.kind === 'offset-face');
  assert.deepEqual([node.parent, node.faces, node.distance], [{ node: 1, side: 'solid' }, ['n1.side0'], 2]);
  assert.ok(Math.abs(result.state.bodies[0].volume! - 25600) < 1e-7);
});

test('a second revision-pinned native Offset restores the exact original rectangular wall', async () => {
  let doc = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0.1, 0.1], max: [40.1, 30.1] });
  doc = withNode(doc, { kind: 'extrude', sketch: 0, height: 20 });
  const initial = { doc, bodies: context(doc, 'n1.side0').bodies };
  const evaluate = async (candidate: StudioDoc) => evaluateDoc(candidate, 1);
  const offset = async (state: typeof initial, d: number) => {
    const current = await dispatchTool(state, 'query', { action: 'rebuild' }, evaluate);
    assert.ok(!current.isError, current.content);
    return dispatchTool(state, 'features', { action: 'command', command: 'offset-face',
      expectedRevision: JSON.parse(current.content).revision, faces: ['n1.side0'], values: { d } }, evaluate);
  };
  const forward = await offset(initial, 1);
  assert.ok(forward.changed && !forward.isError, forward.content);
  const inverse = await offset(forward.state, -1);
  assert.ok(inverse.changed && !inverse.isError, inverse.content);
  const saved = inverse.state.doc, second = saved.nodes[3];
  assert.equal(saved.nodes.length, 4);
  assert.ok(second.kind === 'offset-face');
  assert.deepEqual([second.parent, second.faces, second.distance], [{ node: 2, side: 'solid' }, ['n1.side0'], -1]);
  const reopened = readStudioDoc(JSON.stringify(saved));
  assert.ok('doc' in reopened);
  assert.deepEqual(partBreps(reopened.doc)[0].brep, partBreps(doc)[0].brep);
});
