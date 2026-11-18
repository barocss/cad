import { cross, dot, len, sub, type Vec3 } from '../engine/vec3';

export type MeshCircleFailureCode = 'MESH_CIRCLE_INPUT' | 'MESH_CIRCLE_RANGE' | 'MESH_CIRCLE_DUPLICATE' | 'MESH_CIRCLE_COLLINEAR';
export type MeshCircleResult = { ok: true; center: Vec3; radius: number; diameter: number; normal: Vec3 }
  | { ok: false; code: MeshCircleFailureCode; reason: string };
const fail = (code: MeshCircleFailureCode, reason: string): MeshCircleResult => ({ ok: false, code, reason });
/** Session-only reference circle through three supplied points, not a fitted hole or manufacturing certificate.
 * Coordinates/radius <= 1e12 mm, every baseline >= 1e-6 mm, normalized triangle area > 1e-8.
 * No rounding or grid snap. The caller must separately prove current mesh-vertex ownership.
 */
export function meshCircle(points: readonly (readonly number[])[]): MeshCircleResult {
  if (!Array.isArray(points) || points.length !== 3 || ![0,1,2].every(i => Object.hasOwn(points,i)
    && Array.isArray(points[i]) && points[i].length === 3 && [0,1,2].every(k => Object.hasOwn(points[i],k) && Number.isFinite(points[i][k]))))
    return fail('MESH_CIRCLE_INPUT', 'Select three finite XYZ points.');
  if (points.some(p => p.some((x: number) => Math.abs(x) > 1e12))) return fail('MESH_CIRCLE_RANGE', 'Coordinates exceed the supported 1e12 mm range.');
  const [a,b,c] = points, u = sub(b,a), v = sub(c,a), lengths = [len(u),len(v),len(sub(c,b))];
  if (Math.min(...lengths) < 1e-6) return fail('MESH_CIRCLE_DUPLICATE', 'Points must be distinct and at least 1e-6 mm apart.');
  const scale = Math.max(...lengths), U = u.map(x => x/scale) as Vec3, V = v.map(x => x/scale) as Vec3;
  const n = cross(U,V), area = len(n);
  if (area <= 1e-8) return fail('MESH_CIRCLE_COLLINEAR', 'The points are collinear or too poorly conditioned for a reference circle.');
  const vn = cross(V,n), nu = cross(n,U), uu = dot(U,U), vv = dot(V,V);
  const offset = vn.map((x,k) => (uu*x + vv*nu[k])/(2*area*area)*scale) as Vec3;
  const radius = len(offset), center = a.map((x: number,k: number) => x+offset[k]) as Vec3;
  if (!Number.isFinite(radius) || radius > 1e12 || !center.every(x => Number.isFinite(x) && Math.abs(x) <= 1e12))
    return fail('MESH_CIRCLE_RANGE', 'The reference circle exceeds the supported 1e12 mm range.');
  // Reject loss of coordinate precision, never silently clamp an unstable result.
  const tolerance = Math.max(1e-9, radius*1e-9);
  if (points.some(p => Math.abs(len(sub(p,center))-radius) > tolerance))
    return fail('MESH_CIRCLE_RANGE', 'Coordinate precision cannot represent this reference circle reliably.');
  return { ok: true, center, radius, diameter: 2*radius, normal: n.map(x => x/area) as Vec3 };
}
