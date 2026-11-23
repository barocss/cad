import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep } from '@barocss/cad';
import { part } from '../src/api';
import { commands, type Ctx } from '../src/app/commands';
import { checkNode, deleteFeature, featureDependents, renumber } from '../src/chat/features';
import { moveNode } from '../src/chat/remap';
import { dispatchTool } from '../src/chat/tools';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { leafBodies, parentsOf, rectangularFeaturePatternProblem, rectangularPatternDocumentProblem, usesOf, type BodyRef, type ModelNode, type StudioDoc } from '../src/engine/doc';
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

test('omitted source and an explicit current intent keep legacy node bytes and other cut-pattern commands unchanged', () => {
  const first = part('legacy').box({ w: 60, d: 40, h: 10 }).subtract(tool => tool.box({ w: 4, d: 4, h: 10, x: 8, y: 8 }));
  const ctx = context(first.doc), cmd = command(), parent = { node: first.doc.nodes.length - 1, side: 'solid' as const };
  const legacy = cmd.build!(ctx, { ...values }), current = cmd.build!({ ...ctx, rectangularCutSource: parent }, { ...values });
  assert.deepEqual(current, legacy); assert.equal(Object.hasOwn(legacy.nodes.at(-1)!, 'source'), false);
  const feature = toPartDocument(legacy).features.at(-1); assert.ok(feature?.kind === 'rectangular-feature-pattern');
  assert.equal(Object.hasOwn(feature, 'source'), false);
  const linear = commands.find(command => command.id === 'linear-feature-pattern'); assert.ok(linear?.build);
  assert.deepEqual(linear.build(ctx, { axis: 'x', spacing: 16, count: 3 }),
    linear.build({ ...ctx, rectangularCutSource: { node: 999, side: 'negative' } }, { axis: 'x', spacing: 16, count: 3 }));
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
  assert.ok(rectangularFeaturePatternProblem({ ...node, parent: { node: third.nodes.length - 1, side: 'solid' } }, third.nodes, third.parameters),
    'a more distant ancestor is not the kernel direct-source contract');
  assert.deepEqual(doc, before);
});
