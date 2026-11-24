import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, type Brep, type CadPartDocument, type Curve, type Point } from '@barocss/cad';
import { exactPerpendicularAnnularOutletOffsetFrame, exactPerpendicularAnnularSweepReceipt } from '@barocss/cad/internal/exact-paired-elbow-offset';
import { perpendicularAnnularOutletOffsetEvidence } from '../src/chat/perpendicularAnnularOutletOffsetEvidence';

type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;
const source = { feature: 'w', face: 'w.end', outerRadius: 2, boreRadius: 1 };
const near = (a: number, b: number, tolerance = 1e-7) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}`);
const rail = (): Path => ({ degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
  controlPoints: [[-10, 0, 0], [-5, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18], [12, 30, 23], [12, 30, 28]] });
const cache = new Map<string, Brep>();
function native(path: Path = rail(), distance?: number, end: 'start' | 'end' = 'end'): Brep {
  const key = JSON.stringify({ path, distance, end });
  if (cache.has(key)) return cache.get(key)!;
  const document: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2,
      holes: [[{ kind: 'arc', start: [1, 0], center: [0, 0], direction: 'cw' }]], sideTags: { outer: ['e0'], holes: [['bore']] } },
    { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path },
    ...(distance === undefined ? [] : [{ id: 'move', kind: 'offset-face' as const, target: 'w', face: `w.${end}`, distance }]),
  ] };
  const result = evaluateCadPart(document).outputs[0].brep; cache.set(key, result); return result;
}
const minimal = (path: Path) => ({ id: 'w', mode: 'exact' as const, path: { ...path, kind: 'curve' as const, id: 'path' } });

test('shared circular receipts expose the same native frames, cap owners, lanes and twelve junction edges', () => {
  const path = rail(), original = native(path), before = structuredClone({ original, path });
  const receipt = exactPerpendicularAnnularSweepReceipt(original, minimal(path)); assert.ok(receipt);
  assert.equal(receipt.pathKind, 'line-arc-arc-line'); assert.equal(receipt.feature, 'w');
  near(receipt.section.outerRadius, 2); near(receipt.section.boreRadius, 1);
  assert.deepEqual(receipt.dimensions, { leadLength: 10, tailLength: 10 });
  assert.deepEqual(receipt.caps.map(cap => [cap.face, cap.outerEdges.length, cap.innerEdges.length]), [['w.start', 2, 2], ['w.end', 2, 2]]);
  assert.deepEqual(receipt.junctions.map(join => join.pieces), [['lead', 'first'], ['first', 'second'], ['second', 'tail']]);
  assert.equal(new Set(receipt.junctions.flatMap(join => [...join.outerEdges, ...join.innerEdges])).size, 12);
  assert.deepEqual(exactPerpendicularAnnularOutletOffsetFrame(original, 'w.end', minimal(path)), { anchor: receipt.caps[1].center, normal: receipt.caps[1].normal });
  assert.ok(receipt.maximumGapMM < 1e-10); assert.ok(receipt.roundoffMM < 1e-10);
  assert.deepEqual({ original, path }, before);
});

test('signed outlet evidence retains the original inlet and integrates both positive and negative material moments', () => {
  const path = rail(), original = native(path), before = structuredClone({ original, path, source });
  for (const distance of [4, -4]) {
    const candidate = native(path, distance), unchanged = structuredClone(candidate);
    const evidence = perpendicularAnnularOutletOffsetEvidence(original, candidate, path, source, distance); assert.ok(evidence);
    const length = 15 * Math.PI + 20 + distance, volume = 3 * Math.PI * length;
    const centroid = [(108 * Math.PI + 861 / 4 + 12 * distance) / length, (180 * Math.PI + 480 + 30 * distance) / length,
      (162 * Math.PI - 381 / 4 + 28 * distance + distance ** 2 / 2) / length];
    assert.equal(evidence.pathKind, 'line-arc-arc-line'); assert.equal(evidence.face, 'w.end'); assert.equal(evidence.distance, distance);
    assert.deepEqual(evidence.displacement.normal, [0, 0, 1]);
    evidence.displacement.vector.forEach((value, axis) => near(value, axis === 2 ? distance : 0));
    assert.deepEqual(evidence.originalCap.center, [12, 30, 28]); assert.deepEqual(evidence.movedCap.center, [12, 30, 28 + distance]);
    assert.deepEqual(evidence.originalCap.outerEdges, evidence.movedCap.outerEdges); assert.deepEqual(evidence.originalCap.innerEdges, evidence.movedCap.innerEdges);
    assert.deepEqual(evidence.retained.inlet.center, [-10, 0, 0]); assert.equal(evidence.retained.faces.length, 13);
    assert.equal(evidence.retained.junctions.length, 3); assert.equal(evidence.materialChange.method, 'quadrature');
    near(evidence.section.area, 3 * Math.PI); near(evidence.materialChange.sectionArea, 3 * Math.PI);
    near(evidence.materialChange.analytic, 3 * Math.PI * distance); near(evidence.materialChange.native, 3 * Math.PI * distance);
    near(evidence.volume.original, 45 * Math.PI ** 2 + 60 * Math.PI); near(evidence.volume.candidate, volume); near(evidence.volume.analytic, volume);
    evidence.centroid.native.forEach((value, axis) => near(value, centroid[axis]));
    evidence.centroid.analytic.forEach((value, axis) => near(value, centroid[axis]));
    assert.ok(evidence.maximumGapMM < 1e-10); assert.deepEqual(candidate, unchanged);
  }
  assert.deepEqual({ original, path, source }, before);
});

test('equal-volume inlet edits, wrong signed intent, stale rails and different declared radii receive no outlet evidence', () => {
  const path = rail(), original = native(path), candidate = native(path, 4), wrongEnd = native(path, 4, 'start');
  near(brepMassProperties(wrongEnd, 1).volume, brepMassProperties(candidate, 1).volume);
  assert.equal(perpendicularAnnularOutletOffsetEvidence(original, wrongEnd, path, source, 4), undefined);
  assert.equal(perpendicularAnnularOutletOffsetEvidence(original, original, path, source, 4), undefined);
  for (const distance of [0, -4, -10, -11, Number.NaN, Number.POSITIVE_INFINITY, 10001])
    assert.equal(perpendicularAnnularOutletOffsetEvidence(original, candidate, path, source, distance), undefined);
  for (const changed of [{ ...source, feature: 'stale' }, { ...source, face: 'w.start' }, { ...source, outerRadius: 2.00000001 },
    { ...source, boreRadius: 1.00000001 }, { ...source, boreRadius: 2 }, { ...source, boreRadius: 0 }])
    assert.equal(perpendicularAnnularOutletOffsetEvidence(original, candidate, path, changed, 4), undefined);
  const changedPath = rail(); changedPath.controlPoints[0][0] -= 1; changedPath.controlPoints[1][0] -= .5;
  assert.equal(perpendicularAnnularOutletOffsetEvidence(original, candidate, changedPath, source, 4), undefined);
  assert.equal(perpendicularAnnularOutletOffsetEvidence(original, native(changedPath, 4), path, source, 4), undefined);
});

test('both source and candidate require actual pcurves on the outlet, opposite inlet and all three joins', () => {
  const path = rail(), original = native(path), candidate = native(path, -4);
  const receipt = exactPerpendicularAnnularSweepReceipt(original, minimal(path)); assert.ok(receipt);
  const selectedEdges = [receipt.caps[0].outerEdges[0], receipt.caps[1].innerEdges[0],
    ...receipt.junctions.map(join => join.innerEdges[0])];
  for (const target of ['original', 'candidate']) for (const id of selectedEdges) {
    const body = target === 'original' ? original : candidate, use = body.coedges.find(use => use.edge === id)!; assert.ok(use.pcurve);
    for (const pcurve of [null, { ...use.pcurve, controlPoints: use.pcurve.controlPoints.map(([u, v, z]) => [u + .001, v, z] as Point) }]) {
      const changed = { ...body, coedges: body.coedges.map(other => other.id === use.id ? { ...other, pcurve } : other) };
      assert.equal(perpendicularAnnularOutletOffsetEvidence(target === 'original' ? changed : original,
        target === 'candidate' ? changed : candidate, path, source, -4), undefined);
    }
  }
});

test('changed retained coefficients and false carrier or topology ownership remain outside the shared receipt', () => {
  const path = rail(), original = native(path), candidate = native(path, 4);
  const wall = candidate.faces.find(face => face.name?.startsWith('w.first.'))!;
  assert.equal(wall.surface.kind, 'surface'); if (wall.surface.kind !== 'surface') throw new Error('native surface required');
  const surface = wall.surface;
  // This native change is below ordinary geometric tolerance, but a retained packet must remain exact.
  const changed: Brep = { ...candidate, faces: candidate.faces.map(face => face.id !== wall.id ? face : { ...face, surface: {
    ...surface, controlPoints: surface.controlPoints.map(row => row.map(([x, y, z]) => [x, y, z + 1e-14] as Point)),
  } }) };
  assert.ok(checkBrep(changed, { strict: true }).valid);
  assert.equal(perpendicularAnnularOutletOffsetEvidence(original, changed, path, source, 4), undefined);
  const duplicate: Brep = { ...candidate, edges: [...candidate.edges, { ...candidate.edges[0], id: 'duplicate' }] };
  assert.equal(exactPerpendicularAnnularSweepReceipt(duplicate, minimal(path)), undefined);
  assert.equal(perpendicularAnnularOutletOffsetEvidence(original, duplicate, path, source, 4), undefined);
  const renamed: Brep = { ...candidate, source: { family: 'analytic-boolean', id: 'w' } };
  assert.equal(perpendicularAnnularOutletOffsetEvidence(original, renamed, path, source, 4), undefined);
});
