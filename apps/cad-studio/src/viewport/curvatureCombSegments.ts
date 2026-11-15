import type { Vec3 } from '@barocss/cad-model/engine/vec3';
import type { OrbitCamera } from './camera';

export type OverlayPoint = [number, number];
export type OverlaySegment = [OverlayPoint, OverlayPoint];
type ClipPoint = [number, number, number]; // homogeneous X, Y, W; perspective W is forward depth

/**
 * Keep the viewport-visible part of a comb annotation, not its raster depth range.
 * The GPU camera fits different near/far planes, and comb tips may extend beyond
 * the mesh. Orthographic annotations therefore ignore depth. Perspective clips
 * in front of the eye before division and then against the four viewport sides.
 * Its eye guard is 64 * Number.EPSILON * camera distance, not a near plane.
 */
export function projectOverlaySegment(camera: OrbitCamera, a: Vec3, b: Vec3, width: number, height: number): OverlaySegment | null {
  if (!a.every(Number.isFinite) || !b.every(Number.isFinite) || !Number.isFinite(width) || !Number.isFinite(height)
    || width <= 0 || height <= 0 || !Number.isFinite(camera.distance) || camera.distance <= 0) return null;
  const basis = camera.basis(), projection = camera.projection();
  if (![basis.eye, basis.right, basis.up, basis.forward].every(v => v.every(Number.isFinite))
    || ![basis.right, basis.up, basis.forward].every(v => v.some(value => value !== 0))
    || !Number.isFinite(projection[0]) || !Number.isFinite(projection[5]) || projection[0] <= 0 || projection[5] <= 0) return null;
  const toClip = (p: Vec3): ClipPoint => {
    const dx = p[0] - basis.eye[0], dy = p[1] - basis.eye[1], dz = p[2] - basis.eye[2];
    // Keep OrbitCamera.project arithmetic for untouched ordinary endpoints.
    const x = projection[0] * (dx * basis.right[0] + dy * basis.right[1] + dz * basis.right[2]);
    const y = projection[5] * (dx * basis.up[0] + dy * basis.up[1] + dz * basis.up[2]);
    const w = camera.ortho ? 1 : dx * basis.forward[0] + dy * basis.forward[1] + dz * basis.forward[2];
    return [x, y, w];
  };
  let start = toClip(a), end = toClip(b);
  if (!start.every(Number.isFinite) || !end.every(Number.isFinite)) return null;
  const guard = Math.max(64 * Number.EPSILON * camera.distance, 4 * Number.MIN_VALUE);
  // Half-sized distances avoid overflowing X + W for large finite inputs.
  const planes: { distance(p: ClipPoint): number; snap(p: ClipPoint): void }[] = [
    ...(!camera.ortho ? [{ distance: (p: ClipPoint) => p[2] * 0.5 - guard * 0.5, snap: (p: ClipPoint) => { p[2] = guard; } }] : []),
    { distance: p => p[2] * 0.5 + p[0] * 0.5, snap: p => { p[0] = -p[2]; } },
    { distance: p => p[2] * 0.5 - p[0] * 0.5, snap: p => { p[0] = p[2]; } },
    { distance: p => p[2] * 0.5 + p[1] * 0.5, snap: p => { p[1] = -p[2]; } },
    { distance: p => p[2] * 0.5 - p[1] * 0.5, snap: p => { p[1] = p[2]; } },
  ];
  for (const plane of planes) {
    const da = plane.distance(start), db = plane.distance(end);
    if (da < 0 && db < 0) return null;
    if (da >= 0 && db >= 0) continue;
    // Opposite signs: scale the ratio instead of overflowing da - db.
    const scale = Math.max(Math.abs(da), Math.abs(db));
    const aa = Math.abs(da) / scale, bb = Math.abs(db) / scale, t = aa / (aa + bb);
    const hit: ClipPoint = [0, 1, 2].map(i => (1 - t) * start[i] + t * end[i]) as ClipPoint;
    // Enforce the known plane exactly after interpolation near the eye.
    plane.snap(hit);
    if (!hit.every(Number.isFinite)) return null;
    if (da < 0) start = hit; else end = hit;
  }
  const pixel = (p: ClipPoint): OverlayPoint | null => {
    if (!(p[2] > 0)) return null;
    const x = p[0] / p[2], y = p[1] / p[2];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    // Absorb rounding at already-clipped viewport boundaries.
    return [Math.max(0, Math.min(width, (x * 0.5 + 0.5) * width)),
      Math.max(0, Math.min(height, (1 - (y * 0.5 + 0.5)) * height))];
  };
  const p = pixel(start), q = pixel(end);
  return p && q ? [p, q] : null;
}
