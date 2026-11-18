import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { useNamedInspection as Hook } from '../src/state/useNamedInspection';
const { build } = createRequire(resolve('package.json'))('esbuild') as typeof import('esbuild');
const holder = globalThis as typeof globalThis & { __inspectionHooks?: { useState(v: unknown): unknown; useRef(v: unknown): unknown } };

test('session Rename changes only names and rejects stale or invalid callbacks atomically', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'cad-inspection-')), old = holder.__inspectionHooks;
  try {
    const file = join(temp, 'hook.mjs');
    await build({ entryPoints: [resolve('src/state/useNamedInspection.ts')], outfile: file, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent', plugins: [{ name: 'hooks', setup(b) {
      b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'hooks' }));
      b.onLoad({ filter: /.*/, namespace: 'hooks' }, () => ({ contents: 'export const useState=v=>globalThis.__inspectionHooks.useState(v),useRef=v=>globalThis.__inspectionHooks.useRef(v);' }));
    } }] });
    const { useNamedInspection } = await import(pathToFileURL(file).href) as { useNamedInspection: typeof Hook };
    const slots: unknown[] = []; let cursor = 0, dirty = false;
    holder.__inspectionHooks = {
      useState(v) { const i = cursor++; if (!(i in slots)) slots[i] = typeof v === 'function' ? v() : v; return [slots[i], (next: unknown) => { slots[i] = next; dirty = true; }]; },
      useRef(v) { const i = cursor++; if (!(i in slots)) slots[i] = { current: v }; return slots[i]; },
    };
    // Fake-hooks unit only: no DOM events, browser rendering or document persistence is qualified.
    interface SavedProbe { id: string; name: string; camera: unknown; visibleKeys: unknown; signature: unknown }
    interface StateProbe { rows: SavedProbe[]; serial: number; owner: object; renameScope: object; signature: unknown; transaction: unknown; restoreCamera: unknown; applied: unknown; active: unknown }
    const state = () => slots[0] as StateProbe; // The same hook slot instrumentation as lifecycle/update tests.
    let camera = { target: [0, 0, 0] as [number, number, number], distance: 50, yaw: 0, pitch: 0, fovY: 1, ortho: false };
    let cameraReads = 0;
    const input: Parameters<typeof Hook>[0] = { owner: {}, bodies: [{ key: 'a', mesh: {}, hidden: false }, { key: 'b', mesh: {}, hidden: false }], reason: undefined,
      getCamera: () => { cameraReads++; return camera; } };
    const render = () => { for (let i = 0; i < 6; i++) { cursor = 0; dirty = false; const value = useNamedInspection(input); if (!dirty) return value; } throw Error('unsettled'); };
    assert.equal(render().capture('All'), true);
    camera = { ...camera, distance: 60 };
    assert.equal(render().capture('Only A', ['a']), true);
    const [all, subset] = render().rows.map(row => row.id);
    camera = { ...camera, distance: 80 };
    assert.equal(render().apply(subset), true);
    // Pending Apply transaction must survive renaming before camera observation too.
    const renameOnly = (id: string, name: string, expected: string) => {
      const api = render(), before = state(), reads = cameraReads;
      const names = before.rows.map(row => row.id === id ? expected : row.name);
      assert.equal(api.rename(id, name), true);
      const after = state();
      assert.equal(cameraReads, reads, 'Rename never reads the current camera');
      for (const key of ['serial', 'owner', 'renameScope', 'signature', 'transaction', 'restoreCamera', 'applied', 'active'] as const) assert.equal(after[key], before[key], key);
      assert.deepEqual(after.rows.map(row => row.id), before.rows.map(row => row.id));
      assert.deepEqual(after.rows.map(row => row.name), names);
      after.rows.forEach((row, index) => {
        const oldRow = before.rows[index];
        assert.equal(row.camera, oldRow.camera); assert.equal(row.visibleKeys, oldRow.visibleKeys); assert.equal(row.signature, oldRow.signature);
        if (row.id !== id) assert.equal(row, oldRow, 'other saved row retains identity');
      });
      assert.equal(render().transaction, api.transaction);
      assert.equal(render().visibleKeys, api.visibleKeys);
      return { before, after };
    };
    renameOnly(subset, '  Selected A  ', 'Selected A');
    render().observeCamera({ ...camera, distance: 60 });
    assert.equal(render().rows[1].active, true);
    const token = render().transaction!.token, restore = state().restoreCamera;
    renameOnly(subset, 'Renamed active', 'Renamed active');
    assert.equal(render().rows[1].active, true);
    assert.equal(render().transaction!.token, token);
    renameOnly(all, 'Renamed active', 'Renamed active');
    assert.equal(render().rows[1].active, true, 'renaming another row preserves active row');
    assert.equal(state().restoreCamera, restore);
    const unchanged = renameOnly(all, '  Renamed active  ', 'Renamed active');
    assert.equal(unchanged.after, unchanged.before, 'same normalized name succeeds without publishing');
    renameOnly(all, 'x', 'x');
    renameOnly(all, 'x'.repeat(80), 'x'.repeat(80));

    const reject = (action: () => boolean) => {
      const before = state(), snapshot = structuredClone(before), reads = cameraReads;
      assert.equal(action(), false); assert.equal(state(), before, 'refusal publishes nothing');
      assert.deepEqual(state(), snapshot, 'refusal does not mutate retained state');
      assert.equal(cameraReads, reads);
    };
    for (const name of ['', '   ', 'x'.repeat(81), undefined, null, 123, {}, []]) {
      const api = render();
      // Deliberately exercise runtime admission beyond the TypeScript string surface.
      reject(() => api.rename(all, name as string));
    }
    reject(() => render().rename('missing', 'Valid'));
    const staleAfterPublish = render().rename;
    renameOnly(all, 'Fresh name', 'Fresh name');
    reject(() => staleAfterPublish(all, 'Stale callback'));
    let currentOwner = false; input.isCurrent = () => currentOwner;
    reject(() => render().rename(all, 'Pending Open'));
    currentOwner = true;
    const beforeReason = render().rename;
    input.reason = 'Section active'; render();
    reject(() => render().rename(all, 'Blocked'));
    reject(() => beforeReason(all, 'Blocked stale'));
    input.reason = undefined; render();
    // Reapply after the mode cleared the prior display state, then check original Restore semantics independently.
    camera = { ...camera, distance: 95 };
    assert.equal(render().apply(subset), true);
    const beforeRestore = state().restoreCamera;
    renameOnly(subset, 'Final A', 'Final A');
    assert.equal(state().restoreCamera, beforeRestore);
    assert.equal(render().restore(), true);
    assert.equal(render().transaction!.camera.distance, 95);
    assert.equal(render().visibleKeys, null);
    render().remove(all);
    assert.equal(render().capture('Third'), true);
    assert.equal(render().rows[1].id, 'inspection-3', 'renames never consume a serial');

    // Establish an actual old inspection-1 before testing ID reuse, not a closure missing that ID.
    input.owner = {}; assert.equal(render().rows.length, 0);
    assert.equal(render().capture('Old identity'), true);
    assert.equal(render().rows[0].id, 'inspection-1');
    // Owner and mesh resets each reuse inspection-1. An old closure must not rename the new row.
    for (const reset of ['owner', 'mesh'] as const) {
      const oldApi = render(), oldRename = oldApi.rename;
      if (reset === 'owner') input.owner = {};
      else input.bodies = input.bodies.map(body => ({ ...body, mesh: {} }));
      assert.equal(render().rows.length, 0);
      assert.notEqual(render().renameScope, oldApi.renameScope, 'draft scope changes on source reset');
      assert.equal(render().capture('Replacement'), true);
      assert.equal(render().rows[0].id, 'inspection-1');
      reject(() => oldRename('inspection-1', 'Wrong owner'));
      assert.equal(render().rows[0].name, 'Replacement');
      assert.equal(render().rename('inspection-1', 'Current owner'), true);
    }
    const beforeHidden = render().rename;
    input.bodies = input.bodies.map(body => ({ ...body, hidden: true }));
    assert.equal(render().rows.length, 0);
    reject(() => beforeHidden('inspection-1', 'Hidden source'));
  } finally { holder.__inspectionHooks = old; await rm(temp, { recursive: true, force: true }); }
});
