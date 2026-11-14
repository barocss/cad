import test from 'node:test';
import assert from 'node:assert/strict';
import { brepMassProperties, checkBrep, checkOutput, evaluateCadPart, evaluateCurve, evaluateSurface, loftSolid, massPropertiesOf, reevaluate } from '../dist/index.js';

const rect = (x = 0, y = 0, w = 10, d = 6) => [[x, y], [x + w, y], [x + w, y + d], [x, y + d]].map(start => ({ kind: 'line', start }));
const sections = [{ profile: rect(), z: 0 }, { profile: rect(), z: 12 }];
const rail = (x, mx, my = 0) => ({ kind: 'quadratic-bezier', controlPoints: [[x, 0, 0], [mx, my, 6], [x, 0, 12]] });
const guides = [rail(0, 2), rail(10, 14)];
const build = input => loftSolid({ id: 'loft', name: 'loft', sections, guides, ...input });
const close = (got, want, tolerance = 1e-9) => assert.ok(Math.abs(got - want) <= tolerance, `${got} != ${want}`);
const vector = (got, want) => got.forEach((value, i) => close(value, want[i]));

// Independent physical oracle: each horizontal slice is a rectangle. Its width squared is
// (10 + (b − a)q)^2 + ((by − ay)q)^2, q = 2t(1−t), and depth is 0.6 times the width.
// The exact integrals of 1, q, q² and q³ over t = 0..1 are 1, 1/3, 2/15 and 2/35.
function oracle(a, b, ay = 0, by = 0) {
  const linear = (b - a) / 5, quadratic = ((b - a) ** 2 + (by - ay) ** 2) / 100;
  const areaFactor = 1 + linear / 3 + 2 * quadratic / 15;
  const weightedQ = (1 / 3 + 2 * linear / 15 + 2 * quadratic / 35) / areaFactor;
  return { volume: 720 * areaFactor, centroid: [5 + ((a + b) / 2 - 0.3 * (by - ay)) * weightedQ, 3 + ((ay + by) / 2 + 0.3 * (b - a)) * weightedQ, 6] };
}

function verify(result, a, b, ay = 0, by = 0) {
  const { brep } = result, check = checkBrep(brep, { strict: true });
  assert.equal(check.valid, true, check.issues.join('\n'));
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(check.topology[0].genus, 0);
  const expected = oracle(a, b, ay, by);
  for (const mass of [result.mass(1), brepMassProperties(brep, 1)]) {
    assert.notEqual(mass.method, 'tessellated');
    close(mass.volume, expected.volume); vector(mass.centroid, expected.centroid);
  }
  for (const i of [0, 1]) {
    const edge = brep.edges.find(e => e.id === `l0_${i}`);
    assert.deepEqual(edge.curve.controlPoints, i ? rail(10, 10 + b, by).controlPoints : rail(0, a, ay).controlPoints);
    const uses = brep.coedges.filter(c => c.edge === edge.id);
    assert.equal(uses.length, 2);
    assert.deepEqual(uses.map(c => c.twin), uses.map(c => c.id).reverse());
    assert.notEqual(uses[0].sense, uses[1].sense);
    for (const t of [0, 1 / 4, 1 / 2, 3 / 4, 1]) {
      const q = 2 * t * (1 - t), want = i ? [10 + b * q, by * q, 12 * t] : [a * q, ay * q, 12 * t];
      vector(evaluateCurve(edge.curve, t), want);
      for (const use of uses) {
        const { surface } = brep.faces.find(f => f.id === brep.loops.find(l => l.id === use.loop).face);
        vector(evaluateSurface(surface, ...evaluateCurve(use.pcurve, t)), want);
      }
    }
  }
  for (const t of [1 / 4, 1 / 2, 3 / 4]) {
    const q = 2 * t * (1 - t), x0 = a * q, x1 = 10 + b * q, y0 = ay * q, y1 = by * q, z = 12 * t;
    const dx = 0.6 * (y0 - y1), dy = 0.6 * (x1 - x0);
    const points = [[x0, y0, z], [x1, y1, z], [x1 + dx, y1 + dy, z], [x0 + dx, y0 + dy, z]];
    for (let i = 0; i < 4; ++i) {
      const { surface } = brep.faces.find(f => f.name === `loft.side${i}`);
      vector(evaluateSurface(surface, 0, t), points[i]);
      vector(evaluateSurface(surface, 0.5, t), points[i].map((x, j) => (x + points[(i + 1) % 4][j]) / 2));
      vector(evaluateSurface(surface, 1, t), points[(i + 1) % 4]);
    }
  }
}

test('two-guide Loft: separate guide edits change the solid, with both rails on reciprocal native faces', () => {
  const initial = build({}), before = structuredClone(guides);
  verify(initial, 2, 4);
  verify(build({ guides: [rail(0, 3), guides[1]] }), 3, 4);
  verify(build({ guides: [guides[0], rail(10, 16)] }), 2, 6);
  verify(build({ guides: [guides[0], rail(10, 14, 4)] }), 2, 4, 0, 4);
  assert.deepEqual(guides, before);
});

test('two-guide Loft: unequal rectangles retain quadratic seams, exact caps and native inertia', () => {
  const unequal = [sections[0], { profile: rect(0, 0, 14, 4), z: 12 }];
  const left = rail(0, 2, -1), right = middle => ({
    kind: 'quadratic-bezier', controlPoints: [[10, 0, 0], [middle, 3, 6], [14, 0, 12]],
  });
  // Integrate univariate slice polynomials coefficient by coefficient. The rectangle at each height has
  // center A + (D + E)/2, area cross(D,E), and center covariance (DDᵀ + EEᵀ)/12.
  // The six inertia entries are ordered xx, yy, zz, xy, xz, yz at density 1000 g/cm³.
  const cases = [
    [16, 147064 / 175, [2927366 / 435855, 42073193 / 13511505, 762060 / 128681],
      [11806.715177161368, 21086.432927149788, 14195.341237458479, -911.9043899067234, -1677.3447375229405, 816.6722212521696]],
    [18, 163256 / 175, [106148489 / 14999145, 49221628 / 14999145, 843732 / 142849],
      [13051.434101885554, 24556.48832588781, 17635.40157945644, -1154.289376256802, -1806.3323134055377, 923.6552029313834]],
  ];
  for (const [middle, volume, centroid, inertia] of cases) {
    const authored = [left, right(middle)], result = build({ sections: unequal, guides: authored }), { brep } = result;
    const report = checkBrep(brep, { strict: true, pcurveSamples: 13 });
    assert.equal(report.valid, true, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    for (const mass of [result.mass(1000), brepMassProperties(brep, 1000)]) {
      assert.equal(mass.method, 'quadrature');
      close(mass.volume, volume); vector(mass.centroid, centroid);
      const [xx, yy, zz, xy, xz, yz] = inertia;
      const expected = [[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]];
      mass.inertia.forEach((row, i) => row.forEach((value, j) => close(value, expected[i][j], 1e-8)));
    }
    for (const [k, section] of unequal.entries()) {
      for (const [i, vertex] of section.profile.entries()) {
        assert.deepEqual(brep.vertices.find(v => v.id === `v${k}_${i}`).point, [...vertex.start, section.z]);
      }
    }
    const rails = [0, 1, 2, 3].map(i => brep.edges.find(e => e.id === `l0_${i}`));
    assert.deepEqual(rails.map(edge => edge.curve.degree), [2, 2, 3, 3]);
    authored.forEach((guide, i) => assert.deepEqual(rails[i].curve.controlPoints, guide.controlPoints));
    const uses = rails.map(edge => brep.coedges.filter(use => use.edge === edge.id));
    const sideFaces = [0, 1, 2, 3].map(i => brep.faces.find(f => f.name === `loft.side${i}`));
    for (const [a, b] of uses) {
      assert.equal(a.twin, b.id);
      assert.equal(b.twin, a.id);
      assert.notEqual(a.sense, b.sense);
    }
    for (const t of [0, 1 / 5, 1 / 2, 4 / 5, 1]) {
      const q = 2 * t * (1 - t), z = 12 * t, x = 2 * q, y = -q;
      const dx = 10 + 4 * t + (middle - 14) * q, dy = 4 * q, aspect = 3 / 5 - 11 * t / 35;
      const ex = -aspect * dy, ey = aspect * dx;
      const ring = [[x, y, z], [x + dx, y + dy, z], [x + dx + ex, y + dy + ey, z], [x + ex, y + ey, z]];
      for (const [i, edge] of rails.entries()) {
        vector(evaluateCurve(edge.curve, t), ring[i]);
        for (const use of uses[i]) {
          const face = brep.faces.find(f => f.id === brep.loops.find(l => l.id === use.loop).face);
          vector(evaluateSurface(face.surface, ...evaluateCurve(use.pcurve, t)), ring[i]);
        }
        const next = ring[(i + 1) % 4];
        for (const u of [0, 1 / 3, 1]) {
          vector(evaluateSurface(sideFaces[i].surface, u, t), ring[i].map((value, j) => value + u * (next[j] - value)));
        }
      }
    }
  }
});

test('two-guide Loft: accepts a depth-only change with the original guide endpoints', () => {
  const result = build({ sections: [sections[0], { profile: rect(0, 0, 10, 7), z: 12 }] });
  const report = checkBrep(result.brep, { strict: true });
  assert.equal(report.valid, true, report.issues.join('\n'));
  const far = result.brep.edges.find(edge => edge.id === 'l0_3');
  vector(evaluateCurve(far.curve, 1), [0, 7, 12]);
  // Area is (10 + 2q)^2 (0.6 + 0.1t), with q = 2t(1−t).
  close(result.mass(1).volume, 888.16);
});

test('two-guide Loft: a translated XY Part frame keeps authored world rails and same-feature edit invalidates cache', () => {
  const offset = [20, -10, 5], plane = { origin: offset, normal: [0, 0, 1], xAxis: [1, 0, 0] };
  const translate = g => ({ ...g, controlPoints: g.controlPoints.map(p => p.map((x, i) => x + offset[i])) });
  const loft = { id: 'loft', kind: 'loft', sections: [{ sketch: 'profile', z: 0 }, { sketch: 'profile', z: 12 }], guides: guides.map(translate) };
  const document = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'profile', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [10, 6], plane }, loft,
  ] };
  const accepted = evaluateCadPart(document);
  const edited = { ...loft, guides: [loft.guides[0], translate(rail(10, 16))] };
  const updated = reevaluate(accepted, { document: { ...document, features: [document.features[0], edited] } });
  for (const [snapshot, guides, b] of [[accepted, loft.guides, 4], [updated, edited.guides, 6]]) {
    assert.equal(snapshot.outputs.length, 1);
    const [output] = snapshot.outputs, mass = massPropertiesOf(output), want = oracle(2, b);
    assert.equal(output.bodyCount, 1);
    assert.equal(checkOutput(output).valid, true);
    close(mass.volume, want.volume); vector(mass.centroid, want.centroid.map((x, i) => x + offset[i]));
    for (const i of [0, 1]) assert.deepEqual(output.brep.edges.find(e => e.id === `l0_${i}`).curve.controlPoints, guides[i].controlPoints);
  }
  assert.throws(() => evaluateCadPart({ ...document, features: [{ ...document.features[0], plane: { ...plane, xAxis: [0, 1, 0] } }, loft] }),
    error => error.code === 'INPUT' && error.feature === 'loft' && /common world XY sketch frame/.test(error.message));
});

test('two-guide Loft: refuse unsupported sections, malformed or conflicting guides, wrong corners and collapse', () => {
  const refuse = (input, reason) => assert.throws(() => build(input), e => e.code === 'INPUT' && reason.test(e.message));
  refuse({ guides: [guides[0]] }, /exactly two quadratic/);
  refuse({ guide: guides[0] }, /cannot be combined/);
  refuse({ guides: [guides[0], { ...guides[1], weights: [1, 1, 1] }] }, /guide 2.*quadratic/);
  const sparseControls = [...guides[1].controlPoints];
  delete sparseControls[1];
  refuse({ guides: [guides[0], { ...guides[1], controlPoints: sparseControls }] }, /guide 2.*quadratic/);
  refuse({ guides: [...guides].reverse() }, /guide 1 endpoints.*min X/);
  const wrong = rail(10, 14); wrong.controlPoints[1][2] = 7;
  refuse({ guides: [guides[0], wrong] }, /middle control of guide 2.*midplane/);
  refuse({ guides: [guides[0], rail(10, -10)] }, /positive control gap/);
  refuse({ sections: [sections[0], { profile: rect(0, 0, 11, 6), z: 12 }] }, /guide 2 endpoints.*max X/);
  refuse({ guides: [rail(0, 0), rail(10, 1e-4)] }, /positive control gap/);
  refuse({ guides: [rail(0, 2, 9999), rail(10, 14, 9999)] }, /outside the modeling coordinate range/);
  refuse({ sections: [sections[1], sections[0]] }, /increasing order/);
  refuse({ smooth: true }, /ruled sections/);
});
