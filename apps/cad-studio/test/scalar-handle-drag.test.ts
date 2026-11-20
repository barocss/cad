import test from 'node:test';
import assert from 'node:assert/strict';
import { captureScalarHandleDrag, historyFilletEndOnBlocked, scalarHandleDragValue } from '../src/viewport/scalarHandleDrag';
import { dragAlong, handleLayout, hitTest, type FeatureHandle, type Projector } from '../src/viewport/gizmo';
const top: Projector = { project: p => [500 + p[0] * 10, 500 - p[1] * 10], forward: [0, 0, -1], size: 8.4 };
const iso: Projector = { project: p => [500 + 7 * (p[0] - p[1]), 500 + 4 * (p[0] + p[1]) - 8 * p[2]], forward: [-0.6, -0.6, -0.5], size: 10 };
function handle(patch: Partial<FeatureHandle> = {}): FeatureHandle { return { id: 'radius', at: [2, 3, 4], dir: [0, 0, 1], label: 'Radius', value: 2, owner: {}, scalarDragSession: {}, toValue: (start, mm) => start + mm, format: String, onDrag: () => {}, ...patch }; }
const near = (a: number | null, b: number) => { assert.notEqual(a, null); assert.ok(Math.abs(a! - b) < 1e-10, `${a} != ${b}`); };
test('Projected scalar drag equals the existing dragAlong formula in its captured frame', () => {
  for (const P of [top, iso]) for (const dir of [[1, 0, 0], [0, 1, 0], [1, 2, 3]] as [number, number, number][]) {
    const h = handle({ dir }), frame = captureScalarHandleDrag(h, P); assert.ok(frame); assert.equal(frame.fallback, false);
    for (const to of [[30, 42], [-14, -84], [9, 12]] as [number, number][]) near(scalarHandleDragValue(frame, h, [9, 12], to), h.value + dragAlong([9, 12], to, h.at, h.dir, P));
  }
});
test('End-on scalar drag is up-positive, horizontal-neutral and scales with pointer-down zoom', () => {
  for (const size of [0.84, 8.4, 84]) {
    const h = handle(), frame = captureScalarHandleDrag(h, { ...top, size }); assert.ok(frame); assert.equal(frame.fallback, true);
    near(scalarHandleDragValue(frame, h, [100, 100], [100, 16]), 2 + size);
    near(scalarHandleDragValue(frame, h, [100, 100], [100, 184]), 2 - size);
    near(scalarHandleDragValue(frame, h, [100, 100], [190, 100]), 2);
    near(scalarHandleDragValue(frame, h, [100, 100], [100, 100]), 2);
  }
});
test('End-on generic drag remains zero and its existing feature hit target remains reachable', () => {
  const h = handle(), at = top.project(h.at);
  assert.equal(dragAlong(at, [at[0], at[1] - 84], h.at, h.dir, top), 0);
  assert.deepEqual(handleLayout(h, top), { from: at, to: at });
  assert.deepEqual(hitTest(at, null, [h], top), { kind: 'handle', index: 0 });
});
test('Capture rejects invalid projection, scale, direction, start, and non-scalar opt-ins', () => {
  const h = handle();
  for (const size of [0, -1, NaN, Infinity]) assert.equal(captureScalarHandleDrag(h, { ...top, size }), null);
  for (const bad of [NaN, Infinity, -Infinity]) assert.equal(captureScalarHandleDrag(h, { ...top, project: () => [bad, 0] }), null);
  for (const patch of [{ scalarDragSession: undefined }, { value: NaN }, { at: [Infinity, 0, 0] }, { dir: [0, 0, 0] }, { dir: [NaN, 0, 1] },
    { arc: { centre: [0, 0, 0], axis: [0, 0, 1], from: [1, 0, 0] } }, { plane: { dir2: [1, 0, 0], value2: 2, toValue2: (a: number) => a } }] as Partial<FeatureHandle>[]) assert.equal(captureScalarHandleDrag(handle(patch), top), null);
});
test('Every handle identity dimension prevents a stale pointer from changing another command', () => {
  const h = handle(), frame = captureScalarHandleDrag(h, top); assert.ok(frame);
  for (const next of [undefined, { ...h, id: 'distance' }, { ...h, owner: {} }, { ...h, scalarDragSession: {} }, { ...h, scalarDragSession: undefined }]) assert.equal(scalarHandleDragValue(frame, next, [0, 0], [0, -20]), null);
  assert.equal(scalarHandleDragValue(null, h, [0, 0], [0, -20]), null);
});
test('Preview geometry, current value, converter and camera changes cannot change captured move or release values', () => {
  for (const P of [top, iso]) {
    const h = handle(), frame = captureScalarHandleDrag(h, P); assert.ok(frame);
    const expected = scalarHandleDragValue(frame, h, [0, 0], [11, -20]);
    const updated = { ...h, value: 999, at: [30, 40, 50] as [number, number, number], dir: [1, 0, 0] as [number, number, number], toValue: () => 999 };
    P.size *= 2;
    assert.equal(scalarHandleDragValue(frame, updated, [0, 0], [11, -20]), expected);
    assert.equal(scalarHandleDragValue(frame, updated, [0, 0], [11, -20]), expected, 'release uses the same captured converter');
    P.size /= 2;
  }
});
test('Captured conversion uses the original snap and clamp without adding accumulated deltas', () => {
  const h = handle({ toValue: (start, mm) => Math.min(5, Math.max(0.1, Math.round((start + mm) * 10) / 10)) }), frame = captureScalarHandleDrag(h, top); assert.ok(frame);
  near(scalarHandleDragValue(frame, h, [0, 0], [0, -13.6]), 3.4);
  near(scalarHandleDragValue(frame, h, [0, 0], [0, -1000]), 5);
  near(scalarHandleDragValue(frame, h, [0, 0], [0, 1000]), 0.1);
  near(scalarHandleDragValue(frame, h, [0, 0], [0, 0]), 2);
});
test('Non-finite pointer or conversion result is refused', () => {
  const h = handle(), frame = captureScalarHandleDrag(h, top);
  for (const bad of [NaN, Infinity, -Infinity]) assert.equal(scalarHandleDragValue(frame, h, [0, 0], [bad, 0]), null);
  const bad = handle({ toValue: () => Infinity }); assert.equal(scalarHandleDragValue(captureScalarHandleDrag(bad, top), bad, [0, 0], [0, -20]), null);
});
test('Screen-up and projected limits are captured once, with History blocked throughout the transition', () => {
  const h = handle({ dir: [1, 0, 0] });
  for (const [length, blend, fallback] of [[3.8, 0, true], [4.2, 0, true], [8, 0, true], [16, 0.5, true], [24, 1, false], [25, 1, false]] as const) {
    const P: Projector = { size: 1, forward: [0, 0, -1], project: p => [p[0] * length, 0] };
    const frame = captureScalarHandleDrag(h, P); assert.ok(frame); assert.equal(frame.fallback, fallback); near(frame.blend, blend);
    assert.equal(historyFilletEndOnBlocked({ ...h, scalarDragSession: undefined, historyFilletProofPending: true }, P), fallback);
  }
});

test('Both sides of the former four-pixel boundary retain the same finite move and release', () => {
  const h = handle({ dir: [1, 0, 0], toValue: (start, mm) => Math.max(0.1, Math.round((start + mm) * 10) / 10) });
  for (const length of [3.8, 4.2]) {
    const P: Projector = { size: 5.25, forward: [0, 0, -1], project: p => [0, p[0] * length / 5.25] };
    const frame = captureScalarHandleDrag(h, P); assert.ok(frame);
    near(scalarHandleDragValue(frame, h, [20, 30], [20, 22]), 2.5);
    near(scalarHandleDragValue(frame, { ...h, value: 2.5 }, [20, 30], [20, 22]), 2.5);
    near(scalarHandleDragValue(frame, h, [20, 30], [20, 30]), 2);
    near(scalarHandleDragValue(frame, h, [20, 30], [20, 38]), 1.5);
  }
});

function projectedFrame(length: number, angle: number) {
  const h = handle({ at: [0, 0, 0], dir: [1, 0, 0] }), radians = angle * Math.PI / 180;
  const P: Projector = { size: 1, forward: [0, 0, -1], project: p => [p[0] * length * Math.cos(radians), p[0] * length * Math.sin(radians)] };
  const frame = captureScalarHandleDrag(h, P); assert.ok(frame);
  return { h, frame };
}

test('Transition uses t along the guide and t squared across it, with the captured scale and converter', () => {
  const { h, frame } = projectedFrame(16, 45), diagonal = Math.SQRT1_2;
  near(scalarHandleDragValue(frame, h, [0, 0], [diagonal, diagonal]), h.value - 0.5 * diagonal / 84 + 0.5 / 16);
  near(scalarHandleDragValue(frame, h, [0, 0], [-diagonal, diagonal]), h.value - 0.75 * diagonal / 84);
  const pointer: [number, number] = [8, -8], expected = scalarHandleDragValue(frame, h, [0, 0], pointer);
  const preview = { ...h, at: [100, 200, 300] as [number, number, number], dir: [0, 1, 0] as [number, number, number], value: 1000, toValue: () => 999 };
  assert.equal(scalarHandleDragValue(frame, preview, [0, 0], pointer), expected);
  near(scalarHandleDragValue(frame, preview, [0, 0], [0, 0]), h.value);
});

test('The full transition retains an available directional response and bounds gain at every camera angle', () => {
  let minimumAvailable = Infinity, maximumGain = 0;
  for (let length = 8; length <= 24; length += 0.25) for (let angle = 0; angle < 360; angle += 2) {
    const { h, frame } = projectedFrame(length, angle);
    let available = 0;
    for (let direction = 0; direction < 360; direction += 45) {
      const radians = direction * Math.PI / 180, pointer: [number, number] = [Math.cos(radians), Math.sin(radians)];
      const delta = scalarHandleDragValue(frame, h, [0, 0], pointer)! - h.value;
      assert.ok(Number.isFinite(delta));
      near(scalarHandleDragValue(frame, h, [0, 0], [-pointer[0], -pointer[1]]), h.value - delta);
      near(scalarHandleDragValue(frame, h, [0, 0], [pointer[0] * 7, pointer[1] * 7]), h.value + delta * 7);
      available = Math.max(available, Math.abs(delta) * 84);
      maximumGain = Math.max(maximumGain, Math.abs(delta) * 84);
    }
    minimumAvailable = Math.min(minimumAvailable, available);
  }
  // Relative to the ordinary screen-up scale. This is available response, not a lower bound in every direction.
  assert.ok(minimumAvailable > 0.21, `minimum available gain: ${minimumAvailable}`);
  assert.ok(maximumGain < 3.73, `maximum gain: ${maximumGain}`);
});

test('Transition output is continuous across camera angles, lengths and pointer directions', () => {
  for (const length of [8, 10, 14, 18, 22, 24]) for (let angle = 0; angle < 360; angle += 15) {
    const { h, frame } = projectedFrame(length, angle);
    const byAngle = projectedFrame(length, angle + 1e-6), byLength = projectedFrame(length + 1e-6, angle);
    for (let direction = 0; direction < 360; direction += 15) {
      const r = direction * Math.PI / 180, pointer: [number, number] = [Math.cos(r) * 8, Math.sin(r) * 8];
      const value = scalarHandleDragValue(frame, h, [0, 0], pointer)!;
      for (const next of [scalarHandleDragValue(byAngle.frame, byAngle.h, [0, 0], pointer), scalarHandleDragValue(byLength.frame, byLength.h, [0, 0], pointer),
        scalarHandleDragValue(frame, h, [0, 0], [pointer[0] + 1e-6, pointer[1] - 1e-6])]) assert.ok(Math.abs(next! - value) < 1e-5);
    }
  }
});

test('Finite endpoints whose subtraction overflows are rejected before quantization can hide overflow', () => {
  const h = handle({ dir: [1, 0, 0], toValue: () => 5 });
  const P: Projector = { ...top, project: p => [p[0] === h.at[0] ? -1e308 : 1e308, 0] };
  assert.equal(captureScalarHandleDrag(h, P), null);
  const scalar = handle({ toValue: () => 5 }), frame = captureScalarHandleDrag(scalar, top); assert.ok(frame);
  assert.equal(scalarHandleDragValue(frame, scalar, [0, -1e308], [0, 1e308]), null);
});

test('Positive-depth perspective projection preserves projected drag and optical-axis fallback', () => {
  const P: Projector = { size: 2, forward: [0, 0, -1], project: p => [500 + 200 * p[0] / (20 - p[2]), 500 - 200 * p[1] / (20 - p[2])] };
  const normal = handle({ at: [2, 3, 4], dir: [1, 0, 0] }), frame = captureScalarHandleDrag(normal, P); assert.ok(frame); assert.equal(frame.fallback, false);
  for (const to of [[30, 42], [-14, -84], [9, 12]] as [number, number][]) near(scalarHandleDragValue(frame, normal, [9, 12], to), normal.value + dragAlong([9, 12], to, normal.at, normal.dir, P));
  const axial = handle({ at: [0, 0, 0], dir: [0, 0, 1] }), fallback = captureScalarHandleDrag(axial, P); assert.ok(fallback); assert.equal(fallback.fallback, true);
  near(scalarHandleDragValue(fallback, axial, [500, 500], [500, 416]), 4);
  near(scalarHandleDragValue(fallback, axial, [500, 500], [500, 584]), 0);
  assert.equal(dragAlong([500, 500], [500, 416], axial.at, axial.dir, P), 0);
});
