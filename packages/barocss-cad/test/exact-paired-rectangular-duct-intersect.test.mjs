import assert from 'node:assert/strict';
import test from 'node:test';
import {
  booleanAnalytic, brepMassProperties, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, outputOf, reevaluate, saveCadPart,
} from '../dist/index.js';
import { booleanAnalyticTraced } from '../dist/brep/analytic-boolean.js';
import { locateInRegion } from '../dist/brep/curved-arrangement.js';
import { bindHalfRectangularDuctIntersection } from '../dist/brep/exact-rectangular-duct-intersect.js';

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
const pointNear = (a, b, tolerance = 1e-9) => near(Math.hypot(...a.map((x, i) => x - b[i])), 0, tolerance);
const withoutBindings = brep => ({ ...brep, coedges: brep.coedges.map(use => ({ ...use, pcurve: null })) });

function document({ reversed = false, swapped = false, reordered = false } = {}) {
  const poles = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
  const hole = (low, high, clockwise) => {
    const corners = [[-1, low], [1, low], [1, high], [-1, high]];
    return (clockwise ? corners.toReversed() : corners).map(start => ({ kind: 'line', start }));
  };
  const holes = [hole({ parameter: 'FirstLowY' }, { parameter: 'FirstHighY' }, true), hole(1, 3, false)];
  const tags = [['a0', 'a1', 'a2', 'a3'], ['b0', 'b1', 'b2', 'b3']];
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { FirstLowY: -3, FirstHighY: -1, ClipX: 0 }, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5],
      holes: reordered ? holes.toReversed() : holes,
      sideTags: { outer: ['south', 'east', 'north', 'west'], holes: reordered ? tags.toReversed() : tags } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path: { degree: 2,
      knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
      controlPoints: (reversed ? poles.toReversed() : poles).map(([x, y]) => [20 * x, 20 * y, 0]),
      weights: poles.map((_, i) => i % 2 ? Math.SQRT1_2 : 1) } },
    { id: 'bs', kind: 'sketch', profile: 'rectangle', min: [{ parameter: 'ClipX' }, -30], max: [30, 30] },
    { id: 'b', kind: 'extrude', sketch: 'bs', from: -6, height: 12 },
    { id: 'cut', kind: 'intersect', target: swapped ? 'b' : 'w', tool: swapped ? 'w' : 'b' },
  ] };
}

function verify(snapshot, firstHeight = 2, reversed = false) {
  const output = snapshot.outputs[0], { brep } = output, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 14, loops: 18, edges: 36, coedges: 72, vertices: 24 });
  assert.equal(report.topology[0].genus, 2);
  assert.ok(report.maximumPcurveGap < 1e-10);
  const sign = reversed ? -1 : 1, sections = [{ width: 4, height: 10, center: 0, sign: 1 },
    { width: 2, height: firstHeight, center: sign * 2, sign: -1 }, { width: 2, height: 2, center: -sign * 2, sign: -1 }];
  // Independent half-annular-strip integrals, including the cavity centers and radial first moment.
  const area = sections.reduce((sum, s) => sum + s.sign * s.width * s.height, 0), volume = Math.PI * 20 * area;
  const centroid = [2 * sections.reduce((sum, s) => sum + s.sign * s.height * (400 * s.width + s.width ** 3 / 12), 0) / volume,
    0, sections.reduce((sum, s) => sum + s.sign * s.width * s.height * s.center, 0) / area];
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 2e-7);
    pointNear(mass.centroid, centroid, 1e-8);
  }
  const caps = brep.faces.filter(face => face.loops.length === 3);
  assert.equal(caps.length, 2);
  const stations = [];
  for (const cap of caps) {
    pointNear(faceGeometry(cap).n, [-1, 0, 0]);
    const loops = cap.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'inner', 'outer']);
    const station = Math.sign(brep.edges.find(edge => edge.id === brep.coedges.find(use => use.id === loops[0].coedges[0]).edge).curve.controlPoints[0][1]) * 20;
    stations.push(station);
    const rings = loops.map(loop => ({ kind: loop.kind, segments: loop.coedges.map(id => {
      const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge), [lo, hi] = curveDomain(edge.curve);
      const a = evaluateCurve(edge.curve, use.sense === 'forward' ? lo : hi), b = evaluateCurve(edge.curve, use.sense === 'forward' ? hi : lo);
      near(a[0], 0); near(b[0], 0);
      return { kind: 'line', a: [a[1] - station, a[2]], b: [b[1] - station, b[2]] };
    }) }));
    const region = { outer: rings.find(ring => ring.kind === 'outer').segments, holes: rings.filter(ring => ring.kind === 'inner').map(ring => ring.segments) };
    for (const [point, expected] of [[[0, 0], 'in'], [[0, 2], 'out'], [[0, -2], 'out'], [[1.5, 2], 'in'],
      [[0, 4], 'in'], [[0, -4], 'in'], [[2.5, 0], 'out'], [[0, 5], 'boundary'], [[1, 2], 'boundary'],
      [[0, sign * 1.25], firstHeight === 2 ? 'out' : 'in']])
      assert.equal(locateInRegion(point, region, 1e-8), expected, `${station}: ${point}`);
  }
  assert.deepEqual(stations.sort((a, b) => a - b), [-20, 20]);
  assert.equal(brep.faces.filter(face => faceGeometry(face).kind === 'cylinder').length, 6);
  // Named walls remain assigned to the authored cavity despite equal radii and reordered holes.
  for (const [tag, center, height] of [['a', sign * 2, firstHeight], ['b', -sign * 2, 2]]) {
    const faces = brep.faces.filter(face => face.name?.startsWith(`w.side[${tag}`));
    assert.equal(faces.length, 4);
    for (const face of faces) {
      const geometry = faceGeometry(face);
      if (geometry.kind === 'cylinder') assert.equal(geometry.out, -Math.sign(geometry.r - 20));
      else pointNear(geometry.n, [0, 0, -Math.sign(face.surface.controlPoints[0][0][2] - center)]);
      for (const row of face.surface.controlPoints) for (const point of row)
        assert.ok(Math.abs(point[2] - center) <= height / 2 + 1e-10);
    }
  }
  let arcs = 0;
  for (const edge of brep.edges) {
    if (edge.curve.degree === 2) arcs++;
    const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
    assert.equal(uses.length, 2);
    assert.equal(uses[0].twin, uses[1].id); assert.equal(uses[1].twin, uses[0].id);
    assert.notEqual(uses[0].sense, uses[1].sense);
    for (const use of uses) {
      assert.ok(use.pcurve);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      for (const fraction of [0, .17, .5, .77, 1]) {
        const t = domain[0] + fraction * (domain[1] - domain[0]), point = evaluateCurve(edge.curve, t), [u, v] = evaluateCurve(use.pcurve, t);
        assert.ok(point[0] >= -1e-10);
        pointNear(evaluateSurface(face.surface, u, v), point, 1e-10);
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id);
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.minimumAngleDegrees, 90, 1e-8); near(continuity.maximumAngleDegrees, 90, 1e-8);
  }
  assert.equal(arcs, 12);
  return brep;
}

test('paired closed duct centered Intersect binds four separate apertures and all 36 native sharp joints without changing geometry or ownership', () => {
  const doc = document(), snapshot = evaluateCadPart(doc), brep = verify(snapshot);
  const operands = evaluateCadPart({ ...doc, features: doc.features.slice(0, 4) }), source = outputOf(operands, 'w').brep, box = outputOf(operands, 'b').brep;
  const raw = booleanAnalytic(source, box, 'intersection', { id: 'cut', exactEdges: false });
  assert.ok(raw.coedges.every(use => !use.pcurve));
  assert.deepEqual(withoutBindings(brep), withoutBindings(raw));
  const traced = booleanAnalyticTraced(source, box, 'intersection', { id: 'cut' });
  const rawTraced = booleanAnalyticTraced(source, box, 'intersection', { id: 'cut', exactEdges: false });
  assert.equal(traced.complete, true);
  assert.deepEqual(traced.faceSources, rawTraced.faceSources);
  assert.deepEqual(traced.brep, brep);
  const reopened = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(reopened.outputs[0].brep, brep);
});

test('paired aperture height edit, reversed path, reordered cavities and swapped operands retain separate native ownership through reopen', () => {
  for (const options of [{}, { reversed: true }, { reordered: true }, { swapped: true }]) {
    const initial = evaluateCadPart(document(options));
    verify(initial, 2, options.reversed);
    const edited = reevaluate(initial, { parameters: { FirstLowY: -2.5, FirstHighY: -1.5 } });
    verify(edited, 1, options.reversed);
    const otherCavity = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name?.startsWith('w.side[b'));
    assert.deepEqual(otherCavity(edited), otherCavity(initial));
    const reopened = loadCadPart(saveCadPart(edited));
    assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
    assert.deepEqual(reevaluate(reopened, { parameters: { FirstLowY: -3, FirstHighY: -1 } }).outputs[0].brep, initial.outputs[0].brep);
  }
});

test('paired binding refuses offset or second active box planes, missing charts, duplicate aperture loops and altered source orientation', () => {
  const doc = document(), snapshot = evaluateCadPart(doc), result = snapshot.outputs[0].brep;
  const operands = evaluateCadPart({ ...doc, features: doc.features.slice(0, 4) }), source = outputOf(operands, 'w').brep, box = outputOf(operands, 'b').brep;
  for (const changed of [withoutBindings(source), { ...source, source: { family: 'manual', id: 'w' } },
    { ...source, faces: source.faces.map(face => source.shells[1].faces.includes(face.id) ? { ...face, sense: face.sense === 'forward' ? 'reversed' : 'forward' } : face) }])
    assert.equal(bindHalfRectangularDuctIntersection(changed, box, result, 1e-6), undefined);
  for (const features of [doc.features.slice(0, 4).map(feature => feature.id === 'bs' ? { ...feature, min: [1, -30] } : feature),
    doc.features.slice(0, 4).map(feature => feature.id === 'bs' ? { ...feature, max: [21, 30] } : feature)]) {
    const changed = evaluateCadPart({ ...doc, features });
    assert.equal(bindHalfRectangularDuctIntersection(source, outputOf(changed, 'b').brep, result, 1e-6), undefined);
  }
  const cap = result.faces.find(face => face.loops.length === 3), inner = cap.loops.filter(id => result.loops.find(loop => loop.id === id).kind === 'inner');
  const duplicate = { ...result, faces: result.faces.map(face => face === cap ? { ...face, loops: face.loops.map(id => id === inner[1] ? inner[0] : id) } : face) };
  assert.equal(bindHalfRectangularDuctIntersection(source, box, duplicate, 1e-6), undefined);
});
