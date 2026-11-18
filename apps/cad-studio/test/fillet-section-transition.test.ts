import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { isFilletSectionChange, proveFilletSectionChange } from '../src/state/filletSectionHistory';
function fixture() {
  const base = rectanglePart(40, 30, 10), result = evaluateDoc(base, 1); assert.ok(result.ok); if (!result.ok) throw new Error('parent');
  const bodies = result.bodies, edge = bodies[0].mesh.edges.find(e => e.a[1] === 0 && e.b[1] === 0 && e.a[2] === 10 && e.b[2] === 10)!;
  assert.ok(edge); const name = edge.names[0];
  const before = withNode(base, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [name], radius: 2, sigs: { [name]: toSig(signaturesOf(bodies[0]).edges.get(name)!) } });
  return { before, bodies, name };
}
const patch = (doc: StudioDoc, index: number, change: object): StudioDoc => ({ ...doc, nodes: doc.nodes.map((n, i) => i === index ? { ...n, ...change } as ModelNode : n) });
const conic = (doc: StudioDoc, rho = 0.5) => patch(doc, 2, { section: { kind: 'conic', rho } });
function circular(doc: StudioDoc): StudioDoc { return { ...doc, nodes: doc.nodes.map((n, i) => { if (i !== 2 || n.kind !== 'fillet') return n; const next = { ...n }; delete next.section; return next; }) }; }
test('Circular to Conic and back preserves edge/signature owners and independent native volumes', () => {
  const { before, bodies } = fixture(), next = conic(before), restored = circular(next), saved = structuredClone({ before, next, bodies });
  assert.ok(isFilletSectionChange(before, next, 2)); assert.ok(proveFilletSectionChange(before, next, bodies));
  assert.ok(proveFilletSectionChange(next, restored, bodies));
  for (const [doc, removed] of [[before, 40 * 4 * (1 - Math.PI / 4)], [next, 40 * 4 / 6], [restored, 40 * 4 * (1 - Math.PI / 4)]] as const) {
    const result = evaluateDoc(doc, 2); assert.ok(result.ok, result.ok ? '' : result.error.detail);
    if (result.ok) assert.ok(Math.abs(result.bodies[0].volume! - (12000 - removed)) < 1e-7);
  }
  assert.deepEqual({ before, next, bodies }, saved); assert.deepEqual(restored, before);
  assert.equal(isFilletSectionChange(before, before, 2), false); assert.equal(isFilletSectionChange(before, next, 1), false);
});
test('existing valid Conic coefficient can return to Circular but cannot be reinterpreted as a mode change', () => {
  const { before, bodies } = fixture();
  for (const rho of [0.2, 0.5, 0.8]) { const old = conic(before, rho); assert.ok(proveFilletSectionChange(old, circular(old), bodies)); }
  assert.ok(proveFilletSectionChange(before, conic(before, 0.4), bodies));
  assert.equal(isFilletSectionChange(conic(before), conic(before, 0.4), 2), false);
  assert.equal(isFilletSectionChange(conic(before), patch(before, 2, { section: undefined }), 2), false);
});
test('special or simultaneous changes cannot enter the mode proof', () => {
  const { before, bodies } = fixture();
  for (const [i, change] of [[0, { plane: {} }], [0, { association: {} }], [1, { draft: 1 }], [1, { height: -10 }],
    [2, { radius: { parameter: 'R' } }], [2, { radius: 0 }], [2, { radii: [] }], [2, { held: 'test' }], [2, { made: {} }],
    [2, { section: { kind: 'g2' } }], [2, { section: { kind: 'conic', rho: NaN } }], [2, { section: { kind: 'conic', rho: 1 } }],
    [2, { edges: ['one', 'two'] }], [2, { parent: { node: 0, side: 'solid' } }]] as [number, object][]) {
    const old = patch(before, i, change); assert.equal(isFilletSectionChange(old, conic(old), 2), false, JSON.stringify(change));
  }
  const next = conic(before);
  for (const bad of [patch(next, 2, { radius: 3 }), patch(next, 1, { height: 11 }), { ...next, parameters: { R: 2 } }, patch(next, 2, { sigs: {} })])
    assert.equal(proveFilletSectionChange(before, bad, bodies), false);
});
test('missing/shared/stale signatures and wrong native body/topology cannot approve', () => {
  const { before, bodies, name } = fixture(), f = before.nodes[2]; assert.ok(f.kind === 'fillet'); if (f.kind !== 'fillet') throw new Error('fillet');
  for (const sigs of [{}, { [name]: { ...f.sigs![name], n: 2 } }, { [name]: { ...f.sigs![name], s: 1 } }, { ...f.sigs, other: f.sigs![name] }]) {
    const old = patch(before, 2, { sigs }); assert.equal(proveFilletSectionChange(old, conic(old), bodies), false);
  }
  assert.equal(proveFilletSectionChange(before, conic(before), []), false);
  assert.equal(proveFilletSectionChange(before, conic(before), [{ ...bodies[0], key: 'foreign' }]), false);
  const damaged = structuredClone(bodies); damaged[0].mesh.edges.pop(); assert.equal(proveFilletSectionChange(before, conic(before), damaged), false);
});
test('JSON signed zero normalization preserves an exact native original edge signature', () => {
  const { before } = fixture(), shifted = patch(before, 0, { min: [-1, 0], max: [0.9999998, 30] });
  const result = evaluateDoc(prefixDoc(shifted, 2), 1); assert.ok(result.ok); if (!result.ok) throw new Error('parent');
  const edge = result.bodies[0].mesh.edges.find(e => e.a[1] === 0 && e.b[1] === 0 && e.a[2] === 10 && e.b[2] === 10)!;
  const name = edge.names[0], sig = toSig(signaturesOf(result.bodies[0]).edges.get(name)!); assert.ok(Object.is(sig.p[0], -0));
  const old = JSON.parse(JSON.stringify(patch(shifted, 2, { edges: [name], sigs: { [name]: sig } }))) as StudioDoc;
  assert.ok(proveFilletSectionChange(old, conic(old), result.bodies));
});

import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
import type { EvalResult } from '@barocss/cad-model/engine/evaluate';
type PendingCall = { doc: StudioDoc; revision: number; resolve(reply: EvalResult): void; reject(error: Error): void };
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function historyFixture(source?: StudioDoc, candidate?: StudioDoc) {
  const doc = source ?? fixture().before, next = candidate ?? conic(doc);
  let document = doc, evaluated = doc, scope = {}, open = {}, worker = 1, draft = true, marker: number | null = null, variant: string | null = null, revision = 0;
  const parts: PendingCall[] = [], full: PendingCall[] = [], commits: StudioDoc[] = [];
  const enqueue = (calls: PendingCall[], d: StudioDoc, r: number) => new Promise<EvalResult>((resolve, reject) => calls.push({ doc: d, revision: r, resolve, reject }));
  const apply = createHistoryFeatureApply({ model: { doc, evaluated: doc, editNode: 2, fresh: true, busy: false },
    owner: { document: () => document, evaluated: () => evaluated, scope: () => scope, open: () => open, worker: () => worker, marker: () => marker, variant: () => variant },
    worker: { engine: { part: (d, r) => enqueue(parts, d, r), evaluate: (d, r) => enqueue(full, d, r) }, nextRevision: () => ++revision },
    changes: { canChangeDocument: () => true, commit: d => { commits.push(d); return true; },
      applyRoundedInsetEdit: () => assert.fail('unexpected inset'), stageFeatureCandidate: () => assert.fail('unexpected pattern') } });
  const good = (call: PendingCall) => { const reply = evaluateDoc(call.doc, call.revision); assert.ok(reply.ok); call.resolve(reply); };
  return { doc, next, parts, full, commits, good, apply: (nodes = next.nodes) => apply(nodes, () => draft), invalidate: {
    document: () => { document = { ...doc }; }, evaluated: () => { evaluated = { ...doc }; }, scope: () => { scope = {}; },
    open: () => { open = {}; }, worker: () => { worker++; }, draft: () => { draft = false; }, marker: () => { marker = 0; }, variant: () => { variant = 'other'; },
  } };
}
test('History proves the original parent and commits the unchanged signed Conic candidate once', async () => {
  const f = historyFixture(), saved = structuredClone(f.doc), pending = f.apply();
  assert.equal(f.parts.length, 1); assert.equal(f.full.length, 0); assert.deepEqual(f.parts[0].doc, prefixDoc(f.doc, 2));
  f.good(f.parts[0]); await tick(); assert.equal(f.full.length, 1); assert.equal(f.commits.length, 0);
  assert.deepEqual(f.full[0].doc, f.next);
  const native = evaluateDoc(f.full[0].doc, 123); assert.ok(native.ok);
  if (native.ok) assert.ok(Math.abs(native.bodies[0].volume! - (12000 - 160 / 6)) < 1e-7);
  f.good(f.full[0]); await pending; assert.deepEqual(f.commits, [f.next]); assert.deepEqual(f.doc, saved);
});
test('raw section family change cannot bypass proof with simultaneous changes or unsupported G2', async () => {
  for (const [i, change] of [[2, { radius: 3 }], [1, { height: 11 }], [2, { section: { kind: 'g2' } }], [2, { sigs: {} }]] as [number, object][]) {
    const f = historyFixture(), candidate = patch(f.next, i, change), saved = structuredClone(f.doc);
    const failure = await f.apply(candidate.nodes); assert.ok(failure); assert.equal(failure.title, 'Section not applied');
    assert.equal(f.parts.length, 0); assert.equal(f.full.length, 0); assert.equal(f.commits.length, 0); assert.deepEqual(f.doc, saved);
  }
});
test('existing Conic rho and G2 tension edits retain their ordinary no-prefix path', async () => {
  for (const kind of ['conic', 'g2'] as const) {
    const before = patch(fixture().before, 2, { section: kind === 'conic' ? { kind, rho: 0.4 } : { kind, tension: 0.4 } });
    const next = patch(before, 2, { section: kind === 'conic' ? { kind, rho: 0.6 } : { kind, tension: 0.6 } });
    const f = historyFixture(before, next), saved = structuredClone(before), pending = f.apply();
    assert.equal(f.parts.length, 0); assert.equal(f.full.length, 1); assert.deepEqual(f.full[0].doc, next);
    f.good(f.full[0]); await pending; assert.deepEqual(f.commits, [next]); assert.deepEqual(before, saved);
  }
});
for (const stage of ['prefix', 'full'] as const) for (const key of ['document', 'scope', 'open', 'worker', 'draft', 'evaluated', 'marker', 'variant'] as const) {
  test(`Fillet section ignores stale ${key} after ${stage}`, async () => {
    const f = historyFixture(), pending = f.apply();
    if (stage === 'full') { f.good(f.parts[0]); await tick(); }
    f.invalidate[key](); f.good(stage === 'prefix' ? f.parts[0] : f.full[0]); await pending;
    assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 'prefix' ? 0 : 1);
  });
}
for (const stage of ['prefix', 'full'] as const) test(`Fillet section refuses wrong ${stage} revision`, async () => {
  const f = historyFixture(), pending = f.apply();
  if (stage === 'full') { f.good(f.parts[0]); await tick(); }
  const call = stage === 'prefix' ? f.parts[0] : f.full[0]; call.resolve(evaluateDoc(call.doc, call.revision + 100)); await pending;
  assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 'prefix' ? 0 : 1);
});
for (const bad of ['error', 'throw', 'topology'] as const) test(`Fillet section prefix ${bad} cannot reach full evaluation`, async () => {
  const f = historyFixture(), pending = f.apply(), call = f.parts[0];
  if (bad === 'throw') call.reject(new Error('prefix failed'));
  else if (bad === 'error') call.resolve({ ok: false, revision: call.revision, wallTime: 0, error: { title: 'Refused', hint: 'test', detail: 'test', code: 'VALUE' } });
  else { const reply = evaluateDoc(call.doc, call.revision); assert.ok(reply.ok); if (!reply.ok) throw new Error('prefix'); call.resolve({ ...reply, bodies: [] }); }
  assert.ok(await pending); assert.equal(f.full.length, 0); assert.equal(f.commits.length, 0);
});
test('Fillet full evaluation refusal leaves the accepted section and signatures unchanged', async () => {
  const f = historyFixture(), saved = structuredClone(f.doc), pending = f.apply(); f.good(f.parts[0]); await tick();
  f.full[0].resolve({ ok: false, revision: f.full[0].revision, wallTime: 0, error: { title: 'Geometry refused', hint: 'test', detail: 'test', code: 'VALUE', feature: 'n2' } });
  assert.ok(await pending); assert.equal(f.commits.length, 0); assert.deepEqual(f.doc, saved);
});
