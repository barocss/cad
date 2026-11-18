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

test('inspection lifecycle rejects stale owners/meshes and captures only the currently shown subset', async () => {
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
    let camera = { target: [0, 0, 0] as [number, number, number], distance: 50, yaw: 0, pitch: 0, fovY: 1, ortho: false };
    const input: Parameters<typeof Hook>[0] = { owner: {}, bodies: [{ key: 'a', mesh: {}, hidden: false }, { key: 'b', mesh: {}, hidden: false }], reason: undefined, getCamera: () => camera };
    const render = () => { for (let i = 0; i < 6; i++) { cursor = 0; dirty = false; const value = useNamedInspection(input); if (!dirty) return value; } throw Error('unsettled'); };
    assert.equal(render().capture('Only A', ['a']), true);
    const id = render().rows[0].id;
    camera = { ...camera, distance: 80 };
    assert.equal(render().apply(id), true);
    const token = render().transaction!.token;
    assert.deepEqual(render().visibleKeys, ['a']);
    render().observeCamera({ ...camera, distance: 50 });
    assert.equal(render().rows[0].active, true);
    assert.equal(render().transaction!.token, token, 'camera observation never reissues a transaction');
    assert.equal(render().capture('Invisible B', ['b']), false);
    assert.equal(render().capture('Current visible'), true);
    const second = render().rows[1].id;
    assert.equal(render().capture('Third'), false);
    assert.equal(render().apply(second), true);
    assert.deepEqual(render().visibleKeys, ['a']);
    assert.equal(render().restore(), true);
    assert.equal(render().transaction!.camera.distance, 80, 'consecutive applies retain first restore camera');
    assert.equal(render().visibleKeys, null);
    assert.equal(render().apply(id), true);
    render().remove(id); render().remove(second);
    assert.equal(render().rows.length, 0);
    assert.deepEqual(render().visibleKeys, ['a'], 'deleting a bookmark is not an implicit Restore');
    input.bodies = input.bodies.map((body, index) => index ? body : { ...body, mesh: {} });
    assert.equal(render().transaction, null, 'mesh invalidation also clears an active transaction with no rows');
    assert.equal(render().canRestore, false);
    assert.equal(render().capture('Fresh'), true);
    const staleApply = render().apply, freshId = render().rows[0].id;
    input.owner = {}; render();
    assert.equal(staleApply(freshId), false);
    assert.equal(render().rows.length, 0);
    assert.equal(render().capture('Blocked later'), true);
    assert.equal(render().apply(render().rows[0].id), true);
    input.reason = 'Section active';
    assert.equal(render().transaction, null);
    assert.equal(render().canRestore, false);
    assert.equal(render().rows.length, 1, 'temporary mode blocks application but keeps same-owner bookmarks');
    input.reason = undefined;
    assert.equal(render().transaction, null, 'ending a mode does not auto-restore');
    let currentOwner = true;
    input.isCurrent = () => currentOwner;
    const ready = render();
    assert.equal(ready.apply(ready.rows[0].id), true);
    const beforeOpen = render(), committed = beforeOpen.transaction;
    currentOwner = false; // Open intent changed before React received the replacement document.
    assert.equal(beforeOpen.restore(), false);
    assert.equal(beforeOpen.apply(beforeOpen.rows[0].id), false);
    assert.equal(beforeOpen.capture('Old document'), false);
    assert.equal(render().transaction, committed, 'rejected stale actions cannot partially publish');
    currentOwner = true;
    input.bodies = input.bodies.slice(0, 1);
    assert.equal(render().rows.length, 0, 'body-set change clears snapshots');
  } finally { holder.__inspectionHooks = old; await rm(temp, { recursive: true, force: true }); }
});
