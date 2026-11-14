import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateCadPart, type CadPartDocument } from '@barocss/cad';
import { arcSweepMixedDisplayMesh } from '../src/engine/arcSweepMixedDisplay';
import { bodyMesh, type BoundedDisplayMesh, type DisplayMesh } from '../src/engine/mesh';
import { cross, dot, len, sub, type Vec3 } from '../src/engine/vec3';

const centre: Vec3 = [13, -7, 4];
const corners: Vec3[] = [[33, -7, 4], [33, 13, 4], [13, 13, 4]];
function profileSweep(back: number, reverse = false): CadPartDocument {
  return {
    format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
    features: [{ id: 's', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [back, 3] },
      { kind: 'arc', start: [12, 3], center: [12, 8], direction: 'ccw' },
      { kind: 'line', start: [12, 13] },
      { kind: 'line', start: [back, 13] },
    ], sideTags: { outer: ['west', 'halfRound', 'east', 'inboard'] } },
    { id: 'branch', kind: 'sweep-curve', sketch: 's', mode: 'exact',
      path: { degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: reverse ? [...corners].reverse() : corners, weights: [1, Math.SQRT1_2, 1] } }],
  };
}

const near = (actual: number, expected: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, JSON.stringify({ actual, expected, tolerance }));
const key = (a: Vec3, b: Vec3) => [a.join(','), b.join(',')].sort().join('|');
const xyz = (a: ArrayLike<number>, i: number): Vec3 => [a[3 * i], a[3 * i + 1], a[3 * i + 2]];
function inspect(mesh: DisplayMesh, detail: BoundedDisplayMesh, back: number) {
  const rectangleArea = (12 - back) * 10, halfArea = 12.5 * Math.PI, area = rectangleArea + halfArea;
  const anchor = (rectangleArea * (12 + back) / 2 + halfArea * (12 + 20 / (3 * Math.PI))) / area;
  const major = 32 - anchor, inner = 20 + back - anchor, outer = major + 5;
  const { positions, indices, normals, faceOfVertex, edgeOfSegment, edgeLines } = detail;
  assert.equal(positions.length / 3, 2883);
  assert.equal(indices.length / 3, 5126);
  const size = [positions, normals, indices, faceOfVertex, edgeOfSegment, edgeLines].reduce((bytes, view) => bytes + view.byteLength, 0);
  assert.equal(size, 188_144);
  assert.ok(size <= 192 * 1024);

  const boundaries = mesh.faces.map(() => new Map<string, number>());
  const projection = mesh.faces.map(() => [] as Vec3[]);
  for (let i = 0; i < faceOfVertex.length; i++) projection[faceOfVertex[i]].push(sub(xyz(positions, i), centre));
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.subarray(i, i + 3);
    const owner = faceOfVertex[a];
    assert.equal(faceOfVertex[b], owner);
    assert.equal(faceOfVertex[c], owner);
    const [p, q, r] = [xyz(positions, a), xyz(positions, b), xyz(positions, c)];
    assert.ok(dot(cross(sub(q, p), sub(r, p)), xyz(normals, a)) > 0);
    for (const [u, v] of [[p, q], [q, r], [r, p]]) {
      const k = key(u, v), boundary = boundaries[owner];
      boundary.set(k, (boundary.get(k) ?? 0) + 1);
    }
    const name = mesh.faces[owner].name, cylinder = name.includes('inboard'), torus = name.includes('halfRound');
    if (!cylinder && !torus) continue;
    for (const j of [a, b, c]) {
      const [x, y, z] = sub(xyz(positions, j), centre), radius = Math.hypot(x, y);
      const radial = cylinder ? -1 : (radius - major) / 5;
      const expected: Vec3 = [radial * x / radius, radial * y / radius, cylinder ? 0 : z / 5];
      assert.ok(len(sub(xyz(normals, j), expected)) < 1e-7);
    }
    for (let u = 0; u <= 4; u++) for (let v = 0; v <= 4 - u; v++) {
      const [x, y, z] = p.map((value, axis) => (value * (4 - u - v) + q[axis] * u + r[axis] * v) / 4 - centre[axis]);
      const radius = Math.hypot(x, y);
      const deviation = cylinder ? Math.abs(radius - inner) : Math.abs(Math.hypot(radius - major, z) - 5);
      assert.ok(deviation <= detail.error);
    }
  }
  const counts = new Map<number, number>();
  const visible = new Set<string>();
  for (let i = 0; i < edgeLines.length; i += 6) {
    const owner = edgeOfSegment[i / 3], edge = mesh.edges[owner], k = key(xyz(edgeLines, i / 3), xyz(edgeLines, i / 3 + 1));
    assert.equal(edgeOfSegment[i / 3 + 1], owner);
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
    visible.add(k);
    for (const face of edge.faces) assert.equal(boundaries[face].get(k), 1);
  }
  assert.deepEqual([...counts.values()].sort((a, b) => a - b), [1, 1, 1, 1, 1, 1, 42, 42, 56, 56]);
  const round = mesh.faces.find(face => face.name.includes('halfRound'))!, roundBoundary = boundaries[round.index];
  const hidden = [...roundBoundary].filter(([k, used]) => used === 1 && !visible.has(k)).map(([k]) => k);
  assert.equal(hidden.length, 112);
  const annuli = mesh.faces.filter(face => /west|east/.test(face.name));
  for (const k of hidden) assert.equal(annuli.filter(face => boundaries[face.index].get(k) === 1).length, 1);

  const cylinder = mesh.faces.find(face => face.name.includes('inboard'))!;
  const theta = Math.PI / 2 / 56;
  // Chord midpoints at each half station give the exact top-view outer and inner arc sagitta.
  for (const [owner, radius] of [[round.index, outer], [cylinder.index, inner]]) {
    const ring = projection[owner].filter(p => Math.abs(Math.hypot(p[0], p[1]) - radius) < 1e-7);
    const angles = new Set(ring.map(p => Math.round(Math.atan2(p[1], p[0]) / theta)));
    assert.deepEqual([...angles].sort((a, b) => a - b), Array.from({ length: 57 }, (_, j) => j));
    const depth = radius * (1 - Math.cos(theta / 2));
    assert.ok(depth * 65.112 < 0.25);
    near(Math.max(...ring.map(p => Math.hypot(p[0], p[1]))), radius);
  }
  assert.ok(detail.error < 0.009);
}

test('mixed arc packets share exact XYZ boundaries, keep owners and refine both contours', () => {
  for (const [back, reverse] of [[2, false], [3, false], [2, true]] as const) {
    const [output] = evaluateCadPart(profileSweep(back, reverse)).outputs;
    const base = bodyMesh(output.brep, 1);
    const shown = arcSweepMixedDisplayMesh(base, output.brep);
    assert.ok(shown.arcSweepDetail);
    assert.equal(shown.faces, base.faces);
    assert.equal(shown.edges, base.edges);
    assert.equal(shown.positions, base.positions);
    assert.equal(arcSweepMixedDisplayMesh(base, output.brep), shown);
    inspect(shown, shown.arcSweepDetail, back);
  }
});

test('the mixed angular packet keeps the canonical mesh for a different native section', () => {
  const source = profileSweep(2), path = source.features[1];
  assert.equal(path.kind, 'sweep-curve');
  const [output] = evaluateCadPart({ ...source, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-5, -4], max: [5, 4] }, path,
  ] }).outputs;
  const base = bodyMesh(output.brep, 1);
  assert.equal(base.faces.length, 6);
  assert.equal(arcSweepMixedDisplayMesh(base, output.brep), base);
});

test('an offset bore shares its two half-rims with both trimmed caps and one pick owner per mouth', () => {
  for (const [r, reverse] of [[1, false], [1.5, false], [1, true]] as const) {
    const source = profileSweep(2, reverse), [profile, path] = source.features;
    assert.ok(profile.kind === 'sketch' && profile.profile === 'loop');
    const [output] = evaluateCadPart({ ...source, features: [{
      ...profile,
      holes: [[{ kind: 'arc', start: [8 + r, 7], center: [8, 7], direction: 'cw' }]],
      sideTags: { ...profile.sideTags!, holes: [['eccentric']] },
    }, path] }).outputs;
    const base = bodyMesh(output.brep, 1), mesh = arcSweepMixedDisplayMesh(base, output.brep), detail = mesh.arcSweepDetail;
    assert.ok(detail);
    assert.equal(mesh.faces, base.faces);
    assert.equal(mesh.edges, base.edges);
    assert.equal(mesh.positions, base.positions);
    assert.equal(mesh.faces.length, 7);
    assert.equal(mesh.edges.length, 12);
    const { positions, indices, normals, faceOfVertex, edgeOfSegment, edgeLines } = detail;
    const bytes = [positions, normals, indices, faceOfVertex, edgeOfSegment, edgeLines].reduce((n, buffer) => n + buffer.byteLength, 0);
    assert.equal(bytes, 186_480);
    assert.ok(detail.error < 0.024);

    const area = 100 + 12.5 * Math.PI, anchor = (700 + 12.5 * Math.PI * (12 + 20 / (3 * Math.PI))) / area;
    const boreMajor = 28 - anchor, boreZ = 4 + (reverse ? -1 : 1), bore = mesh.faces.find(face => face.name.endsWith('[eccentric]'))!;
    const mouths = mesh.edges.filter(edge => edge.names.every(name => name.includes('[eccentric]')));
    const caps = mouths.map(edge => mesh.faces[edge.faces.find(index => index !== bore.index)!]);
    assert.equal(mouths.length, 2);
    for (const edge of mouths) {
      assert.equal(edge.names.length, 2);
      assert.equal(edge.nativeJoint, undefined);
      assert.ok(edge.nativeCircle && edge.faces.includes(bore.index));
    }
    const boundaries = mesh.faces.map(() => new Map<string, number>());
    const capAreas = new Map(caps.map(cap => [cap.index, 0]));
    const contourArcs = new Map([['[inboard]', 22 - anchor], ['[halfRound]', 37 - anchor]]);
    const contourStations = new Map([...contourArcs.keys()].map(name => [name, new Set<number>()]));
    const step = Math.PI / (2 * 52);
    for (let i = 0; i < faceOfVertex.length; i++) {
      const face = mesh.faces[faceOfVertex[i]], [x, y, z] = xyz(positions, i), d = [x - 13, y + 7, z - boreZ] as Vec3;
      const radial = Math.hypot(d[0], d[1]), carrierError = radial - boreMajor;
      if (face.index === bore.index) {
        near(Math.hypot(carrierError, d[2]), r);
        assert.ok(len(sub(xyz(normals, i), [-carrierError * d[0] / radial / r, -carrierError * d[1] / radial / r, -d[2] / r])) < 1e-7);
      }
      for (const [name, radius] of contourArcs) if (face.name.endsWith(name) && Math.abs(radial - radius) < 1e-7) {
        const j = Math.round(Math.atan2(d[1], d[0]) / step);
        near(radial, radius);
        near(Math.atan2(d[1], d[0]), j * step);
        contourStations.get(name)!.add(j);
      }
    }
    for (const [name, radius] of contourArcs) {
      assert.deepEqual([...contourStations.get(name)!].sort((a, b) => a - b), Array.from({ length: 53 }, (_, j) => j));
      assert.ok(radius * (1 - Math.cos(step / 2)) * 64.012 < 0.25);
    }
    for (let i = 0; i < indices.length; i += 3) {
      const [i0, i1, i2] = indices.subarray(i, i + 3), owner = faceOfVertex[i0];
      assert.equal(faceOfVertex[i1], owner);
      assert.equal(faceOfVertex[i2], owner);
      const [a, b, c] = [xyz(positions, i0), xyz(positions, i1), xyz(positions, i2)];
      const n = cross(sub(b, a), sub(c, a));
      assert.ok(dot(n, xyz(normals, i0)) > 0);
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const k = key(p, q), used = boundaries[owner];
        used.set(k, (used.get(k) ?? 0) + 1);
      }
      if (!capAreas.has(owner)) continue;
      capAreas.set(owner, capAreas.get(owner)! + len(n) / 2);
    }
    const polygonArea = 100 + 12 * 25 * Math.sin(Math.PI / 24) - 24 * r ** 2 * Math.sin(Math.PI / 24);
    for (const area of capAreas.values()) near(area, polygonArea);
    const visible = new Map<number, number>();
    for (let i = 0; i < edgeLines.length; i += 6) {
      const index = edgeOfSegment[i / 3], edge = mesh.edges[index];
      const p = xyz(edgeLines, i / 3), q = xyz(edgeLines, i / 3 + 1);
      assert.equal(edgeOfSegment[i / 3 + 1], index);
      for (const face of edge.faces) assert.equal(boundaries[face].get(key(p, q)), 1);
      visible.set(index, (visible.get(index) ?? 0) + 1);
      if (!mouths.includes(edge)) continue;
      const circle = edge.nativeCircle!;
      const a = sub(p, circle.centre), b = sub(q, circle.centre);
      for (const v of [a, b]) {
        near(len(v), r);
        near(dot(v, circle.normal), 0);
      }
      near(1 - dot(a, b) / (r * r), 1 - Math.cos(Math.PI / 24));
      assert.ok((r - Math.hypot(...a.map((x, j) => (x + b[j]) / 2))) * 64.012 < 0.25);
    }
    assert.equal(visible.size, 12);
    assert.deepEqual(mouths.map(edge => visible.get(edge.index)), [48, 48]);
    // Hidden bore rails appear as interior segments of the merged wall, with one triangle per native half.
    const seamStride = 25, firstBore = faceOfVertex.indexOf(bore.index);
    for (const seam of [0, seamStride - 1]) for (let row = 0; row < 20; row++) {
      const i = firstBore + row * seamStride + seam;
      assert.equal(boundaries[bore.index].get(key(xyz(positions, i), xyz(positions, i + seamStride))), 2);
    }
  }
});
