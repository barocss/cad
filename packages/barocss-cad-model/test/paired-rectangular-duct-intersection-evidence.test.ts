import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, faceGeometry, measureBrepEdgeContinuity, type Brep, type CadPartDocument, type Curve, type Point } from '@barocss/cad';
import { closedDuctCircle } from '../src/chat/closedRectangularDuctEvidence';
import { closedPairedRectangularDuctEvidence } from '../src/chat/closedPairedRectangularDuctEvidence';
import { pairedRectangularDuctIntersectionEvidence, type PairedDuctIntersectionDimensions } from '../src/chat/pairedRectangularDuctIntersectionEvidence';
import { digestOf } from '../src/util/digest';

const source = { outer: [4, 10], outerTags: ['e1', 'e2', 'e3', 'e4'], cavities: [
  { min: [-1, -3], max: [1, -1], tags: ['e5', 'e6', 'e7', 'e8'] },
  { min: [-1, 1], max: [1, 3], tags: ['e9', 'e10', 'e11', 'e12'] },
] };
const near = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

function native(section = source, reversed = false, swapped = false, offset = 0, upperY = 30) {
  const points: Curve['controlPoints'] = [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0],
    [-20, -20, 0], [0, -20, 0], [20, -20, 0], [20, 0, 0]];
  const path = { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    controlPoints: reversed ? points.slice().reverse() : points, weights: points.map((_, i) => i % 2 ? Math.SQRT1_2 : 1) };
  const document: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min: [-section.outer[0] / 2, -section.outer[1] / 2], max: [section.outer[0] / 2, section.outer[1] / 2],
      holes: section.cavities.map(({ min, max }, i) => {
        const corners: [number, number][] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]];
        return (i === 0 ? corners.slice().reverse() : corners).map(start => ({ kind: 'line', start }));
      }), sideTags: { outer: section.outerTags, holes: section.cavities.map(cavity => cavity.tags) } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path },
    { id: 'bs', kind: 'sketch', profile: 'rectangle', min: [offset, -30], max: [30, upperY] },
    { id: 'b', kind: 'extrude', sketch: 'bs', from: -6, height: 12 },
    { id: 'cut', kind: 'intersect', target: swapped ? 'b' : 'w', tool: swapped ? 'w' : 'b' },
  ] };
  const original = evaluateCadPart({ ...document, features: document.features.slice(0, 2) }).outputs[0].brep;
  const closed = closedPairedRectangularDuctEvidence(original, path, section)?.closedCavities;
  assert.ok(closed);
  const axis = closedDuctCircle(path)!.axis[2];
  const dimensions: PairedDuctIntersectionDimensions = { ...closed.dimensions, cavities: closed.cavities.map(cavity => ({
    ...cavity.dimensions, faces: cavity.faces, axialInterval: cavity.axialInterval.map(value => value * axis).sort((a, b) => a - b),
  })) };
  return { brep: evaluateCadPart(document).outputs[0].brep, dimensions };
}

test('centered paired evidence binds both cap apertures to separate source walls, signed areas, charts, 36 corners and native mass without mutation', t => {
  const { brep, dimensions } = native(), before = structuredClone({ brep, dimensions }), fingerprint = digestOf(brep);
  const evidence = pairedRectangularDuctIntersectionEvidence(brep, dimensions);
  assert.ok(evidence);
  assert.ok(!Object.hasOwn(evidence, 'capCylinderJointAngles'));
  assert.equal(digestOf(evidence), '7eb4bb061f1b49407616f4e07cda5dfa53445920bed1f95eb5f9abbdbae0874e');
  assert.deepEqual(evidence.caps.map(cap => cap.side), [-1, 1]);
  assert.equal(new Set(evidence.caps.map(cap => cap.name)).size, 2);
  const rims = evidence.caps.flatMap(cap => [cap.outer, ...cap.cavities]);
  assert.equal(new Set(rims.map(rim => rim.name)).size, 6);
  assert.equal(new Set(rims.map(rim => rim.loop)).size, 6);
  assert.equal(new Set(rims.flatMap(rim => rim.edges)).size, 24);
  for (const cap of evidence.caps) {
    assert.deepEqual(cap.normal, [-1, 0, 0]);
    near(cap.outer.width, 4); near(cap.outer.height, 10); near(cap.outer.signedArea, 40); near(cap.materialArea, 32);
    for (const [index, rim] of cap.cavities.entries()) {
      assert.equal(rim.owner, cap.name); assert.equal(rim.face, cap.face); assert.ok(rim.name.startsWith(`${cap.name}.`));
      assert.equal(rim.edges.length, 4); assert.equal(new Set(rim.wallIds).size, 4);
      near(rim.width, 2); near(rim.height, 2); near(rim.signedArea, -4);
      assert.deepEqual(rim.z, dimensions.cavities[index].axialInterval);
      rim.y.forEach((value, i) => near(value, (cap.side < 0 ? [-21, -19] : [19, 21])[i]));
      const bases = dimensions.cavities[index].faces.map(name => name.replace(/#\d+$/, ''));
      assert.ok(rim.walls.every(name => bases.includes(name.replace(/#\d+$/, ''))));
    }
    assert.equal(new Set(cap.cavities.flatMap(rim => rim.walls)).size, 8);
  }
  near(evidence.volume.analytic, 640 * Math.PI); near(evidence.volume.native, 640 * Math.PI);
  near(evidence.centroid.analytic[0], 4819 / (120 * Math.PI));
  near(evidence.centroid.analytic[1], 0); near(evidence.centroid.analytic[2], 0);
  for (const [i, value] of evidence.centroid.native.entries()) near(value, evidence.centroid.analytic[i]);
  assert.equal(evidence.volume.method, 'quadrature'); assert.equal(evidence.measuredEdges, 36);
  assert.equal(new Set(evidence.corners).size, 36); assert.ok(evidence.maximumGapMM < 1e-10); assert.ok(evidence.maximumAngleErrorDegrees < 1e-8);
  assert.equal(digestOf(brep), fingerprint); assert.deepEqual({ brep, dimensions }, before);
  t.diagnostic(JSON.stringify(evidence));
});

test('independent cavity height, width, ordering, reversed travel and operand edits retain source assignment and world centroid', () => {
  const edited = { ...source, cavities: [{ ...source.cavities[0], min: [-1, -2.5], max: [1, -1.5] }, source.cavities[1]] };
  for (const reversed of [false, true]) for (const swapped of [false, true]) {
    const { brep, dimensions } = native(edited, reversed, swapped), evidence = pairedRectangularDuctIntersectionEvidence(brep, dimensions);
    assert.ok(evidence);
    near(evidence.volume.native, 680 * Math.PI); near(evidence.centroid.native[2], (reversed ? -2 : 2) / 17);
    for (const cap of evidence.caps) {
      near(cap.cavities[0].height, 1); near(cap.cavities[1].height, 2); near(cap.materialArea, 34);
    }
  }
  const reordered = { ...source, cavities: [source.cavities[1], { ...source.cavities[0], min: [-.5, -3], max: [.5, -1] }] };
  const { brep, dimensions } = native(reordered), evidence = pairedRectangularDuctIntersectionEvidence(brep, dimensions);
  assert.ok(evidence); near(evidence.volume.native, 680 * Math.PI);
  for (const cap of evidence.caps) { near(cap.cavities[0].width, 2); near(cap.cavities[1].width, 1); }
  assert.deepEqual(evidence.caps[0].cavities.map(rim => rim.z), [[-3, -1], [1, 3]]);
});

test('stale dimensions and source identity, touching or duplicate cavities, malformed intervals, offset and foreign geometry fail closed', () => {
  const { brep, dimensions } = native();
  const change = (first: Partial<PairedDuctIntersectionDimensions['cavities'][number]>) => ({ ...dimensions, cavities: [{ ...dimensions.cavities[0], ...first }, dimensions.cavities[1]] });
  const changes: PairedDuctIntersectionDimensions[] = [
    { ...dimensions, pathRadius: 21 }, { ...dimensions, pathRadius: Number.NaN }, { ...dimensions, exterior: { radial: 4.1, axial: 10 } },
    { ...dimensions, cavities: dimensions.cavities.slice(0, 1) }, { ...dimensions, cavities: [dimensions.cavities[0], dimensions.cavities[0]] },
    change({ radial: 1 }), change({ axial: 1 }), change({ axialInterval: [1.1, 3.1] }), change({ axialInterval: [1, Number.NaN] }),
    change({ axialInterval: [3, 1] }), change({ axialInterval: [1, 3, 4] }), change({ axialInterval: [-1, 1] }),
    change({ faces: dimensions.cavities[1].faces }), change({ faces: dimensions.cavities[0].faces.map(name => `foreign.${name}`) }),
    change({ faces: dimensions.cavities[0].faces.slice(0, 4) }), change({ radial: 4 }),
  ];
  for (const changed of changes) assert.equal(pairedRectangularDuctIntersectionEvidence(brep, changed), undefined);
  const offset = native(source, false, false, 1);
  assert.equal(pairedRectangularDuctIntersectionEvidence(offset.brep, offset.dimensions), undefined);
  assert.equal(pairedRectangularDuctIntersectionEvidence({ ...brep, source: { family: 'manual', id: 'cut' } }, dimensions), undefined);
});

test('valid-topology source name reassignment and inward orientation changes receive no paired evidence', () => {
  const { brep, dimensions } = native();
  const first = dimensions.cavities[0].faces.map(name => name.replace(/#\d+$/, ''));
  const second = dimensions.cavities[1].faces.map(name => name.replace(/#\d+$/, ''));
  const map = new Map(first.map((name, i) => [name, second[i]]));
  for (const [i, name] of second.entries()) map.set(name, first[i]);
  const renamed = { ...brep, faces: brep.faces.map(face => ({ ...face, name: map.get(face.name!.replace(/#\d+$/, '')) ?? face.name })) };
  assert.ok(checkBrep(renamed, { strict: true }).valid);
  assert.equal(pairedRectangularDuctIntersectionEvidence(renamed, dimensions), undefined);
  for (const names of [first, second]) {
    const faces = brep.faces.map(face => names.includes(face.name!.replace(/#\d+$/, ''))
      ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face);
    assert.equal(pairedRectangularDuctIntersectionEvidence({ ...brep, faces }, dimensions), undefined);
  }
});

test('missing or altered charts, duplicated apertures, swapped incidence and reversed cap winding receive no paired evidence', () => {
  const { brep, dimensions } = native(), cap = brep.faces.find(face => face.loops.length === 3)!;
  const inner = brep.loops.filter(loop => cap.loops.includes(loop.id) && loop.kind === 'inner');
  const use = brep.coedges.find(use => use.id === inner[0].coedges[0])!;
  const changes: Brep[] = [
    { ...brep, coedges: brep.coedges.map(candidate => candidate === use ? { ...candidate, pcurve: null } : candidate) },
    { ...brep, coedges: brep.coedges.map(candidate => candidate === use ? { ...candidate, pcurve: { ...candidate.pcurve!,
      controlPoints: candidate.pcurve!.controlPoints.map(([x, y, z]): Point => [x + .001, y, z]) } } : candidate) },
    { ...brep, faces: brep.faces.map(face => face === cap ? { ...face, loops: [cap.loops[0], inner[0].id, inner[0].id] } : face) },
    { ...brep, loops: brep.loops.map(loop => loop === inner[0] ? { ...loop, kind: 'outer' as const } : loop) },
    { ...brep, faces: brep.faces.map(face => face === cap ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face) },
    { ...brep, coedges: brep.coedges.map(candidate => candidate === use ? { ...candidate, twin: inner[1].coedges[0] } : candidate) },
  ];
  for (const changed of changes) assert.equal(pairedRectangularDuctIntersectionEvidence(changed, dimensions), undefined);
});


/** Integrate radial strips independently from the helper's closed-form circular segment differences. */
function integratedMass(dimensions: PairedDuctIntersectionDimensions, offset: number) {
  const integrate = (low: number, high: number, f: (radius: number) => number) => {
    const n = 4096, step = (high - low) / n;
    let sum = f(low) + f(high);
    for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * f(low + i * step);
    return step * sum / 3;
  };
  let volume = 0, momentX = 0, momentZ = 0;
  for (const [index, section] of [dimensions.exterior, ...dimensions.cavities].entries()) {
    const sign = index === 0 ? 1 : -1, low = dimensions.pathRadius - section.radial / 2, high = dimensions.pathRadius + section.radial / 2;
    const sectionVolume = section.axial * integrate(low, high, r => 2 * r * Math.acos(offset / r));
    volume += sign * sectionVolume;
    momentX += sign * section.axial * integrate(low, high, r => 2 * r * Math.sqrt(r * r - offset * offset));
    const interval = index === 0 ? [-section.axial / 2, section.axial / 2] : dimensions.cavities[index - 1].axialInterval;
    momentZ += sign * sectionVolume * (interval[0] + interval[1]) / 2;
  }
  return { volume, centroid: [momentX / volume, 0, momentZ / volume] };
}

test('positive paired offset measures both circle intersections, source-owned world-Z apertures, all 72 charts and 36 angles', t => {
  const { brep, dimensions } = native(source, false, false, 1), before = structuredClone({ brep, dimensions });
  const evidence = pairedRectangularDuctIntersectionEvidence(brep, dimensions, 1);
  assert.ok(evidence);
  assert.equal(brep.coedges.filter(use => use.pcurve).length, 72);
  assert.equal(evidence.measuredEdges, 36); assert.equal(new Set(evidence.corners).size, 36);
  assert.ok(evidence.maximumGapMM < 1e-10); assert.ok(evidence.maximumAngleErrorDegrees < 1e-8);
  const joints = evidence.capCylinderJointAngles;
  assert.ok(joints); assert.equal(joints.length, 12);
  assert.equal(new Set(joints.map(joint => joint.edge)).size, 12);
  const capIds = new Set(evidence.caps.map(cap => cap.face));
  for (const edge of brep.edges) {
    const owners = brep.coedges.filter(use => use.edge === edge.id).map(use => brep.faces.find(face => face.loops.includes(use.loop))!);
    const cylinder = owners.map(faceGeometry).find(geometry => geometry.kind === 'cylinder');
    const isCapCylinder = cylinder?.kind === 'cylinder' && owners.some(face => capIds.has(face.id));
    const expected = isCapCylinder ? Math.acos(-cylinder.out / cylinder.r) * 180 / Math.PI : 90;
    const measured = measureBrepEdgeContinuity(brep, edge.id);
    assert.equal(measured.status, 'measured');
    if (measured.status !== 'measured') continue;
    near(measured.minimumAngleDegrees, expected); near(measured.maximumAngleDegrees, expected);
    const joint: typeof joints[number] | undefined = joints.find(candidate => candidate.edge === edge.id);
    if (isCapCylinder) {
      assert.ok(joint); near(joint.expectedAngleDegrees, expected);
      near(joint.minimumAngleDegrees, measured.minimumAngleDegrees); near(joint.maximumAngleDegrees, measured.maximumAngleDegrees);
      assert.ok(Math.abs(joint.maximumAngleDegrees - 90) > 1);
    } else assert.equal(joint, undefined);
  }
  for (const cap of evidence.caps) {
    assert.deepEqual(cap.normal, [-1, 0, 0]);
    for (const [index, rim] of [cap.outer, ...cap.cavities].entries()) {
      const section = index === 0 ? dimensions.exterior : dimensions.cavities[index - 1];
      const intersections = [-1, 1].map(sign => cap.side * Math.sqrt((dimensions.pathRadius + sign * section.radial / 2) ** 2 - 1)).sort((a, b) => a - b);
      rim.y.forEach((value, i) => near(value, intersections[i]));
      near(rim.width, intersections[1] - intersections[0]); near(rim.height, section.axial);
      near(rim.signedArea, (index === 0 ? 1 : -1) * rim.width * section.axial);
      for (const id of rim.edges) for (const point of brep.edges.find(edge => edge.id === id)!.curve.controlPoints) near(point[0], 1);
      if (index > 0) {
        assert.deepEqual(rim.z, dimensions.cavities[index - 1].axialInterval);
        const names = new Set(dimensions.cavities[index - 1].faces.map(name => name.replace(/#\d+$/, '')));
        assert.ok(rim.walls.every(name => names.has(name.replace(/#\d+$/, ''))));
      }
    }
    assert.equal(new Set(cap.cavities.flatMap(rim => rim.wallIds)).size, 8);
    near(cap.materialArea, cap.outer.signedArea + cap.cavities.reduce((sum, rim) => sum + rim.signedArea, 0));
  }
  const integrated = integratedMass(dimensions, 1);
  near(evidence.volume.analytic, integrated.volume); near(evidence.volume.native, integrated.volume);
  evidence.centroid.analytic.forEach((value, i) => near(value, integrated.centroid[i]));
  evidence.centroid.native.forEach((value, i) => near(value, integrated.centroid[i]));
  assert.deepEqual({ brep, dimensions }, before);
  t.diagnostic(JSON.stringify(evidence));
});

test('positive paired offsets retain independent cavity dimensions, source ordering and world X/Z mass across reversed travel and operands', () => {
  const edited = { ...source, cavities: [source.cavities[1], { ...source.cavities[0], min: [-.5, -2.5], max: [.5, -1.5] }] };
  for (const offset of [1, 2, 15]) for (const reversed of [false, true]) for (const swapped of [false, true]) {
    const { brep, dimensions } = native(edited, reversed, swapped, offset);
    const evidence = pairedRectangularDuctIntersectionEvidence(brep, dimensions, offset), integrated = integratedMass(dimensions, offset);
    assert.ok(evidence);
    near(evidence.volume.native, integrated.volume); near(evidence.volume.analytic, integrated.volume);
    for (let i = 0; i < 3; i++) { near(evidence.centroid.native[i], integrated.centroid[i]); near(evidence.centroid.analytic[i], integrated.centroid[i]); }
    assert.ok((reversed ? -1 : 1) * evidence.centroid.native[2] > 0);
    assert.equal(evidence.capCylinderJointAngles?.length, 12); assert.equal(evidence.measuredEdges, 36);
    for (const cap of evidence.caps) {
      for (const [index, rim] of cap.cavities.entries()) rim.z.forEach((value, i) => near(value, dimensions.cavities[index].axialInterval[i]));
    }
  }
});

test('positive paired evidence refuses wrong or negative offsets, a second clipping plane, stale source intervals and damaged charts', () => {
  const { brep, dimensions } = native(source, false, false, 1);
  for (const offset of [0, -1, 2, 18, 20, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(pairedRectangularDuctIntersectionEvidence(brep, dimensions, offset), undefined);
  }
  for (const offset of [-1, 1]) {
    const clipped = native(source, false, false, offset, 20);
    assert.equal(pairedRectangularDuctIntersectionEvidence(clipped.brep, clipped.dimensions, offset), undefined);
  }
  const changed = { ...dimensions, cavities: [{ ...dimensions.cavities[0], axialInterval: [-3, -1] }, dimensions.cavities[1]] };
  assert.equal(pairedRectangularDuctIntersectionEvidence(brep, changed, 1), undefined);
  const cap = brep.faces.find(face => face.loops.length === 3)!, inner = brep.loops.find(loop => cap.loops.includes(loop.id) && loop.kind === 'inner')!;
  const use = brep.coedges.find(use => use.id === inner.coedges[0])!;
  const damaged: Brep[] = [
    { ...brep, coedges: brep.coedges.map(candidate => candidate === use ? { ...candidate, pcurve: null } : candidate) },
    { ...brep, coedges: brep.coedges.map(candidate => candidate === use ? { ...candidate, pcurve: { ...candidate.pcurve!,
      controlPoints: candidate.pcurve!.controlPoints.map(([x, y, z]): Point => [x + .001, y, z]) } } : candidate) },
    { ...brep, faces: brep.faces.map(face => face === cap ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face) },
    { ...brep, loops: brep.loops.map(loop => loop === inner ? { ...loop, kind: 'outer' as const } : loop) },
    { ...brep, faces: brep.faces.map(face => face === cap ? { ...face, loops: [cap.loops[0], inner.id, inner.id] } : face) },
    { ...brep, coedges: brep.coedges.map(candidate => candidate === use ? { ...candidate, twin: inner.coedges[2] } : candidate) },
    { ...brep, faces: brep.faces.map(face => dimensions.cavities[0].faces.some(name => name.replace(/#\d+$/, '') === face.name!.replace(/#\d+$/, ''))
      ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face) },
  ];
  for (const [index, changed] of damaged.entries()) assert.equal(pairedRectangularDuctIntersectionEvidence(changed, dimensions, 1), undefined, `damage ${index}`);
});
