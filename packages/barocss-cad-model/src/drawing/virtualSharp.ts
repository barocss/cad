// Source-bound drawing virtual sharp: theoretical intersection point of two distinct, visible,
// unclipped, same-body, same-depth, non-parallel straight edges in an ordinary unbroken
// orthographic view (`front`, `top`, `right`). Computes exact 2D/3D intersection coordinates
// without modifying model B-rep topology, and provides witness extension lines to the virtual corner.
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { dot } from '../engine/vec3';
import { nextFreeId } from '../util/ids';
import type { DrawingVirtualSharp, EdgeRef, SectionViewId, Vec3, XY } from './types';

/** Paper-mm overshoot past the virtual sharp intersection along each extended edge direction. */
export const VIRTUAL_SHARP_OVERSHOOT_MM = 1.5;

export interface VirtualSharpGeometry {
  /** Exact theoretical intersection point in view coordinates (model mm). */
  readonly point: XY;
  /** Exact theoretical intersection point in 3D model coordinates (model mm). */
  readonly point3: Vec3;
  /** Projected 2D endpoints of the first source edge (view mm). */
  readonly firstEnds: readonly [XY, XY];
  /** Projected 2D endpoints of the second source edge (view mm). */
  readonly secondEnds: readonly [XY, XY];
  /** Endpoint of the first edge nearer to the virtual sharp (view mm). */
  readonly firstNearEnd: XY;
  /** Endpoint of the second edge nearer to the virtual sharp (view mm). */
  readonly secondNearEnd: XY;
  /** Intersection angle between the two lines in degrees (0 < angle <= 90). */
  readonly angleDeg: number;
}

export type VirtualSharpResolveResult =
  | { readonly ok: true; readonly geometry: VirtualSharpGeometry }
  | { readonly ok: false; readonly reason: string };

export type VirtualSharpEdgePickResult =
  | { readonly ok: true; readonly ref: EdgeRef; readonly ends: readonly [XY, XY]; readonly length: number }
  | { readonly ok: false; readonly reason: string };

export type ResolvedVirtualSharp =
  | { readonly ok: true; readonly item: DrawingVirtualSharp; readonly geometry: VirtualSharpGeometry }
  | { readonly ok: false; readonly item: DrawingVirtualSharp; readonly reason: string };

const VIEW_PLANE_TOL = 1e-6;
/** Minimum |sin(angle)| (~0.057°) to reject parallel, collinear, and ill-conditioned near-parallel lines. */
const MIN_SIN_ANGLE = 1e-3;
const MIN_LENGTH = 1e-4;
const MAX_EXTENSION_FACTOR = 100;

function sub3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function mid3(a: readonly number[], b: readonly number[]): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function cross3(a: readonly number[], b: readonly number[]): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function projectPoint(pr: BrepProjection, p: readonly number[]): XY {
  return [dot(p, pr.right), dot(p, pr.up)];
}

function isPrincipalOrthoView(view: string): view is SectionViewId {
  return view === 'front' || view === 'top' || view === 'right';
}

function bodyPrefixOf(edgeName: string): string {
  const colon = edgeName.indexOf(':');
  return colon >= 0 ? edgeName.slice(0, colon) : '';
}

function isVisibleStraightLine(pr: BrepProjection, edge: ProjectedEdge): boolean {
  if (!edge.ends || edge.pieces.length === 0) return false;
  if (!edge.pieces.some(p => p.visible)) return false;
  const a2 = projectPoint(pr, edge.ends[0]);
  const b2 = projectPoint(pr, edge.ends[1]);
  return Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) > MIN_LENGTH;
}

/** Generate the next unused virtual sharp ID (`vs1`, `vs2`, ...). */
export function newVirtualSharpId(existing: readonly DrawingVirtualSharp[] = []): string {
  return nextFreeId('vs', new Set(existing.map(item => item.id)));
}

/** Validate a single hovered or clicked straight edge for a virtual sharp in `view`. */
export function pickVirtualSharpEdge(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: string,
): VirtualSharpEdgePickResult {
  if (!isPrincipalOrthoView(view)) {
    return { ok: false, reason: 'Virtual sharps are supported only on ordinary front, top, and right views.' };
  }
  if (edge.kind === 'silhouette') {
    return { ok: false, reason: 'Silhouettes are not supported for virtual sharps. Select two straight edges.' };
  }
  if (edge.kind !== 'line' || !edge.ends) {
    return { ok: false, reason: 'Select a visible straight edge. Curves and arcs are not supported for virtual sharps.' };
  }
  const [p0, p1] = edge.ends;
  const len3 = dist3(p0, p1);
  if (!Number.isFinite(len3) || len3 <= MIN_LENGTH) {
    return { ok: false, reason: 'The selected straight edge has zero or invalid length.' };
  }
  const d3 = sub3(p1, p0);
  const u3: Vec3 = [d3[0] / len3, d3[1] / len3, d3[2] / len3];
  if (Math.abs(dot(u3, pr.toward)) > VIEW_PLANE_TOL) {
    return { ok: false, reason: 'Select a straight edge parallel to this view plane.' };
  }
  if (!isVisibleStraightLine(pr, edge)) {
    return { ok: false, reason: 'Select a visible straight edge in this view.' };
  }
  return {
    ok: true,
    ref: { edge: edge.name, near: mid3(p0, p1) },
    ends: [projectPoint(pr, p0), projectPoint(pr, p1)],
    length: len3,
  };
}

function resolveUniqueStraightEdge(
  pr: BrepProjection,
  ref: EdgeRef,
  roleLabel: string,
): { ok: true; edge: ProjectedEdge; p0: Vec3; p1: Vec3; length: number; unit: Vec3 } | { ok: false; reason: string } {
  if (!ref.edge || !Array.isArray(ref.near) || ref.near.length !== 3 || !ref.near.every(Number.isFinite)) {
    return { ok: false, reason: `The ${roleLabel} edge has an invalid reference.` };
  }
  const named = pr.edges.filter(e => e.name === ref.edge);
  if (!named.length) {
    return { ok: false, reason: `The ${roleLabel} edge (${ref.edge}) is no longer in the part.` };
  }
  const valid: { edge: ProjectedEdge; p0: Vec3; p1: Vec3; length: number; unit: Vec3; distance: number }[] = [];
  let rejectedReason: string | null = null;
  for (const edge of named) {
    if (edge.kind === 'silhouette') {
      rejectedReason ??= `The ${roleLabel} reference is a silhouette, which is not supported.`;
      continue;
    }
    if (edge.kind !== 'line' || !edge.ends) {
      rejectedReason ??= `The ${roleLabel} reference is no longer a straight edge.`;
      continue;
    }
    const p0: Vec3 = [edge.ends[0][0], edge.ends[0][1], edge.ends[0][2]];
    const p1: Vec3 = [edge.ends[1][0], edge.ends[1][1], edge.ends[1][2]];
    const len3 = dist3(p0, p1);
    if (!Number.isFinite(len3) || len3 <= MIN_LENGTH) {
      rejectedReason ??= `The ${roleLabel} edge has zero or invalid length.`;
      continue;
    }
    const d3 = sub3(p1, p0);
    const u3: Vec3 = [d3[0] / len3, d3[1] / len3, d3[2] / len3];
    if (Math.abs(dot(u3, pr.toward)) > VIEW_PLANE_TOL) {
      rejectedReason ??= `The ${roleLabel} edge is no longer parallel to this view plane.`;
      continue;
    }
    if (!isVisibleStraightLine(pr, edge)) {
      rejectedReason ??= `The ${roleLabel} edge is no longer visible in this view.`;
      continue;
    }
    const m = mid3(p0, p1);
    valid.push({ edge, p0, p1, length: len3, unit: u3, distance: dist3(m, ref.near) });
  }
  if (!valid.length) {
    return { ok: false, reason: rejectedReason ?? `The ${roleLabel} edge cannot be resolved.` };
  }
  valid.sort((a, b) => a.distance - b.distance);
  if (valid.length > 1) {
    const tieTol = 1e-4 * Math.max(1, valid[0].length);
    if (Math.abs(valid[1].distance - valid[0].distance) <= tieTol) {
      return { ok: false, reason: `Multiple straight edges named ${ref.edge} overlap at this position.` };
    }
  }
  const best = valid[0];
  return { ok: true, edge: best.edge, p0: best.p0, p1: best.p1, length: best.length, unit: best.unit };
}

function distPointToSegment3(p: Vec3, a: Vec3, b: Vec3): number {
  const ab = sub3(b, a);
  const dd = dot(ab, ab);
  const t = dd > 0 ? Math.max(0, Math.min(1, dot(sub3(p, a), ab) / dd)) : 0;
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
}

/**
 * Resolve the theoretical intersection (virtual sharp) of two distinct, visible, same-body,
 * same-depth, non-parallel straight edges directly in a `BrepProjection`.
 */
export function resolveVirtualSharpInProjection(
  pr: BrepProjection,
  firstRef: EdgeRef,
  secondRef: EdgeRef,
): VirtualSharpResolveResult {
  const r1 = resolveUniqueStraightEdge(pr, firstRef, 'first');
  if (!r1.ok) return r1;
  const r2 = resolveUniqueStraightEdge(pr, secondRef, 'second');
  if (!r2.ok) return r2;

  if (bodyPrefixOf(r1.edge.name) !== bodyPrefixOf(r2.edge.name)) {
    return { ok: false, reason: 'Both straight edges must belong to the same body.' };
  }

  const maxLen = Math.max(r1.length, r2.length);
  const geomTol = 1e-4 * Math.max(1, maxLen);

  // Strict same-depth coplanarity check (rejects screen-only skew crossings at different depths).
  const depth1 = dot(mid3(r1.p0, r1.p1), pr.toward);
  const depth2 = dot(mid3(r2.p0, r2.p1), pr.toward);
  if (Math.abs(depth1 - depth2) > geomTol) {
    return { ok: false, reason: 'The two straight edges do not lie in the same 3D depth plane.' };
  }

  // Reject parallel, collinear, and ill-conditioned near-parallel lines.
  const cross = cross3(r1.unit, r2.unit);
  const sinAngle = Math.hypot(cross[0], cross[1], cross[2]);
  if (sinAngle < MIN_SIN_ANGLE) {
    return { ok: false, reason: 'Parallel, collinear, or near-parallel edges do not define a virtual sharp.' };
  }

  // Solve 2D line intersection in view coordinates (guaranteed coplanar at depth1 == depth2).
  const a1 = projectPoint(pr, r1.p0);
  const a2 = projectPoint(pr, r1.p1);
  const b1 = projectPoint(pr, r2.p0);
  const b2 = projectPoint(pr, r2.p1);
  const d1: XY = [a2[0] - a1[0], a2[1] - a1[1]];
  const d2: XY = [b2[0] - b1[0], b2[1] - b1[1]];
  const denom = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(denom) <= 1e-9 * Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1])) {
    return { ok: false, reason: 'The two straight edges are parallel in this view.' };
  }
  const diff: XY = [b1[0] - a1[0], b1[1] - a1[1]];
  const t1 = (diff[0] * d2[1] - diff[1] * d2[0]) / denom;
  if (!Number.isFinite(t1)) {
    return { ok: false, reason: 'The intersection of the two edges is not finite.' };
  }

  // Reconstruct exact 3D intersection along edge 1's infinite line.
  const edge1Vec = sub3(r1.p1, r1.p0);
  const point3: Vec3 = [
    r1.p0[0] + edge1Vec[0] * t1,
    r1.p0[1] + edge1Vec[1] * t1,
    r1.p0[2] + edge1Vec[2] * t1,
  ];
  const point = projectPoint(pr, point3);

  // Verify the intersection is strictly outside both finite segments (a real virtual sharp, not a shared vertex).
  const distToSeg1 = distPointToSegment3(point3, r1.p0, r1.p1);
  const distToSeg2 = distPointToSegment3(point3, r2.p0, r2.p1);
  if (distToSeg1 <= geomTol || distToSeg2 <= geomTol) {
    return { ok: false, reason: 'These edges already meet or cross directly. Select two separated edges (e.g. around a chamfer or fillet).' };
  }
  if (Math.max(distToSeg1, distToSeg2) > MAX_EXTENSION_FACTOR * Math.max(1, maxLen)) {
    return { ok: false, reason: 'The extended intersection is too far away from the selected edges.' };
  }

  const pickNearEnd = (e0: XY, e1: XY): XY =>
    Math.hypot(e0[0] - point[0], e0[1] - point[1]) <= Math.hypot(e1[0] - point[0], e1[1] - point[1]) ? e0 : e1;
  const angleDeg = Math.asin(Math.min(1, sinAngle)) * (180 / Math.PI);

  return {
    ok: true,
    geometry: {
      point,
      point3,
      firstEnds: [a1, a2],
      secondEnds: [b1, b2],
      firstNearEnd: pickNearEnd(a1, a2),
      secondNearEnd: pickNearEnd(b1, b2),
      angleDeg,
    },
  };
}

/**
 * Resolve the theoretical intersection (virtual sharp) of two distinct, visible, same-body,
 * same-depth, non-parallel straight edges in an ordinary orthographic view (`front`, `top`, `right`).
 */
export function resolveVirtualSharp(
  pr: BrepProjection,
  firstRef: EdgeRef,
  secondRef: EdgeRef,
  view: string,
): VirtualSharpResolveResult {
  if (!isPrincipalOrthoView(view)) {
    return { ok: false, reason: 'Virtual sharps are supported only on ordinary front, top, and right views.' };
  }
  return resolveVirtualSharpInProjection(pr, firstRef, secondRef);
}
