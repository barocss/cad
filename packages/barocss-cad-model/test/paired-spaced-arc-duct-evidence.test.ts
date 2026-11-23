import assert from 'node:assert/strict';
import test from 'node:test';
import { CadPartError, checkBrep, evaluateCadPart, reverseCurve, transformBrep, type Brep, type CadPartDocument, type Curve, type Point } from '@barocss/cad';
import { pairedEndedSpacedArcDuctEvidence, pairedLeadingSpacedArcDuctEvidence, pairedOppositeArcDuctEvidence, pairedSameTurnArcDuctEvidence, pairedSpacedArcDuctEvidence } from '../src/chat/pairedSpacedArcDuctEvidence';

const source = { outer: [4, 10], outerTags: ['e1', 'e2', 'e3', 'e4'], cavities: [
  { min: [-1, -3], max: [1, -1], tags: ['e5', 'e6', 'e7', 'e8'] },
  { min: [-1, 1], max: [1, 3], tags: ['e9', 'e10', 'e11', 'e12'] },
] };
type Source = typeof source;
type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;
const add = (a: Point, b: Point): Point => a.map((value, axis) => value + b[axis]) as Point;
const scale = (point: Point, factor: number): Point => point.map(value => value * factor) as Point;
const near = (actual: number, expected: number) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);
const pointNear = (actual: Point, expected: Point) => actual.forEach((value, axis) => near(value, expected[axis]));

function path(firstDegrees = 90, secondDegrees = 90, start: Point = [0, 0, 0], tangent: Point = [1, 0, 0], inward: Point = [0, 1, 0], turn = -1, run = 8, firstRadius = 12, secondRadius = 18): Path {
  const arc = (start: Point, tangent: Point, inward: Point, radius: number, degrees: number) => {
    const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    return { pole: add(start, scale(tangent, radius * Math.tan(angle / 2))),
      end: add(start, add(scale(tangent, radius * s), scale(inward, radius * (1 - c)))),
      tangent: add(scale(tangent, c), scale(inward, s)), inward: add(scale(inward, c), scale(tangent, -s)), weight: Math.cos(angle / 2) };
  };
  const first = arc(start, tangent, inward, firstRadius, firstDegrees), secondStart = add(first.end, scale(first.tangent, run));
  const second = arc(secondStart, first.tangent, scale(first.inward, turn), secondRadius, secondDegrees);
  if (run === 0) return { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2], weights: [1, first.weight, 1, second.weight, 1],
    controlPoints: [start, first.pole, first.end, second.pole, second.end] };
  return { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3], weights: [1, first.weight, 1, 1, 1, second.weight, 1],
    controlPoints: [start, first.pole, first.end, add(first.end, scale(first.tangent, run / 2)), secondStart, second.pole, second.end] };
}

function native(curve = path(), section = source, clockwise = [true, false]): Brep {
  const document: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-section.outer[0] / 2, -section.outer[1] / 2], max: [section.outer[0] / 2, section.outer[1] / 2],
      holes: section.cavities.map(({ min, max }, index) => {
        const points: [number, number][] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
        return (clockwise[index] ? [points[0], points[3], points[2], points[1]] : points).map(start => ({ kind: 'line', start }));
      }), sideTags: { outer: section.outerTags, holes: section.cavities.map(cavity => cavity.tags) } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', path: curve, mode: 'exact' },
  ] };
  return evaluateCadPart(document).outputs[0].brep;
}

function withLead(curve = path(90, 90, undefined, undefined, undefined, 1), length = 10): Path {
  const start = curve.controlPoints[0], handle = curve.controlPoints[1].map((value, axis) => value - start[axis]) as Point;
  const tangent = scale(handle, 1 / Math.hypot(...handle)), knot = curve.knots[0];
  return { degree: 2, knots: [knot - 1, knot - 1, knot - 1, ...curve.knots.slice(1)],
    weights: [curve.weights[0], curve.weights[0], ...curve.weights],
    controlPoints: [add(start, scale(tangent, -length)), add(start, scale(tangent, -length / 2)), ...curve.controlPoints] };
}

function withTail(curve = withLead(path()), length = 6): Path {
  const end = curve.controlPoints[curve.controlPoints.length - 1], previous = curve.controlPoints[curve.controlPoints.length - 2];
  const handle = end.map((value, axis) => value - previous[axis]) as Point, tangent = scale(handle, 1 / Math.hypot(...handle));
  const knot = curve.knots[curve.knots.length - 1], weight = curve.weights[curve.weights.length - 1];
  return { degree: 2, knots: [...curve.knots.slice(0, -1), knot + 1, knot + 1, knot + 1],
    weights: [...curve.weights, weight, weight],
    controlPoints: [...curve.controlPoints, add(end, scale(tangent, length / 2)), add(end, scale(tangent, length))] };
}

for (const turn of [-1, 1]) test(`spaced ${turn === 1 ? 'same-turn' : 'opposite-turn'} paired review certifies both mouths, all 36 walls and 24 charted joins with independent mass without mutation`, () => {
  const curve = path(90, 90, undefined, undefined, undefined, turn), brep = native(curve), before = structuredClone({ brep, curve, source });
  const evidence = pairedSpacedArcDuctEvidence(brep, curve, source);
  assert.ok(evidence);
  assert.equal(evidence.pathKind, 'arc-line-arc');
  const report = checkBrep(brep, { strict: true });
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 38, loops: 42, coedges: 168, edges: 84, vertices: 48 });
  assert.deepEqual(report.topology.map(item => item.genus), [2]);
  const caps: NonNullable<ReturnType<typeof pairedSpacedArcDuctEvidence>>['caps'] = evidence.caps;
  assert.deepEqual(caps.map(cap => [cap.name, cap.outerEdges.length, cap.innerEdges.length]), [['w.start', 4, 8], ['w.end', 4, 8]]);
  pointNear(caps[0].center, [0, 0, 0]); pointNear(caps[1].center, [turn === 1 ? -6 : 30, 38, 0]);
  pointNear(caps[0].plane.normal, [-1, 0, 0]); pointNear(caps[1].plane.normal, [-turn, 0, 0]);
  const through = evidence.throughApertures;
  near(through.dimensions.firstRadius, 12); near(through.dimensions.secondRadius, 18); near(through.dimensions.lineLength, 8);
  near(through.dimensions.firstSweepRadians, Math.PI / 2); near(through.dimensions.secondSweepRadians, Math.PI / 2);
  assert.deepEqual(through.dimensions.exterior, { radial: 4, axial: 10 }); near(through.dimensions.axialWeb, 2);
  assert.equal(through.exteriorFaces.length, 12);
  assert.deepEqual(through.apertures.map(aperture => [aperture.index, aperture.axialInterval, aperture.faces.length, aperture.seams.length]),
    [[0, [-3, -1], 12, 8], [1, [1, 3], 12, 8]]);
  for (const [index, aperture] of through.apertures.entries()) {
    assert.deepEqual(aperture.tags, source.cavities[index].tags);
    assert.deepEqual(aperture.seams, evidence.interiorSeams[index]);
    assert.ok(aperture.faces.every(name => aperture.tags.some(tag => name.endsWith(`.side[${tag}]`))));
    for (const cap of caps) {
      const mouth = cap.apertures[index];
      assert.deepEqual(mouth.tags, aperture.tags); assert.deepEqual(mouth.dimensions, aperture.dimensions);
      assert.deepEqual(mouth.axialInterval, aperture.axialInterval); assert.equal(mouth.edges.length, 4);
      near(mouth.center[2], index ? 2 : -2);
    }
  }
  assert.deepEqual(through.junctions.map(join => join.pieces), [['first', 'line'], ['line', 'second']]);
  assert.equal(new Set(through.junctions.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat()).size, 24);
  for (const join of through.junctions) {
    assert.equal(join.exteriorSeams.length, 4); assert.deepEqual(join.interiorSeams.map(ids => ids.length), [4, 4]);
    for (const id of [join.exteriorSeams, ...join.interiorSeams].flat()) assert.ok(brep.coedges.filter(use => use.edge === id).every(use => use.pcurve));
  }
  const terminal = new Set(evidence.caps.flatMap(cap => [...cap.outerEdges, ...cap.innerEdges]));
  assert.ok(brep.coedges.some(use => terminal.has(use.edge) && !use.pcurve), 'physical revolved terminal charts remain inherited absent');
  const length = 15 * Math.PI + 8;
  near(through.volume.analytic, 32 * length); near(through.volume.native, 32 * length);
  // Sum the two quarter-annulus moments and the straight prism independently.
  // The section radial second moment per unit area is 19/12 mm². Its X terms
  // cancel for opposite turns and add twice for same turns; the Y terms cancel.
  const centroid: Point = [(turn === 1 ? 564 + 19 / 6 - 54 * Math.PI : 270 * Math.PI - 84) / length,
    (252 * Math.PI + 308) / length, 0];
  pointNear(through.centroid.analytic, centroid); pointNear(through.centroid.native, centroid);
  assert.equal(through.volume.method, 'quadrature'); assert.ok(through.maximumGapMM < 1e-10);
  assert.deepEqual({ brep, curve, source }, before);
});

for (const turn of [-1, 1]) test(`${turn === 1 ? 'same-turn' : 'opposite-turn'} asymmetric lanes and reversed authored order retain ownership, arbitrary winding and center of gravity`, () => {
  const edited: Source = { ...source, cavities: [{ ...source.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, source.cavities[1]] };
  for (const section of [edited, { ...edited, cavities: [...edited.cavities].reverse() }]) for (const clockwise of [[true, false], [false, true]]) {
    const curve = path(90, 90, undefined, undefined, undefined, turn), evidence = pairedSpacedArcDuctEvidence(native(curve, section, clockwise), curve, section);
    assert.ok(evidence);
    near(evidence.throughApertures.volume.native, 34.5 * (15 * Math.PI + 8));
    near(evidence.throughApertures.centroid.native[2], -5 / 34.5);
    assert.deepEqual(evidence.throughApertures.apertures.map(aperture => aperture.tags), section.cavities.map(cavity => cavity.tags));
    assert.deepEqual(evidence.caps[1].apertures.map(aperture => aperture.tags), section.cavities.map(cavity => cavity.tags));
  }
  const curve = path(90, 90, undefined, undefined, undefined, turn), before = native(curve), after = native(curve, edited);
  for (const key of ['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices'] as const)
    assert.deepEqual(after[key].map(item => item.id), before[key].map(item => item.id));
  const unchangedTags = [...source.outerTags, ...source.cavities[1].tags];
  const unchangedWalls = (brep: Brep) => brep.faces.filter(face => unchangedTags.some(tag => face.name?.endsWith(`.side[${tag}]`)));
  assert.deepEqual(unchangedWalls(after), unchangedWalls(before));
  assert.equal(pairedSpacedArcDuctEvidence(before, curve, edited), undefined);
  assert.equal(pairedSpacedArcDuctEvidence(after, curve, source), undefined);
});

for (const turn of [-1, 1]) test(`translated oblique ${turn === 1 ? 'same-turn' : 'opposite-turn'} 30 and 120 degree carriers and radial sketch Y use the source world frame`, () => {
  for (const [first, second] of [[30, 120], [120, 30]]) {
    const curve = path(first, second, [32, -14, 18], [.6, .8, 0], [-.8, .6, 0], turn);
    const evidence = pairedSpacedArcDuctEvidence(native(curve), curve, source);
    assert.ok(evidence);
    near(evidence.throughApertures.volume.native, 32 * (8 + (12 * first + 18 * second) * Math.PI / 180));
    evidence.throughApertures.apertures.forEach((aperture, index) => aperture.axialInterval.forEach((value, axis) => near(value, [[1, 3], [-3, -1]][index][axis])));
  }
  const swapped = { ...source, outer: [10, 4], cavities: source.cavities.map(cavity => ({ ...cavity,
    min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
  })) };
  const curve = path(90, 90, [8, 3, -2], [0, 0, 1], [0, 1, 0], turn);
  const evidence = pairedSpacedArcDuctEvidence(native(curve, swapped), curve, swapped);
  assert.ok(evidence); assert.deepEqual(evidence.throughApertures.dimensions.exterior, { radial: 4, axial: 10 });
});

for (const turn of [-1, 1]) test(`${turn === 1 ? 'same-turn' : 'opposite-turn'} reversed native join curves and arbitrary storage order retain both charted groups`, () => {
  const curve = path(90, 90, undefined, undefined, undefined, turn), original = native(curve), evidence = pairedSpacedArcDuctEvidence(original, curve, source);
  assert.ok(evidence);
  const ids = new Set([...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]);
  const reverse = (curve: Curve) => reverseCurve(curve, { curveId: `${curve.id}_reversed` }).curve;
  const brep: Brep = { ...original, faces: [...original.faces].reverse(), loops: [...original.loops].reverse(),
    edges: original.edges.map(edge => ids.has(edge.id) ? { ...edge, curve: reverse(edge.curve), vertices: [edge.vertices[1], edge.vertices[0]] } : edge),
    coedges: original.coedges.map(use => ids.has(use.edge) ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: use.pcurve && reverse(use.pcurve) } : use),
  };
  assert.ok(checkBrep(brep, { strict: true }).valid); assert.ok(pairedSpacedArcDuctEvidence(brep, curve, source));
});

for (const turn of [-1, 1]) test(`${turn === 1 ? 'same-turn' : 'opposite-turn'} missing or shifted charts at each of the 24 joins fail closed while absent terminal pairs remain qualified`, () => {
  const curve = path(90, 90, undefined, undefined, undefined, turn), original = native(curve), evidence = pairedSpacedArcDuctEvidence(original, curve, source);
  assert.ok(evidence);
  for (const join of evidence.throughApertures.junctions) for (const id of [join.exteriorSeams, ...join.interiorSeams].flat()) {
    const missing = { ...original, coedges: original.coedges.map(use => use.edge === id ? { ...use, pcurve: null } : use) };
    const shifted = { ...original, coedges: original.coedges.map(use => use.edge === id && use.pcurve ? { ...use,
      pcurve: { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]): Point => [u + .01, v, z]) } } : use) };
    for (const changed of [missing, shifted]) assert.equal(pairedSpacedArcDuctEvidence(changed, curve, source), undefined);
  }
  const terminal = new Set(evidence.caps.flatMap(cap => [...cap.outerEdges, ...cap.innerEdges]));
  const absent = { ...original, coedges: original.coedges.map(use => terminal.has(use.edge) ? { ...use, pcurve: null } : use) };
  assert.ok(pairedSpacedArcDuctEvidence(absent, curve, source));
});

for (const turn of [-1, 1]) test(`${turn === 1 ? 'same-turn' : 'opposite-turn'} moved geometry, swapped lane walls, wrong native ownership and changed source bounds fail closed`, () => {
  const curve = path(90, 90, undefined, undefined, undefined, turn), brep = native(curve);
  const swapped = { ...brep, faces: brep.faces.map(face => {
    const tags = source.cavities.map(cavity => cavity.tags.findIndex(tag => face.name?.endsWith(`.side[${tag}]`)));
    if (tags[0] >= 0) return { ...face, name: face.name!.replace(source.cavities[0].tags[tags[0]], source.cavities[1].tags[tags[0]]) };
    if (tags[1] >= 0) return { ...face, name: face.name!.replace(source.cavities[1].tags[tags[1]], source.cavities[0].tags[tags[1]]) };
    return face;
  }) };
  assert.ok(checkBrep(swapped, { strict: true }).valid);
  const moved = transformBrep(brep, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [1, 0, 0] });
  const normal = { ...brep, faces: brep.faces.map(face => face.name === 'w.end' ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face) };
  for (const changed of [swapped, moved, normal, { ...brep, source: { family: 'revolve', id: 'w' } },
    { ...brep, shells: [{ ...brep.shells[0], body: 'other' }] }, { ...brep, shells: [{ ...brep.shells[0], closed: false }] },
    { ...brep, bodies: [{ ...brep.bodies[0], shells: [] }] }]) assert.equal(pairedSpacedArcDuctEvidence(changed, curve, source), undefined);
  const sources: Source[] = [{ ...source, outer: [4.1, 10] }, { ...source, outer: [4, Number.NaN] }, { ...source, outer: [4] },
    { ...source, cavities: [source.cavities[0]] }, { ...source, cavities: [...source.cavities, source.cavities[0]] },
    { ...source, outerTags: ['', ...source.outerTags.slice(1)] },
    { ...source, cavities: [{ ...source.cavities[0], min: [-.9, -3] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], min: [-2, -3] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], max: [1, 1] }, source.cavities[1]] },
    { ...source, cavities: [source.cavities[0], { ...source.cavities[1], tags: source.cavities[0].tags }] }];
  for (const section of sources) assert.equal(pairedSpacedArcDuctEvidence(brep, curve, section), undefined);
});

for (const turn of [-1, 1]) test(`${turn === 1 ? 'same-turn' : 'opposite-turn'} out-of-range, kinked, malformed and displaced input rails cannot receive evidence`, () => {
  const curve = path(90, 90, undefined, undefined, undefined, turn), brep = native(curve);
  const variants: Path[] = [path(90, 90, undefined, undefined, undefined, -turn),
    path(29, 90, undefined, undefined, undefined, turn), path(90, 121, undefined, undefined, undefined, turn)];
  for (const [pole, axis, delta] of [[1, 1, .01], [3, 0, .01], [4, 0, .01], [5, 2, .01], [6, 2, Number.NaN]]) {
    const changed = structuredClone(curve); changed.controlPoints[pole][axis] += delta; variants.push(changed);
  }
  variants.push({ ...curve, weights: [...curve.weights.slice(0, 6), 2] }, { ...curve, weights: [1, 0, 1, 1, 1, .7, 1] },
    { ...curve, knots: [0, 0, 0, 1, 1.1, 2, 2, 3, 3, 3] });
  for (const changed of variants) assert.equal(pairedSpacedArcDuctEvidence(brep, changed, source), undefined);
});

const directPath = (turn = -1) => path(90, 90, undefined, undefined, undefined, turn, 0);
const directCases = [[-1, pairedOppositeArcDuctEvidence], [1, pairedSameTurnArcDuctEvidence]] as const;

for (const [turn, review] of directCases) test(`direct ${turn === 1 ? 'same-turn' : 'opposite-turn'} review certifies 24 walls, two three-loop mouths and one twelve-edge charted join with independent mass`, () => {
  const curve = directPath(turn), brep = native(curve), before = structuredClone({ brep, curve, source });
  const evidence = review(brep, curve, source);
  assert.ok(evidence);
  assert.equal(evidence.pathKind, 'two-arc');
  assert.deepEqual(checkBrep(brep, { strict: true }).counts,
    { bodies: 1, shells: 1, faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 });
  const dimensions = evidence.throughApertures.dimensions;
  assert.deepEqual(Object.keys(dimensions), ['firstRadius', 'secondRadius', 'firstSweepRadians', 'secondSweepRadians', 'exterior', 'axialWeb']);
  near(dimensions.firstRadius, 12); near(dimensions.secondRadius, 18);
  near(dimensions.firstSweepRadians, Math.PI / 2); near(dimensions.secondSweepRadians, Math.PI / 2);
  assert.deepEqual(dimensions.exterior, { radial: 4, axial: 10 }); near(dimensions.axialWeb, 2);
  assert.deepEqual(evidence.caps.map(cap => [cap.name, cap.outerEdges.length, cap.innerEdges.length]), [['w.start', 4, 8], ['w.end', 4, 8]]);
  pointNear(evidence.caps[0].center, [0, 0, 0]); pointNear(evidence.caps[1].center, [turn === 1 ? -6 : 30, 30, 0]);
  pointNear(evidence.caps[0].plane.normal, [-1, 0, 0]); pointNear(evidence.caps[1].plane.normal, [-turn, 0, 0]);
  const through = evidence.throughApertures;
  assert.equal(through.exteriorFaces.length, 8);
  assert.deepEqual(through.junctions.map(join => join.pieces), [['first', 'second']]);
  assert.deepEqual(through.apertures.map(aperture => [aperture.index, aperture.axialInterval, aperture.faces.length, aperture.seams.length]),
    [[0, [-3, -1], 8, 4], [1, [1, 3], 8, 4]]);
  const ids = [...evidence.exteriorSeams, ...evidence.interiorSeams.flat()];
  assert.equal(new Set(ids).size, 12);
  assert.deepEqual(through.junctions[0].exteriorSeams, evidence.exteriorSeams);
  assert.deepEqual(through.junctions[0].interiorSeams, evidence.interiorSeams);
  for (const id of ids) assert.ok(brep.coedges.filter(use => use.edge === id).every(use => use.pcurve));
  for (const [index, aperture] of through.apertures.entries()) {
    assert.deepEqual(aperture.tags, source.cavities[index].tags);
    assert.ok(aperture.faces.every(name => aperture.tags.some(tag => name.endsWith(`.side[${tag}]`))));
    for (const cap of evidence.caps) {
      assert.deepEqual(cap.apertures[index].tags, aperture.tags);
      assert.deepEqual(cap.apertures[index].axialInterval, aperture.axialInterval);
      pointNear(cap.apertures[index].center, add(cap.center, [0, 0, index ? 2 : -2]));
    }
  }
  near(through.volume.analytic, 480 * Math.PI); near(through.volume.native, 480 * Math.PI);
  const centroid: Point = [turn === 1 ? (468 + 19 / 6 - 54 * Math.PI) / (15 * Math.PI) : 18 - 12 / Math.PI, 12 + 12 / Math.PI, 0];
  pointNear(through.centroid.analytic, centroid); pointNear(through.centroid.native, centroid);
  assert.equal(through.volume.method, 'quadrature'); assert.ok(through.maximumGapMM < 1e-10);
  assert.deepEqual({ brep, curve, source }, before);
  assert.equal(pairedSpacedArcDuctEvidence(brep, curve, source), undefined);
  const spaced = path();
  assert.equal(review(native(spaced), spaced, source), undefined);
  assert.equal(review(native(spaced), curve, source), undefined);
});

for (const [turn, review] of directCases) test(`direct ${turn === 1 ? 'same-turn' : 'opposite-turn'} asymmetric lanes retain native IDs, authored order, winding and the untouched lane`, () => {
  const curve = directPath(turn), before = native(curve);
  const edited: Source = { ...source, cavities: [{ ...source.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, source.cavities[1]] };
  for (const section of [edited, { ...edited, cavities: [...edited.cavities].reverse() }]) for (const clockwise of [[true, false], [false, true]]) {
    const evidence = review(native(curve, section, clockwise), curve, section);
    assert.ok(evidence);
    near(evidence.throughApertures.volume.native, 34.5 * 15 * Math.PI);
    near(evidence.throughApertures.centroid.native[2], -5 / 34.5);
    assert.deepEqual(evidence.throughApertures.apertures.map(aperture => aperture.tags), section.cavities.map(cavity => cavity.tags));
    assert.deepEqual(evidence.caps[1].apertures.map(aperture => aperture.tags), section.cavities.map(cavity => cavity.tags));
  }
  const after = native(curve, edited), tags = [...source.outerTags, ...source.cavities[1].tags];
  for (const key of ['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices'] as const)
    assert.deepEqual(after[key].map(item => item.id), before[key].map(item => item.id));
  const walls = (brep: Brep) => brep.faces.filter(face => tags.some(tag => face.name?.endsWith(`.side[${tag}]`)));
  assert.deepEqual(walls(after), walls(before));
  assert.equal(review(before, curve, edited), undefined);
  assert.equal(review(after, curve, source), undefined);
});

for (const [turn, review] of directCases) test(`direct oblique ${turn === 1 ? 'same-turn' : 'opposite-turn'} 30 and 120 degree carriers certify rotated cap planes and radial sketch Y`, () => {
  for (const [first, second] of [[30, 120], [120, 30], [120, 120]]) {
    const start: Point = [32, -14, 18], tangent: Point = [.6, .8, 0], inward: Point = [-.8, .6, 0];
    const curve = path(first, second, start, tangent, inward, turn, 0);
    const evidence = review(native(curve), curve, source);
    assert.ok(evidence);
    near(evidence.throughApertures.volume.native, 32 * (12 * first + 18 * second) * Math.PI / 180);
    const angle = (first + turn * second) * Math.PI / 180;
    pointNear(evidence.caps[0].plane.normal, scale(tangent, -1));
    pointNear(evidence.caps[1].plane.normal, add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle))));
    evidence.throughApertures.apertures.forEach((aperture, index) => aperture.axialInterval.forEach((value, axis) => near(value, [[1, 3], [-3, -1]][index][axis])));
  }
  const swapped = { ...source, outer: [10, 4], cavities: source.cavities.map(cavity => ({ ...cavity,
    min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
  })) };
  const curve = path(90, 90, [8, 3, -2], [0, 0, 1], [0, 1, 0], turn, 0);
  const evidence = review(native(curve, swapped), curve, swapped);
  assert.ok(evidence); assert.deepEqual(evidence.throughApertures.dimensions.exterior, { radial: 4, axial: 10 });
});

for (const [turn, review] of directCases) test(`direct ${turn === 1 ? 'same-turn' : 'opposite-turn'} reversed join curves retain the same charted native owner pairs`, () => {
  const curve = directPath(turn), original = native(curve), evidence = review(original, curve, source);
  assert.ok(evidence);
  const ids = new Set([...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]);
  const reverse = (curve: Curve) => reverseCurve(curve, { curveId: `${curve.id}_reversed` }).curve;
  const brep: Brep = { ...original, faces: [...original.faces].reverse(), loops: [...original.loops].reverse(),
    edges: original.edges.map(edge => ids.has(edge.id) ? { ...edge, curve: reverse(edge.curve), vertices: [edge.vertices[1], edge.vertices[0]] } : edge),
    coedges: original.coedges.map(use => ids.has(use.edge) ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: use.pcurve && reverse(use.pcurve) } : use),
  };
  assert.ok(checkBrep(brep, { strict: true }).valid); assert.ok(review(brep, curve, source));
});

for (const [turn, review] of directCases) test(`direct ${turn === 1 ? 'same-turn' : 'opposite-turn'} missing or shifted charts on each of the twelve joins fail closed; absent physical terminal charts remain qualified`, () => {
  const curve = directPath(turn), original = native(curve), evidence = review(original, curve, source);
  assert.ok(evidence);
  for (const id of [...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]) {
    const missing = { ...original, coedges: original.coedges.map(use => use.edge === id ? { ...use, pcurve: null } : use) };
    const shifted = { ...original, coedges: original.coedges.map(use => use.edge === id && use.pcurve ? { ...use,
      pcurve: { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]): Point => [u + .01, v, z]) } } : use) };
    for (const changed of [missing, shifted]) assert.equal(review(changed, curve, source), undefined);
  }
  const terminal = new Set(evidence.caps.flatMap(cap => [...cap.outerEdges, ...cap.innerEdges]));
  assert.ok(review({ ...original, coedges: original.coedges.map(use => terminal.has(use.edge) ? { ...use, pcurve: null } : use) }, curve, source));
});

for (const [turn, review] of directCases) test(`direct ${turn === 1 ? 'same-turn' : 'opposite-turn'} wrong-turn, kinked, nonplanar, out-of-range and malformed rails fail closed`, () => {
  const curve = directPath(turn), brep = native(curve), variants = [path(90, 90, undefined, undefined, undefined, -turn, 0),
    path(29, 90, undefined, undefined, undefined, turn, 0), path(90, 121, undefined, undefined, undefined, turn, 0)];
  for (const [pole, axis, delta] of [[1, 1, .01], [2, 0, .01], [3, 2, .01], [4, 2, Number.NaN]]) {
    const changed = structuredClone(curve); changed.controlPoints[pole][axis] += delta; variants.push(changed);
  }
  variants.push({ ...curve, weights: [1, Math.SQRT1_2, 2, Math.SQRT1_2, 1] }, { ...curve, weights: [1, 0, 1, Math.SQRT1_2, 1] },
    { ...curve, knots: [0, 0, 0, 1, 1.1, 2, 2, 2] }, { ...curve, degree: 1 });
  for (const changed of variants) assert.equal(review(brep, changed, source), undefined);
  const moved = transformBrep(brep, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [1, 0, 0] });
  const swapped = { ...brep, faces: brep.faces.map(face => {
    const indices = source.cavities.map(cavity => cavity.tags.findIndex(tag => face.name?.endsWith(`.side[${tag}]`)));
    if (indices[0] >= 0) return { ...face, name: face.name!.replace(source.cavities[0].tags[indices[0]], source.cavities[1].tags[indices[0]]) };
    if (indices[1] >= 0) return { ...face, name: face.name!.replace(source.cavities[1].tags[indices[1]], source.cavities[0].tags[indices[1]]) };
    return face;
  }) };
  const normal = { ...brep, faces: brep.faces.map(face => face.name === 'w.end' ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face) };
  for (const changed of [moved, swapped, normal, { ...brep, source: { family: 'revolve', id: 'w' } },
    { ...brep, source: { family: 'sweep-curve', id: 'other' } }, { ...brep, shells: [{ ...brep.shells[0], body: 'other' }] }])
    assert.equal(review(changed, curve, source), undefined);
});

test('same-turn direct proof retains either radius order and genuine unequal carriers below the single-arc angle ceiling', () => {
  for (const [firstRadius, secondRadius] of [[12, 18], [18, 12], [12, 12 + 2e-7]]) {
    const curve = path(90, 90, undefined, undefined, undefined, 1, 0, firstRadius, secondRadius);
    const evidence = pairedSameTurnArcDuctEvidence(native(curve), curve, source);
    assert.ok(evidence);
    near(evidence.throughApertures.dimensions.firstRadius, firstRadius);
    near(evidence.throughApertures.dimensions.secondRadius, secondRadius);
    near(evidence.throughApertures.volume.native, 32 * (firstRadius + secondRadius) * Math.PI / 2);
  }
  const lowAngle = path(30, 30, undefined, undefined, undefined, 1, 0);
  assert.ok(pairedSameTurnArcDuctEvidence(native(lowAngle), lowAngle, source));
});

test('same-turn one-carrier and near-equal copied rails retain the actual native single-arc classification and cannot receive paired proof', () => {
  const paired = native(directPath(1));
  const disk = (curve: Path) => {
    const document: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
      { id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: .5 },
      { id: 'w', kind: 'sweep-curve', sketch: 's', path: curve, mode: 'exact' },
    ] };
    return evaluateCadPart(document).outputs[0].brep;
  };
  // The final radius gap is greater than linearTolerance. The whole 30+30 rail
  // still fits one carrier, so the kernel's earlier normalization must win.
  for (const [degrees, secondRadius] of [[45, 12], [30, 12 + 5e-8], [30, 12 + 1.25e-7]]) {
    const curve = path(degrees, degrees, undefined, undefined, undefined, 1, 0, 12, secondRadius), single = disk(curve);
    assert.ok(checkBrep(single, { strict: true }).valid);
    assert.equal(single.faces.length, 4);
    assert.throws(() => native(curve), error => error instanceof CadPartError && error.code === 'CAPABILITY' && /at most one circular hole/.test(error.message));
    assert.equal(pairedSameTurnArcDuctEvidence(paired, curve, source), undefined);
  }
  for (const secondRadius of [12, 12 + 5e-8]) {
    const curve = path(90, 90, undefined, undefined, undefined, 1, 0, 12, secondRadius);
    assert.throws(() => disk(curve), error => error instanceof CadPartError && error.code === 'CAPABILITY' && /one open circular arc/.test(error.message));
    assert.equal(pairedSameTurnArcDuctEvidence(paired, curve, source), undefined);
  }
});

for (const turn of [-1, 1]) test(`leading ${turn === 1 ? 'same-turn' : 'opposite-turn'} paired proof certifies 48 walls, both physical mouths, 36 charted joins and independent four-span moments`, () => {
  const curve = withLead(path(90, 90, undefined, undefined, undefined, turn)), brep = native(curve), saved = structuredClone({ brep, curve, source });
  const evidence = pairedLeadingSpacedArcDuctEvidence(brep, curve, source); assert.ok(evidence);
  assert.equal(evidence.pathKind, 'line-arc-line-arc');
  const report = checkBrep(brep, { strict: true });
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 50, loops: 54, coedges: 216, edges: 108, vertices: 60 });
  assert.deepEqual(report.topology.map(item => [item.shells, item.genus]), [[1, 2]]);
  assert.equal(evidence.throughApertures.exteriorFaces.length, 16);
  assert.deepEqual(evidence.throughApertures.apertures.map(aperture => [aperture.faces.length, aperture.seams.length]), [[16, 12], [16, 12]]);
  assert.deepEqual(evidence.throughApertures.junctions.map(join => join.pieces), [['lead', 'first'], ['first', 'line'], ['line', 'second']]);
  const seams = [...evidence.exteriorSeams, ...evidence.interiorSeams.flat()];
  assert.equal(new Set(seams).size, 36);
  for (const id of seams) assert.equal(brep.coedges.filter(use => use.edge === id && use.pcurve).length, 2);
  pointNear(evidence.caps[0].center, [-10, 0, 0]); pointNear(evidence.caps[1].center, [turn === 1 ? -6 : 30, 38, 0]);
  pointNear(evidence.caps[0].plane.normal, [-1, 0, 0]); pointNear(evidence.caps[1].plane.normal, [-turn, 0, 0]);
  for (const cap of evidence.caps) {
    assert.equal(cap.outerEdges.length, 4); assert.equal(cap.innerEdges.length, 8);
    assert.deepEqual(cap.apertures.map(aperture => aperture.tags), source.cavities.map(cavity => cavity.tags));
  }
  const inlet = new Set([...evidence.caps[0].outerEdges, ...evidence.caps[0].innerEdges]);
  const outlet = new Set([...evidence.caps[1].outerEdges, ...evidence.caps[1].innerEdges]);
  assert.equal(brep.coedges.filter(use => inlet.has(use.edge) && use.pcurve).length, 24);
  assert.equal(brep.coedges.filter(use => outlet.has(use.edge) && use.pcurve).length, 0);
  const through = evidence.throughApertures, length = 18 + 15 * Math.PI;
  near(through.dimensions.leadLength!, 10); near(through.dimensions.lineLength, 8);
  near(through.volume.analytic, 32 * length); near(through.volume.native, 2083.964473723095);
  const centroid: Point = [(turn === 1 ? 514 + 19 / 6 - 54 * Math.PI : 270 * Math.PI - 134) / length, (252 * Math.PI + 308) / length, 0];
  pointNear(through.centroid.analytic, centroid); pointNear(through.centroid.native, centroid);
  assert.ok(through.maximumGapMM < 1e-10);
  assert.equal(pairedSpacedArcDuctEvidence(brep, curve, source), undefined);
  assert.equal(pairedSameTurnArcDuctEvidence(brep, curve, source), undefined);
  assert.deepEqual({ brep, curve, source }, saved);
});

test('opposite-turn leading support proof admits the large second bend excluded by the same-turn support certificate', () => {
  const curve = withLead(path(120, 120, undefined, undefined, undefined, -1, 8, 12, 100));
  const evidence = pairedLeadingSpacedArcDuctEvidence(native(curve), curve, source); assert.ok(evidence);
  near(evidence.throughApertures.volume.native, 32 * (18 + 112 * 2 * Math.PI / 3));
  assert.equal(evidence.throughApertures.junctions.length, 3);
  assert.deepEqual(evidence.throughApertures.dimensions.exterior, { radial: 4, axial: 10 });
});

for (const turn of [-1, 1]) test(`leading ${turn === 1 ? 'same-turn' : 'opposite-turn'} review preserves asymmetric lane ownership, reordered source lanes, both radial axes and bend polarities at oblique limits`, () => {
  const edited: Source = { ...source, cavities: [{ ...source.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, source.cavities[1]] };
  for (const section of [edited, { ...edited, cavities: [...edited.cavities].reverse() }]) for (const polarity of [-1, 1]) {
    for (const [first, second] of [[30, 120], [120, 30]]) for (const radialY of [false, true]) {
      const input = radialY ? { ...section, outer: [10, 4], cavities: section.cavities.map(cavity => ({ ...cavity,
        min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
      })) } : section;
      const curve = withLead(path(first, second, [32, -14, 18], radialY ? [0, 0, 1] : [.6, .8, 0],
        radialY ? [0, polarity, 0] : [-.8 * polarity, .6 * polarity, 0], turn));
      const evidence = pairedLeadingSpacedArcDuctEvidence(native(curve, input, [false, true]), curve, input);
      assert.ok(evidence, `${first}/${second}, radialY=${radialY}, polarity=${polarity}`);
      near(evidence.throughApertures.volume.native, 34.5 * (18 + (12 * first + 18 * second) * Math.PI / 180));
      assert.deepEqual(evidence.throughApertures.apertures.map(aperture => aperture.tags), input.cavities.map(cavity => cavity.tags));
      for (const cap of evidence.caps) assert.deepEqual(cap.apertures.map(aperture => aperture.tags), input.cavities.map(cavity => cavity.tags));
      const rounded = { ...curve, weights: curve.weights.map(weight => Number(weight.toFixed(9))) };
      assert.ok(pairedLeadingSpacedArcDuctEvidence(native(rounded, input), rounded, input));
    }
  }
  const curve = withLead(path(90, 90, undefined, undefined, undefined, turn)), before = native(curve), after = native(curve, edited);
  for (const key of ['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices'] as const)
    assert.deepEqual(after[key].map(item => item.id), before[key].map(item => item.id));
  const tags = [...source.outerTags, ...source.cavities[1].tags];
  const retained = (brep: Brep) => brep.faces.filter(face => tags.some(tag => face.name?.endsWith(`.side[${tag}]`)));
  assert.deepEqual(retained(after), retained(before));
  assert.equal(pairedLeadingSpacedArcDuctEvidence(before, curve, edited), undefined);
  assert.equal(pairedLeadingSpacedArcDuctEvidence(after, curve, source), undefined);
});

for (const turn of [-1, 1]) test(`leading ${turn === 1 ? 'same-turn' : 'opposite-turn'} proof requires each stored chart at all 36 internal edges and all twelve inlet pairs while retaining the inherited outlet`, () => {
  const curve = withLead(path(90, 90, undefined, undefined, undefined, turn)), brep = native(curve), evidence = pairedLeadingSpacedArcDuctEvidence(brep, curve, source); assert.ok(evidence);
  const ids = [...evidence.exteriorSeams, ...evidence.interiorSeams.flat(), ...evidence.caps[0].outerEdges, ...evidence.caps[0].innerEdges];
  for (const id of ids) for (const selected of brep.coedges.filter(use => use.edge === id)) {
    const missing = { ...brep, coedges: brep.coedges.map(use => use.id === selected.id ? { ...use, pcurve: null } : use) };
    const shifted = { ...brep, coedges: brep.coedges.map(use => use.id === selected.id && use.pcurve ? { ...use,
      pcurve: { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]): Point => [u + .01, v, z]) } } : use) };
    for (const changed of [missing, shifted]) assert.equal(pairedLeadingSpacedArcDuctEvidence(changed, curve, source), undefined);
  }
  const outlet = new Set([...evidence.caps[1].outerEdges, ...evidence.caps[1].innerEdges]);
  assert.ok(pairedLeadingSpacedArcDuctEvidence({ ...brep, coedges: brep.coedges.map(use => outlet.has(use.edge) ? { ...use, pcurve: null } : use) }, curve, source));
  const reversed = new Set(ids), reverse = (curve: Curve) => reverseCurve(curve, { curveId: `${curve.id}_reversed` }).curve;
  const nativeOrder: Brep = { ...brep, faces: [...brep.faces].reverse(), loops: [...brep.loops].reverse(),
    edges: brep.edges.map(edge => reversed.has(edge.id) ? { ...edge, curve: reverse(edge.curve), vertices: [edge.vertices[1], edge.vertices[0]] } : edge),
    coedges: brep.coedges.map(use => reversed.has(use.edge) ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: use.pcurve && reverse(use.pcurve) } : use),
  };
  assert.ok(checkBrep(nativeOrder, { strict: true }).valid); assert.ok(pairedLeadingSpacedArcDuctEvidence(nativeOrder, curve, source));
});

for (const turn of [-1, 1]) test(`leading ${turn === 1 ? 'same-turn' : 'opposite-turn'} proof refuses mismatched native route, lane owners, mouth planes and material volume`, () => {
  const unled = path(90, 90, undefined, undefined, undefined, turn), curve = withLead(unled), brep = native(curve);
  const wrongRoute = { ...brep, faces: brep.faces.map(face => ({ ...face, name: face.name?.replace('.lead.', '.swap.').replace('.line.', '.lead.').replace('.swap.', '.line.') })) };
  const wrongLane = { ...brep, faces: brep.faces.map(face => face.name?.startsWith('w.lead.') ? { ...face,
    name: face.name.replace(/\[e([5-9]|1[0-2])\]/g, (_, tag: string) => `[e${Number(tag) < 9 ? Number(tag) + 4 : Number(tag) - 4}]`) } : face) };
  const wrongPlane = { ...brep, faces: brep.faces.map(face => face.name === 'w.start' ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face) };
  for (const changed of [wrongRoute, wrongLane, wrongPlane, native(withLead(unled, 12)), native(unled),
    native(withLead(path(90, 90, undefined, undefined, undefined, -turn))),
    transformBrep(brep, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [1, 0, 0] }),
    { ...brep, source: { family: 'revolve', id: 'w' } }, { ...brep, shells: [{ ...brep.shells[0], body: 'other' }] }])
    assert.equal(pairedLeadingSpacedArcDuctEvidence(changed, curve, source), undefined);
  const wrongMass = { ...source, cavities: [{ ...source.cavities[0], max: [1, -1.5] }, source.cavities[1]] };
  assert.equal(pairedLeadingSpacedArcDuctEvidence(native(curve, wrongMass), curve, source), undefined);
});

for (const turn of [-1, 1]) test(`leading ${turn === 1 ? 'same-turn' : 'opposite-turn'} copied-rail admission refuses malformed spans, mismatched turns, tiny kinks and radial offsets without widening source tolerances`, () => {
  const curve = withLead(path(90, 90, undefined, undefined, undefined, turn)), brep = native(curve), variants: Path[] = [path(), directPath(1),
    withLead(path(90, 90, undefined, undefined, undefined, -turn)),
    withLead(path(29, 90, undefined, undefined, undefined, turn)), withLead(path(90, 121, undefined, undefined, undefined, turn)),
    withLead(path(120, 120, undefined, undefined, undefined, 1, 8, 12, 100))];
  const kink = structuredClone(curve); kink.controlPoints[0][1] += 1e-8; kink.controlPoints[1] = scale(add(kink.controlPoints[0], kink.controlPoints[2]), .5);
  variants.push(kink);
  for (const [pole, axis, delta] of [[1, 1, .01], [3, 0, 1e-8], [5, 0, .01], [7, 2, .01], [8, 2, Number.NaN]]) {
    const changed = structuredClone(curve); changed.controlPoints[pole][axis] += delta; variants.push(changed);
  }
  const collapsed = structuredClone(curve); collapsed.controlPoints[0] = [...collapsed.controlPoints[2]]; collapsed.controlPoints[1] = [...collapsed.controlPoints[2]];
  variants.push(collapsed, { ...curve, knots: curve.knots.map((knot, index) => index === 4 ? knot + .1 : knot) },
    { ...curve, weights: curve.weights.map((weight, index) => index === 1 ? 2 : weight) });
  for (const changed of variants) assert.equal(pairedLeadingSpacedArcDuctEvidence(brep, changed, source), undefined);
  const offset = { ...source, cavities: [{ ...source.cavities[0], min: [-1 + 5e-8, -3], max: [1 + 5e-8, -1] }, source.cavities[1]] };
  assert.equal(pairedLeadingSpacedArcDuctEvidence(brep, curve, offset), undefined);
});

test('five-span opposite-turn paired evidence binds both charted mouths, 48 internal pairs and independent authored material moments', () => {
  for (const [firstRadius, secondRadius] of [[12, 18], [18, 12]]) {
    const curve = withTail(withLead(path(90, 90, undefined, undefined, undefined, -1, 8, firstRadius, secondRadius)));
    const brep = native(curve), saved = structuredClone({ brep, curve, source });
    const evidence = pairedEndedSpacedArcDuctEvidence(brep, curve, source); assert.ok(evidence);
    assert.equal(evidence.pathKind, 'line-arc-line-arc-line');
    const report = checkBrep(brep, { strict: true });
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 62, loops: 66, coedges: 264, edges: 132, vertices: 72 });
    assert.deepEqual(report.topology.map(item => [item.shells, item.genus]), [[1, 2]]);
    const through = evidence.throughApertures;
    assert.equal(through.exteriorFaces.length, 20);
    assert.deepEqual(through.apertures.map(aperture => [aperture.faces.length, aperture.seams.length]), [[20, 16], [20, 16]]);
    assert.deepEqual(through.junctions.map(join => join.pieces), [['lead', 'first'], ['first', 'line'], ['line', 'second'], ['second', 'tail']]);
    const seams = [...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]; assert.equal(new Set(seams).size, 48);
    for (const id of seams) assert.equal(brep.coedges.filter(use => use.edge === id && use.pcurve).length, 2);
    for (const [index, cap] of evidence.caps.entries()) {
      pointNear(cap.plane.normal, [index ? 1 : -1, 0, 0]);
      assert.equal(cap.outerEdges.length, 4); assert.equal(cap.innerEdges.length, 8);
      assert.deepEqual(cap.apertures.map(aperture => aperture.tags), source.cavities.map(cavity => cavity.tags));
      const ids = new Set([...cap.outerEdges, ...cap.innerEdges]);
      assert.equal(brep.coedges.filter(use => ids.has(use.edge) && use.pcurve).length, 24);
    }
    near(through.dimensions.leadLength!, 10); near(through.dimensions.tailLength!, 6); near(through.dimensions.lineLength, 8);
    const length = 24 + 15 * Math.PI;
    near(through.volume.analytic, 32 * length); near(through.volume.native, 32 * length);
    if (firstRadius === 12) {
      pointNear(evidence.caps[0].center, [-10, 0, 0]); pointNear(evidence.caps[1].center, [36, 38, 0]);
      // Add the six-millimetre prism at [33,38,0] to the independent four-span moments.
      const centroid: Point = [(270 * Math.PI + 64) / length, (252 * Math.PI + 536) / length, 0];
      pointNear(through.centroid.analytic, centroid); pointNear(through.centroid.native, centroid);
    }
    assert.ok(through.maximumGapMM < 1e-10);
    assert.equal(pairedLeadingSpacedArcDuctEvidence(brep, curve, source), undefined);
    assert.equal(pairedSpacedArcDuctEvidence(brep, curve, source), undefined);
    assert.deepEqual({ brep, curve, source }, saved);
  }
});

test('five-span review keeps asymmetric lane ownership, radial X and Y, both bend signs and oblique long-end separation', () => {
  const edited: Source = { ...source, cavities: [{ ...source.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, source.cavities[1]] };
  for (const section of [edited, { ...edited, cavities: [...edited.cavities].reverse() }])
    for (const [first, second] of [[30, 120], [120, 30], [120, 120]]) for (const radialY of [false, true]) for (const polarity of [-1, 1]) {
      const input = radialY ? { ...section, outer: [10, 4], cavities: section.cavities.map(cavity => ({ ...cavity,
        min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
      })) } : section;
      const curve = withTail(withLead(path(first, second, [32, -14, 18], radialY ? [0, 0, 1] : [.6, .8, 0],
        radialY ? [0, polarity, 0] : [-.8 * polarity, .6 * polarity, 0]), 80), 120);
      const evidence = pairedEndedSpacedArcDuctEvidence(native(curve, input, [false, true]), curve, input);
      assert.ok(evidence, `${first}/${second}, radialY=${radialY}, polarity=${polarity}`);
      near(evidence.throughApertures.volume.native, 34.5 * (208 + (12 * first + 18 * second) * Math.PI / 180));
      near(evidence.throughApertures.dimensions.tailLength!, 120);
      assert.deepEqual(evidence.throughApertures.apertures.map(aperture => aperture.tags), input.cavities.map(cavity => cavity.tags));
      for (const cap of evidence.caps) assert.deepEqual(cap.apertures.map(aperture => aperture.tags), input.cavities.map(cavity => cavity.tags));
    }
});

test('five-span evidence refuses every missing internal or physical mouth chart and shifted terminal charts', () => {
  const curve = withTail(), brep = native(curve), evidence = pairedEndedSpacedArcDuctEvidence(brep, curve, source); assert.ok(evidence);
  const ids = [...evidence.exteriorSeams, ...evidence.interiorSeams.flat(), ...evidence.caps.flatMap(cap => [...cap.outerEdges, ...cap.innerEdges])];
  assert.equal(new Set(ids).size, 72);
  for (const id of ids) for (const selected of brep.coedges.filter(use => use.edge === id)) {
    const missing = { ...brep, coedges: brep.coedges.map(use => use.id === selected.id ? { ...use, pcurve: null } : use) };
    assert.equal(pairedEndedSpacedArcDuctEvidence(missing, curve, source), undefined);
  }
  for (const id of [...evidence.caps[1].outerEdges, ...evidence.caps[1].innerEdges]) {
    const shifted = { ...brep, coedges: brep.coedges.map(use => use.edge === id && use.pcurve ? { ...use,
      pcurve: { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]): Point => [u + .01, v, z]) } } : use) };
    assert.equal(pairedEndedSpacedArcDuctEvidence(shifted, curve, source), undefined);
  }
});

test('five-span review refuses changed tail source, wrong tail owners and incompatible valid native outputs', () => {
  const curve = withTail(), brep = native(curve);
  const changedTail = withTail(undefined, 8), other = native(changedTail);
  assert.ok(checkBrep(other, { strict: true }).valid);
  assert.equal(pairedEndedSpacedArcDuctEvidence(other, curve, source), undefined);
  assert.equal(pairedEndedSpacedArcDuctEvidence(brep, changedTail, source), undefined);
  const wrongLane = { ...brep, faces: brep.faces.map(face => face.name?.startsWith('w.tail.') ? { ...face,
    name: face.name.replace(/\[e([5-9]|1[0-2])\]/g, (_, tag: string) => `[e${Number(tag) < 9 ? Number(tag) + 4 : Number(tag) - 4}]`) } : face) };
  const wrongPiece = { ...brep, faces: brep.faces.map(face => ({ ...face,
    name: face.name?.replace('.tail.', '.swap.').replace('.line.', '.tail.').replace('.swap.', '.line.') })) };
  for (const wrong of [wrongLane, wrongPiece]) {
    assert.ok(checkBrep(wrong, { strict: true }).valid);
    assert.equal(pairedEndedSpacedArcDuctEvidence(wrong, curve, source), undefined);
  }
  const wrongMass = { ...source, cavities: [{ ...source.cavities[0], max: [1, -1.5] }, source.cavities[1]] };
  for (const wrong of [native(withLead(path())), native(withLead()), native(curve, wrongMass),
    { ...brep, source: { family: 'revolve', id: 'w' } }, { ...brep, shells: [{ ...brep.shells[0], body: 'other' }] }])
    assert.equal(pairedEndedSpacedArcDuctEvidence(wrong, curve, source), undefined);
});

test('five-span copied-rail admission refuses same turns, malformed or reversed tails and tiny terminal kinks', () => {
  const curve = withTail(), brep = native(curve), variants: Path[] = [withLead(path()), path(), withTail(withLead()),
    withTail(undefined, .000099), withTail(undefined, -6)];
  const collapsed = structuredClone(curve); collapsed.controlPoints[9] = [...collapsed.controlPoints[8]]; collapsed.controlPoints[10] = [...collapsed.controlPoints[8]];
  const tiny = structuredClone(curve); tiny.controlPoints[10][1] += 1e-8; tiny.controlPoints[9] = scale(add(tiny.controlPoints[8], tiny.controlPoints[10]), .5);
  variants.push(collapsed, tiny, { ...curve, weights: curve.weights.map((weight, index) => index === 9 ? 2 : weight) },
    { ...curve, knots: curve.knots.map((knot, index) => index === 10 ? knot + .1 : knot) });
  for (const [pole, axis, delta] of [[9, 1, .01], [10, 2, Number.NaN], [7, 2, .01]]) {
    const changed = structuredClone(curve); changed.controlPoints[pole][axis] += delta; variants.push(changed);
  }
  for (const changed of variants) assert.equal(pairedEndedSpacedArcDuctEvidence(brep, changed, source), undefined);
});
