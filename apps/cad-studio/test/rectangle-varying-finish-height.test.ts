import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, withNode, prefixDoc, type StudioDoc, type ModelNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, type BodyResult } from '@barocss/cad-model/engine/evaluate';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig } from '@barocss/cad-model/engine/references';
import { encodeStudioFile, readStudioFile } from '@barocss/cad-model/engine/container';
import { prepareSignedFinishOpen } from '../src/files/documentFile';
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
import { isRectangleFinishHeightResize, proveRectangleFinishResize } from '../src/state/rectangleFinishResize';
function bodies(doc: StudioDoc) {
 const r = evaluateDoc(prefixDoc(doc, 2), 1);
 assert.ok(r.ok, r.ok ? '' : r.error.hint);
 if (!r.ok) throw new Error('prefix');
 return r.bodies;
}
function fixture(edgeIndex = 0, reverse = false) {
 const base = rectanglePart(30, 20, 10), bs = bodies(base);
 const edges = bs[0].mesh.edges.filter(e => e.nativeLine && e.a[2] === 10 && e.b[2] === 10);
 assert.equal(edges.length, 4);
 const edge = edges[edgeIndex], name = edge.names[0], ends = reverse ? [edge.b, edge.a] : [edge.a, edge.b];
 const before = withNode(base, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [name], radius: 1,
  radii: [{ at: [...ends[0]], radius: 1, atEnd: true }, { at: [...ends[1]], radius: 2, atEnd: true }],
  sigs: { [name]: toSig(signaturesOf(bs[0]).edges.get(name)!) } });
 return { before, name };
}
function height(doc: StudioDoc, h: number): StudioDoc {
 return { ...doc, nodes: doc.nodes.map(n => n.kind === 'extrude' ? { ...n, height: h } : n) };
}
function patch(doc: StudioDoc, index: number, value: object): StudioDoc {
 return { ...doc, nodes: doc.nodes.map((n, i) => i === index ? { ...n, ...value } as ModelNode : n) };
}
test('all four native top edges retain historical numeric endpoint laws through Height 10 to 30 to 14', () => {
 for (let e = 0; e < 4; e++) for (const reverse of [false, true]) {
  const item = fixture(e, reverse), name = item.name;
  let before = item.before;
  const initial = structuredClone(before), finish = before.nodes[2];
  assert.ok(finish.kind === 'fillet'); if (finish.kind !== 'fillet') return;
  const originalLaw = finish.radii;
  for (const h of [30, 14]) {
   const next = height(before, h), oldBodies = bodies(before), newBodies = bodies(next);
   assert.equal(isRectangleFinishHeightResize(before, next, 1), true);
   const result = proveRectangleFinishResize(before, next, oldBodies, newBodies); assert.ok(result);
   const f = result.nodes[2]; assert.ok(f.kind === 'fillet'); if (f.kind !== 'fillet') return;
   assert.equal(f.radii, originalLaw); assert.deepEqual(f.radii, initial.nodes[2].kind === 'fillet' ? initial.nodes[2].radii : null);
   assert.deepEqual(f, { ...before.nodes[2], sigs: { [name]: toSig(signaturesOf(newBodies[0]).edges.get(name)!) } });
   assert.equal(result.nodes[0], before.nodes[0]); assert.equal(result.nodes[1], next.nodes[1]);
   const evaluated = evaluateDoc(result, 2); assert.ok(evaluated.ok, evaluated.ok ? '' : evaluated.error.hint);
   if (evaluated.ok) { assert.equal(evaluated.bodies.length, 1); assert.ok(Number.isFinite(evaluated.bodies[0].volume)); assert.ok(evaluated.bodies[0].volume! > 0); }
   before = result;
  }
  assert.deepEqual(originalLaw, initial.nodes[2].kind === 'fillet' ? initial.nodes[2].radii : null);
 }
});
test('Height excludes bound station and endpoint radii, noncircular finishes, downstream and combined edits', () => {
 const { before } = fixture(), f = before.nodes[2]; assert.ok(f.kind === 'fillet'); if (f.kind !== 'fillet') return;
 const [a, b] = f.radii!;
 const unsupported = [
  { radii: [a, { at: [15, 0, 10], radius: { parameter: 'R' }, fraction: 0.5 }, b] },
  { radius: { parameter: 'R' } }, { radii: [{ ...a, radius: { parameter: 'R' } }, b] },
  { section: { kind: 'conic', rho: 0.5 } }, { section: { kind: 'g2' } }, { held: 'missing' }, { suppressed: true }, { rematched: {} },
 ];
 for (const value of unsupported) {
  const source = { ...patch(before, 2, value), parameters: { R: 1 } }, next = height(source, 30);
  assert.equal(isRectangleFinishHeightResize(source, next, 1), false);
  assert.equal(proveRectangleFinishResize(source, next, bodies(source), bodies(next)), null);
 }
 for (const next of [patch(height(before, 30), 0, { max: [40, 20] }), patch(height(before, 30), 1, { from: 2 }), patch(height(before, 30), 2, { radius: 2 }), { ...height(before, 30), nodes: [...height(before, 30).nodes, before.nodes[0]] }]) {
  assert.equal(isRectangleFinishHeightResize(before, next, 1), false);
 }
 assert.equal(isRectangleFinishHeightResize(before, height(before, 30), 0), false);
});
test('native vertical and bottom edges remain outside this Height extension', () => {
 const base = rectanglePart(30, 20, 10), bs = bodies(base);
 for (const edge of bs[0].mesh.edges.filter(e => e.a[2] !== 10 || e.b[2] !== 10)) {
  const name = edge.names[0], before = withNode(base, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [name], radius: 1,
   radii: [{ at: [...edge.a], radius: 1, atEnd: true }, { at: [...edge.b], radius: 2, atEnd: true }], sigs: { [name]: toSig(signaturesOf(bs[0]).edges.get(name)!) } });
  const next = height(before, 30);
  assert.equal(proveRectangleFinishResize(before, next, bs, bodies(next)), null);
 }
});
test('ties, stale and shared signatures fail closed without mutating either draft', () => {
 const { before, name } = fixture(), f = before.nodes[2]; assert.ok(f.kind === 'fillet'); if (f.kind !== 'fillet') return;
 const edge = bodies(before)[0].mesh.edges.find(e => e.names.includes(name))!;
 const midpoint = edge.a.map((v, i) => (v + edge.b[i]) / 2) as [number, number, number];
 const tie = [{ at: midpoint, radius: 1, atEnd: true }, { at: [midpoint[0], midpoint[1], midpoint[2] + 1], radius: 2, atEnd: true }];
 for (const value of [{ radii: tie }, { sigs: { [name]: { ...f.sigs![name], s: 999 } } }, { sigs: { [name]: { ...f.sigs![name], n: 2 } } }]) {
  const source = patch(before, 2, value), next = height(source, 30), snapshot = structuredClone({ source, next });
  assert.equal(proveRectangleFinishResize(source, next, bodies(source), bodies(next)), null);
  assert.deepEqual({ source, next }, snapshot);
 }
});
test('the entire native cuboid proof remains mandatory for a top-edge height change', () => {
 const { before, name } = fixture(), next = height(before, 30), oldBodies = bodies(before), newBodies = bodies(next);
 const mutations: ((b: BodyResult) => void)[] = [
  b => { b.mesh.edges.find(e => e.names.includes(name))!.nativeLine = undefined; },
  b => { b.mesh.edges.find(e => !e.names.includes(name))!.nativeLine = undefined; },
  b => { b.mesh.edges[0].nativeVertices = ['wrong', 'vertices']; },
  b => { b.mesh.edges[0].nativeJoint!.faces = ['wrong', 'faces']; },
  b => { b.mesh.faces[0].nativePlaneName = b.mesh.faces[1].nativePlaneName; },
  b => { b.ref = { node: 0, side: 'solid' }; },
 ];
 for (const mutate of mutations) { const bs = structuredClone(newBodies); mutate(bs[0]); assert.equal(proveRectangleFinishResize(before, next, oldBodies, bs), null); }
 assert.equal(proveRectangleFinishResize(before, next, oldBodies, [...newBodies, ...newBodies]), null);
});

test('admission uses stored signature precision while native top proof retains exact geometry', () => {
 const h=10.123456789,base=rectanglePart(30,20,h),bs=bodies(base);
 const edge=bs[0].mesh.edges.find(e=>e.a[2]===h&&e.b[2]===h)!;
 const name=edge.names[0],sig=toSig(signaturesOf(bs[0]).edges.get(name)!);
 assert.notEqual(sig.p[2],h);
 const before=withNode(base,{kind:'fillet',parent:{node:1,side:'solid'},edges:[name],radius:1,
  radii:[{at:[...edge.a],radius:1,atEnd:true},{at:[...edge.b],radius:2,atEnd:true}],sigs:{[name]:sig}});
 const next=height(before,30.987654321);
 assert.equal(isRectangleFinishHeightResize(before,next,1),true);
 assert.ok(proveRectangleFinishResize(before,next,bs,bodies(next)));
});

function stationFixture() {
 const base = rectanglePart(40, 30, 10);
 const name = 'n1.side0|n1.top';
 const signature = toSig(signaturesOf(bodies(base)[0]).edges.get(name)!);
 return withNode(base, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: [name], radius: 1.25,
  radii: [{ at: [0, 0, 10], atEnd: true, radius: 1.25 }, { at: [10, 0, 10], fraction: .25, radius: 3 },
   { at: [25, 0, 10], fraction: .625, radius: 1 }, { at: [40, 0, 10], atEnd: true, radius: 2.5 }],
  sigs: { [name]: signature } });
}
async function applyStationHeight(doc: StudioDoc, h: number) {
 let revision = 0;
 const saved: StudioDoc[] = [], reads: string[] = [], scope = {};
 const apply = createHistoryFeatureApply({ model: { doc, evaluated: doc, editNode: 1, fresh: true, busy: false },
  owner: { document: () => doc, evaluated: () => doc, marker: () => null, variant: () => null, scope: () => scope, worker: () => 1, open: () => scope },
  worker: { nextRevision: () => ++revision, engine: {
   evaluate: async (candidate, rev) => { reads.push('feature'); return evaluateDoc(candidate, rev); },
   part: async (candidate, rev) => { reads.push('parent'); return evaluateDoc(candidate, rev); },
  } },
  changes: { canChangeDocument: () => true, commit: candidate => { saved.push(candidate); return true; },
   applyRoundedInsetEdit: () => assert.fail('unexpected inset'), stageFeatureCandidate: () => assert.fail('unexpected pattern') } });
 const notice = await apply(height(doc, h).nodes, () => true);
 return { saved, notice, reads };
}
test('Height retains both numeric interior stations and their native geometry after file Open', async () => {
 const before = stationFixture(), original = structuredClone(before), read = async (d: StudioDoc) => evaluateDoc(d, 1);
 const measured = (d: StudioDoc) => {
  const r = evaluateDoc(d, 1); assert.ok(r.ok, r.ok ? '' : r.error.hint);
  assert.equal(r.bodies.length, 1); return r.bodies[0].volume!;
 };
 const removed = 40 * 30 * 10 - measured(before);
 assert.ok(removed > 0);
 for (const h of [15, 16]) {
  const { saved, notice, reads } = await applyStationHeight(before, h);
  assert.equal(notice, undefined); assert.equal(saved.length, 1);
  const doc = saved[0], finish = doc.nodes[2], old = before.nodes[2];
  assert.ok(finish.kind === 'fillet' && old.kind === 'fillet');
  const name = old.edges[0];
  assert.deepEqual(finish, { ...old, sigs: { [name]: toSig(signaturesOf(bodies(doc)[0]).edges.get(name)!) } });
  assert.equal(finish.radii, old.radii);
  const reopened = await readStudioFile(encodeStudioFile(doc));
  assert.ok('doc' in reopened);
  assert.equal(await prepareSignedFinishOpen(reopened.doc, read, () => true), undefined);
  assert.deepEqual(reopened.doc.nodes[2], finish);
  assert.ok(Math.abs(measured(reopened.doc) - (40 * 30 * h - removed)) < 1e-7);
  assert.deepEqual(reads, ['feature', 'parent', 'parent', 'feature']);
 }
 assert.deepEqual(before, original);
});

test('Height preserves the native reference refusal and rejects a stale old station signature before commit', async () => {
 const before = stationFixture();
 const refused = await applyStationHeight(before, 30);
 assert.equal(refused.notice?.code, 'REFERENCE_MOVED');
 assert.deepEqual(refused.saved, []); assert.deepEqual(refused.reads, ['feature']);
 const f = before.nodes[2]; assert.ok(f.kind === 'fillet');
 const name = f.edges[0], sig = f.sigs![name];
 const stale = patch(before, 2, { sigs: { [name]: { ...sig, p: [20, 0, 11] } } });
 const rejected = await applyStationHeight(stale, 16);
 assert.ok(rejected.notice); assert.deepEqual(rejected.saved, []);
 const next = height(before, 16), parents = bodies(next);
 const selected = parents[0].mesh.edges.find(e => e.names.includes(name))!;
 [selected.a, selected.b] = [selected.b, selected.a];
 assert.equal(proveRectangleFinishResize(before, next, bodies(before), parents), null);
});
