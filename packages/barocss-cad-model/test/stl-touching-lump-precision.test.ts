import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePart } from '../src/engine/evaluate';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { lumpMesh, lumpTriangles } from '../src/engine/lumps';
import { lumpStls, meshToStl } from '../src/engine/stl';

type XY = [number, number];
function box(doc: StudioDoc, min: XY, max: XY, from: number, height: number) {
  const sketch = doc.nodes.length;
  return withNode(withNode(doc, { kind: 'sketch', profile: 'rectangle', min, max }),
    { kind: 'extrude', sketch, from, height });
}

function touching(secondHeight: number) {
  const first = box(emptyDoc(), [0, 0], [2, 2], 9998, 1);
  const both = box(first, [2, 0], [4, 2], 9999, secondHeight);
  return withNode(both, { kind: 'union', left: { node: 1, side: 'solid' }, right: { node: 3, side: 'solid' } });
}

test('touching native lumps return no partial STL batch when the later piece collapses in Float32', () => {
  const doc = touching(1 / 4096);
  const saved = structuredClone(doc), evaluated = evaluatePart(doc, 1);
  assert.ok(evaluated.ok);
  assert.equal(evaluated.bodies.length, 1);
  const [body] = evaluated.bodies;
  assert.equal(body.pieces, 2);
  assert.deepEqual(body.lumpTouch, [[0, 1]]);
  const before = structuredClone(body.mesh), groups = lumpTriangles(body.mesh);
  assert.deepEqual(groups?.map(group => group.length), [12, 12]);
  assert.ok(groups);
  const ordinary = lumpMesh(body.mesh, groups[0]), thin = lumpMesh(body.mesh, groups[1]);

  // Independent binary readback of the initial box, not an assumption based on mesh size.
  const bytes = meshToStl(ordinary, body.key);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(80, true), 12);
  assert.equal(bytes.byteLength, 684);
  const expectedCorners = [0, 2].flatMap(x => [0, 2].flatMap(y => [9998, 9999].map(z => [x, y, z].join(','))));
  const corners = new Set<string>();
  for (let t = 0; t < 12; t++) {
    const points = [0, 1, 2].map(j => [0, 1, 2].map(k => view.getFloat32(84 + 50 * t + 12 + 12 * j + 4 * k, true)));
    for (const p of points) corners.add(p.join(','));
    const [a, b, c] = points, u = b.map((v,k) => v - a[k]), v = c.map((w,k) => w - a[k]);
    assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]) > 0);
  }
  assert.deepEqual([...corners].sort(), expectedCorners.sort());

  // The thin source has two distinct z planes, but binary32 cannot represent them both.
  const planes = [...new Set(Array.from(thin.indices, i => thin.positions[3 * i + 2]))].sort((a, b) => a - b);
  assert.deepEqual(planes, [9999, 9999 + 1 / 4096]);
  assert.deepEqual(planes.map(Math.fround), [9999, 9999]);
  assert.throws(() => meshToStl(thin, body.key), { code: 'STL_FLOAT32_COLLAPSE' });
  assert.throws(() => lumpStls(body.mesh, body.key), { code: 'STL_FLOAT32_COLLAPSE' });

  // Same touch and first piece, but exact binary32 height for the second: the split path returns both.
  const control = evaluatePart(touching(1), 2);
  assert.ok(control.ok);
  assert.deepEqual(control.bodies[0].lumpTouch, [[0, 1]]);
  const split = lumpStls(control.bodies[0].mesh, control.bodies[0].key);
  assert.deepEqual(split?.map(file => [file.lump, file.bytes.length]), [[0, 684], [1, 684]]);
  assert.deepEqual(split?.[0].bytes.subarray(80), bytes.subarray(80)); // The header names differ by branch.
  assert.deepEqual(body.mesh, before);
  assert.deepEqual(doc, saved);
});
