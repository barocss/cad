import type { HandleSpec } from '@barocss/cad-model/app/commands';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { DisplayFace } from '@barocss/cad-model/engine/mesh';
import type { angledTopFilletSource } from '@barocss/cad-model/engine/nativeAngledTopFillet';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { add, cross, len, scale, sub, unit, type Vec3 } from '@barocss/cad-model/engine/vec3';
import { closedSolid, exactStraightEdge, originalFilletEdge } from './historyFilletEvidence';

type Fillet = Extract<ModelNode, { kind: 'fillet' }>;
const up: Vec3 = [0, 0, 1];
const tolerance = 1e-8;
const samePoint = (a: Vec3, b: Vec3) => len(sub(a, b)) <= tolerance;

/** A saved frame follows the original top rim after its exact finished cylinder is verified. */
export function angledTopFilletFrame(spec: NonNullable<ReturnType<typeof angledTopFilletSource>>, fillet: Fillet,
  stock: BodyResult, finished: BodyResult, face: DisplayFace, radius: number): Pick<HandleSpec, 'at' | 'dir'> | undefined {
  const proof = finished.nativeAngledTopFillet, exact = face.exact;
  if (!proof || proof.edge !== spec.edge || proof.faceId !== face.id || exact?.kind !== 'cylinder' ||
    !closedSolid(stock) || !closedSolid(finished)) return;
  const match = originalFilletEdge(stock, fillet, spec.edge, signaturesOf(stock));
  if (!match || !exactStraightEdge(match) || match.source.axis !== null) return;
  const { a, b, nativeVertices, nativeJoint } = match.source;
  if (!nativeVertices || nativeVertices[0] === nativeVertices[1] || !nativeJoint ||
    !((samePoint(a, spec.a) && samePoint(b, spec.b)) || (samePoint(a, spec.b) && samePoint(b, spec.a)))) return;
  const supports = nativeJoint.faces.map(id => stock.mesh.faces.find(parent => parent.id === id));
  const cap = supports.find(parent => parent?.nativePlaneName === spec.top)?.exact;
  const wall = supports.find(parent => parent?.nativePlaneName === spec.wall)?.exact;
  if (cap?.kind !== 'plane' || !samePoint(cap.n, up) || wall?.kind !== 'plane' || !samePoint(wall.n, spec.outward)) return;
  const along = unit(sub(spec.b, spec.a)), outward = add(cap.n, wall.n);
  const centre = sub(spec.a, scale(outward, radius));
  const support = (origin: Vec3, axis: Vec3, candidateRadius: number) =>
    [...origin, ...axis, candidateRadius].every(Number.isFinite) && Math.abs(len(axis) - 1) <= tolerance &&
    len(cross(axis, along)) <= tolerance && len(cross(sub(origin, centre), along)) <= tolerance &&
    Math.abs(candidateRadius - radius) <= tolerance;
  if (!support(proof.centre, proof.axis, proof.radius) || !support(exact.c, exact.a, exact.r)) return;
  const dir = unit(outward);
  return { at: add(scale(add(a, b), .5), scale(dir, radius)), dir };
}
