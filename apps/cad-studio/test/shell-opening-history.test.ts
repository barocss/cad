import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { isShellOpeningChange, proveShellOpeningChange } from '../src/state/shellOpeningHistory';
function fixture(mode: 'closed' | 'top' | 'bottom' = 'top') {
  const base = rectanglePart(40, 30, 10), evaluated = evaluateDoc(base, 1);
  assert.ok(evaluated.ok); if (!evaluated.ok) throw new Error('parent');
  const bodies = evaluated.bodies, open = mode === 'closed' ? [] : [`n1.${mode}`];
  const sigs = Object.fromEntries(open.map(name => [name, toSig(signaturesOf(bodies[0], 'plane').faces.get(name)!)]));
  return { before: withNode(base, { kind: 'shell', parent: { node: 1, side: 'solid' }, thickness: 2, open, sigs }), bodies };
}
const mode = (doc: StudioDoc, value: string): StudioDoc => ({ ...doc, nodes: doc.nodes.map((n, i) => i === 2 ? { ...n, open: value === 'closed' ? [] : [`n1.${value}`] } as ModelNode : n) });
const patch = (doc: StudioDoc, i: number, change: object): StudioDoc => ({ ...doc, nodes: doc.nodes.map((n, j) => i === j ? { ...n, ...change } as ModelNode : n) });
test('all six opening transitions prove the whole native parent, replace only signatures and preserve originals', () => {
  for (const from of ['closed', 'top', 'bottom'] as const) for (const to of ['closed', 'top', 'bottom'] as const) {
    const { before, bodies } = fixture(from), next = mode(before, to), saved = structuredClone({ before, next, bodies });
    assert.equal(isShellOpeningChange(before, next, 2), from !== to);
    const result = proveShellOpeningChange(before, next, bodies);
    if (from === to) { assert.equal(result, null); continue; }
    assert.ok(result); assert.equal(result.nodes[0], before.nodes[0]); assert.equal(result.nodes[1], before.nodes[1]);
    const sh = result.nodes[2]; assert.ok(sh.kind === 'shell'); if (sh.kind !== 'shell') throw new Error('shell');
    assert.deepEqual(Object.keys(sh.sigs ?? {}), sh.open);
    const actual = evaluateDoc(result, 2); assert.ok(actual.ok, actual.ok ? '' : actual.error.detail);
    if (actual.ok) assert.ok(Math.abs(actual.bodies[0].volume! - (12000 - 36 * 26 * (to === 'closed' ? 6 : 8))) < 1e-7);
    assert.deepEqual({ before, next, bodies }, saved);
  }
});
test('changed metadata, thickness, upstream geometry or parameter tables cannot use opening proof', () => {
  const { before, bodies } = fixture(), next = mode(before, 'bottom');
  for (const bad of [patch(next, 0, { max: [41, 30] }), patch(next, 1, { height: 11 }), patch(next, 2, { thickness: 3 }),
    patch(next, 2, { sigs: {} }), { ...next, parameters: { P: 1 } }]) {
    assert.equal(isShellOpeningChange(before, bad, 2), false); assert.equal(proveShellOpeningChange(before, bad, bodies), null);
  }
  assert.equal(isShellOpeningChange(before, next, 1), false);
});
test('nonplain documents, bound values, foreign parents and ambiguous openings refuse', () => {
  const { before, bodies } = fixture();
  for (const [i, change] of [[0, { plane: {} }], [0, { association: {} }], [0, { held: 'test' }], [1, { height: { parameter: 'H' } }],
    [1, { draft: 1 }], [1, { height: -10 }], [2, { thickness: { parameter: 'T' } }], [2, { held: 'test' }],
    [2, { made: {} }], [2, { suppressed: true }], [2, { parent: { node: 0, side: 'solid' } }],
    [2, { open: ['n1.top', 'n1.bottom'] }], [2, { open: ['n1.side0'] }]] as [number, object][]) {
    const old = patch(before, i, change), next = mode(old, 'bottom');
    assert.equal(isShellOpeningChange(old, next, 2), false, JSON.stringify(change));
    assert.equal(proveShellOpeningChange(old, next, bodies), null);
  }
  for (const old of [{ ...before, direct: {} } as StudioDoc, { ...before, nodes: [...before.nodes, before.nodes[0]] }])
    assert.equal(isShellOpeningChange(old, mode(old, 'bottom'), 2), false);
});
test('missing, stale, shared and extraneous old signatures are not repaired implicitly', () => {
  const { before, bodies } = fixture(), sh = before.nodes[2]; assert.ok(sh.kind === 'shell');
  if (sh.kind !== 'shell') throw new Error('shell');
  for (const sigs of [{}, { ...sh.sigs, 'n1.top': { ...sh.sigs!['n1.top'], s: 1 } },
    { ...sh.sigs, 'n1.top': { ...sh.sigs!['n1.top'], n: 2 } }, { ...sh.sigs, unrelated: sh.sigs!['n1.top'] }]) {
    const old = patch(before, 2, { sigs }); assert.equal(proveShellOpeningChange(old, mode(old, 'bottom'), bodies), null);
  }
});
test('foreign body identity, damaged incidence and wrong cap geometry refuse without mutation', () => {
  const { before, bodies } = fixture(), next = mode(before, 'bottom');
  const variants = [[], [bodies[0], bodies[0]], [{ ...bodies[0], key: 'foreign' }], [{ ...bodies[0], ref: { node: 0, side: 'solid' as const } }]];
  for (const bad of variants) assert.equal(proveShellOpeningChange(before, next, bad), null);
  for (const damage of ['edge', 'name', 'area', 'centroid', 'normal']) {
    const bad = structuredClone(bodies), top = bad[0].mesh.faces.find(f => f.name === 'n1.top')!;
    if (damage === 'edge') bad[0].mesh.edges.pop();
    if (damage === 'name') top.nativePlaneName = 'foreign.top';
    if (damage === 'area') top.area += 1;
    if (damage === 'centroid') top.centroid[2] += 1;
    if (damage === 'normal' && top.exact?.kind === 'plane') top.exact.n[2] = -1;
    const copy = structuredClone(bad); assert.equal(proveShellOpeningChange(before, next, bad), null, damage); assert.deepEqual(bad, copy);
  }
});
test('offset prism cap signatures come from its actual parent prefix, not an assumed zero base', () => {
  const { before } = fixture('closed'), old = patch(before, 1, { from: 7 });
  const reply = evaluateDoc(prefixDoc(old, 2), 1); assert.ok(reply.ok); if (!reply.ok) throw new Error('prefix');
  const result = proveShellOpeningChange(old, mode(old, 'top'), reply.bodies); assert.ok(result);
  const sh = result.nodes[2]; assert.ok(sh.kind === 'shell'); if (sh.kind !== 'shell') throw new Error('shell');
  assert.equal(sh.sigs!['n1.top'].p[2], 17);
});

// Exercise the real History boundary with delayed worker replies and native prefix payloads.
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
import type { EvalResult } from '@barocss/cad-model/engine/evaluate';
type PendingCall = { doc: StudioDoc; revision: number; resolve(reply: EvalResult): void; reject(error: Error): void };
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function historyFixture() {
  const { before: doc } = fixture(), next = mode(doc, 'bottom');
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
test('History proves the prefix and evaluates the newly signed opening before one commit', async () => {
  const f = historyFixture(), saved = structuredClone(f.doc), pending = f.apply();
  assert.equal(f.parts.length, 1); assert.equal(f.full.length, 0); assert.deepEqual(f.parts[0].doc, prefixDoc(f.doc, 2));
  f.good(f.parts[0]); await tick(); assert.equal(f.full.length, 1); assert.equal(f.commits.length, 0);
  const candidate = f.full[0].doc, shell = candidate.nodes[2]; assert.ok(shell.kind === 'shell');
  if (shell.kind !== 'shell') throw new Error('shell');
  assert.deepEqual(shell.open, ['n1.bottom']); assert.deepEqual(Object.keys(shell.sigs!), ['n1.bottom']);
  const native = evaluateDoc(candidate, 123); assert.ok(native.ok);
  if (native.ok) assert.ok(Math.abs(native.bodies[0].volume! - 4512) < 1e-7);
  f.good(f.full[0]); await pending; assert.deepEqual(f.commits, [candidate]); assert.deepEqual(f.doc, saved);
});
test('raw opening change cannot bypass proof through simultaneous or ineligible edits', async () => {
  for (const [i, change] of [[2, { thickness: 3 }], [1, { height: 11 }], [2, { open: ['n1.side0'] }], [2, { sigs: {} }]] as [number, object][]) {
    const f = historyFixture(), candidate = patch(f.next, i, change), saved = structuredClone(f.doc);
    const failure = await f.apply(candidate.nodes); assert.ok(failure); assert.equal(failure.title, 'Opening not applied');
    assert.equal(f.parts.length, 0); assert.equal(f.full.length, 0); assert.equal(f.commits.length, 0); assert.deepEqual(f.doc, saved);
  }
});
for (const stage of ['prefix', 'full'] as const) for (const key of ['document', 'scope', 'open', 'worker', 'draft', 'evaluated', 'marker', 'variant'] as const) {
  test(`Shell opening ignores stale ${key} after ${stage}`, async () => {
    const f = historyFixture(), pending = f.apply();
    if (stage === 'full') { f.good(f.parts[0]); await tick(); }
    f.invalidate[key](); f.good(stage === 'prefix' ? f.parts[0] : f.full[0]); await pending;
    assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 'prefix' ? 0 : 1);
  });
}
for (const stage of ['prefix', 'full'] as const) test(`Shell opening refuses wrong ${stage} revision`, async () => {
  const f = historyFixture(), pending = f.apply();
  if (stage === 'full') { f.good(f.parts[0]); await tick(); }
  const call = stage === 'prefix' ? f.parts[0] : f.full[0]; call.resolve(evaluateDoc(call.doc, call.revision + 100)); await pending;
  assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 'prefix' ? 0 : 1);
});
for (const bad of ['error', 'throw', 'topology'] as const) test(`Shell opening prefix ${bad} cannot reach full evaluation`, async () => {
  const f = historyFixture(), pending = f.apply(), call = f.parts[0];
  if (bad === 'throw') call.reject(new Error('prefix failed'));
  else if (bad === 'error') call.resolve({ ok: false, revision: call.revision, wallTime: 0, error: { title: 'Refused', hint: 'test', detail: 'test', code: 'VALUE' } });
  else { const reply = evaluateDoc(call.doc, call.revision); assert.ok(reply.ok); if (!reply.ok) throw new Error('prefix'); call.resolve({ ...reply, bodies: [] }); }
  assert.ok(await pending); assert.equal(f.full.length, 0); assert.equal(f.commits.length, 0);
});
test('Shell full evaluation failure preserves accepted geometry and references', async () => {
  const f = historyFixture(), saved = structuredClone(f.doc), pending = f.apply(); f.good(f.parts[0]); await tick();
  f.full[0].resolve({ ok: false, revision: f.full[0].revision, wallTime: 0, error: { title: 'Geometry refused', hint: 'test', detail: 'test', code: 'VALUE', feature: 'n2' } });
  assert.ok(await pending); assert.equal(f.commits.length, 0); assert.deepEqual(f.doc, saved);
});
test('JSON signed-zero normalization does not invalidate an unchanged native cap signature', () => {
  const { before } = fixture('closed');
  const tiny = patch(before, 0, { min: [-1, 0], max: [0.9999998, 30] });
  const reply = evaluateDoc(prefixDoc(tiny, 2), 1); assert.ok(reply.ok); if (!reply.ok) throw new Error('prefix');
  const sig = toSig(signaturesOf(reply.bodies[0], 'plane').faces.get('n1.top')!);
  assert.ok(Object.is(sig.p[0], -0), 'fixture must exercise actual native -0 rounding');
  const original = patch(tiny, 2, { open: ['n1.top'], sigs: { 'n1.top': sig } });
  const reopened = JSON.parse(JSON.stringify(original)) as StudioDoc, sh = reopened.nodes[2];
  assert.ok(sh.kind === 'shell'); if (sh.kind !== 'shell') throw new Error('shell');
  assert.ok(Object.is(sh.sigs!['n1.top'].p[0], 0));
  assert.ok(proveShellOpeningChange(reopened, mode(reopened, 'bottom'), reply.bodies));
});
