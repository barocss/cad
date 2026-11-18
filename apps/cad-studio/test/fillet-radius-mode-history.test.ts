import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { isFilletRadiusModeChange, proveFilletRadiusModeChange } from '../src/state/filletRadiusModeHistory';
import { setFilletRadiusMode } from '@barocss/cad-model/app/filletRadiusMode';
function fixture() {
  const base = rectanglePart(40, 30, 10), result = evaluateDoc(base, 1); assert.ok(result.ok); if (!result.ok) throw new Error('parent');
  const bodies = result.bodies, edge = bodies[0].mesh.edges.find(e => e.a[1] === 0 && e.b[1] === 0 && e.a[2] === 10 && e.b[2] === 10)!;
  assert.ok(edge); const name = edge.names[0];
  const before = withNode(base, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [name], radius: 2, sigs: { [name]: toSig(signaturesOf(bodies[0]).edges.get(name)!) } });
  return { before, bodies, name };
}
const patch = (doc: StudioDoc, index: number, change: object): StudioDoc => ({ ...doc, nodes: doc.nodes.map((n, i) => i === index ? { ...n, ...change } as ModelNode : n) });
const varying=(doc:StudioDoc):StudioDoc=>({...doc,nodes:setFilletRadiusMode(doc.nodes,2,'varying')});
const constant=(doc:StudioDoc):StudioDoc=>({...doc,nodes:setFilletRadiusMode(doc.nodes,2,'constant')});

test('mode transitions preserve independent circular volume and restore exact scalar document',()=>{
 const {before,bodies}=fixture(),next=varying(before);assert.ok(isFilletRadiusModeChange(before,next,2));assert.ok(proveFilletRadiusModeChange(before,next,bodies));
 assert.ok(proveFilletRadiusModeChange(next,constant(next),bodies));assert.deepEqual(constant(next),before);
 for(const doc of [before,next,constant(next)]){const r=evaluateDoc(doc,2);assert.ok(r.ok);if(r.ok)assert.ok(Math.abs(r.bodies[0].volume!-(12000-160*(1-Math.PI/4)))<1e-7);}
});
test('unequal/interior and wrong exact endpoints refuse without losing radius controls',()=>{
 const {before,bodies}=fixture(),next=varying(before),n=next.nodes[2];assert.ok(n.kind==='fillet'&&n.radii);if(n.kind!=='fillet'||!n.radii)throw Error('fixture');
 for(const radii of [[n.radii[0],{...n.radii[1],radius:3}],[n.radii[0],{at:[20,0,10],radius:2,fraction:.5},n.radii[1]],[n.radii[0],{...n.radii[1],at:[40.0000001,0,10]}]]){
  const bad=patch(next,2,{radii}),saved=structuredClone(bad);assert.equal(proveFilletRadiusModeChange(before,bad,bodies),false);assert.equal(isFilletRadiusModeChange(bad,before,2),false);assert.deepEqual(constant(bad),saved);
 }
 const swapped=patch(next,2,{radii:[n.radii[1],n.radii[0]]});assert.ok(proveFilletRadiusModeChange(swapped,before,bodies));
});
test('stale/shared signatures and native topology damage refuse mode conversion',()=>{
 const {before,bodies,name}=fixture(),next=varying(before),f=before.nodes[2];assert.ok(f.kind==='fillet');if(f.kind!=='fillet')throw Error('fixture');
 for(const sigs of [{},{[name]:{...f.sigs![name],n:2}},{[name]:{...f.sigs![name],s:1}}]){const a=patch(before,2,{sigs}),b=patch(next,2,{sigs});assert.equal(proveFilletRadiusModeChange(a,b,bodies),false);}
 assert.equal(proveFilletRadiusModeChange(before,next,[]),false);assert.equal(proveFilletRadiusModeChange(before,next,[{...bodies[0],key:'foreign'}]),false);
 const damaged=structuredClone(bodies);damaged[0].mesh.edges.pop();assert.equal(proveFilletRadiusModeChange(before,next,damaged),false);
});
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
import type { EvalResult } from '@barocss/cad-model/engine/evaluate';
type PendingCall = { doc: StudioDoc; revision: number; resolve(reply: EvalResult): void; reject(error: Error): void };
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
function historyFixture(source?: StudioDoc, candidate?: StudioDoc) {
  const doc = source ?? fixture().before, next = candidate ?? varying(doc);
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
test('History proves the original parent and commits the unchanged signed equal-end candidate once', async () => {
  const f = historyFixture(), saved = structuredClone(f.doc), pending = f.apply();
  assert.equal(f.parts.length, 1); assert.equal(f.full.length, 0); assert.deepEqual(f.parts[0].doc, prefixDoc(f.doc, 2));
  f.good(f.parts[0]); await tick(); assert.equal(f.full.length, 1); assert.equal(f.commits.length, 0);
  assert.deepEqual(f.full[0].doc, f.next);
  const native = evaluateDoc(f.full[0].doc, 123); assert.ok(native.ok);
  if (native.ok) assert.ok(Math.abs(native.bodies[0].volume! - (12000 - 160 * (1-Math.PI/4))) < 1e-7);
  f.good(f.full[0]); await pending; assert.deepEqual(f.commits, [f.next]); assert.deepEqual(f.doc, saved);
});
for (const stage of ['prefix', 'full'] as const) for (const key of ['document', 'scope', 'open', 'worker', 'draft', 'evaluated', 'marker', 'variant'] as const) {
  test(`Fillet radius mode ignores stale ${key} after ${stage}`, async () => {
    const f = historyFixture(), pending = f.apply();
    if (stage === 'full') { f.good(f.parts[0]); await tick(); }
    f.invalidate[key](); f.good(stage === 'prefix' ? f.parts[0] : f.full[0]); await pending;
    assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 'prefix' ? 0 : 1);
  });
}
for (const stage of ['prefix', 'full'] as const) test(`Fillet radius mode refuses wrong ${stage} revision`, async () => {
  const f = historyFixture(), pending = f.apply();
  if (stage === 'full') { f.good(f.parts[0]); await tick(); }
  const call = stage === 'prefix' ? f.parts[0] : f.full[0]; call.resolve(evaluateDoc(call.doc, call.revision + 100)); await pending;
  assert.equal(f.commits.length, 0); assert.equal(f.full.length, stage === 'prefix' ? 0 : 1);
});
for (const bad of ['error', 'throw', 'topology'] as const) test(`Fillet radius mode prefix ${bad} cannot reach full evaluation`, async () => {
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

test('raw mode change cannot bypass proof with simultaneous edits or malformed radius controls',async()=>{
 for(const [i,change] of [[2,{radius:3}],[1,{height:11}],[2,{radii:[]}],[2,{sigs:{}}]] as [number,object][]){const f=historyFixture(),bad=patch(f.next,i,change);const failure=await f.apply(bad.nodes);assert.ok(failure);assert.equal(failure.title,'Radius mode not applied');assert.equal(f.parts.length,0);assert.equal(f.full.length,0);assert.equal(f.commits.length,0);}
});
test('existing unequal endpoint edits retain ordinary no-prefix evaluation',async()=>{
 const before=varying(fixture().before),n=before.nodes[2];assert.ok(n.kind==='fillet'&&n.radii);if(n.kind!=='fillet'||!n.radii)throw Error('fixture');
 const next=patch(before,2,{radii:[n.radii[0],{...n.radii[1],radius:3}]}),f=historyFixture(before,next),pending=f.apply();assert.equal(f.parts.length,0);assert.equal(f.full.length,1);f.good(f.full[0]);await pending;assert.deepEqual(f.commits,[next]);
});
