import test from 'node:test';
import assert from 'node:assert/strict';
import { nearestDistance2, triangleBvh } from '@barocss/cad';
import { evaluateDoc } from '../src/engine/evaluate';
import { emptyDoc, starterDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { commands, type Ctx } from '../src/app/commands';
import { searchOrientation } from '../src/print/orient';
import { printLayers, type LayerLoop } from '../src/print/layers';

// G23's data side, A: a print's layers. A 20 mm cube at 0.2 mm: 100 layers, each one anticlockwise square of 400 mm². The
// starter plate's Ø8 hole: an outer loop and a clockwise hole between the inscribed polygon's area and π·16. The cube
// printed along (1, 0, 1): its two lower faces lean 45° — no overhang at a 45° limit, all of them at 40°, merged per layer
// into one region. A sphere along AM4's best direction: the columns' volume AM4's support volume. Every contour point
// mapped back through the 4×4 lies on the model's mesh. A layer is worked out once.
const box = (x: number, y: number, z: number): StudioDoc => withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [x, y] } as never), { kind: 'extrude', sketch: 0, height: z } as never);
const meshOf = (doc: StudioDoc) => { const r = evaluateDoc(doc, 1); assert.ok(r.ok, r.ok ? '' : r.error.detail); return r; };
const area = (l: LayerLoop) => { let a = 0; const p = l.points, n = p.length / 2; for (let i = 0; i < n; i++) { const j = (i + 1) % n; a += p[2 * i] * p[2 * j + 1] - p[2 * j] * p[2 * i + 1]; } return a / 2; };

test('A: a 20 mm cube at 0.2 mm — 100 layers, each one anticlockwise square of 400 mm²; no overhang, no support; the 4×4 is +Z\'s', () => {
  const L = printLayers([meshOf(box(20, 20, 20)).bodies[0].mesh], { layerHeight: 0.2 });
  assert.deepEqual([L.count, L.layerHeight, L.directionSource, L.supportColumns.length], [100, { value: 0.2, basis: 'set' }, 'default', 0]);
  assert.deepEqual(L.overhangLimit, { value: 45, basis: 'estimate' });
  for (const old of ['layerMM', 'limit', 'supportVolumeMM3']) assert.equal(old in L, false);
  assert.deepEqual(L.modelToBed, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  for (const k of [0, 50, 99]) {
    const l = L.layer(k);
    assert.ok(Math.abs(l.z - (k + 0.5) * 0.2) < 1e-12);
    assert.equal(l.contours.length, 1); assert.ok(!l.contours[0].hole && Math.abs(area(l.contours[0]) - 400) < 1e-6, String(area(l.contours[0])));
    assert.deepEqual([l.overhang, l.support], [[], []]);
  }
  assert.equal(L.layer(7), L.layer(7), 'kept');
  assert.throws(() => L.layer(100), /no layer 100/);
});

test('A: the starter plate\'s Ø8 hole — an outer loop and a clockwise hole, its area between the inscribed polygon\'s and π·16', () => {
  const L = printLayers([meshOf(starterDoc()).bodies[0].mesh]), l = L.layer(10);
  assert.deepEqual(L.layerHeight, { value: 0.2, basis: 'estimate' });
  const outer = l.contours.filter(c => !c.hole), holes = l.contours.filter(c => c.hole);
  assert.equal(outer.length, 1); assert.equal(holes.length, 1);
  assert.ok(area(outer[0]) > 0 && area(holes[0]) < 0, 'outer anticlockwise, hole clockwise');
  // (Its sides: the loop's corners less the points the strips' diagonals put on a chord, in line with their neighbours.)
  const q = holes[0].points, m = q.length / 2;
  let n = 0; for (let i = 0; i < m; i++) { const a = (i + m - 1) % m, c = (i + 1) % m; if (Math.abs((q[2 * i] - q[2 * a]) * (q[2 * c + 1] - q[2 * i + 1]) - (q[2 * i + 1] - q[2 * a + 1]) * (q[2 * c] - q[2 * i])) > 1e-9) n++; }
  const inscribed = n / 2 * 16 * Math.sin(2 * Math.PI / n);
  assert.ok(-area(holes[0]) <= Math.PI * 16 + 1e-9 && -area(holes[0]) >= inscribed - 1e-6, `${-area(holes[0])} of π·16 = ${Math.PI * 16}`);
});

test('A: the cube along (1, 0, 1) — its lower faces lean 45°: no overhang at 45°, all at 40° (one region a layer); every contour point back on the mesh', () => {
  const mesh = meshOf(box(20, 20, 20)).bodies[0].mesh, dir = [Math.SQRT1_2, 0, Math.SQRT1_2];
  assert.equal(printLayers([mesh], { direction: dir, overhangLimit: 45 }).supportColumns.length, 0);
  const L = printLayers([mesh], { direction: dir, overhangLimit: 40 }), mid = L.layer(Math.floor(L.count / 4));
  assert.ok(L.supportColumns.length > 0 && L.supportVolume > 0);
  assert.deepEqual(L.overhangLimit, { value: 40, basis: 'set' });
  assert.equal(mid.overhang.filter(r => !r.hole).length, 1, 'the two faces\' strips merged');
  // (Back through the 4×4: bed → model is its inverse — the turn's transpose, then the offset.)
  const M = L.modelToBed, bvh = triangleBvh(Float64Array.from(mesh.positions), mesh.indices);
  for (const k of [3, Math.floor(L.count / 2), L.count - 4]) {
    const l = L.layer(k);
    for (const c of l.contours) for (let i = 0; i < c.points.length; i += 2) {
      const x = c.points[i], y = c.points[i + 1], z = l.z - M[14];
      const p = [M[0] * x + M[1] * y + M[2] * z, M[4] * x + M[5] * y + M[6] * z, M[8] * x + M[9] * y + M[10] * z];
      assert.ok(nearestDistance2(bvh, p[0], p[1], p[2]) < 1e-9, `layer ${k}: ${p} off the mesh`);
    }
  }
});

test('A: a sphere along AM4\'s best direction — the support columns\' volume is AM4\'s support volume; each column footprint × height sums to it', () => {
  const sphere = commands.find(c => c.id === 'sphere')!, blank: Ctx = { doc: emptyDoc(), bodies: [], selection: { faces: [], edges: [], bodies: [] } };
  const r = meshOf(sphere.build!(blank, { ...sphere.defaults!(blank), r: 10 })), mesh = r.bodies[0].mesh;
  const am4 = searchOrientation(mesh, r.faceTable!, 45).best, support = am4.supportVolume ?? 0;
  assert.ok(support > 0, 'a ball needs support');
  const L = printLayers([mesh], { direction: am4.direction, overhangLimit: 45 });
  assert.ok(Math.abs(L.supportVolume - support) <= 1e-9 * support, `${L.supportVolume} vs AM4 ${support}`);
  const sum = L.supportColumns.reduce((t, c) => { const f = c.footprint; return t + Math.abs((f[0] * (f[3] - f[5]) + f[2] * (f[5] - f[1]) + f[4] * (f[1] - f[3])) / 2) * (c.z1 - c.z0); }, 0);
  assert.ok(Math.abs(sum - L.supportVolume) <= 1e-9 * sum, `${sum}`);
  assert.ok(L.layer(2).support.length > 0, 'a low layer has support under the ball');
});

test('terminal partial layers sample their actual band midpoint, retaining ceil count and complete contours', () => {
  const mesh = meshOf(box(20, 20, 6)).bodies[0].mesh;
  const cases = [
    { height: 6, h: 0.35, count: 18, last: 5.975 },
    { height: 6, h: 0.30, count: 20, last: 5.85 },
    { height: 6, h: 0.40, count: 15, last: 5.8 },
    { height: 6, h: 0.32, count: 19, last: 5.88 }, // remainder exceeds half a nominal layer
    { height: 6, h: 7, count: 1, last: 3 },
    { height: 6, h: Number.MAX_VALUE, count: 1, last: 3 },
    { height: 0.01, h: 0.35, count: 1, last: 0.005 },
    { height: 2 ** -40, h: 0.35, count: 1, last: 2 ** -41 },
    { height: 22.4, h: 0.35, count: 64, last: 22.225 },
    { height: 22.45, h: 0.35, count: 65, last: 22.425 }, // new chunk at index 64
  ];
  for (const { height, h, count, last } of cases) {
    const scaled = { ...mesh, positions: Float64Array.from(mesh.positions, (value, index) => index % 3 === 2 && value !== 0 ? height : value) };
    const before = scaled.positions.slice(), layers = printLayers([scaled], { layerHeight: h });
    assert.equal(layers.count, count); assert.equal(layers.height, height);
    assert.ok(Math.abs(layers.layer(count - 1).z - last) <= Number.EPSILON * Math.max(1, height) * 4, `${height}/${h}: ${layers.layer(count - 1).z}`);
    for (let k = 0; k < count; k++) {
      const layer = layers.layer(k), lower = Math.min(height, k * h), upper = Math.min(height, (k + 1) * h);
      assert.equal(layer.z, lower + (upper - lower) / 2);
      assert.ok(layer.z >= lower && layer.z <= upper && layer.z <= height);
      assert.equal(layer.contours.length, 1, `height ${height}, h ${h}, index ${k}`);
      assert.ok(Math.abs(area(layer.contours[0]) - 400) < 1e-8);
      assert.deepEqual([layer.overhang, layer.support], [[], []]);
    }
    assert.strictEqual(layers.layer(count - 1), layers.layer(count - 1), 'lazy cache contract unchanged');
    assert.throws(() => layers.layer(count), /no layer/); assert.deepEqual(scaled.positions, before);
    if (h === 0.35 && height === 6) assert.ok(Math.abs(layers.layer(16).z - 5.775) < 1e-12, 'previous full layer unchanged');
  }
});

test('floating multiple boundaries retain the existing count policy and sample only their actual band', () => {
  const mesh = meshOf(box(20, 20, 6)).bodies[0].mesh, h = 0.3;
  for (const height of [6 - 1e-12, 6 + 1e-12, 6 + h * 0.5e-9, 6 + h * 2e-9, 6 - h * 2e-9]) {
    const scaled = { ...mesh, positions: Float64Array.from(mesh.positions, (value, index) => index % 3 === 2 && value !== 0 ? height : value) };
    const layers = printLayers([scaled], { layerHeight: h }), k = layers.count - 1;
    assert.equal(layers.count, Math.max(1, Math.ceil(height / h - 1e-9)));
    const lower = Math.min(height, k * h), upper = Math.min(height, (k + 1) * h), last = layers.layer(k);
    assert.equal(last.z, lower + (upper - lower) / 2); assert.ok(last.z >= lower && last.z <= upper);
    assert.equal(last.contours.length, 1);
  }
});

test('partial-layer overhang uses the real band while support uses its corrected sample; summary columns remain unchanged', () => {
  const mesh = meshOf(box(20, 20, 6)).bodies[0].mesh;
  // Two downward display triangles outside the box: one below the terminal
  // band, one inside it. Neither is a native CAD body or manufacturing claim.
  const overhang = { ...mesh, positions: new Float64Array([40, 0, 5.82, 40, 2, 5.82, 42, 0, 5.82, 50, 0, 5.99, 50, 2, 5.99, 52, 0, 5.99]), indices: new Uint32Array([0, 1, 2, 3, 4, 5]) };
  const layers = printLayers([mesh, overhang], { layerHeight: 0.35 }), last = layers.layer(layers.count - 1);
  assert.ok(Math.abs(last.z - 5.975) < 1e-12);
  assert.equal(last.overhang.length, 1, '5.82 triangle is outside actual [5.95,6] band');
  assert.ok(Array.from(last.overhang[0].points).filter((_, index) => index % 2 === 0).every(x => x >= 50));
  assert.equal(last.support.length, 1, 'sample below 5.99 uses its existing support column');
  const control = printLayers([mesh, overhang], { layerHeight: 0.30 });
  assert.deepEqual(layers.supportColumns, control.supportColumns); assert.equal(layers.supportVolume, control.supportVolume);
});

test('last partial samples stay on the mesh in positive, negative and oblique build directions', () => {
  const mesh = meshOf(box(20, 10, 6)).bodies[0].mesh, bvh = triangleBvh(Float64Array.from(mesh.positions), mesh.indices);
  for (const direction of [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [1, 0, 1]]) {
    const layers = printLayers([mesh], { direction, layerHeight: 0.35 }), layer = layers.layer(layers.count - 1), M = layers.modelToBed;
    assert.ok(layer.z >= 0 && layer.z <= layers.height); assert.equal(layer.contours.length, 1);
    for (const contour of layer.contours) for (let i = 0; i < contour.points.length; i += 2) {
      const x = contour.points[i], y = contour.points[i + 1], z = layer.z - M[14];
      const p = [M[0] * x + M[1] * y + M[2] * z, M[4] * x + M[5] * y + M[6] * z, M[8] * x + M[9] * y + M[10] * z];
      assert.ok(nearestDistance2(bvh, p[0], p[1], p[2]) < 1e-9);
    }
  }
});


test('a thin separate display body at the chunk-64 boundary is not lost from its final partial layer', () => {
  const mesh = meshOf(box(20, 20, 6)).bodies[0].mesh;
  const anchor = { ...mesh, positions: Float64Array.from(mesh.positions, (value, index) => index % 3 === 2 && value !== 0 ? 1 : value) };
  const raised = { ...mesh, positions: Float64Array.from(mesh.positions, (value, index) => index % 3 === 2 ? value === 0 ? 22.4 : 22.45 : value) };
  const layers = printLayers([anchor, raised], { layerHeight: 0.35 });
  assert.equal(layers.count, 65); assert.equal(layers.layer(63).contours.length, 0);
  assert.equal(layers.layer(64).contours.length, 1);
  assert.ok(Math.abs(layers.layer(64).z - 22.425) < 1e-12);
});
