import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { isRectangleFinishHeightResize, proveRectangleFinishResize } from '../src/state/rectangleFinishResize';
function bodies(doc: StudioDoc) { const r = evaluateDoc(prefixDoc(doc, 2), 1); assert.ok(r.ok, r.ok ? '' : r.error.hint); if (!r.ok) throw new Error('prefix'); return r.bodies; }
function change(doc: StudioDoc, height: unknown): StudioDoc { return { ...doc, nodes: doc.nodes.map(n => n.kind === 'extrude' ? { ...n, height } as ModelNode : n) }; }
function fixture(kind: 'fillet' | 'chamfer', oldHeight: unknown = 10) {
 const base = change({ ...rectanglePart(30, 20, 10), parameters: { H: 10, J: 30, K: 10 } }, oldHeight), bs = bodies(base);
 const edge = bs[0].mesh.edges.find(e => e.nativeLine && e.a[2] === 0 && e.b[2] !== 0)!;
 assert.ok(edge); const name = edge.names[0], sigs = { [name]: toSig(signaturesOf(bs[0]).edges.get(name)!) };
 const before = withNode(base, kind === 'fillet' ? { kind, parent: { node: 1, side: 'solid' }, edges: [name], radius: 2, sigs } : { kind, parent: { node: 1, side: 'solid' }, edges: [name], distance: 2, sigs });
 return { before, name, edge };
}
test('numeric and bound Height transitions preserve authored bindings while refreshing native signatures', async () => {
 for (const kind of ['fillet', 'chamfer'] as const) for (const [oldHeight, newHeight, h] of [[10, { parameter: 'J' }, 30], [{ parameter: 'H' }, { parameter: 'J' }, 30], [{ parameter: 'H' }, 30, 30], [10, { parameter: 'H' }, 10], [{ parameter: 'H' }, { parameter: 'K' }, 10]] as const) {
  const { before, name } = fixture(kind, oldHeight), next = change(before, newHeight), snapshot = structuredClone({ before, next });
  assert.equal(isRectangleFinishHeightResize(before, next, 1), true);
  const bs = bodies(next), out = proveRectangleFinishResize(before, next, bodies(before), bs); assert.ok(out);
  assert.equal(out.nodes[1], next.nodes[1]); assert.equal(out.parameters, next.parameters);
  assert.deepEqual(out.nodes, next.nodes.map((n, i) => i === 2 ? { ...n, sigs: { [name]: toSig(signaturesOf(bs[0]).edges.get(name)!) } } : n));
  const result = evaluateDoc(out, 2); assert.ok(result.ok, result.ok ? '' : result.error.hint);
  if (result.ok) assert.ok(Math.abs(result.bodies[0].volume! - (600 * h - h * (kind === 'fillet' ? 4 - Math.PI : 2))) < 1e-7);
  const reopened = await readStudioFile(encodeStudioFile(out)); assert.ok('doc' in reopened); if ('doc' in reopened) assert.deepEqual(reopened.doc, out);
  assert.deepEqual({ before, next }, snapshot);
 }
});
test('invalid binding shapes, values and parameter-table edits cannot enter Height proof', () => {
 const { before } = fixture('fillet');
 for (const value of [{ parameter: 'missing' }, { parameter: 'H', extra: true }, Object.create({ parameter: 'H' }), {}, [], null, NaN, Infinity, 0, -1]) assert.equal(isRectangleFinishHeightResize(before, change(before, value), 1), false);
 for (const value of [NaN, Infinity, 0, -1]) {
  const source = { ...before, parameters: { H: value, J: 30, K: 10 } };
  assert.equal(isRectangleFinishHeightResize(source, change(source, { parameter: 'H' }), 1), false);
 }
 const inherited = { ...before, parameters: Object.create({ H: 10 }) as StudioDoc['parameters'] };
 assert.equal(isRectangleFinishHeightResize(inherited, change(inherited, { parameter: 'H' }), 1), false);
 const next = change(before, { parameter: 'J' });
 assert.equal(isRectangleFinishHeightResize(before, { ...next, parameters: { ...next.parameters, J: 40 } }, 1), false);
 assert.equal(isRectangleFinishHeightResize(before, { ...next, title: 'changed' } as StudioDoc, 1), false);
});
test('combined edits and bound varying laws remain excluded', () => {
 const { before, edge } = fixture('fillet'), next = change(before, { parameter: 'J' });
 for (const [index, patch] of [[0, { max: [40, 20] }], [1, { from: 2 }], [2, { radius: 3 }], [2, { section: { kind: 'conic', rho: 0.5 } }]] as const) {
  const candidate = { ...next, nodes: next.nodes.map((n, i) => i === index ? { ...n, ...patch } as ModelNode : n) };
  assert.equal(isRectangleFinishHeightResize(before, candidate, 1), false);
 }
 const varying = { ...before, nodes: before.nodes.map(n => n.kind === 'fillet' ? { ...n, radii: [{ at: edge.a, radius: 1, atEnd: true as const }, { at: edge.b, radius: 2, atEnd: true as const }] } : n) };
 assert.equal(isRectangleFinishHeightResize(varying, change(varying, { parameter: 'J' }), 1), false);
 assert.equal(isRectangleFinishHeightResize(change(varying, { parameter: 'H' }), change(varying, 30), 1), false);
});
test('bound Height keeps exact signature and whole native topology requirements', () => {
 const { before, name } = fixture('fillet', { parameter: 'H' }), next = change(before, { parameter: 'J' }), old = bodies(before), fresh = bodies(next);
 for (const n of [1, 2]) {
  const alter = (doc: StudioDoc): StudioDoc => ({ ...doc, nodes: doc.nodes.map(node => node.kind === 'fillet' ? { ...node, sigs: { [name]: { ...node.sigs![name], n } } } : node) });
  assert.equal(proveRectangleFinishResize(alter(before), alter(next), old, fresh), null);
 }
 const bad = structuredClone(fresh); bad[0].mesh.edges[0].nativeLine = undefined;
 assert.equal(proveRectangleFinishResize(before, next, old, bad), null);
 const foreign = structuredClone(old); foreign[0].ref = { node: 0, side: 'solid' };
 assert.equal(proveRectangleFinishResize(before, next, foreign, fresh), null);
});

// Exercise the real History coordinator with deferred native replies, not merely its admission helper.
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
import type { EvalResult } from '@barocss/cad-model/engine/evaluate';
type Deferred = { doc: StudioDoc; revision: number; resolve(result: EvalResult): void };
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function coordinator() {
 const { before: doc, name } = fixture('fillet', { parameter: 'H' });
 const nodes = change(doc, { parameter: 'J' }).nodes;
 let document = doc, worker = 1, open = {}, revision = 0;
 const scope = {}, parts: Deferred[] = [], full: Deferred[] = [], commits: StudioDoc[] = [];
 const enqueue = (calls: Deferred[], candidate: StudioDoc, rev: number) => new Promise<EvalResult>(resolve => calls.push({ doc: candidate, revision: rev, resolve }));
 const apply = createHistoryFeatureApply({ model: { doc, evaluated: doc, editNode: 1, fresh: true, busy: false },
  owner: { document: () => document, evaluated: () => doc, scope: () => scope, worker: () => worker, open: () => open, marker: () => null, variant: () => null },
  worker: { engine: { part: (d, r) => enqueue(parts, d, r), evaluate: (d, r) => enqueue(full, d, r) }, nextRevision: () => ++revision },
  changes: { canChangeDocument: () => true, commit: d => { commits.push(d); return true; }, applyRoundedInsetEdit: () => assert.fail('unexpected inset'), stageFeatureCandidate: () => assert.fail('unexpected pattern') } });
 const deliver = (call: Deferred, wrongRevision = false) => { const reply = evaluateDoc(call.doc, call.revision + (wrongRevision ? 100 : 0)); assert.ok(reply.ok, reply.ok ? '' : reply.error.hint); call.resolve(reply); };
 return { doc, nodes, name, parts, full, commits, deliver, apply: () => apply(nodes, () => true), invalidate: {
  document: () => { document = { ...doc }; }, worker: () => { worker++; }, open: () => { open = {}; },
 } };
}
async function reach(f: ReturnType<typeof coordinator>, stage: number) {
 for (let i = 0; i < stage; i++) { assert.equal(f.parts.length, i + 1); f.deliver(f.parts[i]); await tick(); }
}
test('bound Height coordinator proves both parents then evaluates and commits the authored binding exactly once', async () => {
 const f = coordinator(), snapshot = structuredClone(f.doc), pending = f.apply();
 assert.deepEqual(f.parts[0].doc, prefixDoc(f.doc, 2)); assert.equal(f.full.length, 0);
 await reach(f, 1);
 assert.deepEqual(f.parts[1].doc.nodes[1].kind === 'extrude' ? f.parts[1].doc.nodes[1].height : null, { parameter: 'J' });
 assert.equal(f.full.length, 0); f.deliver(f.parts[1]); await tick();
 assert.equal(f.full.length, 1); assert.equal(f.commits.length, 0);
 const candidate = f.full[0].doc, finish = candidate.nodes[2]; assert.ok(finish.kind === 'fillet');
 if (finish.kind !== 'fillet') throw new Error('finish');
 assert.equal(candidate.nodes[1], f.nodes[1]); assert.deepEqual(candidate.parameters, f.doc.parameters);
 assert.deepEqual(candidate.nodes[1].kind === 'extrude' ? candidate.nodes[1].height : null, { parameter: 'J' });
 assert.deepEqual(finish.sigs![f.name], toSig(signaturesOf(bodies(candidate)[0]).edges.get(f.name)!));
 f.deliver(f.full[0]); await pending; assert.deepEqual(f.commits, [candidate]); assert.deepEqual(f.doc, snapshot);
});
for (const stage of [0, 1, 2]) for (const owner of ['document', 'open', 'worker'] as const) test(`bound Height coordinator refuses stale ${owner} at stage ${stage}`, async () => {
 const f = coordinator(), snapshot = structuredClone(f.doc), pending = f.apply(); await reach(f, stage); f.invalidate[owner]();
 f.deliver(stage === 2 ? f.full[0] : f.parts[stage]); await pending;
 assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 2 ? 1 : 0); assert.deepEqual(f.doc, snapshot);
});
for (const stage of [0, 1, 2]) test(`bound Height coordinator refuses mismatched revision at stage ${stage}`, async () => {
 const f = coordinator(), pending = f.apply(); await reach(f, stage);
 f.deliver(stage === 2 ? f.full[0] : f.parts[stage], true); await pending;
 assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 2 ? 1 : 0);
});
