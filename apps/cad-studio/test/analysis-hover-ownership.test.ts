import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { useOwnedScalarHover as Hook } from '../src/viewport/useOwnedScalarHover';

type Hooks = { useRef(value: unknown): unknown; useState(value: unknown): unknown; useCallback(callback: unknown, deps: unknown[]): unknown; useMemo(make: () => unknown, deps: unknown[]): unknown };
const shared = globalThis as typeof globalThis & { __scalarHoverHooks?: Hooks };
const studio = existsSync(resolve('src/viewport/useOwnedScalarHover.ts')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'analysis-hover-'));
let useOwnedScalarHover: typeof Hook;
try {
  const outfile = join(temporary, 'hook.mjs');
  await build({ entryPoints: [join(studio, 'src/viewport/useOwnedScalarHover.ts')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'hover-hooks', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'hover-hooks' }));
      builder.onLoad({ filter: /.*/, namespace: 'hover-hooks' }, () => ({ contents: 'export const useRef=(...a)=>globalThis.__scalarHoverHooks.useRef(...a),useState=(...a)=>globalThis.__scalarHoverHooks.useState(...a),useCallback=(...a)=>globalThis.__scalarHoverHooks.useCallback(...a),useMemo=(...a)=>globalThis.__scalarHoverHooks.useMemo(...a);' }));
    } }],
  });
  ({ useOwnedScalarHover } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }
function fixture() {
  const old = shared.__scalarHoverHooks;
  const refs: { current: unknown }[] = [], states: unknown[] = [], callbacks: { callback: unknown; deps: unknown[] }[] = [], queued: (() => void)[] = [];
  const memos: { value: unknown; deps: unknown[] }[] = [];
  let refIndex = 0, stateIndex = 0, callbackIndex = 0, memoIndex = 0, deferred = false, writes = 0;
  shared.__scalarHoverHooks = {
    useRef(value) { return refs[refIndex++] ??= { current: value }; },
    useState(value) { const index = stateIndex++; if (!(index in states)) states[index] = value;
      return [states[index], (next: unknown) => { const apply = () => { const result = typeof next === 'function' ? next(states[index]) : next;
        if (!Object.is(result, states[index])) { states[index] = result; writes++; } };
      if (deferred) queued.push(apply); else apply(); }]; },
    useMemo(make, deps) { const index = memoIndex++, previous = memos[index];
      if (!previous || !deps.every((value, i) => Object.is(previous.deps[i], value))) memos[index] = { value: make(), deps };
      return memos[index].value; },
    useCallback(callback, deps) { const index = callbackIndex++, previous = callbacks[index];
      if (!previous || !deps.every((value, i) => Object.is(previous.deps[i], value))) callbacks[index] = { callback, deps };
      return callbacks[index].callback; },
  };
  return { render(owner: object | null) { refIndex = stateIndex = callbackIndex = memoIndex = 0; return useOwnedScalarHover(owner); },
    defer(value: boolean) { deferred = value; }, flush() { while (queued.length) queued.shift()!(); }, get writes() { return writes; },
    cleanup() { shared.__scalarHoverHooks = old; } };
}

test('a stable displayed owner keeps hover values and callback identity without repeated writes; zero is a sample', () => {
  const h = fixture(), owner = {};
  try {
    const first = h.render(owner); assert.equal(first.hover, null); first.setHover(6);
    const shown = h.render(owner); assert.equal(shown.hover, 6); assert.equal(shown.setHover, first.setHover);
    const writes = h.writes; shown.setHover(6); assert.equal(h.writes, writes);
    shown.setHover(0); assert.equal(h.render(owner).hover, 0, 'Access zero must not be treated as missing');
    shown.setHover(value => value === null ? 1 : value + 1); assert.equal(h.render(owner).hover, 1);
    shown.setHover(null); assert.equal(h.render(owner).hover, null);
    for (const value of [NaN, Infinity, -Infinity]) { shown.setHover(value); assert.equal(h.render(owner).hover, null); }
  } finally { h.cleanup(); }
});

test('same-ID document replacement, visibility/map result changes and returning to an old owner cannot resurrect a sample', () => {
  const h = fixture(), a = { document: { id: 'same', height: 6 }, maps: [{}] }, b = { document: { id: 'same', height: 3 }, maps: [{}] };
  try {
    h.render(a).setHover(6); assert.equal(h.render(a).hover, 6);
    const old = h.render(a).setHover;
    assert.equal(h.render(b).hover, null, 'clear during render, before any effect');
    h.render(b).setHover(3); old(6); old(null); assert.equal(h.render(b).hover, 3, 'stale callbacks cannot overwrite or clear a newer sample');
    for (const owner of [{ hidden: new Set(['tall']) }, { hidden: new Set(['tall', 'short']) }, { shown: ['short'] }, { map: 'access' }, { result: [{}] }]) {
      assert.equal(h.render(owner).hover, null); h.render(owner).setHover(0); assert.equal(h.render(owner).hover, 0);
    }
    assert.equal(h.render(null).hover, null); h.render(null).setHover(9); assert.equal(h.render(null).hover, null);
    assert.equal(h.render(a).hover, null, 'an old source coming back is not a pinned sample');
  } finally { h.cleanup(); }
});

test('delayed Access callbacks and queued state updates cannot publish after their displayed owner changes', async () => {
  const h = fixture(), oldMap = {}, newMap = {};
  try {
    const old = h.render(oldMap).setHover;
    h.defer(true); old(0); h.render(newMap); h.flush(); assert.equal(h.render(newMap).hover, null);
    h.defer(false); h.render(newMap).setHover(3);
    await Promise.resolve().then(() => old(0)); assert.equal(h.render(newMap).hover, 3);
    assert.equal(h.render(null).hover, null, 'pending/disabled maps expose no old sample');
  } finally { h.cleanup(); }
});


test('A to null or B to the same A is a new epoch even without an intervening sample; old callbacks stay retired', () => {
  for (const between of [null, {}]) {
    const h = fixture(), a = {};
    try {
      const old = h.render(a).setHover; old(6); assert.equal(h.render(a).hover, 6);
      assert.equal(h.render(between).hover, null); assert.equal(h.render(a).hover, null);
      const current = h.render(a).setHover; assert.notEqual(current, old);
      current(3); old(6); old(null); assert.equal(h.render(a).hover, 3);
    } finally { h.cleanup(); }
  }
});
