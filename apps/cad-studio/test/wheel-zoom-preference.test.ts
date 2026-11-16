import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { useViewportPointerInput } from '../src/viewport/viewportPointerInput';
import { OrbitCamera } from '../src/viewport/camera';
import type { ScalarMap } from '../src/viewport/scalarMaps';
import type { ViewRenderer, ViewState } from '../src/viewport/renderer';

import { modelWheelZoomAvailable, REVERSE_WHEEL_ZOOM_KEY, parseReverseWheelZoom, readWheelZoomPreference, writeWheelZoomPreference, wheelZoomFactor } from '../src/viewport/wheelZoomPreference';
function pointerRig() {
  const values: (number | null)[] = [], camera = new OrbitCamera(), maps = [] as ScalarMap[];
  const props = { reverseWheelZoom: false, sketch: null, bodies: [], gizmo: null, scalarMaps: maps, onHoverScalar: (value: number | null) => values.push(value), onCursor() {}, onSketchShape() {} };
  const renderer = { current: null as ViewRenderer | null }, hover = { current: { face: null, edge: null } };
  let input!: ReturnType<typeof useViewportPointerInput>;
  const options = { canvas: { current: { style: {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
    camera: { current: camera }, propsRef: { current: props }, rendering: { renderer, hover, rendererBodies: { current: [] }, rendererInstances: { current: null },
      syncDisplayedBodies() {}, syncDirect() {}, bodiesForMeshPicking: () => [], isBandRail: () => false, selectBandRail: () => false,
      request() {}, requestRef: { current() {} }, moving: { current() {} }, viewState: () => ({ offsets: new Map(), ghostBodies: new Set() } as ViewState) },
    focus: { focusPick: { current: null }, finishFocusPick() {} } } as unknown as Parameters<typeof useViewportPointerInput>[0];
  function Probe() { input = useViewportPointerInput(options); return null; }
  renderToStaticMarkup(createElement(Probe));
  return { props, values, camera, maps, renderer, handlers: input.canvasHandlers };
}


test('origin preference strictly defaults off; storage read/write failures remain session-only', () => {
  for (const value of [null, '', 'off', 'true', 'ON', 'invalid']) assert.equal(parseReverseWheelZoom(value), false);
  assert.equal(parseReverseWheelZoom('on'), true);
  const calls: unknown[] = [];
  assert.deepEqual(readWheelZoomPreference(() => ({ getItem(key) { calls.push(key); return 'on'; } })), { enabled: true, persistent: true });
  for (const enabled of [true, false]) assert.equal(writeWheelZoomPreference(() => ({ setItem(key, value) { calls.push([key, value]); } }), enabled), true);
  assert.deepEqual(calls, [REVERSE_WHEEL_ZOOM_KEY, [REVERSE_WHEEL_ZOOM_KEY, 'on'], [REVERSE_WHEEL_ZOOM_KEY, 'off']]);
  const denied = () => { throw new Error('denied'); };
  assert.deepEqual(readWheelZoomPreference(denied), { enabled: false, persistent: false });
  assert.deepEqual(readWheelZoomPreference(() => ({ getItem: denied })), { enabled: false, persistent: false });
  assert.equal(writeWheelZoomPreference(denied, true), false);
  assert.equal(writeWheelZoomPreference(() => ({ setItem: denied }), true), false);
});
test('only unmodified wheel changes direction with identical exponential speed', () => {
  for (const deltaY of [-100, 0, 100]) {
    assert.equal(wheelZoomFactor({ deltaY }), Math.exp(deltaY * .0015));
    assert.equal(wheelZoomFactor({ deltaY }, true), Math.exp(-deltaY * .0015));
    for (const key of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'])
      assert.equal(wheelZoomFactor({ deltaY, [key]: true }, true), Math.exp(deltaY * .0015));
  }
});
test('actual wheel handler reads latest preference, retaining cursor anchor, projection and modified gestures', () => {
  for (const ortho of [false, true]) {
    const r = pointerRig(), expected = new OrbitCamera(); r.camera.ortho = expected.ortho = ortho;
    const event = { clientX: 65, clientY: 40, deltaY: 100 } as Parameters<typeof r.handlers.onWheel>[0];
    const wheel = (reverse: boolean, ctrlKey = false) => {
      r.props.reverseWheelZoom = reverse;
      r.handlers.onWheel({ ...event, ctrlKey });
      expected.zoom(Math.exp(100 * .0015 * (reverse && !ctrlKey ? -1 : 1)), .3, .2);
      assert.equal(r.camera.distance, expected.distance);
      r.camera.target.forEach((v, i) => assert.ok(Math.abs(v - expected.target[i]) < 1e-10));
      assert.equal(r.camera.ortho, ortho); assert.equal(r.camera.fovY, expected.fovY);
    };
    wheel(false); wheel(true); wheel(true, true); wheel(false);
  }
});

test('Model/Sketch scope excludes render and all manufacturing preview states without changing the saved preference', () => {
  for (let mask = 0; mask < 16; mask++) {
    const available = modelWheelZoomAvailable(!!(mask & 1), !!(mask & 2), !!(mask & 4), !!(mask & 8));
    assert.equal(available, mask === 0);
    assert.equal(wheelZoomFactor({ deltaY: 100 }, available ? true : undefined), Math.exp(mask === 0 ? -.15 : .15));
  }
});


test('real wheel consumer keeps off-center anchors at tiny scale and both clamps in either direction', () => {
  for (const ortho of [false, true]) for (const reverse of [false, true]) for (const distance of [.002, 160, 19999]) {
    for (const deltaY of [-120, 120, -10000, 10000]) {
      const r = pointerRig(), c = r.camera; c.ortho = ortho; c.distance = distance; c.aspect = 1;
      r.props.reverseWheelZoom = reverse;
      const right = [-Math.sin(c.yaw), Math.cos(c.yaw), 0];
      const up = [-Math.sin(c.pitch) * Math.cos(c.yaw), -Math.sin(c.pitch) * Math.sin(c.yaw), Math.cos(c.pitch)];
      const h = distance * Math.tan(c.fovY / 2);
      const point = c.target.map((v, i) => v + h * (.3 * right[i] + .2 * up[i]));
      r.handlers.onWheel({ clientX: 65, clientY: 40, deltaY } as Parameters<typeof r.handlers.onWheel>[0]);
      assert.equal(c.distance, Math.max(.001, Math.min(20000, distance * Math.exp(deltaY * .0015 * (reverse ? -1 : 1)))));
      // Independent target-plane projection, not the product camera projector or zoom helper.
      const offset = point.map((v, i) => v - c.target[i]), half = c.distance * Math.tan(c.fovY / 2);
      const x = offset.reduce((a, v, i) => a + v * right[i], 0) / half;
      const y = offset.reduce((a, v, i) => a + v * up[i], 0) / half;
      assert.ok(Math.abs(x - .3) < 1e-7 && Math.abs(y - .2) < 1e-7);
      assert.ok(c.target.every(Number.isFinite));
    }
  }
});
