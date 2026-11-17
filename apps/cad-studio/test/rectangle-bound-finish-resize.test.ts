import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { isRectangleFinishResize, isRectangleFinishHeightResize, proveRectangleFinishResize } from '../src/state/rectangleFinishResize';
type Finish = Extract<ModelNode, { kind: 'fillet' | 'chamfer' }>;
function bodies(doc: StudioDoc) { const r = evaluateDoc(prefixDoc(doc, 2), 1); assert.ok(r.ok); if (!r.ok) throw new Error('parent'); return r.bodies; }
function fixture(kind: 'constant' | 'chamfer' | 'mixed' = 'constant') {
  const base = { ...rectanglePart(40, 30, 10), parameters: { R: 2, EndR: 3, D: 2 } }, oldBodies = bodies(base);
  const edge = oldBodies[0].mesh.edges.find(e => e.nativeLine && e.a[2] === 10 && e.b[2] === 10 && e.a[1] === 0 && e.b[1] === 0)!;
  assert.ok(edge); const name = edge.names[0];
  const law = kind === 'chamfer' ? { kind: 'chamfer' as const, distance: { parameter: 'D' } }
    : { kind: 'fillet' as const, radius: { parameter: 'R' }, ...(kind === 'mixed' ? { radii: [
      { at: [...edge.a] as [number, number, number], radius: { parameter: 'R' }, atEnd: true as const },
      { at: edge.a.map((v, i) => (v + edge.b[i]) / 2) as [number, number, number], radius: 2.5, fraction: 0.5 },
      { at: [...edge.b] as [number, number, number], radius: { parameter: 'EndR' }, atEnd: true as const }] } : {}) };
  const before = withNode(base, { ...law, parent: { node: 1, side: 'solid' }, edges: [name], sigs: { [name]: toSig(signaturesOf(oldBodies[0]).edges.get(name)!) } });
  const next: StudioDoc = { ...before, nodes: before.nodes.map(n => n.kind === 'sketch' && n.profile === 'rectangle' ? { ...n, max: [60, 36] } : n) };
  return { before, next, oldBodies, newBodies: bodies(next), name, finish: before.nodes[2] as Finish };
}
function patched(f: ReturnType<typeof fixture>, patch: object, parameters = f.before.parameters) {
  const finish = { ...f.finish, ...patch } as ModelNode;
  return { before: { ...f.before, parameters, nodes: f.before.nodes.map((n, i) => i === 2 ? finish : n) },
    next: { ...f.next, parameters, nodes: f.next.nodes.map((n, i) => i === 2 ? finish : n) } };
}
for (const kind of ['constant', 'chamfer', 'mixed'] as const) test(`Bound ${kind} keeps authored bindings and refreshes only the proven signature`, () => {
  const f = fixture(kind), snapshot = structuredClone([f.before, f.next]);
  assert.equal(isRectangleFinishResize(f.before, f.next, 1), true);
  const out = proveRectangleFinishResize(f.before, f.next, f.oldBodies, f.newBodies); assert.ok(out);
  assert.equal(out.parameters, f.before.parameters); assert.equal(out.nodes[0], f.next.nodes[0]); assert.equal(out.nodes[1], f.next.nodes[1]);
  const finish = out.nodes[2] as Finish;
  assert.deepEqual(finish, { ...f.finish, sigs: { ...f.finish.sigs, [f.name]: toSig(signaturesOf(f.newBodies[0]).edges.get(f.name)!) } });
  assert.equal(finish.edges, f.finish.edges);
  if (finish.kind === 'chamfer' && f.finish.kind === 'chamfer') assert.equal(finish.distance, f.finish.distance);
  if (finish.kind === 'fillet' && f.finish.kind === 'fillet') { assert.equal(finish.radius, f.finish.radius); assert.equal(finish.radii, f.finish.radii); }
  const r = evaluateDoc(out, 2); assert.ok(r.ok, r.ok ? '' : r.error.hint);
  const numeric = { ...out, nodes: out.nodes.map(n => n.kind === 'chamfer' ? { ...n, distance: 2 } : n.kind === 'fillet' ? { ...n, radius: 2, ...(n.radii ? { radii: n.radii.map(p => ({ ...p, radius: typeof p.radius === 'number' ? p.radius : out.parameters[p.radius.parameter] })) } : {}) } : n) };
  const expected = evaluateDoc(numeric, 3); assert.ok(expected.ok); if (r.ok && expected.ok) {
    assert.ok(Math.abs(r.bodies[0].volume! - expected.bodies[0].volume!) < 1e-8);
    assert.deepEqual(r.bodies[0].mesh.positions, expected.bodies[0].mesh.positions);
    if (kind !== 'mixed') assert.ok(Math.abs(r.bodies[0].volume! - (60 * 36 * 10 - 60 * (kind === 'chamfer' ? 2 : 4 - Math.PI))) < 1e-8);
  }
  assert.deepEqual([f.before, f.next], snapshot);
});
test('Bound dimensions reject missing, inherited, malformed and non-positive values', () => {
  for (const kind of ['constant', 'chamfer', 'mixed'] as const) {
    const f = fixture(kind), key = kind === 'chamfer' ? 'distance' : 'radius';
    for (const dim of [null, [], {}, { parameter: 'Missing' }, { parameter: 2 }, { parameter: 'R', extra: 1 }, Object.create({ parameter: 'R' }), NaN, Infinity, 0, -1]) {
      const p = patched(f, { [key]: dim }); assert.equal(isRectangleFinishResize(p.before, p.next, 1), false);
    }
    for (const value of [NaN, Infinity, -Infinity, 0, -1, '2']) {
      const params = { ...f.before.parameters, R: value, D: value } as StudioDoc['parameters'];
      const p = patched(f, {}, params); assert.equal(isRectangleFinishResize(p.before, p.next, 1), false);
    }
    const p = patched(f, {}, Object.create(f.before.parameters) as StudioDoc['parameters']);
    assert.equal(isRectangleFinishResize(p.before, p.next, 1), false);
  }
});
test('Every varying radius binding is validated without flattening its law', () => {
  const f = fixture('mixed'); assert.ok(f.finish.kind === 'fillet' && f.finish.radii);
  if (f.finish.kind !== 'fillet' || !f.finish.radii) throw new Error('law');
  for (let i = 0; i < 3; i++) for (const radius of [{ parameter: 'Missing' }, { parameter: 'R', extra: 1 }, 0, NaN]) {
    const p = patched(f, { radii: f.finish.radii.map((v, j) => j === i ? { ...v, radius } : v) });
    assert.equal(isRectangleFinishResize(p.before, p.next, 1), false);
  }
});
test('Changing parameters or a finish binding is not a size-only edit', () => {
  const f = fixture();
  for (const parameters of [{ ...f.before.parameters, R: 3 }, { ...f.before.parameters, Unused: 1 }]) {
    assert.equal(isRectangleFinishResize(f.before, { ...f.next, parameters }, 1), false);
  }
  const p = patched(f, { radius: { parameter: 'EndR' } });
  assert.equal(isRectangleFinishResize(f.before, p.next, 1), false);
});
test('Bound height and combined height/width edits remain excluded', () => {
  for (const kind of ['constant', 'chamfer', 'mixed'] as const) {
    const f = fixture(kind);
    for (const source of [f.before, f.next]) {
      const next = { ...source, nodes: source.nodes.map(n => n.kind === 'extrude' ? { ...n, height: 30 } : n) };
      assert.equal(isRectangleFinishHeightResize(f.before, next, 1), false);
      assert.equal(isRectangleFinishResize(f.before, next, 1), false);
    }
  }
});
test('Bound dimensions do not weaken topology or exact prior signature guards', () => {
  const f = fixture(), corrupt = structuredClone(f.newBodies); corrupt[0].mesh.edges[0].nativeLine = undefined;
  assert.equal(proveRectangleFinishResize(f.before, f.next, f.oldBodies, corrupt), null);
  const p = patched(f, { sigs: { [f.name]: { ...f.finish.sigs![f.name], s: 999 } } });
  assert.equal(proveRectangleFinishResize(p.before, p.next, f.oldBodies, f.newBodies), null);
  for (const patch of [{ held: 'missing' }, { suppressed: true }, { section: { kind: 'g2' } }, { edges: [f.name, 'other'] }]) {
    const p = patched(f, patch); assert.equal(isRectangleFinishResize(p.before, p.next, 1), false);
  }
});
