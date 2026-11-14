import assert from 'node:assert/strict';
import test from 'node:test';
import { composeArcSweepExterior } from '../src/engine/arcSweepExteriorDetail';
import type { StudioDoc } from '../src/engine/doc';
import { evaluateDoc, shareMeshes } from '../src/engine/evaluate';
import type { DisplayMesh } from '../src/engine/mesh';
import { MeshReceiver, MeshSender } from '../src/engine/meshWire';

const doc: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 3,
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [2, 3] },
      { kind: 'arc', start: [12, 3], center: [12, 8], direction: 'ccw' },
      { kind: 'line', start: [12, 13] },
      { kind: 'line', start: [2, 13] },
    ], holes: [[{ kind: 'arc', start: [9, 7], center: [8, 7], direction: 'cw' }]],
    sideTags: { outer: ['base', 'round', 'roof', 'back'], holes: [['bore']] } },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, mode: 'exact', name: 'Quarter rail',
      path: { degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [[33, -7, 4], [33, 13, 4], [13, 13, 4]], weights: [1, Math.SQRT1_2, 1] } },
    { id: 'n2', kind: 'fillet', parent: { node: 1, side: 'solid' }, radius: 0.2, edges: ['n1.side[bore]#1|n1.start', 'n1.side[bore]#2|n1.start'] },
  ],
  outputs: { b2: { node: 2, side: 'solid' } },
};
const xyz = (p: ArrayLike<number>, i: number) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
const edgeKey = (a: number[], b: number[]) => [a.join(','), b.join(',')].sort().join('|');
function triangleBoundaries(mesh: DisplayMesh) {
  const edges = mesh.faces.map(() => new Map<string, number>());
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = mesh.indices.subarray(i, i + 3), owner = mesh.faceOfVertex[a];
    assert.equal(mesh.faceOfVertex[b], owner);
    assert.equal(mesh.faceOfVertex[c], owner);
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(xyz(mesh.positions, p), xyz(mesh.positions, q)), face = edges[owner];
      face.set(key, (face.get(key) ?? 0) + 1);
    }
  }
  return edges;
}
function faceTriangles(mesh: DisplayMesh, face: number) {
  const points: number[][] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    if (mesh.faceOfVertex[mesh.indices[i]] !== face) continue;
    for (const j of mesh.indices.subarray(i, i + 3)) points.push([...xyz(mesh.positions, j), ...xyz(mesh.normals, j)]);
  }
  return points;
}
function edgeSegments(mesh: DisplayMesh, owner: number) {
  const segments: string[] = [];
  for (let i = 0; i < mesh.edgeLines.length; i += 6) {
    if (mesh.edgeOfSegment[i / 3] !== owner) continue;
    assert.equal(mesh.edgeOfSegment[i / 3 + 1], owner);
    segments.push(edgeKey(xyz(mesh.edgeLines, i / 3), xyz(mesh.edgeLines, i / 3 + 1)));
  }
  return segments;
}

test('the fitted start-rim fillet refines only the exterior and retains both canonical cap joins', () => {
  shareMeshes(true);
  try {
    for (const [revision, radius, volume] of [[1, .2, 4281.51608739629], [2, .25, 4281.48341713383]] as const) {
      const feature = doc.nodes[2];
      assert.equal(feature.kind, 'fillet');
      const input: StudioDoc = { ...doc, nodes: [...doc.nodes.slice(0, 2), { ...feature, radius }] };
      const original = evaluateDoc(input, revision), refined = evaluateDoc(input, revision, 8, true);
      assert.ok(original.ok && refined.ok);
      const base = refined.bodies[0].mesh, detail = base.arcSweepExteriorDetail, native = original.bodies[0].mesh;
      assert.ok(detail);
      assert.equal(base.positions, native.positions);
      assert.equal(base.edges, native.edges);
      assert.equal(base.faces, native.faces);
      assert.ok(Math.abs(refined.bodies[0].volume! - volume) < 1e-7);
      const active = composeArcSweepExterior(base);
      assert.equal(composeArcSweepExterior(base), active);
      assert.equal(active.faces, native.faces);
      assert.equal(active.edges, native.edges);
      const bytes = [detail.positions, detail.normals, detail.faceOfVertex, detail.indices, detail.edgeLines, detail.edgeOfSegment]
        .reduce((n, array) => n + array.byteLength, 0);
      assert.equal(bytes, radius === .2 ? 114_816 : 114_712);
      assert.ok(bytes <= 192 * 1024);

      const replaced = new Set(detail.faceOfVertex);
      const [blend, bore] = ['n2.face', 'n1.side[bore]'].map(name => active.faces.find(face => face.name === name)!.index);
      assert.equal(replaced.size, 6);
      for (const owner of [blend, bore]) {
        assert.ok(!replaced.has(owner));
        assert.deepEqual(faceTriangles(active, owner), faceTriangles(native, owner));
      }

      const originalEdges = triangleBoundaries(native), composedEdges = triangleBoundaries(active);
      const [start, end] = ['n1.start', 'n1.end'].map(name => active.faces.find(face => face.name === name)!.index);
      for (const [cap, side] of [[start, blend], [end, bore]]) {
        const joined = [...originalEdges[cap]].filter(([key, count]) => count === 1 && originalEdges[side].get(key) === 1).map(([key]) => key);
        assert.ok(joined.length >= 32);
        for (const key of joined) {
          assert.equal(composedEdges[cap].get(key), 1);
          assert.equal(composedEdges[side].get(key), 1);
        }
        const displayed = new Set(active.edges.flatMap(edge => edgeSegments(active, edge.index)));
        assert.ok(joined.every(key => displayed.has(key) === (cap === end)));
      }
      const farMouth = native.edges.find(edge => edge.faces.includes(end) && edge.faces.includes(bore))!;
      assert.equal(farMouth.names.length, 2);
      assert.deepEqual(edgeSegments(active, farMouth.index), edgeSegments(native, farMouth.index));
      for (const edge of active.edges) for (const segment of edgeSegments(active, edge.index)) {
        assert.ok(edge.faces.every(face => composedEdges[face].get(segment) === 1));
      }

      const sender = new MeshSender(), reader = new MeshReceiver(), sent = sender.pack('model', refined);
      assert.equal(sent.transfer.length, 12);
      assert.equal(sent.transfer.slice(6).reduce((sum, buffer) => sum + buffer.byteLength, 0), bytes);
      const read = reader.unpack('model', structuredClone(sent.result, { transfer: sent.transfer }));
      assert.ok(read.ok);
      assert.deepEqual(composeArcSweepExterior(read.bodies[0].mesh).positions, active.positions);
      assert.equal(sender.pack('model', refined).transfer.length, 0);
    }
  } finally { shareMeshes(false); }
});
