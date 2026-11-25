// 45° chamfer drawing dimension geometry: resolves one native straight bevel edge and one
// adjacent straight parent wall in an ordinary unbroken orthographic view (`front`, `top`, `right`),
// verifying true-shape view alignment, shared 3D vertex, opposite perpendicular parent wall, and
// exact 45° equal-setback geometry before any display rounding.
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { dot } from '../engine/vec3';
import { isOrthographicView } from './foreshorten';
import type { DimView, EdgeRef, Vec3, XY } from './types';

export interface ChamferGeometry {
  /** Shared 3D corner vertex between chamfer bevel and adjacent parent edge. */
  readonly shared3: Vec3;
  /** Opposite 3D vertex of the chamfer bevel (meets perpendicular parent wall). */
  readonly opposite3: Vec3;
  /** Midpoint of the chamfer bevel in view 2D coordinates (mm). */
  readonly midpoint: XY;
  /** Exact 3D midpoint of the chamfer bevel (mm). */
  readonly midpoint3: Vec3;
  /** Exact equal setback leg length `d` (mm), NOT the bevel hypotenuse `d * sqrt(2)`. */
  readonly setback: number;
  /** Raw measured bevel angle in degrees (verified within 0.01° of 45°). */
  readonly angleDeg: number;
}

export type ChamferResolveResult =
  | { readonly ok: true; readonly geometry: ChamferGeometry }
  | { readonly ok: false; readonly reason: string };

export type ChamferEdgePickResult =
  | { readonly ok: true; readonly ref: EdgeRef }
  | { readonly ok: false; readonly reason: string };

const IN_PLANE_TOL = 1e-4;
const ANGLE_TOL_DEG = 0.01;
const PERP_TOL = 1e-4;

function sub3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function mid3(a: readonly number[], b: readonly number[]): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function unit3(v: Vec3): Vec3 | null {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-9 ? [v[0] / len, v[1] / len, v[2] / len] : null;
}

function projectPoint(pr: BrepProjection, p: readonly number[]): XY {
  return [dot(p, pr.right), dot(p, pr.up)];
}

function isTrueShapeStraightEdge(pr: BrepProjection, edge: ProjectedEdge): boolean {
  if (edge.kind !== 'line' || !edge.ends || edge.circle) return false;
  if (!edge.pieces.some(p => p.visible)) return false;
  const dir = unit3(sub3(edge.ends[1], edge.ends[0]));
  if (!dir) return false;
  return Math.abs(dot(dir, pr.toward)) <= IN_PLANE_TOL;
}

/** Validate a single straight edge clicked for a chamfer dimension in `view`. */
export function pickChamferLineEdge(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: DimView,
): ChamferEdgePickResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Chamfer dimensions are supported only on ordinary front, top, and right views.' };
  }
  if (edge.kind === 'silhouette') {
    return { ok: false, reason: 'Silhouettes are not supported for chamfer dimensions. Select a straight chamfer bevel edge.' };
  }
  if (edge.kind !== 'line' || !edge.ends || edge.circle) {
    return { ok: false, reason: 'Select a straight edge. Curves, fillets, and circles are not supported for chamfer dimensions.' };
  }
  if (!edge.pieces.some(p => p.visible)) {
    return { ok: false, reason: 'Select a visible straight edge in this view.' };
  }
  const len = dist3(edge.ends[0], edge.ends[1]);
  if (len <= 1e-4) {
    return { ok: false, reason: 'The selected edge is too short for a chamfer dimension.' };
  }
  const dir = unit3(sub3(edge.ends[1], edge.ends[0]));
  if (!dir || Math.abs(dot(dir, pr.toward)) > IN_PLANE_TOL) {
    return { ok: false, reason: 'This edge is foreshortened in this view. Dimension a 45° chamfer where it shows true shape.' };
  }
  return { ok: true, ref: { edge: edge.name, near: mid3(edge.ends[0], edge.ends[1]) } };
}

function resolveUniqueStraightEdge(
  pr: BrepProjection,
  ref: EdgeRef,
  roleLabel: string,
): { ok: true; edge: ProjectedEdge } | { ok: false; reason: string } {
  const named = pr.edges.filter(e => e.name === ref.edge);
  if (!named.length) {
    return { ok: false, reason: `The ${roleLabel} edge is no longer in the part.` };
  }
  const valid: { edge: ProjectedEdge; distance: number; len: number }[] = [];
  let rejectedReason: string | null = null;
  for (const edge of named) {
    if (edge.kind === 'silhouette') {
      rejectedReason ??= `The ${roleLabel} reference is a silhouette, which is not supported for chamfer dimensions.`;
      continue;
    }
    if (edge.kind !== 'line' || !edge.ends || edge.circle) {
      rejectedReason ??= `The ${roleLabel} reference is no longer a straight edge.`;
      continue;
    }
    if (!edge.pieces.some(p => p.visible)) {
      rejectedReason ??= `The ${roleLabel} edge is no longer visible in this view.`;
      continue;
    }
    const len = dist3(edge.ends[0], edge.ends[1]);
    if (len <= 1e-4) {
      rejectedReason ??= `The ${roleLabel} edge is degenerate.`;
      continue;
    }
    const dir = unit3(sub3(edge.ends[1], edge.ends[0]));
    if (!dir || Math.abs(dot(dir, pr.toward)) > IN_PLANE_TOL) {
      rejectedReason ??= `The ${roleLabel} edge does not show true shape in this view.`;
      continue;
    }
    valid.push({ edge, distance: dist3(mid3(edge.ends[0], edge.ends[1]), ref.near), len });
  }
  if (!valid.length) {
    return { ok: false, reason: rejectedReason ?? `The ${roleLabel} edge cannot be resolved.` };
  }
  valid.sort((a, b) => a.distance - b.distance);
  if (valid.length > 1) {
    const tieTol = 1e-4 * Math.max(1, valid[0].len);
    if (Math.abs(valid[1].distance - valid[0].distance) <= tieTol) {
      return { ok: false, reason: `Multiple ${roleLabel} edges with the same reference overlap at this position.` };
    }
  }
  return { ok: true, edge: valid[0].edge };
}

/**
 * Resolve and strictly validate one 45° equal-setback chamfer pair `(chamferRef, adjacentRef)` in `view`.
 * Verifies shared 3D corner vertex, raw 45° angle (±0.01° before rounding), and perpendicular opposite
 * parent wall at the bevel's far 3D vertex so arbitrary oblique segments are never accepted.
 */
export function resolveChamferEdges(
  pr: BrepProjection,
  chamferRef: EdgeRef,
  adjacentRef: EdgeRef,
  view: DimView,
): ChamferResolveResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Chamfer dimensions are supported only on ordinary front, top, and right views.' };
  }
  const cRes = resolveUniqueStraightEdge(pr, chamferRef, 'chamfer');
  if (!cRes.ok) return cRes;
  const aRes = resolveUniqueStraightEdge(pr, adjacentRef, 'adjacent');
  if (!aRes.ok) return aRes;
  const cEdge = cRes.edge;
  const aEdge = aRes.edge;
  if (cEdge === aEdge) {
    return { ok: false, reason: 'Select two distinct edges: the 45° chamfer bevel and an adjacent straight wall.' };
  }
  const cEnds = cEdge.ends!;
  const aEnds = aEdge.ends!;
  const cLen = dist3(cEnds[0], cEnds[1]);
  const aLen = dist3(aEnds[0], aEnds[1]);
  const vertTol = 1e-4 * Math.max(1, cLen, aLen);

  // Find shared 3D vertex (must be unique; rejects screen-only crossings at different depths).
  const matches: { ci: 0 | 1; ai: 0 | 1 }[] = [];
  for (const ci of [0, 1] as const) {
    for (const ai of [0, 1] as const) {
      if (dist3(cEnds[ci], aEnds[ai]) <= vertTol) {
        matches.push({ ci, ai });
      }
    }
  }
  if (matches.length !== 1) {
    return { ok: false, reason: 'The chamfer bevel and adjacent edge must share one 3D corner vertex.' };
  }

  const { ci, ai } = matches[0];
  const shared3: Vec3 = [cEnds[ci][0], cEnds[ci][1], cEnds[ci][2]];
  const opposite3: Vec3 = [cEnds[1 - ci][0], cEnds[1 - ci][1], cEnds[1 - ci][2]];
  const adjacentFar3: Vec3 = [aEnds[1 - ai][0], aEnds[1 - ai][1], aEnds[1 - ai][2]];

  const uC = unit3(sub3(opposite3, shared3));
  const uA = unit3(sub3(adjacentFar3, shared3));
  if (!uC || !uA) {
    return { ok: false, reason: 'The chamfer or adjacent edge has zero length.' };
  }

  // Raw angle between bevel and adjacent wall: exterior 90° corner chamfer meets wall at 135° (bevel angle 45°).
  const cosInterior = dot(uC, uA);
  if (cosInterior >= 0) {
    return { ok: false, reason: 'The selected edges do not form a 45° corner chamfer.' };
  }
  const bevelAngleDeg = Math.acos(Math.max(-1, Math.min(1, -cosInterior))) * 180 / Math.PI;
  if (Math.abs(bevelAngleDeg - 45) > ANGLE_TOL_DEG) {
    return { ok: false, reason: `Only exact 45° chamfers are supported (measured ${bevelAngleDeg.toFixed(2)}°).` };
  }

  // Verify the opposite parent wall at `opposite3` is straight, visible, true-shape, perpendicular to `adjacent`,
  // and meets the bevel at symmetric 45° (equal-setback 90° corner).
  const oppVertTol = 1e-4 * Math.max(1, cLen);
  const oppositeCandidates: Vec3[] = [];
  for (const candidate of pr.edges) {
    if (candidate === cEdge || candidate === aEdge) continue;
    if (!isTrueShapeStraightEdge(pr, candidate)) continue;
    const ends = candidate.ends!;
    const d0 = dist3(ends[0], opposite3);
    const d1 = dist3(ends[1], opposite3);
    if (d0 <= oppVertTol && d1 > oppVertTol) {
      const uOpp = unit3(sub3(ends[1], ends[0]));
      if (uOpp) oppositeCandidates.push(uOpp);
    } else if (d1 <= oppVertTol && d0 > oppVertTol) {
      const uOpp = unit3(sub3(ends[0], ends[1]));
      if (uOpp) oppositeCandidates.push(uOpp);
    }
  }

  const uCFromOpp: Vec3 = [-uC[0], -uC[1], -uC[2]];
  let verifiedOpp: Vec3 | null = null;
  for (const uOpp of oppositeCandidates) {
    if (Math.abs(dot(uA, uOpp)) > PERP_TOL) continue;
    const cosOpp = dot(uCFromOpp, uOpp);
    if (cosOpp >= 0) continue;
    const oppAngleDeg = Math.acos(Math.max(-1, Math.min(1, -cosOpp))) * 180 / Math.PI;
    if (Math.abs(oppAngleDeg - 45) <= ANGLE_TOL_DEG) {
      verifiedOpp = uOpp;
      break;
    }
  }
  if (!verifiedOpp) {
    return { ok: false, reason: 'Could not verify a perpendicular opposite parent wall at the other end of the 45° chamfer.' };
  }

  // Compute both setback legs independently from raw 3D coordinates and verify equality.
  const bevelVec = sub3(opposite3, shared3);
  const legAlongAdjacent = Math.abs(dot(bevelVec, uA));
  const legAlongOpposite = Math.abs(dot(bevelVec, verifiedOpp));
  if (Math.abs(legAlongAdjacent - legAlongOpposite) > 1e-4 * Math.max(1, legAlongAdjacent)) {
    return { ok: false, reason: 'The chamfer does not have equal 45° setback legs.' };
  }
  const setback = (legAlongAdjacent + legAlongOpposite) / 2;
  const mp3 = mid3(shared3, opposite3);

  return {
    ok: true,
    geometry: {
      shared3,
      opposite3,
      midpoint: projectPoint(pr, mp3),
      midpoint3: mp3,
      setback,
      angleDeg: bevelAngleDeg,
    },
  };
}
