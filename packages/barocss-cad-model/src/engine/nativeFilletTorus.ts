import { revolutionOf, type CadPartOutput } from '@barocss/cad';
import { add, len, scale, sub, type Vec3 } from './vec3';

/** Native surface and exact resolved edge of a single terminal toroidal fillet. */
export interface NativeFilletTorus {
  edge: string;
  face: string;
  centre: Vec3;
  axis: Vec3;
  majorRadius: number;
  radius: number;
}

export function nativeFilletTorusOf(output: CadPartOutput): NativeFilletTorus | undefined {
  if (output.filletTargets?.length !== 1 || output.bodyCount !== 1) return;
  const { brep } = output, [edge] = output.filletTargets;
  if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' ||
    brep.shells.length !== 1 || !brep.shells[0].closed) return;
  const faces = brep.faces.filter(face => face.name?.startsWith(output.feature + '.'));
  const face = faces[0];
  if (faces.length !== 1 || face.name !== output.feature + '.face' || face.surface.kind !== 'surface') return;
  const points = face.surface.controlPoints.flat(), origin = points[0];
  if (!origin) return;
  const size = points.reduce((extent, point) => Math.max(extent, len(sub(point, origin))), 0);
  if (!(size > 0) || !Number.isFinite(size)) return;
  let revolution: ReturnType<typeof revolutionOf>;
  try { revolution = revolutionOf(face.surface, size); }
  catch { return; }
  if (revolution?.profile.kind !== 'arc' || !(revolution.profile.c[0] > 0) || !(revolution.profile.r > 0)) return;
  const { c, a, profile } = revolution;
  const centre = add(c, scale(a, profile.c[1]));
  if (![...centre, ...a, profile.c[0], profile.r].every(Number.isFinite)) return;
  return { edge, face: face.name, centre, axis: a, majorRadius: profile.c[0], radius: profile.r };
}
