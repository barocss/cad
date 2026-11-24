import { brepMassProperties, CadNumericPolicy, type Brep, type Curve, type Point } from '@barocss/cad';
import { exactPerpendicularAnnularSweepReceipt } from '@barocss/cad/internal/exact-paired-elbow-offset';
import { add, len, scale, sub, unit } from '../engine/vec3';
import { canonical } from '../util/revision';

type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;
interface Source { readonly feature: string; readonly face: string; readonly outerRadius: number; readonly boreRadius: number }
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const pointNear = (a: Point, b: Point, tolerance: number = CadNumericPolicy.linearTolerance) => len(sub(a, b)) <= tolerance;

/** Keep every owner, orientation, loop walk and native entity ID exact. */
function incidence(brep: Brep) {
  return { source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
    faces: brep.faces.map(({ surface: _surface, ...face }) => face),
    edges: brep.edges.map(({ curve: _curve, ...edge }) => edge),
    coedges: brep.coedges.map(({ pcurve: _pcurve, ...use }) => use),
    vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex) };
}

function boundary(brep: Brep, id: string) {
  const face = brep.faces.find(face => face.id === id), loops = brep.loops.filter(loop => face?.loops.includes(loop.id));
  const uses = brep.coedges.filter(use => loops.some(loop => loop.id === use.loop));
  const edges = brep.edges.filter(edge => uses.some(use => use.edge === edge.id));
  return { face, loops, uses, edges, vertices: brep.vertices.filter(vertex => edges.some(edge => edge.vertices.includes(vertex.id))) };
}

function junctions(brep: Brep, ids: readonly string[]) {
  return ids.map(id => ({ edge: brep.edges.find(edge => edge.id === id), uses: brep.coedges.filter(use => use.edge === id) }));
}

/** Inspect the actual original/candidate packets and integrate the signed outlet cylinder; never rebuild a Sweep. */
export function perpendicularAnnularOutletOffsetEvidence(original: Brep, candidate: Brep, path: Path, source: Source, distance: number) {
  try {
    const { feature, face, outerRadius, boreRadius } = source;
    if (!feature || face !== `${feature}.end` || !Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs
      || ![outerRadius, boreRadius].every(radius => Number.isFinite(radius) && radius > 0 && radius <= CadNumericPolicy.coordinateAbs)
      || !(outerRadius > boreRadius)) return;
    const minimal = { id: feature, mode: 'exact' as const, path: { ...path, kind: 'curve' as const, id: 'path' } };
    const before = exactPerpendicularAnnularSweepReceipt(original, minimal);
    if (!before || before.dimensions.tailLength + distance < .0001) return;
    // Recover intent from authored endpoints, independently of the production Offset frame.
    const normal = unit(sub(path.controlPoints[8], path.controlPoints[6])), vector = scale(normal, distance);
    const movedPath = { ...path, controlPoints: path.controlPoints.map(point => [...point] as Point) };
    movedPath.controlPoints[7] = add(movedPath.controlPoints[7], scale(vector, .5));
    movedPath.controlPoints[8] = add(movedPath.controlPoints[8], vector);
    if (same(movedPath.controlPoints[8], path.controlPoints[8])) return;
    const after = exactPerpendicularAnnularSweepReceipt(candidate, { ...minimal, path: { ...minimal.path, ...movedPath } });
    if (!after || !same(incidence(original), incidence(candidate)) || !same(before.caps[0], after.caps[0])
      || !same(before.junctions, after.junctions)) return;
    for (const packet of [before, after]) if (Math.abs(packet.section.outerRadius - outerRadius) > packet.roundoffMM
      || Math.abs(packet.section.boreRadius - boreRadius) > packet.roundoffMM) return;
    const originalCap = before.caps[1], movedCap = after.caps[1], roundoff = Math.max(before.roundoffMM, after.roundoffMM);
    if (originalCap.face !== face || movedCap.face !== face || originalCap.faceId !== movedCap.faceId
      || !pointNear(originalCap.normal, normal) || !pointNear(movedCap.normal, normal)
      || !pointNear(movedCap.center, add(originalCap.center, vector), roundoff)
      || !same(originalCap.outerEdges, movedCap.outerEdges) || !same(originalCap.innerEdges, movedCap.innerEdges)) return;
    const capBefore = boundary(original, originalCap.faceId), capAfter = boundary(candidate, movedCap.faceId);
    const a = capBefore.face?.surface, b = capAfter.face?.surface;
    if (a?.kind !== 'surface' || b?.kind !== 'surface' || !same(capBefore.loops, capAfter.loops)
      || !same(capBefore.uses, capAfter.uses) || !same({ ...a, controlPoints: undefined }, { ...b, controlPoints: undefined })
      || a.controlPoints.some((row, i) => row.some((point, j) => !b.controlPoints[i]?.[j]
        || !pointNear(b.controlPoints[i][j], add(point, vector), roundoff)))) return;
    for (const edge of capBefore.edges) {
      const moved = candidate.edges.find(other => other.id === edge.id);
      if (!moved || !same({ ...edge.curve, controlPoints: undefined }, { ...moved.curve, controlPoints: undefined })
        || edge.curve.controlPoints.some((point, i) => !moved.curve.controlPoints[i]
          || !pointNear(moved.curve.controlPoints[i], add(point, vector), roundoff))) return;
    }
    for (const vertex of capBefore.vertices) {
      const moved = candidate.vertices.find(other => other.id === vertex.id);
      if (!moved || !pointNear(moved.point, add(vertex.point, vector), roundoff)) return;
    }
    const fixed = original.faces.filter(other => other.name !== face && !other.name?.startsWith(`${feature}.tail.`));
    const joins = before.junctions.flatMap(join => [...join.outerEdges, ...join.innerEdges]);
    if (fixed.length !== 13 || joins.length !== 12 || new Set(joins).size !== 12
      || fixed.some(other => !same(boundary(original, other.id), boundary(candidate, other.id)))
      || !same(junctions(original, joins), junctions(candidate, joins))) return;
    const originalMass = brepMassProperties(original, 1), candidateMass = brepMassProperties(candidate, 1);
    const sectionArea = Math.PI * (outerRadius ** 2 - boreRadius ** 2), analytic = sectionArea * distance;
    const native = candidateMass.volume - originalMass.volume, total = originalMass.volume + analytic;
    const prismCenter = add(originalCap.center, scale(vector, .5));
    const centroid = scale(add(scale(originalMass.centroid, originalMass.volume), scale(prismCenter, analytic)), 1 / total);
    const volumeTolerance = CadNumericPolicy.relativeComparison * .1 * Math.max(1, Math.abs(total), originalMass.volume);
    if (!(sectionArea > 0 && total > 0) || !Number.isFinite(native) || Math.abs(native - analytic) > volumeTolerance
      || !pointNear(centroid, candidateMass.centroid)) return;
    return { pathKind: before.pathKind, face, distance, displacement: { normal, vector }, section: { outerRadius, boreRadius, area: sectionArea },
      originalCap, movedCap, retained: { inlet: before.caps[0], junctions: before.junctions, faces: fixed.map(other => other.name!) },
      materialChange: { sectionArea, analytic, native, method: 'quadrature' as const },
      volume: { original: originalMass.volume, candidate: candidateMass.volume, analytic: total },
      centroid: { analytic: centroid, native: candidateMass.centroid }, maximumGapMM: Math.max(before.maximumGapMM, after.maximumGapMM) };
  } catch { return; }
}
