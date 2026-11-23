import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, type Brep, type CadPartDocument, type Curve, type Point } from '@barocss/cad';
import { pairedElbowOutletOffsetEvidence } from '../src/chat/pairedElbowOutletOffsetEvidence';

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

function native(path: Path, distance?: number, source = section): Brep {
  const document: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-source.outer[0] / 2, -source.outer[1] / 2], max: [source.outer[0] / 2, source.outer[1] / 2],
      holes: source.cavities.map(({ min, max }, index) => {
        const points: [number, number][] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
        return (index ? points : [points[0], points[3], points[2], points[1]]).map(start => ({ kind: 'line', start }));
      }), sideTags: { outer: source.outerTags, holes: source.cavities.map(cavity => cavity.tags) } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', path, mode: 'exact' },
    ...(distance === undefined ? [] : [{ id: 'move', kind: 'offset-face' as const, target: 'w', face: 'w.end', distance }]),
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
