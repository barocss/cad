import type { DisplayMesh } from '@barocss/cad-model/engine/mesh';
import { dot, sub, type OrbitCamera } from './camera';

type SweepCylinder = NonNullable<NonNullable<DisplayMesh['cylinderDetail']>['sweep']>;

/** Upper bound on CSS pixels per millimetre over the complete cylinder and its chords. */
export function sweepCylinderScale(camera: OrbitCamera, width: number, height: number, cylinder: SweepCylinder): number | undefined {
  if (width <= 0 || height <= 0) return;
  // The viewport sets its aspect to width/height. Both CSS focal lengths are then the same.
  const focal = height / (2 * Math.tan(camera.fovY / 2));
  if (camera.ortho) return focal / camera.distance;
  const { eye, forward, right, up } = camera.basis();
  const endpoints = cylinder.centres.map(point => sub(point, eye));
  const closest = Math.min(...endpoints.map(point => dot(point, forward))) - cylinder.radius;
  if (!(closest > camera.near())) return Infinity;
  const transverse = Math.max(...endpoints.map(point => Math.hypot(dot(point, right), dot(point, up)))) + cylinder.radius;
  const scale = focal / closest * Math.hypot(1, transverse / closest);
  return Number.isFinite(scale) ? scale : Infinity;
}
