import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { useGpuAccessMaps as Hook } from '../src/viewport/useGpuMaps';

type Hooks = { useState(value: unknown): unknown; useEffect(effect: () => (() => void) | void, deps: unknown[]): void };
const shared = globalThis as typeof globalThis & { __accessOwnerHooks?: Hooks; __accessOwnerJobs?: ((value: number) => void)[] };
const studio = existsSync(resolve('src/viewport/useGpuMaps.ts')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'access-owner-'));
let useGpuAccessMaps: typeof Hook;
try {
  const outfile = join(temporary, 'access.mjs');
  await build({ entryPoints: [join(studio, 'src/viewport/useGpuMaps.ts')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'access-owner', setup(builder) {
      builder.onResolve({ filter: /^(react|@barocss\/gpu)$/ }, args => args.importer.endsWith('/useGpuMaps.ts') ? { path: args.path, namespace: 'access-owner' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'access-owner' }, ({ path }) => ({ contents: path === 'react'
        ? 'export const useState=(...a)=>globalThis.__accessOwnerHooks.useState(...a),useEffect=(...a)=>globalThis.__accessOwnerHooks.useEffect(...a);'
        : 'export const computeExperimental={accessSampleSet:()=>({}),packBvh:()=>({}),gpuAccessMasks:()=>new Promise(resolve=>globalThis.__accessOwnerJobs.push(resolve)),accessByTriangle:(_samples,value)=>({unreachedShare:Float32Array.of(value)})};' }));
    } }],
  });
  ({ useGpuAccessMaps } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }

// Actual async hook; controlled compute replies test publication ownership only,
// not WebGPU ray tracing, access accuracy, or the analysis map's physical meaning.
test('old Access replies and same-ID bodies cannot revive a previous result after source replacement or deactivation', async () => {
  const oldHooks = shared.__accessOwnerHooks, oldJobs = shared.__accessOwnerJobs, states: unknown[] = [];
  const jobs: ((value: number) => void)[] = []; shared.__accessOwnerJobs = jobs;
  const lifecycle: { cleanup?: () => void } = {};
  let stateIndex = 0, dependencies: unknown[] | undefined, pending: (() => (() => void) | void) | undefined;
  shared.__accessOwnerHooks = {
    useState(value) { const index = stateIndex++; if (!(index in states)) states[index] = value; return [states[index], (next: unknown) => { states[index] = next; }]; },
    useEffect(effect, deps) { if (!dependencies || !deps.every((value, i) => Object.is(dependencies![i], value))) { dependencies = deps; pending = effect; } },
  };
  const device = () => ({});
  const body = (height: number) => [{ key: 'same-id', mesh: { positions: new Float64Array([0, 0, 0, 1, 0, height, 0, 1, height]), indices: new Uint32Array([0, 1, 2]), bounds: { min: [0, 0, 0], max: [1, 1, height] } } }] as unknown as BodyResult[];
  const a = body(6), b = body(3);
  const render = (active: boolean, bodies: BodyResult[]) => { stateIndex = 0; return useGpuAccessMaps(active, bodies, device); };
  const effects = () => { const effect = pending; pending = undefined; if (effect) { lifecycle.cleanup?.(); const next = effect(); lifecycle.cleanup = typeof next === 'function' ? next : undefined; } };
  const resolveJob = async (index: number, value: number) => { assert.ok(jobs[index]); jobs[index](value); await Promise.resolve(); await Promise.resolve(); };
  try {
    assert.equal(render(true, a).state, 'pending'); effects(); assert.equal(jobs.length, 1);
    assert.equal(render(true, b).state, 'pending'); effects(); assert.equal(jobs.length, 2);
    await resolveJob(0, 0.75); assert.equal(render(true, b).state, 'pending', 'late old-source reply is ignored');
    await resolveJob(1, 0); const current = render(true, b);
    assert.equal(current.state, 'ready'); assert.equal(current.maps?.[0].body, 'same-id'); assert.equal(current.maps?.[0].values[0], 0);
    assert.equal(render(false, b).state, 'cpu'); effects();
    assert.equal(render(true, b).state, 'pending'); effects(); assert.equal(jobs.length, 3);
    assert.equal(render(true, a).state, 'pending'); effects(); assert.equal(jobs.length, 4);
    await resolveJob(2, 0.5); assert.equal(render(true, a).state, 'pending', 'reopened same-ID source cannot consume another epoch reply');
    await resolveJob(3, 0.25); assert.equal(render(true, a).maps?.[0].values[0], 0.25);
  } finally { lifecycle.cleanup?.(); shared.__accessOwnerHooks = oldHooks; shared.__accessOwnerJobs = oldJobs; }
});
