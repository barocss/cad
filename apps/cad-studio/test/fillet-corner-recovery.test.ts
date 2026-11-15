import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep } from '@barocss/cad';
import { commands, type Ctx } from '@barocss/cad-model/app/commands';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, partBreps, type BodyResult } from '@barocss/cad-model/engine/evaluate';
import { edgeFinishFailure } from '../src/app/failedFeature';
import { setTimeout as sleep } from 'node:timers/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { useCommandPreview } from '../src/state/useCommandPreview';
import { createValueStore } from '../src/state/valueStore';
import type { Active } from '../src/app/commandState';
import type { EngineClient } from '../src/engine/client';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';

const command = commands.find(c => c.id === 'fillet')!;
function fixture(shape: 'conic' | 'g2') {
  let doc = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [-30, -30], max: [30, 30] });
  doc = withNode(doc, { kind: 'extrude', sketch: 0, height: 10 });
  doc = withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [-10, -6], max: [10, 6] });
  doc = withNode(doc, { kind: 'extrude', sketch: 2, height: 15, from: 10 });
  doc = withNode(doc, { kind: 'union', left: { node: 1, side: 'solid' }, right: { node: 3, side: 'solid' } });
  const original = evaluateDoc(doc, 0); assert.ok(original.ok);
  const edges = original.bodies[0].mesh.edges.filter(e => e.names.some(n => n.includes('n1.top') && n.includes('n3.side')));
  assert.equal(edges.length, 4);
  const ctx: Ctx = { doc, bodies: original.bodies, selection: { edges: edges.map(e => ({ body: 0, edge: e.index })), faces: [], bodies: [] } };
  const values = { ...command.defaults!(ctx), radius: 1, shape, rho: .5, tension: .5 }, candidate = command.build!(ctx, values), feature = candidate.nodes.at(-1)!;
  assert.ok(feature.kind === 'fillet');
  const failed = evaluateDoc(candidate, 1); assert.ok(!failed.ok); assert.equal(failed.error.code, 'CAPABILITY'); assert.equal(failed.error.feature, feature.id);
  return { ctx, values, candidate, feature, error: failed.error };
}
for (const shape of ['conic', 'g2'] as const) test(`real ${shape} sharp-corner refusal gets owned recovery, while Circular preserves the same source/radius/picks and builds`, () => {
  const f = fixture(shape), source = structuredClone(f.ctx.doc), picks = structuredClone(f.ctx.selection), values = { ...f.values };
  const mapped = edgeFinishFailure(f.error, f.feature);
  assert.equal(mapped.title, 'This section cannot turn this corner'); assert.equal(mapped.hint, 'Try Circular with the same picked edges.'); assert.equal(mapped.historyField, 'shape');
  assert.equal(mapped.detail, f.error.detail); assert.equal(mapped.code, f.error.code); assert.equal(mapped.feature, f.error.feature);
  const circular = command.build!(f.ctx, { ...f.values, shape: 'circular' }), accepted = evaluateDoc(circular, 2); assert.ok(accepted.ok);
  const [{ brep }] = partBreps(circular); assert.ok(checkBrep(brep, { strict: true }).valid);
  const feature = circular.nodes.at(-1)!; assert.ok(feature.kind === 'fillet'); assert.deepEqual(feature.edges, f.feature.edges); assert.equal(feature.radius, 1);
  assert.deepEqual(f.ctx.doc, source); assert.deepEqual(f.ctx.selection, picks); assert.deepEqual(f.values, values);
});
test('other reason, category, feature, section or edge cannot receive sharp-corner section advice', () => {
  const f = fixture('conic');
  for (const error of [
    { ...f.error, code: 'GEOMETRY' }, { ...f.error, feature: undefined }, { ...f.error, feature: 'upstream' }, { ...f.error, feature: '' },
    { ...f.error, detail: f.error.detail + '\n' }, { ...f.error, detail: f.error.detail + ' extra' },
    { ...f.error, detail: f.error.detail.replace('conic', 'G2') }, { ...f.error, detail: f.error.detail.replace('where the ball rolls round an edge at a corner', 'on a tangent chain') },
    { ...f.error, detail: 'other capability refusal' },
  ]) assert.strictEqual(edgeFinishFailure(error, f.feature), error);
  for (const feature of [{ ...f.feature, id: 'other' }, { ...f.feature, section: undefined }, { ...f.feature, section: { kind: 'g2' as const, tension: .5 } }, { ...f.feature, edges: ['foreign'] },
    ...[{ kind: 'circular' }, { kind: 'spline' }, {}].map(section => ({ ...f.feature, section }) as unknown as typeof f.feature)])
    assert.strictEqual(edgeFinishFailure(f.error, feature), f.error);
  const g2Error = { ...f.error, detail: f.error.detail.replace('conic', 'G2') };
  for (const section of [{ kind: 'circular' }, { kind: 'spline' }, {}]) {
    const malformed = { ...f.feature, section } as unknown as typeof f.feature;
    assert.strictEqual(edgeFinishFailure(g2Error, malformed), g2Error);
  }
});

for (const shape of ['conic', 'g2'] as const) test(`supported ${shape} on a straight edge remains accepted rather than receiving a corner limitation`, () => {
  const doc = rectanglePart(40, 30, 10), original = evaluateDoc(doc, 0); assert.ok(original.ok);
  const edge = original.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  const ctx: Ctx = { doc, bodies: original.bodies, selection: { edges: [{ body: 0, edge }], faces: [], bodies: [] } };
  const candidate = command.build!(ctx, { ...command.defaults!(ctx), radius: 4, shape, rho: .5, tension: .5 });
  const result = evaluateDoc(candidate, 1); assert.ok(result.ok);
  assert.ok(checkBrep(partBreps(candidate)[0].brep, { strict: true }).valid);
});

(globalThis as { window?: unknown }).window ??= globalThis;
for (const mode of ['current', 'old-revision', 'replaced-values', 'replaced-document', 'retired'] as const) {
  test(`real preview hook publishes corner recovery only for the current candidate: ${mode}`, async () => {
    const f = fixture('conic'), active: Active = { cmd: command, ctx: f.ctx, values: f.values, preview: 'busy' };
    const store = createValueStore<Active | null>(active), previews: (BodyResult[] | null)[] = [];
    let started!: () => void, answer!: (error: FriendlyError) => void;
    const began = new Promise<void>(resolve => { started = resolve; }), result = new Promise<FriendlyError>(resolve => { answer = resolve; });
    const engine = { preview: async (_candidate: StudioDoc, revision: number) => { started(); return { ok: false, wallTime: 0, revision: mode === 'old-revision' ? revision + 1 : revision, error: await result }; } };
    let preview!: ReturnType<typeof useCommandPreview>;
    function Probe() { preview = useCommandPreview({ command: { activeStore: store, bearingRootCurrent: true },
      worker: { engine: engine as unknown as EngineClient, nextRevision: () => 3, currentBearingDoc: () => f.ctx.doc },
      result: { previewFor: { current: null }, setPreviewBodies: value => { if (typeof value !== 'function') previews.push(value); } } }); return null; }
    renderToStaticMarkup(createElement(Probe)); const stop = preview.watch();
    try {
      await began;
      if (mode === 'replaced-values') { store.set({ ...active, values: { ...f.values, shape: 'circular' } }); stop(); }
      if (mode === 'replaced-document') { store.set({ ...active, ctx: { ...f.ctx, doc: structuredClone(f.ctx.doc) } }); stop(); }
      if (mode === 'retired') preview.retire();
      answer(f.error); await sleep(5);
      if (mode === 'current') {
        assert.equal(store.get()!.preview, 'error'); assert.equal(store.get()!.error?.historyField, 'shape');
        assert.equal(store.get()!.error?.hint, 'Try Circular with the same picked edges.'); assert.equal(store.get()!.error?.detail, f.error.detail);
        assert.equal(previews.at(-1), null);
      } else if (mode === 'old-revision') assert.equal(store.get()!.error?.historyField, undefined);
      else assert.equal(store.get()!.error, undefined, 'stale, replaced or retired failure cannot publish advice');
      assert.deepEqual(store.get()!.ctx.selection, f.ctx.selection); assert.equal(store.get()!.values.radius, 1);
    } finally { stop(); }
  });
}
