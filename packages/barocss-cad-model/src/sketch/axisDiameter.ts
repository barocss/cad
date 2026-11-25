// Axis-based diameter dimension (`adia`) for sketch revolve half-profiles:
// constrains a point's radial distance |coord| = D / 2 from the sketch local Y axis (x = 0)
// or local X axis (y = 0) while preserving its authored half-plane side and storing diameter D.
import type { P2 } from './profile';
import type { AxisDiameterRule, SketchRevolutionAxis } from './terms';

/** Minimum authored diameter in mm (radius = D / 2 >= 0.001 mm). */
export const AXIS_DIAMETER_MIN_MM = 0.002;
/** Minimum distance from the revolution axis for a point to accept an axis diameter. */
export const AXIS_DIAMETER_ON_AXIS_TOL_MM = 1e-6;
/** Maximum accepted post-solve radial deviation in mm. */
const POST_SOLVE_RADIAL_TOL_MM = 1e-5;

export interface AxisDiameterPolygon {
  points: readonly P2[];
  rules?: readonly unknown[];
}

export interface ParsedAxisDiameterKey {
  axis: SketchRevolutionAxis;
  point: number;
}

export interface AxisDiameterEndpoints {
  target: P2;
  mirror: P2;
  foot: P2;
}

export interface AxisDiameterGeometry extends AxisDiameterEndpoints {
  point: number;
  axis: SketchRevolutionAxis;
  radialAxis: 0 | 1;
  side: -1 | 1;
  radius: number;
  diameter: number;
}

/** Canonical dimension key for an axis diameter (`adiay<point>` or `adiax<point>`). */
export function axisDiameterKey(point: number, axis: SketchRevolutionAxis): string {
  return `adia${axis}${point}`;
}

/** Parse an axis diameter key (`adiay<point>` or `adiax<point>`). */
export function parseAxisDiameterKey(key: string): ParsedAxisDiameterKey | null {
  const match = /^adia([xy])(\d+)$/.exec(key);
  if (!match) return null;
  return { axis: match[1] as SketchRevolutionAxis, point: Number(match[2]) };
}

/**
 * Current axis-diameter geometry for an outline point about the sketch's local Y axis (x = 0)
 * or local X axis (y = 0). Returns null if the point does not exist or lies on the axis.
 */
export function axisDiameterGeometry(
  shape: AxisDiameterPolygon,
  point: number,
  axis: SketchRevolutionAxis,
): AxisDiameterGeometry | null {
  if (!Number.isInteger(point) || point < 0 || point >= shape.points.length) return null;
  const p = shape.points[point];
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  const radialAxis: 0 | 1 = axis === 'y' ? 0 : 1;
  const coord = p[radialAxis];
  if (Math.abs(coord) <= AXIS_DIAMETER_ON_AXIS_TOL_MM) return null;
  const side: -1 | 1 = coord > 0 ? 1 : -1;
  const radius = Math.abs(coord);
  const foot: P2 = axis === 'y' ? [0, p[1]] : [p[0], 0];
  const mirror: P2 = axis === 'y' ? [-p[0], p[1]] : [p[0], -p[1]];
  return {
    point,
    axis,
    radialAxis,
    side,
    radius,
    diameter: radius * 2,
    target: [p[0], p[1]],
    mirror,
    foot,
  };
}

/** Target point, mirrored counterpart across the axis, and foot on the axis for rendering a stored `adia` rule. */
export function axisDiameterEndpoints(
  points: readonly P2[],
  point: number,
  axis: SketchRevolutionAxis,
): AxisDiameterEndpoints | null {
  if (!Number.isInteger(point) || point < 0 || point >= points.length) return null;
  const p = points[point];
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  const foot: P2 = axis === 'y' ? [0, p[1]] : [p[0], 0];
  const mirror: P2 = axis === 'y' ? [-p[0], p[1]] : [p[0], -p[1]];
  return { target: [p[0], p[1]], mirror, foot };
}

/**
 * Post-solve invariant check for a stored `adia` rule: verifies authored half-plane preservation
 * (never crossing or collapsing onto the revolution axis) and exact radial settlement at D / 2.
 */
export function axisDiameterProblem(shape: AxisDiameterPolygon, rule: AxisDiameterRule): string | null {
  if (!Number.isInteger(rule.point) || rule.point < 0 || rule.point >= shape.points.length) {
    return 'Axis diameter references a missing point';
  }
  if ((rule.axis !== 'x' && rule.axis !== 'y') || (rule.side !== -1 && rule.side !== 1)) {
    return 'Axis diameter has an invalid revolution axis or side';
  }
  if (!Number.isFinite(rule.value) || rule.value < AXIS_DIAMETER_MIN_MM) {
    return 'Axis diameter must be at least 0.002 mm';
  }
  const p = shape.points[rule.point];
  if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
    return 'Axis diameter point has non-finite coordinates';
  }
  const radialAxis: 0 | 1 = rule.axis === 'y' ? 0 : 1;
  const coord = p[radialAxis];
  if (coord * rule.side <= AXIS_DIAMETER_ON_AXIS_TOL_MM) {
    return 'Axis diameter must keep the point on its authored side of the revolution axis';
  }
  const targetRadius = rule.value / 2;
  if (Math.abs(Math.abs(coord) - targetRadius) > POST_SOLVE_RADIAL_TOL_MM) {
    return 'Axis diameter did not settle at the requested radius';
  }
  return null;
}
