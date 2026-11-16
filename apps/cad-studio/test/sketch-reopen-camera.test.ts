import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { standardPlane, toWorld, rayOnPlane } from '@barocss/cad-model/sketch/plane';
import { useSketchActions } from '../src/sketch/useSketchActions';
import { SKETCH_REOPEN_FRAME_KEY, parseSketchReopenFrame, readSketchReopenFrame, writeSketchReopenFrame } from '../src/sketch/useSketchReopenCamera';
import { applySketchCameraFrame, ownsSketchCameraFrame } from '../src/viewport/sketchCameraFrame';
import { OrbitCamera } from '../src/viewport/camera';

test('reopen preference is strict, defaults on and uses only its own storage key', () => {
  assert.equal(parseSketchReopenFrame('off'), false);
  for (const v of [null, '', 'on', 'false', '0', 'OFF', 'invalid']) assert.equal(parseSketchReopenFrame(v), true);
  const calls: unknown[] = [];
  assert.deepEqual(readSketchReopenFrame(() => ({ getItem(key) { calls.push(key); return 'off'; } })), { enabled: false, persistent: true });
  assert.equal(writeSketchReopenFrame(() => ({ setItem(key, value) { calls.push([key, value]); } }), true), true);
  assert.deepEqual(calls, [SKETCH_REOPEN_FRAME_KEY, [SKETCH_REOPEN_FRAME_KEY, 'on']]);
});
test('storage getter/read/write failures are session-only, not saved-success', () => {
  const denied = () => { throw new Error('denied'); };
  assert.deepEqual(readSketchReopenFrame(denied), { enabled: true, persistent: false });
  assert.deepEqual(readSketchReopenFrame(() => ({ getItem: denied })), { enabled: true, persistent: false });
  assert.equal(writeSketchReopenFrame(denied, false), false);
  assert.equal(writeSketchReopenFrame(() => ({ setItem: denied }), false), false);
});

function actions(autoFrameReopened?: boolean, invalid = false) {
  const doc = rectanglePart(20, 10, 5), before = structuredClone(doc);
  if (invalid) doc.nodes[0] = { ...doc.nodes[0], kind: 'driven-sketch' } as typeof doc.nodes[0];
  let api!: ReturnType<typeof useSketchActions>, frames = 0, commits = 0, notices = 0, drafts = 0;
  const options = {
    model: { doc, evaluated: doc, fresh: true, busy: false, bodies: [], selection: { bodies: [], faces: [], edges: [] }, marker: null },
    editor: { sketch: null, setSketch() { drafts++; }, sketchGeneration: { current: 0 } }, owner: { docNow: { current: doc }, acceptanceScope: {} },
    worker: { engine: {}, nextRevision: () => 1 }, viewport: { current: { frameSketch() { frames++; } } },
    changes: { canChangeDocument: () => true, commit() { commits++; return true; }, commitDirect() { commits++; return true; }, setSelection() {}, setEditNode() {}, setActive() {}, setPreviewBodies() {} },
    onNotice() { notices++; }, autoFrameReopened,
  } as unknown as Parameters<typeof useSketchActions>[0];
  function Probe() { api = useSketchActions(options); return null; }
  renderToString(createElement(Probe)); api.editSketch(0);
  return { frames, commits, notices, drafts, doc, before };
}
test('actual reopen hook skips all framing when off, defaults to one frame when on; document is unchanged', () => {
  for (const enabled of [undefined, true, false]) {
    const result = actions(enabled);
    assert.equal(result.frames, enabled === false ? 0 : 1); assert.equal(result.drafts, 1);
    assert.equal(result.commits, 0); assert.equal(result.notices, 0); assert.deepEqual(result.doc, result.before);
  }
});
test('refused reopen does not queue a camera frame regardless of preference', () => {
  for (const enabled of [true, false]) {
    const result = actions(enabled, true); assert.equal(result.frames, 0); assert.equal(result.drafts, 0); assert.equal(result.notices, 1);
  }
});
test('queued or manual frame must own the exact active sketch plane', () => {
  const plane = standardPlane('xy'), frame = { plane, min: [0, 0] as [number, number], max: [20, 10] as [number, number] };
  assert.equal(ownsSketchCameraFrame(frame, plane), true);
  assert.equal(ownsSketchCameraFrame(frame, standardPlane('xy')), false);
  assert.equal(ownsSketchCameraFrame(frame, undefined), false); assert.equal(ownsSketchCameraFrame(null, plane), false);
});
test('shared frame calculation fits XY and vertical sketches without changing fov or projection mode', () => {
  for (const kind of ['xy', 'xz', 'yz'] as const) for (const ortho of [true, false]) {
    const plane = standardPlane(kind), camera = new OrbitCamera(); camera.ortho = ortho; camera.fovY = 0.7;
    camera.target = [100, 200, 300]; camera.distance = 1800;
    applySketchCameraFrame(camera, { plane, min: [0, 0], max: [20, 10] }, 1400, 900, { left: 0.1, right: 0.8 });
    assert.equal(camera.ortho, ortho); assert.equal(camera.fovY, 0.7);
    for (const p of [[0, 0], [20, 0], [20, 10], [0, 10]] as [number, number][]) {
      const projected = camera.project(toWorld(plane, p), 1400, 900);
      assert.ok(projected[0] >= 140 - 1 && projected[0] <= 1120 + 1); assert.ok(projected[1] >= 0 && projected[1] <= 900);
    }
  }
});

test('existing ray-plane rejection is unchanged; explicit alignment restores a center ray', () => {
  const plane = standardPlane('xy');
  assert.equal(rayOnPlane(plane, [0, 0, 10], [1, 0, 0]), null);
  assert.equal(rayOnPlane(plane, [0, 0, 10], [1, 0, 1e-7]), null);
  assert.equal(rayOnPlane(plane, [0, 0, 10], [0, 0, 1]), null);
  const camera = new OrbitCamera();
  applySketchCameraFrame(camera, { plane, min: [0, 0], max: [20, 10] }, 1400, 900);
  const ray = camera.ray(0, 0), hit = rayOnPlane(plane, ray.origin, ray.dir);
  assert.ok(hit); assert.ok(Math.abs(hit[0] - 10) < 1e-4 && Math.abs(hit[1] - 5) < 1e-4);
});
