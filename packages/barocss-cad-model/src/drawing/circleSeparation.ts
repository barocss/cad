// Disjoint circle separation (min / max circumference gap) drawing dimension geometry:
// resolves two distinct, visible, coplanar, strictly externally disjoint full circles in an
// ordinary unbroken orthographic view (`front`, `top`, `right`) and measures either:
//   - `min`: nearest circumference gap `d - rA - rB` between `C_A + rA·u` and `C_B - rB·u`
//   - `max`: farthest circumference span `d + rA + rB` between `C_A - rA·u` and `C_B + rB·u`
// where `d = |C_B - C_A|` and `u = (C_B - C_A) / d`.
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { dot } from '../engine/vec3';
import { isOrthographicView } from './foreshorten';
import type { CircleSeparationMode, DimView, EdgeRef, Vec3, XY } from './types';

export interface CircleSeparationGeometry {
  /** 2D center of the first circle in view coordinates (mm). */
  readonly centerA: XY;
  /** 2D center of the second circle in view coordinates (mm). */
  readonly centerB: XY;
  /** Radius of the first circle (mm). */
  readonly radiusA: number;
  /** Radius of the second circle (mm). */
  readonly radiusB: number;
  /** Center-to-center distance `d` (mm). */
  readonly centerDistance: number;
  /** Exact circumference measurement point on circle A (view mm). */
  readonly pointA: XY;
  /** Exact circumference measurement point on circle B (view mm). */
  readonly pointB: XY;
  /** Authored separation mode (`min` or `max`). */
  readonly mode: CircleSeparationMode;
  /** Exact separation value (`d - rA - rB` for `min`, `d + rA + rB` for `max`) in mm. */
  readonly value: number;
}

export type CircleSeparationResolveResult =
  | { readonly ok: true; readonly geometry: CircleSeparationGeometry }
  | { readonly ok: false; readonly reason: string };

export type CircleSeparationEdgePickResult =
  | { readonly ok: true; readonly ref: EdgeRef; readonly radius: number; readonly center3: Vec3 }
  | { readonly ok: false; readonly reason: string };

const TWO_PI = 2 * Math.PI;
const NORMAL_TOL = 1e-6;
const DISJOINT_TOL = 1e-4;

function sub3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function projectPoint(pr: BrepProjection, p: readonly number[]): XY {
  return [dot(p, pr.right), dot(p, pr.up)];
}

function isRoundInView(pr: BrepProjection, edge: ProjectedEdge): boolean {
  return !!edge.circle && Math.abs(dot(edge.circle.normal, pr.toward)) > 1 - NORMAL_TOL;
}

/**
 * True when `edge` is a closed 360° circle OR part of a seam-split full 360° circular rim
 * (e.g., two 180° circular halves at the same 3D center, radius, and plane summing to 2π).
 */
function isFullCircleInProjection(pr: BrepProjection, edge: ProjectedEdge): boolean {
  const c = edge.circle;
  if (!c || edge.kind !== 'circle') return false;
  if (c.full) return true;
  const tol = 1e-4 * Math.max(1, c.radius);
  let totalSweep = 0;
  for (const other of pr.edges) {
    if (other.kind !== 'circle' || !other.circle) continue;
    const oc = other.circle;
    if (Math.abs(oc.radius - c.radius) > tol) continue;
    if (dist3(oc.center, c.center) > tol) continue;
    if (Math.abs(dot(oc.normal, c.normal)) < 1 - NORMAL_TOL) continue;
    totalSweep += oc.full ? TWO_PI : oc.sweep;
    if (totalSweep >= TWO_PI - 1e-4) return true;
  }
  return false;
}

/** Validate a single hovered/clicked circular edge for circle separation in `view`. */
export function pickCircleSeparationEdge(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: DimView,
): CircleSeparationEdgePickResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Circle separation dimensions are supported only on ordinary front, top, and right views.' };
  }
  if (edge.kind === 'silhouette') {
    return { ok: false, reason: 'Silhouettes are not supported for circle separation dimensions. Select two disjoint full circles.' };
  }
  if (edge.kind !== 'circle' || !edge.circle) {
    return { ok: false, reason: 'Select a full circular edge. Straight lines and non-circular curves are not supported.' };
  }
  if (!edge.pieces.some(p => p.visible)) {
    return { ok: false, reason: 'Select a visible circular edge in this view.' };
  }
  if (!isRoundInView(pr, edge)) {
    return { ok: false, reason: 'This circle does not show round in this view. Dimension circle separation where both circles show true.' };
  }
  if (!Number.isFinite(edge.circle.radius) || edge.circle.radius <= 1e-6) {
    return { ok: false, reason: 'The selected circle has an invalid radius.' };
  }
  if (!isFullCircleInProjection(pr, edge)) {
    return { ok: false, reason: 'Partial arcs are not supported for circle separation dimensions. Select two full disjoint circles.' };
  }
  const center3: Vec3 = [edge.circle.center[0], edge.circle.center[1], edge.circle.center[2]];
  return {
    ok: true,
    ref: { edge: edge.name, near: [...center3] as Vec3 },
    radius: edge.circle.radius,
    center3,
  };
}

function resolveUniqueFullCircle(
  pr: BrepProjection,
  ref: EdgeRef,
  roleLabel: string,
): { ok: true; edge: ProjectedEdge } | { ok: false; reason: string } {
  const named = pr.edges.filter(e => e.name === ref.edge);
  if (!named.length) {
    return { ok: false, reason: `The ${roleLabel} circle is no longer in the part.` };
  }
  const valid: { edge: ProjectedEdge; distance: number; radius: number }[] = [];
  let rejectedReason: string | null = null;
  for (const edge of named) {
    if (edge.kind === 'silhouette') {
      rejectedReason ??= `The ${roleLabel} reference is a silhouette, which is not supported.`;
      continue;
    }
    if (edge.kind !== 'circle' || !edge.circle) {
      rejectedReason ??= `The ${roleLabel} reference is no longer a circular edge.`;
      continue;
    }
    if (!edge.pieces.some(p => p.visible)) {
      rejectedReason ??= `The ${roleLabel} circle is no longer visible in this view.`;
      continue;
    }
    if (!isRoundInView(pr, edge)) {
      rejectedReason ??= `The ${roleLabel} circle no longer shows round in this view.`;
      continue;
    }
    if (!Number.isFinite(edge.circle.radius) || edge.circle.radius <= 1e-6) {
      rejectedReason ??= `The ${roleLabel} circle has an invalid radius.`;
      continue;
    }
    if (!isFullCircleInProjection(pr, edge)) {
      rejectedReason ??= `The ${roleLabel} reference is a partial arc, not a full circle.`;
      continue;
    }
    valid.push({ edge, distance: dist3(edge.circle.center, ref.near), radius: edge.circle.radius });
  }
  if (!valid.length) {
    return { ok: false, reason: rejectedReason ?? `The ${roleLabel} circle cannot be resolved.` };
  }
  valid.sort((a, b) => a.distance - b.distance);
  if (valid.length > 1) {
    const tieTol = 1e-4 * Math.max(1, valid[0].radius);
    if (Math.abs(valid[1].distance - valid[0].distance) <= tieTol) {
      return { ok: false, reason: `Multiple ${roleLabel} circles with the same reference overlap at this position.` };
    }
  }
  return { ok: true, edge: valid[0].edge };
}

/**
 * Resolve two distinct, visible, coplanar, strictly externally disjoint full circles and compute
 * exact circumference-to-circumference gap (`min` = `d - rA - rB`, `max` = `d + rA + rB`).
 */
export function resolveCircleSeparationEdges(
  pr: BrepProjection,
  firstRef: EdgeRef,
  secondRef: EdgeRef,
  mode: CircleSeparationMode,
  view: DimView,
): CircleSeparationResolveResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Circle separation dimensions are supported only on ordinary front, top, and right views.' };
  }
  if (mode !== 'min' && mode !== 'max') {
    return { ok: false, reason: 'Circle separation mode must be min or max.' };
  }
  const r1 = resolveUniqueFullCircle(pr, firstRef, 'first');
  if (!r1.ok) return r1;
  const r2 = resolveUniqueFullCircle(pr, secondRef, 'second');
  if (!r2.ok) return r2;

  const c1 = r1.edge.circle!;
  const c2 = r2.edge.circle!;
  const maxR = Math.max(c1.radius, c2.radius);
  const planeTol = 1e-4 * Math.max(1, maxR);

  // Strict 3D coplanarity check (rejects screen-only overlap at different depths).
  if (Math.abs(dot(c1.normal, c2.normal)) < 1 - NORMAL_TOL) {
    return { ok: false, reason: 'The two circles do not lie in parallel planes.' };
  }
  const delta3 = sub3(c2.center, c1.center);
  if (Math.abs(dot(delta3, c1.normal)) > planeTol) {
    return { ok: false, reason: 'The two circles do not lie in the same 3D plane.' };
  }

  const d = dist3(c1.center, c2.center);
  if (d <= planeTol) {
    return { ok: false, reason: 'Concentric or identical circles are not supported for circle separation. Use Wall thickness instead.' };
  }
  const sumR = c1.radius + c2.radius;
  if (d <= sumR + DISJOINT_TOL) {
    return {
      ok: false,
      reason: d < sumR - DISJOINT_TOL
        ? 'Overlapping or contained circles are not supported. Select two strictly externally disjoint circles.'
        : 'Externally tangent circles have zero clearance and are not supported. Select two strictly disjoint circles.',
    };
  }

  const centerA = projectPoint(pr, c1.center);
  const centerB = projectPoint(pr, c2.center);
  const dx = centerB[0] - centerA[0];
  const dy = centerB[1] - centerA[1];
  const d2 = Math.hypot(dx, dy);
  if (Math.abs(d2 - d) > 1e-3 * Math.max(1, d) || d2 <= DISJOINT_TOL) {
    return { ok: false, reason: 'The two circles do not show at true separation in this view.' };
  }
  const ux = dx / d2;
  const uy = dy / d2;

  const sign = mode === 'min' ? 1 : -1;
  const pointA: XY = [centerA[0] + sign * ux * c1.radius, centerA[1] + sign * uy * c1.radius];
  const pointB: XY = [centerB[0] - sign * ux * c2.radius, centerB[1] - sign * uy * c2.radius];
  const value = mode === 'min' ? d - c1.radius - c2.radius : d + c1.radius + c2.radius;

  return {
    ok: true,
    geometry: {
      centerA,
      centerB,
      radiusA: c1.radius,
      radiusB: c2.radius,
      centerDistance: d,
      pointA,
      pointB,
      mode,
      value,
    },
  };
}
