import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep } from '@barocss/cad';
import { commands, type Ctx } from '@barocss/cad-model/app/commands';
import { rectanglePart, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, partBreps, type BodyResult } from '@barocss/cad-model/engine/evaluate';
import { openingShellFailure } from '../src/state/openingShellFailure';
import { setTimeout as sleep } from 'node:timers/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { useCommandPreview } from '../src/state/useCommandPreview';
import { createValueStore } from '../src/state/valueStore';
import { FeatureFailureNotice } from '../src/ui/FeatureFailureNotice';
import type { Active } from '../src/app/commandState';
import type { EngineClient } from '../src/engine/client';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';

const command = commands.find(c => c.id === 'shell')!;
function fixture() {
  const doc = withNode(rectanglePart(40, 30, 20), { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: ['n1.side0|n1.top'], radius: 4, section: { kind: 'conic', rho: .5 } });
  const original = evaluateDoc(doc, 0); assert.ok(original.ok);
  const top = original.bodies[0].mesh.faces.findIndex(f => f.nativePlaneName === 'n1.top'); assert.ok(top >= 0);
  const ctx: Ctx = { doc, bodies: original.bodies, selection: { faces: [{ body: 0, face: top }], edges: [], bodies: [] } };
  const candidate = command.build!(ctx, { t: 2 }), feature = candidate.nodes.at(-1)!; assert.ok(feature.kind === 'shell');
  const failed = evaluateDoc(candidate, 1); assert.ok(!failed.ok); assert.equal(failed.error.code, 'SHELL_REGIONS_SHARP'); assert.equal(failed.error.feature, feature.id);
  return { ctx, candidate, feature, error: failed.error };
}
test('real Conic top opening gets Cancel-first recovery with original temporary-face and coordinate diagnostics intact', () => {
  const f = fixture(), doc = structuredClone(f.ctx.doc), picks = structuredClone(f.ctx.selection), before = structuredClone(f.candidate);
  const mapped = openingShellFailure(f.error, f.ctx, f.candidate); assert.ok(mapped);
  assert.equal(mapped.title, 'This opening reaches a Shell limit');
  assert.equal(mapped.hint, 'Cancel Shell, then select another face to open or select the body to try a closed Shell.');
  assert.equal(mapped.detail, f.error.detail); assert.equal(mapped.code, f.error.code); assert.equal(mapped.feature, f.error.feature);
  assert.match(mapped.detail, /n1\.top\.ext\.side\d+/); assert.ok(!('historyField' in mapped));
  assert.equal(f.error.title, 'Shell cannot cross this sharp edge', 'the shared actual-source diagnostic remains unchanged');
  const html = renderToStaticMarkup(createElement(FeatureFailureNotice, { error: mapped }));
  assert.match(html, /role="status"/); assert.equal(html.split(mapped.hint).length - 1, 1);
  assert.match(html, /<details><summary[^>]*>Kernel detail<\/summary><code>/); assert.ok(html.includes(mapped.detail));
  assert.deepEqual(f.ctx.doc, doc); assert.deepEqual(f.ctx.selection, picks); assert.deepEqual(f.candidate, before);
});
test('same Conic source supports bottom opening and closed Shell at Wall2 without changing kernel admission', () => {
  const f = fixture(), body = f.ctx.bodies[0], bottom = body.mesh.faces.findIndex(face => face.nativePlaneName === 'n1.bottom'); assert.ok(bottom >= 0);
  for (const closed of [false, true]) {
    const ctx: Ctx = { ...f.ctx, selection: closed ? { faces: [], edges: [], bodies: [0] } : { faces: [{ body: 0, face: bottom }], edges: [], bodies: [] } };
    const candidate = command.build!(ctx, { t: 2 }), result = evaluateDoc(candidate, 2); assert.ok(result.ok);
    const [{ brep }] = partBreps(candidate); assert.ok(checkBrep(brep, { strict: true }).valid); assert.equal(brep.shells.length, closed ? 2 : 1);
    assert.deepEqual(candidate.nodes.slice(0, -1), f.ctx.doc.nodes);
  }
});
test('wrong reason/owner/opening or a real source name never acquires temporary-opening advice', () => {
  const f = fixture(), temp = /n1\.top\.ext\.side\d+/.exec(f.error.detail)![0], source = f.ctx.bodies[0];
  for (const error of [
    { ...f.error, code: 'CAPABILITY' }, { ...f.error, feature: undefined }, { ...f.error, feature: 'upstream' },
    { ...f.error, detail: f.error.detail.replace(temp, 'n1.side0') }, { ...f.error, detail: f.error.detail.replace(temp, 'n1.bottom.ext.side3') },
    { ...f.error, detail: f.error.detail.replace(/\(at [^)]+\)/, '(at 0x10, 0, 20)') }, { ...f.error, detail: f.error.detail + '\n' }, { ...f.error, detail: f.error.detail + ' extra' }, { ...f.error, detail: f.error.detail.replace(temp, temp + 'extra') },
  ]) assert.equal(openingShellFailure(error, f.ctx, f.candidate), undefined);
  const variant = (change: Partial<typeof f.feature>) => ({ ...f.candidate, nodes: [...f.ctx.doc.nodes, { ...f.feature, ...change }] });
  for (const candidate of [variant({ open: [] }), variant({ open: ['n1.bottom'] }), variant({ thickness: 0 }), variant({ parent: { node: 1, side: 'solid' } }),
    { ...f.candidate, nodes: [...f.ctx.doc.nodes.map(n => ({ ...n })), f.feature] }, f.ctx.doc])
    assert.equal(openingShellFailure(f.error, f.ctx, candidate as StudioDoc), undefined);
  for (const ctx of [
    { ...f.ctx, selection: { faces: [], edges: [], bodies: [0] } },
    { ...f.ctx, selection: { ...f.ctx.selection, faces: [...f.ctx.selection.faces, ...f.ctx.selection.faces] } },
    { ...f.ctx, bodies: [{ ...source, key: 'foreign' }] }, { ...f.ctx, bodies: [source, source] },
    { ...f.ctx, bodies: [{ ...source, ref: undefined }] },
    ...['face', 'alias', 'native', 'member', 'edge'].map(kind => ({ ...f.ctx, bodies: [{ ...source, mesh: { ...source.mesh,
      faces: source.mesh.faces.map((face, i) => i ? face : { ...face, ...(kind === 'face' ? { name: temp } : kind === 'alias' ? { name: `other+${temp}#1` } : kind === 'native' ? { nativePlaneName: temp } : kind === 'member' ? { nativeFaces: [{ name: temp, kind: 'plane' as const, normal: face.normal, centroid: face.centroid, area: face.area }] } : {}) }),
      edges: source.mesh.edges.map((edge, i) => i || kind !== 'edge' ? edge : { ...edge, names: [temp + '|other'] }),
    } }] })),
  ]) assert.equal(openingShellFailure(f.error, ctx, f.candidate), undefined);
});

(globalThis as { window?: unknown }).window ??= globalThis;
for (const mode of ['current', 'old-revision', 'replaced-wall', 'replaced-opening', 'replaced-document', 'cancelled'] as const) {
  test(`preview opening advice cannot outlive its owner: ${mode}`, async () => {
    const f = fixture(), active: Active = { cmd: command, ctx: f.ctx, values: { t: 2 }, preview: 'busy' };
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
      if (mode === 'replaced-wall') { store.set({ ...active, values: { t: 1.5 } }); stop(); }
      if (mode === 'replaced-opening') { store.set({ ...active, ctx: { ...f.ctx, selection: { faces: [], edges: [], bodies: [0] } } }); stop(); }
      if (mode === 'replaced-document') { store.set({ ...active, ctx: { ...f.ctx, doc: structuredClone(f.ctx.doc) } }); stop(); }
      if (mode === 'cancelled') { preview.retire(); store.set(null); }
      answer(f.error); await sleep(5);
      if (mode === 'current') {
        assert.equal(store.get()!.preview, 'error'); assert.equal(store.get()!.error?.title, 'This opening reaches a Shell limit');
        assert.equal(store.get()!.error?.detail, f.error.detail); assert.ok(!store.get()!.error?.historyField); assert.equal(previews.at(-1), null);
        assert.equal(store.get()!.values.t, 2); assert.equal(store.get()!.ctx, f.ctx);
      } else if (mode === 'old-revision') assert.equal(store.get()!.error?.title, f.error.title);
      else if (mode === 'cancelled') assert.equal(store.get(), null);
      else assert.equal(store.get()!.error, undefined, 'late advice must not affect another Wall/opening/document');
    } finally { stop(); }
  });
}
