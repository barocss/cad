import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server.edge';
import { useViewportPointerInput } from '../src/viewport/viewportPointerInput';
import { GpuRenderer } from '../src/viewport/gpuRenderer';
import { OrbitCamera } from '../src/viewport/camera';
import type { ScalarMap } from '../src/viewport/scalarMaps';
import type { ViewRenderer, ViewState } from '../src/viewport/renderer';

function pointerRig() {
  const values: (number | null)[] = [], camera = new OrbitCamera(), maps = [] as ScalarMap[];
  const props = { sketch: null, bodies: [], gizmo: null, scalarMaps: maps, onHoverScalar: (value: number | null) => values.push(value), onCursor() {}, onSketchShape() {} };
  const renderer = { current: null as ViewRenderer | null }, hover = { current: { face: null, edge: null } };
  let input!: ReturnType<typeof useViewportPointerInput>;
  const options = { canvas: { current: { style: {}, setPointerCapture() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } },
    camera: { current: camera }, propsRef: { current: props }, rendering: { renderer, hover, rendererBodies: { current: [] }, rendererInstances: { current: null },
      syncDisplayedBodies() {}, syncDirect() {}, bodiesForMeshPicking: () => [], isBandRail: () => false, selectBandRail: () => false,
      request() {}, requestRef: { current() {} }, moving: { current() {} }, viewState: () => ({ offsets: new Map(), ghostBodies: new Set() } as ViewState) },
    focus: { focusPick: { current: null }, finishFocusPick() {} } } as unknown as Parameters<typeof useViewportPointerInput>[0];
  function Probe() { input = useViewportPointerInput(options); return null; }
  renderToStaticMarkup(createElement(Probe));
  return { values, camera, maps, renderer, handlers: input.canvasHandlers };
}

test('actual pointer leave clears scalar hover even with no renderer, no face hover, or a navigation drag', () => {
  const r = pointerRig(); r.handlers.onPointerLeave(); assert.deepEqual(r.values, [null]);
  r.renderer.current = { setState() {} } as unknown as ViewRenderer;
  r.handlers.onPointerLeave(); assert.deepEqual(r.values, [null, null]);
  r.handlers.onPointerDown({ clientX: 50, clientY: 50, pointerId: 1, button: 2 } as Parameters<typeof r.handlers.onPointerDown>[0]);
  assert.equal(r.values.at(-1), null); r.handlers.onPointerLeave(); assert.equal(r.values.length, 4);
  const distance = r.camera.distance;
  r.handlers.onWheel({ clientX: 50, clientY: 50, deltaY: 10 } as Parameters<typeof r.handlers.onWheel>[0]);
  assert.equal(r.values.at(-1), null); assert.notEqual(r.camera.distance, distance);
});

test('pointer sampling passes the current map reference and clears when the sampler has no current value', () => {
  const r = pointerRig(), seen: unknown[] = [];
  r.renderer.current = { setState() {}, pickFace: () => null, pickEdge: () => null,
    scalarAt(_x: number, _y: number, _camera: OrbitCamera, maps: unknown) { seen.push(maps); return seen.length === 1 ? 0 : null; } } as unknown as ViewRenderer;
  const event = { clientX: 50, clientY: 50, pointerId: 1, buttons: 0 } as Parameters<typeof r.handlers.onPointerMove>[0];
  r.handlers.onPointerMove(event); assert.equal(seen[0], r.maps); assert.equal(r.values.at(-1), 0);
  r.handlers.onPointerMove(event); assert.equal(r.values.at(-1), null);
});

test('actual GPU scalar sampler refuses a previous map reference before raycasting, with numeric interpolation unchanged', () => {
  const map = {} as ScalarMap, maps = [map], mesh = {}, hit = { mesh, scalar: 0 };
  let rays = 0;
  const renderer = { scalarMaps: maps, sync() {}, viewer: { raycast() { rays++; return hit; } }, mapShown: new Map([[mesh, map]]) };
  const read = (expected?: readonly ScalarMap[] | null) => GpuRenderer.prototype.scalarAt.call(renderer as unknown as GpuRenderer, 0, 0, new OrbitCamera(), expected);
  assert.equal(read([map]), null); assert.equal(rays, 0, 'same contents with a different result owner are not ready');
  assert.equal(read(maps), 0); assert.equal(rays, 1);
  hit.scalar = 6; assert.equal(read(maps), 6); assert.equal(read(), 6, 'legacy callers retain their original contract');
  hit.scalar = NaN; assert.equal(read(maps), null); assert.equal(read(null), null);
});
