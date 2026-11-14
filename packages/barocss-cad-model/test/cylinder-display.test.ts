import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudioDoc } from '../src/engine/doc';
import { evaluateDoc, shareMeshes } from '../src/engine/evaluate';
import { MeshReceiver, MeshSender } from '../src/engine/meshWire';

const doc: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nextId: 2,
  nodes: [{ id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 10 },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 5 }],
  outputs: { b1: { node: 1, side: 'solid' } },
};

test('cylinder refinements preserve canonical owners and transfer once per retained mesh', () => {
  shareMeshes(true);
  try {
    const canonical = evaluateDoc(doc, 1);
    const qualified = evaluateDoc(doc, 2, 8, true);
    assert.ok(canonical.ok && qualified.ok);
    const base = canonical.bodies[0].mesh;
    const detailMesh = qualified.bodies[0].mesh;
    assert.equal(base.cylinderDetail, undefined);
    assert.equal(detailMesh.faces, base.faces);
    assert.equal(detailMesh.edges, base.edges);
    assert.equal(detailMesh.positions, base.positions);
    assert.equal(qualified.bodies[0].volume, canonical.bodies[0].volume);
    assert.equal(detailMesh.cylinderDetail?.tiers.length, 2);
    const [middle, fine] = detailMesh.cylinderDetail.tiers;
    assert.ok(middle.chordErrorMM < detailMesh.cylinderDetail.baseChordErrorMM && fine.chordErrorMM < middle.chordErrorMM);
    const sender = new MeshSender(), receiver = new MeshReceiver();
    const packet = sender.pack('scene', qualified);
    assert.equal(packet.transfer.length, 18);
    const wire = structuredClone(packet.result, { transfer: packet.transfer });
    const restored = receiver.unpack('scene', wire);
    assert.ok(restored.ok);
    assert.deepEqual(restored.bodies[0].mesh, detailMesh);
    assert.ok(fine.positions.byteLength > 0);
    const again = evaluateDoc(doc, 3, 8, true);
    assert.ok(again.ok);
    const reused = sender.pack('scene', again);
    assert.equal(reused.transfer.length, 0);
    const retained = receiver.unpack('scene', reused.result);
    assert.ok(retained.ok);
    assert.equal(retained.bodies[0].mesh, restored.bodies[0].mesh);
  } finally {
    shareMeshes(false);
  }
});

test('straight Sweep refinement keeps one tilted cylinder, its native references and packet budget', () => {
  const sweep: StudioDoc = { ...doc, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'circle', center: [7, 8], radius: 3 },
    { id: 'n1', kind: 'sweep-curve', sketch: 0, name: 'Straight line', mode: 'exact-straight',
      path: { degree: 1, knots: [0,0,1,1], controlPoints: [[20,20,0], [44,38,0]], weights: [1,1] } },
  ] };
  const canonical = evaluateDoc(sweep, 1), refined = evaluateDoc(sweep, 2, 8, true);
  assert.ok(canonical.ok && refined.ok);
  const [base] = canonical.bodies, [body] = refined.bodies;
  const detail = body.mesh.cylinderDetail;
  assert.ok(detail?.sweep);
  const centres = [...detail.sweep.centres].sort((a, b) => a[0] - b[0]);
  assert.ok(centres.every((point, index) => point.every((value, axis) => Math.abs(value - [[20,20,0], [44,38,0]][index][axis]) < 1e-7)));
  assert.deepEqual(body.mesh.faces, base.mesh.faces);
  assert.deepEqual(body.mesh.edges, base.mesh.edges);
  assert.deepEqual(body.mesh.positions, base.mesh.positions);
  assert.equal(body.volume, base.volume);
  const bytes = detail.tiers.reduce((total, tier) => total + tier.positions.byteLength + tier.normals.byteLength + tier.faceOfVertex.byteLength
    + tier.indices.byteLength + tier.edgeLines.byteLength + tier.edgeOfSegment.byteLength, 0);
  assert.ok(bytes <= 192 * 1024);
  assert.equal(detail.tiers.length, 2);
  for (const [index, packet] of detail.tiers.entries()) {
    const angle = Math.PI / (4 * (16 << index));
    assert.ok(Math.abs(packet.chordErrorMM - 6 * Math.sin(angle / 2) ** 2) < 1e-10);
    for (let j = 0; j < packet.edgeLines.length; j += 3) {
      const edge = body.mesh.edges[packet.edgeOfSegment[j / 3]];
      const xyz = [...packet.edgeLines.subarray(j, j + 3)];
      for (const face of edge.faces) {
        assert.ok(packet.faceOfVertex.some((owner, vertex) => owner === face
          && xyz.every((value, axis) => value === packet.positions[3 * vertex + axis])));
      }
    }
  }
});
