import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, type Brep, type CadPartDocument, type Curve, type Point } from '@barocss/cad';
import { pairedElbowInletOffsetEvidence, pairedElbowOutletOffsetEvidence } from '../src/chat/pairedElbowOutletOffsetEvidence';
import { pairedElbowInletProposal, pairedElbowOutletProposal, reviewedPairedElbowInletEvidence, reviewedPairedElbowOutletEvidence } from '../src/chat/pairedElbowOutletProposalReview';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { captureSignatures } from '../src/engine/references';
import type { Proposal } from '../src/engine/schema/proposals';
import { digestOf } from '../src/util/digest';
import { revisionOf } from '../src/util/revision';

type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;
const section = { outer: [4, 10], outerTags: ['e1', 'e2', 'e3', 'e4'], cavities: [
  { min: [-1, -3], max: [1, -1], tags: ['e5', 'e6', 'e7', 'e8'] },
  { min: [-1, 1], max: [1, 3], tags: ['e9', 'e10', 'e11', 'e12'] },
] };
const add = (a: Point, b: Point): Point => a.map((value, axis) => value + b[axis]) as Point;
const scale = (point: Point, factor: number): Point => point.map(value => value * factor) as Point;
const near = (actual: number, expected: number) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);

function rail(degrees = 90, entry: Point = [0, 0, 0], tangent: Point = [1, 0, 0], inward: Point = [0, 1, 0]): Path {
  const angle = degrees * Math.PI / 180;
  const end = add(entry, add(scale(tangent, 20 * Math.sin(angle)), scale(inward, 20 * (1 - Math.cos(angle)))));
  const terminal = add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle)));
  return { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3], weights: [1, 1, 1, Math.cos(angle / 2), 1, 1, 1], controlPoints: [
    add(entry, scale(tangent, -10)), add(entry, scale(tangent, -5)), entry,
    add(entry, scale(tangent, 20 * Math.tan(angle / 2))), end,
    add(end, scale(terminal, 7)), add(end, scale(terminal, 14)),
  ] };
}

function endedRail(firstDegrees = 90, secondDegrees = 90, entry: Point = [0, 0, 0], tangent: Point = [1, 0, 0], inward: Point = [0, 1, 0]): Path {
  const bend = (start: Point, tangent: Point, inward: Point, radius: number, degrees: number) => {
    const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
    return { pole: add(start, scale(tangent, radius * Math.tan(angle / 2))),
      end: add(start, add(scale(tangent, radius * s), scale(inward, radius * (1 - c)))),
      tangent: add(scale(tangent, c), scale(inward, s)), inward: add(scale(inward, c), scale(tangent, -s)), weight: Math.cos(angle / 2) };
  };
  const first = bend(entry, tangent, inward, 12, firstDegrees), secondStart = add(first.end, scale(first.tangent, 8));
  const second = bend(secondStart, first.tangent, scale(first.inward, -1), 18, secondDegrees);
  return { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5],
    weights: [1, 1, 1, first.weight, 1, 1, 1, second.weight, 1, 1, 1], controlPoints: [
      add(entry, scale(tangent, -10)), add(entry, scale(tangent, -5)), entry, first.pole, first.end,
      add(first.end, scale(first.tangent, 4)), secondStart, second.pole, second.end,
      add(second.end, scale(second.tangent, 3)), add(second.end, scale(second.tangent, 6)),
    ] };
}

function native(path: Path, distance?: number, source = section, inlet = false): Brep {
  const document: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-source.outer[0] / 2, -source.outer[1] / 2], max: [source.outer[0] / 2, source.outer[1] / 2],
      holes: source.cavities.map(({ min, max }, index) => {
        const points: [number, number][] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
        return (index ? points : [points[0], points[3], points[2], points[1]]).map(start => ({ kind: 'line', start }));
      }), sideTags: { outer: source.outerTags, holes: source.cavities.map(cavity => cavity.tags) } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', path, mode: 'exact' },
    ...(distance === undefined ? [] : [{ id: 'move', kind: 'offset-face' as const, target: 'w', face: `w.${inlet ? 'start' : 'end'}`, distance }]),
  ] };
  return evaluateCadPart(document).outputs[0].brep;
}

test('signed original outlet review binds both caps, both aperture lanes, retained joins and independently integrated material', () => {
  const path = rail(), original = native(path), saved = structuredClone({ original, path, section });
  const length = 24 + 10 * Math.PI, volume = 32 * length;
  const firstMoments = [32 * (230 + 400 + 19 / 12), 32 * (200 * Math.PI - 400 - 19 / 12 + 378), 0];
  for (const distance of [4, -4, 4]) {
    const candidate = native(path, distance), candidateBefore = structuredClone(candidate);
    const evidence = pairedElbowOutletOffsetEvidence(original, candidate, path, section, distance);
    assert.ok(evidence);
    assert.equal(evidence.face, 'w.end'); assert.equal(evidence.pathKind, 'line-arc-line');
    near(evidence.distance, distance); near(evidence.displacement.normal[1], 1); near(evidence.displacement.vector[1], distance);
    near(evidence.originalCap.center[1], 34); near(evidence.movedCap.center[1], 34 + distance);
    assert.deepEqual(evidence.originalCap.outerEdges, evidence.movedCap.outerEdges);
    assert.deepEqual(evidence.originalCap.innerEdges, evidence.movedCap.innerEdges);
    assert.deepEqual(evidence.movedCap.apertures.map(aperture => [aperture.edges.length, aperture.dimensions]), [
      [4, { radial: 2, axial: 2 }], [4, { radial: 2, axial: 2 }],
    ]);
    assert.deepEqual(evidence.retained.junctions!.map(join => join.pieces), [['line', 'bend'], ['bend', 'tail']]);
    assert.equal(new Set(evidence.retained.junctions!.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat()).size, 24);
    assert.equal(evidence.retained.faces.length, 25);
    near(evidence.throughApertures.dimensions.tailLength!, 14 + distance);
    near(evidence.materialChange.sectionArea, 32); near(evidence.materialChange.analytic, 32 * distance);
    near(evidence.materialChange.native, 32 * distance); assert.equal(evidence.materialChange.method, 'quadrature');
    near(evidence.volume.original.native, volume); near(evidence.volume.candidate.native, volume + 32 * distance);
    const prismCenter = [20, 34 + distance / 2, 0];
    evidence.centroid.native.forEach((value, axis) => near(value, (firstMoments[axis] + 32 * distance * prismCenter[axis]) / (volume + 32 * distance)));
    assert.ok(evidence.maximumGapMM < 1e-10);
    assert.deepEqual(candidate, candidateBefore);
  }
  assert.deepEqual({ original, path, section }, saved);
});

test('signed outlet evidence retains asymmetric authored lane ownership, reordered lanes and translated sweep-limit frames', () => {
  const edited = { ...section, cavities: [{ ...section.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, section.cavities[1]] };
  for (const source of [edited, { ...edited, cavities: [...edited.cavities].reverse() }]) {
    const path = rail();
    for (const distance of [4, -4]) {
      const evidence = pairedElbowOutletOffsetEvidence(native(path, undefined, source), native(path, distance, source), path, source, distance);
      assert.ok(evidence);
      near(evidence.materialChange.sectionArea, 34.5); near(evidence.materialChange.native, 34.5 * distance);
      assert.deepEqual(evidence.movedCap.apertures.map(aperture => aperture.tags), source.cavities.map(cavity => cavity.tags));
      near(evidence.centroid.native[2], -5 / 34.5);
    }
  }
  for (const degrees of [30, 120]) for (const distance of [4, -4]) {
    const path = rail(degrees, [32, -14, 18], [.6, .8, 0], [-.8, .6, 0]);
    const evidence = pairedElbowOutletOffsetEvidence(native(path), native(path, distance), path, section, distance);
    assert.ok(evidence, `${degrees} degrees, ${distance} mm`);
    near(evidence.materialChange.native, 32 * distance);
  }
});

test('outlet evidence refuses changed signed intent, source, inlet, collapsed tail and nonfinite distances', () => {
  const path = rail(), original = native(path), candidate = native(path, 4);
  for (const distance of [0, -4, -14, -15, -13.99999, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(pairedElbowOutletOffsetEvidence(original, candidate, path, section, distance), undefined);
  assert.equal(pairedElbowOutletOffsetEvidence(original, original, path, section, 4), undefined);
  assert.equal(pairedElbowOutletOffsetEvidence(original, candidate, path, { ...section, outer: [4.1, 10] }, 4), undefined);
  const changed = structuredClone(path);
  changed.controlPoints[0][0] -= 1; changed.controlPoints[1][0] -= .5;
  const changedInlet = native(changed, 4);
  assert.ok(checkBrep(changedInlet, { strict: true }).valid);
  assert.equal(pairedElbowOutletOffsetEvidence(original, changedInlet, path, section, 4), undefined);
  assert.equal(pairedElbowOutletOffsetEvidence(original, candidate, changed, section, 4), undefined);
});

test('outlet review refuses unbound cap or join charts, swapped lane walls and changed retained native coefficients', () => {
  const path = rail(), original = native(path), candidate = native(path, -4);
  const evidence = pairedElbowOutletOffsetEvidence(original, candidate, path, section, -4);
  assert.ok(evidence);
  const affected = [evidence.movedCap.innerEdges, ...evidence.retained.junctions!.map(join => join.interiorSeams[0])];
  for (const ids of affected) {
    const edges = new Set(ids);
    const changed = { ...candidate, coedges: candidate.coedges.map(use => edges.has(use.edge) ? { ...use, pcurve: null } : use) };
    assert.equal(pairedElbowOutletOffsetEvidence(original, changed, path, section, -4), undefined);
  }
  const swapped = { ...candidate, faces: candidate.faces.map(face => {
    if (!face.name?.startsWith('w.tail.')) return face;
    const first = section.cavities[0].tags.findIndex(tag => face.name!.endsWith(`.side[${tag}]`));
    const second = section.cavities[1].tags.findIndex(tag => face.name!.endsWith(`.side[${tag}]`));
    return first >= 0 ? { ...face, name: face.name.replace(section.cavities[0].tags[first], section.cavities[1].tags[first]) }
      : second >= 0 ? { ...face, name: face.name.replace(section.cavities[1].tags[second], section.cavities[0].tags[second]) } : face;
  }) };
  assert.ok(checkBrep(swapped, { strict: true }).valid);
  assert.equal(pairedElbowOutletOffsetEvidence(original, swapped, path, section, -4), undefined);
  const [first, ...rest] = candidate.vertices;
  const changedTolerance = { ...candidate, vertices: [{ ...first, tolerance: first.tolerance * 2 }, ...rest] };
  assert.ok(checkBrep(changedTolerance, { strict: true }).valid);
  assert.equal(pairedElbowOutletOffsetEvidence(original, changedTolerance, path, section, -4), undefined);
});

function arcRail(degrees = 90, entry: Point = [0, 0, 0], tangent: Point = [1, 0, 0], inward: Point = [0, 1, 0]): Path {
  const forward = rail(degrees, entry, tangent, inward);
  return { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2], controlPoints: forward.controlPoints.slice(0, 5).reverse(), weights: forward.weights.slice(0, 5).reverse() };
}
const pointNear = (actual: Point, expected: Point) => actual.forEach((value, axis) => near(value, expected[axis]));

function refuseChangedCharts(original: Brep, candidate: Brep, path: Path, source: typeof section, distance: number,
  evidenceOf: (...args: Parameters<typeof pairedElbowOutletOffsetEvidence>) => unknown, ids: string[]) {
  for (const id of ids) for (const selected of candidate.coedges.filter(use => use.edge === id)) {
    const missing = { ...candidate, coedges: candidate.coedges.map(use => use.id === selected.id ? { ...use, pcurve: null } : use) };
    const shifted = { ...candidate, coedges: candidate.coedges.map(use => use.id === selected.id && use.pcurve ? { ...use,
      pcurve: { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]): Point => [u + .01, v, z]) } } : use) };
    for (const changed of [missing, shifted]) assert.equal(evidenceOf(original, changed, path, source, distance), undefined);
  }
}

test('arc-line signed outlet review retains the inlet and twelve charted joins with exact independent quarter moments', () => {
  const path = arcRail(), original = native(path), before = structuredClone({ path, original, section });
  for (const distance of [4, -4, 4]) {
    const candidate = native(path, distance), saved = structuredClone(candidate);
    const evidence = pairedElbowOutletOffsetEvidence(original, candidate, path, section, distance);
    assert.ok(evidence); assert.equal(evidence.pathKind, 'arc-and-line');
    assert.ok(evidence.retained.junctions);
    assert.equal(evidence.face, 'w.end'); near(evidence.distance, distance);
    pointNear(evidence.displacement.normal, [-1, 0, 0]); pointNear(evidence.displacement.vector, [-distance, 0, 0]);
    pointNear(evidence.originalCap.center, [-10, 0, 0]); pointNear(evidence.movedCap.center, [-10 - distance, 0, 0]);
    pointNear(evidence.retained.inlet.center, [20, 20, 0]); pointNear(evidence.retained.inlet.plane.normal, [0, 1, 0]);
    assert.deepEqual(evidence.retained.junctions.map(join => join.pieces), [['bend', 'line']]);
    assert.deepEqual(evidence.retained.junctions, evidence.throughApertures.junctions);
    assert.equal(new Set(evidence.retained.junctions.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat()).size, 12);
    assert.equal(evidence.retained.faces.length, 13);
    assert.deepEqual(evidence.originalCap.outerEdges, evidence.movedCap.outerEdges);
    assert.deepEqual(evidence.originalCap.innerEdges, evidence.movedCap.innerEdges);
    assert.deepEqual(evidence.movedCap.apertures.map(aperture => aperture.tags), section.cavities.map(cavity => cavity.tags));
    near(evidence.throughApertures.dimensions.tailLength!, 10 + distance);
    near(evidence.materialChange.sectionArea, 32); near(evidence.materialChange.analytic, 32 * distance); near(evidence.materialChange.native, 32 * distance);
    const length = 10 + 10 * Math.PI + distance;
    near(evidence.volume.candidate.native, 32 * length);
    const centroid: Point = [(350 + 19 / 12 - 10 * distance - distance ** 2 / 2) / length,
      (200 * Math.PI - 400 - 19 / 12) / length, 0];
    pointNear(evidence.centroid.analytic, centroid); pointNear(evidence.centroid.native, centroid);
    assert.deepEqual(candidate, saved);
  }
  assert.deepEqual({ path, original, section }, before);
});

test('arc-line outlet evidence preserves asymmetric lane order and translated 30 and 120 degree radial X and Y frames', () => {
  const edited = { ...section, cavities: [{ ...section.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, section.cavities[1]] };
  for (const source of [edited, { ...edited, cavities: [...edited.cavities].reverse() }]) for (const distance of [4, -4]) {
    const path = arcRail(), evidence = pairedElbowOutletOffsetEvidence(native(path, undefined, source), native(path, distance, source), path, source, distance);
    assert.ok(evidence); near(evidence.materialChange.native, 34.5 * distance); near(evidence.centroid.native[2], -5 / 34.5);
    assert.deepEqual(evidence.movedCap.apertures.map(aperture => aperture.tags), source.cavities.map(cavity => cavity.tags));
    for (const [index, cavity] of source.cavities.entries())
      pointNear(evidence.movedCap.apertures[index].center, add(evidence.movedCap.center, [0, 0, (cavity.min[1] + cavity.max[1]) / 2]));
  }
  const swapped = { ...section, outer: [10, 4], cavities: section.cavities.map(cavity => ({ ...cavity,
    min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
  })) };
  for (const degrees of [30, 120]) for (const radialY of [false, true]) for (const distance of [4, -4]) {
    const path = arcRail(degrees, [32, -14, 18], radialY ? [0, 0, 1] : [.6, .8, 0], radialY ? [0, 1, 0] : [-.8, .6, 0]);
    const source = radialY ? swapped : section;
    const evidence = pairedElbowOutletOffsetEvidence(native(path, undefined, source), native(path, distance, source), path, source, distance);
    assert.ok(evidence, `${degrees} radialY=${radialY} distance=${distance}`);
    near(evidence.materialChange.native, 32 * distance);
  }
});

test('arc-line outlet evidence refuses missing cap or join charts, swapped lanes, retained coefficient changes and wrong intent', () => {
  const path = arcRail(), original = native(path), candidate = native(path, -4);
  const evidence = pairedElbowOutletOffsetEvidence(original, candidate, path, section, -4);
  assert.ok(evidence);
  assert.ok(evidence.retained.junctions);
  const ids = [...evidence.originalCap.outerEdges, ...evidence.originalCap.innerEdges,
    ...evidence.retained.inlet.outerEdges, ...evidence.retained.inlet.innerEdges,
    ...evidence.retained.junctions.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat()];
  refuseChangedCharts(original, candidate, path, section, -4, pairedElbowOutletOffsetEvidence, ids);
  const swapped = { ...candidate, faces: candidate.faces.map(face => {
    if (!face.name?.startsWith('w.line.')) return face;
    const first = section.cavities[0].tags.findIndex(tag => face.name!.endsWith(`.side[${tag}]`));
    const second = section.cavities[1].tags.findIndex(tag => face.name!.endsWith(`.side[${tag}]`));
    return first >= 0 ? { ...face, name: face.name.replace(section.cavities[0].tags[first], section.cavities[1].tags[first]) }
      : second >= 0 ? { ...face, name: face.name.replace(section.cavities[1].tags[second], section.cavities[0].tags[second]) } : face;
  }) };
  assert.ok(checkBrep(swapped, { strict: true }).valid);
  assert.equal(pairedElbowOutletOffsetEvidence(original, swapped, path, section, -4), undefined);
  const retainedFace = candidate.faces.find(face => face.name?.startsWith('w.bend.') && face.surface.kind === 'surface')!;
  const coefficients = { ...candidate, faces: candidate.faces.map(face => face.id === retainedFace.id && face.surface.kind === 'surface'
    ? { ...face, surface: { ...face.surface, weights: face.surface.weights.map(row => row.map(weight => 2 * weight)) } } : face) };
  assert.ok(checkBrep(coefficients, { strict: true }).valid);
  assert.equal(pairedElbowOutletOffsetEvidence(original, coefficients, path, section, -4), undefined);
  for (const distance of [0, 4, -10, -11, -9.99999, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(pairedElbowOutletOffsetEvidence(original, candidate, path, section, distance), undefined);
  assert.equal(pairedElbowOutletOffsetEvidence(original, candidate, path, { ...section, outer: [4.1, 10] }, -4), undefined);
  const changedInlet = arcRail(30);
  assert.equal(pairedElbowOutletOffsetEvidence(original, native(changedInlet, -4), path, section, -4), undefined);
  const forward: Path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2], controlPoints: [...path.controlPoints].reverse(), weights: [...path.weights].reverse() };
  assert.equal(pairedElbowOutletOffsetEvidence(native(forward), candidate, forward, section, -4), undefined);
});

test('signed original inlet evidence binds both mouths, all twenty-four joins and independent quarter moments', () => {
  const path = rail(), original = native(path), saved = structuredClone({ original, path, section });
  for (const distance of [4, -4, 4]) {
    const candidate = native(path, distance, section, true), before = structuredClone(candidate);
    const evidence = pairedElbowInletOffsetEvidence(original, candidate, path, section, distance);
    assert.ok(evidence); assert.equal(evidence.pathKind, 'line-arc-line'); assert.equal(evidence.face, 'w.start');
    pointNear(evidence.displacement.normal, [-1, 0, 0]); pointNear(evidence.displacement.vector, [-distance, 0, 0]);
    pointNear(evidence.originalCap.center, [-10, 0, 0]); pointNear(evidence.movedCap.center, [-10 - distance, 0, 0]);
    pointNear(evidence.retained.outlet.center, [20, 34, 0]); pointNear(evidence.retained.outlet.plane.normal, [0, 1, 0]);
    assert.deepEqual(evidence.originalCap.outerEdges, evidence.movedCap.outerEdges);
    assert.deepEqual(evidence.originalCap.innerEdges, evidence.movedCap.innerEdges);
    assert.deepEqual(evidence.movedCap.apertures.map(aperture => aperture.tags), section.cavities.map(cavity => cavity.tags));
    assert.deepEqual(evidence.retained.junctions!.map(join => join.pieces), [['line', 'bend'], ['bend', 'tail']]);
    assert.deepEqual(evidence.retained.junctions, evidence.throughApertures.junctions);
    assert.equal(new Set(evidence.retained.junctions!.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat()).size, 24);
    assert.equal(evidence.retained.faces.length, 25);
    near(evidence.throughApertures.dimensions.leadLength!, 10 + distance); near(evidence.throughApertures.dimensions.tailLength!, 14);
    near(evidence.materialChange.sectionArea, 32); near(evidence.materialChange.analytic, 32 * distance); near(evidence.materialChange.native, 32 * distance);
    const length = 24 + 10 * Math.PI + distance;
    near(evidence.volume.candidate.native, 32 * length);
    // Lead moment is -50 - 10d - d²/2; bend and tail contribute 400 + 19/12 and 280.
    const centroid: Point = [(630 + 19 / 12 - 10 * distance - distance ** 2 / 2) / length, (200 * Math.PI - 22 - 19 / 12) / length, 0];
    pointNear(evidence.centroid.analytic, centroid); pointNear(evidence.centroid.native, centroid);
    assert.equal(evidence.materialChange.method, 'quadrature'); assert.ok(evidence.maximumGapMM < 1e-10);
    assert.equal(pairedElbowOutletOffsetEvidence(original, candidate, path, section, distance), undefined);
    assert.deepEqual(candidate, before);
  }
  assert.deepEqual({ original, path, section }, saved);
});

test('inlet evidence retains asymmetric lane order and translated 30 and 120 degree radial X and Y frames', () => {
  const edited = { ...section, cavities: [{ ...section.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, section.cavities[1]] };
  for (const lanes of [edited, { ...edited, cavities: [...edited.cavities].reverse() }]) {
    const radialYSource = { ...lanes, outer: [10, 4], cavities: lanes.cavities.map(cavity => ({ ...cavity,
      min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
    })) };
    for (const degrees of [30, 120]) for (const radialY of [false, true]) for (const distance of [4, -4]) {
      const path = rail(degrees, [32, -14, 18], radialY ? [0, 0, 1] : [.6, .8, 0], radialY ? [0, 1, 0] : [-.8, .6, 0]);
      const source = radialY ? radialYSource : lanes;
      const evidence = pairedElbowInletOffsetEvidence(native(path, undefined, source), native(path, distance, source, true), path, source, distance);
      assert.ok(evidence, `${degrees} radialY=${radialY} distance=${distance}`);
      near(evidence.materialChange.sectionArea, 34.5); near(evidence.materialChange.native, 34.5 * distance);
      near(evidence.throughApertures.dimensions.leadLength!, 10 + distance); near(evidence.throughApertures.dimensions.tailLength!, 14);
      assert.deepEqual(evidence.movedCap.apertures.map(aperture => aperture.tags), source.cavities.map(cavity => cavity.tags));
    }
  }
});

test('inlet evidence refuses either chart at both mouths and all joins, changed retained coefficients and wrong signed intent', () => {
  const path = rail(), original = native(path), candidate = native(path, -4, section, true);
  const evidence = pairedElbowInletOffsetEvidence(original, candidate, path, section, -4); assert.ok(evidence);
  const ids = [...evidence.movedCap.outerEdges, ...evidence.movedCap.innerEdges,
    ...evidence.retained.outlet.outerEdges, ...evidence.retained.outlet.innerEdges,
    ...evidence.retained.junctions!.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat()];
  refuseChangedCharts(original, candidate, path, section, -4, pairedElbowInletOffsetEvidence, ids);
  const retainedFace = candidate.faces.find(face => face.name?.startsWith('w.bend.') && face.surface.kind === 'surface')!;
  const coefficients = { ...candidate, faces: candidate.faces.map(face => face.id === retainedFace.id && face.surface.kind === 'surface'
    ? { ...face, surface: { ...face.surface, weights: face.surface.weights.map(row => row.map(weight => 2 * weight)) } } : face) };
  assert.ok(checkBrep(coefficients, { strict: true }).valid);
  assert.equal(pairedElbowInletOffsetEvidence(original, coefficients, path, section, -4), undefined);
  const reordered = { ...candidate, faces: [...candidate.faces].reverse() };
  assert.ok(checkBrep(reordered, { strict: true }).valid);
  assert.equal(pairedElbowInletOffsetEvidence(original, reordered, path, section, -4), undefined);
  for (const distance of [0, 4, -10, -11, -9.99999, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(pairedElbowInletOffsetEvidence(original, candidate, path, section, distance), undefined);
  assert.equal(pairedElbowInletOffsetEvidence(original, native(path, -4), path, section, -4), undefined);
  assert.equal(pairedElbowInletOffsetEvidence(original, candidate, path, { ...section, outer: [4.1, 10] }, -4), undefined);
  const wrongOwners = { ...section, cavities: section.cavities.map((cavity, index) => ({ ...cavity, tags: section.cavities[1 - index].tags })) };
  assert.equal(pairedElbowInletOffsetEvidence(original, candidate, path, wrongOwners, -4), undefined);
  const changed = structuredClone(path); changed.controlPoints[5][1] += 2; changed.controlPoints[6][1] += 4;
  assert.equal(pairedElbowInletOffsetEvidence(original, native(changed, -4, section, true), path, section, -4), undefined);
  assert.equal(pairedElbowInletOffsetEvidence(original, candidate, changed, section, -4), undefined);
  for (const five of [arcRail(), { ...arcRail(), controlPoints: [...arcRail().controlPoints].reverse(), weights: [...arcRail().weights].reverse() }])
    assert.equal(pairedElbowInletOffsetEvidence(native(five), candidate, five, section, -4), undefined);
});

test('five-span signed outlet evidence retains its inlet, 49 native boundaries and all 48 tangent joints with independent material moments', () => {
  const path = endedRail(), original = native(path), saved = structuredClone({ path, original, section });
  for (const distance of [4, -4, 4]) {
    const candidate = native(path, distance), before = structuredClone(candidate);
    const evidence = pairedElbowOutletOffsetEvidence(original, candidate, path, section, distance); assert.ok(evidence);
    assert.equal(evidence.pathKind, 'line-arc-line-arc-line'); assert.equal(evidence.face, 'w.end');
    assert.deepEqual(Object.keys(evidence), ['pathKind', 'face', 'distance', 'displacement', 'originalCap', 'movedCap', 'retained',
      'throughApertures', 'materialChange', 'volume', 'centroid', 'maximumGapMM']);
    assert.deepEqual(checkBrep(candidate, { strict: true }).counts,
      { bodies: 1, shells: 1, faces: 62, loops: 66, coedges: 264, edges: 132, vertices: 72 });
    pointNear(evidence.displacement.normal, [1, 0, 0]); pointNear(evidence.displacement.vector, [distance, 0, 0]);
    pointNear(evidence.retained.inlet.center, [-10, 0, 0]); pointNear(evidence.retained.inlet.plane.normal, [-1, 0, 0]);
    pointNear(evidence.originalCap.center, [36, 38, 0]); pointNear(evidence.movedCap.center, [36 + distance, 38, 0]);
    assert.equal(evidence.retained.faces.length, 49);
    assert.ok(evidence.retained.faces.every(name => !name.startsWith('w.tail.') && name !== 'w.end'));
    assert.deepEqual(evidence.retained.junctions!.map(join => join.pieces), [['lead', 'first'], ['first', 'line'], ['line', 'second'], ['second', 'tail']]);
    const ids = evidence.retained.junctions!.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat();
    assert.equal(new Set(ids).size, 48);
    for (const id of [...ids, ...evidence.movedCap.outerEdges, ...evidence.movedCap.innerEdges,
      ...evidence.retained.inlet.outerEdges, ...evidence.retained.inlet.innerEdges])
      assert.equal(candidate.coedges.filter(use => use.edge === id && use.pcurve).length, 2);
    const dimensions = evidence.throughApertures.dimensions; assert.ok('leadLength' in dimensions);
    near(dimensions.leadLength!, 10); near(dimensions.tailLength!, 6 + distance);
    near(evidence.materialChange.sectionArea, 32); near(evidence.materialChange.analytic, 32 * distance); near(evidence.materialChange.native, 32 * distance);
    const length = 24 + 15 * Math.PI + distance;
    near(evidence.volume.candidate.native, 32 * length);
    const centroid: Point = [(270 * Math.PI + 64 + 36 * distance + distance ** 2 / 2) / length,
      (252 * Math.PI + 536 + 38 * distance) / length, 0];
    pointNear(evidence.centroid.analytic, centroid); pointNear(evidence.centroid.native, centroid);
    assert.equal(pairedElbowInletOffsetEvidence(original, candidate, path, section, distance), undefined);
    assert.deepEqual(candidate, before);
  }
  assert.deepEqual({ path, original, section }, saved);
});

test('five-span outlet evidence keeps asymmetric lane order, translated oblique limits and both radial axes and bend signs', () => {
  const edited = { ...section, cavities: [{ ...section.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, section.cavities[1]] };
  for (const lanes of [edited, { ...edited, cavities: [...edited.cavities].reverse() }])
    for (const [first, second] of [[30, 120], [120, 30], [120, 120]]) for (const radialY of [false, true]) for (const polarity of [-1, 1]) {
      const source = radialY ? { ...lanes, outer: [10, 4], cavities: lanes.cavities.map(cavity => ({ ...cavity,
        min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
      })) } : lanes;
      const path = endedRail(first, second, [32, -14, 18], radialY ? [0, 0, 1] : [.6, .8, 0],
        radialY ? [0, polarity, 0] : [-.8 * polarity, .6 * polarity, 0]);
      const original = native(path, undefined, source);
      for (const distance of [4, -4]) {
        const evidence = pairedElbowOutletOffsetEvidence(original, native(path, distance, source), path, source, distance);
        assert.ok(evidence, `${first}/${second}, radialY=${radialY}, polarity=${polarity}, d=${distance}`);
        near(evidence.materialChange.sectionArea, 34.5); near(evidence.materialChange.native, 34.5 * distance);
        assert.deepEqual(evidence.movedCap.apertures.map(aperture => aperture.tags), source.cavities.map(cavity => cavity.tags));
        assert.equal(evidence.retained.faces.length, 49);
      }
    }
});

test('five-span outlet evidence refuses either mouth chart, each retained joint chart, swapped tail lanes and changed retained coefficients', () => {
  const path = endedRail(), original = native(path), candidate = native(path, -4);
  const evidence = pairedElbowOutletOffsetEvidence(original, candidate, path, section, -4); assert.ok(evidence);
  const ids = [...evidence.movedCap.outerEdges, ...evidence.movedCap.innerEdges,
    ...evidence.retained.inlet.outerEdges, ...evidence.retained.inlet.innerEdges,
    ...evidence.retained.junctions!.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat()];
  refuseChangedCharts(original, candidate, path, section, -4, pairedElbowOutletOffsetEvidence, ids);
  const swapped = { ...candidate, faces: candidate.faces.map(face => face.name?.startsWith('w.tail.') ? { ...face,
    name: face.name.replace(/\[e([5-9]|1[0-2])\]/g, (_, tag: string) => `[e${Number(tag) < 9 ? Number(tag) + 4 : Number(tag) - 4}]`) } : face) };
  assert.ok(checkBrep(swapped, { strict: true }).valid);
  assert.equal(pairedElbowOutletOffsetEvidence(original, swapped, path, section, -4), undefined);
  const fixed = candidate.faces.find(face => face.name?.startsWith('w.first.') && face.surface.kind === 'surface')!;
  const coefficients = { ...candidate, faces: candidate.faces.map(face => face.id === fixed.id && face.surface.kind === 'surface'
    ? { ...face, surface: { ...face.surface, weights: face.surface.weights.map(row => row.map(weight => 2 * weight)) } } : face) };
  assert.ok(checkBrep(coefficients, { strict: true }).valid);
  assert.equal(pairedElbowOutletOffsetEvidence(original, coefficients, path, section, -4), undefined);
});

test('five-span outlet evidence refuses wrong original rail, alternate native output, collapsed tail and wrong signed intent', () => {
  const path = endedRail(), original = native(path), candidate = native(path, 4), saved = structuredClone({ path, original, candidate });
  for (const distance of [0, -4, -6, -7, -5.99999, Number.NaN, Number.POSITIVE_INFINITY, 10001])
    assert.equal(pairedElbowOutletOffsetEvidence(original, candidate, path, section, distance), undefined);
  const tail = structuredClone(path); tail.controlPoints[9][0] += 1; tail.controlPoints[10][0] += 2;
  const inlet = structuredClone(path); inlet.controlPoints[0][0] -= 2; inlet.controlPoints[1][0] -= 1;
  const tiny = structuredClone(path); tiny.controlPoints[10][1] += 1e-8; tiny.controlPoints[9] = scale(add(tiny.controlPoints[8], tiny.controlPoints[10]), .5);
  for (const changed of [tail, inlet, tiny, { ...path, weights: path.weights.map((weight, index) => index === 9 ? 2 : weight) }])
    assert.equal(pairedElbowOutletOffsetEvidence(original, candidate, changed, section, 4), undefined);
  for (const changed of [native(inlet, 4), native(path, 3), native(rail(), 4), original,
    native(path, 4, { ...section, cavities: [{ ...section.cavities[0], max: [1, -1.5] }, section.cavities[1]] })])
    assert.equal(pairedElbowOutletOffsetEvidence(original, changed, path, section, 4), undefined);
  assert.equal(pairedElbowOutletOffsetEvidence(native(rail()), candidate, path, section, 4), undefined);
  assert.equal(pairedElbowOutletOffsetEvidence(original, candidate, path, { ...section, outer: [4.1, 10] }, 4), undefined);
  assert.deepEqual({ path, original, candidate }, saved);
});

const railText = (path: Path) => `@model rails { version:0; length-unit:mm;
  @curve #rail { type:nurbs; degree:2; knots:${JSON.stringify(path.knots)};
    control-points:${JSON.stringify(path.controlPoints)}; weights:${JSON.stringify(path.weights)}; } }`;

function proposalFixture(retainedRail = false, inlet = false, distance = -4) {
  const path = inlet ? rail() : arcRail(), face = `n1.${inlet ? 'start' : 'end'}`;
  const plain = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [-2, -5], max: [2, 5],
    holes: section.cavities.map(({ min, max }, index) => {
      const points: [number, number][] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
      return (index ? points : [points[0], points[3], points[2], points[1]]).map(start => ({ kind: 'line' as const, start }));
    }), sideTags: { outer: section.outerTags, holes: section.cavities.map(cavity => cavity.tags) } }),
  { kind: 'sweep-curve', sketch: 0, name: 'Paired duct rail', path, mode: 'exact' });
  const base: StudioDoc = retainedRail ? { ...plain, direct: { sources: { rails: railText(path) },
    objects: [{ id: 'rail', name: 'Paired duct rail', source: 'rails', geometry: 'rail' }] } } : plain;
  const evaluated = evaluateDoc(base, 1); assert.ok(evaluated.ok, evaluated.ok ? '' : evaluated.error.detail);
  const candidate = captureSignatures(withNode(base, { kind: 'offset-face', parent: { node: 1, side: 'solid' }, faces: [face], distance }), evaluated.bodies);
  const proposal: Proposal = { id: 'P1', title: 'Move the straight outlet', status: 'open', by: { agent: 'chat' },
    at: '2026-11-23T00:00:00.000Z', base: 'test', summary: '1 added',
    ops: [{ tool: 'run_command', args: { command: 'offset-face', expectedRevision: revisionOf(base), faces: [face], values: { d: distance } } }],
    risk: { level: 'low', features_touched: 1, references_broken: 0, hard_requirements_changed: [], approval: [] } };
  return { base, candidate, proposal, bodies: evaluated.bodies, path };
}

for (const inlet of [false, true]) for (const retainedRail of [false, true]) test(`pending ${inlet ? 'line-arc-line inlet' : 'arc-line outlet'} review binds ${retainedRail ? 'the unchanged retained rail' : 'a no-rail document'} and refuses changed source or candidate pins`, async () => {
  const proposalOf = inlet ? pairedElbowInletProposal : pairedElbowOutletProposal;
  const review = inlet ? reviewedPairedElbowInletEvidence : reviewedPairedElbowOutletEvidence;
  const { base, candidate, proposal, bodies, path } = proposalFixture(retainedRail, inlet), before = structuredClone({ base, candidate });
  const edit = proposalOf(base, proposal); assert.ok(edit);
  const reviewed = await review(base, bodies, candidate, edit);
  assert.ok(reviewed && !('error' in reviewed));
  const evidence = 'pairedElbowInletOffset' in reviewed ? reviewed.pairedElbowInletOffset : reviewed.pairedElbowOutletOffset;
  assert.deepEqual([evidence.sourceBody, evidence.body, evidence.pathKind, evidence.face], ['b1', 'b2', inlet ? 'line-arc-line' : 'arc-and-line', inlet ? 'n1.start' : 'n1.end']);
  assert.deepEqual(Object.keys(evidence.retained), [inlet ? 'outlet' : 'inlet', 'junctions', 'faces']);
  if (retainedRail) assert.deepEqual(evidence.sourceRail, { path: 'rail', pathRevision: digestOf(path), directRevision: edit.directRevision });
  else assert.equal(evidence.sourceRail, undefined);
  assert.equal(await review(base, bodies, candidate, { ...edit, sourceRevision: 'stale' }), undefined);
  assert.ok(candidate.nextId !== undefined);
  assert.equal(await review(base, bodies, { ...candidate, nextId: candidate.nextId + 1 }, edit), undefined);
  const wrongFace = { ...proposal, ops: [{ ...proposal.ops[0], args: { ...proposal.ops[0].args, faces: [inlet ? 'n1.end' : 'n1.start'] } }] };
  assert.equal(proposalOf(base, wrongFace), undefined);
  if (retainedRail && base.direct) {
    const moved = structuredClone(path); moved.controlPoints[3][0] -= .5; moved.controlPoints[4][0] -= 1;
    const wrong: StudioDoc = { ...base, direct: { ...base.direct, sources: { rails: railText(moved) } } };
    const fresh = { ...proposal, ops: [{ ...proposal.ops[0], args: { ...proposal.ops[0].args, expectedRevision: revisionOf(wrong) } }] };
    const wrongEdit = proposalOf(wrong, fresh); assert.ok(wrongEdit);
    const wrongCandidate = { ...candidate, direct: wrong.direct };
    assert.deepEqual(await review(wrong, bodies, wrongCandidate, wrongEdit),
      { error: 'The retained Direct rail does not match the path copied into the Sweep.' });
    assert.equal(await review(wrong, bodies, wrongCandidate, edit), undefined);
  }
  if (inlet) {
    const extended = proposalFixture(retainedRail, true, 4), extendedEdit = pairedElbowInletProposal(extended.base, extended.proposal);
    assert.ok(extendedEdit);
    const positive = await reviewedPairedElbowInletEvidence(extended.base, extended.bodies, extended.candidate, extendedEdit);
    assert.ok(positive && !('error' in positive)); near(positive.pairedElbowInletOffset.materialChange.native, 128);
    const unrelated = proposalFixture(retainedRail);
    assert.equal(pairedElbowInletProposal(unrelated.base, { ...unrelated.proposal, ops: [{ ...unrelated.proposal.ops[0],
      args: { ...unrelated.proposal.ops[0].args, faces: ['n1.start'] } }] }), undefined);
  }
  assert.deepEqual({ base, candidate }, before);
});
