import { add, cross, dot, len, scale, sub } from '../core/vec3.js';
import type { Revolution } from '../nurbs/surfaces/surface-revolution.js';
import type { Point, Surface } from '../types.js';

interface PatchHull { S: Surface; hullMin: Point; hullMax: Point }
const HALF_CIRCLE_KNOTS = [0, 0, 0, 0.5, 0.5, 1, 1, 1];
const HALF_CIRCLE_WEIGHTS = [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1];
const LINE_KNOTS = [0, 0, 1, 1];
const LINE_WEIGHTS = [1, 1];
const SPHERE_HEIGHTS = [-1, -1, 0, 1, 1];
const SPHERE_RADII = [0, 1, 1, 1, 0];
const UNIT_ROUNDOFF = 64 * Number.EPSILON;
const AXES: readonly Point[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

function matchesKnots(knots: readonly number[], expected: readonly number[]): boolean {
  const from = knots[0], span = knots[knots.length - 1] - from;
  return knots.length === expected.length && span > 0 && knots.every((k, i) => Math.abs((k - from) / span - expected[i]) <= UNIT_ROUNDOFF);
}

function matchesHalfTurn(surface: Surface, roundoff: number, profile: 'sphere' | 'cone', point: (u: number, v: number) => Point): boolean {
  const sphere = profile === 'sphere';
  const weights = sphere ? HALF_CIRCLE_WEIGHTS : LINE_WEIGHTS, knots = sphere ? HALF_CIRCLE_KNOTS : LINE_KNOTS;
  const first = surface.weights[0]?.[0];
  if (!(first > 0) || !Number.isFinite(first) || surface.degreeU !== 2 || surface.degreeV !== (sphere ? 2 : 1)
    || surface.controlPoints.length !== 5 || surface.weights.length !== 5
    || !matchesKnots(surface.knotsU, HALF_CIRCLE_KNOTS) || !matchesKnots(surface.knotsV, knots)) return false;
  return surface.controlPoints.every((row, u) => row.length === weights.length && surface.weights[u].length === weights.length
    && row.every((p, v) => {
      const weight = surface.weights[u][v];
      return weight > 0 && Math.abs(weight / first - HALF_CIRCLE_WEIGHTS[u] * weights[v]) <= UNIT_ROUNDOFF
        && len(sub(p as Point, point(u, v))) <= roundoff;
    }));
}

function sideOf(hull: PatchHull, axis: number, plane: number, roundoff: number): -1 | 0 | 1 {
  if (hull.hullMax[axis] <= plane + roundoff && hull.hullMin[axis] < plane - 1000 * roundoff) return -1;
  if (hull.hullMin[axis] >= plane - roundoff && hull.hullMax[axis] > plane + 1000 * roundoff) return 1;
  return 0;
}

function halfTurnDirections(p: Point, centre: Point, meridian: Point, normal: Point): readonly Point[] {
  const m = scale(meridian, dot(sub(p, centre), meridian) < 0 ? -1 : 1);
  return [m, add(m, normal), normal, sub(normal, m), scale(m, -1)];
}

/** Opposed native half-turn patches can intersect only at isolated meridian crossings. */
export function isolatedSphereConeSeams(sphere: PatchHull, cone: PatchHull, sr: Revolution, cr: Revolution, tol: number): boolean {
  const sp = sr.profile, cp = cr.profile;
  if (sp.kind !== 'arc' || cp.kind !== 'line') return false;
  let magnitude = 1;
  for (let axis = 0; axis < 3; axis++)
    magnitude = Math.max(magnitude, Math.abs(sphere.hullMin[axis]), Math.abs(sphere.hullMax[axis]), Math.abs(cone.hullMin[axis]), Math.abs(cone.hullMax[axis]));
  const roundoff = UNIT_ROUNDOFF * magnitude;
  if (!(roundoff < tol * 1e-3) || !(sp.r > tol) || Math.abs(sp.c[0]) > roundoff
    || Math.min(Math.abs(cp.p[0]), Math.abs(cp.q[0])) > roundoff
    || Math.abs(cp.p[0] - cp.q[0]) <= tol || Math.abs(cp.p[1] - cp.q[1]) <= tol
    || !cr.a.some(v => Math.abs(v) === 1) || cr.a.some(v => v !== 0 && Math.abs(v) !== 1) || len(cross(cr.a, sr.a)) !== 0) return false;
  const centre = add(sr.c, scale(sr.a, sp.c[1]));
  const sphereRow = sphere.S.controlPoints[0], coneRow = cone.S.controlPoints[0];
  if (sphereRow?.length !== 5 || coneRow?.length !== 2) return false;
  const poleSign = dot(sub(sphereRow[4] as Point, sphereRow[0] as Point), sr.a) < 0 ? -1 : 1;
  const base = Math.abs(cp.p[0]) > Math.abs(cp.q[0]) ? 0 : 1;
  const coneBase = add(cr.c, scale(cr.a, (base ? cp.q : cp.p)[1]));
  for (let axis = 0; axis < 3; axis++) {
    const plane = cr.c[axis];
    if (cr.a[axis] !== 0 || Math.abs(centre[axis] - plane) > roundoff) continue;
    const side = sideOf(sphere, axis, plane, roundoff);
    if (!side || sideOf(cone, axis, plane, roundoff) !== -side) continue;
    const normal = AXES[axis];
    const meridian = cross(cr.a, normal), sphereDirections = halfTurnDirections(sphereRow[2] as Point, centre, meridian, scale(normal, side));
    const coneDirections = halfTurnDirections(coneRow[base] as Point, coneBase, meridian, scale(normal, -side));
    if (!matchesHalfTurn(sphere.S, roundoff, 'sphere', (u, v) => add(centre, add(scale(sr.a, poleSign * sp.r * SPHERE_HEIGHTS[v]), scale(sphereDirections[u], sp.r * SPHERE_RADII[v]))))) continue;
    if (!matchesHalfTurn(cone.S, roundoff, 'cone', (u, v) => {
      const p = v ? cp.q : cp.p;
      return add(cr.c, add(scale(cr.a, p[1]), scale(coneDirections[u], p[0])));
    })) continue;
    // The two straight generators must meet the meridian circle transversely and away from poles and endpoints.
    const poles = [sub(centre, scale(sr.a, sp.r)), add(centre, scale(sr.a, sp.r))];
    let crossings = 0;
    for (const row of [cone.S.controlPoints[0], cone.S.controlPoints[4]]) {
      const from = row[0] as Point, to = row[1] as Point, direction = sub(to, from), delta = sub(from, centre);
      const a = dot(direction, direction), b = dot(delta, direction), c = dot(delta, delta) - sp.r ** 2;
      const discriminant = b * b - a * c;
      if (!Number.isFinite(discriminant) || !(a > 0)) return false;
      if (discriminant < 0) continue;
      if (discriminant <= 0.01 * a * sp.r ** 2) return false;
      const root = Math.sqrt(discriminant), pad = roundoff / Math.sqrt(a);
      for (const t of [(-b - root) / a, (-b + root) / a]) {
        if (t < -pad || t > 1 + pad) continue;
        const x = add(from, scale(direction, t));
        const near = (p: Point) => len(sub(x, p)) <= 100 * tol;
        if (near(from) || near(to) || poles.some(near)) return false;
        crossings++;
      }
    }
    return crossings === 2;
  }
  return false;
}
