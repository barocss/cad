import { evaluateSurfaceD1 } from '../core/derivatives.js';
import { surfaceDomain } from '../core/math.js';
import { cross, dist, dot, len, lerp, scale, unit } from '../core/vec3.js';
import { revolutionOf } from '../nurbs/surfaces/surface-revolution.js';
import type { Curve, Point } from '../types.js';
import type { BrepFace } from './brep-core.js';

// The tangent plane on a regular generator is constant up to the collapsed apex.
// Bind the complete edge to a clamped chart boundary before using an interior normal.
function coneBoundary(face: BrepFace, a: Point, b: Point, size: number, roundoff: number) {
  const surface = face.surface;
  if (surface.kind !== 'surface' || surface.degreeU !== 2 || surface.degreeV !== 1) return;
  const rows = surface.controlPoints;
  if (rows.some((row, i) => row.length !== 2 || !(surface.weights[i][0] > 0) || surface.weights[i][0] !== surface.weights[i][1])) return;

  const boundary = [rows[0], rows.at(-1)!].findIndex(([from, to]) =>
    (dist(from, a) <= roundoff && dist(to, b) <= roundoff) || (dist(from, b) <= roundoff && dist(to, a) <= roundoff));
  if (boundary < 0) return;
  const apexColumn = [0, 1].find(column => rows.every(row => dist(row[column], rows[0][column]) <= roundoff));
  if (apexColumn === undefined) return;

  const cone = revolutionOf(surface, size);
  if (cone?.profile.kind !== 'line') return;
  const apex = rows[0][apexColumn];
  const profileEnd = apexColumn === 0 ? cone.profile.p : cone.profile.q;
  if (profileEnd[0] > roundoff) return;

  try {
    const { u, v } = surfaceDomain(surface);
    const { du, dv, point } = evaluateSurfaceD1(surface, u[boundary], v[0] / 2 + v[1] / 2);
    const normal = cross(unit(du), unit(dv));
    if (!(dist(point, lerp(a, b, 0.5)) <= roundoff) || !(len(normal) > 1e-9)) return;
    return { apex, axis: cone.a, normal: scale(unit(normal), face.sense === 'forward' ? 1 : -1) };
  } catch {
    // Unavailable native derivatives leave the existing mesh classification in place.
    return;
  }
}

/** A complete straight boundary shared by regular halves of one native cone. */
export function sharedConeMeridianNormal(edge: Curve, a: BrepFace, b: BrepFace, size: number): Point | undefined {
  if (edge.degree !== 1 || edge.controlPoints.length !== 2 || !(edge.weights[0] > 0) || edge.weights[0] !== edge.weights[1]) return;
  const [from, to] = edge.controlPoints;
  const roundoff = Math.min(64 * Number.EPSILON * Math.max(1, ...from.map(Math.abs), ...to.map(Math.abs)), 1e-9 * dist(from, to));
  const first = coneBoundary(a, from, to, size, roundoff);
  if (!first) return;
  const second = coneBoundary(b, from, to, size, roundoff);
  // The common apex, axis and straight generator identify the same cone support.
  if (!second || dist(first.apex, second.apex) > roundoff || len(cross(first.axis, second.axis)) > 1e-9
    || dot(first.normal, second.normal) <= 1 - 1e-9) return;
  return first.normal;
}
