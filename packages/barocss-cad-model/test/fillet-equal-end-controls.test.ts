import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep } from '@barocss/cad';
import { commands, shownFields, type Ctx } from '../src/app/commands';
import { rectanglePart, withNode } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';

const fillet = commands.find(c => c.id === 'fillet')!;
function fixture(hole = false): Ctx {
  const box = rectanglePart(40, 30, 10), doc = hole ? withNode(box, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: [20, 15], radius: 4 }) : box;
  const evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const edge = evaluated.bodies[0].mesh.edges.findIndex(e => hole ? !e.nativeLine && !e.nativeFinishLine : e.names.includes('n1.side0|n1.top'));
  assert.ok(edge >= 0);
  return { doc, bodies: evaluated.bodies, selection: { edges: [{ body: 0, edge }], faces: [], bodies: [] } };
}

test('one supported straight edge exposes Radius controls at zero or equal end radius without changing any draft value', () => {
  const ctx = fixture();
  for (const endRadius of [0, 1, 4, 0]) {
    const values = { ...fillet.defaults!(ctx), radius: 1, endRadius, stationMode: 'ends' }, before = structuredClone(values);
    const fields = shownFields(fillet.fields!(ctx, values), values), mode = fields.find(f => f.key === 'stationMode');
    assert.ok(mode && mode.label === 'Radius controls'); assert.equal(mode.kind, 'choice');
    if (mode.kind === 'choice') assert.ok(mode.options.some(o => o.value === 'interior' && o.label === 'Ends and interior'));
    assert.ok(!fields.some(f => f.key === 'stationAt')); assert.deepEqual(values, before);
  }
});

test('fresh unsupported curved, multi-edge and face selections do not expose interior controls; existing refusal stays', () => {
  const curved = fixture(true), straight = fixture(), values = { ...fillet.defaults!(straight), radius: 1, endRadius: 0, stationMode: 'ends' };
  const multi = { ...straight, selection: { ...straight.selection, edges: [straight.selection.edges[0], { body: 0, edge: straight.selection.edges[0].edge + 1 }] } };
  const face = { ...straight, selection: { edges: [], faces: [{ body: 0, face: 0 }], bodies: [] } };
  for (const ctx of [curved, multi, face]) assert.ok(!shownFields(fillet.fields!(ctx, values), values).some(f => f.key.startsWith('station')));
  const before = structuredClone(curved.doc);
  assert.throws(() => fillet.build!(curved, { ...values, stationMode: 'interior', stationAt: 25, stationRadius: 2 }), /one original straight edge/);
  assert.deepEqual(curved.doc, before);
});

test('equal endpoints with an interior peak keep the existing radii law, strict native validity and native file roundtrip', async () => {
  const ctx = fixture(), values = { ...fillet.defaults!(ctx), radius: 1, endRadius: 0, stationMode: 'interior', stationAt: 25, stationRadius: 2 }, source = structuredClone(ctx.doc);
  const built = fillet.build!(ctx, values), node = built.nodes.at(-1); assert.ok(node?.kind === 'fillet');
  assert.deepEqual(node.radii?.map(p => p.radius), [1, 2, 1]); assert.equal(node.radii?.[1].fraction, 0.25);
  const result = evaluateDoc(built, 1); assert.ok(result.ok);
  assert.ok(result.bodies[0].volume! < 12000);
  const [{ brep }] = partBreps(built); assert.ok(checkBrep(brep, { strict: true }).valid);
  const opened = await readStudioFile(encodeStudioFile(built)); assert.ok('doc' in opened); assert.deepEqual(opened.doc, JSON.parse(JSON.stringify(built)));
  assert.deepEqual(ctx.doc, source);
  const constant = fillet.build!(ctx, { ...values, stationMode: 'ends' }).nodes.at(-1); assert.ok(constant?.kind === 'fillet'); assert.equal(constant.radii, undefined);
});
