import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, transformBrep, type Brep, type CadPartDocument, type Curve } from '@barocss/cad';
import { closedPairedRectangularDuctEvidence } from '../src/chat/closedPairedRectangularDuctEvidence';

const source = { outer: [4, 10], outerTags: ['e1', 'e2', 'e3', 'e4'], cavities: [
  { min: [-1, -3], max: [1, -1], tags: ['e5', 'e6', 'e7', 'e8'] },
  { min: [-1, 1], max: [1, 3], tags: ['e9', 'e10', 'e11', 'e12'] },
] };
type Source = typeof source;
type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} vs ${expected}`);

function path(swapped = false, reversed = false): Path {
  const points: Curve['controlPoints'] = [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0],
    [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]];
  const controlPoints = swapped ? points.map(([x, y]): [number, number, number] => [0, x, y]) : points;
  return { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], controlPoints: reversed ? controlPoints.slice().reverse() : controlPoints,
    weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1] };
}

function native(curve = path(), section = source, clockwise = [true, false]): Brep {
  const document: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-section.outer[0] / 2, -section.outer[1] / 2], max: [section.outer[0] / 2, section.outer[1] / 2],
      holes: section.cavities.map(({ min, max }, i) => {
        const corners: [number, number][] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
        return (clockwise[i] ? [corners[0], corners[3], corners[2], corners[1]] : corners).map(start => ({ kind: 'line', start }));
      }), sideTags: { outer: section.outerTags, holes: section.cavities.map(cavity => cavity.tags) } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', path: curve, mode: 'exact' },
  ] };
  return evaluateCadPart(document).outputs[0].brep;
}

function reverseShell(brep: Brep, index: number): Brep {
  const faceIds = new Set(brep.shells[index].faces), loops = new Set(brep.faces.filter(face => faceIds.has(face.id)).flatMap(face => face.loops));
  const reverse = (sense: 'forward' | 'reversed') => sense === 'forward' ? 'reversed' as const : 'forward' as const;
  return { ...brep, faces: brep.faces.map(face => faceIds.has(face.id) ? { ...face, sense: reverse(face.sense) } : face),
    loops: brep.loops.map(loop => loops.has(loop.id) ? { ...loop, coedges: loop.coedges.slice().reverse() } : loop),
    coedges: brep.coedges.map(use => loops.has(use.loop) ? { ...use, sense: reverse(use.sense), next: use.prev, prev: use.next } : use) };
}

test('paired native evidence separately proves both inward cavities, native volumes, tagged ownership, charts and corners without mutation', t => {
  const curve = path(), brep = native(curve), before = structuredClone({ brep, curve, source });
  const evidence = closedPairedRectangularDuctEvidence(brep, curve, source);
  assert.ok(evidence);
  const closed = evidence.closedCavities;
  assert.equal(evidence.exteriorSeams.length, 8);
  assert.deepEqual(evidence.interiorSeams.map(seams => seams.length), [8, 8]);
  assert.equal(closed.exteriorFaces.length, 8);
  assert.equal(new Set([closed.exteriorShell, ...closed.cavities.map(cavity => cavity.shell)]).size, 3);
  assert.equal(new Set([...closed.exteriorFaces, ...closed.cavities.flatMap(cavity => cavity.faces)]).size, 24);
  assert.equal(new Set([...evidence.exteriorSeams, ...evidence.interiorSeams.flat()]).size, 24);
  assert.equal(new Set(closed.cavities.flatMap(cavity => cavity.corners)).size, 16);
  near(closed.dimensions.pathRadius, 20);
  assert.deepEqual(closed.dimensions.exterior, { radial: 4, axial: 10 });
  near(closed.dimensions.axialWeb, 2);
  assert.deepEqual(closed.cavities.map(cavity => cavity.axialInterval), [[1, 3], [-3, -1]]);
  for (const [index, cavity] of closed.cavities.entries()) {
    assert.equal(cavity.faces.length, 8);
    assert.equal(cavity.seams.length, 8);
    assert.equal(cavity.corners.length, 8);
    assert.deepEqual(cavity.dimensions, { radial: 2, axial: 2 });
    assert.ok(cavity.faces.every(name => source.cavities[index].tags.some(tag => name.startsWith(`w.side[${tag}]#`))));
    near(cavity.volume.analytic, 160 * Math.PI);
    near(cavity.volume.native, 160 * Math.PI);
    assert.equal(cavity.volume.method, 'quadrature');
  }
  near(closed.volume.analytic, 1280 * Math.PI);
  near(closed.volume.native, 1280 * Math.PI);
  assert.equal(closed.volume.method, 'quadrature');
  assert.ok(closed.maximumGapMM < 1e-10);
  assert.deepEqual({ brep, curve, source }, before);
  t.diagnostic(JSON.stringify(evidence));
});

test('a cavity height edit changes only its measured void volume and material total; differing widths, order and winding retain assignment', () => {
  const edited: Source = { ...source, cavities: [{ ...source.cavities[0], min: [-1, -2.5], max: [1, -1.5] }, source.cavities[1]] };
  const curve = path(), evidence = closedPairedRectangularDuctEvidence(native(curve, edited), curve, edited);
  assert.ok(evidence);
  assert.deepEqual(evidence.closedCavities.cavities.map(cavity => cavity.axialInterval), [[1.5, 2.5], [-3, -1]]);
  near(evidence.closedCavities.cavities[0].volume.native, 80 * Math.PI);
  near(evidence.closedCavities.cavities[1].volume.native, 160 * Math.PI);
  near(evidence.closedCavities.volume.native, 1360 * Math.PI);
  const reordered: Source = { ...source, cavities: [source.cavities[1], { ...source.cavities[0], min: [-.5, -3], max: [.5, -1] }] };
  for (const reversed of [false, true]) {
    const curve = path(false, reversed), checked = closedPairedRectangularDuctEvidence(native(curve, reordered, [false, true]), curve, reordered);
    assert.ok(checked);
    assert.deepEqual(checked.closedCavities.cavities.map(cavity => cavity.axialInterval), [[-3, -1], [1, 3]]);
    near(checked.closedCavities.cavities[0].volume.native, 160 * Math.PI);
    near(checked.closedCavities.cavities[1].volume.native, 80 * Math.PI);
    near(checked.closedCavities.volume.native, 1360 * Math.PI);
  }
});

test('swapped default radial axes and translated circles preserve signed native cavity bounds', () => {
  const swapped: Source = { outer: [10, 4], outerTags: source.outerTags, cavities: source.cavities.map(cavity => ({
    min: [cavity.min[1], cavity.min[0]], max: [cavity.max[1], cavity.max[0]], tags: cavity.tags,
  })) };
  for (const reversed of [false, true]) {
    const curve = path(true, reversed), evidence = closedPairedRectangularDuctEvidence(native(curve, swapped), curve, swapped);
    assert.ok(evidence);
    assert.deepEqual(evidence.closedCavities.dimensions.exterior, { radial: 4, axial: 10 });
    assert.deepEqual(evidence.closedCavities.cavities.map(cavity => cavity.axialInterval), reversed ? [[1, 3], [-3, -1]] : [[-3, -1], [1, 3]]);
  }
  const curve = path(), translated = { ...curve, controlPoints: curve.controlPoints.map(([x, y, z]): [number, number, number] => [x + 12, y - 7, z + 9]) };
  assert.ok(closedPairedRectangularDuctEvidence(native(translated), translated, source));
});

test('changed bounds, duplicate names, non-finite sources, touching cavities and unsupported paths fail closed', () => {
  const curve = path(), brep = native(curve);
  const changes: Source[] = [
    { ...source, outer: [4.1, 10] }, { ...source, outer: [4, Number.NaN] }, { ...source, outer: [4] },
    { ...source, cavities: [source.cavities[0]] }, { ...source, cavities: [...source.cavities, source.cavities[0]] },
    { ...source, cavities: [source.cavities[0], { ...source.cavities[1], tags: source.cavities[0].tags }] },
    { ...source, cavities: [{ ...source.cavities[0], tags: ['wrong', 'e6', 'e7', 'e8'] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], min: [-1, -3], max: [1, -.9] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], min: [-.9, -3] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], min: [-2, -3] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], max: [1, 1] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], min: [-1, Number.POSITIVE_INFINITY] }, source.cavities[1]] },
    { ...source, cavities: [{ ...source.cavities[0], max: [1] }, source.cavities[1]] },
    { ...source, outerTags: ['e1', 'e2', 'e3', ''] },
  ];
  for (const changed of changes) assert.equal(closedPairedRectangularDuctEvidence(brep, curve, changed), undefined);
  const kink = structuredClone(curve); kink.controlPoints[7][2] += 1.2e-8;
  const seam = structuredClone(curve); seam.controlPoints[8][1] += 8e-9;
  const open = { ...curve, controlPoints: curve.controlPoints.slice(0, 5), weights: curve.weights.slice(0, 5), knots: [0, 0, 0, 1, 1, 2, 2, 2] };
  const ellipse = { ...curve, controlPoints: curve.controlPoints.map(([x, y, z]): [number, number, number] => [x, y * 1.1, z]) };
  for (const changed of [kink, seam, open, ellipse, { ...curve, weights: curve.weights.map((weight, i) => i === 3 ? .7 : weight) }])
    assert.equal(closedPairedRectangularDuctEvidence(brep, changed, source), undefined);
});

test('both outward cavity shells are strictly valid but each fails the inward material evidence', () => {
  const curve = path(), brep = native(curve);
  for (const index of [1, 2]) {
    const changed = reverseShell(brep, index), report = checkBrep(changed, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.equal(closedPairedRectangularDuctEvidence(changed, curve, source), undefined);
  }
});

test('native cavity reassignment, altered charts, disconnected ownership, changed surfaces, moved bodies and unrelated sources cannot receive evidence', () => {
  const curve = path(), brep = native(curve);
  const swappedNames = brep.faces.map(face => {
    const first = source.cavities[0].tags.findIndex(tag => face.name?.startsWith(`w.side[${tag}]#`));
    const second = source.cavities[1].tags.findIndex(tag => face.name?.startsWith(`w.side[${tag}]#`));
    return first >= 0 ? { ...face, name: face.name!.replace(source.cavities[0].tags[first], source.cavities[1].tags[first]) }
      : second >= 0 ? { ...face, name: face.name!.replace(source.cavities[1].tags[second], source.cavities[0].tags[second]) } : face;
  });
  const missing = { ...brep, coedges: brep.coedges.map((use, i) => i ? use : { ...use, pcurve: null }) };
  const chart = { ...brep, coedges: brep.coedges.map((use, i) => i || !use.pcurve ? use : { ...use, pcurve: { ...use.pcurve,
    controlPoints: use.pcurve.controlPoints.map(([x, y, z]): [number, number, number] => [x + .01, y, z]),
  } }) };
  const surface = { ...brep, faces: brep.faces.map((face, i) => i || face.surface.kind !== 'surface' ? face : { ...face,
    surface: { ...face.surface, controlPoints: face.surface.controlPoints.map(row => row.map(([x, y, z]): [number, number, number] => [x, y, z + .01])) },
  }) };
  const mismatchedShell = { ...brep, shells: brep.shells.map((shell, i) => i === 1 ? { ...shell, faces: brep.shells[2].faces } : shell) };
  const foreignBody = { ...brep, shells: brep.shells.map((shell, i) => i === 1 ? { ...shell, body: 'foreign' } : shell) };
  const moved = transformBrep(brep, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [1, 0, 0] });
  const unrelated = { ...brep, source: { family: 'revolve', id: 'w' } };
  const renamed = { ...brep, faces: swappedNames };
  assert.ok(checkBrep(renamed, { strict: true }).valid);
  for (const changed of [missing, chart, surface, mismatchedShell, foreignBody, moved, unrelated, renamed,
    { ...brep, shells: brep.shells.map((shell, i) => i ? { ...shell, closed: false } : shell) }])
    assert.equal(closedPairedRectangularDuctEvidence(changed, curve, source), undefined);
});
