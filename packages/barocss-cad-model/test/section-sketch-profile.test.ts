import assert from 'node:assert/strict';
import test from 'node:test';
import { completeFaceBoundary, faceBoundary, faceProfile } from '../src/app/faceProfile';
import { nativeSectionCaps, sectionSketchProfile, type SectionOutlineMode } from '../src/app/sectionSketchProfile';
import { emptyDoc, rectanglePart, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, evaluatePreview, partBreps, type BodyResult } from '../src/engine/evaluate';
import { cutAfter, nextSerial } from '../src/engine/ids';
import type { DisplayFace, DisplayMesh, Vec3 } from '../src/engine/mesh';
import { MeshReceiver, MeshSender } from '../src/engine/meshWire';
import { profileOf } from '../src/sketch/loops';
import { slotSegments } from '../src/sketch/profile';
import { sketchShapes } from '../src/sketch/reopen';

const modes: SectionOutlineMode[] = ['all', 'outer', 'inner'];
const unreadable = { ok: false, reason: 'unreadable' };
const centres = [[10, 9], [28, 20]] as const;
const radii = [3, 2];

function stock(count: number): StudioDoc {
  let doc = rectanglePart(40, 30, 10);
  for (let i = 0; i < count; i++) {
    doc = withNode(doc, { kind: 'hole', parent: { node: doc.nodes.length - 1, side: 'solid' },
      axis: 'z', center: [...centres[i]], radius: radii[i] });
  }
  return doc;
}

function exactCut(doc: StudioDoc) {
  const from = nextSerial(doc);
  const split = withNode(doc, { kind: 'split', parent: { node: doc.nodes.length - 1, side: 'solid' }, axis: 'z', at: 5 });
  const exact = evaluatePreview(split, 2, 8, 'section');
  assert.ok(exact.ok, exact.ok ? '' : exact.error.title);
  const body = exact.bodies.find(piece => piece.ref?.side === 'positive');
  assert.ok(body);
  const face = body.mesh.faces.find(face => face.kind === 'plane' && cutAfter(face.name, from));
  assert.ok(face);
  assert.equal(body.sectionCaps?.length, 1);
  assert.equal(body.sectionCaps?.[0].faceId, face.id);
  assert.equal(body.sectionCaps?.[0].status, 'known');
  return { body, exact, face, from, split };
}

function copied(body: BodyResult, face: DisplayFace, mode: SectionOutlineMode) {
  const copy = sectionSketchProfile(body, face, mode);
  assert.ok(copy.ok, copy.ok ? '' : copy.reason);
  return copy.profile;
}

test('section keeps its native cap evidence through mesh delivery and reuse', () => {
  const source = stock(1);
  const { exact, split, body } = exactCut(source);
  const sender = new MeshSender(), receiver = new MeshReceiver();
  for (let index = 0; index < 2; index++) {
    const packet = sender.pack('section', exact).result;
    assert.ok(packet.ok);
    assert.equal('meshRef' in packet.bodies[0], index === 1);
    const received = receiver.unpack('section', structuredClone(packet));
    assert.ok(received.ok);
    const shown = received.bodies.find(piece => piece.key === body.key);
    assert.ok(shown);
    assert.deepEqual(shown.sectionCaps, body.sectionCaps);
    const face = shown.mesh.faces.find(face => face.id === body.sectionCaps?.[0].faceId);
    assert.ok(face);
    assert.equal(copied(shown, face, 'all').holes?.length, 1);
  }
  const preview = evaluatePreview(split, 3, 8, 'preview');
  assert.ok(preview.ok);
  assert.ok(preview.bodies.every(body => !body.sectionCaps));
});

test('section sketch returns all, outer, or independent inner contours', () => {
  for (let count = 0; count <= 2; count++) {
    const { body, face } = exactCut(stock(count));
    const all = copied(body, face, 'all');
    assert.deepEqual(all, faceProfile(body.mesh, face.index));
    assert.equal(all.holes?.length ?? 0, count);
    const outer = copied(body, face, 'outer');
    assert.deepEqual(outer.segments, all.segments);
    assert.equal(outer.holes, undefined);
    if (!count) {
      assert.deepEqual(sectionSketchProfile(body, face, 'inner'), { ok: false, reason: 'no-inner' });
      continue;
    }
    const inner = copied(body, face, 'inner');
    const { shape, done } = sketchShapes(inner);
    assert.ok(shape && shape.kind === 'circle');
    assert.equal(done.length, count - 1);
    const finished = profileOf([shape, ...done]);
    assert.ok('node' in finished);
    assert.equal(finished.node.holes, undefined);
    assert.equal(finished.node.regions?.length ?? 0, count - 1);
    if (count === 1) {
      const model = withNode(withNode(emptyDoc(), { ...finished.node, plane: inner.plane }), { kind: 'extrude', sketch: 0, height: 2 });
      const evaluated = evaluateDoc(model, 3);
      assert.ok(evaluated.ok);
      assert.equal(evaluated.bodies.length, 1);
      assert.ok(Math.abs((evaluated.bodies[0].volume ?? NaN) - 18 * Math.PI) < 1e-7);
    }
  }
});

test('a mixed native line and circular-arc inner loop is usable by the sketcher', () => {
  let doc = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30],
    holes: [slotSegments([10, 15], [30, 15], 4)] });
  doc = withNode(doc, { kind: 'extrude', sketch: 0, height: 10 });
  const { body, face } = exactCut(doc);
  const inner = copied(body, face, 'inner');
  assert.deepEqual(inner.segments.map(segment => segment.kind).sort(), ['arc', 'arc', 'line', 'line']);
  const { shape } = sketchShapes(inner);
  assert.ok(shape?.kind === 'polygon' && shape.closed);
  const finished = profileOf([shape]);
  assert.ok('node' in finished);
  const model = withNode(withNode(emptyDoc(), { ...finished.node, plane: inner.plane }), { kind: 'extrude', sketch: 0, height: 2 });
  const evaluated = evaluateDoc(model, 3);
  assert.ok(evaluated.ok);
  assert.ok(Math.abs((evaluated.bodies[0].volume ?? NaN) - 2 * (20 * 8 + 16 * Math.PI)) < 1e-7);
});

function holeRim(mesh: DisplayMesh, face: DisplayFace): Vec3[] {
  const ring = faceBoundary(mesh, face.index).find(ring =>
    ring.every(([x, y]) => Math.abs(Math.hypot(x - 10, y - 9) - 3) < 1e-7));
  assert.ok(ring && ring.length >= 6);
  return ring;
}

const key = (point: readonly number[]) => point.map(value => Math.round(value * 1e5)).join(',');

test('a missing, shifted, incomplete, or off-plane displayed hole cannot produce even an outer copy', () => {
  const { body, face } = exactCut(stock(1));
  const rim = holeRim(body.mesh, face);
  const rimKeys = new Set(rim.map(key));
  const indicesByPoint = new Map<string, number>();
  const vertices = new Set<number>();
  for (const index of body.mesh.indices) {
    if (body.mesh.faceOfVertex[index] !== face.index) continue;
    const point = key([...body.mesh.positions.subarray(index * 3, index * 3 + 3)]);
    if (rimKeys.has(point)) {
      vertices.add(index);
      indicesByPoint.set(point, index);
    }
  }
  const cycle = rim.map(point => indicesByPoint.get(key(point))!).reverse();
  const filled = new Uint32Array(body.mesh.indices.length + (cycle.length - 2) * 3);
  filled.set(body.mesh.indices);
  for (let i = 1; i + 1 < cycle.length; i++) filled.set([cycle[0], cycle[i], cycle[i + 1]], body.mesh.indices.length + (i - 1) * 3);
  const noHole = { ...body, mesh: { ...body.mesh, indices: filled } };
  assert.equal(completeFaceBoundary(noHole.mesh, face.index)?.length, 1);
  assert.equal(faceProfile(noHole.mesh, face.index)?.holes, undefined);

  const shifted = body.mesh.positions.slice();
  const offPlane = body.mesh.positions.slice();
  for (const index of vertices) {
    shifted[index * 3] += 0.5;
    offPlane[index * 3 + 2] += 0.01;
  }
  assert.equal(faceBoundary({ ...body.mesh, positions: shifted }, face.index).length, 2);

  const broken = body.mesh.indices.slice();
  const triangle = broken.findIndex((index, offset) => offset % 3 === 0 && body.mesh.faceOfVertex[index] === face.index);
  assert.ok(triangle >= 0);
  [broken[triangle + 1], broken[triangle + 2]] = [broken[triangle + 2], broken[triangle + 1]];

  const facet = { ...face, facet: true as const };
  const faces = body.mesh.faces.map(candidate => candidate === face ? facet : candidate);
  for (const mode of modes) {
    assert.deepEqual(sectionSketchProfile(noHole, face, mode), unreadable);
    assert.deepEqual(sectionSketchProfile({ ...body, mesh: { ...body.mesh, positions: shifted } }, face, mode), unreadable);
    assert.deepEqual(sectionSketchProfile({ ...body, mesh: { ...body.mesh, positions: offPlane } }, face, mode), unreadable);
    assert.deepEqual(sectionSketchProfile({ ...body, mesh: { ...body.mesh, indices: broken } }, face, mode), unreadable);
    assert.deepEqual(sectionSketchProfile({ ...body, mesh: { ...body.mesh, faces } }, facet, mode), unreadable);
    assert.deepEqual(sectionSketchProfile({ ...body, sectionCaps: [] }, face, mode), unreadable);
  }
});

test('native cap connectivity failure remains distinct from unsupported native geometry', () => {
  const { body, face, from, split } = exactCut(stock(1));
  const kept = partBreps(split).find(output => output.key === body.key);
  assert.ok(kept);
  const brep = kept.brep;
  const cap = brep.faces.find(native => native.id === face.id);
  assert.ok(cap && cap.loops.length === 2);
  const incomplete = { ...brep, loops: brep.loops.filter(loop => loop.id !== cap.loops[1]) };
  const evidence = nativeSectionCaps(incomplete, body.mesh, from);
  assert.equal(evidence[0].status, 'unreadable');
  for (const mode of modes) assert.deepEqual(sectionSketchProfile({ ...body, sectionCaps: evidence }, face, mode), unreadable);
});

test('a valid straight outline with more than 64 sides can be copied', () => {
  const points: [number, number][] = [[0, 0], [72, 0]];
  for (let x = 72; x >= 0; x--) points.push([x, 10 + x % 2]);
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon', points });
  const doc = withNode(sketch, { kind: 'extrude', sketch: 0, height: 10 });
  const { body, face } = exactCut(doc);
  const outline = copied(body, face, 'outer');
  assert.equal(outline.segments.length, points.length);
  assert.ok(outline.segments.every(segment => segment.kind === 'line'));
});
