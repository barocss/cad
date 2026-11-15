import test from 'node:test';
import assert from 'node:assert/strict';
import type { Vec3 } from '@barocss/cad-model/engine/vec3';
import { OrbitCamera } from '../src/viewport/camera';
import { projectOverlaySegment, type OverlaySegment } from '../src/viewport/curvatureCombSegments';

const width = 800, height = 600;
function camera(ortho = false) {
  const c = new OrbitCamera(); c.target = [0, 0, 0]; c.distance = 10; c.yaw = 0; c.pitch = 0;
  c.fovY = Math.PI / 2; c.aspect = 1; c.ortho = ortho; return c;
}
// This camera looks down -X. Its horizontal/vertical coordinates are world Y/Z.
const point = (x: number, y: number, depth: number): Vec3 => [10 - depth, x, y];
function bounded(segment: OverlaySegment | null): asserts segment is OverlaySegment {
  assert.ok(segment);
  for (const p of segment) { assert.ok(p.every(Number.isFinite)); assert.ok(p[0] >= 0 && p[0] <= width); assert.ok(p[1] >= 0 && p[1] <= height); }
}
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

for (const ortho of [false, true]) {
  test(`untouched ${ortho ? 'orthographic' : 'perspective'} pixels equal camera.project`, () => {
    const c = camera(ortho), a = point(-1.2, 1.7, 8.3), b = point(1.5, -2, 13);
    assert.deepEqual(projectOverlaySegment(c, a, b, width, height), [c.project(a, width, height).slice(0, 2), c.project(b, width, height).slice(0, 2)]);
  });
  test(`${ortho ? 'orthographic' : 'perspective'} crosses viewport with both endpoints outside`, () => {
    const c = camera(ortho), result = projectOverlaySegment(c, point(-20, 0, 10), point(20, 0, 10), width, height);
    bounded(result); close(result[0][0], 0); close(result[1][0], width); close(result[0][1], height / 2); close(result[1][1], height / 2);
    assert.equal(projectOverlaySegment(c, point(20, 0, 10), point(30, 0, 10), width, height), null);
  });
  test(`${ortho ? 'orthographic' : 'perspective'} clips vertical and diagonal viewport crossings`, () => {
    const c = camera(ortho);
    const vertical = projectOverlaySegment(c, point(0, -20, 10), point(0, 20, 10), width, height); bounded(vertical);
    close(vertical[0][1], height); close(vertical[1][1], 0);
    const diagonal = projectOverlaySegment(c, point(-20, -20, 10), point(20, 20, 10), width, height); bounded(diagonal);
    close(diagonal[0][0], 0); close(diagonal[0][1], height); close(diagonal[1][0], width); close(diagonal[1][1], 0);
  });
}

test('orthographic negative eye depth and Studio near/far do not hide annotations', () => {
  const c = camera(true), a = point(0, 0, -5), b = point(1, 2, -5000);
  assert.ok(c.project(a, width, height)[2] < -1);
  const result = projectOverlaySegment(c, a, b, width, height); bounded(result);
  assert.deepEqual(result, [c.project(a, width, height).slice(0, 2), c.project(b, width, height).slice(0, 2)]);
});

test('perspective ignores Studio near/far but rejects the behind-eye mirror', () => {
  const c = camera(), a = point(0, 0, c.near() / 10), b = point(0, 0, c.far() * 2);
  assert.ok(c.project(a, width, height)[2] < -1); assert.ok(c.project(b, width, height)[2] > 1);
  bounded(projectOverlaySegment(c, a, b, width, height));
  assert.equal(projectOverlaySegment(c, point(0, 0, -1), point(1, 0, -10), width, height), null);
});

test('perspective crossing the eye is clipped before division and remains bounded', () => {
  const c = camera(), a = point(0.2, 0, 10), b = point(0.2, 0, -10);
  const result = projectOverlaySegment(c, a, b, width, height); bounded(result);
  close(result[1][0], width); close(result[1][1], height / 2);
  const reverse = projectOverlaySegment(c, b, a, width, height); bounded(reverse);
  for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) close(reverse[i][k], result[1 - i][k]);
  const axial = projectOverlaySegment(c, point(0, 0, 0), point(0, 0, 10), width, height); bounded(axial);
  assert.deepEqual(axial, [[width / 2, height / 2], [width / 2, height / 2]]);
});

test('invalid inputs fail locally without changing camera state or another segment', () => {
  const c = camera(), before = JSON.stringify(c), a = point(0, 0, 10), b = point(1, 1, 10);
  const good = projectOverlaySegment(c, a, b, width, height);
  for (const bad of [NaN, Infinity, -Infinity]) assert.equal(projectOverlaySegment(c, a, [bad, 0, 0], width, height), null);
  for (const bad of [0, -1, NaN, Infinity]) assert.equal(projectOverlaySegment(c, a, a, bad, height), null);
  assert.equal(JSON.stringify(c), before);
  assert.deepEqual(projectOverlaySegment(c, a, b, width, height), good);
});

test('degenerate inside segments and finite extreme offscreen coordinates remain bounded', () => {
  const c = camera(true), a = point(0, 0, 10);
  bounded(projectOverlaySegment(c, a, a, width, height));
  bounded(projectOverlaySegment(c, point(-1e300, 0, 10), point(1e300, 0, 10), width, height));
});

test('invalid camera basis and optics cannot emit SVG coordinates', () => {
  const c = camera(), a = point(0, 0, 10);
  c.aspect = 0; assert.equal(projectOverlaySegment(c, a, a, width, height), null);
  c.aspect = 1; c.target[0] = NaN; assert.equal(projectOverlaySegment(c, a, a, width, height), null);
});
