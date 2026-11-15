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
const temporary = await mkdtemp(join(tmpdir(), 'fillet-interior-preview-'));
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
function fixture(at: number | string = 25) {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { clearTimeout, setTimeout } });
  const doc = rectanglePart(40, 30, 10), evaluated = evaluateDoc(doc, 0); assert.ok(evaluated.ok);
  const edge = evaluated.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  const active = newFilletActive('edge', { doc, bodies: evaluated.bodies, selection: { faces: [], edges: [{ body: 0, edge }], bodies: [] } }, { radius: 1, endRadius: 4, stationMode: 'interior', stationAt: at, stationRadius: 2 });
  const store = createValueStore<Active | null>(active), calls: { doc: StudioDoc; revision: number }[] = [], shown: unknown[] = [], previewFor = { current: null as string | null };
  let work: (doc: StudioDoc, revision: number) => Promise<EvalResult> = async (_doc, revision) => ({ ...evaluated, revision });
  const engine = { preview(doc: StudioDoc, revision: number) { calls.push({ doc, revision }); return work(doc, revision); } } as EngineClient;
  let revision = 0;
  const api = useCommandPreview({ command: { activeStore: store, bearingRootCurrent: true }, worker: { engine, nextRevision: () => ++revision, currentBearingDoc: () => doc }, result: { setPreviewBodies: value => { shown.push(value); }, previewFor } });
  const stop = api.watch();
  return { store, calls, shown, previewFor, api,
    work(next: typeof work) { work = next; },
    set(at: number | string) { store.set(a => a && { ...a, values: { ...a.values, stationAt: at }, preview: 'busy' }); },
    cleanup() { stop(); api.retire(); if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow); else Reflect.deleteProperty(globalThis, 'window'); },
  };
}
test('invalid creation fractions stop before build/worker and correction clears the field-tagged refusal', async () => {
  const h = fixture(0);
  try {
    assert.equal(h.store.get()?.preview, 'error'); assert.equal(h.store.get()?.error?.historyField, 'stationAt'); assert.equal(h.calls.length, 0);
    for (const at of [100, '', -1, Infinity, 1e-7]) { h.set(at); assert.equal(h.store.get()?.preview, 'error'); assert.equal(h.calls.length, 0); }
    h.set(25); await until(() => h.store.get()?.preview === 'ok'); assert.equal(h.calls.length, 1); assert.equal(h.store.get()?.error, undefined);
    const terminal = h.calls[0].doc.nodes.at(-1); assert.equal(terminal?.kind, 'fillet'); if (terminal?.kind === 'fillet') assert.equal(terminal.radii?.[1].fraction, 0.25);
  } finally { h.cleanup(); }
});
test('an in-flight success cannot erase a newer local invalid draft or publish a stale preview; correction can preview again', async () => {
  const h = fixture();
  try {
    let release!: (value: EvalResult) => void;
    h.work(async () => new Promise(resolve => { release = resolve; })); await until(() => h.calls.length === 1);
    const pending = h.calls[0]; h.set(0); assert.equal(h.store.get()?.error?.historyField, 'stationAt');
    const evaluated = evaluateDoc(rectanglePart(40, 30, 10), pending.revision); release(evaluated); await tick();
    assert.equal(h.store.get()?.preview, 'error'); assert.equal(h.previewFor.current, null); assert.ok(h.shown.every(value => value === null));
    h.work(async (_doc, revision) => ({ ...evaluated, revision })); h.set(35); await until(() => h.store.get()?.preview === 'ok');
    assert.equal(h.calls.length, 2); assert.equal(h.store.get()?.values.stationAt, 35);
  } finally { h.cleanup(); }
});
test('a native-valid numeric draft retains an unrelated worker refusal and cancellation retires a pending reply', async () => {
  const h = fixture();
  try {
    h.work(async (_doc, revision) => ({ ok: false, revision, wallTime: 0, error: { title: 'Native capability refused', hint: 'Pick another edge.', detail: '[NATIVE_TEST] unrelated geometry refusal' } }));
    await until(() => h.store.get()?.preview === 'error'); assert.equal(h.calls.length, 1); assert.equal(h.store.get()?.error?.historyField, undefined); assert.match(h.store.get()?.error?.detail ?? '', /NATIVE_TEST/);
    let release!: (value: EvalResult) => void;
    h.work(async () => new Promise(resolve => { release = resolve; })); h.set(35); await until(() => h.calls.length === 2);
    h.api.retire(); h.store.set(null); release(evaluateDoc(rectanglePart(40, 30, 10), h.calls[1].revision)); await tick();
    assert.equal(h.store.get(), null); assert.equal(h.previewFor.current, null);
  } finally { h.cleanup(); }
});
