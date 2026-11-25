// Positive clearance gap G from a horizontal or vertical straight outline edge to an attached
// circle's nearest circumference (center distance = G + r, maintained across radius edits).
import { inferredHV, type P2 } from './profile';
import type { EdgeCircleGapRule } from './terms';
import type { SketchShape } from './types';

type PolygonShape = Extract<SketchShape, { kind: 'polygon' }>;

export const EDGE_CIRCLE_GAP_MIN_MM = 0.001;
const FOOT_INTERIOR_EPS = 1e-6;
const AXIS_ALIGN_TOL = 1e-5;
const GAP_SOLVE_TOL = 1e-5;

export interface EdgeCircleGapGeometry {
  axis: 0 | 1;
  side: -1 | 1;
  foot: P2;
  nearest: P2;
  gap: number;
  centerDistance: number;
  edgeParameter: number;
}

export interface EdgeCircleGapEndpoints {
  foot: P2;
  nearest: P2;
}

function edgeHVAxis(s: PolygonShape, edge: number): 0 | 1 | null {
  const n = s.points.length;
  if (!Number.isInteger(edge) || edge < 0 || edge >= n || s.bulges?.[edge]) return null;
  const hv = s.hv ?? inferredHV(s.points as P2[], s.bulges);
  const horizontal = hv.h.includes(edge), vertical = hv.v.includes(edge);
  if (horizontal === vertical) return null;
  return horizontal ? 1 : 0;
}

/**
 * Exact perpendicular clearance geometry from an H/V straight outline edge to an attached circle's
 * nearest circumference point. Returns null unless the edge is H/V straight, the circle exists with
 * positive radius, the perpendicular foot lies strictly inside the finite edge segment, and the
 * clearance gap is strictly positive.
 */
export function edgeCircleGapGeometry(
  s: PolygonShape,
  edge: number,
  circleIndex: number,
  expectedAxis?: 0 | 1,
): EdgeCircleGapGeometry | null {
  const axis = edgeHVAxis(s, edge);
  if (axis === null || (expectedAxis !== undefined && axis !== expectedAxis)) return null;
  const n = s.points.length;
  const a = s.points[edge], b = s.points[(edge + 1) % n];
  const circle = s.circles?.[circleIndex];
  if (!a || !b || !circle) return null;
  if (![a[0], a[1], b[0], b[1], circle.c[0], circle.c[1], circle.r].every(Number.isFinite) || circle.r <= 0) return null;
  if (Math.abs(a[axis] - b[axis]) > AXIS_ALIGN_TOL) return null;
  const otherAxis: 0 | 1 = axis === 0 ? 1 : 0;
  const span = b[otherAxis] - a[otherAxis];
  if (Math.abs(span) <= 1e-6) return null;
  const lo = Math.min(a[otherAxis], b[otherAxis]), hi = Math.max(a[otherAxis], b[otherAxis]);
  if (!(circle.c[otherAxis] > lo + FOOT_INTERIOR_EPS && circle.c[otherAxis] < hi - FOOT_INTERIOR_EPS)) return null;
  const edgeCoord = (a[axis] + b[axis]) / 2;
  const signed = circle.c[axis] - edgeCoord;
  if (Math.abs(signed) <= 1e-9) return null;
  const side: -1 | 1 = signed > 0 ? 1 : -1;
  const centerDistance = Math.abs(signed);
  const gap = centerDistance - circle.r;
  if (!Number.isFinite(gap) || gap < EDGE_CIRCLE_GAP_MIN_MM - 1e-6) return null;
  const foot: P2 = axis === 0 ? [edgeCoord, circle.c[1]] : [circle.c[0], edgeCoord];
  const nearest: P2 = axis === 0
    ? [circle.c[0] - side * circle.r, circle.c[1]]
    : [circle.c[0], circle.c[1] - side * circle.r];
  return {
    axis,
    side,
    foot,
    nearest,
    gap,
    centerDistance,
    edgeParameter: (circle.c[otherAxis] - a[otherAxis]) / span,
  };
}

/** Foot on the edge and nearest circumference point on the circle for rendering a stored `cgap` rule. */
export function edgeCircleGapEndpoints(
  points: readonly P2[],
  edge: number,
  axis: 0 | 1,
  side: -1 | 1,
  circle: { c: readonly number[]; r: number },
): EdgeCircleGapEndpoints | null {
  const a = points[edge];
  if (!a || !Number.isFinite(a[0]) || !Number.isFinite(a[1]) || !Number.isFinite(circle.c[0]) || !Number.isFinite(circle.c[1]) || !Number.isFinite(circle.r) || circle.r <= 0) return null;
  const foot: P2 = axis === 0 ? [a[0], circle.c[1]] : [circle.c[0], a[1]];
  const nearest: P2 = axis === 0
    ? [circle.c[0] - side * circle.r, circle.c[1]]
    : [circle.c[0], circle.c[1] - side * circle.r];
  return { foot, nearest };
}

/**
 * Post-solve invariant check for a stored `cgap` rule: verifies positive gap, H/V edge alignment,
 * foot strictly inside the finite edge segment, preserved side, and solved residual.
 */
export function edgeCircleGapProblem(s: PolygonShape, rule: EdgeCircleGapRule): string | null {
  if ((rule.axis !== 0 && rule.axis !== 1) || (rule.side !== -1 && rule.side !== 1)
    || !Number.isFinite(rule.value) || rule.value < EDGE_CIRCLE_GAP_MIN_MM) {
    return 'A circumference gap must be greater than 0';
  }
  const axis = edgeHVAxis(s, rule.edge);
  if (axis === null || axis !== rule.axis) {
    return `edge ${rule.edge + 1} must stay ${rule.axis === 1 ? 'horizontal' : 'vertical'} to keep its circumference gap`;
  }
  const n = s.points.length;
  const a = s.points[rule.edge], b = s.points[(rule.edge + 1) % n];
  const circle = s.circles?.[rule.circle];
  if (!a || !b || !circle || !Number.isFinite(circle.r) || circle.r <= 0) {
    return `circle ${rule.circle + 1} is missing or has an invalid radius`;
  }
  if (Math.abs(a[axis] - b[axis]) > AXIS_ALIGN_TOL) {
    return `edge ${rule.edge + 1} is no longer aligned with its circumference gap axis`;
  }
  const otherAxis: 0 | 1 = axis === 0 ? 1 : 0;
  const lo = Math.min(a[otherAxis], b[otherAxis]), hi = Math.max(a[otherAxis], b[otherAxis]);
  if (!(circle.c[otherAxis] > lo + FOOT_INTERIOR_EPS && circle.c[otherAxis] < hi - FOOT_INTERIOR_EPS)) {
    return `circle ${rule.circle + 1} would move past the ends of edge ${rule.edge + 1}`;
  }
  const edgeCoord = (a[axis] + b[axis]) / 2;
  const signed = circle.c[axis] - edgeCoord;
  if (signed * rule.side <= 0) {
    return `circle ${rule.circle + 1} would flip across edge ${rule.edge + 1}`;
  }
  const gap = Math.abs(signed) - circle.r;
  if (!Number.isFinite(gap) || gap < EDGE_CIRCLE_GAP_MIN_MM - 1e-6) {
    return `circle ${rule.circle + 1} would touch or cross edge ${rule.edge + 1}`;
  }
  if (Math.abs(gap - rule.value) > GAP_SOLVE_TOL) {
    return `circumference gap to edge ${rule.edge + 1} could not be held`;
  }
  return null;
}
