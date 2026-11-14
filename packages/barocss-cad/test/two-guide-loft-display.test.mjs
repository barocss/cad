import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, loftSolid, tessellateBrep } from '../dist/index.js';
import { tessellateTwoGuideLoftDisplay } from '../dist/internal/two-guide-loft-display.js';

const add = (p, q) => p.map((x, i) => x + q[i]);
const sub = (p, q) => p.map((x, i) => x - q[i]);
const scale = (p, f) => p.map(x => x * f);
const blend = (p, q, f) => add(p, scale(sub(q, p), f));
const dot = (p, q) => p.reduce((sum, x, i) => sum + x * q[i], 0);
const cross = ([x, y, z], [a, b, c]) => [y * c - z * b, z * a - x * c, x * b - y * a];
const length = p => Math.hypot(...p);
const unit = p => scale(p, 1 / length(p));
const vertex = (xyz, i) => Array.from(xyz.subarray(3 * i, 3 * i + 3));
const near = (p, q, epsilon = 1e-10) => assert.ok(length(sub(p, q)) <= epsilon, `${p} != ${q}`);

function fixture({ twisted = true, equal = false, upperX = 18, offset = [0, 0, 0], size = 1 } = {}) {
  const [tx, ty, tz] = offset;
  const topWidth = equal ? 10 : 14, topDepth = equal ? 6 : 4, height = 12;
  const y0 = twisted ? -1 : 0, y1 = twisted ? 3 : 0;
  const world = p => add(offset, scale(p, size));
  const rect = (w, d) => [[0, 0], [w, 0], [w, d], [0, d]].map(([x, y]) => ({ kind: 'line', start: [tx + x * size, ty + y * size] }));
  const sections = [{ profile: rect(10, 6), z: tz }, { profile: rect(topWidth, topDepth), z: tz + height * size }];
  const guide = points => ({ kind: 'quadratic-bezier', controlPoints: points.map(world) });
  const guides = [guide([[0, 0, 0], [2, y0, 6], [0, 0, height]]), guide([[10, 0, 0], [upperX, y1, 6], [topWidth, 0, height]])];
  const { brep } = loftSolid({ id: 'loft', name: 'loft', sections, guides });

  // An independent slice oracle from the two authored rails and the linear aspect ratio.
  function slice(t) {
    const q = 2 * t * (1 - t), dq = 2 - 4 * t;
    const a = [2 * q, y0 * q, height * t], da = [2 * dq, y0 * dq, height];
    const taper = topWidth - 10, bow = upperX - 2 - (10 + topWidth) / 2;
    const span = [10 + taper * t + bow * q, (y1 - y0) * q, 0];
    const dspan = [taper + bow * dq, (y1 - y0) * dq, 0];
    const slope = topDepth / topWidth - 0.6, aspect = 0.6 + slope * t;
    const rotate = ([x, y]) => [-y, x, 0];
    const offset = scale(rotate(span), aspect), doffset = add(scale(rotate(span), slope), scale(rotate(dspan), aspect));
    return {
      points: [a, add(a, span), add(add(a, span), offset), add(a, offset)].map(world),
      derivatives: [da, add(da, dspan), add(add(da, dspan), doffset), add(da, doffset)],
    };
  }
  function surface(side, u, v) {
    const { points, derivatives } = slice(v), next = (side + 1) % 4;
    return { point: blend(points[side], points[next], u), normal: unit(cross(sub(points[next], points[side]), blend(derivatives[side], derivatives[next], u))) };
  }
  return { brep, slice, surface };
}

const segmentKey = (a, b) => [a.join(','), b.join(',')].sort().join('|');

function verifySharedBoundary(brep, mesh) {
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(mesh.edges.map(edge => [edge.edgeId, edge.points]));
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  for (const edge of brep.edges) {
    const points = edges.get(edge.id);
    assert.deepEqual(vertex(points, 0), vertices.get(edge.vertices[0]));
    assert.deepEqual(vertex(points, points.length / 3 - 1), vertices.get(edge.vertices[1]));
  }
  for (const [j, face] of mesh.faces.entries()) {
    const counts = new Map();
    for (let i = face.indexOffset; i < face.indexOffset + face.indexCount; i += 3) {
      const samples = [0, 1, 2].map(k => mesh.indices[i + k]);
      const [a, b, c] = samples.map(k => vertex(mesh.positions, k));
      const normal = cross(sub(b, a), sub(c, a));
      assert.ok(length(normal) > 0);
      for (const k of samples) assert.ok(dot(normal, vertex(mesh.normals, k)) > 0);
      for (const key of [segmentKey(a, b), segmentKey(b, c), segmentKey(c, a)]) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const id of loops.get(brep.faces[j].loops[0]).coedges) {
      const points = edges.get(uses.get(id).edge);
      for (let i = 1; i < points.length / 3; i++) {
        const key = segmentKey(vertex(points, i - 1), vertex(points, i));
        assert.equal(counts.get(key), 1, key);
        counts.delete(key);
      }
    }
    assert.ok([...counts.values()].every(count => count === 2));
  }
}

function verifyPacket({ brep, surface }, packet) {
  assert.ok(packet, 'the live two-guide Loft admits a display packet');
  const { mesh, error } = packet;
  assert.ok(error > 0 && error <= 0.01, error);
  assert.deepEqual(mesh.faces.map(f => f.faceId), brep.faces.map(f => f.id));
  assert.deepEqual(mesh.faces.map(f => f.kind), tessellateBrep(brep).faces.map(f => f.kind));
  assert.deepEqual(mesh.edges.map(e => e.edgeId), brep.edges.map(e => e.id));
  const segments = mesh.edges.reduce((sum, edge) => sum + edge.points.length / 3 - 1, 0);
  assert.ok(mesh.positions.length / 3 * 40 + mesh.indices.byteLength + segments * 56 <= 192 * 1024);
  verifySharedBoundary(brep, mesh);

  const u = mesh.edges[0].points.length / 3 - 1, v = mesh.edges[8].points.length / 3 - 1;
  const sample = new Map();
  let worst = 0;
  for (const [side, face] of mesh.faces.slice(0, 4).entries()) {
    for (let j = 0; j <= v; j++) for (let i = 0; i <= u; i++) {
      const k = face.vertexOffset + j * (u + 1) + i, uv = [i / u, j / v];
      sample.set(k, uv);
      const expected = surface(side, ...uv);
      near(vertex(mesh.positions, k), expected.point);
      near(vertex(mesh.normals, k), expected.normal);
    }
    for (let k = face.indexOffset; k < face.indexOffset + face.indexCount; k += 3) {
      const vi = [mesh.indices[k], mesh.indices[k + 1], mesh.indices[k + 2]];
      const xy = vi.map(i => sample.get(i)), points = vi.map(i => vertex(mesh.positions, i));
      for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4 - i; j++) {
        const w = [i / 4, j / 4, 1 - (i + j) / 4];
        const v = w.map((value, n) => value * xy[n][1]).reduce((a, b) => a + b);
        const u = w.map((value, n) => value * xy[n][0]).reduce((a, b) => a + b);
        const p = points.reduce((sum, point, n) => add(sum, scale(point, w[n])), [0, 0, 0]);
        worst = Math.max(worst, length(sub(p, surface(side, u, v).point)));
      }
    }
  }
  // The same UV point pairs any point of each triangle with a point of the exact chart, in both directions.
  assert.ok(worst > 0 && worst <= error, `sampled ${worst} mm, bound ${error} mm`);
  return { mesh, error, u, v };
}

test('two-guide Loft display bounds quadratic and cubic surfaces using one exact shared boundary', () => {
  for (const input of [{ equal: true, upperX: 14 }, { twisted: false, upperX: 16 }, { upperX: 18 }]) {
    const model = fixture(input), native = structuredClone(model.brep);
    const old = tessellateBrep(model.brep);
    const { u, v } = verifyPacket(model, tessellateTwoGuideLoftDisplay(model.brep));
    assert.ok(u > 1 && v > 8);
    assert.ok(checkBrep(model.brep, { strict: true }).valid);
    assert.deepEqual(model.brep, native);
    assert.deepEqual(tessellateBrep(model.brep), old);
    assert.equal(tessellateTwoGuideLoftDisplay(native), undefined);
  }
});

test('two-guide Loft display retains the same tessellation and normals under world translation', () => {
  const offset = [8000, -8400, 9100];
  const rest = fixture(), moved = fixture({ offset });
  const a = verifyPacket(rest, tessellateTwoGuideLoftDisplay(rest.brep));
  const b = verifyPacket(moved, tessellateTwoGuideLoftDisplay(moved.brep));
  assert.deepEqual([a.u, a.v], [b.u, b.v]);
  assert.deepEqual(a.mesh.indices, b.mesh.indices);
  assert.ok(Math.abs(a.error - b.error) < 1e-8);
  for (let i = 0; i < a.mesh.positions.length / 3; i++) {
    near(add(vertex(a.mesh.positions, i), offset), vertex(b.mesh.positions, i));
    near(vertex(a.mesh.normals, i), vertex(b.mesh.normals, i));
  }
});

test('two-guide Loft display still refines a part scaled down by 100', () => {
  const miniature = fixture({ size: 0.01 });
  const { mesh, error, v } = verifyPacket(miniature, tessellateTwoGuideLoftDisplay(miniature.brep));
  assert.ok(mesh.indices.length > tessellateBrep(miniature.brep).indices.length);
  assert.ok(v >= 32 && error < 0.00012);
  for (const [rail, { points }] of mesh.edges.slice(8).entries()) {
    for (let i = 0; i < v; i++) {
      const exact = miniature.slice((i + 0.5) / v).points[rail];
      const chord = blend(vertex(points, i), vertex(points, i + 1), 0.5);
      assert.ok(length(sub(exact, chord)) < 0.00004);
    }
  }
});

test('two-guide Loft display keeps its packet bounded and refuses a mutated native edge', () => {
  const large = fixture({ size: 50 });
  assert.equal(tessellateTwoGuideLoftDisplay(large.brep), undefined);
  const model = fixture();
  model.brep.edges[8].curve.controlPoints[1][0] += 0.001;
  assert.equal(tessellateTwoGuideLoftDisplay(model.brep), undefined);
});
