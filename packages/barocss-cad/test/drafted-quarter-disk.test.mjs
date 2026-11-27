import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, draftedExtrusion, evaluateCurve, tessellateBrep } from '../dist/index.js';
import { openEdgesByBody } from '../scripts/rb/stages.mjs';

const profile = [
  { kind: 'line', start: [0, 0] },
  { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' },
  { kind: 'line', start: [0, 10] },
];
const make = (draft, extra = {}) => draftedExtrusion({ profile, z0: 0, z1: 10, draft, tag: 'e', ...extra });
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

// Independent Green integrals of the section bounded by x=d, y=d and the circular arc.
function sectionIntegral(slope, steps) {
  const results = [0, 0, 0];
  for (let j = 0; j <= steps; j++) {
    const z = 10 * j / steps, d = z * slope, r = 10 - d, q = Math.sqrt(r * r - d * d);
    const area = r * r * (Math.PI / 4 - Math.atan2(d, q)) + d * (d - q);
    const moment = q ** 3 / 3 - d * q * q / 2 + d ** 3 / 6;
    const weight = j === 0 || j === steps ? 1 : j % 2 ? 4 : 2;
    results[0] += weight * area;
    results[1] += weight * moment;
    results[2] += weight * z * area;
  }
  return results.map(value => value * 10 / (3 * steps));
}

for (const draft of [10, -10]) {
  test(`a cardinal quadrant has exact signed Draft supports and a watertight boundary at ${draft} degrees`, () => {
    const brep = make(draft), slope = Math.tan(draft * Math.PI / 180);
    const report = checkBrep(brep, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 0);
    for (const segmentsPerQuarter of [4, 8, 16]) {
      const mesh = tessellateBrep(brep, { segmentsPerQuarter });
      assert.equal(openEdgesByBody(brep, mesh), 0);
    }
    for (const [name, fixedAxis] of [['e.side0|e.side1#1', 1], ['e.side1#2|e.side2', 0]]) {
      const { curve } = brep.edges.find(edge => edge.name === name);
      assert.deepEqual([curve.degree, curve.weights], [2, [1, 1, 1]]);
      for (let k = 0; k <= 24; k++) {
        const point = evaluateCurve(curve, k / 24), d = slope * point[2];
        near(point[fixedAxis], d);
        near(point[1 - fixedAxis] ** 2, 100 - 20 * d);
      }
    }
    const { curve: corner } = brep.edges.find(edge => edge.name === 'e.side0|e.side2');
    assert.equal(corner.degree, 1);
    const middle = evaluateCurve(corner, 0.5);
    near(middle[0], 5 * slope);
    near(middle[1], 5 * slope);
    const [v, m, z] = sectionIntegral(slope, 8192), coarse = sectionIntegral(slope, 4096);
    [v, m, z].forEach((value, axis) => near(value, coarse[axis], 1e-7));
    const mass = brepMassProperties(brep, 1);
    assert.equal(mass.method, 'quadrature');
    near(mass.volume, v, 1e-7);
    mass.centroid.forEach((value, axis) => near(value, [m / v, m / v, z / v][axis], 1e-7));
  });
}

test('cardinal rotation and reversed/cyclic source order retain the authored quadrant walls', () => {
  const map = ([x, y]) => [y + 4, -x - 3];
  const rotated = profile.map(segment => ({
    ...segment, start: map(segment.start), ...(segment.kind === 'arc' ? { center: map(segment.center) } : {}),
  }));
  const reversed = rotated.map((segment, j) => ({
    ...segment, start: rotated[(j + 1) % rotated.length].start, ...(segment.kind === 'arc' ? { direction: 'cw' } : {}),
  })).reverse();
  const tags = ['first', 'arc', 'last'];
  for (const [segments, sideTags] of [
    [rotated.slice(1).concat(rotated[0]), tags.slice(1).concat(tags[0])], [reversed, [...tags].reverse()],
  ]) {
    const brep = make(-10, { profile: segments, z0: 2, z1: 12, sideTags });
    assert.ok(checkBrep(brep, { strict: true }).valid);
    assert.deepEqual(brep.faces.map(face => face.name).sort(), [
      'e.bottom', 'e.side[arc]#1', 'e.side[arc]#2', 'e.side[first]', 'e.side[last]', 'e.top',
    ]);
    for (const [x, y] of rotated.map(segment => segment.start))
      assert.ok(brep.vertices.some(vertex => vertex.point[0] === x && vertex.point[1] === y && vertex.point[2] === 2));
    assert.equal(openEdgesByBody(brep, tessellateBrep(brep)), 0);
  }
});

test('quarter disk Draft refuses either collapse and keeps off-circle geometry on the existing path', () => {
  for (const angle of [30, -70]) assert.throws(() => make(angle), /closes the quarter-disk/);
  assert.throws(() => make(-Number.EPSILON), /too small/);
  const offCircle = [...profile.slice(0, 2), { kind: 'line', start: [0, 10 + 1e-10] }];
  assert.throws(() => make(10, { profile: offCircle }), /not tangent/);
});
