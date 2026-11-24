import test from 'node:test';
import assert from 'node:assert/strict';
import { brepMassProperties, checkBrep } from '@barocss/cad';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, partBreps } from '@barocss/cad-model/engine/evaluate';
import { retainedSectionVertexIds } from '../src/viewport/sectionEdgePick';
import { exactBodies, sectionSplits, type SectionPlane } from '../src/viewport/sectionView';
import { bindNativeVertexPick, currentNativeVertexPoints, nativeVertexWitness, pickVertex } from '../src/viewport/vertexPick';

const doc: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {},
  nodes: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: [[12, 0], [60, 0], [60, 30], [35, 30], [35, 10], [0, 10], [0, 9]] },
    { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' } }, nextId: 2,
};
const plane: SectionPlane = { normal: [0.6, 0.8, 0], offset: 33.6, face: 'n1.side6' };
const corner = [35, 30, 10];
const evaluateCut = (p: SectionPlane, expected: number) => {
  const base = evaluateDoc(doc, 1);
  assert.ok(base.ok);
  const split = sectionSplits(doc, base.bodies, { mode: 'plane', planes: [p] });
  const cut = evaluateDoc(split.doc, 2);
  assert.ok(cut.ok);
  const { bodies } = exactBodies(cut.bodies, split.kept, split.from);
  const native = partBreps(split.doc).filter(body => split.kept.includes(body.key));
  assert.equal(native.length, 1);
  assert.ok(checkBrep(native[0].brep, { strict: true }).valid);
  assert.ok(Math.abs(brepMassProperties(native[0].brep, 1).volume - expected) < 1e-7);
  return { original: base.bodies[0], shown: bodies[0], brep: native[0].brep };
};

test('oblique section keeps original native endpoint evidence before the chosen corner becomes a cap point', () => {
  // Clip the XY boundary against 3x + 4y ≥ 168. Its kept polygon is
  // (56,0), (60,0), (60,30), (35,30), (35,15.75), with area 584.625.
  const { original, shown } = evaluateCut(plane, 5846.25);
  const edge = shown.mesh.edges.find(edge => edge.names.includes('n1.side2|n1.side3'));
  assert.ok(edge?.nativeFinishLine);
  assert.equal(edge.nativeVertices, undefined);
  const ids = retainedSectionVertexIds(original.mesh, shown.mesh, plane, 2);
  const originalIds = ids.get(edge.index);
  assert.ok(originalIds?.includes('n1_v7'));
  const source = { mesh: shown.mesh, edge: edge.index, sectionVertices: ids };
  const project = (point: readonly number[]) => point.every((value, k) => value === corner[k]) ? [0, 0] : [16, 0];
  const hit = pickVertex('all', 0, shown.mesh.edges, 0, 0, project, undefined, source);
  assert.ok(hit);
  assert.deepEqual(hit.at, corner);
  assert.deepEqual(nativeVertexWitness(hit, shown.mesh), { id: 'n1_v7', source });
  bindNativeVertexPick(hit, doc);
  const raw = pickVertex('all', 0, shown.mesh.edges, 0, 0, project, undefined, { mesh: shown.mesh, edge: edge.index });
  assert.ok(raw);
  assert.equal(nativeVertexWitness(raw, shown.mesh), null);

  const duplicate = { ...original.mesh, edges: [...original.mesh.edges, original.mesh.edges.find(e => e.names.includes('n1.side2|n1.side3'))!] };
  assert.equal(retainedSectionVertexIds(duplicate, shown.mesh, plane, 2).has(edge.index), false);

  // The final cut is the triangle (35,30), (60,11.25), (60,30), with area 234.375.
  const next = { ...plane, offset: 45 };
  const final = evaluateCut(next, 2343.75);
  const drift = Math.min(...final.brep.vertices.map(vertex => Math.hypot(...vertex.point.map((value, i) => value - corner[i]))));
  assert.ok(drift < 1e-7);
  const after = retainedSectionVertexIds(final.original.mesh, final.shown.mesh, next, 2);
  assert.ok([...after.values()].every(pair => !pair.includes('n1_v7')));

  // A section-certified witness must not qualify three points for the Sketch command.
  const pretendOriginal = { ...original, mesh: shown.mesh };
  const otherPicks = [0, 10].map(z => {
    const isPoint = (point: readonly number[]) => point[0] === 60 && point[1] === 30 && point[2] === z;
    const incident = shown.mesh.edges.find(edge => ids.has(edge.index) && (isPoint(edge.a) || isPoint(edge.b)));
    assert.ok(incident);
    const pick = pickVertex('all', 0, shown.mesh.edges, 0, 0, point => isPoint(point) ? [0, 0] : [16, 0],
      undefined, { mesh: shown.mesh, edge: incident.index, sectionVertices: ids });
    assert.ok(pick && nativeVertexWitness(pick, shown.mesh));
    bindNativeVertexPick(pick, doc);
    return pick;
  });
  assert.equal(currentNativeVertexPoints(doc, [pretendOriginal], [hit, ...otherPicks]), null);
});
