import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCadPart, tessellateBrep, transformBrep } from '../dist/index.js';

const a = [20, 20, 0], b = [44, 38, 0], tangent = [0.8, 0.6, 0];
const disk = { id: 's', kind: 'sketch', profile: 'circle', center: [7, 8], radius: 3 };
const sweep = { id: 'w', kind: 'sweep-curve', mode: 'exact-straight', sketch: 's', path: {
  degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [a, [32, 29, 0], b], weights: [1, 1, 1],
} };
const extrude = { id: 'e', kind: 'extrude', sketch: 's', height: 10 };
const brepOf = features => evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features }).outputs[0].brep;
const sub = (p, q) => p.map((x, i) => x - q[i]);
const scale = (p, k) => p.map(x => x * k);
const dot = (p, q) => p.reduce((sum, x, i) => sum + x * q[i], 0);
const unit = p => scale(p, 1 / Math.hypot(...p));
const vector = (data, i) => Array.from(data.subarray(3 * i, 3 * i + 3));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (p, q, label) => assert.ok(Math.hypot(...sub(p, q)) <= 1e-9, `${label}: ${p} vs ${q}`);

test('the two ruled sweep halves use the same radial normal at each coincident mesh seam vertex', () => {
  const brep = brepOf([disk, sweep]), before = structuredClone(brep);
  for (const quality of [4, 8, 16]) {
    const mesh = tessellateBrep(brep, { segmentsPerQuarter: quality });
    const sides = mesh.faces.filter(face => face.kind === 'ruled');
    const caps = mesh.faces.filter(face => face.kind === 'planar');
    assert.equal(sides.length, 2);
    assert.equal(caps.length, 2);
    for (const face of sides) {
      assert.equal(face.vertexCount, 4 * quality + 2);
      assert.equal(face.indexCount, 12 * quality);
    }
    const seen = new Map();
    let shared = 0;
    for (const face of sides) for (let i = face.vertexOffset; i < face.vertexOffset + face.vertexCount; i++) {
      const p = vector(mesh.positions, i), normal = vector(mesh.normals, i), d = sub(p, a);
      const radial = sub(d, scale(tangent, dot(d, tangent)));
      assert.ok(Math.abs(Math.hypot(...radial) - 3) <= 1e-9);
      near(normal, unit(radial), 'cylindrical shading normal');
      assert.ok(Math.abs(dot(tangent, normal)) <= 1e-9);
      const key = p.join(','), previous = seen.get(key);
      if (previous) { near(normal, previous, 'matching shared-seam normal'); shared++; }
      else seen.set(key, normal);
    }
    assert.equal(shared, 4, 'two shared endpoint vertices on each of the two straight seams');
    for (const face of caps) {
      const name = brep.faces.find(f => f.id === face.faceId).name;
      const expected = scale(tangent, name === 'w.start' ? -1 : 1);
      for (let i = face.vertexOffset; i < face.vertexOffset + face.vertexCount; i++) near(vector(mesh.normals, i), expected, 'planar cap normal');
    }
  }
  assert.deepEqual(brep, before, 'tessellation does not mutate the native solid or its IDs');
});

test('ruled cylinder normals respect face sense on inward and reflected bore walls', () => {
  const ring = { ...disk, center: [0, 0], holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'ccw' }]] };
  const original = brepOf([ring, extrude]);
  const translated = [41, 30, -10];
  const mirrored = transformBrep(original, { matrix: [-1, 0, 0, 0, 1, 0, 0, 0, 1], offset: translated });
  for (const [brep, centre] of [[original, [0, 0, 0]], [mirrored, translated]]) {
    const mesh = tessellateBrep(brep), sides = mesh.faces.filter(face => face.kind === 'ruled');
    assert.equal(sides.length, 4);
    let inward = 0, outward = 0;
    for (const face of sides) {
      const p = vector(mesh.positions, face.vertexOffset);
      const radius = Math.hypot(p[0] - centre[0], p[1] - centre[1]);
      const sign = radius < 2 ? -1 : 1;
      if (sign < 0) inward++; else outward++;
      for (let i = face.vertexOffset; i < face.vertexOffset + face.vertexCount; i++) {
        const [x, y] = vector(mesh.positions, i);
        near(vector(mesh.normals, i), scale(unit([x - centre[0], y - centre[1], 0]), sign), 'oriented bore normal');
      }
    }
    assert.deepEqual([inward, outward], [2, 2]);
  }
});

test('a translated ellipse retains its per-triangle fallback instead of getting cylindrical normals', () => {
  const ellipse = transformBrep(brepOf([{ ...disk, center: [0, 0] }, extrude]), { matrix: [2, 0, 0, 0, 1, 0, 0, 0, 1] });
  const mesh = tessellateBrep(ellipse), sides = mesh.faces.filter(face => face.kind === 'ruled');
  assert.equal(sides.length, 2);
  for (const f of sides) {
    const i = f.vertexOffset;
    let sum = [0, 0, 0];
    for (let k = f.indexOffset; k < f.indexOffset + f.indexCount; k += 3) {
      const indices = [...mesh.indices.subarray(k, k + 3)];
      if (!indices.includes(i)) continue;
      const [a, b, c] = indices.map(j => vector(mesh.positions, j));
      const n = cross(sub(b, a), sub(c, a));
      sum = sum.map((x, j) => x + n[j]);
    }
    near(vector(mesh.normals, i), unit(sum), 'noncircular ruled tessellation uses triangle normals');
  }
});
