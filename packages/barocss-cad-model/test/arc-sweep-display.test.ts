import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudioDoc } from '../src/engine/doc';
import { evaluateDoc, shareMeshes } from '../src/engine/evaluate';
import { MeshReceiver, MeshSender } from '../src/engine/meshWire';
import { cross, dot, len, sub, type Vec3 } from '../src/engine/vec3';

const doc: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 5 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, mode: 'exact', name: 'Quarter arc',
      path: { degree: 2, knots: [0,0,0,1,1,1], controlPoints: [[30,0,0],[30,30,0],[0,30,0]], weights: [1,Math.SQRT1_2,1] } }],
  outputs: { b1: { node: 1, side: 'solid' } },
};

test('the refined circular Sweep has analytic side normals and shared cap and rim samples', () => {
  shareMeshes(true);
  try {
    const canonical = evaluateDoc(doc, 1), refined = evaluateDoc(doc, 2, 8, true);
    assert.ok(canonical.ok && refined.ok);
    const base = canonical.bodies[0].mesh, mesh = refined.bodies[0].mesh, detail = mesh.arcSweepDetail;
    assert.ok(detail);
    assert.equal(mesh.faces, base.faces);
    assert.equal(mesh.edges, base.edges);
    assert.equal(mesh.positions, base.positions);
    const volume = 30 * Math.PI / 2 * Math.PI * 5 ** 2;
    assert.ok(Math.abs(refined.bodies[0].volume! - volume) < 1e-8);
    assert.equal(refined.bodies[0].volume, canonical.bodies[0].volume);

    const { positions, indices, normals, faceOfVertex, edgeOfSegment, edgeLines } = detail;
    const xyz = (i: number): Vec3 => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const normal = (i: number): Vec3 => [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]];
    const triangleEdges = new Map<number, Set<string>>();
    const edgeKey = (a: Vec3, b: Vec3) => [a.join(','), b.join(',')].sort().join('|');
    let triangleError = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = Array.from(indices.subarray(i, i + 3));
      const owner = faceOfVertex[a];
      assert.equal(owner, faceOfVertex[b]);
      assert.equal(owner, faceOfVertex[c]);
      const [p, q, r] = [xyz(a), xyz(b), xyz(c)];
      assert.ok(dot(cross(sub(q, p), sub(r, p)), normal(a)) > 0);
      const edges = triangleEdges.get(owner) ?? new Set<string>();
      for (const [start, end] of [[p, q], [q, r], [r, p]]) edges.add(edgeKey(start, end));
      triangleEdges.set(owner, edges);
      if (mesh.faces[owner].kind === 'plane') continue;
      for (const [v, n] of [[p, normal(a)], [q, normal(b)], [r, normal(c)]]) {
        const radial = Math.hypot(v[0], v[1]);
        const expected: Vec3 = [(radial - 30) * v[0] / radial / 5, (radial - 30) * v[1] / radial / 5, v[2] / 5];
        assert.ok(len(sub(n, expected)) < 1e-7);
      }
      for (let u = 0; u <= 4; u++) for (let v = 0; v <= 4 - u; v++) {
        const [x, y, z] = p.map((value, axis) => (value * (4 - u - v) + q[axis] * u + r[axis] * v) / 4);
        triangleError = Math.max(triangleError, Math.abs(Math.hypot(Math.hypot(x, y) - 30, z) - 5));
      }
    }
    assert.ok(triangleError < detail.error && detail.error < 0.02, JSON.stringify({ triangleError, bound: detail.error }));
    const picked = new Set<number>();
    for (let i = 0; i < edgeLines.length; i += 6) {
      const owner = edgeOfSegment[i / 3];
      assert.equal(edgeOfSegment[i / 3 + 1], owner);
      picked.add(owner);
      const a = Array.from(edgeLines.subarray(i, i + 3)) as Vec3, b = Array.from(edgeLines.subarray(i + 3, i + 6)) as Vec3;
      for (const face of mesh.edges[owner].faces) assert.ok(triangleEdges.get(face)?.has(edgeKey(a, b)));
    }
    assert.equal(picked.size, 4);

    const sender = new MeshSender(), receiver = new MeshReceiver();
    const packed = sender.pack('model', refined);
    assert.equal(packed.transfer.length, 12);
    assert.ok(packed.transfer.slice(6).reduce((bytes, buffer) => bytes + buffer.byteLength, 0) <= 192 * 1024);
    const roundtrip = receiver.unpack('model', structuredClone(packed.result, { transfer: packed.transfer }));
    assert.ok(roundtrip.ok);
    assert.deepEqual(roundtrip.bodies[0].mesh.arcSweepDetail, detail);
    assert.equal(sender.pack('model', refined).transfer.length, 0);
  } finally {
    shareMeshes(false);
  }
});

test('the refined packet covers a tilted quarter arc and a reversed 30-degree arc', () => {
  const feature = doc.nodes[1];
  assert.equal(feature.kind, 'sweep-curve');
  const endpoints = [[25,9,4],[25,9,24],[13,-7,24]] as Vec3[];
  const angle = Math.PI / 6;
  const minorArc = [[30 * Math.cos(angle), 30 * Math.sin(angle), 0], [30,30 * Math.tan(angle / 2),0], [30,0,0]] as Vec3[];
  for (const [controlPoints, weight] of [[endpoints, Math.SQRT1_2], [minorArc, Math.cos(angle / 2)]] as const) {
    const candidate: StudioDoc = { ...doc, nodes: [doc.nodes[0], { ...feature,
      path: { ...feature.path, controlPoints, weights: [1, weight, 1] } }] };
    const result = evaluateDoc(candidate, 1, 8, true);
    assert.ok(result.ok);
    assert.ok(result.bodies[0].mesh.arcSweepDetail);
  }
});
