import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep } from '@barocss/cad';
import { commands, type Ctx } from '../src/app/commands';
import { editFields, type BindableField } from '../src/app/editFields';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
import { digestOf } from '../src/util/digest';
const command = commands.find(c => c.id === 'fillet')!;
function context(): Ctx {
  const doc = { ...rectanglePart(30, 12, 20), parameters: { StartR: 1, EndR: 1 } }, result = evaluateDoc(doc, 0); assert.ok(result.ok);
  const edge = result.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  return { doc, bodies: result.bodies, selection: { edges: [{ body: 0, edge }], faces: [], bodies: [] } };
}
function build(ctx: Ctx, endRadius: number, radius = 1) {
  return command.build!(ctx, { ...command.defaults!(ctx), radius, endRadius, stationMode: 'ends' });
}
function field(doc: StudioDoc, key: string) {
  const found = editFields(doc.nodes, 2, doc.parameters).find(f => f.key === key); assert.ok(found?.kind === 'number'); return found;
}
function native(doc: StudioDoc) {
  const [{ brep }] = partBreps(doc); assert.ok(checkBrep(brep, { strict: true }).valid); return digestOf(brep);
}
test('explicit equal and near-equal positive endpoints retain both authored radii without tolerance-based mode conversion', () => {
  const ctx = context(), source = structuredClone(ctx.doc);
  for (const end of [1, 1 + 5e-10, 1 - 5e-10, 3]) {
    const doc = build(ctx, end), feature = doc.nodes[2]; assert.ok(feature.kind === 'fillet');
    assert.deepEqual(feature.radii?.map(p => p.radius), [1, end]); assert.ok(feature.radii?.every(p => p.atEnd === true));
    assert.deepEqual(feature.edges, ['n1.side0|n1.top']); assert.deepEqual(feature.parent, { node: 1, side: 'solid' });
    assert.ok(native(doc));
  }
  assert.deepEqual(ctx.doc, source);
});
test('creation1→1 and History1→3→1 have identical editable payload/native result, then permit a one-end change and native Save/Open', async () => {
  const ctx = context(), direct = build(ctx, 1), unequal = build(ctx, 3), edited = { ...unequal, nodes: field(unequal, 'r1').set(unequal.nodes, 1) };
  assert.deepEqual(edited, direct); assert.equal(native(edited), native(direct));
  const result = evaluateDoc(direct, 1); assert.ok(result.ok);
  assert.ok(Math.abs(result.bodies[0].volume! - (7200 - 30 * (1 - Math.PI / 4))) < 1e-7);
  const changed = { ...direct, nodes: field(direct, 'r1').set(direct.nodes, 3) }; assert.deepEqual(changed, unequal); assert.ok(native(changed));
  const opened = await readStudioFile(encodeStudioFile(direct)); assert.ok('doc' in opened);
  assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(direct))); assert.equal(native(opened.doc), native(direct));
});
test('two endpoint parameter references survive editing the other endpoint; working End binding remains native-equivalent', () => {
  const doc = build(context(), 1), end = field(doc, 'r1') as BindableField, nodes = end.bind(doc.nodes, 'EndR'); assert.ok(nodes);
  const endBound = { ...doc, nodes }; assert.equal(end.param(nodes), 'EndR'); assert.equal(native(endBound), native(doc));
  const parameterized: StudioDoc = { ...doc, nodes: doc.nodes.map((node, i) => i === 2 && node.kind === 'fillet' ? {
    ...node, radius: { parameter: 'StartR' }, radii: node.radii!.map((p, k) => ({ ...p, radius: { parameter: k === 0 ? 'StartR' : 'EndR' } })),
  } : node) };
  assert.equal(native(parameterized), native(doc));
  const changedEnd = field(parameterized, 'r1').set(parameterized.nodes, 3)[2]; assert.ok(changedEnd.kind === 'fillet');
  assert.deepEqual(changedEnd.radii?.map(p => p.radius), [{ parameter: 'StartR' }, 3]);
  const changedStart = field(parameterized, 'r').set(parameterized.nodes, 2)[2]; assert.ok(changedStart.kind === 'fillet');
  assert.deepEqual(changedStart.radii?.map(p => p.radius), [2, { parameter: 'EndR' }]);
  assert.deepEqual(changedStart.radius, 2);
});
test('explicit positive endpoints retain the existing open-chain requirement for closed, disconnected and branching picks', () => {
  const ctx = context(), edges = ctx.bodies[0].mesh.edges, selected = ctx.selection.edges[0].edge;
  const top = edges.filter(e => e.names.some(n => n.split('|').includes('n1.top'))).map(e => ({ body: 0, edge: e.index })); assert.equal(top.length, 4);
  const disconnected = [ctx.selection.edges[0], { body: 0, edge: edges.findIndex(e => e.names.includes('n1.bottom|n1.side2')) }]; assert.ok(disconnected[1].edge >= 0);
  const corner = [0, 0, 20], branch = edges.filter(e => [e.a, e.b].some(p => p.every((v, k) => v === corner[k]))).map(e => ({ body: 0, edge: e.index })); assert.equal(branch.length, 3);
  assert.ok(top.some(e => e.edge === selected));
  for (const picked of [top, disconnected, branch]) for (const end of [1, 1 + 5e-10, 3]) {
    const owned = { ...ctx, selection: { ...ctx.selection, edges: picked } };
    assert.throws(() => build(owned, end), /one open chain/);
  }
  const scalar = build({ ...ctx, selection: { ...ctx.selection, edges: top } }, 0).nodes[2]; assert.ok(scalar.kind === 'fillet'); assert.equal(scalar.radii, undefined);
});
test('End0 scalar sentinel remains unchanged; native still refuses invalid start radii', () => {
  const ctx = context(), scalar = build(ctx, 0);
  assert.ok(scalar.nodes[2].kind === 'fillet' && !scalar.nodes[2].radii);
  for (const radius of [0, -1, NaN, Infinity]) assert.equal(evaluateDoc(build(ctx, 1, radius), 1).ok, false);
});

test('negative and nonfinite end radii cannot silently become constant fillets', () => {
  const ctx = context(), original = structuredClone(ctx.doc);
  for (const end of [-2, -Number.MIN_VALUE, NaN, Infinity, -Infinity]) {
    assert.throws(() => build(ctx, end), /end radius of 0 or greater/);
    assert.deepEqual(ctx.doc, original);
  }
  const zero = build(ctx, 0).nodes[2]; assert.ok(zero.kind === 'fillet'); assert.equal(zero.radii, undefined);
  const positive = build(ctx, 2).nodes[2]; assert.ok(positive.kind === 'fillet'); assert.deepEqual(positive.radii?.map(p => p.radius), [1, 2]);
});
