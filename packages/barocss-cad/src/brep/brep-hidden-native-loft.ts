import type { Brep, BrepEdge, BrepFace } from './brep-core.js';
import type { BrepMesh } from './brep-tessellate.js';
import { curveEvaluator } from '../core/math.js';
import { surfaceD1Evaluator } from '../core/derivatives.js';
import { cross, dot, len, scale, unit } from '../core/vec3.js';
import type { Point } from '../types.js';
import { createRectangularIsoBinder, NativeIsoBudgetError, type NativeIsoBoundary, type NativeIsoJoin } from './brep-hidden-native-iso-binding.js';

type Project = (point: Point) => readonly [number, number];
export interface NativeLoftMesh { mesh: BrepMesh; edgeParameters?: ReadonlyMap<BrepEdge, readonly number[]> }
export interface NativeLoftProbe { neighbor: BrepFace; at(s: number): Point | undefined }

/** Limit native outline preparation to the small four-sided Loft profile. */
export function tracksNativeLoftOutline(brep: Brep, quality: number): boolean {
  return Number.isInteger(quality) && quality >= 1 && quality <= 16 && brep.source?.family === 'loft'
    && brep.bodies.length === 1 && brep.shells.length === 1 && brep.shells[0].closed
    && brep.faces.length === 6 && brep.loops.length === 6 && brep.coedges.length === 24
    && brep.edges.length === 12 && brep.vertices.length === 8
    && brep.edges.every(edge => edge.curve.controlPoints.length <= 16)
    && brep.faces.every(face => face.surface.kind === 'surface' && face.surface.controlPoints.length <= 16
      && face.surface.controlPoints.every(row => row.length <= 16));
}

function matchesChain(chain: readonly Point[], points: Float64Array, project: Project, epsilon: number, reverse: boolean): boolean {
  if (chain.length * 3 !== points.length) return false;
  return chain.every((point, i) => {
    const at = 3 * (reverse ? chain.length - 1 - i : i);
    const station: Point = [points[at], points[at + 1], points[at + 2]];
    const screen = project(station);
    return project(point).every((value, k) => Object.is(value, screen[k]))
      && Math.hypot(station[0] - point[0], station[1] - point[1], station[2] - point[2]) <= epsilon;
  });
}

function boundaryNormal(boundary: NativeIsoBoundary) {
  const evaluate = surfaceD1Evaluator(boundary.originalSurface);
  const { edgeDomain, isoDomain, direction, fixedAxis, fixedValue } = boundary.parameters;
  return (parameter: number): Point | undefined => {
    const t = (parameter - edgeDomain[0]) / (edgeDomain[1] - edgeDomain[0]);
    const fraction = direction === 1 ? t : 1 - t;
    const moving = fraction === 0 ? isoDomain[0] : fraction === 1 ? isoDomain[1] : isoDomain[0] + fraction * (isoDomain[1] - isoDomain[0]);
    try {
      const { du, dv } = fixedAxis === 'u' ? evaluate(fixedValue, moving) : evaluate(moving, fixedValue);
      const normal = cross(unit(du), unit(dv));
      return len(normal) > 1e-9 ? scale(unit(normal), boundary.face.sense === 'forward' ? 1 : -1) : undefined;
    } catch {
      return;
    }
  };
}

/** Bind only complete native seam chains. The caller retains all visibility tests. */
export function createNativeLoftProbe(breps: readonly Brep[], project: Project, toward: Point) {
  const binder = createRectangularIsoBinder();
  let attempts = 0;
  return (body: Brep, face: BrepFace, chain: readonly Point[], source: NativeLoftMesh): NativeLoftProbe | undefined => {
    if (!source.edgeParameters || breps.length > 16 || attempts >= 64 || chain.length < 3 || chain.length > 128
      || face.surface.kind !== 'surface' || breps.indexOf(body) !== breps.lastIndexOf(body)) return;
    attempts++;
    const epsilon = 1024 * Number.EPSILON * Math.max(1, ...face.surface.controlPoints.flat(2).map(Math.abs));
    const matches = source.mesh.edges.flatMap(edge => [false, true].flatMap(reverse =>
      matchesChain(chain, edge.points, project, epsilon, reverse) ? [{ edge, reverse }] : []));
    if (matches.length !== 1) return;
    const [{ edge: sampled, reverse }] = matches;
    const edge = body.edges.find(edge => edge.id === sampled.edgeId);
    const stations = edge && source.edgeParameters.get(edge);
    if (!edge || !stations || stations.length !== chain.length
      || !stations.every((t, i) => Number.isFinite(t) && (i === 0 || t > stations[i - 1]))) return;
    const uses = body.coedges.filter(use => use.edge === edge.id);
    const incidents = uses.map(use => body.faces.find(f => f.loops.includes(use.loop)));
    const neighbor = incidents.find(f => f !== face);
    if (incidents.length !== 2 || !incidents.includes(face) || !neighbor) return;
    let binding: NativeIsoJoin;
    try {
      const result = binder.bind(body, edge, face, neighbor);
      if (result.kind !== 'bound') return;
      binding = result.binding;
      const bound = Math.min(binding.firstBoundary.coefficientRoundoffMM, binding.secondBoundary.coefficientRoundoffMM);
      if (!matchesChain(chain, sampled.points, project, bound, reverse)) return;
    } catch (error) {
      if (error instanceof NativeIsoBudgetError) return;
      throw error;
    }
    const native = curveEvaluator(edge.curve), n = stations.length - 1;
    const firstNormal = boundaryNormal(binding.firstBoundary), secondNormal = boundaryNormal(binding.secondBoundary);
    return { neighbor, at: s => {
      const i = Math.min(n - 1, Math.floor(s)), fraction = s - i;
      const a = stations[reverse ? n - i : i], b = stations[reverse ? n - i - 1 : i + 1];
      const t = fraction === 0 ? a : fraction === 1 ? b : a + fraction * (b - a);
      const na = firstNormal(t), nb = secondNormal(t);
      if (!na || !nb || dot(na, nb) <= 1 - 1e-8 || Math.abs(dot(na, toward)) > 1e-9 || Math.abs(dot(nb, toward)) > 1e-9) return;
      return native(t);
    } };
  };
}
