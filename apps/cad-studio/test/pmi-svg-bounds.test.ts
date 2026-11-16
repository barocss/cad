import test from 'node:test';
import assert from 'node:assert/strict';
import type { ModelAnnotation } from '@barocss/cad-model/drawing/annotations3d';
import { OrbitCamera } from '../src/viewport/camera';
import { pmiPick } from '../src/viewport/pmiGeometry';
import { pmiSvgAnchorVisible, pmiSvgCameraKey, pmiSvgTextBounds, type PmiSvgCommit } from '../src/viewport/pmiSvgBounds';
const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height });
function fixture() {
  const camera = new OrbitCamera(); camera.target = [0, 0, 0]; camera.distance = 100; camera.yaw = 0; camera.pitch = 0;
  const items = [{ id: 'dimension', lines: [{ a: [100, 100, 0], b: [110, 100, 0] }], texts: [
    { text: 'LONG ± 0.1', at: [0, 0, 0], dir: [1, 0, 0], up: [0, 0, 1], height: 2, align: 'start' }],
  }] as ModelAnnotation[];
  const text = { dataset: { pmiItem: '0', pmiText: '0' }, textContent: items[0].texts[0].text, getBoundingClientRect: () => rect(120, 70, 80, 12) };
  const canvas = { isConnected: true, clientWidth: 300, clientHeight: 200, getBoundingClientRect: () => rect(100, 50, 300, 200) } as HTMLCanvasElement;
  const owner = { items, renderer: {}, canvas, cameraKey: pmiSvgCameraKey(camera, canvas) };
  const element = { isConnected: true, querySelectorAll: () => [text] } as unknown as SVGSVGElement;
  const commit: PmiSvgCommit = { ...owner, element };
  return { camera, items, text, canvas, owner, element, commit };
}
test('SVG DOM text box uses CSS pixels/alignment rather than a collapsed world baseline; no outside halo', () => {
  const f = fixture(), bounds = pmiSvgTextBounds(f.commit, f.owner, f.camera);
  assert.deepEqual(bounds.get('dimension'), [{ left: 20, top: 20, right: 100, bottom: 32 }]);
  for (const x of [21, 60, 99]) assert.equal(pmiPick(f.items, () => [0, 0], x, 26, 8, bounds), 'dimension');
  assert.equal(pmiPick(f.items, () => [0, 0], 101, 26, 8, bounds), null);
  assert.equal(pmiPick(f.items, () => [0, 0], 1, 1, 8, bounds), 'dimension', 'existing line still picks');
  f.items[0].lines = [];
  assert.equal(pmiPick(f.items, () => [0, 0], 1, 1, 8, bounds), null, 'no old world-span fallback');
  assert.equal(pmiPick(f.items, () => [0, 0], 1, 1), 'dimension', 'unspecified bounds preserves GPU legacy path');
});
test('stale source, renderer, canvas, camera/size and disconnected DOM fail closed', () => {
  const f = fixture();
  for (const current of [{ ...f.owner, items: [...f.items] }, { ...f.owner, renderer: {} },
    { ...f.owner, canvas: {} as HTMLCanvasElement }, { ...f.owner, cameraKey: 'changed' }]) {
    assert.equal(pmiSvgTextBounds(f.commit, current, f.camera).size, 0);
  }
  for (const change of [() => { f.camera.yaw += 0.1; }, () => { f.camera.distance += 1; }]) {
    change(); assert.notEqual(pmiSvgCameraKey(f.camera, f.canvas), f.owner.cameraKey);
  }
  assert.equal(pmiSvgTextBounds(null, f.owner, f.camera).size, 0);
  Object.defineProperty(f.element, 'isConnected', { value: false });
  assert.equal(pmiSvgTextBounds(f.commit, f.owner, f.camera).size, 0);
});
test('empty, whitespace, zero bounds, outside viewport, mismatched text and behind-eye have no boxes', () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.items[0].texts[0].text = f.text.textContent = ''; },
    (f: ReturnType<typeof fixture>) => { f.items[0].texts[0].text = f.text.textContent = '   '; },
    (f: ReturnType<typeof fixture>) => { f.text.getBoundingClientRect = () => rect(120, 70, 0, 12); },
    (f: ReturnType<typeof fixture>) => { f.text.getBoundingClientRect = () => rect(500, 70, 80, 12); },
    (f: ReturnType<typeof fixture>) => { f.text.textContent = 'old label'; },
    (f: ReturnType<typeof fixture>) => { f.items[0].texts[0].at = [101, 0, 0]; },
  ]) { const f = fixture(); mutate(f); assert.equal(pmiSvgTextBounds(f.commit, f.owner, f.camera).size, 0); }
});
test('partial viewport clipping, live font box changes, array-first tie and line competition', () => {
  const f = fixture(); f.text.getBoundingClientRect = () => rect(90, 45, 50, 20);
  const bounds = pmiSvgTextBounds(f.commit, f.owner, f.camera);
  assert.deepEqual(bounds.get('dimension'), [{ left: 0, top: 0, right: 40, bottom: 15 }]);
  f.text.getBoundingClientRect = () => rect(120, 70, 100, 12);
  assert.equal(pmiSvgTextBounds(f.commit, f.owner, f.camera).get('dimension')![0].right, 120);
  const second = { ...f.items[0], id: 'second' }; bounds.set('second', bounds.get('dimension')!);
  assert.equal(pmiPick([...f.items, second], () => [200, 200], 10, 10, 8, bounds), 'dimension');
  assert.equal(pmiPick([second, ...f.items], () => [200, 200], 10, 10, 8, bounds), 'second');
  assert.equal(pmiSvgAnchorVisible([Infinity, 0, 0], f.camera), false);
});
