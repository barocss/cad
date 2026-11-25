// Arc length drawing dimension geometry: resolves one native partial circular arc in an ordinary
// unbroken orthographic view (`front`, `top`, `right`) and measures its exact model arc length
// `L = radius * sweep` (mm). Never falls back to chord length, radius, full circles, or silhouettes.
import type { BrepProjection, ProjectedCurve, ProjectedEdge } from '@barocss/cad';
import { dot } from '../engine/vec3';
import { isOrthographicView } from './foreshorten';
import type { DimView, EdgeRef, Vec3, XY } from './types';

type CircularArcCurve = Extract<ProjectedCurve, { kind: 'arc' }>;

export interface ArcLengthGeometry {
  readonly center: XY;
  readonly center3: Vec3;
  readonly radius: number;
  readonly startAngle: number;
  readonly sweep: number;
  readonly midAngle: number;
  readonly ends: readonly [XY, XY];
  readonly mid3: Vec3;
  readonly value: number;
}

export type ArcLengthResolveResult =
  | { readonly ok: true; readonly geometry: ArcLengthGeometry }
  | { readonly ok: false; readonly reason: string };

export type ArcLengthPickResult =
  | { readonly ok: true; readonly ref: EdgeRef; readonly geometry: ArcLengthGeometry }
  | { readonly ok: false; readonly reason: string };

const TWO_PI = 2 * Math.PI;
const SWEEP_EPS = 1e-6;
const SPAN_TOL = 1e-3;

function norm2pi(angle: number): number {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

function projectPoint(pr: BrepProjection, p: readonly number[]): XY {
  return [dot(p, pr.right), dot(p, pr.up)];
}

function dist3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function isRoundInView(pr: BrepProjection, edge: ProjectedEdge): boolean {
  return !!edge.circle && Math.abs(dot(edge.circle.normal, pr.toward)) > 1 - 1e-6;
}

/**
 * True when `edge` is a closed 360° circle OR belongs to a full circular loop split across
 * seam-divided edges (e.g., two 180° hole rim halves at the same 3D center, radius, and plane).
 */
function isPartOfFullCircle(pr: BrepProjection, edge: ProjectedEdge): boolean {
  const c = edge.circle;
  if (!c) return false;
  if (c.full) return true;
  const tol = 1e-4 * Math.max(1, c.radius);
  let totalSweep = 0;
  for (const other of pr.edges) {
    if (other.kind !== 'circle' || !other.circle) continue;
    const oc = other.circle;
    if (Math.abs(oc.radius - c.radius) > tol) continue;
    if (dist3(oc.center, c.center) > tol) continue;
    if (Math.abs(dot(oc.normal, c.normal)) < 1 - 1e-6) continue;
    totalSweep += oc.full ? TWO_PI : oc.sweep;
    if (totalSweep >= TWO_PI - 1e-4) return true;
  }
  return false;
}

function arcCurvePoint(c: CircularArcCurve, t: number): XY {
  return [
    c.center[0] + c.u[0] * Math.cos(t) + c.v[0] * Math.sin(t),
    c.center[1] + c.u[1] * Math.cos(t) + c.v[1] * Math.sin(t),
  ];
}

function isTrueCircularPiece(c: CircularArcCurve, center: XY, radius: number): boolean {
  const tol = 1e-3 * Math.max(1, radius);
  if (Math.hypot(c.center[0] - center[0], c.center[1] - center[1]) > tol) return false;
  const rU = Math.hypot(c.u[0], c.u[1]);
  const rV = Math.hypot(c.v[0], c.v[1]);
  const uv = c.u[0] * c.v[0] + c.u[1] * c.v[1];
  return Math.abs(rU - radius) <= tol && Math.abs(rV - radius) <= tol && Math.abs(uv) <= tol * Math.max(1, radius);
}

/** Validate and extract exact arc-length geometry from one projected circular arc edge. */
export function extractArcLengthGeometry(
  pr: BrepProjection,
  edge: ProjectedEdge,
  showHidden = false,
): ArcLengthResolveResult {
  if (edge.kind === 'silhouette') {
    return { ok: false, reason: 'Silhouettes are not supported for arc length dimensions. Select a circular arc edge.' };
  }
  if (edge.kind !== 'circle' || !edge.circle) {
    return { ok: false, reason: 'Select a partial circular arc edge. Straight lines, splines, and ellipses are not supported.' };
  }
  if (edge.circle.full || !edge.ends || isPartOfFullCircle(pr, edge)) {
    return { ok: false, reason: 'Full circles are not supported for arc length dimensions. Use Diameter or Radius, or select a partial circular arc.' };
  }
  if (!isRoundInView(pr, edge)) {
    return { ok: false, reason: 'This circular arc does not show round in this view. Dimension arc length where the arc shows true.' };
  }
  const { radius, sweep } = edge.circle;
  if (!Number.isFinite(radius) || radius <= 1e-9 || !Number.isFinite(sweep) || sweep <= SWEEP_EPS || sweep >= TWO_PI - SWEEP_EPS) {
    return { ok: false, reason: 'The circular arc has an invalid radius or sweep angle.' };
  }
  const center3: Vec3 = [edge.circle.center[0], edge.circle.center[1], edge.circle.center[2]];
  const center = projectPoint(pr, center3);
  const arcPieces: CircularArcCurve[] = [];
  let shownCount = 0;
  let totalSpan = 0;
  let longestPiece: CircularArcCurve | null = null;
  let longestSpan = 0;
  for (const piece of edge.pieces) {
    if (piece.curve.kind !== 'arc') continue;
    if (!isTrueCircularPiece(piece.curve, center, radius)) continue;
    const span = Math.abs(piece.curve.t1 - piece.curve.t0);
    if (span <= SWEEP_EPS) continue;
    arcPieces.push(piece.curve);
    totalSpan += span;
    if (piece.visible || showHidden) shownCount++;
    if (span > longestSpan) {
      longestSpan = span;
      longestPiece = piece.curve;
    }
  }
  if (!arcPieces.length || shownCount === 0 || !longestPiece) {
    return { ok: false, reason: 'The circular arc has no visible circular span in this view.' };
  }
  if (Math.abs(totalSpan - sweep) > SPAN_TOL) {
    return { ok: false, reason: 'Only a whole, unclipped circular arc can be dimensioned for arc length.' };
  }

  const endA = projectPoint(pr, edge.ends[0]);
  const endB = projectPoint(pr, edge.ends[1]);
  const radTol = 1e-3 * Math.max(1, radius);
  if (Math.abs(Math.hypot(endA[0] - center[0], endA[1] - center[1]) - radius) > radTol
    || Math.abs(Math.hypot(endB[0] - center[0], endB[1] - center[1]) - radius) > radTol) {
    return { ok: false, reason: 'The circular arc endpoints do not lie on its circle in this view.' };
  }

  const angA = Math.atan2(endA[1] - center[1], endA[0] - center[0]);
  const angB = Math.atan2(endB[1] - center[1], endB[0] - center[0]);
  const ccwAB = norm2pi(angB - angA);
  const ccwBA = norm2pi(angA - angB);
  const samplePt = arcCurvePoint(longestPiece, (longestPiece.t0 + longestPiece.t1) / 2);
  const angSample = Math.atan2(samplePt[1] - center[1], samplePt[0] - center[0]);
  const offA = norm2pi(angSample - angA);
  const offB = norm2pi(angSample - angB);
  const matchA = Math.abs(ccwAB - sweep) <= SPAN_TOL && offA <= sweep + SPAN_TOL;
  const matchB = Math.abs(ccwBA - sweep) <= SPAN_TOL && offB <= sweep + SPAN_TOL;

  let startAngle: number;
  let ends: readonly [XY, XY];
  if (matchA && !matchB) {
    startAngle = angA;
    ends = [endA, endB];
  } else if (matchB && !matchA) {
    startAngle = angB;
    ends = [endB, endA];
  } else if (matchA && matchB) {
    const marginA = Math.min(offA, sweep - offA);
    const marginB = Math.min(offB, sweep - offB);
    if (marginA >= marginB) {
      startAngle = angA;
      ends = [endA, endB];
    } else {
      startAngle = angB;
      ends = [endB, endA];
    }
  } else {
    return { ok: false, reason: 'The circular arc endpoints do not match its projected arc span.' };
  }

  const midAngle = startAngle + sweep / 2;
  const cosM = Math.cos(midAngle);
  const sinM = Math.sin(midAngle);
  const mid3: Vec3 = [
    center3[0] + radius * (cosM * pr.right[0] + sinM * pr.up[0]),
    center3[1] + radius * (cosM * pr.right[1] + sinM * pr.up[1]),
    center3[2] + radius * (cosM * pr.right[2] + sinM * pr.up[2]),
  ];
  return {
    ok: true,
    geometry: {
      center,
      center3,
      radius,
      startAngle,
      sweep,
      midAngle,
      ends,
      mid3,
      value: radius * sweep,
    },
  };
}

/** Validate a hovered/clicked projected edge for creating a new arc-length dimension in `view`. */
export function pickArcLengthEdge(
  pr: BrepProjection,
  edge: ProjectedEdge,
  view: DimView,
  showHidden = false,
): ArcLengthPickResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Arc length dimensions are supported only on ordinary front, top, and right views.' };
  }
  const result = extractArcLengthGeometry(pr, edge, showHidden);
  if (!result.ok) return result;
  return {
    ok: true,
    ref: { edge: edge.name, near: [...result.geometry.mid3] as Vec3 },
    geometry: result.geometry,
  };
}

/** Resolve a persisted arc-length reference in `view` against its current projection. */
export function resolveArcLengthEdge(
  pr: BrepProjection,
  ref: EdgeRef,
  view: DimView,
  showHidden = false,
): ArcLengthResolveResult {
  if (!isOrthographicView(view)) {
    return { ok: false, reason: 'Arc length dimensions are supported only on ordinary front, top, and right views.' };
  }
  const named = pr.edges.filter(e => e.name === ref.edge);
  if (!named.length) {
    return { ok: false, reason: 'The circular arc it measured is no longer in the part.' };
  }
  const valid: { geometry: ArcLengthGeometry; distance: number }[] = [];
  let firstError: string | null = null;
  for (const edge of named) {
    const res = extractArcLengthGeometry(pr, edge, showHidden);
    if (res.ok) {
      valid.push({ geometry: res.geometry, distance: dist3(res.geometry.mid3, ref.near) });
    } else if (!firstError) {
      firstError = res.reason;
    }
  }
  if (!valid.length) {
    return { ok: false, reason: firstError ?? 'The circular arc can no longer be measured as an arc length.' };
  }
  valid.sort((a, b) => a.distance - b.distance);
  const best = valid[0];
  if (valid.length > 1) {
    const second = valid[1];
    const tieTol = 1e-4 * Math.max(1, best.geometry.radius);
    if (Math.abs(second.distance - best.distance) <= tieTol) {
      return { ok: false, reason: 'Multiple circular arcs with the same reference overlap at this position.' };
    }
  }
  return { ok: true, geometry: best.geometry };
}
