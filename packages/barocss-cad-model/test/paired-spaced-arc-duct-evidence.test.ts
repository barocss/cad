import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, reverseCurve, transformBrep, type Brep, type CadPartDocument, type Curve, type Point } from '@barocss/cad';
import { pairedOppositeArcDuctEvidence, pairedSpacedArcDuctEvidence } from '../src/chat/pairedSpacedArcDuctEvidence';

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

function path(firstDegrees = 90, secondDegrees = 90, start: Point = [0, 0, 0], tangent: Point = [1, 0, 0], inward: Point = [0, 1, 0], turn = -1, run = 8): Path {
  const arc = (start: Point, tangent: Point, inward: Point, radius: number, degrees: number) => {
    const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    return { pole: add(start, scale(tangent, radius * Math.tan(angle / 2))),
      end: add(start, add(scale(tangent, radius * s), scale(inward, radius * (1 - c)))),
      tangent: add(scale(tangent, c), scale(inward, s)), inward: add(scale(inward, c), scale(tangent, -s)), weight: Math.cos(angle / 2) };
  };
  const first = arc(start, tangent, inward, 12, firstDegrees), secondStart = add(first.end, scale(first.tangent, run));
  const second = arc(secondStart, first.tangent, scale(first.inward, turn), 18, secondDegrees);
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

const directPath = () => path(90, 90, undefined, undefined, undefined, -1, 0);

test('direct opposite-turn review certifies 24 walls, two three-loop mouths and one twelve-edge charted join with independent mass', () => {
  const curve = directPath(), brep = native(curve), before = structuredClone({ brep, curve, source });
  const evidence = pairedOppositeArcDuctEvidence(brep, curve, source);
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
  pointNear(evidence.caps[0].center, [0, 0, 0]); pointNear(evidence.caps[1].center, [30, 30, 0]);
  pointNear(evidence.caps[0].plane.normal, [-1, 0, 0]); pointNear(evidence.caps[1].plane.normal, [1, 0, 0]);
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
  const centroid: Point = [18 - 12 / Math.PI, 12 + 12 / Math.PI, 0];
  pointNear(through.centroid.analytic, centroid); pointNear(through.centroid.native, centroid);
  assert.equal(through.volume.method, 'quadrature'); assert.ok(through.maximumGapMM < 1e-10);
  assert.deepEqual({ brep, curve, source }, before);
  assert.equal(pairedSpacedArcDuctEvidence(brep, curve, source), undefined);
  const spaced = path();
  assert.equal(pairedOppositeArcDuctEvidence(native(spaced), spaced, source), undefined);
  assert.equal(pairedOppositeArcDuctEvidence(native(spaced), curve, source), undefined);
});

test('direct asymmetric lanes retain native IDs, authored order, winding and the untouched lane', () => {
  const curve = directPath(), before = native(curve);
  const edited: Source = { ...source, cavities: [{ ...source.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, source.cavities[1]] };
  for (const section of [edited, { ...edited, cavities: [...edited.cavities].reverse() }]) for (const clockwise of [[true, false], [false, true]]) {
    const evidence = pairedOppositeArcDuctEvidence(native(curve, section, clockwise), curve, section);
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
  assert.equal(pairedOppositeArcDuctEvidence(before, curve, edited), undefined);
  assert.equal(pairedOppositeArcDuctEvidence(after, curve, source), undefined);
});

test('direct oblique 30 and 120 degree carriers certify rotated cap planes and radial sketch Y', () => {
  for (const [first, second] of [[30, 120], [120, 30], [120, 120]]) {
    const start: Point = [32, -14, 18], tangent: Point = [.6, .8, 0], inward: Point = [-.8, .6, 0];
    const curve = path(first, second, start, tangent, inward, -1, 0);
    const evidence = pairedOppositeArcDuctEvidence(native(curve), curve, source);
    assert.ok(evidence);
    near(evidence.throughApertures.volume.native, 32 * (12 * first + 18 * second) * Math.PI / 180);
    const angle = (first - second) * Math.PI / 180;
    pointNear(evidence.caps[0].plane.normal, scale(tangent, -1));
    pointNear(evidence.caps[1].plane.normal, add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle))));
    evidence.throughApertures.apertures.forEach((aperture, index) => aperture.axialInterval.forEach((value, axis) => near(value, [[1, 3], [-3, -1]][index][axis])));
  }
  const swapped = { ...source, outer: [10, 4], cavities: source.cavities.map(cavity => ({ ...cavity,
    min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
  })) };
  const curve = path(90, 90, [8, 3, -2], [0, 0, 1], [0, 1, 0], -1, 0);
  const evidence = pairedOppositeArcDuctEvidence(native(curve, swapped), curve, swapped);
  assert.ok(evidence); assert.deepEqual(evidence.throughApertures.dimensions.exterior, { radial: 4, axial: 10 });
});

test('direct reversed join curves retain the same charted native owner pairs', () => {
  const curve = directPath(), original = native(curve), evidence = pairedOppositeArcDuctEvidence(original, curve, source);
  assert.ok(evidence);
  const ids = new Set([...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]);
  const reverse = (curve: Curve) => reverseCurve(curve, { curveId: `${curve.id}_reversed` }).curve;
  const brep: Brep = { ...original, faces: [...original.faces].reverse(), loops: [...original.loops].reverse(),
    edges: original.edges.map(edge => ids.has(edge.id) ? { ...edge, curve: reverse(edge.curve), vertices: [edge.vertices[1], edge.vertices[0]] } : edge),
    coedges: original.coedges.map(use => ids.has(use.edge) ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: use.pcurve && reverse(use.pcurve) } : use),
  };
  assert.ok(checkBrep(brep, { strict: true }).valid); assert.ok(pairedOppositeArcDuctEvidence(brep, curve, source));
});

test('direct missing or shifted charts on each of the twelve joins fail closed; absent physical terminal charts remain qualified', () => {
  const curve = directPath(), original = native(curve), evidence = pairedOppositeArcDuctEvidence(original, curve, source);
  assert.ok(evidence);
  for (const id of [...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]) {
    const missing = { ...original, coedges: original.coedges.map(use => use.edge === id ? { ...use, pcurve: null } : use) };
    const shifted = { ...original, coedges: original.coedges.map(use => use.edge === id && use.pcurve ? { ...use,
      pcurve: { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]): Point => [u + .01, v, z]) } } : use) };
    for (const changed of [missing, shifted]) assert.equal(pairedOppositeArcDuctEvidence(changed, curve, source), undefined);
  }
  const terminal = new Set(evidence.caps.flatMap(cap => [...cap.outerEdges, ...cap.innerEdges]));
  assert.ok(pairedOppositeArcDuctEvidence({ ...original, coedges: original.coedges.map(use => terminal.has(use.edge) ? { ...use, pcurve: null } : use) }, curve, source));
});

test('direct same-turn, kinked, nonplanar, out-of-range and malformed rails fail closed', () => {
  const curve = directPath(), brep = native(curve), variants = [path(90, 90, undefined, undefined, undefined, 1, 0),
    path(29, 90, undefined, undefined, undefined, -1, 0), path(90, 121, undefined, undefined, undefined, -1, 0)];
  for (const [pole, axis, delta] of [[1, 1, .01], [2, 0, .01], [3, 2, .01], [4, 2, Number.NaN]]) {
    const changed = structuredClone(curve); changed.controlPoints[pole][axis] += delta; variants.push(changed);
  }
  variants.push({ ...curve, weights: [1, Math.SQRT1_2, 2, Math.SQRT1_2, 1] }, { ...curve, weights: [1, 0, 1, Math.SQRT1_2, 1] },
    { ...curve, knots: [0, 0, 0, 1, 1.1, 2, 2, 2] }, { ...curve, degree: 1 });
  for (const changed of variants) assert.equal(pairedOppositeArcDuctEvidence(brep, changed, source), undefined);
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
    assert.equal(pairedOppositeArcDuctEvidence(changed, curve, source), undefined);
});
