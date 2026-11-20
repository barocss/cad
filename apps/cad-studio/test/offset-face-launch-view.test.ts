import assert from 'node:assert/strict';
import test from 'node:test';
import type { Command, Ctx, HandleSpec } from '@barocss/cad-model/app/commands';
import { OrbitCamera } from '../src/viewport/camera';
import { offsetFaceLaunchView } from '../src/viewport/offsetFaceLaunchView';

const ctx = {} as Ctx;
const command = (handles: HandleSpec[]): Command => ({
  id: 'offset-face', label: 'Offset face', icon: 'cad-offset-face', group: 'modify',
  available: () => ({ ok: true }), handles: () => handles,
});
const distance = (dir: HandleSpec['dir']): HandleSpec => ({ key: 'd', at: [0, 0, 0], dir });

test('head-on admitted offset uses a readable preset and preserves an oblique view', () => {
  const camera = new OrbitCamera();
  const cmd = command([distance([0, 0, 1])]);
  assert.equal(offsetFaceLaunchView(cmd, ctx, { d: 2 }, camera.basis().forward), undefined);
  for (const view of ['top', 'bottom'] as const) {
    camera.setView(view);
    assert.equal(offsetFaceLaunchView(cmd, ctx, { d: 2 }, camera.basis().forward), 'iso');
  }
});

test('the isometric preset itself has a fallback for a nearly parallel normal', () => {
  const iso = new OrbitCamera().basis().forward;
  assert.equal(offsetFaceLaunchView(command([distance(iso)]), ctx, { d: 2 }, iso), 'right');
});

test('a missing distance handle or reference plane mode does not change the camera', () => {
  assert.equal(offsetFaceLaunchView(command([]), ctx, { d: 2 }, [0, 0, -1]), undefined);
  const cmd = { ...command([]), handles: () => { assert.fail('Reference mode should skip handle admission'); } };
  assert.equal(offsetFaceLaunchView(cmd, ctx, { offsetMode: 'to-plane' }, [0, 0, -1]), undefined);
});
