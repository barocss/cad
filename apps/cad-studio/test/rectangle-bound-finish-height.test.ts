import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
import type { EvalResult } from '@barocss/cad-model/engine/evaluate';
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
  const next: StudioDoc = { ...before, nodes: before.nodes.map(n => n.kind === 'extrude' ? { ...n, height: 30 } : n) };
  return { before, next, oldBodies, newBodies: bodies(next), name, finish: before.nodes[2] as Finish };
}
function patched(f: ReturnType<typeof fixture>, patch: object, parameters = f.before.parameters) {
  const finish = { ...f.finish, ...patch } as ModelNode;
  return { before: { ...f.before, parameters, nodes: f.before.nodes.map((n, i) => i === 2 ? finish : n) },
    next: { ...f.next, parameters, nodes: f.next.nodes.map((n, i) => i === 2 ? finish : n) } };
}
for (const kind of ['constant', 'chamfer'] as const) test(`Height with bound ${kind} keeps authored bindings and refreshes only the proven signature`, () => {
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
    assert.ok(Math.abs(r.bodies[0].volume! - (40 * 30 * 30 - 40 * (kind === 'chamfer' ? 2 : 4 - Math.PI))) < 1e-8);
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
test('Changing parameters or a finish binding is not a size-only edit', () => {
  const f = fixture();
  for (const parameters of [{ ...f.before.parameters, R: 3 }, { ...f.before.parameters, Unused: 1 }]) {
    assert.equal(isRectangleFinishResize(f.before, { ...f.next, parameters }, 1), false);
  }
  const p = patched(f, { radius: { parameter: 'EndR' } });
  assert.equal(isRectangleFinishResize(f.before, p.next, 1), false);
});
test('Height still refuses bound extrusion height, simultaneous width changes and varying endpoint laws', () => {
  for (const kind of ['constant', 'chamfer'] as const) {
    const f = fixture(kind);
    assert.equal(isRectangleFinishHeightResize(f.before, f.next, 1), true);
    const changedWidth = { ...f.next, nodes: f.next.nodes.map(n => n.kind === 'sketch' && n.profile === 'rectangle' ? { ...n, max: [60, 30] as [number, number] } : n) };
    assert.equal(isRectangleFinishResize(f.before, changedWidth, 1), false);
    const bound = (d: StudioDoc) => ({ ...d, parameters: { ...d.parameters, H: 10 }, nodes: d.nodes.map(n => n.kind === 'extrude' ? { ...n, height: { parameter: 'H' } } : n) });
    assert.equal(isRectangleFinishHeightResize(bound(f.before), f.next, 1), false);
    assert.equal(isRectangleFinishHeightResize(f.before, bound(f.next), 1), false);
  }
  const mixed = fixture('mixed');
  assert.equal(isRectangleFinishHeightResize(mixed.before, mixed.next, 1), false);
  assert.equal(proveRectangleFinishResize(mixed.before, mixed.next, mixed.oldBodies, mixed.newBodies), null);
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

test('Height proof refuses foreign body owner, duplicate body and damaged native topology', () => {
  const f = fixture();
  for (const side of ['old', 'new'] as const) {
    const original = side === 'old' ? f.oldBodies : f.newBodies;
    for (const damage of [
      (b: typeof original) => { b[0].key = 'foreign'; },
      (b: typeof original) => { b[0].ref = { node: 0, side: 'solid' }; },
      (b: typeof original) => { b[0].mesh.edges.pop(); },
      (b: typeof original) => { b[0].mesh.faces[0].nativeAxisPlane = undefined; },
      (b: typeof original) => { b.push(b[0]); },
    ]) {
      const bad = structuredClone(original); damage(bad);
      assert.equal(proveRectangleFinishResize(f.before, f.next, side === 'old' ? bad : f.oldBodies, side === 'new' ? bad : f.newBodies), null);
    }
  }
});

const base = { ...rectanglePart(40, 30, 10), parameters: { R: 2 } };
const parent = evaluateDoc(base, 0);
assert.ok(parent.ok);
if (!parent.ok) throw new Error('fixture parent');
const edge = parent.bodies[0].mesh.edges.find(e => e.nativeLine && e.a[2] === 10 && e.b[2] === 10 && e.a[1] === 0 && e.b[1] === 0)!;
assert.ok(edge);
const name = edge.names[0];
const source = withNode(base, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [name], radius: { parameter: 'R' },
  sigs: { [name]: toSig(signaturesOf(parent.bodies[0]).edges.get(name)!) } });
type Call = { doc: StudioDoc; revision: number; resolve(value: EvalResult): void; reject(error: Error): void };
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function ownerFixture() {
  const doc = structuredClone(source), nodes = doc.nodes.map(n => n.kind === 'extrude' ? { ...n, height: 30 } : n);
  let document = doc, evaluated = doc, scope = {}, worker = 1, open = {}, draft = true, marker: number | null = null, variant: string | null = null;
  let revision = 0;
  const parts: Call[] = [], full: Call[] = [], commits: StudioDoc[] = [];
  const enqueue = (calls: Call[], candidate: StudioDoc, r: number) => new Promise<EvalResult>((resolve, reject) => calls.push({ doc: candidate, revision: r, resolve, reject }));
  const apply = createHistoryFeatureApply({ model: { doc, evaluated: doc, editNode: 1, fresh: true, busy: false },
    owner: { document: () => document, evaluated: () => evaluated, scope: () => scope, worker: () => worker, open: () => open, marker: () => marker, variant: () => variant },
    worker: { engine: { part: (d, r) => enqueue(parts, d, r), evaluate: (d, r) => enqueue(full, d, r) }, nextRevision: () => ++revision },
    changes: { canChangeDocument: () => true, commit: d => { commits.push(d); return true; },
      applyRoundedInsetEdit: () => assert.fail('unexpected inset'), stageFeatureCandidate: () => assert.fail('unexpected pattern') } });
  const good = (call: Call) => { const reply = evaluateDoc(call.doc, call.revision); assert.ok(reply.ok); call.resolve(reply); };
  return { doc, nodes, parts, full, commits, good, apply: () => apply(nodes, () => draft), invalidate: {
    document: () => { document = { ...doc }; }, scope: () => { scope = {}; }, worker: () => { worker++; }, open: () => { open = {}; }, draft: () => { draft = false; },
    evaluated: () => { evaluated = { ...doc }; }, marker: () => { marker = 0; }, variant: () => { variant = 'other'; } } };
}
async function advance(f: ReturnType<typeof ownerFixture>, stage: number) {
  for (let i = 0; i < stage; i++) { assert.equal(f.parts.length, i + 1); f.good(f.parts[i]); await tick(); }
}

test('Bound Height evaluates the signature-refreshed candidate only after both native parent proofs and commits once', async () => {
  const f = ownerFixture(), snapshot = structuredClone(f.doc), pending = f.apply();
  assert.equal(f.full.length, 0); assert.deepEqual(f.parts[0].doc, prefixDoc(f.doc, 2));
  await advance(f, 2); assert.equal(f.full.length, 1); assert.equal(f.commits.length, 0);
  const candidate = f.full[0].doc, finish = candidate.nodes[2]; assert.ok(finish.kind === 'fillet');
  if (finish.kind !== 'fillet') throw new Error('finish');
  const actual = evaluateDoc(prefixDoc(candidate, 2), 100); assert.ok(actual.ok);
  if (!actual.ok) throw new Error('new parent');
  assert.deepEqual(finish.sigs![name], toSig(signaturesOf(actual.bodies[0]).edges.get(name)!));
  assert.deepEqual(finish.sigs![name].p, [20, 0, 30]);
  assert.deepEqual(candidate.nodes, f.nodes.map((n, i) => i === 2 ? { ...n, sigs: finish.sigs } : n));
  f.good(f.full[0]); await pending; assert.deepEqual(f.commits, [candidate]); assert.deepEqual(f.doc, snapshot); assert.deepEqual(finish.radius, { parameter: 'R' }); assert.deepEqual(candidate.parameters, { R: 2 });
});
for (const stage of [0, 1, 2]) for (const owner of ['document', 'scope', 'worker', 'open', 'draft', 'evaluated', 'marker', 'variant'] as const) {
  test(`Bound Height ignores stale ${owner} at async stage ${stage}`, async () => {
    const f = ownerFixture(), pending = f.apply(); await advance(f, stage); f.invalidate[owner]();
    f.good(stage === 2 ? f.full[0] : f.parts[stage]); await pending;
    assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 2 ? 1 : 0); assert.equal(f.parts.length, Math.min(stage + 1, 2));
  });
}
