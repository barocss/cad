import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, projectBrepHiddenLines, tessellateBrep } from '../dist/index.js';
import { tessellateBrepWithEdgeParameters } from '../dist/brep/brep-tessellate.js';

const part = features => evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features }).outputs[0].brep;
const loft = part([
  ...[6, 10, 5].map((radius, i) => ({ id: 'abc'[i], kind: 'sketch', profile: 'circle', center: [0, 0], radius })),
  { id: 'L', kind: 'loft', smooth: true, sections: [{ sketch: 'a', z: 0 }, { sketch: 'b', z: 6 }, { sketch: 'c', z: 14 }] },
]);
const options = { segmentsPerQuarter: 12 };
const views = [
  { toward: [0, -1, 0], up: [0, 0, 1], sides: ['L.side0~sil0', 'L.side1~sil0'] },
  { toward: [1, 0, 0], up: [0, 0, 1], sides: ['L.side1~sil0', 'L.side2~sil0'] },
];
const hidden = (projection, name) => projection.edges.find(edge => edge.name === name).pieces.some(piece => !piece.visible);

test('native smooth Loft retains each complete original outline in both horizontal views', () => {
  const original = JSON.stringify(loft);
  assert.equal(checkBrep(loft, { strict: true }).valid, true);
  for (const view of views) {
    const projection = projectBrepHiddenLines([loft], view, options);
    for (const name of view.sides) {
      const outline = projection.edges.find(edge => edge.name === name);
      assert.equal(outline.pieces.length, 1);
      const [piece] = outline.pieces;
      assert.equal(piece.visible, true);
      assert.equal(piece.curve.kind, 'polyline');
      assert.equal(piece.curve.points.length, 21);
      const heights = piece.curve.points.map(point => point[1]);
      assert.deepEqual([Math.min(...heights), Math.max(...heights)], [0, 14]);
    }
  }
  assert.equal(JSON.stringify(loft), original);
});

test('native smooth Loft retains an actual foreign cover and its result survives body-order changes', () => {
  for (const [view, ahead, behind] of [
    [views[0], [[8, -16], [12, -12]], [[8, 12], [12, 16]]],
    [views[1], [[12, 8], [16, 12]], [[-16, 8], [-12, 12]]],
  ]) {
    const box = ([min, max]) => part([
      { id: 'box-profile', kind: 'sketch', profile: 'rectangle', min, max },
      { id: 'box', kind: 'extrude', sketch: 'box-profile', from: 4, height: 4 },
    ]);
    const blocker = box(ahead), unrelated = box(behind);
    for (const order of [[loft, blocker], [blocker, loft]]) {
      const projection = projectBrepHiddenLines(order, view, options);
      assert.equal(hidden(projection, view.sides[0]), true);
      assert.equal(hidden(projection, view.sides[1]), false);
    }
    const behindProjection = projectBrepHiddenLines([loft, unrelated], view, options);
    for (const name of view.sides) assert.equal(hidden(behindProjection, name), false);
  }
});

test('edge parameter retention produces the same ordinary mesh and the final station count', () => {
  const { mesh, edgeParameters } = tessellateBrepWithEdgeParameters(loft, options);
  assert.deepEqual(mesh, tessellateBrep(loft, options));
  assert.equal(edgeParameters.size, loft.edges.length);
  for (const edge of loft.edges) {
    const stations = edgeParameters.get(edge);
    assert.equal(stations.length, mesh.edges.find(sampled => sampled.edgeId === edge.id).points.length / 3);
    assert.ok(stations.every((station, i) => i === 0 || station > stations[i - 1]));
  }
});
