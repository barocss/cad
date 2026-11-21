import { linearToleranceMM } from '../numeric-policy.js';
import { convexPolygonClearsOrigin } from './convex-polygon-screw-axis.js';

type XY = readonly [number, number];

/** The native triangle tolerance; invalid or near-collinear local corners are refused. */
export function triangleScrewAxisTolerance(local: readonly XY[]): number | undefined {
  if (!Array.isArray(local) || local.length !== 3
    || local.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) return;
  const [a, b, c] = local;
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1];
  const span = Math.max(Math.hypot(ux, uy), Math.hypot(vx, vy), Math.hypot(c[0] - b[0], c[1] - b[1]));
  const tolerance = linearToleranceMM(span), area = ux * vy - uy * vx;
  if (!Number.isFinite(span) || !Number.isFinite(area) || Math.abs(area) <= tolerance * span) return;
  return tolerance;
}

/** Exact outside and closed-segment clearance tests for the represented local origin-axis triangle. */
export function triangleClearsScrewAxis(local: readonly XY[]): boolean {
  const tolerance = triangleScrewAxisTolerance(local);
  return tolerance !== undefined && convexPolygonClearsOrigin(local, tolerance);
}
