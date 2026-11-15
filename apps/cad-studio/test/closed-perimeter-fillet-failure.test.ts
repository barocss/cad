import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { sketch } from '@barocss/cad/api';
import { part } from '@barocss/cad-model/api';
import { commands, type Ctx } from '@barocss/cad-model/app/commands';
import { evaluateDoc, type BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { closedPerimeterFilletFailure } from '../src/state/closedPerimeterFilletFailure';
import { useCommandPreview } from '../src/state/useCommandPreview';
import { createValueStore } from '../src/state/valueStore';
import type { Active } from '../src/app/commandState';
import type { EngineClient } from '../src/engine/client';
import { FeatureFailureNotice } from '../src/ui/FeatureFailureNotice';

const fillet = commands.find(command => command.id === 'fillet')!;
function fixture() {
  const profile = sketch().moveTo([0, 0]).lineTo([8, 0]).arcTo([0, 8], { center: [0, 0] }).close();
  const doc = part('Quarter perimeter failure').extrude(profile, { h: 10 }).doc;
  const original = evaluateDoc(doc, 0); assert.ok(original.ok);
  const top = original.bodies[0].mesh.faces.find(face => face.kind === 'plane' && face.normal[2] > 0.99)!;
  const ctx: Ctx = { doc, bodies: original.bodies, selection: { edges: [], faces: [{ body: 0, face: top.index }], bodies: [] } };
  const values = { ...fillet.defaults!(ctx), radius: 0.6 }, candidate = fillet.build!(ctx, values);
  const refused = evaluateDoc(candidate, 1); assert.equal(refused.ok, false); if (refused.ok) throw new Error('Expected carrier failure');
  assert.equal(refused.error.code, 'GEOMETRY'); assert.match(refused.error.detail, /B-rep: tessellation: an edge of face .* does not lie on its surface/);
  return { ctx, values, candidate, error: refused.error };
}

test('current Constant mixed-perimeter carrier failure gets literal recovery while preserving native diagnostics, values and document', () => {
  const f = fixture(), before = structuredClone(f.ctx.doc), picks = structuredClone(f.ctx.selection), values = { ...f.values };
  const error = closedPerimeterFilletFailure(f.error, f.ctx, f.candidate); assert.ok(error);
  assert.equal(error.title, 'This perimeter fillet could not be built');
  assert.equal(error.hint, 'Switch to Edges and select only the curved rim, then try again.');
  assert.equal(f.error.feature, undefined, 'real tessellation failure has no feature field; owned carrier proves this candidate');
  assert.ok(closedPerimeterFilletFailure({ ...f.error, feature: f.candidate.nodes.at(-1)!.id }, f.ctx, f.candidate));
  assert.equal(error.detail, f.error.detail); assert.equal(error.code, f.error.code); assert.equal(error.feature, f.error.feature);
  assert.doesNotMatch(error.hint, /unsupported|tolerance|Constant|radius|Undo/i);
  const html = renderToStaticMarkup(createElement(FeatureFailureNotice, { error }));
  assert.match(html, /role="status"/); assert.match(html, /Kernel detail<\/summary><code>B-rep: tessellation:/);
  const top = f.ctx.selection.faces[0].face, arc = f.ctx.bodies[0].mesh.edges.find(edge => edge.faces.includes(top) && !edge.straight)!;
  const recovered = { ...f.ctx, selection: { edges: [{ body: 0, edge: arc.index }], faces: [], bodies: [] } };
  const open = fillet.build!(recovered, f.values), evaluated = evaluateDoc(open, 2); assert.ok(evaluated.ok, 'same Constant 0.6 curved-rim selection recovers');
  assert.deepEqual(f.ctx.doc, before); assert.deepEqual(f.ctx.selection, picks); assert.deepEqual(f.values, values);
});

test('other feature, reason, mode, source ownership and selection never acquire this perimeter explanation', () => {
  const f = fixture(), node = f.candidate.nodes.at(-1)!; assert.equal(node.kind, 'fillet'); if (node.kind !== 'fillet') return;
  const candidate = (change: Partial<typeof node>) => ({ ...f.candidate, nodes: [...f.ctx.doc.nodes, { ...node, ...change }] });
  for (const error of [
    { ...f.error, feature: '' }, { ...f.error, feature: 'upstream' }, { ...f.error, code: 'CAPABILITY' },
    { ...f.error, detail: 'B-rep: tessellation: different reason' }, { ...f.error, detail: f.error.detail + ' more' },
    { ...f.error, detail: 'B-rep: analytic Boolean: the result is not a manifold solid' },
    ...['n1_body0/s0/f6', 'tool_body0/s0/f6', 'n99_body0/s0/f6', `${node.id}_body1/s0/f6`, `${node.id}_body0/s1/f6`, `${node.id}_body0/s0/f6extra`]
      .map(carrier => ({ ...f.error, feature: undefined, detail: `B-rep: tessellation: an edge of face ${carrier} does not lie on its surface` })),
    { ...f.error, feature: node.id, detail: 'B-rep: tessellation: an edge of face n1_body0/s0/f6 does not lie on its surface' },
  ]) assert.equal(closedPerimeterFilletFailure(error, f.ctx, f.candidate), undefined);
  for (const other of [
    candidate({ radii: [{ at: [8, 0, 10], radius: 0.6 }, { at: [0, 8, 10], radius: 1.2 }] }),
    candidate({ section: { kind: 'conic', rho: 0.5 } }), candidate({ radius: NaN }), candidate({ radius: 0 }),
    candidate({ edges: ['wrong'] }), candidate({ edges: [...node.edges, node.edges[0]] }),
    candidate({ parent: { node: 0, side: 'solid' } }),
    { ...f.candidate, nodes: [...f.ctx.doc.nodes.map(original => ({ ...original })), node] },
    f.ctx.doc,
  ]) assert.equal(closedPerimeterFilletFailure(f.error, f.ctx, other as StudioDoc), undefined);
  const body = f.ctx.bodies[0], faces = f.ctx.selection.faces;
  for (const ctx of [
    { ...f.ctx, bodies: [{ ...body, key: 'foreign' }] }, { ...f.ctx, bodies: [body, body] },
    { ...f.ctx, bodies: [{ ...body, ref: undefined }] },
    { ...f.ctx, selection: { edges: [], faces: [], bodies: [] } },
    { ...f.ctx, selection: { edges: [{ body: 0, edge: 0 }], faces: [], bodies: [] } },
    { ...f.ctx, selection: { edges: [], faces: [...faces, faces[0]], bodies: [] } },
    { ...f.ctx, bodies: [{ ...body, mesh: { ...body.mesh, edges: body.mesh.edges.map(edge => ({ ...edge, nativeCircle: undefined })) } }] },
  ]) assert.equal(closedPerimeterFilletFailure(f.error, ctx, f.candidate), undefined);
});

(globalThis as { window?: unknown }).window ??= globalThis;
for (const mode of ['current', 'old-revision', 'replaced-values', 'retired'] as const) {
  test(`actual preview hook applies recovery only to its owned current candidate: ${mode}`, async () => {
    const f = fixture(), active: Active = { cmd: fillet, ctx: f.ctx, values: f.values, preview: 'busy' };
    const store = createValueStore<Active | null>(active), previews: (BodyResult[] | null)[] = [];
    let started!: () => void, answer!: (error: FriendlyError) => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const result = new Promise<FriendlyError>(resolve => { answer = resolve; });
    const engine = { preview: async (_candidate: StudioDoc, revision: number) => { started(); return { ok: false, revision: mode === 'old-revision' ? revision + 1 : revision, error: await result }; } };
    let preview!: ReturnType<typeof useCommandPreview>;
    function Probe() { preview = useCommandPreview({ command: { activeStore: store, bearingRootCurrent: true },
      worker: { engine: engine as unknown as EngineClient, nextRevision: () => 3, currentBearingDoc: () => f.ctx.doc },
      result: { previewFor: { current: null }, setPreviewBodies: value => { if (typeof value !== 'function') previews.push(value); } } }); return null; }
    renderToStaticMarkup(createElement(Probe)); const stop = preview.watch();
    try {
      await began;
      if (mode === 'replaced-values') { store.set({ ...active, values: { ...f.values, radius: 0.8 } }); stop(); }
      if (mode === 'retired') preview.retire();
      answer(f.error); await sleep(5);
      if (mode === 'current') {
        assert.equal(store.get()!.preview, 'error'); assert.equal(store.get()!.error?.title, 'This perimeter fillet could not be built');
        assert.equal(store.get()!.error?.detail, f.error.detail); assert.equal(previews.at(-1), null);
      } else if (mode === 'old-revision') assert.equal(store.get()!.error?.title, f.error.title);
      else assert.equal(store.get()!.error, undefined, 'stale/retired failure cannot publish advice');
      assert.equal(store.get()!.ctx.doc, f.ctx.doc); assert.equal(store.get()!.values.radius, mode === 'replaced-values' ? 0.8 : 0.6);
    } finally { stop(); }
  });
}
