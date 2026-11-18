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

test('inspection Update is atomic, session-owned, identity-preserving and separate from Apply/Restore', async () => {
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
    // Two snapshots fill the cap; Update must not allocate a third identity.
    assert.equal(render().capture('All'), true);
    camera = { ...camera, distance: 60 };
    assert.equal(render().capture('Only A', ['a']), true);
    const [all, subset] = render().rows.map(row => row.id), names = render().rows.map(row => [row.id, row.name]);
    camera = { ...camera, distance: 80 };
    assert.equal(render().apply(subset), true);
    render().observeCamera({ ...camera, distance: 60 });
    const active = render(), transaction = active.transaction;
    const originalRestore = (slots[0] as { restoreCamera: unknown }).restoreCamera;
    assert.equal(active.rows[1].active, true);
    camera = { ...camera, distance: 95, target: [1, 2, 3] };
    const capturedCamera = structuredClone(camera);
    assert.equal(active.update(all), true, 'updating another row preserves the currently applied row');
    assert.equal(render().rows[1].active, true);
    assert.equal(render().transaction, transaction);
    assert.equal((slots[0] as { restoreCamera: unknown }).restoreCamera, originalRestore);
    assert.equal(render().transaction!.token, transaction!.token);
    assert.equal(render().visibleKeys, transaction!.visibleKeys);
    assert.equal(render().canCapture, false);
    assert.deepEqual(render().rows.map(row => [row.id, row.name]), names);
    camera.target[0] = 999;
    assert.equal(render().apply(all), true);
    assert.deepEqual(render().transaction!.camera, capturedCamera, 'camera/target were copied at Update');
    assert.deepEqual(render().visibleKeys, ['a'], 'Update captures current mask, not all design-visible bodies');
    render().observeCamera(capturedCamera);
    const applied = render(), appliedTransaction = applied.transaction;
    assert.equal(applied.rows[0].active, true);
    camera = { ...camera, distance: 110 };
    assert.equal(applied.update(all), true);
    assert.equal((slots[0] as { restoreCamera: unknown }).restoreCamera, originalRestore);
    assert.equal(render().transaction, appliedTransaction, 'Update itself does not change the display transaction');
    assert.equal(render().rows.some(row => row.active), false);
    render().observeCamera(capturedCamera);
    assert.equal(render().rows.some(row => row.active), false, 'updated applied row needs explicit Apply');
    assert.equal(render().restore(), true);
    assert.equal(render().transaction!.camera.distance, 80, 'original first-Apply Restore survives all Updates');
    assert.equal(render().visibleKeys, null);
    assert.equal(render().apply(all), true);
    assert.deepEqual(render().transaction!.camera, camera, "explicit Apply after Restore uses the updated camera");
    assert.deepEqual(render().visibleKeys, ["a"]);
    render().remove(subset);
    assert.equal(render().capture('Next'), true);
    assert.equal(render().rows[1].id, 'inspection-3', 'Update did not advance serial');

    const rejectUnchanged = (action: () => boolean) => {
      const before = slots[0]; assert.equal(action(), false); assert.equal(slots[0], before, 'failed Update publishes nothing');
    };
    rejectUnchanged(() => render().update('missing'));
    camera = { ...camera, distance: NaN };
    rejectUnchanged(() => render().update(all));
    camera = { ...camera, distance: 100 };
    const stale = render().update;
    assert.equal(render().update(all), true);
    rejectUnchanged(() => stale(all));
    let isCurrent = false; input.isCurrent = () => isCurrent;
    rejectUnchanged(() => render().update(all));
    isCurrent = true;
    const beforeMode = render().update;
    input.reason = 'Section active'; render();
    rejectUnchanged(() => render().update(all));
    rejectUnchanged(() => beforeMode(all));
    input.reason = undefined; render();
    const beforeMesh = render().update;
    input.bodies = input.bodies.map(body => ({ ...body, mesh: {} }));
    assert.equal(render().rows.length, 0);
    rejectUnchanged(() => beforeMesh(all));
    assert.equal(render().capture('Fresh'), true);
    const fresh = render().rows[0].id, beforeOwner = render().update;
    input.owner = {}; render();
    rejectUnchanged(() => beforeOwner(fresh));
    assert.equal(render().rows.length, 0);
    assert.equal(render().capture('Visible'), true);
    const visible = render().rows[0].id;
    // Authored visibility changes invalidate the saved signature before any new Update.
    input.bodies = input.bodies.map(body => ({ ...body, hidden: true }));
    const unpublished = slots[0];
    assert.equal(render().rows.length, 0, 'source change clears snapshots instead of updating stale bodies');
    assert.notEqual(slots[0], unpublished);
    rejectUnchanged(() => render().update(visible));
  } finally { holder.__inspectionHooks = old; await rm(temp, { recursive: true, force: true }); }
});
