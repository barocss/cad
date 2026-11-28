import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { brepMassProperties, checkBrep, draftedExtrusion, evaluateCurve, evaluateSurface, tessellateBrep } from '../dist/index.js';
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

function quadrant(center, start, end, direction = 'ccw') {
  return [
    { kind: 'line', start: center },
    { kind: 'arc', start, center, direction },
    { kind: 'line', start: end },
  ];
}

test('an exact acute sector has both radial parabolas, correct signed volume and original endpoints', () => {
  const source = quadrant([0, 0], [10, 0], [6, 8]);
  for (const [draft, volume, centroid] of [
    [10, 252.36192253802574, [5.864593902445914, 2.932296951222957, 3.7603125905175845]],
    [-10, 767.5866568647912, [5.560648596914583, 2.7803242984572916, 5.709491493406435]],
  ]) {
    const brep = make(draft, { profile: source });
    const report = checkBrep(brep, { strict: true, pcurveSamples: 9 });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.ok(report.maximumEdgeSurfaceGap < 1e-10);
    const retained = new Map([['b0', [0, 0, 0]], ['b1', [10, 0, 0]], ['b3', [6, 8, 0]]]);
    for (const vertex of brep.vertices) if (retained.has(vertex.id)) assert.deepEqual(vertex.point, retained.get(vertex.id));
    const k = Math.tan(draft * Math.PI / 180);
    for (const [edge, linear, quadratic] of [
      ['se1', (x, y) => y, x => x],
      ['se3', (x, y) => 0.8 * x - 0.6 * y, (x, y) => 0.6 * x + 0.8 * y],
    ]) {
      const { curve } = brep.edges.find(item => item.id === edge);
      assert.deepEqual([curve.degree, curve.weights], [2, [1, 1, 1]]);
      for (let j = 0; j <= 32; j++) {
        const [x, y, z] = evaluateCurve(curve, j / 32);
        near(linear(x, y), k * z);
        near(quadratic(x, y) ** 2, 100 - 20 * k * z);
      }
    }
    for (const segmentsPerQuarter of [4, 8, 16]) {
      assert.equal(openEdgesByBody(brep, tessellateBrep(brep, { segmentsPerQuarter })), 0);
    }
    const mass = brepMassProperties(brep, 1);
    near(mass.volume, volume, 1e-8);
    for (const [i, value] of centroid.entries()) near(mass.centroid[i], value, 1e-8);
  }
  for (const draft of [20, -40]) assert.throws(() => make(draft, { profile: source }), /closes the acute sector/);
  const almostRadial = quadrant([0, 0], [10, 0], [6, 8 + 2 ** -49]);
  assert.throws(() => make(10, { profile: almostRadial }), /not tangent/);
});

test('an acute sector remains exact when the input frame is translated, rotated or reversed', () => {
  const center = [21, -3], start = [29, 3], end = [21, 7];
  const source = quadrant(center, start, end);
  const reversed = [{ ...source[1], start: end, direction: 'cw' }, { ...source[0], start }, source[0]];
  for (const profile of [source, source.slice(1).concat(source[0]), reversed]) {
    const brep = make(10, { profile, z0: 2, z1: 12 });
    const report = checkBrep(brep, { strict: true });
    assert.ok(report.valid && report.maximumEdgeSurfaceGap < 1e-10, report.issues.join('\n'));
    for (const [x, y] of [center, start, end]) {
      assert.ok(brep.vertices.some(vertex => vertex.point[0] === x && vertex.point[1] === y && vertex.point[2] === 2));
    }
    const mass = brepMassProperties(brep, 1);
    near(mass.volume, 252.36192253802574, 1e-8);
    near(mass.centroid[0], 21 + 0.8 * 5.864593902445914 - 0.6 * 2.932296951222957, 1e-8);
    near(mass.centroid[1], -3 + 0.6 * 5.864593902445914 + 0.8 * 2.932296951222957, 1e-8);
    near(mass.centroid[2], 2 + 3.7603125905175845, 1e-8);
  }
});

test('both signs on an exact obtuse sector keep the radial supports and wider rational cone charts', () => {
  const source = quadrant([0, 0], [10, 0], [-6, 8]);
  for (const [draft, volume, centroid] of [
    [10, 773.5198964485744, [2.417811750791495, 4.83562350158299, 4.322380418026143]],
    [-10, 1515.677845967478, [2.394522516890421, 4.789045033780842, 5.46943742025017]],
    [-45, 4368.499298670564, [2.3056378222904006, 4.611275644580801, 6.460613919704703]],
  ]) {
    const brep = make(draft, { profile: source }), slope = Math.tan(draft * Math.PI / 180);
    const report = checkBrep(brep, { strict: true, pcurveSamples: 13 });
    assert.ok(report.valid && report.maximumEdgeSurfaceGap < 1e-10, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 0);
    assert.deepEqual(brep.vertices.find(vertex => vertex.id === 'b3').point, [-6, 8, 0]);
    const cone = brep.faces.filter(face => face.name.includes('side1#'));
    assert.equal(cone.length, 2);
    for (const { surface } of cone) {
      assert.equal(surface.controlPoints.length, draft === -45 ? 5 : 3);
      assert.ok(surface.weights.every(row => row.every(weight => weight > 0)));
      for (const u of [0.15, 0.4, 0.5, 0.6, 0.85]) {
        for (const v of [0.1, 0.5, 0.9]) {
          const [x, y, z] = evaluateSurface(surface, u, v);
          near(Math.hypot(x, y), 10 - slope * z);
        }
      }
    }
    for (const [key, distance] of [['se1', (x, y) => y], ['se3', (x, y) => 0.8 * x + 0.6 * y]]) {
      const { curve } = brep.edges.find(edge => edge.id === key);
      assert.deepEqual([curve.degree, curve.weights], [2, [1, 1, 1]]);
      for (let j = 0; j <= 24; j++) {
        const [x, y, z] = evaluateCurve(curve, j / 24);
        near(distance(x, y), slope * z);
        near(Math.hypot(x, y), 10 - slope * z);
      }
    }
    for (const segmentsPerQuarter of [4, 8, 16]) {
      assert.equal(openEdgesByBody(brep, tessellateBrep(brep, { segmentsPerQuarter })), 0);
    }
    const mass = brepMassProperties(brep, 1);
    near(mass.volume, volume, 1e-10 * volume);
    for (const [i, value] of centroid.entries()) near(mass.centroid[i], value, 1e-8);
  }
  for (const draft of [30, -84]) assert.throws(() => make(draft, { profile: source }), /closes the obtuse sector/);
  assert.throws(() => make(10, { profile: quadrant([0, 0], [10, 0], [-6, 8 + 2 ** -49]) }), /not tangent/);
});

test('both signed Drafts on a noncardinal quarter disk match rotated native supports and mass', () => {
  const center = [21, -3], start = [29, 3], end = [15, 5];
  const selected = quadrant(center, start, end), axis = ([x, y, z]) => {
    const u = x - center[0], v = y - center[1];
    return [(4 * u + 3 * v) / 5, (-3 * u + 4 * v) / 5, z - 2];
  };
  const reversed = [{ ...selected[1], start: end, direction: 'cw' }, { ...selected[0], start }, selected[0]];
  const tags = ['first', 'arc', 'last'];
  for (const draft of [10, -10]) {
    for (const [segments, sideTags] of [
      [selected, tags], [selected.slice(1).concat(selected[0]), ['arc', 'last', 'first']], [reversed, ['arc', 'first', 'last']],
    ]) {
      const brep = make(draft, { profile: segments, sideTags, z0: 2, z1: 12 });
      const report = checkBrep(brep, { strict: true });
      assert.ok(report.valid, report.issues.join('\n'));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
      const slope = Math.tan(draft * Math.PI / 180);
      const [volume, moment, axialMoment] = sectionIntegral(slope, 4096);
      const mass = brepMassProperties(brep, 1);
      near(mass.volume, volume, 1e-7);
      axis(mass.centroid).forEach((value, i) => near(value, [moment / volume, moment / volume, axialMoment / volume][i], 1e-7));
      for (const [name, fixed] of [['e.side[arc]#1|e.side[first]', 1], ['e.side[arc]#2|e.side[last]', 0]]) {
        const { curve } = brep.edges.find(edge => edge.name === name);
        for (let i = 0; i <= 24; i++) {
          const point = axis(evaluateCurve(curve, i / 24)), d = slope * point[2];
          near(point[fixed], d);
          near(point[1 - fixed] ** 2, 100 - 20 * d);
        }
      }
      for (const density of [4, 8, 16])
        assert.equal(openEdgesByBody(brep, tessellateBrep(brep, { segmentsPerQuarter: density })), 0);
    }
  }
});

test('restoring the original ends keeps the exact coordinates lost by the rotated frame round trip', () => {
  const source = quadrant([0, 0], [1, 12], [-12, 1]);
  const radius = Math.hypot(1, 12);
  assert.notEqual(1 / radius * radius, 1);
  for (const draft of [10, -10]) {
    const brep = make(draft, { profile: source });
    const original = new Map(source.map(({ start }, i) => ['b' + [0, 1, 3][i], [...start, 0]]));
    for (const { id, point } of brep.vertices) if (original.has(id)) assert.deepEqual(point, original.get(id));
    for (const edge of brep.edges) for (const [end, vertex] of edge.vertices.entries()) {
      if (!original.has(vertex)) continue;
      assert.deepEqual(edge.curve.controlPoints.at(end ? -1 : 0), original.get(vertex));
    }
  }
});

test('rotated quarter admission refuses a one-ULP mismatch, major arcs and both collapse directions', () => {
  const center = [0, 0], start = [8, 6], end = [-6, 8];
  const nearRight = [-6 + 4 * Number.EPSILON, 8];
  assert.equal(Math.hypot(...nearRight), Math.hypot(...start));
  for (const profile of [quadrant(center, start, nearRight), quadrant(center, start, end, 'cw')])
    assert.throws(() => make(10, { profile }), /not tangent/);
  for (const draft of [30, -70])
    assert.throws(() => make(draft, { profile: quadrant(center, start, end) }), /closes the quarter-disk/);
});

test('the cardinal quarter and established oblique chord retain their exact native geometry', () => {
  const chord = [
    { kind: 'arc', start: [0, -50], center: [0, 0], direction: 'ccw' },
    { kind: 'line', start: [48, 14] },
  ];
  const nativeHash = brep => createHash('sha256').update(JSON.stringify(brep)).digest('hex');
  const expected = [
    [10, '87d945fbac0de808b35d31194eb97e09ef1fcd4ce10bd3da864b9d32d5c27eee', 'f9d72a3fcf9f77c7f99acc279f36ba68b14a0a74f41a3c32349a9cfe7e1115a0'],
    [-10, '769b99eda39190e96a910c5ba9bdf14245a5649d0ed6a369580bea6d9e39046d', 'a0705afeb197cb7570a8fc4488d86b6ec077068f78cdee328bb461c129ac0966'],
  ];
  for (const [draft, quarterHash, chordHash] of expected) {
    assert.equal(nativeHash(make(draft)), quarterHash);
    assert.equal(nativeHash(make(draft, { profile: chord, z1: 50 })), chordHash);
  }
});
