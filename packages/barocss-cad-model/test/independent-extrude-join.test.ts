import assert from 'node:assert/strict';
import test from 'node:test';
import { withLook } from '../src/app/bodies';
import { patchValues, type Ctx, type Values } from '../src/app/commands';
import { currentExtrudeJoin, extrudeCommand, isIndependentExtrudeJoinProfile, prepareExtrudeJoin, resolveExtrudeJoin } from '../src/app/profileCommands';
import { emptyDoc, withNode, type DocPlane, type LoopSegment, type SketchNode } from '../src/engine/doc';
import { evaluateDoc, evaluateVolumes } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { isRefusal } from '../src/engine/refusal';

const stock = { node: 1, side: 'solid' } as const;
const xyAt = (z: number): DocPlane => ({ origin: [0, 0, z], normal: [0, 0, 1], xAxis: [1, 0, 0] });
const rectangle = (z: number): SketchNode => ({ kind: 'sketch', profile: 'rectangle', min: [5, 5], max: [15, 15], plane: xyAt(z) });
const stockDoc = () => withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 20] }),
  { kind: 'extrude', sketch: 0, height: 10 });

function context(doc = withNode(stockDoc(), rectangle(8))): Ctx {
  const result = evaluateDoc(doc, 1);
  assert.ok(result.ok);
  return { doc, bodies: result.bodies, selection: { sketches: [2], faces: [], edges: [], bodies: [] } };
}

const input = (ctx: Ctx, patch: Values = {}): Values => ({ ...extrudeCommand.defaults!(ctx), h: 5, ...patch });
const build = (ctx: Ctx, values = input(ctx)) => extrudeCommand.build!(ctx, values);
const near = (got: number | null, expected: number) => assert.ok(got !== null && Math.abs(got - expected) < 1e-7, `${got} ≠ ${expected}`);

function operationOptions(ctx: Ctx, values = input(ctx)) {
  const field = extrudeCommand.fields!(ctx, values).find(field => field.key === 'op');
  return field?.kind === 'choice' ? field.options : [];
}

function evidenceFor(ctx: Ctx, values = input(ctx)) {
  const probe = prepareExtrudeJoin(ctx, values);
  assert.ok(probe);
  const reply = evaluateVolumes(probe.doc, 'probe', probe.doc.nodes.length - 1);
  const evidence = resolveExtrudeJoin(probe, reply);
  assert.ok(evidence);
  return evidence;
}

test('independent Extrude defaults to New and a named native recommendation joins only when selected', () => {
  const base = context();
  const named = withLook(base.doc, base.bodies[0], { name: 'Stock A' });
  const ctx: Ctx = { ...base, extrudeJoinLooks: named };
  const before = structuredClone(ctx.doc), values = input(ctx);
  assert.equal(values.op, 'new');
  assert.deepEqual(operationOptions(ctx), [{ value: 'new', label: 'New body' }]);
  const evidence = evidenceFor(ctx, values);
  near(evidence.volume, 200);
  const proven = { ...ctx, extrudeJoin: evidence };
  assert.deepEqual(operationOptions(proven), [{ value: 'new', label: 'New body' }, { value: 'join:b1', label: 'Join to Stock A' }]);
  assert.deepEqual(ctx.doc, before);

  const separate = build(proven, values), outputs = evaluateVolumes(separate);
  assert.deepEqual(separate.outputs, { b1: stock, b3: { node: 3, side: 'solid' } });
  assert.ok(outputs.ok);
  assert.deepEqual(outputs.volumes.map(row => row.key), ['b1', 'b3']);
  near(outputs.volumes[0].volume, 4000);
  near(outputs.volumes[1].volume, 500);

  const joined = build(proven, { ...values, op: 'join:b1' });
  assert.deepEqual(joined.nodes.slice(0, 3), before.nodes);
  assert.deepEqual(joined.nodes.slice(3), [
    { id: 'n3', kind: 'extrude', sketch: 2, height: 5 },
    { id: 'n4', kind: 'union', left: stock, right: { node: 3, side: 'solid' } },
  ]);
  assert.deepEqual(joined.outputs, { b4: { node: 4, side: 'solid' } });
  const reopened = readStudioDoc(JSON.stringify(joined));
  assert.ok('doc' in reopened);
  assert.deepEqual(reopened.doc, joined);
  const native = evaluateVolumes(reopened.doc);
  assert.ok(native.ok);
  assert.deepEqual(native.volumes.map(row => row.key), ['b4']);
  near(native.volumes[0].volume, 4300);
  assert.deepEqual(ctx.doc, before);
});

test('coplanar contact and separation produce a native empty intersection and no Join', () => {
  for (const z of [10, 11]) {
    const ctx = context(withNode(stockDoc(), rectangle(z)));
    const values = input(ctx);
    const probe = prepareExtrudeJoin(ctx, values);
    assert.ok(probe);
    const reply = evaluateVolumes(probe.doc, 'probe', probe.doc.nodes.length - 1);
    assert.deepEqual(reply, { ok: true, emptyIntersection: 'b4', volumes: [] });
    assert.equal(resolveExtrudeJoin(probe, reply), null);
    assert.throws(() => build(ctx, { ...values, op: 'join:b1' }), error => isRefusal(error, 'BAD_REFERENCE'));
  }
});

test('hidden, unsupported and ambiguous current bodies cannot give an independent Join', () => {
  const ctx = context();
  const hidden = withLook(ctx.doc, ctx.bodies[0], { hidden: true });
  const hiddenBody = { ...ctx, doc: hidden };
  const isolatedLooks = { ...ctx, extrudeJoinLooks: hidden };
  const unsupported = { ...ctx, bodies: [{ ...ctx.bodies[0], family: 'faceted' }] };
  const unknownTopology = { ...ctx, bodies: [{ ...ctx.bodies[0], topology: undefined }] };
  const ambiguous = context(withNode(withNode(ctx.doc, rectangle(0)), { kind: 'extrude', sketch: 3, height: 10 }));
  assert.equal(ambiguous.bodies.length, 2);
  for (const candidate of [hiddenBody, isolatedLooks, unsupported, unknownTopology, ambiguous]) {
    assert.equal(prepareExtrudeJoin(candidate, input(candidate)), null);
  }
});

test('a selected Join stays pinned across edits and refuses stale evidence or a different target', () => {
  const ctx = context(withNode(withNode(stockDoc(), rectangle(8)), rectangle(9)));
  const evidence = evidenceFor(ctx);
  const proven: Ctx = { ...ctx, extrudeJoin: evidence };
  const joined = input(proven, { op: 'join:b1' });
  const edited = patchValues(extrudeCommand, proven, joined, { h: 6 });
  assert.equal(edited.op, joined.op);
  assert.deepEqual(operationOptions(proven, edited), [{ value: 'new', label: 'New body' }, { value: 'join:b1', label: 'Selected body unavailable' }]);

  const hidden = withLook(proven.doc, proven.bodies[0], { hidden: true });
  for (const [stale, values] of [
    [proven, edited],
    [{ ...proven, doc: { ...proven.doc } }, joined],
    [{ ...proven, bodies: [...proven.bodies] }, joined],
    [{ ...proven, selection: { ...proven.selection, sketches: [3] } }, joined],
    [{ ...proven, extrudeJoinLooks: hidden }, joined],
    [proven, { ...joined, depth: 'to-face' }],
  ] satisfies [Ctx, Values][]) {
    assert.equal(currentExtrudeJoin(stale, values), null);
    assert.throws(() => build(stale, values), error => isRefusal(error, 'BAD_REFERENCE'));
  }
  assert.throws(() => build(proven, { ...joined, op: 'join:b2' }), error => isRefusal(error, 'BAD_REFERENCE'));
  const confirmed = { ...proven, extrudeJoin: evidenceFor(ctx, edited) };
  assert.equal(build(confirmed, edited).nodes.at(-1)?.kind, 'union');
  const backToNew = patchValues(extrudeCommand, proven, edited, { op: 'new' });
  const newValues = patchValues(extrudeCommand, confirmed, backToNew, { h: 7 });
  assert.equal(newValues.op, 'new');
  assert.equal(build(confirmed, newValues).nodes.at(-1)?.kind, 'extrude');
});

test('the probe stays within unanchored unmodified XY rectangles and preserves the anchored default', () => {
  const base = context();
  const xy = rectangle(8);
  const triangle: LoopSegment[] = [[7, 7], [9, 7], [7, 9]].map(start => ({ kind: 'line', start: start as [number, number] }));
  const unadmitted: SketchNode[] = [
    { ...xy, on: stock },
    { ...xy, plane: { origin: [8, 0, 0], normal: [1, 0, 0], xAxis: [0, 1, 0] } },
    { ...xy, plane: { origin: [0, 0, 8], normal: [0, 0, 1], xAxis: [0, 1, 0] } },
    { ...xy, holes: [triangle] },
    { ...xy, regions: [triangle] },
    { ...xy, association: { kind: 'planar-face-outline-inset', version: 1, source: stock, sourceFeature: 'n1', face: 'n1.top', insetMM: 1 } },
    { kind: 'sketch', profile: 'circle', center: [10, 10], radius: 3 },
  ];
  for (const sketch of unadmitted) {
    const ctx = { ...base, doc: withNode(stockDoc(), sketch) };
    assert.equal(isIndependentExtrudeJoinProfile(ctx), false);
    assert.equal(prepareExtrudeJoin(ctx, input(ctx)), null);
  }
  const unadmittedValues: Values[] = [{ draft: 3 }, { depth: 'to-face' }, { region: '0' }, { h: Infinity }, { h: 0 }];
  for (const patch of unadmittedValues) {
    assert.equal(prepareExtrudeJoin(base, input(base, patch)), null);
  }
  const anchored = context(withNode(stockDoc(), { ...xy, on: stock }));
  assert.equal(input(anchored).op, 'join');
  assert.deepEqual(operationOptions(anchored).map(option => option.value), ['join', 'new', 'cut']);
  assert.equal(build(anchored).nodes.at(-1)?.kind, 'union');
});

test('an unqualified or negligible volume reply cannot recommend Join', () => {
  const ctx = context();
  const probe = prepareExtrudeJoin(ctx, input(ctx));
  assert.ok(probe);
  for (const volume of [null, 0, 1e-6, NaN, Infinity, -1]) {
    assert.equal(resolveExtrudeJoin(probe, { ok: true, volumes: [{ key: probe.outputKey, volume }] }), null);
  }
  assert.equal(resolveExtrudeJoin(probe, { ok: true, volumes: [{ key: 'b3', volume: 200 }] }), null);
  assert.equal(resolveExtrudeJoin(probe, { ok: true, volumes: [{ key: probe.outputKey, volume: 200 }, { key: 'b3', volume: 5 }] }), null);
  assert.equal(resolveExtrudeJoin(probe, { ok: false }), null);
});
