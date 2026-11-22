import assert from 'node:assert/strict';
import test from 'node:test';
import {
  booleanAnalytic, brepMassProperties, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, outputOf, reevaluate, saveCadPart,
} from '../dist/index.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at ${tolerance}`);
const rectangle = (x, y) => [[-x, -y], [-x, y], [x, y], [x, -y]].map(start => ({ kind: 'line', start }));
const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 16, 0], [12, 20, 0], [12, 38, 0], [30, 38, 0]],
  weights: [1, Math.SQRT1_2, 1, 1, 1, Math.SQRT1_2, 1] };
const documentOf = (inset = 1, cut = true) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { InletTrim: inset }, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3], holes: [rectangle(1, 2)] },
    { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path },
    { id: 't', kind: 'sketch', profile: 'rectangle', min: [-8, -5], max: [{ parameter: 'InletTrim' }, 5] },
    { id: 'box', kind: 'extrude', sketch: 't', from: -5, height: 10 },
    ...(cut ? [{ id: 'trim', kind: 'difference', target: 'w', tool: 'box' }] : []),
  ],
});
// Section area 24 - 8 times independently authored rail length. Only the first annular bend meets the tool.
const originalVolume = 16 * (15 * Math.PI + 8);
const expectedVolume = inset => {
  const integral = r => (r ** 2 * Math.asin(inset / r) + inset * Math.sqrt(r ** 2 - inset ** 2)) / 2;
  return originalVolume - 6 * (integral(14) - integral(10)) + 4 * (integral(13) - integral(11));
};
const owner = (brep, use) => brep.faces.find(face => face.loops.includes(use.loop));
const seamsAt = (brep, station) => brep.edges.filter(({ curve }) => curve.degree === 1
  && curve.controlPoints.every(point => Math.abs(point[1] - station) < 1e-8)
  && Math.abs(curve.controlPoints[0][2] - curve.controlPoints.at(-1)[2]) > 1);
const allSeams = brep => [12, 20].flatMap(station => seamsAt(brep, station));
const withoutBindings = brep => ({ ...brep, coedges: brep.coedges.map(use => ({ ...use, pcurve: null })) });

function verifyBindings(brep) {
  for (const station of [12, 20]) {
    const seams = seamsAt(brep, station);
    assert.equal(seams.length, 4);
    assert.deepEqual(seams.map(edge => edge.curve.controlPoints[0][0]).sort((a, b) => a - b), [10, 11, 13, 14]);
    for (const edge of seams) {
      const uses = brep.coedges.filter(use => use.edge === edge.id);
      assert.equal(uses.length, 2);
      assert.equal(uses[0].twin, uses[1].id); assert.equal(uses[1].twin, uses[0].id);
      assert.notEqual(uses[0].sense, uses[1].sense);
      assert.deepEqual(uses.map(use => faceGeometry(owner(brep, use)).kind).sort(), ['cylinder', 'plane']);
      for (const use of uses) {
        assert.ok(use.pcurve, `${station}: ${edge.name}: ${owner(brep, use).name}`);
        const domain = curveDomain(edge.curve), { surface } = owner(brep, use);
        assert.deepEqual(curveDomain(use.pcurve), domain);
        for (const fraction of [0, .19, .5, .87, 1]) {
          const t = domain[0] + fraction * (domain[1] - domain[0]), uv = evaluateCurve(use.pcurve, t);
          const actual = evaluateSurface(surface, uv[0], uv[1]), expected = evaluateCurve(edge.curve, t);
          near(Math.hypot(...actual.map((x, i) => x - expected[i])), 0, 1e-10);
        }
      }
      const result = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
      assert.equal(result.status, 'measured', JSON.stringify(result));
      near(result.maximumAngleDegrees, 0, 1e-8);
      assert.equal(result.curvature.status, 'measured');
      const radius = Math.abs(edge.curve.controlPoints[0][0] - (station === 12 ? 0 : 30));
      near(result.curvature.maximumDifference, 1 / radius, 1e-10);
      const planeIndex = uses.findIndex(use => faceGeometry(owner(brep, use)).kind === 'plane');
      for (const sample of result.curvature.samples) {
        const values = [sample.first, sample.second];
        near(values[planeIndex], 0, 1e-10);
        near(Math.abs(values[1 - planeIndex]), 1 / radius, 1e-10);
      }
    }
  }
}

function verifyMouth(brep, face, inset, outlet) {
  const plane = faceGeometry(face), x = outlet ? 30 : inset;
  assert.equal(plane.kind, 'plane'); near(plane.o[0], x);
  plane.n.forEach((value, i) => near(value, i === 0 ? (outlet ? 1 : -1) : 0));
  const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
  assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
  for (const loop of loops) {
    const inner = loop.kind === 'inner', height = inner ? 2 : 3;
    const intercept = radius => 12 - Math.sqrt(radius ** 2 - inset ** 2);
    const ys = outlet ? [38 - (inner ? 1 : 2), 38 + (inner ? 1 : 2)]
      : inner ? [intercept(13), intercept(11)] : [intercept(14), intercept(10)];
    assert.equal(loop.coedges.length, 4);
    const corners = new Set();
    for (const id of loop.coedges) {
      const use = brep.coedges.find(use => use.id === id), twin = brep.coedges.find(peer => peer.id === use.twin);
      assert.equal(twin.twin, use.id); assert.equal(twin.edge, use.edge); assert.notEqual(twin.sense, use.sense);
      const edge = brep.edges.find(edge => edge.id === use.edge), domain = curveDomain(edge.curve);
      for (const fraction of [0, .19, .5, .87, 1]) {
        const point = evaluateCurve(edge.curve, domain[0] + fraction * (domain[1] - domain[0]));
        near(point[0], x);
        assert.ok(point[1] >= ys[0] - 1e-8 && point[1] <= ys[1] + 1e-8 && Math.abs(point[2]) <= height + 1e-8);
        assert.ok(Math.min(...ys.map(y => Math.abs(point[1] - y)), Math.abs(Math.abs(point[2]) - height)) < 1e-8);
        if (fraction === 0 || fraction === 1) {
          const side = ys.findIndex(y => Math.abs(point[1] - y) < 1e-8);
          near(Math.abs(point[2]), height); assert.notEqual(side, -1);
          corners.add(`${side}:${Math.sign(point[2])}`);
        }
      }
    }
    assert.equal(corners.size, 4);
  }
}

function verify(snapshot, inset) {
  const output = outputOf(snapshot, 'trim'), { brep } = output, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 96, edges: 48, vertices: 32 });
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].genus, 1);
  near(report.maximumPcurveGap, 0, 1e-10);
  near(massPropertiesOf(output).volume, expectedVolume(inset));
  near(brepMassProperties(brep, 1).volume, expectedVolume(inset));
  verifyBindings(brep);
  const caps = brep.faces.filter(face => {
    const g = faceGeometry(face);
    return g.kind === 'plane' && Math.abs(g.n[0]) > .999999 && face.loops.length === 2;
  });
  assert.equal(caps.length, 2);
  const outlet = caps.find(face => face.name === 'w.end'), inlet = caps.find(face => face !== outlet);
  assert.ok(outlet && inlet);
  verifyMouth(brep, inlet, inset, false); verifyMouth(brep, outlet, inset, true);
  // The cut is new. Neither its box face nor the new cylinder/cap edges receive source bindings.
  const newEdges = new Set(brep.coedges.filter(use => inlet.loops.includes(use.loop)).map(use => use.edge));
  assert.ok(brep.coedges.filter(use => newEdges.has(use.edge)).every(use => !use.pcurve));
}

test('a spaced opposite-turn duct retains both mouths and eight native cylinder-plane joins through X=1/2, reopen and restore', () => {
  const source = evaluateCadPart(documentOf(1, false));
  near(massPropertiesOf(outputOf(source, 'w')).volume, originalVolume);
  const initial = evaluateCadPart(documentOf()); verify(initial, 1);
  const edited = reevaluate(initial, { parameters: { InletTrim: 2 } }); verify(edited, 2);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(outputOf(reopened, 'trim').brep, outputOf(edited, 'trim').brep);
  const restored = reevaluate(reopened, { parameters: { InletTrim: 1 } }); verify(restored, 1);
  assert.deepEqual(outputOf(restored, 'trim').brep, outputOf(initial, 'trim').brep);
});

test('absent bindings and non-sweep provenance retain identical Boolean geometry without new chart claims', () => {
  const snapshot = evaluateCadPart(documentOf(1, false)), a = outputOf(snapshot, 'w').brep, b = outputOf(snapshot, 'box').brep;
  const original = structuredClone(a), box = structuredClone(b), bound = booleanAnalytic(a, b, 'difference', { id: 'trim' });
  for (const source of [withoutBindings(a), { ...a, source: { family: 'analytic-boolean', id: 'w' } }]) {
    const result = booleanAnalytic(source, b, 'difference', { id: 'trim' });
    assert.ok(checkBrep(result, { strict: true }).valid);
    assert.deepEqual(withoutBindings(result), withoutBindings(bound));
    assert.ok(result.coedges.every(use => !use.pcurve));
  }
  assert.deepEqual(a, original); assert.deepEqual(b, box);
});

for (const kind of ['plane', 'cylinder']) for (const damage of ['missing', 'offset', 'domain'])
test(`a ${damage} source ${kind} chart cannot claim either side of the inherited join`, () => {
  const snapshot = evaluateCadPart(documentOf(1, false)), a = outputOf(snapshot, 'w').brep, b = outputOf(snapshot, 'box').brep;
  const edge = seamsAt(a, 12)[0], use = a.coedges.find(use => use.edge === edge.id && faceGeometry(owner(a, use)).kind === kind);
  assert.ok(use?.pcurve);
  const pcurve = damage === 'missing' ? null : damage === 'offset'
    ? { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]) => [u + .01, v, z]) }
    : { ...use.pcurve, knots: use.pcurve.knots.map(k => k + .01) };
  const corrupted = { ...a, coedges: a.coedges.map(candidate => candidate.id === use.id ? { ...candidate, pcurve } : candidate) };
  const result = booleanAnalytic(corrupted, b, 'difference', { id: 'trim' });
  assert.ok(checkBrep(result, { strict: true }).valid);
  const inherited = seamsAt(result, 12).find(candidate => Math.abs(candidate.curve.controlPoints[0][0] - edge.curve.controlPoints[0][0]) < 1e-8);
  assert.ok(inherited);
  assert.ok(result.coedges.filter(use => use.edge === inherited.id).every(use => !use.pcurve));
  assert.equal(allSeams(result).filter(edge => result.coedges.filter(use => use.edge === edge.id).every(use => use.pcurve)).length, 7);
});
