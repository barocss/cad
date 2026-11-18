import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, type EvalResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { prepareParameterHeightFinish } from '../src/state/parameterHeightFinish';
function fixture(kind: 'fillet' | 'chamfer' = 'fillet') {
 const base = rectanglePart(40, 30, 10), parent = evaluateDoc(base, 0); assert.ok(parent.ok); if (!parent.ok) throw new Error('base');
 const edge = parent.bodies[0].mesh.edges.find(e => e.a[2] === 0 && e.b[2] !== 0)!, name = edge.names[0];
 const numeric = withNode(base, kind === 'fillet' ? { kind, parent: { node: 1, side: 'solid' }, edges: [name], radius: 2, sigs: { [name]: toSig(signaturesOf(parent.bodies[0]).edges.get(name)!) } } : { kind, parent: { node: 1, side: 'solid' }, edges: [name], distance: 2, sigs: { [name]: toSig(signaturesOf(parent.bodies[0]).edges.get(name)!) } });
 const before: StudioDoc = { ...numeric, parameters: { H: 10, R: 2 }, nodes: numeric.nodes.map(n => n.kind === 'extrude' ? { ...n, height: { parameter: 'H' } } : n) };
 return { before, next: { ...before, parameters: { ...before.parameters, H: 30 } }, name };
}
function run(before: StudioDoc, next: StudioDoc) {
 const calls: StudioDoc[] = []; let revision = 0;
 return { calls, result: prepareParameterHeightFinish({ before, next, nextRevision: () => ++revision, isCurrent: () => true, evaluateParent: async (doc, rev) => { calls.push(doc); return evaluateDoc(doc, rev); } }) };
}
for (const kind of ['fillet', 'chamfer'] as const) test(`${kind} parameter value change proves native parents and preserves binding and storage`, async () => {
 const { before, next, name } = fixture(kind), snapshot = structuredClone({ before, next }), task = run(before, next), out = await task.result;
 assert.equal(task.calls.length, 2); assert.deepEqual(task.calls, [prefixDoc(before, 2), prefixDoc(next, 2)]);
 assert.notEqual(out, next); assert.equal(out.parameters, next.parameters); assert.equal(out.nodes[1], next.nodes[1]);
 const parent = evaluateDoc(prefixDoc(next, 2), 3); assert.ok(parent.ok); if (!parent.ok) return;
 assert.deepEqual(out.nodes, next.nodes.map((n, i) => i === 2 ? { ...n, sigs: { [name]: toSig(signaturesOf(parent.bodies[0]).edges.get(name)!) } } : n));
 const full = evaluateDoc(out, 4); assert.ok(full.ok, full.ok ? '' : full.error.hint);
 if (full.ok) assert.ok(Math.abs(full.bodies[0].volume! - (36000 - 30 * (kind === 'fillet' ? 4 - Math.PI : 2))) < 1e-7);
 const opened = await readStudioFile(encodeStudioFile(out)); assert.ok('doc' in opened); if ('doc' in opened) assert.deepEqual(opened.doc, out);
 assert.deepEqual({ before, next }, snapshot);
});
test('noneligible edits return the exact candidate and do not evaluate', async () => {
 const { before, next } = fixture();
 const pairs: [StudioDoc, StudioDoc][] = [[before, before], [before, { ...next, parameters: { H: 30, R: 3 } }], [before, { ...next, parameters: { H: 0, R: 2 } }]];
 for (const extra of [{ drawing: {} }, { configurations: {} }, { unknownConsumer: {} }, { direct: { sources: {}, objects: [] } }]) pairs.push([{ ...before, ...extra } as StudioDoc, { ...next, ...extra } as StudioDoc]);
 const shared = (d: StudioDoc): StudioDoc => ({ ...d, nodes: d.nodes.map(n => n.kind === 'fillet' ? { ...n, radius: { parameter: 'H' } } : n) });
 pairs.push([shared(before), shared(next)]);
 pairs.push([before, { ...next, outputs: {} }]);
 for (const [a, b] of pairs) { const task = run(a, b); assert.equal(await task.result, b); assert.equal(task.calls.length, 0); }
 const undefinedUI = run(before, { ...next, configurations: undefined }); assert.notEqual(await undefinedUI.result, next); assert.equal(undefinedUI.calls.length, 2);
});
type Call = { doc: StudioDoc; revision: number; resolve(value: EvalResult): void };
const tick = () => new Promise<void>(resolve => queueMicrotask(resolve));
for (const stage of [0, 1]) for (const failure of ['stale', 'revision', 'topology', 'native'] as const) test(`prefix ${stage} ${failure} fails without changing accepted input`, async () => {
 const { before, next } = fixture(), snapshot = structuredClone({ before, next }); let current = true, revision = 0; const calls: Call[] = [];
 const pending = prepareParameterHeightFinish({ before, next, nextRevision: () => ++revision, isCurrent: () => current,
  evaluateParent: (doc, rev) => new Promise(resolve => calls.push({ doc, revision: rev, resolve })) });
 const rejected = assert.rejects(pending);
 if (stage === 1) { calls[0].resolve(evaluateDoc(calls[0].doc, calls[0].revision)); await tick(); }
 const call = calls[stage]; assert.ok(call); let result = evaluateDoc(call.doc, call.revision); assert.ok(result.ok); if (!result.ok) throw new Error('parent');
 if (failure === 'stale') current = false;
 if (failure === 'revision') result = { ...result, revision: result.revision + 9 };
 if (failure === 'topology') result = { ...result, bodies: [] };
 if (failure === 'native') call.resolve({ ok: false, revision: call.revision, wallTime: 0, error: { title: 'failure', hint: 'failure', detail: 'failure', code: 'VALUE' } });
 else call.resolve(result);
 if (stage === 0 && failure === 'topology') { await tick(); calls[1].resolve(evaluateDoc(calls[1].doc, calls[1].revision)); }
 await rejected; assert.deepEqual({ before, next }, snapshot);
});
test('stale owner before work and stale stored signature cannot refresh', async () => {
 const { before, next, name } = fixture(); let count = 0;
 await assert.rejects(prepareParameterHeightFinish({ before, next, nextRevision: () => ++count, isCurrent: () => false, evaluateParent: async () => { throw new Error('must not run'); } })); assert.equal(count, 0);
 const stale = (d: StudioDoc): StudioDoc => ({ ...d, nodes: d.nodes.map(n => n.kind === 'fillet' ? { ...n, sigs: { [name]: { ...n.sigs![name], s: 999 } } } : n) });
 await assert.rejects(run(stale(before), stale(next)).result);
});

test('parameter-key and authored-consumer admission matrix cannot refresh unrelated edits', async () => {
 const { before, next } = fixture();
 const pairs: [StudioDoc, StudioDoc][] = [
  [before, { ...next, parameters: { ...next.parameters, Added: 1 } }],
  [before, { ...next, parameters: { H: 30 } }],
  [before, { ...next, parameters: { Renamed: 30, R: 2 } }],
 ];
 for (const value of [NaN, Infinity, -Infinity, -1]) pairs.push([before, { ...next, parameters: { ...next.parameters, H: value } }]);
 const nodePatch = (d: StudioDoc, index: number, extra: object): StudioDoc => ({ ...d, nodes: d.nodes.map((n, i) => i === index ? { ...n, ...extra } as typeof n : n) });
 for (const binding of [{ parameter: 'H', extra: 1 }, Object.create({ parameter: 'H' })]) pairs.push([nodePatch(before, 1, { height: binding }), nodePatch(next, 1, { height: binding })]);
 const inheritedBefore = { ...before, parameters: Object.assign(Object.create({ H: 10 }), { R: 2 }) as StudioDoc['parameters'] };
 const inheritedNext = { ...next, parameters: Object.assign(Object.create({ H: 30 }), { R: 2 }) as StudioDoc['parameters'] };
 pairs.push([inheritedBefore, inheritedNext]);
 pairs.push([nodePatch(before, 1, { unknownConsumer: true }), nodePatch(next, 1, { unknownConsumer: true })]);
 pairs.push([{ ...before, nodes: [...before.nodes, before.nodes[0]] }, { ...next, nodes: [...next.nodes, next.nodes[0]] }]);
 pairs.push([nodePatch(before, 1, { height: 10 }), nodePatch(next, 1, { height: 10 })]);
 const law = [{ at: [0, 0, 0], radius: 1, atEnd: true }, { at: [0, 0, 10], radius: 2, atEnd: true }];
 pairs.push([nodePatch(before, 2, { radii: law }), nodePatch(next, 2, { radii: law })]);
 for (const [a, b] of pairs) { const task = run(a, b); assert.equal(await task.result, b); assert.equal(task.calls.length, 0); }
});
test('a proved H1 candidate still undergoes full native refusal without modifying accepted geometry', async () => {
 // A top horizontal edge needs two millimetres of vertical clearance for R2/D2.
 for (const kind of ['fillet', 'chamfer'] as const) {
  const f = fixture(kind), oldParent = evaluateDoc(prefixDoc(f.before, 2), 0); assert.ok(oldParent.ok); if (!oldParent.ok) return;
  const edge = oldParent.bodies[0].mesh.edges.find(e => e.a[2] === 10 && e.b[2] === 10)!;
  const name = edge.names[0], sigs = { [name]: toSig(signaturesOf(oldParent.bodies[0]).edges.get(name)!) };
  const before: StudioDoc = { ...f.before, nodes: f.before.nodes.map(n => n.kind === 'fillet' || n.kind === 'chamfer' ? { ...n, edges: [name], sigs } : n) };
  const next = { ...before, parameters: { ...before.parameters, H: 1 } }, snapshot = structuredClone({ before, next });
  const accepted = evaluateDoc(before, 1); assert.ok(accepted.ok, accepted.ok ? '' : accepted.error.hint);
  const prepared = await run(before, next).result; assert.notEqual(prepared, next);
  assert.equal(prepared.parameters.H, 1); assert.equal(prepared.nodes[1], next.nodes[1]);
  const refused = evaluateDoc(prepared, 2); assert.equal(refused.ok, false);
  assert.deepEqual({ before, next }, snapshot);
  const repeated = evaluateDoc(before, 3); assert.ok(repeated.ok);
  if (accepted.ok && repeated.ok) assert.deepEqual(repeated.bodies, accepted.bodies);
 }
});
