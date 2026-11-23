import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep } from '@barocss/cad';
import { part } from '../src/api';
import { commands, type Ctx } from '../src/app/commands';
import { checkNode, deleteFeature, featureDependents, renumber } from '../src/chat/features';
import { moveNode } from '../src/chat/remap';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { curvesSource } from '../src/engine/curveSource';
import { importSource } from '../src/engine/direct';
import { leafBodies, parentsOf, priorLinearFeaturePatternProblem, rectangularFeaturePatternProblem, rectangularPatternDocumentProblem, usesOf, withNode, type BodyRef, type ModelNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { flattenAssembly } from '../src/engine/flatten';
import { featureId } from '../src/engine/ids';
import { readStudioDoc } from '../src/engine/migrate';
import { toPartDocument } from '../src/engine/part';
import { isRefusal } from '../src/engine/refusal';
import { revisionOf } from '../src/util/revision';

const values = { axis: 'x', spacing: 16, count: 3, axis2: 'y', spacing2: 16, count2: 2 };
function seed() {
  const first = part('explicit prototype').parameter('pitch', 16).box({ w: 60, d: 40, h: 10 })
    .subtract(tool => tool.box({ w: 4, d: 4, h: 10, x: 8, y: 8 }));
  const later = first.subtract(tool => tool.box({ w: 4, d: 4, h: 10, x: 52, y: 30 }));
  return { first: first.doc.nodes.length - 1, target: later.doc.nodes.length - 1, doc: later.doc };
}
function context(doc: StudioDoc): Ctx {
  const result = evaluateDoc(doc, 1); assert.ok(result.ok, result.ok ? '' : result.error.detail); assert.equal(result.bodies.length, 1);
  return { doc, bodies: result.bodies, selection: { faces: [], edges: [], bodies: [0] } };
}
function command() { const cmd = commands.find(command => command.id === 'rectangular-feature-pattern'); assert.ok(cmd?.build); return cmd; }
function authored() {
  const input = seed(), ctx = { ...context(input.doc), rectangularCutSource: { node: input.first, side: 'solid' as const } };
  const doc = command().build!(ctx, { ...values }), node = doc.nodes.at(-1); assert.ok(node?.kind === 'rectangular-feature-pattern');
  return { ...input, ctx, made: doc, node };
}

test('explicit earlier rectangular prototype preserves the later Difference target and all seven through cuts', () => {
  const { doc, first, target, ctx, made, node } = authored(), before = structuredClone(ctx);
  assert.equal(command().available(ctx).ok, true);
  assert.deepEqual(node.parent, { node: target, side: 'solid' }); assert.deepEqual(node.source, { node: first, side: 'solid' });
  assert.deepEqual(made.nodes.slice(0, -1), doc.nodes); assert.deepEqual(parentsOf(node), [target]); assert.deepEqual(usesOf(node), [target, first]);
  assert.deepEqual(leafBodies(made.nodes), [{ node: made.nodes.length - 1, side: 'solid' }]);
  assert.equal(checkNode(node, doc.nodes, doc.parameters), null);
  const feature = toPartDocument(made).features.at(-1); assert.ok(feature?.kind === 'rectangular-feature-pattern');
  assert.equal(feature.target, featureId(doc.nodes, target)); assert.equal(feature.source, featureId(doc.nodes, first));
  const output = partBreps(made); assert.equal(output.length, 1);
  const report = checkBrep(output[0].brep, { strict: true }); assert.ok(report.valid, report.issues.join('\n'));
  const evaluated = evaluateDoc(made, 2); assert.ok(evaluated.ok, evaluated.ok ? '' : evaluated.error.detail);
  assert.ok(evaluated.bodies[0].volume !== null && Math.abs(evaluated.bodies[0].volume - 22880) < 1e-7);
  // Six 4×4×10 prototype cuts plus the retained later 4×4×10 cut in 60×40×10 stock.
  for (const [x, y] of [[8, 8], [24, 8], [40, 8], [8, 24], [24, 24], [40, 24], [52, 30]])
    for (const dx of [0, 4]) for (const dy of [0, 4]) for (const z of [0, 10])
      assert.ok(output[0].brep.vertices.some(vertex => vertex.point.every((value, axis) => Math.abs(value - [x + dx, y + dy, z][axis]) < 1e-7)));
  assert.deepEqual(ctx, before);
});

test('omitted source and an explicit current intent keep legacy rectangular and linear node bytes unchanged', () => {
  const first = part('legacy').box({ w: 60, d: 40, h: 10 }).subtract(tool => tool.box({ w: 4, d: 4, h: 10, x: 8, y: 8 }));
  const ctx = context(first.doc), cmd = command(), parent = { node: first.doc.nodes.length - 1, side: 'solid' as const };
  const legacy = cmd.build!(ctx, { ...values }), current = cmd.build!({ ...ctx, rectangularCutSource: parent }, { ...values });
  assert.deepEqual(current, legacy); assert.equal(Object.hasOwn(legacy.nodes.at(-1)!, 'source'), false);
  const feature = toPartDocument(legacy).features.at(-1); assert.ok(feature?.kind === 'rectangular-feature-pattern');
  assert.equal(Object.hasOwn(feature, 'source'), false);
  const linear = commands.find(command => command.id === 'linear-feature-pattern'); assert.ok(linear?.build);
  assert.deepEqual(linear.build(ctx, { axis: 'x', spacing: 16, count: 3 }),
    linear.build({ ...ctx, rectangularCutSource: parent }, { axis: 'x', spacing: 16, count: 3 }));
});

test('the Agent command binds an explicit earlier cut to one current body and revision', async () => {
  const { doc, ctx, first, target, made } = authored(), before = structuredClone(doc);
  const source = featureId(doc.nodes, first), targetId = featureId(doc.nodes, target), body = ctx.bodies[0].key;
  const args = { action: 'command', command: command().id, expectedRevision: revisionOf(doc), bodies: [body], values: { ...values, source } };
  const evaluate = async (input: StudioDoc) => evaluateDoc(input, 2);
  const call = (input: Record<string, unknown>) => dispatchTool({ doc, bodies: ctx.bodies }, 'features', input, evaluate);
  const result = await call(args);
  assert.equal(result.isError, false, result.content);
  assert.deepEqual(JSON.parse(result.content).cutSource, { source, target: targetId, body });
  assert.deepEqual(result.state.doc.nodes, made.nodes);
  const refusals: [Record<string, unknown>, RegExp][] = [
    [{ expectedRevision: undefined }, /needs expectedRevision/],
    [{ expectedRevision: '0000000000000000' }, /part changed/],
    [{ values: { ...values, source: first } }, /stable ID/],
    [{ values: { ...values, source: targetId } }, /distinct/],
    [{ values: { ...values, source: featureId(doc.nodes, first - 1) } }, /direct earlier/],
    [{ bodies: [body, body] }, /one current solid/],
    [{ point: [0, 0, 0] }, /no face, edge or point/],
  ];
  for (const [override, message] of refusals) {
    const refused = await call({ ...args, ...override });
    assert.equal(refused.isError, true, refused.content);
    assert.match(JSON.parse(refused.content).error, message);
    assert.equal(refused.state.doc, doc);
  }
  assert.deepEqual(doc, before);
});

test('Linear commands and saved recipes keep an explicit earlier rectangular source through signed spacing and remapping', async () => {
  const { doc, first, target, ctx } = authored(), linear = commands.find(command => command.id === 'linear-feature-pattern');
  assert.ok(linear?.build);
  const sourceId = featureId(doc.nodes, first), body = ctx.bodies[0].key;
  const signed = { axis: 'x', spacing: -5, count: 2 };
  const make = (overrides: Record<string, unknown>) => dispatchTool({ doc, bodies: ctx.bodies }, 'features', {
    action: 'command', command: linear.id, bodies: [body], expectedRevision: revisionOf(doc),
    values: { source: sourceId, ...signed, ...overrides },
  }, async input => evaluateDoc(input, 2));
  const result = await make({});
  assert.equal(result.isError, false, result.content);
  const made = result.state.doc, node = made.nodes.at(-1);
  assert.ok(node?.kind === 'linear-feature-pattern');
  assert.deepEqual(node.source, { node: first, side: 'solid' });
  assert.deepEqual(node.parent, { node: target, side: 'solid' });
  assert.deepEqual(usesOf(node), [target, first]);
  assert.deepEqual(parentsOf(node), [target]);
  const feature = toPartDocument(made).features.at(-1);
  assert.ok(feature?.kind === 'linear-feature-pattern');
  assert.equal(feature.source, sourceId);
  assert.equal(feature.target, featureId(doc.nodes, target));
  assert.equal(checkNode(node, doc.nodes, doc.parameters), null);
  assert.deepEqual(renumber(node, index => index + 3), { ...node,
    parent: { node: target + 3, side: 'solid' }, source: { node: first + 3, side: 'solid' } });
  const host = part('host').box({ w: 4, d: 4, h: 4, x: 1000 }).doc;
  const flat = flattenAssembly({ ...host, instances: [{ id: 'child', name: 'Linear cut source', doc: made, position: [0, 0, 0], rotation: [0, 0, 0] }] });
  const shifted = flat.nodes.find(node => node.kind === 'linear-feature-pattern');
  assert.ok(shifted?.kind === 'linear-feature-pattern');
  assert.deepEqual(shifted.parent, { node: target + host.nodes.length, side: 'solid' });
  assert.deepEqual(shifted.source, { node: first + host.nodes.length, side: 'solid' });
  const opened = await readStudioFile(encodeStudioFile(made));
  assert.ok('doc' in opened, JSON.stringify(opened));
  assert.deepEqual(opened.doc, made);
  assert.deepEqual(made.nodes.slice(0, -1), doc.nodes);
  const native = evaluateDoc(made, 3);
  assert.ok(native.ok, native.ok ? '' : native.error.detail);
  assert.ok(native.bodies[0].volume !== null && Math.abs(native.bodies[0].volume - 23520) < 1e-8);
  for (const values of [{ spacing: 0 }, { axis: 'z' }, { source: featureId(doc.nodes, target) }]) {
    const refused = await make(values);
    assert.equal(refused.isError, true, refused.content);
    assert.equal(refused.state.doc, doc);
  }
  for (const override of [{ axis: 'z' }, { spacing: 0 }, { source: node.parent }, { source: null }]) {
    const invalid: Record<string, unknown> = { ...made, nodes: [...doc.nodes, { ...node, ...override }] };
    assert.ok(rectangularPatternDocumentProblem(invalid));
    assert.ok('error' in readStudioDoc(JSON.stringify(invalid)));
  }
  assert.throws(() => linear.build!(context(doc), signed), error => isRefusal(error, 'VALUE'));
});

test('Fill captures an independent mask and lowers, saves and remaps the explicit earlier cut', async () => {
  const { doc: original, first, target } = seed();
  const doc = withNode(original, { kind: 'sketch', profile: 'rectangle', min: [25, 0], max: [27, 25] });
  const mask = doc.nodes.length - 1, ctx = context(doc);
  const result = await dispatchTool({ doc, bodies: ctx.bodies }, 'features', {
    action: 'command', command: 'fill-feature-pattern', bodies: [ctx.bodies[0].key], expectedRevision: revisionOf(doc),
    values: { source: featureId(doc.nodes, first), region: String(mask), anchorX: 10, anchorY: 9, spacing: 16, count: 2, spacing2: 8, count2: 2 },
  }, async input => evaluateDoc(input, 2));
  assert.equal(result.isError, false, result.content);
  const made = result.state.doc, node = made.nodes.at(-1);
  assert.ok(node?.kind === 'fill-feature-pattern');
  assert.deepEqual(usesOf(node), [target, first]);
  assert.deepEqual(parentsOf(node), [target]);
  assert.equal(checkNode(node, doc.nodes, doc.parameters), null);
  const feature = toPartDocument(made).features.at(-1);
  assert.ok(feature?.kind === 'fill-feature-pattern');
  assert.equal(feature.source, featureId(doc.nodes, first));
  assert.equal(feature.target, featureId(doc.nodes, target));
  assert.deepEqual(made.nodes.slice(0, -1), doc.nodes);
  assert.deepEqual(renumber(node, index => index + 3), { ...node,
    parent: { node: target + 3, side: 'solid' }, source: { node: first + 3, side: 'solid' } });
  const host = part('host').box({ w: 4, d: 4, h: 4, x: 1000 }).doc;
  const flattened = flattenAssembly({ ...host, instances: [{ id: 'child', name: 'Fill cut source', doc: made, position: [0, 0, 0], rotation: [0, 0, 0] }] });
  const moved = flattened.nodes.find(node => node.kind === 'fill-feature-pattern');
  assert.ok(moved?.kind === 'fill-feature-pattern');
  assert.deepEqual(moved.source, { node: first + host.nodes.length, side: 'solid' });
  assert.deepEqual(moved.parent, { node: target + host.nodes.length, side: 'solid' });
  const opened = await readStudioFile(encodeStudioFile(made));
  assert.ok('doc' in opened, JSON.stringify(opened));
  assert.deepEqual(opened.doc, made);
  const changedSketch: StudioDoc = { ...made, nodes: made.nodes.map((node, index) => index === mask ? { ...node, suppressed: true } : node) };
  assert.deepEqual(partBreps(changedSketch)[0].brep, partBreps(made)[0].brep);
  const invalid: Record<string, unknown> = { ...made, nodes: [...doc.nodes, { ...node, source: node.parent }] };
  assert.ok('error' in readStudioDoc(JSON.stringify(invalid)));
});

test('Path keeps its linked straight spans and the distinct earlier source and current target', async () => {
  const { doc: original, first, target } = seed();
  const points: [number, number, number][] = [[0, 0, 2], [8, 0, 2], [16, 0, 2], [16, 12, 2], [16, 24, 2]];
  const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2], points, weights: [1, 1, 1, 1, 1] };
  const direct = importSource({ sources: {}, objects: [] }, curvesSource('earlier_path', [path]), 'Path');
  const doc = { ...original, direct }, id = direct.objects[0].id, ctx = context(doc);
  const result = await dispatchTool({ doc, bodies: ctx.bodies }, 'features', {
    action: 'command', command: 'curve-feature-pattern', bodies: [ctx.bodies[0].key], expectedRevision: revisionOf(doc),
    values: { source: featureId(doc.nodes, first), path: id, spacing: 16, count: 3 },
  }, async input => evaluateDoc(input, 2));
  assert.equal(result.isError, false, result.content);
  const made = result.state.doc, node = made.nodes.at(-1);
  assert.ok(node?.kind === 'curve-feature-pattern');
  assert.deepEqual(node.path, { objectId: id });
  assert.deepEqual(usesOf(node), [target, first]);
  assert.deepEqual(parentsOf(node), [target]);
  assert.equal(checkNode(node, doc.nodes, doc.parameters), null);
  const feature = toPartDocument(made).features.at(-1);
  assert.ok(feature?.kind === 'curve-feature-pattern');
  assert.equal(feature.source, featureId(doc.nodes, first));
  assert.equal(feature.target, featureId(doc.nodes, target));
  assert.deepEqual(feature.path.controlPoints, points);
  const opened = await readStudioFile(encodeStudioFile(made));
  assert.ok('doc' in opened, JSON.stringify(opened));
  assert.deepEqual(opened.doc, made);
  assert.deepEqual(renumber(node, index => index + 3), { ...node,
    parent: { node: target + 3, side: 'solid' }, source: { node: first + 3, side: 'solid' } });
  const host = part('host').box({ w: 4, d: 4, h: 4, x: 1000 }).doc;
  assert.throws(() => flattenAssembly(made), /base document/);
  const inline: StudioDoc = { ...made, direct: undefined, nodes: [...doc.nodes, { ...node, path: feature.path }] };
  const flattened = flattenAssembly({ ...host, instances: [{ id: 'child', name: 'Path cut source', doc: inline, position: [0, 0, 0], rotation: [0, 0, 0] }] });
  const moved = flattened.nodes.find(node => node.kind === 'curve-feature-pattern');
  assert.ok(moved?.kind === 'curve-feature-pattern');
  assert.deepEqual(moved.source, { node: first + host.nodes.length, side: 'solid' });
  assert.deepEqual(moved.parent, { node: target + host.nodes.length, side: 'solid' });
  assert.ok('controlPoints' in moved.path);
  const wrongPlane = { ...feature.path, controlPoints: [[0, 0, 2], [16, 0, 3]], degree: 1, knots: [0, 0, 1, 1], weights: [1, 1] };
  const invalid: Record<string, unknown> = { ...made, nodes: [...doc.nodes, { ...node, path: wrongPlane, count: 1 }] };
  assert.ok('error' in readStudioDoc(JSON.stringify(invalid)));
});

test('source indices follow delete, move, proposal remap and placed-document flattening without becoming consumed parents', () => {
  const { made, node, first, target } = authored(), snapshot = structuredClone(node);
  assert.deepEqual(renumber(node, index => index + 2), { ...node, parent: { node: target + 2, side: 'solid' }, source: { node: first + 2, side: 'solid' } });
  const ids = made.nodes.map((_, index) => featureId(made.nodes, index)), missing: string[] = [];
  const shifted = moveNode(node, { from: ids, to: ['n999', ...ids], ids: new Map() }, missing);
  assert.ok(shifted.kind === 'rectangular-feature-pattern');
  assert.deepEqual(shifted.parent, { node: target + 1, side: 'solid' }); assert.deepEqual(shifted.source, { node: first + 1, side: 'solid' }); assert.deepEqual(missing, []);
  assert.ok(featureDependents(made, first).includes(made.nodes.length - 1)); assert.ok('error' in deleteFeature(made, first));
  const host = part('host').box({ w: 4, d: 4, h: 4, x: 1000 }).doc;
  const flattened = flattenAssembly({ ...host, instances: [{ id: 'child', name: 'Prototype pattern', doc: made, position: [0, 0, 0], rotation: [0, 0, 0] }] });
  const flat = flattened.nodes.find(node => node.kind === 'rectangular-feature-pattern'); assert.ok(flat?.kind === 'rectangular-feature-pattern');
  assert.deepEqual(flat.parent, { node: target + host.nodes.length, side: 'solid' });
  assert.deepEqual(flat.source, { node: first + host.nodes.length, side: 'solid' });
  assert.deepEqual(node, snapshot);
});

test('source-aware saved recipes retain existing schema, Dim spacing and source/target identities through fresh Open', async () => {
  const { made, node } = authored();
  const bound: StudioDoc = { ...made, nodes: made.nodes.map(value => value === node ? { ...node, spacing: { parameter: 'pitch' } } : value) };
  const before = structuredClone(bound), opened = await readStudioFile(encodeStudioFile(bound)); assert.ok('doc' in opened, JSON.stringify(opened));
  assert.deepEqual(opened.doc, before); assert.equal(opened.doc.schema, before.schema);
  const changed = { ...opened.doc, parameters: { ...opened.doc.parameters, pitch: 12 } };
  const result = evaluateDoc(changed, 3); assert.ok(result.ok, result.ok ? '' : result.error.detail);
  assert.ok(result.bodies[0].volume !== null && Math.abs(result.bodies[0].volume - 22880) < 1e-7);
  assert.deepEqual(bound, before);
});

test('arbitrary consumed or cross-scope sources and missing, suppressed or non-Difference chain members refuse atomically', () => {
  const { doc, first, target, ctx, node } = authored(), before = structuredClone(doc);
  const badSources: unknown[] = [{ node: first, side: 'negative' }, { node: -1, side: 'solid' }, { node: target + 1, side: 'solid' },
    { node: first - 1, side: 'solid' }, { node: first, side: 'solid', part: 'other' }, { node: first + .5, side: 'solid' }];
  for (const source of badSources) {
    const raw = { ...node, source };
    assert.ok(rectangularFeaturePatternProblem(raw, doc.nodes, doc.parameters)); assert.ok(checkNode(raw, doc.nodes, doc.parameters));
    const invalid = { ...doc, nodes: [...doc.nodes, raw] };
    assert.ok(rectangularPatternDocumentProblem(invalid)); assert.ok('error' in readStudioDoc(JSON.stringify(invalid)));
    const bad = { ...ctx, rectangularCutSource: source as BodyRef };
    assert.equal(command().available(bad).ok, false); assert.throws(() => command().build!(bad, { ...values }), error => isRefusal(error, 'BAD_REFERENCE'));
  }
  assert.ok(rectangularFeaturePatternProblem({ ...node, source: node.parent }, doc.nodes, doc.parameters));
  const prototype = doc.nodes[first]; assert.ok(prototype.kind === 'difference');
  const variants: ModelNode[][] = [
    doc.nodes.map((node, index) => index === first ? { ...node, suppressed: true } : node),
    doc.nodes.map((node, index) => index === first ? { ...node, held: 'source unavailable' } : node),
    doc.nodes.map((node, index) => index === target && node.kind === 'difference' ? { ...node, parent: prototype.parent } : node),
    doc.nodes.map((node, index) => index === target && node.kind === 'difference' ? { ...node, parent: prototype.tool } : node),
  ];
  for (const nodes of variants) assert.ok(rectangularFeaturePatternProblem(node, nodes, doc.parameters));
  const third = part('three cuts', doc).subtract(tool => tool.box({ w: 4, d: 4, h: 10, x: 52, y: 4 })).doc;
  const fourth = part('four cuts', third).subtract(tool => tool.box({ w: 4, d: 4, h: 10, x: 4, y: 28 })).doc;
  assert.ok(rectangularFeaturePatternProblem({ ...node, parent: { node: fourth.nodes.length - 1, side: 'solid' } }, fourth.nodes, fourth.parameters),
    'the source cannot cross three newer cuts');
  assert.deepEqual(doc, before);
});

test('Linear, Rectangular and Fill can repeat the first cut on the third Difference without changing the original references', async () => {
  const first = part('three cuts').box({ w: 60, d: 40, h: 10 })
    .subtract(tool => tool.box({ w: 4, d: 2, h: 10, x: 8, y: 8 }));
  const second = first.subtract(tool => tool.box({ w: 6, d: 2, h: 10, x: 8, y: 26 }));
  const { doc } = second.subtract(tool => tool.box({ w: 4, d: 2, h: 10, x: 42, y: 8 }));
  const ref = (node: number): BodyRef => ({ node, side: 'solid' });
  const source = ref(first.doc.nodes.length - 1), parent = ref(doc.nodes.length - 1);
  const ctx = { ...context(doc), rectangularCutSource: source };
  const linear = commands.find(command => command.id === 'linear-feature-pattern');
  assert.ok(linear?.build);
  assert.equal(linear.available(ctx).ok, true);
  const values = { axis: 'x', spacing: 16, count: 2 };
  const made = linear.build(ctx, values), node = made.nodes.at(-1);
  assert.ok(node?.kind === 'linear-feature-pattern');
  assert.deepEqual(node.source, source);
  assert.deepEqual(node.parent, parent);
  assert.deepEqual(made.nodes.slice(0, -1), doc.nodes);
  assert.deepEqual(parentsOf(node), [parent.node]);
  assert.deepEqual(usesOf(node), [parent.node, source.node]);
  assert.equal(checkNode(node, doc.nodes, doc.parameters), null);
  const opened = await readStudioFile(encodeStudioFile(made));
  assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, made);
  const geometry = evaluateDoc(opened.doc, 2);
  assert.ok(geometry.ok, geometry.ok ? '' : geometry.error.detail);
  assert.ok(Math.abs(geometry.bodies[0].volume! - (24000 - (8 + 12 + 8 + 8) * 10)) < 1e-8);

  const args = { action: 'command', command: linear.id, expectedRevision: revisionOf(doc),
    bodies: [ctx.bodies[0].key], values: { ...values, source: featureId(doc.nodes, source.node) } };
  const run = (input: typeof args) => dispatchTool({ doc, bodies: ctx.bodies }, 'features', input,
    async next => evaluateDoc(next, 2));
  const result = await run(args);
  assert.equal(result.isError, false, result.content);
  assert.deepEqual(result.state.doc.nodes, made.nodes);
  const refused = await run({ ...args, values: { ...args.values, count: 3 } });
  assert.equal(refused.isError, true, refused.content);
  assert.equal(refused.state.doc, doc);

  const invalid = doc.nodes.map((node, index) => index === second.doc.nodes.length - 1 ? { ...node, held: 'held' } : node);
  assert.ok(priorLinearFeaturePatternProblem(node, invalid, doc.parameters));
  const fourth = part('four cuts', doc).subtract(tool => tool.box({ w: 2, d: 2, h: 10, x: 42, y: 26 })).doc;
  assert.ok(priorLinearFeaturePatternProblem({ ...node, parent: ref(fourth.nodes.length - 1) }, fourth.nodes, fourth.parameters));
  const rectangular = command();
  const gridValues = { ...values, axis2: 'y', spacing2: 8, count2: 2 };
  assert.equal(rectangular.available(ctx).ok, true);
  const grid = rectangular.build!(ctx, gridValues);
  const gridNode = grid.nodes.at(-1);
  assert.ok(gridNode?.kind === 'rectangular-feature-pattern');
  assert.deepEqual(gridNode.source, source);
  assert.deepEqual(gridNode.parent, parent);
  assert.equal(checkNode(gridNode, doc.nodes, doc.parameters), null);
  for (const axis of [{ axis: 'z', count: 1 }, { axis2: 'z', count2: 1 }])
    assert.match(rectangularFeaturePatternProblem({ ...gridNode, ...axis }, doc.nodes, doc.parameters)!, /needs both X and Y/);
  const gridOpened = await readStudioFile(encodeStudioFile(grid));
  assert.ok('doc' in gridOpened);
  assert.deepEqual(gridOpened.doc, grid);
  const gridGeometry = evaluateDoc(gridOpened.doc, 2);
  assert.ok(gridGeometry.ok, gridGeometry.ok ? '' : gridGeometry.error.detail);
  assert.ok(Math.abs(gridGeometry.bodies[0].volume! - (24000 - (8 + 12 + 8 + 3 * 8) * 10)) < 1e-8);
  const gridCommand = await run({ ...args, command: rectangular.id, values: { ...gridValues, source: args.values.source } });
  assert.equal(gridCommand.isError, false, gridCommand.content);
  assert.deepEqual(gridCommand.state.doc.nodes, grid.nodes);

  const points: [number, number][] = [[8, 7], [48, 7], [48, 11], [12, 11], [12, 29], [8, 29]];
  const maskDoc = withNode(doc, { kind: 'sketch', profile: 'loop', segments: points.map(start => ({ kind: 'line', start })) });
  const mask = maskDoc.nodes.length - 1, maskContext = context(maskDoc);
  const fillArgs = { ...args, command: 'fill-feature-pattern', expectedRevision: revisionOf(maskDoc),
    values: { source: args.values.source, region: String(mask), anchorX: 10, anchorY: 9, spacing: 16, count: 2, spacing2: 8, count2: 2 } };
  const fillCall = (overrides: Partial<typeof fillArgs.values> = {}) =>
    dispatchTool({ doc: maskDoc, bodies: maskContext.bodies }, 'features', { ...fillArgs, values: { ...fillArgs.values, ...overrides } },
      async next => evaluateDoc(next, 2));
  const filled = await fillCall();
  assert.equal(filled.isError, false, filled.content);
  const fillDoc = filled.state.doc, fill = fillDoc.nodes.at(-1);
  assert.ok(fill?.kind === 'fill-feature-pattern');
  assert.deepEqual(fill.source, source);
  assert.deepEqual(fill.parent, parent);
  assert.deepEqual(fill.region, { points });
  const fillOpened = await readStudioFile(encodeStudioFile(fillDoc));
  assert.ok('doc' in fillOpened);
  assert.deepEqual(fillOpened.doc, fillDoc);
  const fillResult = evaluateDoc(fillOpened.doc, 2);
  assert.ok(fillResult.ok, fillResult.ok ? '' : fillResult.error.detail);
  assert.ok(Math.abs(fillResult.bodies[0].volume! - 23560) < 1e-8);
  for (const overlap of [{ spacing: 32 }, { spacing2: 18 }]) {
    const denied = await fillCall(overlap);
    assert.equal(denied.isError, true, denied.content);
    assert.equal(denied.state.doc, maskDoc);
  }
});
