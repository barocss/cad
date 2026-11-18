import test from 'node:test';
import assert from 'node:assert/strict';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import { GpuRenderer } from '../src/viewport/gpuRenderer';
import type { SectionClip } from '../src/viewport/renderer';

// Pure bounds-consumer qualification: real prototype methods with already-world-space
// mesh boxes. No constructor, Viewer, WebGPU device, render, Fit camera, or shader runs.
type Box = { min: Vec3; max: Vec3 };
type MockBody = { surface: { bounds: Box }; result: { mesh: { bounds: Box } } };
type MockInstance = { id: string; surfaces: { bounds: Box; geometry: object }[]; looks: { hidden?: boolean }[] };
type BoundsState = {
  bodies: MockBody[]; direct: never[]; instances: MockInstance[];
  poses: Map<string, Float64Array>; instancePreview: null; clip: SectionClip | null;
  boundsKey: unknown[] | null; boundsMemo: Box | null;
  view: { hiddenBodies: Set<number> };
};
const box = (min: Vec3, max: Vec3): Box => ({ min, max });
const clip = (excludedInstances: readonly string[] = []): SectionClip => ({
  planes: [{ normal: [1, 0, 0], offset: 0 }], bodies: true, excludedInstances,
});
function rig() {
  const sharedGeometry = {};
  const state: BoundsState = Object.assign(Object.create(GpuRenderer.prototype) as BoundsState, {
    bodies: [], direct: [], poses: new Map<string, Float64Array>(), instancePreview: null,
    clip: clip(), boundsKey: null, boundsMemo: null, view: { hiddenBodies: new Set<number>() },
    instances: [
      { id: 'p1', surfaces: [{ bounds: box([-7, 0, 3], [5, 20, 11]), geometry: sharedGeometry }], looks: [{}] },
      { id: 'p2', surfaces: [{ bounds: box([-7, 30, 3], [5, 50, 11]), geometry: sharedGeometry }], looks: [{}] },
    ],
  });
  const read = (visibleOnly = false) => GpuRenderer.prototype.bounds.call(state as unknown as GpuRenderer, visibleOnly);
  return { state, read };
}

test('selective GPU bounds consume exclusion IDs and invalidate the real cache on replacement clip identity', () => {
  const { state, read } = rig();
  const original = structuredClone(state.instances);
  const initialClip = state.clip;
  const cut = read();
  assert.deepEqual(cut, box([0, 0, 3], [5, 50, 11]));
  assert.equal(read(), cut, 'unchanged inputs use the real memoized result');
  assert.equal(state.boundsKey?.[5], initialClip);

  state.clip = clip(['p2']);
  const selective = read();
  assert.deepEqual(selective, box([-7, 0, 3], [5, 50, 11]));
  assert.notEqual(selective, cut);
  assert.equal(state.boundsKey?.[5], state.clip);
  assert.equal(read(), selective);

  state.clip = clip();
  const restored = read();
  assert.deepEqual(restored, cut);
  assert.notEqual(restored, selective);
  assert.equal(state.boundsKey?.[5], state.clip);
  assert.deepEqual(state.instances, original, 'world boxes and occurrence data remain unchanged');
  assert.equal(state.instances[0].surfaces[0].geometry, state.instances[1].surfaces[0].geometry);
});

test('selective GPU visible-only bounds omit hidden occurrence bodies and hidden base bodies without polluting ordinary bounds', () => {
  const { state, read } = rig();
  state.clip = clip(['p2']);
  state.instances[1].looks = [{ hidden: true }];
  const hiddenBase = box([0, -100, 0], [100, -80, 20]);
  state.bodies = [{ surface: { bounds: hiddenBase }, result: { mesh: { bounds: hiddenBase } } }];
  state.view.hiddenBodies.add(0);
  const ordinary = read();
  assert.deepEqual(ordinary, box([-7, -100, 0], [100, 50, 20]));
  assert.deepEqual(read(true), box([0, 0, 3], [5, 20, 11]), 'hidden excluded p2 does not enlarge visible bounds');
  assert.equal(read(), ordinary, 'visible-only query does not replace the ordinary cache');

  state.instances[1].looks = [{}];
  assert.deepEqual(read(true), box([-7, 0, 3], [5, 50, 11]), 'showing excluded p2 restores its full world box');
  state.clip = clip();
  assert.deepEqual(read(true), box([0, 0, 3], [5, 50, 11]), 'restoring clipping also affects visible-only bounds');
  state.instances[0].looks = [{ hidden: true }];
  state.instances[1].looks = [{ hidden: true }];
  assert.equal(read(true), null, 'no visible base or occurrence body yields no visible box');
});
