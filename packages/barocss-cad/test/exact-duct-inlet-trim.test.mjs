import assert from 'node:assert/strict';
import test from 'node:test';
import {
  booleanAnalytic, brepMassProperties, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, outputOf, saveCadPart,
} from '../dist/index.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at ${tolerance}`);
const rectangle = (x, y) => [[-x, -y], [-x, y], [x, y], [x, -y]].map(start => ({ kind: 'line', start }));
const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [-6, 30, 0]],
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1] };
const documentOf = (inset, cut = true) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3], holes: [rectangle(1, 2)] },
    { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path },
    { id: 't', kind: 'sketch', profile: 'rectangle', min: [-8, -5], max: [inset, 5] },
    { id: 'box', kind: 'extrude', sketch: 't', from: -5, height: 10 },
    ...(cut ? [{ id: 'trim', kind: 'difference', target: 'w', tool: 'box' }] : []),
  ],
});
const expectedVolume = inset => {
  const integral = r => (r ** 2 * Math.asin(inset / r) + inset * Math.sqrt(r ** 2 - inset ** 2)) / 2;
  return 240 * Math.PI - 6 * (integral(14) - integral(10)) + 4 * (integral(13) - integral(11));
};
const seamEdges = brep => brep.edges.filter(({ curve }) => curve.degree === 1
  && curve.controlPoints.every(point => Math.abs(point[1] - 12) < 1e-8)
  && Math.abs(curve.controlPoints[0][2] - curve.controlPoints.at(-1)[2]) > 1);
const withoutBindings = brep => ({ ...brep, coedges: brep.coedges.map(use => ({ ...use, pcurve: null })) });

function verifyBindings(brep) {
  const seams = seamEdges(brep);
  assert.equal(seams.length, 4);
  for (const edge of seams) {
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(uses.length, 2);
    assert.equal(uses[0].twin, uses[1].id);
    assert.equal(uses[1].twin, uses[0].id);
    assert.notEqual(uses[0].sense, uses[1].sense);
    for (const use of uses) {
      assert.ok(use.pcurve);
      const { surface } = brep.faces.find(face => face.loops.includes(use.loop));
      const domain = curveDomain(edge.curve);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      for (const fraction of [0, .19, .5, .87, 1]) {
        const t = domain[0] + fraction * (domain[1] - domain[0]), uv = evaluateCurve(use.pcurve, t);
        const a = evaluateSurface(surface, uv[0], uv[1]), b = evaluateCurve(edge.curve, t);
        near(Math.hypot(...a.map((x, i) => x - b[i])), 0, 1e-10);
      }
    }
    const result = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(result.status, 'measured', JSON.stringify(result));
    near(result.maximumAngleDegrees, 0, 1e-8);
    assert.equal(result.curvature.status, 'measured');
    const radial = edge.curve.controlPoints[0][0] - 12;
    const firstRadius = 12 + radial, secondRadius = 18 + radial;
    near(result.curvature.maximumDifference, Math.abs(1 / firstRadius - 1 / secondRadius), 1e-10);
    for (const sample of result.curvature.samples) assert.equal(Math.sign(sample.first * sample.second), 1);
  }
  return seams;
}

for (const inset of [1, 2]) test(`an inlet trim at X=${inset} keeps the four inherited native cylindrical seams`, () => {
  const snapshot = evaluateCadPart(documentOf(inset)), output = outputOf(snapshot, 'trim'), { brep } = output;
  const report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 14, loops: 16, coedges: 72, edges: 36, vertices: 24 });
  assert.equal(report.topology[0].genus, 1);
  near(report.maximumPcurveGap, 0, 1e-10);
  near(massPropertiesOf(output).volume, expectedVolume(inset));
  near(brepMassProperties(brep, 1).volume, expectedVolume(inset));
  verifyBindings(brep);

  const caps = brep.faces.filter(face => {
    const plane = faceGeometry(face);
    return plane.kind === 'plane' && Math.abs(plane.n[0]) > .999999;
  });
  assert.equal(caps.length, 2);
  assert.deepEqual(caps.map(face => face.loops.length), [2, 2]);
  // Newly cut cap edges have no inherited bindings. This change must not synthesize new Boolean boundaries.
  const inlet = caps.find(face => Math.abs(faceGeometry(face).o[0] - inset) < 1e-8);
  assert.ok(inlet);
  assert.ok(brep.coedges.filter(use => inlet.loops.includes(use.loop)).every(use => !use.pcurve));
  const outlet = caps.find(face => face.name === 'w.end');
  assert.ok(outlet);
  const outletEdges = new Set(brep.coedges.filter(use => outlet.loops.includes(use.loop)).map(use => use.edge));
  for (const edge of brep.edges.filter(edge => outletEdges.has(edge.id))) for (const point of edge.curve.controlPoints) {
    near(point[0], -6); assert.ok(point[1] >= 28 && point[1] <= 32); assert.ok(Math.abs(point[2]) <= 3);
  }
  const reopened = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(reopened.document, snapshot.document);
  assert.deepEqual(outputOf(reopened, 'trim').brep, brep);
});

test('unbound source seams remain unbound and retain the same Boolean geometry', () => {
  const source = evaluateCadPart(documentOf(1, false)), a = outputOf(source, 'w').brep, b = outputOf(source, 'box').brep;
  const original = structuredClone(a), box = structuredClone(b);
  const bound = booleanAnalytic(a, b, 'difference', { id: 'trim' });
  const unbound = booleanAnalytic(withoutBindings(a), b, 'difference', { id: 'trim' });
  assert.deepEqual(a, original); assert.deepEqual(b, box);
  assert.deepEqual(withoutBindings(bound), withoutBindings(unbound));
  assert.ok(checkBrep(unbound, { strict: true }).valid);
  for (const edge of seamEdges(unbound)) {
    assert.ok(unbound.coedges.filter(use => use.edge === edge.id).every(use => !use.pcurve));
    assert.deepEqual(measureBrepEdgeContinuity(unbound, edge.id), { status: 'unsupported', edgeId: edge.id, reason: 'missing-pcurve' });
  }
});

test('an incorrect inherited chart binding is not carried to the Boolean result', () => {
  const source = evaluateCadPart(documentOf(1, false)), a = outputOf(source, 'w').brep, b = outputOf(source, 'box').brep;
  const edge = seamEdges(a)[0], use = a.coedges.find(use => use.edge === edge.id);
  const corrupted = { ...a, coedges: a.coedges.map(candidate => candidate.id === use.id
    ? { ...candidate, pcurve: { ...candidate.pcurve, controlPoints: candidate.pcurve.controlPoints.map(([u, v, z]) => [u + .01, v, z]) } } : candidate) };
  const result = booleanAnalytic(corrupted, b, 'difference', { id: 'trim' });
  assert.ok(checkBrep(result, { strict: true }).valid);
  const inherited = seamEdges(result).find(candidate => candidate.curve.controlPoints[0][0] === edge.curve.controlPoints[0][0]);
  assert.ok(inherited);
  assert.ok(result.coedges.filter(use => use.edge === inherited.id).every(use => !use.pcurve));
  assert.equal(seamEdges(result).filter(edge => result.coedges.filter(use => use.edge === edge.id).every(use => use.pcurve)).length, 3);
});
