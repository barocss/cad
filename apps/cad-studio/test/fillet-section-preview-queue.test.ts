import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, type EvalResult } from '@barocss/cad-model/engine/evaluate';
import { newFilletActive } from '../src/app/filletFamily';
import { createValueStore } from '../src/state/valueStore';
import type { Active } from '../src/app/commandState';
import type { EngineClient } from '../src/engine/client';
import type { useCommandPreview as Hook } from '../src/state/useCommandPreview';

// The real queue/subscription runs once, with controlled worker replies. Only
// React's hook storage is adapted; this does not mount a browser or prove CAD geometry.
const studio = existsSync(resolve('src/state/useCommandPreview.ts')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'fillet-section-preview-'));
let useCommandPreview: typeof Hook;
try {
  const outfile = join(temporary, 'preview.mjs');
  await build({ entryPoints: [join(studio, 'src/state/useCommandPreview.ts')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'preview-hooks', setup(builder) {
    builder.onResolve({ filter: /^react$/ }, args => args.importer.endsWith('/useCommandPreview.ts') ? { path: 'react', namespace: 'preview-hooks' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'preview-hooks' }, () => ({ contents: 'export const useRef=current=>({current}),useCallback=f=>f;' }));
  } }] });
  ({ useCommandPreview } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }
const tick = () => new Promise(resolve => setTimeout(resolve, 15));
async function until(condition: () => boolean) { for (let i = 0; i < 100; i++) { if (condition()) return; await tick(); } assert.fail('Preview did not settle'); }
function fixture(kind: 'conic' | 'g2' = 'conic', value: number | string = 0.4) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { clearTimeout, setTimeout } });
  const doc = rectanglePart(40, 30, 10), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  const key = kind === 'conic' ? 'rho' : 'tension';
  const active = newFilletActive('edge', { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [{ body: 0, edge }], bodies: [] } }, { radius: 4, endRadius: 0, stationMode: 'ends', shape: kind, rho: 0.4, tension: 0.4, [key]: value });
  const store = createValueStore<Active | null>(active), calls: { doc: StudioDoc; revision: number }[] = [], shown: unknown[] = [], previewFor = { current: null as string | null };
  let work: (doc: StudioDoc, revision: number) => Promise<EvalResult> = async (_doc, revision) => ({ ...evaluated, revision });
  const engine = { preview(doc: StudioDoc, revision: number) { calls.push({ doc, revision }); return work(doc, revision); } } as EngineClient;
  let revision = 0;
  const api = useCommandPreview({ command: { activeStore: store, bearingRootCurrent: true }, worker: { engine, nextRevision: () => ++revision, currentBearingDoc: () => doc }, result: { setPreviewBodies: value => { shown.push(value); }, previewFor } });
  const stop = api.watch();
  return { key, store, calls, shown, previewFor, api,
    work(next: typeof work) { work = next; },
    set(value: number | string) { store.set(a => a && { ...a, values: { ...a.values, [key]: value }, preview: 'busy' }); },
    cleanup() { stop(); api.retire(); if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window'); },
  };
}
for (const kind of ['conic', 'g2'] as const) test(`${kind} invalid section values stop before worker; exact .005/.995 recover without generic missing errors`, async () => {
  const h = fixture(kind, '');
  try {
    assert.equal(h.store.get()?.preview, 'error'); assert.equal(h.store.get()?.error?.historyField, h.key); assert.equal(h.calls.length, 0);
    for (const value of [0, 1, -1, 2, '', 'NaN', Infinity]) {
      h.set(value); assert.equal(h.store.get()?.preview, 'error'); assert.equal(h.store.get()?.error?.historyField, h.key); assert.equal(h.calls.length, 0);
      assert.match(h.store.get()?.error?.hint ?? '', /Unitless section shape/);
    }
    for (const value of [0.005, 0.995]) {
      h.set(value); await until(() => h.store.get()?.preview === 'ok'); assert.equal(h.store.get()?.error, undefined);
      const node = h.calls.at(-1)!.doc.nodes.at(-1); assert.equal(node?.kind, 'fillet');
      if (node?.kind === 'fillet') assert.deepEqual(node.section, kind === 'conic' ? { kind, rho: value } : { kind, tension: value });
    }
  } finally { h.cleanup(); }
});
test('hidden section values do not stop preview, and valid numeric geometry refusals retain their detail', async () => {
  const h = fixture();
  try {
    h.store.set(a => a && { ...a, values: { ...a.values, tension: 0 }, preview: 'busy' });
    await until(() => h.store.get()?.preview === 'ok'); assert.equal(h.store.get()?.error, undefined);
    h.work(async (_doc, revision) => ({ ok: false, revision, wallTime: 0, error: { title: 'Native capability refused', hint: 'Pick another edge.', detail: '[NATIVE_TEST] unrelated geometry refusal' } }));
    h.set(0.65); await until(() => h.store.get()?.preview === 'error');
    assert.equal(h.store.get()?.error?.historyField, undefined); assert.match(h.store.get()?.error?.detail ?? '', /NATIVE_TEST/);
  } finally { h.cleanup(); }
});
test('in-flight old success cannot replace newer invalid section feedback; correction and cancellation retain lifetime ownership', async () => {
  const h = fixture();
  try {
    let release!: (value: EvalResult) => void;
    h.work(async () => new Promise(resolve => { release = resolve; })); await until(() => h.calls.length === 1);
    const pending = h.calls[0]; h.set(1); assert.equal(h.store.get()?.error?.historyField, 'rho');
    const evaluated = evaluateDoc(rectanglePart(40, 30, 10), pending.revision); release(evaluated); await tick();
    assert.equal(h.store.get()?.preview, 'error'); assert.equal(h.previewFor.current, null); assert.ok(h.shown.every(value => value === null));
    h.work(async (_doc, revision) => ({ ...evaluated, revision })); h.set(0.65); await until(() => h.store.get()?.preview === 'ok');
    assert.equal(h.store.get()?.values.rho, 0.65);
    h.work(async () => new Promise(resolve => { release = resolve; })); h.set(0.7); await until(() => h.calls.length === 3);
    h.api.retire(); h.store.set(null); release({ ...evaluated, revision: h.calls[2].revision }); await tick();
    assert.equal(h.store.get(), null); assert.equal(h.previewFor.current, null);
  } finally { h.cleanup(); }
});
