// Complete native torus coefficients and rectangular iso topology are required for an axial rim.
import type { Curve, Point, Surface } from '../types.js';
import { cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { revolutionOf } from '../nurbs/surfaces/surface-revolution.js';
import type { Brep, BrepEdge, BrepFace } from './brep-core.js';
import { createRectangularIsoBinder, NativeIsoBudgetError } from './brep-hidden-native-iso-binding.js';
import { circleOf } from './brep-tessellate.js';

type Circle = NonNullable<ReturnType<typeof circleOf>>;
interface Torus { center: Point; axis: Point; major: number; minor: number }
const ANGULAR = 1024 * Number.EPSILON;
const MAX_BINDINGS = 16;

export function createAxialTorusRimProof(toward: Point) {
  const cache = new WeakMap<BrepFace, Torus | null>(), binder = createRectangularIsoBinder();
  let bindings = 0, declined = false;
  const torus = (face: BrepFace) => {
    if (cache.has(face)) return cache.get(face)!;
    const s = face.surface;
    const value = s.kind === 'surface' && s.degreeU === 2 && s.degreeV === 2
      && s.controlPoints.length <= 5 && s.controlPoints[0]?.length <= 5 ? checkedTorus(s, checkedCircle) : null;
    cache.set(face, value);
    return value;
  };
  return (brep: Brep, edge: BrepEdge, first: BrepFace, second: BrepFace) => {
    if (declined || bindings >= MAX_BINDINGS || brep.faces.length !== 4 || brep.bodies.length !== 1
      || brep.bodies[0].kind !== 'solid' || edge.curve.degree !== 2 || edge.curve.controlPoints.length > 5) return;
    const a = torus(first), b = torus(second);
    if (!a || !b || len(cross(toward, a.axis)) > ANGULAR || len(cross(a.axis, b.axis)) > ANGULAR) return;
    const c = checkedCircle(edge.curve);
    if (!c || len(cross(unit(cross(c.e1, c.e2)), a.axis)) > ANGULAR) return;
    const error = roundoff([a.center, b.center, c.c], c.r);
    if (len(sub(c.c, a.center)) > error || len(sub(c.c, b.center)) > error
      || Math.abs(a.major - b.major) > error || Math.abs(a.minor - b.minor) > error) return;
    const outer = Math.abs(c.r - (a.major + a.minor)) <= error;
    if (!outer && Math.abs(c.r - (a.major - a.minor)) > error) return;
    bindings++;
    try {
      const proof = binder.bind(brep, edge, first, second);
      if (proof.kind === 'bound' && proof.binding.shell.closed) return { circle: c, outer };
    } catch (failure) {
      if (!(failure instanceof NativeIsoBudgetError)) throw failure;
      declined = true;
    }
  };
}

/** A complete one-direction sampled chain on this exact 3D rim, inside its native arc. */
export function axialRimInterval(chain: Point[], circle: Circle): [number, number] | undefined {
  const total = circle.spans.reduce((sum, span) => sum + span.phi, 0);
  if (!(total > 0 && total <= Math.PI + ANGULAR) || chain.length < 3 || chain.length > 512) return;
  const error = roundoff([circle.c], circle.r), normal = cross(circle.e1, circle.e2);
  const epsilon = Math.max(ANGULAR, 4 * error / circle.r);
  let previous: number | undefined, direction = 0, lo = Infinity, hi = -Infinity;
  for (const point of chain) {
    const radial = sub(point, circle.c);
    if (Math.abs(len(radial) - circle.r) > error || Math.abs(dot(radial, normal)) > error) return;
    const angle = Math.atan2(dot(radial, circle.e2), dot(radial, circle.e1));
    let t = (circle.sign * (angle - circle.a0)) % (2 * Math.PI);
    if (t < -epsilon) t += 2 * Math.PI;
    if (t > 2 * Math.PI - epsilon) t = 0;
    if (!(t >= -epsilon && t <= total + epsilon)) return;
    t = Math.max(0, Math.min(total, t));
    if (previous !== undefined && Math.abs(t - previous) > epsilon) {
      const next = Math.sign(t - previous);
      if (direction && next !== direction) return;
      direction = next;
    }
    previous = t;
    lo = Math.min(lo, t);
    hi = Math.max(hi, t);
  }
  return direction ? [lo, hi] : undefined;
}

function roundoff(points: readonly Point[], radius = 0): number {
  let magnitude = Math.max(1, radius);
  for (const p of points) for (let k = 0; k < 3; k++) magnitude = Math.max(magnitude, Math.abs(p[k]));
  return 1024 * Number.EPSILON * magnitude;
}
function quadraticSpans(curve: Curve): boolean {
  const count = (curve.controlPoints.length - 1) / 2, K = curve.knots;
  if (curve.degree !== 2 || !Number.isInteger(count) || count < 1 || K.length !== 2 * count + 4) return false;
  if (K[0] !== K[1] || K[1] !== K[2] || K[K.length - 1] !== K[K.length - 2] || K[K.length - 2] !== K[K.length - 3]) return false;
  for (let i = 0; i < count; i++) {
    if (!(K[2 + 2 * i] < K[3 + 2 * i])) return false;
    if (i && K[1 + 2 * i] !== K[2 + 2 * i]) return false;
  }
  return true;
}
function checkedCircle(curve: Curve): Circle | null {
  if (!quadraticSpans(curve)) return null;
  const c = circleOf(curve); if (!c || !(c.r > 0)) return null;
  const eps = roundoff(curve.controlPoints, c.r), n = unit(cross(c.e1, c.e2));
  // At unresolved coordinate/radius ratios, preserve the existing generic route.
  if (eps > c.r * 1e-6) return null;
  for (let i = 0; i < curve.controlPoints.length; i += 2) {
    const d = sub(curve.controlPoints[i], c.c);
    if (Math.abs(len(d) - c.r) > eps || Math.abs(dot(d, n)) > eps || Math.abs(curve.weights[i] - 1) > ANGULAR) return null;
  }
  for (let i = 1; i < curve.controlPoints.length; i += 2) {
    const w = curve.weights[i]; if (!(w > 0 && w < 1)) return null;
    const a = sub(curve.controlPoints[i - 1], c.c), b = sub(curve.controlPoints[i + 1], c.c);
    const expected: Point = [c.c[0] + (a[0] + b[0]) / (2 * w * w), c.c[1] + (a[1] + b[1]) / (2 * w * w), c.c[2] + (a[2] + b[2]) / (2 * w * w)];
    if (len(sub(curve.controlPoints[i], expected)) > eps || dot(cross(a, b), n) * c.sign <= 0
      || Math.abs(dot(a, b) / (c.r * c.r) - (2 * w * w - 1)) > 8 * eps / c.r) return null;
  }
  return c;
}
function checkedTorus(S: Surface, circle: (curve: Curve) => Circle | null): Torus | null {
  if (S.degreeU !== 2 || S.degreeV !== 2) return null;
  const eps = roundoff(S.controlPoints.flat()), R = revolutionOf(S, Math.max(1, eps / (1024 * Number.EPSILON)));
  if (!R || R.profile.kind !== 'arc' || !(R.profile.c[0] > R.profile.r && R.profile.r > 0) || eps > R.profile.r * 1e-6) return null;
  const major = R.profile.c[0], minor = R.profile.r, center: Point = [R.c[0] + R.a[0] * R.profile.c[1], R.c[1] + R.a[1] * R.profile.c[1], R.c[2] + R.a[2] * R.profile.c[1]];
  for (let axis = 0; axis < 2; axis++) {
    const angularCount = axis ? S.controlPoints[0].length : S.controlPoints.length, profileCount = axis ? S.controlPoints.length : S.controlPoints[0].length;
    const point = (i: number, j: number): Point => axis ? S.controlPoints[j][i] : S.controlPoints[i][j];
    const weight = (i: number, j: number) => axis ? S.weights[j][i] : S.weights[i][j];
    const firstWeight = weight(0, 0), angularPoints: Point[] = [], profilePoints: Point[] = [], angularWeights: number[] = [], profileWeights: number[] = [];
    if (!(firstWeight > 0)) continue;
    for (let i = 0; i < angularCount; i++) { angularPoints.push(point(i, 0)); angularWeights.push(weight(i, 0) / firstWeight); }
    for (let j = 0; j < profileCount; j++) { profilePoints.push(point(0, j)); profileWeights.push(weight(0, j) / firstWeight); }
    const angular = circle({ kind: 'curve', id: 'angular', degree: 2, knots: axis ? S.knotsV : S.knotsU, controlPoints: angularPoints, weights: angularWeights });
    const profile = circle({ kind: 'curve', id: 'profile', degree: 2, knots: axis ? S.knotsU : S.knotsV, controlPoints: profilePoints, weights: profileWeights });
    if (!angular || !profile || len(cross(unit(cross(angular.e1, angular.e2)), R.a)) > ANGULAR || Math.abs(profile.r - minor) > eps) continue;
    const d0 = sub(point(0, 0), center), h0 = dot(d0, R.a), radial0 = sub(d0, scale(R.a, h0)), rho0 = len(radial0), E = unit(radial0);
    if (!(rho0 > 0) || len(sub(profile.c, [center[0] + major * E[0], center[1] + major * E[1], center[2] + major * E[2]])) > eps) continue;
    let valid = true;
    for (let j = 0; j < profileCount && valid; j++) {
      const d = sub(point(0, j), center), h = dot(d, R.a), rho = dot(d, E);
      if (!(rho > 0) || len(sub(d, [rho * E[0] + h * R.a[0], rho * E[1] + h * R.a[1], rho * E[2] + h * R.a[2]])) > eps) { valid = false; break; }
      for (let i = 0; i < angularCount; i++) {
        const radial = sub(sub(point(i, 0), center), scale(R.a, h0));
        const expected: Point = [center[0] + h * R.a[0] + rho / rho0 * radial[0], center[1] + h * R.a[1] + rho / rho0 * radial[1], center[2] + h * R.a[2] + rho / rho0 * radial[2]];
        const w = weight(i, j) / firstWeight, expectedWeight = angularWeights[i] * profileWeights[j];
        if (!(w > 0) || Math.abs(w - expectedWeight) > ANGULAR * Math.max(1, Math.abs(w), Math.abs(expectedWeight)) || len(sub(point(i, j), expected)) > eps) { valid = false; break; }
      }
    }
    if (valid) {
      return { center, axis: R.a, major, minor };
    }
  }
  return null;
}
