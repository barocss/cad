import { add, cross, dot, len, scale, sub, type Vec3 } from '@barocss/cad-model/engine/vec3';
import type { FeatureHandle } from './gizmo';

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

type Arc = NonNullable<FeatureHandle['arc']>;
export interface WorldAngleDrag {
  id: string; owner: unknown; source: object; frame: string; arc: Arc;
  radial: Vec3; start: number; degrees: number; toValue: FeatureHandle['toValue'];
}

export function beginWorldAngleDrag(handle: FeatureHandle, frame: string, radial: Vec3): WorldAngleDrag | undefined {
  if (!handle.arc?.worldPlane || !handle.scalarDragSession || !Number.isFinite(handle.value)) return;
  return { id: handle.id, owner: handle.owner, source: handle.scalarDragSession, frame, arc: handle.arc,
    radial, start: handle.value, degrees: 0, toValue: handle.toValue };
}

/** History may replace the hinge while the editor and command still have the same identity. */
export function ownsWorldAngleDrag(drag: WorldAngleDrag, handle: FeatureHandle | undefined): boolean {
  const arc = handle?.arc;
  const same = (a: Vec3, b: Vec3) => a.every((value, axis) => value === b[axis]);
  return !!handle && !!arc?.worldPlane && handle.id === drag.id && handle.owner === drag.owner && handle.scalarDragSession === drag.source
    && same(arc.centre, drag.arc.centre) && same(arc.axis, drag.arc.axis) && same(arc.from, drag.arc.from);
}

export function worldAngleDragValue(drag: WorldAngleDrag, handle: FeatureHandle | undefined, frame: string, radial: Vec3 | null): number | null {
  if (!radial || frame !== drag.frame || !ownsWorldAngleDrag(drag, handle)) return null;
  drag.degrees += turnPlaneStep(drag.radial, radial, drag.arc.axis);
  drag.radial = radial;
  const value = drag.toValue(drag.start, drag.degrees);
  return Number.isFinite(value) ? value : null;
}
