import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { useTwoPointSnap as Hook } from '../src/sketch/useTwoPointSnap';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { SketchState } from '@barocss/cad-model/sketch/types';
import type { ViewportHandle } from '../src/viewport/Viewport';

// Actual production hook and Model arithmetic, controlled React slots/effect scheduling.
// This does not run React DOM, App's setSketch wrapper, or the real viewport gesture.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
 type Slot = any;
const shared = globalThis as typeof globalThis & { __twoPointOwnershipHooks?: Slot };
const studio = existsSync(resolve('src/sketch/useTwoPointSnap.ts')) ? process.cwd() : resolve('apps/cad-studio');
const { build } = createRequire(join(studio, 'package.json'))('esbuild') as typeof import('esbuild');
const temporary = await mkdtemp(join(tmpdir(), 'two-point-ownership-'));
let useTwoPointSnap: typeof Hook;
try {
  const outfile = join(temporary, 'hook.mjs');
  await build({ entryPoints: [join(studio, 'src/sketch/useTwoPointSnap.ts')], outfile, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    plugins: [{ name: 'controlled-hooks', setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'controlled-hooks' }));
      builder.onLoad({ filter: /.*/, namespace: 'controlled-hooks' }, () => ({ contents: 'export const useState=(...a)=>globalThis.__twoPointOwnershipHooks.useState(...a),useRef=(...a)=>globalThis.__twoPointOwnershipHooks.useRef(...a),useMemo=(...a)=>globalThis.__twoPointOwnershipHooks.useMemo(...a),useEffect=(...a)=>globalThis.__twoPointOwnershipHooks.useEffect(...a);' }));
    } }],
  });
  ({ useTwoPointSnap } = await import(pathToFileURL(outfile).href));
} finally { await rm(temporary, { recursive: true, force: true }); }

function rig(run: (r: ReturnType<typeof setup>) => void) {
  const previous = shared.__twoPointOwnershipHooks;
  const r = setup();
  try { run(r); } finally { shared.__twoPointOwnershipHooks = previous; }
}
function setup() {
  const slots: Slot[] = [], effects: (() => void)[] = []; let cursor = 0, writes = 0;
  const same = (a: unknown[] | undefined, b: unknown[]) => !!a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  shared.__twoPointOwnershipHooks = {
    useRef(value: unknown) { return slots[cursor++] ??= { current: value }; },
    useState(value: unknown) { const i = cursor++; if (!(i in slots)) slots[i] = value;
      return [slots[i], (next: Slot) => { writes++; slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useMemo(make: () => unknown, deps: unknown[]) { const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: make() }; return slots[i].value; },
    useEffect(effect: () => void, deps: unknown[]) { const i = cursor++;
      if (!slots[i] || !same(slots[i], deps)) { slots[i] = deps; effects.push(effect); } },
  };
  const doc: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', nodes: [], outputs: {}, parameters: {}, nextId: 0 };
  const docNow = { current: doc }, generation = { current: 1 };
  let sketch: SketchState = { plane: { origin: [0, 0, 0], normal: [0, 0, 1], xAxis: [1, 0, 0] }, tool: 'rectangle', shape: null, base: null,
    done: [{ kind: 'polygon', construction: true, closed: false, points: [[0, 0], [12, 0]] }] };
  const calls: { owner: SketchState; at: [number, number] }[] = [];
  const viewport = { current: { startRectangleAt(owner: SketchState, at: [number, number]) { calls.push({ owner, at }); return true; } } as ViewportHandle };
  const render = () => { cursor = 0; return useTwoPointSnap(docNow.current, sketch, docNow, generation, viewport); };
  const arm = () => { const state = render(); assert.equal(state.available, true); state.begin();
    const points = state.input.read()!.points; state.input.pick(points[0]); state.input.pick(points[1]); state.setValue('0.25');
    assert.deepEqual(state.input.read()?.preview, [3, 0]); return state; };
  return { doc, docNow, generation, calls, render, arm, writes: () => writes,
    replaceSketch() { sketch = { ...sketch, hideConstruction: true }; generation.current++; },
    flushEffects() { for (const effect of effects.splice(0)) effect(); } };
}

test('generation invalidates stale reads and callbacks before render or passive effects', () => rig(r => {
  const state = r.arm(), point = state.input.read()!.points[0], before = r.writes();
  r.replaceSketch(); // Mirrors App's synchronous generation increment, not an App integration test.
  assert.equal(state.input.read(), null);
  state.input.pick(point); state.setValue('0.75'); state.setMode('distance'); state.apply(); state.begin();
  assert.equal(state.cancel(), false); assert.equal(r.writes(), before); assert.equal(r.calls.length, 0);
  assert.equal(r.render().visible, null); r.flushEffects(); assert.equal(r.render().input.read(), null);
}));

test('document replacement rejects captured callbacks even with unchanged generation', () => rig(r => {
  const state = r.arm(), point = state.input.read()!.points[0], before = r.writes();
  r.docNow.current = structuredClone(r.doc);
  assert.equal(state.input.read(), null); state.input.pick(point); state.setValue('2'); state.apply(); state.begin();
  assert.equal(state.cancel(), false); assert.equal(r.writes(), before); assert.equal(r.calls.length, 0);
  assert.equal(r.render().visible, null); r.flushEffects(); assert.equal(r.render().input.read(), null);
}));

test('Cancel retires pending point synchronously and a fresh attempt transfers exactly once', () => rig(r => {
  const state = r.arm(); assert.equal(state.cancel(), true); assert.equal(state.input.read(), null);
  state.apply(); state.apply(); assert.equal(state.cancel(), false); assert.equal(r.calls.length, 0);
  const fresh = r.arm(); fresh.apply(); fresh.apply(); fresh.input.pick({ kind: 'end', at: [12, 0] });
  assert.equal(r.calls.length, 1); assert.deepEqual(r.calls[0].at, [3, 0]);
  assert.equal(fresh.input.read(), null); assert.equal(r.render().visible, null);
  assert.deepEqual(r.doc, { format: 'barocss-cad-model', schema: 3, units: 'mm', nodes: [], outputs: {}, parameters: {}, nextId: 0 });
}));
