// Concentric radial thickness drawing dimension geometry: resolves two distinct, visible,
// coplanar, concentric full circular edges in an ordinary unbroken orthographic view (`front`,
// `top`, `right`) and measures their exact radial wall thickness `R - r` (mm) along the placement ray.
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { dot } from '../engine/vec3';
import { isOrthographicView } from './foreshorten';
import type { DimView, EdgeRef, Vec3, XY } from './types';

export interface RadialThicknessGeometry {
  /** Shared 2D center in view coordinates (mm). */
  readonly center: XY;
  /** Shared 3D center in model coordinates (mm). */
  readonly center3: Vec3;
  /** Smaller radius `r` (mm). */
  readonly innerRadius: number;
  /** Larger radius `R` (mm). */
  readonly outerRadius: number;
  /** Exact radial thickness `R - r` (mm). */
  readonly thickness: number;
  /** Unit radial direction in view 2D coordinates along which the thickness is drawn. */
  readonly dir: XY;
  /** Exact measurement point on the inner circle circumference in view 2D coordinates. */
  readonly innerPoint: XY;
  /** Exact measurement point on the outer circle circumference in view 2D coordinates. */
  readonly outerPoint: XY;
}

export type RadialThicknessResolveResult =
  | { readonly ok: true; readonly geometry: RadialThicknessGeometry }
  | { readonly ok: false; readonly reason: string };

export type RadialThicknessEdgePickResult =
  | { readonly ok: true; readonly ref: EdgeRef; readonly radius: number; readonly center3: Vec3 }
  | { readonly ok: false; readonly reason: string };

const TWO_PI = 2 * Math.PI;
const NORMAL_TOL = 1e-6;

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

/** Validate a single hovered/clicked circle edge for radial thickness in `view`. */
export function pickRadialThicknessCircle(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: DimView,
): RadialThicknessEdgePickResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Radial thickness dimensions are supported only on ordinary front, top, and right views.' };
  }
  if (edge.kind === 'silhouette') {
    return { ok: false, reason: 'Silhouettes are not supported for radial thickness dimensions. Select two concentric full circles.' };
  }
  if (edge.kind !== 'circle' || !edge.circle) {
    return { ok: false, reason: 'Select a full circular edge. Straight lines and non-circular curves are not supported.' };
  }
  if (!edge.pieces.some(p => p.visible)) {
    return { ok: false, reason: 'Select a visible circular edge in this view.' };
  }
  if (!isRoundInView(pr, edge)) {
    return { ok: false, reason: 'This circle does not show round in this view. Dimension radial thickness where both circles show true.' };
  }
  if (!Number.isFinite(edge.circle.radius) || edge.circle.radius <= 1e-6) {
    return { ok: false, reason: 'The selected circle has an invalid radius.' };
  }
  if (!isFullCircleInProjection(pr, edge)) {
    return { ok: false, reason: 'Partial arcs are not supported for radial thickness dimensions. Select two full concentric circles.' };
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
 * Resolve two distinct coplanar concentric full circles and compute exact radial wall thickness `R - r`
 * and circumference measurement points along the radial ray toward `place`.
 */
export function resolveRadialThicknessEdges(
  pr: BrepProjection,
  firstRef: EdgeRef,
  secondRef: EdgeRef,
  view: DimView,
  place: XY,
): RadialThicknessResolveResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Radial thickness dimensions are supported only on ordinary front, top, and right views.' };
  }
  const r1 = resolveUniqueFullCircle(pr, firstRef, 'first');
  if (!r1.ok) return r1;
  const r2 = resolveUniqueFullCircle(pr, secondRef, 'second');
  if (!r2.ok) return r2;

  const c1 = r1.edge.circle!;
  const c2 = r2.edge.circle!;
  const maxR = Math.max(c1.radius, c2.radius);
  const centerTol = 1e-4 * Math.max(1, maxR);

  // Strict 3D center and plane-normal match (rejects screen-only concentricity at different depths).
  if (Math.abs(dot(c1.normal, c2.normal)) < 1 - NORMAL_TOL) {
    return { ok: false, reason: 'The two circles do not lie in parallel planes.' };
  }
  if (dist3(c1.center, c2.center) > centerTol) {
    return { ok: false, reason: 'The two circles are not concentric in the same 3D plane.' };
  }

  const innerRadius = Math.min(c1.radius, c2.radius);
  const outerRadius = Math.max(c1.radius, c2.radius);
  const thickness = outerRadius - innerRadius;
  if (thickness <= 1e-4) {
    return { ok: false, reason: 'Select two distinct concentric circles with different radii.' };
  }

  const center3: Vec3 = [
    (c1.center[0] + c2.center[0]) / 2,
    (c1.center[1] + c2.center[1]) / 2,
    (c1.center[2] + c2.center[2]) / 2,
  ];
  const center = projectPoint(pr, center3);
  const dx = place[0] - center[0];
  const dy = place[1] - center[1];
  const dist = Math.hypot(dx, dy);
  const dir: XY = dist > 1e-6 ? [dx / dist, dy / dist] : [1, 0];
  const innerPoint: XY = [center[0] + dir[0] * innerRadius, center[1] + dir[1] * innerRadius];
  const outerPoint: XY = [center[0] + dir[0] * outerRadius, center[1] + dir[1] * outerRadius];

  return {
    ok: true,
    geometry: {
      center,
      center3,
      innerRadius,
      outerRadius,
      thickness,
      dir,
      innerPoint,
      outerPoint,
    },
  };
}
