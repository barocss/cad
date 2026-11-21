import { faceGeometry, type CadPartOutput } from '@barocss/cad';
import type { Vec3 } from './vec3';

/** Resolved targets and outward cylinders of a constant two-edge Fillet on the unplaced body. */
export interface NativeFilletPair {
  targets: readonly [string, string];
  cylinders: readonly [
    { c: Vec3; a: Vec3; r: number },
    { c: Vec3; a: Vec3; r: number },
  ];
}

export function nativeFilletPairOf(output: CadPartOutput): NativeFilletPair | undefined {
  const { brep, filletTargets } = output;
  if (filletTargets?.length !== 2 || filletTargets[0] === filletTargets[1] || output.bodyCount !== 1 ||
    brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 1 ||
    brep.shells.length !== 1 || !brep.shells[0].closed || brep.bodies[0].shells[0] !== brep.shells[0].id) return;
  const prefix = output.feature + '.';
  const faces = brep.faces.filter(face => face.name?.startsWith(prefix));
  if (faces.length !== 2 || !faces.some(face => face.name === prefix + 'face#1') ||
    !faces.some(face => face.name === prefix + 'face#2')) return;
  try {
    const [first, second] = faces.map(face => faceGeometry(face));
    if (first.kind !== 'cylinder' || second.kind !== 'cylinder' || first.out !== 1 || second.out !== 1) return;
    return {
      targets: [filletTargets[0], filletTargets[1]],
      cylinders: [{ c: [...first.c], a: [...first.a], r: first.r }, { c: [...second.c], a: [...second.a], r: second.r }],
    };
  } catch {
    // A result without two native analytical cylinders cannot qualify the handle.
    return;
  }
}
