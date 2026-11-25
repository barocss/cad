// Source-bound curved centerline between two distinct, visible, unclipped, coplanar concentric
// partial circular arcs in an ordinary unbroken orthographic view (`front`, `top`, `right`).
// Computes exact mid-radius `(r1 + r2) / 2` over the common normalized angular span regardless
// of edge traversal direction or 0/2π wraparound.
import type { BrepProjection, ProjectedEdge } from '@barocss/cad';
import { nextFreeId } from '../util/ids';
import { extractArcLengthGeometry, resolveArcLengthEdge } from './arcLength';
import type { DrawingArcCenterline, EdgeRef, SectionViewId, Vec3, XY } from './types';

export interface ArcCenterlineGeometry {
  /** Shared 2D center in view coordinates (mm). */
  readonly center: XY;
  /** Shared 3D center in model coordinates (mm). */
  readonly center3: Vec3;
  /** Inner arc radius (mm). */
  readonly innerRadius: number;
  /** Outer arc radius (mm). */
  readonly outerRadius: number;
  /** Exact centerline arc radius `(innerRadius + outerRadius) / 2` (mm). */
  readonly midRadius: number;
  /** Canonical normalized CCW start angle in view coordinates (radians, [0, 2π)). */
  readonly startAngle: number;
  /** Exact common angular sweep (radians, 0 < sweep < 2π). */
  readonly sweep: number;
  /** Exact start point on centerline arc (view mm). */
  readonly startPoint: XY;
  /** Exact midpoint on centerline arc (view mm). */
  readonly midPoint: XY;
  /** Exact end point on centerline arc (view mm). */
  readonly endPoint: XY;
}

export type ArcCenterlineResolveResult =
  | { readonly ok: true; readonly geometry: ArcCenterlineGeometry }
  | { readonly ok: false; readonly reason: string };

export type ArcCenterlineEdgePickResult =
  | { readonly ok: true; readonly ref: EdgeRef; readonly radius: number; readonly startAngle: number; readonly sweep: number }
  | { readonly ok: false; readonly reason: string };

export type ResolvedArcCenterline =
  | { readonly ok: true; readonly item: DrawingArcCenterline; readonly geometry: ArcCenterlineGeometry }
  | { readonly ok: false; readonly item: DrawingArcCenterline; readonly reason: string };

const TWO_PI = 2 * Math.PI;
const ANGLE_TOL = 1e-3;

function norm2pi(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

/** Shortest unsigned angular distance between two angles modulo 2π (handles 350°..370° wraparound). */
function angularDiff(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function isPrincipalOrthoView(view: string): view is SectionViewId {
  return view === 'front' || view === 'top' || view === 'right';
}

/** Generate the next unused curved centerline ID (`ac1`, `ac2`, ...). */
export function newArcCenterlineId(existing: readonly DrawingArcCenterline[] = []): string {
  return nextFreeId('ac', new Set(existing.map(item => item.id)));
}

/** Validate a single hovered/clicked partial circular arc edge for a curved centerline in `view`. */
export function pickArcCenterlineEdge(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: string,
): ArcCenterlineEdgePickResult {
  if (!isPrincipalOrthoView(view)) {
    return { ok: false, reason: 'Curved centerlines are supported only on ordinary front, top, and right views.' };
  }
  const extracted = extractArcLengthGeometry(pr, edge, false);
  if (!extracted.ok) {
    return { ok: false, reason: extracted.reason };
  }
  const g = extracted.geometry;
  return {
    ok: true,
    ref: { edge: edge.name, near: [...g.mid3] as Vec3 },
    radius: g.radius,
    startAngle: norm2pi(g.startAngle),
    sweep: g.sweep,
  };
}

/**
 * Resolve two distinct, visible, unclipped, coplanar concentric partial circular arcs with
 * unequal positive radii and identical normalized angular span, and compute exact mid-radius arc.
 */
export function resolveArcCenterline(
  pr: BrepProjection,
  firstRef: EdgeRef,
  secondRef: EdgeRef,
  view: string,
): ArcCenterlineResolveResult {
  if (!isPrincipalOrthoView(view)) {
    return { ok: false, reason: 'Curved centerlines are supported only on ordinary front, top, and right views.' };
  }
  const r1 = resolveArcLengthEdge(pr, firstRef, view, false);
  if (!r1.ok) return { ok: false, reason: `First arc: ${r1.reason}` };
  const r2 = resolveArcLengthEdge(pr, secondRef, view, false);
  if (!r2.ok) return { ok: false, reason: `Second arc: ${r2.reason}` };

  const g1 = r1.geometry;
  const g2 = r2.geometry;
  const maxR = Math.max(g1.radius, g2.radius);
  const centerTol = 1e-4 * Math.max(1, maxR);

  // Strict 3D concentricity & coplanarity (rejects non-concentric and depth-offset arcs).
  if (dist3(g1.center3, g2.center3) > centerTol) {
    return { ok: false, reason: 'The two arcs are not concentric in the same 3D plane.' };
  }

  const innerRadius = Math.min(g1.radius, g2.radius);
  const outerRadius = Math.max(g1.radius, g2.radius);
  if (outerRadius - innerRadius <= 1e-4) {
    return { ok: false, reason: 'Select two distinct concentric partial arcs with different radii.' };
  }

  // Require identical normalized angular span regardless of traversal direction or 0/2π wraparound.
  const start1 = norm2pi(g1.startAngle);
  const start2 = norm2pi(g2.startAngle);
  if (angularDiff(start1, start2) > ANGLE_TOL || Math.abs(g1.sweep - g2.sweep) > ANGLE_TOL) {
    return { ok: false, reason: 'The two concentric arcs do not share the same angular span.' };
  }

  const center3: Vec3 = [
    (g1.center3[0] + g2.center3[0]) / 2,
    (g1.center3[1] + g2.center3[1]) / 2,
    (g1.center3[2] + g2.center3[2]) / 2,
  ];
  const center: XY = [(g1.center[0] + g2.center[0]) / 2, (g1.center[1] + g2.center[1]) / 2];
  const midRadius = (innerRadius + outerRadius) / 2;
  const sweep = (g1.sweep + g2.sweep) / 2;
  // Average startAngle safely across 0/2π seam via unit vector average.
  const startAngle = norm2pi(Math.atan2(
    Math.sin(start1) + Math.sin(start2),
    Math.cos(start1) + Math.cos(start2),
  ));
  const midAngle = startAngle + sweep / 2;
  const endAngle = startAngle + sweep;

  const at = (theta: number): XY => [
    center[0] + midRadius * Math.cos(theta),
    center[1] + midRadius * Math.sin(theta),
  ];

  return {
    ok: true,
    geometry: {
      center,
      center3,
      innerRadius,
      outerRadius,
      midRadius,
      startAngle,
      sweep,
      startPoint: at(startAngle),
      midPoint: at(midAngle),
      endPoint: at(endAngle),
    },
  };
}
