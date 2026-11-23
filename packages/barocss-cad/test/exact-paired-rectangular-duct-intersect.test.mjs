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

function document({ reversed = false, swapped = false, reordered = false, offset = 0 } = {}) {
  const poles = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
  const hole = (low, high, clockwise) => {
    const corners = [[-1, low], [1, low], [1, high], [-1, high]];
    return (clockwise ? corners.toReversed() : corners).map(start => ({ kind: 'line', start }));
  };
  const holes = [hole({ parameter: 'FirstLowY' }, { parameter: 'FirstHighY' }, true), hole(1, 3, false)];
  const tags = [['a0', 'a1', 'a2', 'a3'], ['b0', 'b1', 'b2', 'b3']];
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: { FirstLowY: -3, FirstHighY: -1, ClipX: offset }, features: [
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

function verify(snapshot, firstHeight = 2, reversed = false, offset = 0) {
  const output = snapshot.outputs[0], { brep } = output, report = checkBrep(brep, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 14, loops: 18, edges: 36, coedges: 72, vertices: 24 });
  assert.equal(report.topology[0].genus, 2);
  assert.ok(report.maximumPcurveGap < 1e-10);
  const sign = reversed ? -1 : 1, sections = [{ width: 4, height: 10, center: 0, sign: 1 },
    { width: 2, height: firstHeight, center: sign * 2, sign: -1 }, { width: 2, height: 2, center: -sign * 2, sign: -1 }];
  // Independent disk-segment area and first moments; no Boolean surfaces or mass callback.
  const yAt = radius => Math.sqrt((radius - offset) * (radius + offset));
  const segment = radius => radius ** 2 * Math.acos(offset / radius) - offset * yAt(radius);
  const firstMoment = radius => 2 / 3 * yAt(radius) ** 3;
  const strip = (s, integral) => s.sign * s.height * (integral(20 + s.width / 2) - integral(20 - s.width / 2));
  const volume = sections.reduce((sum, s) => sum + strip(s, segment), 0);
  const centroid = [sections.reduce((sum, s) => sum + strip(s, firstMoment), 0) / volume,
    0, sections.reduce((sum, s) => sum + strip(s, segment) * s.center, 0) / volume];
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 2e-7);
    pointNear(mass.centroid, centroid, 1e-8);
  }
  const caps = brep.faces.filter(face => face.loops.length === 3), capIds = new Set(caps.map(face => face.id));
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
      near(a[0], offset); near(b[0], offset);
      return { kind: 'line', a: [a[1] - station, a[2]], b: [b[1] - station, b[2]] };
    }) }));
    const region = { outer: rings.find(ring => ring.kind === 'outer').segments, holes: rings.filter(ring => ring.kind === 'inner').map(ring => ring.segments) };
    const side = Math.sign(station), openingCenter = side * (yAt(19) + yAt(21)) / 2 - station;
    for (const [point, expected] of [[[openingCenter, 0], 'in'], [[openingCenter, 2], 'out'], [[openingCenter, -2], 'out'],
      [[side * (yAt(21) + yAt(22)) / 2 - station, 2], 'in'], [[openingCenter, 4], 'in'], [[openingCenter, -4], 'in'],
      [[side * (yAt(22) + .5) - station, 0], 'out'], [[openingCenter, 5], 'boundary'], [[side * yAt(21) - station, 2], 'boundary'],
      [[openingCenter, sign * 1.25], firstHeight === 2 ? 'out' : 'in']])
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
  let arcs = 0, verticalCapJoints = 0;
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
        assert.ok(point[0] >= offset - 1e-10);
        pointNear(evaluateSurface(face.surface, u, v), point, 1e-10);
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id);
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    const owners = uses.map(use => brep.faces.find(face => face.loops.includes(use.loop)));
    const cylinder = owners.map(face => faceGeometry(face)).find(geometry => geometry.kind === 'cylinder');
    const verticalCap = cylinder && owners.some(face => capIds.has(face.id));
    // At x = offset, the cap's outward normal is -X and the cylinder's radial normal has x/r.
    const angle = verticalCap ? Math.acos(-cylinder.out * offset / cylinder.r) * 180 / Math.PI : 90;
    if (verticalCap) {
      verticalCapJoints++;
      assert.equal(edge.curve.degree, 1);
      near(edge.curve.controlPoints[0][0], offset);
      near(edge.curve.controlPoints[0][1], edge.curve.controlPoints[1][1]);
      if (offset > 0) assert.ok(Math.abs(angle - 90) > 1);
    }
    near(continuity.minimumAngleDegrees, angle, 1e-8); near(continuity.maximumAngleDegrees, angle, 1e-8);
  }
  assert.equal(arcs, 12);
  assert.equal(verticalCapJoints, 12);
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

test('paired binding refuses negative offset or second active box planes, missing charts, duplicate aperture loops and altered source orientation', () => {
  const doc = document(), snapshot = evaluateCadPart(doc), result = snapshot.outputs[0].brep;
  const operands = evaluateCadPart({ ...doc, features: doc.features.slice(0, 4) }), source = outputOf(operands, 'w').brep, box = outputOf(operands, 'b').brep;
  for (const changed of [withoutBindings(source), { ...source, source: { family: 'manual', id: 'w' } },
    { ...source, faces: source.faces.map(face => source.shells[1].faces.includes(face.id) ? { ...face, sense: face.sense === 'forward' ? 'reversed' : 'forward' } : face) }])
    assert.equal(bindHalfRectangularDuctIntersection(changed, box, result, 1e-6), undefined);
  for (const features of [doc.features.slice(0, 4).map(feature => feature.id === 'bs' ? { ...feature, min: [-1, -30] } : feature),
    doc.features.slice(0, 4).map(feature => feature.id === 'bs' ? { ...feature, max: [21, 30] } : feature)]) {
    const changed = evaluateCadPart({ ...doc, features });
    assert.equal(bindHalfRectangularDuctIntersection(source, outputOf(changed, 'b').brep, result, 1e-6), undefined);
  }
  const cap = result.faces.find(face => face.loops.length === 3), inner = cap.loops.filter(id => result.loops.find(loop => loop.id === id).kind === 'inner');
  const duplicate = { ...result, faces: result.faces.map(face => face === cap ? { ...face, loops: face.loops.map(id => id === inner[1] ? inner[0] : id) } : face) };
  assert.equal(bindHalfRectangularDuctIntersection(source, box, duplicate, 1e-6), undefined);
});

test('paired x1 and x2 Intersect preserves raw geometry, source ownership and exact signed cap joints, including mixed arc spans', () => {
  for (const offset of [1, 2, 15]) {
    const doc = document({ offset }), snapshot = evaluateCadPart(doc), brep = verify(snapshot, 2, false, offset);
    const operands = evaluateCadPart({ ...doc, features: doc.features.slice(0, 4) });
    const source = outputOf(operands, 'w').brep, box = outputOf(operands, 'b').brep;
    const raw = booleanAnalytic(source, box, 'intersection', { id: 'cut', exactEdges: false });
    assert.ok(raw.coedges.every(use => !use.pcurve));
    assert.deepEqual(withoutBindings(brep), withoutBindings(raw), 'only coedge charts may change; raw 3D data and native IDs stay fixed');
    const traced = booleanAnalyticTraced(source, box, 'intersection', { id: 'cut' });
    const rawTraced = booleanAnalyticTraced(source, box, 'intersection', { id: 'cut', exactEdges: false });
    assert.equal(traced.complete, true);
    assert.deepEqual(traced.faceSources, rawTraced.faceSources);
    assert.deepEqual(traced.brep, brep);
    const reopened = loadCadPart(saveCadPart(snapshot));
    assert.deepEqual(reopened.document, snapshot.document);
    assert.deepEqual(reopened.outputs[0].brep, brep);
    if (offset === 15) {
      assert.equal(brep.edges.filter(edge => edge.curve.degree === 2 && edge.curve.controlPoints.length === 3).length, 10);
      assert.equal(brep.edges.filter(edge => edge.curve.degree === 2 && edge.curve.controlPoints.length === 5).length, 2);
    }
  }
});

test('paired offset and single cavity height edits restore native IDs through reopen, reversed path, reordered cavities and swapped operands', () => {
  for (const options of [{}, { reversed: true }, { reordered: true }, { swapped: true }]) {
    const initial = evaluateCadPart(document({ ...options, offset: 1 }));
    verify(initial, 2, options.reversed, 1);
    const shifted = reevaluate(initial, { parameters: { ClipX: 2 } });
    verify(shifted, 2, options.reversed, 2);
    const edited = reevaluate(shifted, { parameters: { FirstLowY: -2.5, FirstHighY: -1.5 } });
    verify(edited, 1, options.reversed, 2);
    const otherCavity = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name?.startsWith('w.side[b'));
    assert.deepEqual(otherCavity(edited), otherCavity(shifted));
    const reopened = loadCadPart(saveCadPart(edited));
    assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
    const restored = reevaluate(reopened, { parameters: { ClipX: 1, FirstLowY: -3, FirstHighY: -1 } });
    assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
  }
});

test('paired positive-offset binding refuses tangent limits, any second active box face and changed rational poles or weights', () => {
  const doc = document({ offset: 1 }), snapshot = evaluateCadPart(doc), result = snapshot.outputs[0].brep;
  const operands = evaluateCadPart({ ...doc, features: doc.features.slice(0, 4) });
  const source = outputOf(operands, 'w').brep, box = outputOf(operands, 'b').brep;
  const featurePatches = [
    { bs: { min: [-1, -30] } }, { bs: { min: [18, -30] } }, { bs: { min: [19, -30] } },
    { bs: { max: [21, 30] } }, { bs: { min: [1, -21] } }, { bs: { max: [30, 21] } },
    { b: { from: -4, height: 10 } }, { b: { from: -6, height: 10 } },
  ];
  for (const patches of featurePatches) {
    const features = doc.features.slice(0, 4).map(feature => ({ ...feature, ...patches[feature.id] }));
    const changed = evaluateCadPart({ ...doc, features });
    assert.equal(bindHalfRectangularDuctIntersection(source, outputOf(changed, 'b').brep, result, 1e-6), undefined);
  }
  const face = result.faces.find(face => faceGeometry(face).kind === 'cylinder');
  for (const surface of [
    { ...face.surface, weights: face.surface.weights.map((row, i) => i === 1 ? row.map(weight => weight + .001) : row) },
    { ...face.surface, controlPoints: face.surface.controlPoints.map((row, i) => i === 1 ? row.map(([x, y, z]) => [x + .01, y, z]) : row) },
  ]) {
    const faces = result.faces.map(candidate => candidate === face ? { ...face, surface } : candidate);
    assert.equal(bindHalfRectangularDuctIntersection(source, box, { ...result, faces }, 1e-6), undefined);
  }
});
