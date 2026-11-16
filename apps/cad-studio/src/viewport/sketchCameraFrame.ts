import { toWorld, type SketchPlane } from '@barocss/cad-model/sketch/plane';
import type { OrbitCamera } from './camera';
export interface SketchCameraFrame { min: [number, number]; max: [number, number]; plane: SketchPlane }
/** Plane object identity retires work from another sketch, even for equal coefficients. */
export function ownsSketchCameraFrame(frame: SketchCameraFrame | null, active: SketchPlane | undefined): frame is SketchCameraFrame {
  return !!frame && frame.plane === active;
}
export function applySketchCameraFrame(camera: OrbitCamera, frame: SketchCameraFrame, width: number, height: number, area?: { left: number; right: number } | null): void {
  const { min, max, plane } = frame;
  camera.aspect = Math.max(1, width) / Math.max(1, height);
  camera.faceNormal(plane.normal);
  camera.frameAt(toWorld(plane, [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2]),
    [max[0] - min[0], max[1] - min[1]], area?.left ?? 0, area ? 1 - area.right : 0);
}
