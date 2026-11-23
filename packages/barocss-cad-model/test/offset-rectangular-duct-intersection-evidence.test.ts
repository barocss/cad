import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, faceGeometry, measureBrepEdgeContinuity, type Brep, type CadPartDocument, type Point } from '@barocss/cad';
import { offsetRectangularDuctIntersectionEvidence, type OffsetDuctDimensions } from '../src/chat/offsetRectangularDuctIntersectionEvidence';
import { digestOf } from '../src/util/digest';

const dimensions: OffsetDuctDimensions = { pathRadius: 20, exterior: { radial: 4, axial: 6 }, interior: { radial: 2, axial: 4 } };
const near = (actual: number, expected: number, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);

/** The D1767 actual pending source, with stable feature names and exact source winding/tags. */
function native(offset = 1, sizes = dimensions): Brep {
  const outer = sizes.exterior, inner = sizes.interior, r = sizes.pathRadius;
  const points: [number, number, number][] = [[r, 0, 0], [r, r, 0], [0, r, 0], [-r, r, 0], [-r, 0, 0],
    [-r, -r, 0], [0, -r, 0], [r, -r, 0], [r, 0, 0]];
  const hole: [number, number][] = [[-inner.radial / 2, -inner.axial / 2], [-inner.radial / 2, inner.axial / 2],
    [inner.radial / 2, inner.axial / 2], [inner.radial / 2, -inner.axial / 2]];
  const doc: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [-outer.radial / 2, -outer.axial / 2], max: [outer.radial / 2, outer.axial / 2],
      holes: [hole.map(start => ({ kind: 'line', start }))], sideTags: { outer: ['top', 'outer', 'bottom', 'inner'],
        holes: [['hole-inner', 'hole-bottom', 'hole-outer', 'hole-top']] } },
    { id: 'n1', kind: 'sweep-curve', sketch: 'n0', mode: 'exact', path: { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
      controlPoints: points, weights: points.map((_, i) => i % 2 ? Math.SQRT1_2 : 1) } },
    { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [offset, -30], max: [offset + 30, 30] },
    { id: 'n3', kind: 'extrude', sketch: 'n2', from: -5, height: 10 },
    { id: 'n4', kind: 'intersect', target: 'n1', tool: 'n3' },
  ] };
  return evaluateCadPart(doc).outputs[0].brep;
}

test('native x1 review preserves the actual D1767 digest and measures signed apertures, normals and independent volume', t => {
  const brep = native(), before = structuredClone({ brep, dimensions });
  assert.equal(digestOf(brep), '8b3e9b605bc365439a7aaa655f3430d2ee475a02175f29b179a6b51d76ac5b5e');
  const evidence = offsetRectangularDuctIntersectionEvidence(brep, dimensions, 1);
  assert.ok(evidence);
  assert.deepEqual(evidence.caps.map(cap => cap.side), [-1, 1]);
  assert.equal(new Set(evidence.caps.map(cap => cap.name)).size, 2);
  for (const cap of evidence.caps) {
    assert.deepEqual(cap.normal, [-1, 0, 0]);
    assert.equal(cap.outer.edges.length, 4); assert.equal(cap.inner.edges.length, 4);
    assert.equal(new Set([...cap.outer.edges, ...cap.inner.edges]).size, 8);
    assert.ok(cap.outer.walls.every(name => !name.includes('[hole-')));
    assert.ok(cap.inner.walls.every(name => name.includes('[hole-')));
    near(cap.outer.width, 4.00506022022448); near(cap.outer.height, 6);
    near(cap.inner.width, 2.00251100239275); near(cap.inner.height, 4);
    near(cap.outer.signedArea, 24.0303613213469); near(cap.inner.signedArea, -8.01004400957101);
    near(cap.materialArea, 16.0203173117759);
    const bounds = cap.side > 0 ? [18.973665961010276, 20.97617696340303] : [-20.97617696340303, -18.973665961010276];
    cap.inner.y.forEach((value, i) => near(value, bounds[i]));
    assert.deepEqual(cap.inner.z, [-2, 2]);
  }
  assert.equal(evidence.measuredEdges, 24); assert.ok(evidence.maximumAngleErrorDegrees < 1e-8);
  const joints = brep.edges.map(edge => measureBrepEdgeContinuity(brep, edge.id));
  const nonRight = joints.filter(joint => joint.status === 'measured' && Math.abs(joint.maximumAngleDegrees - 90) > 1e-8);
  assert.equal(nonRight.length, 8);
  const expected = [86.8152614632796, 87.27059736322131, 92.60525126505729, 93.016961309816];
  for (const angle of expected) assert.equal(nonRight.filter(joint => joint.status === 'measured' && Math.abs(joint.maximumAngleDegrees - angle) < 1e-8).length, 2);
  near(evidence.volume.analytic, 973.2961147758438); near(evidence.volume.native, evidence.volume.analytic);
  assert.equal(evidence.volume.method, 'quadrature'); assert.ok(evidence.maximumGapMM < 1e-10);
  assert.deepEqual({ brep, dimensions }, before);
  t.diagnostic(JSON.stringify(evidence));
});

test('offset and cavity-height edits keep actual aperture sizes and material volume independently bound', () => {
  const edited = { ...dimensions, interior: { radial: 2, axial: 2 } };
  for (const [offset, sizes] of [[2, dimensions], [1, edited], [2, edited], [15, dimensions]] as const) {
    const brep = native(offset, sizes), evidence = offsetRectangularDuctIntersectionEvidence(brep, sizes, offset);
    assert.ok(evidence);
    assert.equal(evidence.measuredEdges, 24);
    assert.ok(evidence.caps.every(cap => Math.abs(cap.inner.height - sizes.interior.axial) < 1e-8));
    assert.ok(Math.abs(evidence.volume.native - evidence.volume.analytic) < 1e-7);
  }
});

test('native evidence refuses stale dimensions, wrong offsets, centered/tangent scope and unbound charts', () => {
  const brep = native();
  for (const sizes of [{ ...dimensions, pathRadius: 21 }, { ...dimensions, exterior: { radial: 4.1, axial: 6 } },
    { ...dimensions, interior: { radial: 2, axial: 2 } }, { ...dimensions, interior: { radial: 4, axial: 4 } },
    { ...dimensions, pathRadius: Number.NaN }]) assert.equal(offsetRectangularDuctIntersectionEvidence(brep, sizes, 1), undefined);
  for (const offset of [0, -1, 2, 18, Number.NaN]) assert.equal(offsetRectangularDuctIntersectionEvidence(brep, dimensions, offset), undefined);
  const coedges = brep.coedges.map((use, i) => i === 0 ? { ...use, pcurve: null } : use);
  assert.equal(offsetRectangularDuctIntersectionEvidence({ ...brep, coedges }, dimensions, 1), undefined);
  assert.equal(offsetRectangularDuctIntersectionEvidence({ ...brep, source: { family: 'manual', id: 'n4' } }, dimensions, 1), undefined);
});

test('native evidence refuses reversed cavity normals', () => {
  const brep = native();
  const faces = brep.faces.map(face => face.name?.includes('[hole-')
    ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face);
  const changed = { ...brep, faces };
  assert.equal(checkBrep(changed, { strict: true }).topology[0].genus, 1);
  assert.equal(offsetRectangularDuctIntersectionEvidence(changed, dimensions, 1), undefined);
});

test('native evidence refuses wrong cap winding, wall-group incidence and mismatched parameter bindings', () => {
  const brep = native(), cap = brep.faces.find(face => face.loops.length === 2)!;
  const faces = brep.faces.map(face => face === cap ? { ...face, sense: face.sense === 'forward' ? 'reversed' as const : 'forward' as const } : face);
  assert.equal(offsetRectangularDuctIntersectionEvidence({ ...brep, faces }, dimensions, 1), undefined);
  const inner = brep.loops.find(loop => cap.loops.includes(loop.id) && loop.kind === 'inner')!;
  const loops = brep.loops.map(loop => loop === inner ? { ...loop, kind: 'outer' as const } : loop);
  assert.equal(offsetRectangularDuctIntersectionEvidence({ ...brep, loops }, dimensions, 1), undefined);
  const use = brep.coedges.find(use => use.id === inner.coedges[0])!;
  const badChart = brep.coedges.map(candidate => candidate === use ? { ...use, pcurve: { ...use.pcurve!,
    controlPoints: use.pcurve!.controlPoints.map(([x, y, z]): Point => [x + .001, y, z]) } } : candidate);
  assert.equal(offsetRectangularDuctIntersectionEvidence({ ...brep, coedges: badChart }, dimensions, 1), undefined);
  const other = brep.faces.find(face => faceGeometry(face).kind === 'cylinder' && !face.name?.includes('[hole-'))!;
  const outerUse = brep.coedges.find(candidate => other.loops.includes(candidate.loop))!;
  const badTwin = brep.coedges.map(candidate => candidate === use ? { ...use, twin: outerUse.id } : candidate);
  assert.equal(offsetRectangularDuctIntersectionEvidence({ ...brep, coedges: badTwin }, dimensions, 1), undefined);
});
