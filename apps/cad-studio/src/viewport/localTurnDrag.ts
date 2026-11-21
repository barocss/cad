import { add, cross, dot, len, scale, sub, type Vec3 } from '@barocss/cad-model/engine/vec3';

/** Unit vector in the turn plane, obtained from the actual pointer ray. */
export function turnPlaneRadial(ray: { origin: Vec3; dir: Vec3 }, pivot: Vec3, normal: Vec3): Vec3 | null {
  const relative = sub(ray.origin, pivot);
  const incidence = dot(ray.dir, normal);
  if (!Number.isFinite(incidence) || Math.abs(incidence) < 1e-6) return null;
  const distance = -dot(relative, normal) / incidence;
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const radial = add(relative, scale(ray.dir, distance));
  const length = len(radial);
  return Number.isFinite(length) && length > 0 ? scale(radial, 1 / length) : null;
}

/** Right-handed angular step about the original unit normal. */
export function turnPlaneStep(from: Vec3, to: Vec3, normal: Vec3): number {
  return Math.atan2(dot(normal, cross(from, to)), dot(from, to)) * 180 / Math.PI;
}
