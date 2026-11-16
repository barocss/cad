import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { commands, type Ctx } from '@barocss/cad-model/app/commands';
import { refusal } from '@barocss/cad-model/engine/refusal';
import { commandBuildFailure } from '../src/state/commandBuildFailure';

const message = 'An interior radius needs one original straight edge.';
function context(): Ctx {
  const doc = rectanglePart(40, 30, 10), result = evaluateDoc(doc, 1); assert.ok(result.ok);
  const edges = result.bodies[0].mesh.edges.filter(e => e.nativeLine && e.names.length === 1).slice(0, 2);
  assert.equal(edges.length, 2);
  return { doc, bodies: result.bodies, selection: { bodies: [], faces: [], edges: edges.map(e => ({ body: 0, edge: e.index })) } };
}
test('actual multi-edge interior refusal offers existing removal without changing input', () => {
  const ctx = context(), saved = structuredClone(ctx), cmd = commands.find(c => c.id === 'fillet')!;
  const values = { radius: 1, endRadius: 2, stationMode: 'two-interior', stationAt: 25, stationRadius: 1.5, station2At: 75, station2Radius: 1.75, shape: 'circular' };
  const original = { ...values };
  assert.throws(() => cmd.build!(ctx, values), cause => {
    const error = commandBuildFailure('fillet', cause, ctx);
    assert.equal(error.title, 'An interior radius needs one original straight edge');
    assert.match(error.hint, /2 edges are picked.*Edit picked edges.*one original straight edge/);
    assert.equal(error.code, 'FILLET_CHAIN'); assert.equal(error.detail, `[FILLET_CHAIN] ${message}`);
    return true;
  });
  assert.deepEqual(ctx, saved); assert.deepEqual(values, original);
  const one = { ...ctx, selection: { ...ctx.selection, edges: ctx.selection.edges.slice(0, 1) } };
  const built = cmd.build!(one, values), last = built.nodes.at(-1);
  assert.ok(last?.kind === 'fillet'); assert.equal(last.radii?.length, 4);
});
test('other errors, commands and non-removable or stale picks keep the original fallback', () => {
  const ctx = context(), cause = refusal('FILLET_CHAIN', message);
  const legacy = (command: string, error: unknown, current?: Ctx) => assert.deepEqual(commandBuildFailure(command, error, current), { title: 'Invalid input', hint: String(error), detail: '' });
  legacy('edit', cause, ctx); legacy('face-fillet', cause, ctx); legacy('fillet', new Error(cause.message), ctx);
  legacy('fillet', refusal('VALUE', message), ctx); legacy('fillet', refusal('FILLET_CHAIN', message + ' extra'), ctx);
  legacy('fillet', cause);
  for (const edges of [[], ctx.selection.edges.slice(0, 1), [ctx.selection.edges[0], ctx.selection.edges[0]], [{ body: 0, edge: 999 }, ctx.selection.edges[0]], [{ body: 1, edge: 0 }, ctx.selection.edges[0]]])
    legacy('fillet', cause, { ...ctx, selection: { ...ctx.selection, edges } });
  legacy('fillet', cause, { ...ctx, selection: { ...ctx.selection, faces: [{ body: 0, face: 0 }] } });
  legacy('fillet', cause, { ...ctx, bodies: ctx.bodies.map(b => ({ ...b, key: 'stale' })) });
  const first = ctx.selection.edges[0].edge;
  legacy('fillet', cause, { ...ctx, bodies: ctx.bodies.map(b => ({ ...b, mesh: { ...b.mesh, edges: b.mesh.edges.map((e, i) => i === first ? { ...e, names: [] } : e) } })) });
});
