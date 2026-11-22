import { checkBrep, revolutionOf, type BrepFace, type CadPartOutput } from '@barocss/cad';
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

export interface NativeFilletTorusFace extends Omit<NativeFilletTorus, 'edge'> {
  faceId: string;
}

/** Independent resolved targets and separate native surfaces; their array indices do not match. */
export interface NativeFilletTorusPair {
  targets: readonly [string, string];
  tori: readonly [NativeFilletTorusFace, NativeFilletTorusFace];
}

function torusGeometry(face: BrepFace): Omit<NativeFilletTorus, 'edge' | 'face'> | undefined {
  if (face.surface.kind !== 'surface') return;
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
  return { centre, axis: a, majorRadius: profile.c[0], radius: profile.r };
}

export function nativeFilletTorusOf(output: CadPartOutput): NativeFilletTorus | undefined {
  if (output.filletTargets?.length !== 1 || output.bodyCount !== 1) return;
  const { brep } = output, [edge] = output.filletTargets;
  if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' ||
    brep.shells.length !== 1 || !brep.shells[0].closed) return;
  const faces = brep.faces.filter(face => face.name?.startsWith(output.feature + '.'));
  const face = faces[0];
  if (faces.length !== 1 || face.name !== output.feature + '.face') return;
  const geometry = torusGeometry(face);
  return geometry && { edge, face: face.name, ...geometry };
}

export function nativeFilletTorusPairOf(output: CadPartOutput): NativeFilletTorusPair | undefined {
  const { brep, filletTargets: targets } = output;
  if (targets?.length !== 2 || targets[0] === targets[1] || output.bodyCount !== 1 ||
    brep.source.family !== 'analytic-boolean' || brep.source.id !== output.feature ||
    brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 1 ||
    brep.shells.length !== 1 || !brep.shells[0].closed || brep.bodies[0].shells[0] !== brep.shells[0].id) return;
  const faces = brep.faces.filter(face => face.name?.startsWith(output.feature + '.'));
  if (faces.length !== 2 || faces[0].id === faces[1].id ||
    !faces.some(face => face.name === output.feature + '.face#1') ||
    !faces.some(face => face.name === output.feature + '.face#2')) return;
  try {
    if (!checkBrep(brep, { strict: true }).valid) return;
    const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
    const uses = new Map(brep.coedges.map(use => [use.id, use]));
    const blendIds = new Set(faces.map(face => face.id)), trimIds = new Set<string>();
    for (const face of faces) {
      const loop = loops.get(face.loops[0]);
      if (face.shell !== brep.shells[0].id || face.loops.length !== 1 ||
        !loop || loop.face !== face.id || loop.kind !== 'outer' || loop.coedges.length !== 4) return;
      for (const id of loop.coedges) {
        const use = uses.get(id), twin = use?.twin && uses.get(use.twin);
        if (!use || use.loop !== loop.id || !twin || twin.twin !== use.id || twin.edge !== use.edge ||
          blendIds.has(loops.get(twin.loop)?.face ?? '') || trimIds.has(use.edge)) return;
        trimIds.add(use.edge);
      }
    }
    const tori = faces.map(face => {
      const geometry = torusGeometry(face);
      return geometry && Math.abs(len(geometry.axis) - 1) <= 1e-9
        ? { faceId: face.id, face: face.name!, ...geometry } : undefined;
    });
    const [first, second] = tori;
    if (!first || !second) return;
    return { targets: [targets[0], targets[1]], tori: [first, second] };
  } catch {
    // Missing or unsupported native ownership leaves the typed radius available.
    return;
  }
}
