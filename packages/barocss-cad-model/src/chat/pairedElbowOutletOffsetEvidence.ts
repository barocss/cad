import { CadNumericPolicy, type Brep, type Point } from '@barocss/cad';
import { add, len, scale, sub, unit } from '../engine/vec3';
import { canonical } from '../util/revision';
import { pairedLineArcDuctEvidence } from './pairedLineArcDuctEvidence';

type Path = Parameters<typeof pairedLineArcDuctEvidence>[1];
type Source = Parameters<typeof pairedLineArcDuctEvidence>[2];
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a - b) <= CadNumericPolicy.linearTolerance;
const pointNear = (a: Point, b: Point) => near(len(sub(a, b)), 0);
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Geometry may move, but all original names, IDs, orientations and incidence must remain. */
function incidence(brep: Brep) {
  return {
    source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
    faces: brep.faces.map(({ surface: _surface, ...face }) => face),
    edges: brep.edges.map(({ curve: _curve, ...edge }) => edge),
    coedges: brep.coedges.map(({ pcurve: _pcurve, ...use }) => use),
    vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex),
  };
}

/** Include every native chart, edge and vertex on a retained face, including both joins. */
function boundary(brep: Brep, id: string) {
  const face = brep.faces.find(face => face.id === id);
  const loops = brep.loops.filter(loop => face?.loops.includes(loop.id));
  const uses = brep.coedges.filter(use => loops.some(loop => loop.id === use.loop));
  const edges = brep.edges.filter(edge => uses.some(use => use.edge === edge.id));
  return { face, loops, uses, edges, vertices: brep.vertices.filter(vertex => edges.some(edge => edge.vertices.includes(vertex.id))) };
}

/** Independently certify a signed move of the original paired duct outlet, without changing its source. */
export function pairedElbowOutletOffsetEvidence(original: Brep, candidate: Brep, path: Path, source: Source, distance: number) {
  try {
    if (!Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs) return;
    const before = pairedLineArcDuctEvidence(original, path, source);
    if (!before || before.pathKind !== 'line-arc-line' || !before.throughApertures.junctions
      || before.throughApertures.dimensions.tailLength! + distance < .0001) return;
    // Recover the physical terminal direction from authored points, not the production Offset frame.
    const normal = unit(sub(path.controlPoints[6], path.controlPoints[4])), vector = scale(normal, distance);
    const movedPath = { ...path, controlPoints: path.controlPoints.map(point => [...point] as Point) };
    movedPath.controlPoints[5] = add(path.controlPoints[5], scale(vector, .5));
    movedPath.controlPoints[6] = add(path.controlPoints[6], vector);
    const after = pairedLineArcDuctEvidence(candidate, movedPath, source);
    if (!after || after.pathKind !== 'line-arc-line' || !after.throughApertures.junctions
      || !same(incidence(original), incidence(candidate))
      || !same(before.throughApertures.junctions, after.throughApertures.junctions)
      || !same(before.caps[0], after.caps[0])) return;
    const [originalCap, movedCap] = [before.caps[1], after.caps[1]];
    if (!pointNear(originalCap.plane.normal, normal) || !pointNear(movedCap.plane.normal, normal)
      || !pointNear(movedCap.center, add(originalCap.center, vector))
      || !same(originalCap.outerEdges, movedCap.outerEdges)
      || !same(originalCap.innerEdges, movedCap.innerEdges)) return;
    const capEdges = new Set(originalCap.outerEdges.concat(originalCap.innerEdges));
    for (const edge of original.edges.filter(edge => capEdges.has(edge.id))) {
      const moved = candidate.edges.find(other => other.id === edge.id);
      if (!moved || !same({ ...edge.curve, controlPoints: undefined }, { ...moved.curve, controlPoints: undefined })
        || edge.curve.controlPoints.some((point, index) => !pointNear(moved.curve.controlPoints[index], add(point, vector)))) return;
    }
    const fixed = original.faces.filter(face => face.name !== originalCap.name && !face.name?.startsWith(`${original.source.id}.tail.`));
    if (fixed.some(face => !same(boundary(original, face.id), boundary(candidate, face.id)))) return;
    const through = before.throughApertures, exterior = through.dimensions.exterior;
    const outerArea = exterior.radial * exterior.axial;
    const cavityAreas = originalCap.apertures.map(aperture => aperture.dimensions.radial * aperture.dimensions.axial);
    const sectionArea = outerArea - cavityAreas.reduce((sum, area) => sum + area, 0);
    // Integrate the rectangular material section and its signed straight prism independently.
    const sectionCenter = scale(originalCap.apertures.reduce((moment, aperture, index) =>
      sub(moment, scale(aperture.center, cavityAreas[index])), scale(originalCap.center, outerArea)), 1 / sectionArea);
    const analytic = sectionArea * distance, native = after.throughApertures.volume.native - through.volume.native;
    const total = through.volume.analytic + analytic;
    const centroid = scale(add(scale(through.centroid.analytic, through.volume.analytic),
      scale(add(sectionCenter, scale(vector, .5)), analytic)), 1 / total);
    const volumeTolerance = CadNumericPolicy.relativeComparison * .1 * Math.max(1, total, through.volume.analytic);
    if (!(sectionArea > 0 && total > 0) || !Number.isFinite(native) || Math.abs(native - analytic) > volumeTolerance
      || !pointNear(centroid, after.throughApertures.centroid.native)) return;
    return {
      pathKind: 'line-arc-line' as const, face: originalCap.name, distance, displacement: { normal, vector },
      originalCap, movedCap, retained: { inlet: before.caps[0], junctions: through.junctions, faces: fixed.map(face => face.name!) },
      throughApertures: after.throughApertures,
      materialChange: { sectionArea, analytic, native, method: 'quadrature' as const },
      volume: { original: through.volume, candidate: after.throughApertures.volume },
      centroid: { analytic: centroid, native: after.throughApertures.centroid.native },
      maximumGapMM: Math.max(through.maximumGapMM, after.throughApertures.maximumGapMM),
    };
  } catch { return; }
}
