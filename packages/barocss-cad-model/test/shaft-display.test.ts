import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDoc, withNode } from '../src/engine/doc';
import { evaluateDoc, exportStudioStep, partBreps } from '../src/engine/evaluate';

const shaft = (d0: number, d1: number) => withNode(emptyDoc(), {
  kind: 'shaft', center: [0, 0], generator: 'shaft@0',
  steps: [{ diameter: d0, length: 12 }, { diameter: d1, length: 8 }],
});
const read = (step: string) => withNode(emptyDoc(), { kind: 'import', name: 'Anonymous shaft', step });
const anonymous = (doc: ReturnType<typeof emptyDoc>) =>
  exportStudioStep(doc, { name: 'Shaft', timestamp: '2026-11-24T00:00:00' }).text.replace(/'(?:[^']|'')*'/g, "''");

test('refines native and anonymous shafts on each body’s own canonical face and edge tables', () => {
  for (const [d0, d1] of [[20, 12], [12, 20]]) {
    const native = shaft(d0, d1);
    for (const doc of [native, read(anonymous(native))]) {
      const before = partBreps(doc)[0].brep;
      const base = evaluateDoc(doc, 1), detailed = evaluateDoc(doc, 2, 8, true);
      assert.ok(base.ok && detailed.ok);
      const { mesh: ordinary, volume } = base.bodies[0], { mesh, volume: sameVolume } = detailed.bodies[0];
      assert.equal(sameVolume, volume);
      assert.deepEqual(partBreps(doc)[0].brep, before);
      assert.deepEqual(mesh.faces, ordinary.faces);
      assert.deepEqual(mesh.edges, ordinary.edges);
      assert.deepEqual(mesh.positions, ordinary.positions);
      assert.deepEqual(mesh.indices, ordinary.indices);
      assert.deepEqual(mesh.edgeLines, ordinary.edgeLines);
      const detail = mesh.cylinderDetail;
      assert.ok(detail);
      assert.deepEqual(detail.sweep?.centres, [[0, 0, 0], [0, 0, 20]]);
      assert.ok(detail.sweep && detail.sweep.radius >= 10);
      assert.equal(detail.tiers.length, 2);
      assert.ok(detail.tiers[0].chordErrorMM < detail.baseChordErrorMM / 3);
      assert.ok(detail.tiers[1].chordErrorMM < detail.tiers[0].chordErrorMM / 3);
      let bytes = 0;
      for (const tier of detail.tiers) {
        assert.ok(tier.indices.length > ordinary.indices.length);
        assert.equal(new Set(tier.faceOfVertex).size, ordinary.faces.length);
        assert.equal(new Set(tier.edgeOfSegment).size, ordinary.edges.length);
        assert.ok(tier.faceOfVertex.every(index => Number.isInteger(index) && index >= 0 && index < ordinary.faces.length));
        assert.ok(tier.edgeOfSegment.every(index => Number.isInteger(index) && index >= 0 && index < ordinary.edges.length));
        bytes += tier.positions.byteLength + tier.normals.byteLength + tier.faceOfVertex.byteLength
          + tier.indices.byteLength + tier.edgeLines.byteLength + tier.edgeOfSegment.byteLength;
      }
      assert.ok(bytes <= 192 * 1024);
    }
  }
});

test('ordinary Open may display a normalized line carrier, but it cannot get the exact shaft packet', () => {
  const step = anonymous(shaft(20, 12)), corrupted = step
    .replace(/=LINE\('',#\d+,#(\d+)\);/, "=LINE('',#999,#$1);")
    .replace('DATA;', "DATA;\n#999=CARTESIAN_POINT('',(100.,200.,300.));");
  const normal = evaluateDoc(read(step), 1, 8, true), altered = evaluateDoc(read(corrupted), 2, 8, true);
  assert.ok(normal.ok && altered.ok);
  assert.ok(normal.bodies[0].mesh.cylinderDetail);
  assert.equal(altered.bodies[0].mesh.cylinderDetail, undefined);
  assert.deepEqual(altered.bodies[0].mesh.positions, normal.bodies[0].mesh.positions);
});
