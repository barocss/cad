import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, reverseCurve, transformBrep, type Brep, type CadPartDocument, type Curve, type Point } from '@barocss/cad';
import { pairedArcLineDuctEvidence, pairedLineArcDuctEvidence } from '../src/chat/pairedLineArcDuctEvidence';

const source = { outer: [4, 10], outerTags: ['e1', 'e2', 'e3', 'e4'], cavities: [
  { min: [-1, -3], max: [1, -1], tags: ['e5', 'e6', 'e7', 'e8'] },
  { min: [-1, 1], max: [1, 3], tags: ['e9', 'e10', 'e11', 'e12'] },
] };
type Source = typeof source;
type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;
type ReviewedCap = NonNullable<ReturnType<typeof pairedLineArcDuctEvidence>>['caps'][number];
const add = (a: Point, b: Point): Point => a.map((value, axis) => value + b[axis]) as Point;
const scale = (point: Point, factor: number): Point => point.map(value => value * factor) as Point;
const near = (actual: number, expected: number) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);

function path(degrees = 90, entry: Point = [0, 0, 0], tangent: Point = [1, 0, 0], inward: Point = [0, 1, 0]): Path {
  const angle = degrees * Math.PI / 180;
  return { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2], weights: [1, 1, 1, Math.cos(angle / 2), 1], controlPoints: [
    add(entry, scale(tangent, -10)), add(entry, scale(tangent, -5)), entry,
    add(entry, scale(tangent, 20 * Math.tan(angle / 2))),
    add(entry, add(scale(tangent, 20 * Math.sin(angle)), scale(inward, 20 * (1 - Math.cos(angle))))),
  ] };
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

test('paired open evidence certifies both world-frame mouths, every authored lane, twelve joins, genus two and independent mass without mutation', () => {
  const curve = path(), brep = native(curve), before = structuredClone({ brep, curve, source });
  const evidence = pairedLineArcDuctEvidence(brep, curve, source);
  assert.ok(evidence);
  assert.equal(evidence.pathKind, 'line-and-arc');
  assert.deepEqual(checkBrep(brep, { strict: true }).topology.map(item => item.genus), [2]);
  assert.deepEqual(evidence.caps.map(cap => [cap.name, cap.outerEdges.length, cap.innerEdges.length]), [['w.start', 4, 8], ['w.end', 4, 8]]);
  const through = evidence.throughApertures;
  assert.deepEqual(through.dimensions.exterior, { radial: 4, axial: 10 });
  near(through.dimensions.pathRadius, 20); near(through.dimensions.leadLength, 10);
  near(through.dimensions.sweepRadians, Math.PI / 2); near(through.dimensions.axialWeb, 2);
  assert.equal(through.exteriorFaces.length, 8);
  assert.deepEqual(through.apertures.map(aperture => aperture.axialInterval), [[-3, -1], [1, 3]]);
  assert.deepEqual(through.apertures.map(aperture => aperture.index), [0, 1]);
  assert.equal(new Set([...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]).size, 12);
  const caps: readonly ReviewedCap[] = evidence.caps;
  for (const [index, aperture] of through.apertures.entries()) {
    assert.deepEqual(aperture.tags, source.cavities[index].tags);
    assert.equal(aperture.faces.length, 8); assert.equal(aperture.seams.length, 4);
    assert.deepEqual(aperture.dimensions, { radial: 2, axial: 2 });
    assert.deepEqual(aperture.seams, evidence.interiorSeams[index]);
    assert.ok(aperture.faces.every(name => aperture.tags.some(tag => name.endsWith(`.side[${tag}]`))));
    for (const cap of caps) {
      const mouth: ReviewedCap['apertures'][number] = cap.apertures[index];
      assert.deepEqual(mouth.tags, aperture.tags); assert.equal(mouth.edges.length, 4);
      assert.deepEqual(mouth.dimensions, aperture.dimensions); assert.deepEqual(mouth.axialInterval, aperture.axialInterval);
      near(mouth.center[2], index ? 2 : -2);
    }
  }
  near(evidence.caps[0].center[0], -10); near(evidence.caps[0].plane.normal[0], -1);
  near(evidence.caps[1].center[1], 20); near(evidence.caps[1].plane.normal[1], 1);
  near(through.volume.analytic, 32 * (10 + 10 * Math.PI)); near(through.volume.native, through.volume.analytic);
  assert.equal(through.volume.method, 'quadrature');
  through.centroid.native.forEach((value, axis) => near(value, through.centroid.analytic[axis]));
  assert.ok(through.maximumGapMM < 1e-10);
  assert.deepEqual({ brep, curve, source }, before);
});

test('an asymmetric aperture edit and reversed authored lane order retain lane ownership and the independent centroid', () => {
  const edited: Source = { ...source, cavities: [{ ...source.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, source.cavities[1]] };
  const curve = path(), evidence = pairedLineArcDuctEvidence(native(curve, edited), curve, edited);
  assert.ok(evidence);
  near(evidence.throughApertures.volume.native, 34.5 * (10 + 10 * Math.PI));
  near(evidence.throughApertures.centroid.native[2], -5 / 34.5);
  const reordered = { ...edited, cavities: [...edited.cavities].reverse() };
  for (const clockwise of [[true, false], [false, true]]) {
    const checked = pairedLineArcDuctEvidence(native(curve, reordered, clockwise), curve, reordered);
    assert.ok(checked);
    assert.deepEqual(checked.throughApertures.apertures.map(aperture => aperture.axialInterval), [[1, 3], [-2.5, -1.5]]);
    assert.deepEqual(checked.caps[1].apertures.map(aperture => aperture.dimensions), [{ radial: 2, axial: 2 }, { radial: 1.5, axial: 1 }]);
  }
});

test('translated 30 and 120 degree default frames and radial sketch Y use the source axes rather than world XY', () => {
  for (const degrees of [30, 120]) {
    const curve = path(degrees, [32, -14, 18], [.6, .8, 0], [-.8, .6, 0]);
    const evidence = pairedLineArcDuctEvidence(native(curve), curve, source);
    assert.ok(evidence, `${degrees} degrees`);
    assert.deepEqual(evidence.throughApertures.apertures.map(aperture => aperture.axialInterval), [[1, 3], [-3, -1]]);
    near(evidence.throughApertures.volume.native, 32 * (10 + 20 * degrees * Math.PI / 180));
  }
  const swapped = { ...source, outer: [10, 4], cavities: source.cavities.map(cavity => ({ ...cavity,
    min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
  })) };
  const curve = path(90, [8, 3, -2], [0, 0, 1], [0, 1, 0]);
  const evidence = pairedLineArcDuctEvidence(native(curve, swapped), curve, swapped);
  assert.ok(evidence);
  assert.deepEqual(evidence.throughApertures.dimensions.exterior, { radial: 4, axial: 10 });
  assert.deepEqual(evidence.throughApertures.apertures.map(aperture => aperture.axialInterval), [[1, 3], [-3, -1]]);
});

test('reversed native seam curves and arbitrary storage order preserve the same geometric proof', () => {
  const curve = path(), original = native(curve), evidence = pairedLineArcDuctEvidence(original, curve, source);
  assert.ok(evidence);
  const ids = new Set([...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]);
  const reverse = (curve: Curve) => reverseCurve(curve, { curveId: `${curve.id}_reversed` }).curve;
  const brep: Brep = { ...original,
    faces: [...original.faces].reverse(), loops: [...original.loops].reverse(),
    edges: original.edges.map(edge => ids.has(edge.id)
      ? { ...edge, curve: reverse(edge.curve), vertices: [edge.vertices[1], edge.vertices[0]] }
      : edge),
    coedges: original.coedges.map(use => ids.has(use.edge) ? { ...use, sense: use.sense === 'forward' ? 'reversed' as const : 'forward' as const,
      pcurve: use.pcurve && reverse(use.pcurve) } : use),
  };
  assert.ok(checkBrep(brep, { strict: true }).valid);
  assert.ok(pairedLineArcDuctEvidence(brep, curve, source));
});

test('an admitted rounded lead midpoint uses its half-sagitta bound and retains the exact native section proof', () => {
  const curve = path();
  curve.controlPoints[1][1] += 1.5e-7;
  const brep = native(curve), before = structuredClone({ curve, brep });
  assert.ok(checkBrep(brep, { strict: true }).valid);
  const evidence = pairedLineArcDuctEvidence(brep, curve, source);
  assert.ok(evidence);
  near(evidence.throughApertures.volume.native, 32 * (10 + 10 * Math.PI));
  assert.deepEqual({ curve, brep }, before);
  const outside = structuredClone(curve); outside.controlPoints[1][1] = 2.1e-7;
  assert.equal(pairedLineArcDuctEvidence(brep, outside, source), undefined);
});

test('a native-admitted rational weight correction uses geometric angle and a millimetre deviation bound', () => {
  const curve = path(); curve.weights[3] += 2e-9;
  const brep = native(curve), before = structuredClone({ curve, brep });
  assert.ok(checkBrep(brep, { strict: true }).valid);
  const evidence = pairedLineArcDuctEvidence(brep, curve, source);
  assert.ok(evidence);
  near(evidence.throughApertures.dimensions.sweepRadians, Math.PI / 2);
  near(evidence.throughApertures.volume.native, 32 * (10 + 10 * Math.PI));
  assert.deepEqual({ curve, brep }, before);
  const outside = structuredClone(curve); outside.weights[3] += 1e-7;
  assert.equal(pairedLineArcDuctEvidence(brep, outside, source), undefined);
});

test('changed source bounds, radial offset, aperture contact, duplicate tags and unsupported rails fail closed', () => {
  const curve = path(), brep = native(curve);
  const sources: Source[] = [{ ...source, outer: [4.1, 10] }, { ...source, outer: [4, Number.NaN] }, { ...source, outer: [4] },
    { ...source, cavities: [source.cavities[0]] }, { ...source, cavities: [...source.cavities, source.cavities[0]] },
    { ...source, outerTags: ['', ...source.outerTags.slice(1)] },
    { ...source, cavities: [{ ...source.cavities[0], min: [-.9, -3] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], min: [-2, -3] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], max: [1, 1] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], min: [-1, Number.POSITIVE_INFINITY] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], max: [1] }, source.cavities[1]] },
    { ...source, cavities: [source.cavities[0], { ...source.cavities[1], tags: source.cavities[0].tags }] },
    { ...source, cavities: source.cavities.map((cavity, index) => ({ ...cavity, tags: source.cavities[1 - index].tags })) },
  ];
  for (const changed of sources) assert.equal(pairedLineArcDuctEvidence(brep, curve, changed), undefined);
  const midpoint = structuredClone(curve); midpoint.controlPoints[1][1] += .01;
  const kink = structuredClone(curve); kink.controlPoints[3][2] += .01;
  const weight = structuredClone(curve); weight.weights[3] = .7;
  const arcFirst = { ...curve, controlPoints: [...curve.controlPoints].reverse(), weights: [...curve.weights].reverse() };
  for (const changed of [midpoint, kink, weight, arcFirst, path(29), path(121),
    { ...curve, knots: [0, 0, 0, 1, 1.1, 2, 2, 2] }, { ...curve, weights: [1, 1, 1, 0, 1] }])
    assert.equal(pairedLineArcDuctEvidence(brep, changed, source), undefined);
});

test('valid moved solids, swapped lane wall names, missing terminal charts and changed native ownership cannot receive evidence', () => {
  const curve = path(), brep = native(curve), evidence = pairedLineArcDuctEvidence(brep, curve, source);
  assert.ok(evidence);
  const terminal = new Set(evidence.caps[1].innerEdges), seam = new Set(evidence.interiorSeams[0]);
  const swapped = { ...brep, faces: brep.faces.map(face => {
    const tags = source.cavities.map(cavity => cavity.tags.findIndex(tag => face.name?.endsWith(`.side[${tag}]`)));
    if (tags[0] >= 0) return { ...face, name: face.name!.replace(source.cavities[0].tags[tags[0]], source.cavities[1].tags[tags[0]]) };
    if (tags[1] >= 0) return { ...face, name: face.name!.replace(source.cavities[1].tags[tags[1]], source.cavities[0].tags[tags[1]]) };
    return face;
  }) };
  assert.ok(checkBrep(swapped, { strict: true }).valid);
  const moved = transformBrep(brep, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [1, 0, 0] });
  assert.ok(checkBrep(moved, { strict: true }).valid);
  const missingCap = { ...brep, coedges: brep.coedges.map(use => terminal.has(use.edge) ? { ...use, pcurve: null } : use) };
  const missingSeam = { ...brep, coedges: brep.coedges.map(use => seam.has(use.edge) ? { ...use, pcurve: null } : use) };
  const changedChart = { ...brep, coedges: brep.coedges.map(use => !terminal.has(use.edge) || !use.pcurve ? use : { ...use,
    pcurve: { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]): Point => [u + .01, v, z]) } }) };
  const changedNormal = { ...brep, faces: brep.faces.map(face => face.name === 'w.start'
    ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face) };
  for (const changed of [swapped, moved, missingCap, missingSeam, changedChart, changedNormal,
    { ...brep, source: { family: 'revolve', id: 'w' } },
    { ...brep, shells: [{ ...brep.shells[0], body: 'other' }] }, { ...brep, shells: [{ ...brep.shells[0], closed: false }] },
    { ...brep, bodies: [{ ...brep.bodies[0], shells: [] }] },
  ]) assert.equal(pairedLineArcDuctEvidence(changed, curve, source), undefined);
});

function elbow(degrees = 90, entry: Point = [0, 0, 0], tangent: Point = [1, 0, 0], inward: Point = [0, 1, 0]): Path {
  const lead = path(degrees, entry, tangent, inward), angle = degrees * Math.PI / 180;
  const exit = add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle))), end = lead.controlPoints[4];
  return { ...lead, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3], weights: [...lead.weights, 1, 1],
    controlPoints: [...lead.controlPoints, add(end, scale(exit, 7)), add(end, scale(exit, 14))] };
}

test('paired elbow certifies both physical mouths, both twelve-edge G1 junctions and independent volume and centroid', () => {
  const curve = elbow(), brep = native(curve), before = structuredClone({ brep, curve, source });
  const evidence = pairedLineArcDuctEvidence(brep, curve, source);
  assert.ok(evidence);
  assert.equal(evidence.pathKind, 'line-arc-line');
  const report = checkBrep(brep, { strict: true });
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 38, loops: 42, coedges: 168, edges: 84, vertices: 48 });
  assert.deepEqual(report.topology.map(item => item.genus), [2]);
  assert.deepEqual(evidence.caps.map(cap => [cap.name, cap.outerEdges.length, cap.innerEdges.length]), [['w.start', 4, 8], ['w.end', 4, 8]]);
  evidence.caps[0].center.forEach((value, axis) => near(value, [-10, 0, 0][axis]));
  evidence.caps[1].center.forEach((value, axis) => near(value, [20, 34, 0][axis]));
  evidence.caps[0].plane.normal.forEach((value, axis) => near(value, [-1, 0, 0][axis]));
  evidence.caps[1].plane.normal.forEach((value, axis) => near(value, [0, 1, 0][axis]));
  const through = evidence.throughApertures;
  near(through.dimensions.tailLength!, 14);
  assert.equal(through.exteriorFaces.length, 12);
  assert.deepEqual(through.apertures.map(aperture => [aperture.faces.length, aperture.seams.length]), [[12, 8], [12, 8]]);
  assert.equal(evidence.exteriorSeams.length, 8);
  assert.deepEqual(evidence.interiorSeams.map(ids => ids.length), [8, 8]);
  const junctions = through.junctions;
  assert.ok(junctions);
  assert.deepEqual(junctions.map(join => join.pieces), [['line', 'bend'], ['bend', 'tail']]);
  assert.equal(new Set(junctions.flatMap(join => [join.exteriorSeams, ...join.interiorSeams]).flat()).size, 24);
  for (const join of junctions) {
    assert.equal(join.exteriorSeams.length, 4);
    assert.deepEqual(join.interiorSeams.map(ids => ids.length), [4, 4]);
    for (const [lane, ids] of [join.exteriorSeams, ...join.interiorSeams].entries()) {
      const tags = lane ? source.cavities[lane - 1].tags : source.outerTags;
      for (const [side, id] of ids.entries()) {
        const edge = brep.edges.find(edge => edge.id === id)!;
        assert.ok(edge.name === join.pieces.map(piece => `w.${piece}.side[${tags[side]}]`).join('|')
          || edge.name === [...join.pieces].reverse().map(piece => `w.${piece}.side[${tags[side]}]`).join('|'));
      }
    }
  }
  const length = 24 + 10 * Math.PI;
  near(through.volume.native, 32 * length); near(through.volume.analytic, 32 * length);
  // Direct quarter-ring first moments: integral (R-q)^2 dq dz / A = R^2 + 19/12.
  // The two prisms contribute (-50,0) and (280,378) per unit section area.
  const centroid = [(230 + 400 + 19 / 12) / length, (200 * Math.PI - 400 - 19 / 12 + 378) / length, 0];
  through.centroid.native.forEach((value, axis) => near(value, centroid[axis]));
  through.centroid.analytic.forEach((value, axis) => near(value, centroid[axis]));
  assert.ok(through.maximumGapMM < 1e-10);
  assert.deepEqual({ brep, curve, source }, before);
});

test('paired elbow retains authored lane ownership for asymmetric edits, reordered holes and non-default world frames', () => {
  const edited: Source = { ...source, cavities: [{ ...source.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, source.cavities[1]] };
  const reordered = { ...edited, cavities: [...edited.cavities].reverse() };
  for (const section of [edited, reordered]) {
    const curve = elbow(), evidence = pairedLineArcDuctEvidence(native(curve, section, [false, true]), curve, section);
    assert.ok(evidence);
    near(evidence.throughApertures.volume.native, 34.5 * (24 + 10 * Math.PI));
    near(evidence.throughApertures.centroid.native[2], -5 / 34.5);
    assert.deepEqual(evidence.throughApertures.apertures.map(aperture => aperture.tags), section.cavities.map(cavity => cavity.tags));
  }
  for (const degrees of [30, 120]) {
    const curve = elbow(degrees, [32, -14, 18], [.6, .8, 0], [-.8, .6, 0]);
    const evidence = pairedLineArcDuctEvidence(native(curve), curve, source);
    assert.ok(evidence, `${degrees} degrees`);
    near(evidence.throughApertures.volume.native, 32 * (24 + 20 * degrees * Math.PI / 180));
  }
  const swapped = { ...source, outer: [10, 4], cavities: source.cavities.map(cavity => ({ ...cavity,
    min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
  })) };
  const curve = elbow(90, [8, 3, -2], [0, 0, 1], [0, 1, 0]);
  assert.ok(pairedLineArcDuctEvidence(native(curve, swapped), curve, swapped));
});

test('paired elbow handles reversed seam storage and refuses missing charts, wrong lane walls and changed tail geometry', () => {
  const curve = elbow(), original = native(curve), evidence = pairedLineArcDuctEvidence(original, curve, source);
  assert.ok(evidence?.throughApertures.junctions);
  const reverse = (curve: Curve) => reverseCurve(curve, { curveId: `${curve.id}_reversed` }).curve;
  const ids = new Set([...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]);
  const reversed: Brep = { ...original, faces: [...original.faces].reverse(), loops: [...original.loops].reverse(),
    edges: original.edges.map(edge => ids.has(edge.id) ? { ...edge, curve: reverse(edge.curve), vertices: [edge.vertices[1], edge.vertices[0]] } : edge),
    coedges: original.coedges.map(use => ids.has(use.edge) ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: use.pcurve && reverse(use.pcurve) } : use),
  };
  assert.ok(checkBrep(reversed, { strict: true }).valid);
  assert.ok(pairedLineArcDuctEvidence(reversed, curve, source));
  for (const affected of [evidence.caps[1].innerEdges, ...evidence.throughApertures.junctions.map(join => join.interiorSeams[0])]) {
    const selected = new Set(affected);
    const missing = { ...original, coedges: original.coedges.map(use => selected.has(use.edge) ? { ...use, pcurve: null } : use) };
    const shifted = { ...original, coedges: original.coedges.map(use => selected.has(use.edge) && use.pcurve ? { ...use,
      pcurve: { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]): Point => [u + .01, v, z]) } } : use) };
    for (const brep of [missing, shifted]) assert.equal(pairedLineArcDuctEvidence(brep, curve, source), undefined);
  }
  const wrongTail = { ...original, faces: original.faces.map(face => {
    if (!face.name?.startsWith('w.tail.')) return face;
    const tag = source.cavities[0].tags.findIndex(tag => face.name!.endsWith(`.side[${tag}]`));
    const other = source.cavities[1].tags.findIndex(tag => face.name!.endsWith(`.side[${tag}]`));
    return tag >= 0 ? { ...face, name: face.name.replace(source.cavities[0].tags[tag], source.cavities[1].tags[tag]) }
      : other >= 0 ? { ...face, name: face.name.replace(source.cavities[1].tags[other], source.cavities[0].tags[other]) } : face;
  }) };
  assert.ok(checkBrep(wrongTail, { strict: true }).valid);
  assert.equal(pairedLineArcDuctEvidence(wrongTail, curve, source), undefined);
  const moved = transformBrep(original, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0, .01, 0] });
  assert.equal(pairedLineArcDuctEvidence(moved, curve, source), undefined);
  const variants: Path[] = [];
  for (const [pole, axis, delta] of [[5, 0, .01], [6, 0, .01], [6, 1, -28], [6, 1, .01], [6, 2, Number.NaN]]) {
    const changed = structuredClone(curve); changed.controlPoints[pole][axis] += delta; variants.push(changed);
  }
  variants.push({ ...curve, weights: [...curve.weights.slice(0, 6), 2] },
    { ...curve, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3.1, 3.1] });
  for (const changed of variants) assert.equal(pairedLineArcDuctEvidence(original, changed, source), undefined);
  assert.equal(pairedLineArcDuctEvidence(original, curve, { ...source, outer: [4.1, 10] }), undefined);
});

function reversedPath(curve: Path): Path {
  const sum = curve.knots[0] + curve.knots[curve.knots.length - 1];
  return { ...curve, controlPoints: [...curve.controlPoints].reverse(), weights: [...curve.weights].reverse(),
    knots: [...curve.knots].reverse().map(knot => sum - knot) };
}
const pointNear = (actual: Point, expected: Point) => actual.forEach((value, axis) => near(value, expected[axis]));

test('arc-first paired evidence retains authored mouths, one twelve-edge join and independent material moments without mutation', () => {
  const curve = reversedPath(path()), brep = native(curve), before = structuredClone({ brep, curve, source });
  const evidence = pairedArcLineDuctEvidence(brep, curve, source);
  assert.ok(evidence); assert.equal(evidence.pathKind, 'arc-and-line');
  assert.deepEqual(checkBrep(brep, { strict: true }).counts,
    { bodies: 1, shells: 1, faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 });
  const through = evidence.throughApertures, dimensions = through.dimensions;
  assert.deepEqual(Object.keys(dimensions), ['pathRadius', 'tailLength', 'sweepRadians', 'exterior', 'axialWeb']);
  near(dimensions.pathRadius, 20); near(dimensions.tailLength, 10); near(dimensions.sweepRadians, Math.PI / 2);
  assert.deepEqual(dimensions.exterior, { radial: 4, axial: 10 }); near(dimensions.axialWeb, 2);
  assert.deepEqual(through.junctions.map(join => join.pieces), [['bend', 'line']]);
  assert.equal(through.exteriorFaces.length, 8);
  assert.deepEqual(evidence.caps.map(cap => [cap.name, cap.outerEdges.length, cap.innerEdges.length]), [['w.start', 4, 8], ['w.end', 4, 8]]);
  pointNear(evidence.caps[0].center, [20, 20, 0]); pointNear(evidence.caps[1].center, [-10, 0, 0]);
  pointNear(evidence.caps[0].plane.normal, [0, 1, 0]); pointNear(evidence.caps[1].plane.normal, [-1, 0, 0]);
  assert.deepEqual(through.apertures.map(aperture => aperture.axialInterval), [[-3, -1], [1, 3]]);
  for (const [index, aperture] of through.apertures.entries()) {
    assert.deepEqual(aperture.tags, source.cavities[index].tags);
    assert.equal(aperture.faces.length, 8); assert.equal(aperture.seams.length, 4);
    assert.deepEqual(aperture.seams, evidence.interiorSeams[index]);
    for (const cap of evidence.caps) {
      assert.deepEqual(cap.apertures[index].tags, aperture.tags);
      pointNear(cap.apertures[index].center, add(cap.center, [0, 0, index ? 2 : -2]));
    }
  }
  const seams = [...evidence.exteriorSeams, ...evidence.interiorSeams.flat()];
  assert.equal(new Set(seams).size, 12);
  assert.deepEqual(through.junctions[0].exteriorSeams, evidence.exteriorSeams);
  assert.deepEqual(through.junctions[0].interiorSeams, evidence.interiorSeams);
  for (const id of [...seams, ...evidence.caps.flatMap(cap => [...cap.outerEdges, ...cap.innerEdges])])
    assert.ok(brep.coedges.filter(use => use.edge === id).every(use => use.pcurve));
  const length = 10 + 10 * Math.PI;
  near(through.volume.analytic, 32 * length); near(through.volume.native, 32 * length);
  // The normalized radial second moment q is 19/12 mm². The quarter bend's
  // X moment per unit section area is R²+q; add the straight prism's -50 mm².
  const centroid: Point = [(350 + 19 / 12) / length, (200 * Math.PI - 400 - 19 / 12) / length, 0];
  pointNear(through.centroid.analytic, centroid); pointNear(through.centroid.native, centroid);
  assert.ok(through.maximumGapMM < 1e-10); assert.deepEqual({ brep, curve, source }, before);
  assert.equal(pairedLineArcDuctEvidence(brep, curve, source), undefined);
  assert.equal(pairedArcLineDuctEvidence(native(), path(), source), undefined);
});

test('arc-first asymmetric lanes preserve signed source ownership, order, winding, all IDs and the other lane', () => {
  const curve = reversedPath(path()), before = native(curve);
  const edited: Source = { ...source, cavities: [{ ...source.cavities[0], min: [-.75, -2.5], max: [.75, -1.5] }, source.cavities[1]] };
  for (const section of [edited, { ...edited, cavities: [...edited.cavities].reverse() }]) for (const clockwise of [[true, false], [false, true]]) {
    const evidence = pairedArcLineDuctEvidence(native(curve, section, clockwise), curve, section);
    assert.ok(evidence);
    near(evidence.throughApertures.volume.native, 34.5 * (10 + 10 * Math.PI));
    near(evidence.throughApertures.centroid.native[2], -5 / 34.5);
    assert.deepEqual(evidence.throughApertures.apertures.map(aperture => aperture.tags), section.cavities.map(cavity => cavity.tags));
    for (const cap of evidence.caps) for (const [index, cavity] of section.cavities.entries())
      pointNear(cap.apertures[index].center, add(cap.center, [0, 0, (cavity.min[1] + cavity.max[1]) / 2]));
  }
  const after = native(curve, edited), tags = [...source.outerTags, ...source.cavities[1].tags];
  for (const key of ['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices'] as const)
    assert.deepEqual(after[key].map(item => item.id), before[key].map(item => item.id));
  const untouched = (brep: Brep) => brep.faces.filter(face => tags.some(tag => face.name?.endsWith(`.side[${tag}]`)));
  assert.deepEqual(untouched(after), untouched(before));
  assert.equal(pairedArcLineDuctEvidence(before, curve, edited), undefined);
  assert.equal(pairedArcLineDuctEvidence(after, curve, source), undefined);
});

test('arc-first translated oblique 30 and 120 degree frames and radial Y derive physical mouth centers from the authored sketch axes', () => {
  const swapped = { ...source, outer: [10, 4], cavities: source.cavities.map(cavity => ({ ...cavity,
    min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]],
  })) };
  for (const degrees of [30, 120]) for (const radialY of [false, true]) {
    const curve = reversedPath(path(degrees, [32, -14, 18], radialY ? [0, 0, 1] : [.6, .8, 0], radialY ? [0, 1, 0] : [-.8, .6, 0]));
    const section = radialY ? swapped : source, evidence = pairedArcLineDuctEvidence(native(curve, section), curve, section);
    assert.ok(evidence, `${degrees} radialY=${radialY}`);
    near(evidence.throughApertures.volume.native, 32 * (10 + 20 * degrees * Math.PI / 180));
    const unit = (vector: Point) => scale(vector, 1 / Math.hypot(...vector));
    const tangent = unit(add(curve.controlPoints[1], scale(curve.controlPoints[0], -1)));
    const dot = (a: Point, b: Point) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
    const project = (axis: Point) => add(axis, scale(tangent, -dot(axis, tangent)));
    const projectedX = project([1, 0, 0]), x = unit(Math.hypot(...projectedX) < 1e-6 ? project([0, 1, 0]) : projectedX);
    const axial: Point = radialY ? x : [tangent[1] * x[2] - tangent[2] * x[1], tangent[2] * x[0] - tangent[0] * x[2], tangent[0] * x[1] - tangent[1] * x[0]];
    for (const cap of evidence.caps) for (const [index, cavity] of section.cavities.entries()) {
      const axis = radialY ? 0 : 1, offset = (cavity.min[axis] + cavity.max[axis]) / 2;
      pointNear(cap.apertures[index].center, add(cap.center, scale(axial, offset)));
    }
    pointNear(evidence.caps[0].plane.normal, scale(tangent, -1));
    pointNear(evidence.caps[1].plane.normal, unit(add(curve.controlPoints[4], scale(curve.controlPoints[3], -1))));
  }
});

test('arc-first exact reversal retains nonuniform knot domains, admitted midpoint sagitta and rational weight corrections', () => {
  const original = { ...path(), knots: [-3, -3, -3, 1, 1, 2, 2, 2] }, curve = reversedPath(original);
  assert.ok(pairedArcLineDuctEvidence(native(curve), curve, source));
  for (const [index, delta] of [[3, 1.5e-7], [1, 2e-9]]) {
    const changed = structuredClone(curve);
    if (index === 3) changed.controlPoints[3][1] += delta; else changed.weights[1] += delta;
    assert.ok(pairedArcLineDuctEvidence(native(changed), changed, source));
  }
});

test('arc-first reversed native join storage retains the same reciprocal chart proof', () => {
  const curve = reversedPath(path()), original = native(curve), evidence = pairedArcLineDuctEvidence(original, curve, source);
  assert.ok(evidence); const ids = new Set([...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]);
  const reverse = (curve: Curve) => reverseCurve(curve, { curveId: `${curve.id}_reversed` }).curve;
  const brep: Brep = { ...original, faces: [...original.faces].reverse(), loops: [...original.loops].reverse(),
    edges: original.edges.map(edge => ids.has(edge.id) ? { ...edge, curve: reverse(edge.curve), vertices: [edge.vertices[1], edge.vertices[0]] } : edge),
    coedges: original.coedges.map(use => ids.has(use.edge) ? { ...use, sense: use.sense === 'forward' ? 'reversed' : 'forward', pcurve: use.pcurve && reverse(use.pcurve) } : use),
  };
  assert.ok(checkBrep(brep, { strict: true }).valid); assert.ok(pairedArcLineDuctEvidence(brep, curve, source));
});

test('arc-first missing and displaced charts on either physical cap and every join fail closed', () => {
  const curve = reversedPath(path()), original = native(curve), evidence = pairedArcLineDuctEvidence(original, curve, source);
  assert.ok(evidence);
  for (const edge of [...evidence.caps.flatMap(cap => [...cap.outerEdges, ...cap.innerEdges]), ...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]) {
    const selected = original.coedges.find(use => use.edge === edge)!.id;
    const missing = { ...original, coedges: original.coedges.map(use => use.id === selected ? { ...use, pcurve: null } : use) };
    const shifted = { ...original, coedges: original.coedges.map(use => use.id === selected && use.pcurve ? { ...use,
      pcurve: { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]): Point => [u + .01, v, z]) } } : use) };
    for (const changed of [missing, shifted]) assert.equal(pairedArcLineDuctEvidence(changed, curve, source), undefined);
  }
});

test('arc-first moved or swapped native walls, wrong ownership and malformed copied rails cannot receive evidence', () => {
  const curve = reversedPath(path()), brep = native(curve);
  const swapped = { ...brep, faces: brep.faces.map(face => {
    const indices = source.cavities.map(cavity => cavity.tags.findIndex(tag => face.name?.endsWith(`.side[${tag}]`)));
    if (indices[0] >= 0) return { ...face, name: face.name!.replace(source.cavities[0].tags[indices[0]], source.cavities[1].tags[indices[0]]) };
    if (indices[1] >= 0) return { ...face, name: face.name!.replace(source.cavities[1].tags[indices[1]], source.cavities[0].tags[indices[1]]) };
    return face;
  }) };
  const moved = transformBrep(brep, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [1, 0, 0] });
  const normal = { ...brep, faces: brep.faces.map(face => face.name === 'w.start' ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face) };
  for (const changed of [swapped, moved, normal, { ...brep, source: { family: 'revolve', id: 'w' } },
    { ...brep, source: { family: 'sweep-curve', id: 'other' } }, { ...brep, shells: [{ ...brep.shells[0], body: 'other' }] }])
    assert.equal(pairedArcLineDuctEvidence(changed, curve, source), undefined);
  const variants = [reversedPath(path(29)), reversedPath(path(121)), path()];
  for (const [pole, axis, delta] of [[1, 2, .01], [3, 1, .01], [4, 2, Number.NaN]]) {
    const changed = structuredClone(curve); changed.controlPoints[pole][axis] += delta; variants.push(changed);
  }
  variants.push({ ...curve, weights: [1, .7, 1, 1, 1] }, { ...curve, knots: [0, 0, 0, 1, 1.1, 2, 2, 2] });
  for (const changed of variants) assert.equal(pairedArcLineDuctEvidence(brep, changed, source), undefined);
});
