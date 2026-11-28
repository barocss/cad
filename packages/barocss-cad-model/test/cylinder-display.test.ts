import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps, shareMeshes } from '../src/engine/evaluate';
import { MeshReceiver, MeshSender } from '../src/engine/meshWire';
import { cylinderDisplayMesh } from '../src/engine/cylinderDisplay';
import { offsetFaceCommand } from '../src/app/profileCommands';
import type { CylinderDisplayTier, DisplayMesh } from '../src/engine/mesh';

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

function tube(bore: [number, number] = [14, 9]): StudioDoc {
  const stock = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'circle', center: [14, 9], radius: 9 }),
    { kind: 'extrude', sketch: 0, height: 16 });
  return withNode(stock, { kind: 'hole', parent: { node: 1, side: 'solid' }, center: bore, radius: 4 });
}

function radialOffset(source: StudioDoc, distance: number): StudioDoc {
  const result = evaluateDoc(source, 1);
  assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.findIndex(face => face.nativeBoreDiameter !== undefined);
  assert.ok(face >= 0);
  const ctx = { doc: source, bodies: result.bodies, selection: { faces: [{ body: 0, face }], edges: [], bodies: [] } };
  return offsetFaceCommand.build!(ctx, { d: distance });
}

function sharedTubeBoundaries(mesh: DisplayMesh, packet: CylinderDisplayTier, quality: number): void {
  const owned = new Map<number, Set<string>>();
  for (let vertex = 0; vertex < packet.faceOfVertex.length; vertex++) {
    const owner = packet.faceOfVertex[vertex], key = Array.from(packet.positions.subarray(3 * vertex, 3 * vertex + 3)).join(',');
    if (!owned.has(owner)) owned.set(owner, new Set());
    owned.get(owner)!.add(key);
  }
  const counts = new Map<number, number>(), pairs = new Set<string>();
  for (let point = 0; point < packet.edgeLines.length; point += 3) {
    const edgeIndex = packet.edgeOfSegment[point / 3], edge = mesh.edges[edgeIndex];
    const xyz = Array.from(packet.edgeLines.subarray(point, point + 3)), key = xyz.join(',');
    assert.ok(edge.nativeCircle);
    counts.set(edgeIndex, (counts.get(edgeIndex) ?? 0) + 1);
    pairs.add([...edge.faces].sort().join(':'));
    for (const face of edge.faces) assert.ok(owned.get(face)?.has(key), `rim ${edgeIndex} has the exact same native sample on face ${face}`);
    assert.ok(Math.abs(Math.hypot(xyz[0] - 14, xyz[1] - 9) - edge.nativeCircle.radius) < 1e-10);
    assert.ok(xyz[2] === 0 || xyz[2] === 16);
  }
  assert.equal(pairs.size, 4);
  assert.equal(counts.size, 4);
  assert.ok([...counts.values()].every(count => count === 8 * quality));
}

test('coaxial tube and one signed inner-wall Offset get two bounded Top Ortho packets with canonical owners', () => {
  shareMeshes(true);
  try {
    const source = tube(), before = structuredClone(source);
    const cases = [{ doc: source, radius: 4 }, { doc: radialOffset(source, 1), radius: 3 }, { doc: radialOffset(source, -2), radius: 6 }];
    for (const fixture of cases) {
      const canonical = evaluateDoc(fixture.doc, 2), qualified = evaluateDoc(fixture.doc, 3, 8, true);
      assert.ok(canonical.ok && qualified.ok);
      const base = canonical.bodies[0].mesh, mesh = qualified.bodies[0].mesh, detail = mesh.cylinderDetail;
      assert.equal(base.cylinderDetail, undefined);
      assert.ok(detail);
      assert.equal(detail.sweep, undefined, 'tube refinement keeps the existing Top Ortho viewport gate');
      assert.equal(mesh.faces, base.faces); assert.equal(mesh.edges, base.edges); assert.equal(mesh.positions, base.positions);
      assert.equal(mesh.faces.length, 4); assert.equal(mesh.edges.length, 4);
      const volume = qualified.bodies[0].volume;
      assert.equal(volume, canonical.bodies[0].volume);
      assert.ok(volume !== null && Math.abs(volume - Math.PI * (81 - fixture.radius ** 2) * 16) < 1e-7);
      assert.equal(detail.tiers.length, 2);
      let bytes = 0, previousError = detail.baseChordErrorMM;
      for (const [index, packet] of detail.tiers.entries()) {
        const quality = 16 << index;
        assert.ok(packet.chordErrorMM < previousError);
        assert.ok(Math.abs(packet.chordErrorMM - 18 * Math.sin(Math.PI / (8 * quality)) ** 2) < 1e-10);
        sharedTubeBoundaries(mesh, packet, quality);
        bytes += packet.positions.byteLength + packet.normals.byteLength + packet.faceOfVertex.byteLength + packet.indices.byteLength
          + packet.edgeLines.byteLength + packet.edgeOfSegment.byteLength;
        previousError = packet.chordErrorMM;
      }
      assert.ok(bytes <= 192 * 1024);
      const again = evaluateDoc(fixture.doc, 4, 8, true);
      assert.ok(again.ok);
      assert.equal(again.bodies[0].mesh, mesh);
    }
    assert.deepEqual(source, before);
  } finally {
    shareMeshes(false);
  }
});

test('tube display admission excludes eccentric tubes, additional bores and translated recipes', () => {
  const original = tube();
  const extraHole = withNode(original, { kind: 'hole', parent: { node: 2, side: 'solid' }, center: [20, 9], radius: 1 });
  const moved = withNode(original, { kind: 'translate', parent: { node: 2, side: 'solid' }, offset: [0, 0, 0] });
  for (const candidate of [tube([14 + 1e-9, 9]), tube([15, 9]), extraHole, moved]) {
    const result = evaluateDoc(candidate, 2, 8, true);
    assert.ok(result.ok, JSON.stringify(result));
    assert.equal(result.bodies[0].mesh.cylinderDetail, undefined);
  }
  const ordinary = evaluateDoc(original, 3), highQuality = evaluateDoc(original, 4, 16, true);
  assert.ok(ordinary.ok && highQuality.ok);
  assert.equal(ordinary.bodies[0].mesh.cylinderDetail, undefined);
  assert.equal(highQuality.bodies[0].mesh.cylinderDetail, undefined);
});

test('tube packets reject forged circular support or rim ownership without changing the canonical table', () => {
  const source = tube(), result = evaluateDoc(source, 1);
  assert.ok(result.ok);
  const { brep } = partBreps(source)[0], base = result.bodies[0].mesh;
  for (const mutation of ['circle', 'wall', 'owner', 'open']) {
    const altered = structuredClone(base);
    if (mutation === 'circle') altered.edges[0].nativeCircle!.radius += 1e-5;
    if (mutation === 'wall') {
      const wall = altered.faces.find(face => face.exact?.kind === 'cylinder');
      assert.ok(wall?.exact?.kind === 'cylinder');
      wall.exact.r += 1e-5;
    }
    if (mutation === 'owner') altered.edges[0].faces = [...altered.edges[1].faces];
    if (mutation === 'open') altered.edges[0].b = [altered.edges[0].b[0] + 1e-5, altered.edges[0].b[1], altered.edges[0].b[2]];
    assert.equal(cylinderDisplayMesh(altered, brep, 2), altered, mutation);
    assert.equal(altered.cylinderDetail, undefined);
  }
});

test('a native drafted sector refines both circular rims within one packet and keeps canonical ownership', () => {
  const source: StudioDoc = { ...doc, nodes: [
    { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
      { kind: 'line', start: [0, 0] },
      { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' },
      { kind: 'line', start: [6, -8] },
    ] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10, draft: -30 },
  ] };
  const ordinary = evaluateDoc(source, 1), refined = evaluateDoc(source, 2, 8, true);
  assert.ok(ordinary.ok && refined.ok);
  const [model] = ordinary.bodies, [display] = refined.bodies;
  const { cylinderDetail, ...baseMesh } = display.mesh;
  assert.ok(cylinderDetail?.sweep);
  assert.deepEqual(baseMesh, model.mesh);
  assert.equal(display.volume, model.volume);
  assert.equal(cylinderDetail.tiers.length, 1);
  const [detail] = cylinderDetail.tiers;
  const bytes = detail.positions.byteLength + detail.normals.byteLength + detail.faceOfVertex.byteLength
    + detail.indices.byteLength + detail.edgeLines.byteLength + detail.edgeOfSegment.byteLength;
  assert.ok(bytes <= 192 * 1024);
  assert.ok(detail.chordErrorMM < cylinderDetail.baseChordErrorMM / 9);

  const facePoints = new Map<number, Set<string>>();
  for (let at = 0; at < detail.faceOfVertex.length; at++) {
    const face = detail.faceOfVertex[at];
    if (!facePoints.has(face)) facePoints.set(face, new Set());
    facePoints.get(face)!.add(detail.positions.subarray(3 * at, 3 * at + 3).join(','));
  }
  const rims = new Set<number>();
  for (let at = 0; at < detail.edgeLines.length; at += 3) {
    const edge: DisplayMesh['edges'][number] = baseMesh.edges[detail.edgeOfSegment[at / 3]];
    if (!edge.nativeCircle) continue;
    rims.add(edge.index);
    const atRim = detail.edgeLines.subarray(at, at + 3).join(',');
    assert.ok(edge.faces.every(owner => facePoints.get(owner)?.has(atRim)));
  }
  assert.equal(rims.size, 2);
});
