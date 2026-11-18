import { GpuRenderer } from '../src/viewport/gpuRenderer';
import { OrbitCamera } from '../src/viewport/camera';
import { pmiSvgCameraKey } from '../src/viewport/pmiSvgBounds';
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ModelAnnotation } from '@barocss/cad-model/drawing/annotations3d';
import { pmiLabels, pmiPick } from '../src/viewport/pmiGeometry';
import { pmiGpuTextBounds, type PmiGpuCommit, type PmiGlyphSnapshot } from '../src/viewport/pmiGpuBounds';
const box = { left: 20, top: 30, right: 40, bottom: 42 };
function fixture() {
  const items = ['a', 'b'].map(id => ({ id, plane: { normal: [0, 0, 1] }, lines: [], texts: [
    { text: id, at: [0, 0, 0], dir: [1, 0, 0], up: [0, 1, 0], height: 2, align: 'start' },
    { text: ' ', at: [0, 0, 0], dir: [1, 0, 0], up: [0, 1, 0], height: 2, align: 'start' },
  ] })) as unknown as ModelAnnotation[];
  const labels = pmiLabels(items, [0, 0, 1], 'b');
  const commit: PmiGpuCommit = { items, selected: 'b', renderer: {}, canvas: { isConnected: true } as HTMLCanvasElement, facingKey: '', owners: labels.owners };
  const epoch = {};
  const read = (key: string): PmiGlyphSnapshot => ({ epoch, bounds: [{ labelIndex: 0, rects: [{ ...box, left: key.endsWith('selected') ? 60 : 20, right: key.endsWith('selected') ? 80 : 40 }] }] });
  return { items, labels, commit, read };
}
test('same push loop owns plain/selected glyph indices; whitespace may have no quads', () => {
  const f = fixture(); assert.deepEqual(f.labels.owners, { plain: ['a', 'a'], selected: ['b', 'b'] });
  assert.equal(f.labels.plain.labels.length, 2); assert.equal(f.labels.selected?.labels.length, 2);
  const bounds = pmiGpuTextBounds(f.commit, f.commit, f.read);
  assert.deepEqual(bounds.get('a'), [box]); assert.equal(bounds.get('b')?.[0].left, 60);
  assert.equal(pmiPick(f.items, () => [0, 0], 30, 35, 8, bounds), 'a');
  assert.equal(pmiPick(f.items, () => [0, 0], 70, 35, 8, bounds), 'b');
  assert.equal(pmiPick(f.items, () => [0, 0], 1, 1, 8, bounds), null, 'no estimated fallback');
});
test('source, selection, renderer, canvas and facing mismatch fail closed', () => {
  const f = fixture();
  for (const patch of [{ items: [...f.items] }, { selected: 'a' }, { renderer: {} }, { canvas: { isConnected: true } as HTMLCanvasElement }, { facingKey: '0,' }]) {
    assert.equal(pmiGpuTextBounds(f.commit, { ...f.commit, ...patch }, () => { throw Error('stale owner read'); }).size, 0);
  }
  assert.equal(pmiGpuTextBounds(null, f.commit, f.read).size, 0);
  assert.equal(pmiGpuTextBounds(f.commit, f.commit, () => null).size, 0);
  for (const labelIndex of [-1, 2, 0.5, NaN]) assert.equal(pmiGpuTextBounds(f.commit, f.commit, () => ({ epoch: {}, bounds: [{ labelIndex, rects: [box] }] })).size, 0);
});
test('empty selected group needs no selected mesh; legitimate empty glyph layout is empty', () => {
  const f = fixture(), commit = { ...f.commit, selected: null, owners: { plain: ['a', 'a', 'b', 'b'], selected: [] } };
  const calls: string[] = [];
  assert.deepEqual(pmiGpuTextBounds(commit, commit, key => { calls.push(key); return { epoch: {}, bounds: [{ labelIndex: 2, rects: [box] }] }; }).get('b'), [box]);
  assert.deepEqual(calls, ['pmi:text']);
  assert.equal(pmiGpuTextBounds(commit, commit, () => ({ epoch: {}, bounds: [] })).size, 0);
});

test('different submitted epochs never combine plain and selected frames', () => {
  const f = fixture();
  assert.equal(pmiGpuTextBounds(f.commit, f.commit, key => ({ ...f.read(key), epoch: {} })).size, 0);
});

test('GPU adapter exact key and last Studio camera guard are read-only (no WebGPU construction)', () => {
  const camera = new OrbitCamera(), canvas = { clientWidth: 300, clientHeight: 200 } as HTMLCanvasElement;
  const mesh = {}, snapshot = { epoch: {}, bounds: [] }, reads: object[] = [];
  const mock = { canvas, submittedLabelCamera: pmiSvgCameraKey(camera, canvas), overlays: new Map([['pmi:text', mesh]]),
    viewer: { labelGlyphBounds: (m: object) => { reads.push(m); return snapshot; } }, sync: () => { throw Error('query must not sync'); } };
  const read = (key: string) => GpuRenderer.prototype.overlayLabelBounds.call(mock as unknown as GpuRenderer, key, camera);
  assert.equal(read('pmi:text'), snapshot); assert.deepEqual(reads, [mesh]);
  assert.equal(read('other'), null);
  camera.distance += 1; assert.equal(read('pmi:text'), null); assert.equal(reads.length, 1);
  mock.submittedLabelCamera = pmiSvgCameraKey(camera, canvas);
  assert.equal(read('pmi:text'), snapshot);
  canvas.width = 500; // backing resolution is Viewer-owned; CSS size belongs to this guard.
  Object.assign(canvas, { clientWidth: 301 }); assert.equal(read('pmi:text'), null);
});
