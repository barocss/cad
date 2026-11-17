import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, type EvalResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';

const base = rectanglePart(40, 30, 10);
const parent = evaluateDoc(base, 0);
assert.ok(parent.ok);
if (!parent.ok) throw new Error('fixture parent');
const edge = parent.bodies[0].mesh.edges.find(e => e.nativeLine && e.a[2] === 10 && e.b[2] === 10 && e.a[1] === 0 && e.b[1] === 0)!;
assert.ok(edge);
const name = edge.names[0];
const source = withNode(base, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [name], radius: 2,
  sigs: { [name]: toSig(signaturesOf(parent.bodies[0]).edges.get(name)!) } });
type Call = { doc: StudioDoc; revision: number; resolve(value: EvalResult): void; reject(error: Error): void };
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function fixture() {
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
async function advance(f: ReturnType<typeof fixture>, stage: number) {
  for (let i = 0; i < stage; i++) { assert.equal(f.parts.length, i + 1); f.good(f.parts[i]); await tick(); }
}
const failure = (revision: number): EvalResult => ({ ok: false, revision, error: { title: 'Geometry refused', hint: 'Keep the accepted geometry', detail: 'test failure', code: 'VALUE', feature: 'n2' }, wallTime: 0 });

test('Height evaluates the signature-refreshed candidate only after both native parent proofs and commits once', async () => {
  const f = fixture(), snapshot = structuredClone(f.doc), pending = f.apply();
  assert.equal(f.full.length, 0); assert.deepEqual(f.parts[0].doc, prefixDoc(f.doc, 2));
  await advance(f, 2); assert.equal(f.full.length, 1); assert.equal(f.commits.length, 0);
  const candidate = f.full[0].doc, finish = candidate.nodes[2]; assert.ok(finish.kind === 'fillet');
  if (finish.kind !== 'fillet') throw new Error('finish');
  const actual = evaluateDoc(prefixDoc(candidate, 2), 100); assert.ok(actual.ok);
  if (!actual.ok) throw new Error('new parent');
  assert.deepEqual(finish.sigs![name], toSig(signaturesOf(actual.bodies[0]).edges.get(name)!));
  assert.deepEqual(finish.sigs![name].p, [20, 0, 30]);
  assert.deepEqual(candidate.nodes, f.nodes.map((n, i) => i === 2 ? { ...n, sigs: finish.sigs } : n));
  f.good(f.full[0]); await pending; assert.deepEqual(f.commits, [candidate]); assert.deepEqual(f.doc, snapshot);
});
for (const stage of [0, 1, 2]) for (const owner of ['document', 'scope', 'worker', 'open', 'draft', 'evaluated', 'marker', 'variant'] as const) {
  test(`Height ignores stale ${owner} at async stage ${stage}`, async () => {
    const f = fixture(), pending = f.apply(); await advance(f, stage); f.invalidate[owner]();
    f.good(stage === 2 ? f.full[0] : f.parts[stage]); await pending;
    assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 2 ? 1 : 0); assert.equal(f.parts.length, Math.min(stage + 1, 2));
  });
}
for (const stage of [0, 1, 2]) test(`Height rejects revision mismatch at async stage ${stage}`, async () => {
  const f = fixture(), pending = f.apply(); await advance(f, stage);
  const call = stage === 2 ? f.full[0] : f.parts[stage], reply = evaluateDoc(call.doc, call.revision + 100); call.resolve(reply); await pending;
  assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 2 ? 1 : 0);
});
for (const stage of [0, 1]) for (const mode of ['error', 'throw', 'bad-topology'] as const) test(`Height parent ${stage} ${mode} cannot reach full evaluation`, async () => {
  const f = fixture(), pending = f.apply(); await advance(f, stage); const call = f.parts[stage];
  if (mode === 'error') call.resolve(failure(call.revision));
  else if (mode === 'throw') call.reject(new Error('parent failed'));
  else { const reply = evaluateDoc(call.doc, call.revision); assert.ok(reply.ok); if (!reply.ok) throw new Error('fixture'); call.resolve({ ...reply, bodies: [] }); }
  await tick();
  if (stage === 0 && mode === 'bad-topology') { assert.equal(f.parts.length, 2); f.good(f.parts[1]); }
  const notice = await pending; assert.ok(notice); assert.equal(f.full.length, 0); assert.equal(f.commits.length, 0);
});
test('Height full geometry refusal leaves the accepted document and signature unchanged', async () => {
  const f = fixture(), snapshot = structuredClone(f.doc), pending = f.apply(); await advance(f, 2);
  f.full[0].resolve(failure(f.full[0].revision)); const notice = await pending;
  assert.ok(notice); assert.equal(notice.title, 'Geometry refused'); assert.equal(f.commits.length, 0); assert.deepEqual(f.doc, snapshot);
});
