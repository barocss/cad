// Source-bound straight centerline bisecting two distinct, visible, unclipped, same-depth,
// parallel, equal-span straight edges in an ordinary unbroken orthographic view (`front`, `top`, `right`).
// Computes exact model-mm bisector geometry independent of endpoint order or pick order; sheet rendering
// extends each end by a fixed paper-mm overshoot (`BISECTOR_EXTENSION_MM`) matching `centres.ts`.
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { dot } from '../engine/vec3';
import { nextFreeId } from '../util/ids';
import type { DrawingBisectorCenterline, EdgeRef, SectionViewId, Vec3, XY } from './types';

/** Paper-mm extension past each native end of a straight bisector centerline (matches `centres.ts`). */
export const BISECTOR_EXTENSION_MM = 2.5;

export interface BisectorCenterlineGeometry {
  /** Unextended start endpoint of the bisector in view coordinates (model mm). */
  readonly start: XY;
  /** Unextended end endpoint of the bisector in view coordinates (model mm). */
  readonly end: XY;
  /** Canonical unit axis direction in view coordinates. */
  readonly axis: XY;
  /** Exact unextended native bisector length (model mm). */
  readonly length: number;
  /** Exact perpendicular separation between the two parallel edges (model mm). */
  readonly separation: number;
  /** Exact 3D start endpoint of the bisector (model mm). */
  readonly start3: Vec3;
  /** Exact 3D end endpoint of the bisector (model mm). */
  readonly end3: Vec3;
  /** Projected 2D endpoints of the first source edge (view mm). */
  readonly firstEnds: readonly [XY, XY];
  /** Projected 2D endpoints of the second source edge (view mm). */
  readonly secondEnds: readonly [XY, XY];
}

export type BisectorCenterlineResolveResult =
  | { readonly ok: true; readonly geometry: BisectorCenterlineGeometry }
  | { readonly ok: false; readonly reason: string };

export type BisectorCenterlineEdgePickResult =
  | { readonly ok: true; readonly ref: EdgeRef; readonly ends: readonly [XY, XY]; readonly length: number }
  | { readonly ok: false; readonly reason: string };

export type ResolvedBisectorCenterline =
  | { readonly ok: true; readonly item: DrawingBisectorCenterline; readonly geometry: BisectorCenterlineGeometry }
  | { readonly ok: false; readonly item: DrawingBisectorCenterline; readonly reason: string };

const PARALLEL_TOL = 1e-6;
const MIN_LENGTH = 1e-4;

function sub3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function mid3(a: readonly number[], b: readonly number[]): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
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

function isFullyVisibleUnclippedLine(pr: BrepProjection, edge: ProjectedEdge): boolean {
  if (!edge.ends || edge.pieces.length === 0) return false;
  if (!edge.pieces.every(p => p.visible)) return false;
  const a2 = projectPoint(pr, edge.ends[0]);
  const b2 = projectPoint(pr, edge.ends[1]);
  const fullLen2 = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]);
  if (fullLen2 <= MIN_LENGTH) return false;
  let visibleLen = 0;
  for (const piece of edge.pieces) {
    if (piece.curve.kind === 'line') {
      visibleLen += Math.hypot(piece.curve.b[0] - piece.curve.a[0], piece.curve.b[1] - piece.curve.a[1]);
    } else if (piece.curve.kind === 'polyline') {
      const pts = piece.curve.points;
      for (let i = 0; i + 1 < pts.length; i++) {
        visibleLen += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      }
    }
  }
  return Math.abs(visibleLen - fullLen2) <= 1e-3 * Math.max(1, fullLen2);
}

/** Generate the next unused straight bisector centerline ID (`cl1`, `cl2`, ...). */
export function newBisectorCenterlineId(existing: readonly DrawingBisectorCenterline[] = []): string {
  return nextFreeId('cl', new Set(existing.map(item => item.id)));
}

/** Validate a single hovered or clicked straight edge for a parallel-edge centerline in `view`. */
export function pickBisectorCenterlineEdge(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: string,
): BisectorCenterlineEdgePickResult {
  if (!isPrincipalOrthoView(view)) {
    return { ok: false, reason: 'Parallel-edge centerlines are supported only on ordinary front, top, and right views.' };
  }
  if (edge.kind === 'silhouette') {
    return { ok: false, reason: 'Silhouettes are not supported for parallel-edge centerlines. Select two parallel straight edges.' };
  }
  if (edge.kind !== 'line' || !edge.ends) {
    return { ok: false, reason: 'Select a visible straight edge. Curves and circular arcs are not supported.' };
  }
  const [p0, p1] = edge.ends;
  const len3 = dist3(p0, p1);
  if (!Number.isFinite(len3) || len3 <= MIN_LENGTH) {
    return { ok: false, reason: 'The selected straight edge has zero or invalid length.' };
  }
  const d3 = sub3(p1, p0);
  const u3: Vec3 = [d3[0] / len3, d3[1] / len3, d3[2] / len3];
  if (Math.abs(dot(u3, pr.toward)) > PARALLEL_TOL) {
    return { ok: false, reason: 'Select a straight edge parallel to the view plane (true length in this view).' };
  }
  if (!isFullyVisibleUnclippedLine(pr, edge)) {
    return { ok: false, reason: 'Select a fully visible, unclipped straight edge in this view.' };
  }
  const a2 = projectPoint(pr, p0);
  const b2 = projectPoint(pr, p1);
  return {
    ok: true,
    ref: { edge: edge.name, near: mid3(p0, p1) },
    ends: [a2, b2],
    length: len3,
  };
}

function resolveUniqueVisibleTrueStraightEdge(
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
    if (Math.abs(dot(u3, pr.toward)) > PARALLEL_TOL) {
      rejectedReason ??= `The ${roleLabel} edge is not parallel to this view plane.`;
      continue;
    }
    if (!isFullyVisibleUnclippedLine(pr, edge)) {
      rejectedReason ??= `The ${roleLabel} edge is hidden or partially clipped in this view.`;
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

/**
 * Resolve two distinct, visible, unclipped, same-body, same-depth, strictly parallel, equal-span
 * straight edges in an ordinary orthographic view and return their exact native bisector centerline.
 */
export function resolveBisectorCenterline(
  pr: BrepProjection,
  firstRef: EdgeRef,
  secondRef: EdgeRef,
  view: string,
): BisectorCenterlineResolveResult {
  if (!isPrincipalOrthoView(view)) {
    return { ok: false, reason: 'Parallel-edge centerlines are supported only on ordinary front, top, and right views.' };
  }
  const r1 = resolveUniqueVisibleTrueStraightEdge(pr, firstRef, 'first');
  if (!r1.ok) return r1;
  const r2 = resolveUniqueVisibleTrueStraightEdge(pr, secondRef, 'second');
  if (!r2.ok) return r2;

  if (bodyPrefixOf(r1.edge.name) !== bodyPrefixOf(r2.edge.name)) {
    return { ok: false, reason: 'Both parallel edges must belong to the same body.' };
  }

  const maxLen = Math.max(r1.length, r2.length);
  const geomTol = 1e-4 * Math.max(1, maxLen);

  // Strict same-depth coplanarity check (rejects screen-parallel edges at different depths).
  const depth1 = dot(mid3(r1.p0, r1.p1), pr.toward);
  const depth2 = dot(mid3(r2.p0, r2.p1), pr.toward);
  if (Math.abs(depth1 - depth2) > geomTol) {
    return { ok: false, reason: 'The two straight edges do not lie at the same depth plane.' };
  }

  // Strict 3D parallelism check (rejects non-parallel and near-parallel edges beyond tolerance).
  const cosAngle = dot(r1.unit, r2.unit);
  if (Math.abs(Math.abs(cosAngle) - 1) > PARALLEL_TOL) {
    return { ok: false, reason: 'The two straight edges are not parallel.' };
  }

  // Canonical shared 3D axis direction (order- and traversal-independent).
  let u: Vec3 = r1.unit;
  if (dot(u, pr.right) < -1e-9 || (Math.abs(dot(u, pr.right)) <= 1e-9 && dot(u, pr.up) < 0)) {
    u = [-u[0], -u[1], -u[2]];
  }

  // Order each edge's endpoints along `u` so endpoint reversal never changes the result.
  const orderAlong = (a: Vec3, b: Vec3): [Vec3, Vec3, number, number] => {
    const sa = dot(a, u);
    const sb = dot(b, u);
    return sa <= sb ? [a, b, sa, sb] : [b, a, sb, sa];
  };
  const [e1Start, e1End, s1Min, s1Max] = orderAlong(r1.p0, r1.p1);
  const [e2Start, e2End, s2Min, s2Max] = orderAlong(r2.p0, r2.p1);

  // Strict equal axial span check (rejects unequal lengths and staggered/partial overlaps).
  if (Math.abs(s1Min - s2Min) > geomTol || Math.abs(s1Max - s2Max) > geomTol) {
    return { ok: false, reason: 'The two parallel edges must share the same axial span and length.' };
  }

  // Strict non-zero perpendicular separation check (rejects same edge and collinear edges).
  const delta = sub3(e2Start, e1Start);
  const along = dot(delta, u);
  const separation = Math.hypot(delta[0] - along * u[0], delta[1] - along * u[1], delta[2] - along * u[2]);
  if (separation <= geomTol) {
    return { ok: false, reason: 'Select two distinct, separated parallel straight edges.' };
  }

  const start3 = mid3(e1Start, e2Start);
  const end3 = mid3(e1End, e2End);
  const length = dist3(start3, end3);
  const start = projectPoint(pr, start3);
  const end = projectPoint(pr, end3);
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const len2 = Math.hypot(dx, dy);
  if (len2 <= MIN_LENGTH || Math.abs(len2 - length) > 1e-3 * Math.max(1, length)) {
    return { ok: false, reason: 'The bisector centerline does not project at true length in this view.' };
  }

  return {
    ok: true,
    geometry: {
      start,
      end,
      axis: [dx / len2, dy / len2],
      length,
      separation,
      start3,
      end3,
      firstEnds: [projectPoint(pr, e1Start), projectPoint(pr, e1End)],
      secondEnds: [projectPoint(pr, e2Start), projectPoint(pr, e2End)],
    },
  };
}
