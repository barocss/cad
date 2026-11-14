import { offsetPlaneWitness } from '../engine/offsetPlane';
import { partBreps } from '../engine/evaluate';
import type { BodyRef, OffsetPlaneRef } from '../engine/doc';
import { refusal } from '../engine/refusal';
import type { Ctx, FaceSel, Field, Values } from './commands';
import { extrudeEndFaceTarget, extrudeEndFaceValues } from './extrudeEndFacePick';

export function isOffsetToPlane(command: string, values: Values): boolean {
  return (command === 'offset-face' || command === 'offset-face-edit') && values.offsetMode === 'to-plane';
}

export function awaitingOffsetPlane(command: string, values: Values): boolean {
  return isOffsetToPlane(command, values) && values.endFace === undefined && values.keepPlane !== 1;
}

export const offsetFields = (allowPlane: boolean): Field[] => [
  ...(allowPlane ? [{ key: 'offsetMode', label: 'Mode', kind: 'choice' as const,
    options: [{ value: 'distance', label: 'Distance' }, { value: 'to-plane', label: 'To plane' }] }] : []),
  { key: 'd', label: 'Offset', kind: 'mm', when: values => values.offsetMode !== 'to-plane' },
];

export function resetOffsetPlane(_ctx: Ctx, values: Values, changed: readonly string[]): Values {
  if (!changed.includes('offsetMode')) return values;
  const rest = { ...values };
  delete rest.endBody;
  delete rest.endFace;
  delete rest.keepPlane;
  return rest;
}

export function offsetPlaneStep(values: Values, saved?: OffsetPlaneRef) {
  const name = values.endFace ?? (values.keepPlane === 1 ? saved?.face : undefined);
  return { label: 'Reference plane', text: String(name ?? 'Pick a parallel face on another solid'), done: name !== undefined };
}

export function pickOffsetPlane(ctx: Ctx, values: Values, hit: FaceSel | null, parent: BodyRef | undefined, before: number): Values | { error: string } | null {
  if (values.offsetMode !== 'to-plane') return null;
  const next = hit && extrudeEndFaceValues(ctx, values, hit);
  const target = next && extrudeEndFaceTarget(ctx, next);
  if (!next || !target || target.body.node >= before || target.body.node === parent?.node)
    return { error: 'Pick one original planar face of another earlier solid.' };
  return { ...next, keepPlane: 0 };
}

export function captureOffsetPlane(ctx: Ctx, values: Values, parent: BodyRef, before: number): OffsetPlaneRef {
  const target = extrudeEndFaceTarget(ctx, values);
  if (!target || target.body.node >= before || target.body.node === parent.node)
    throw refusal('BAD_REFERENCE', 'Offset face: pick one original planar face of another earlier solid.');
  const body = ctx.bodies[Number(values.endBody)];
  const picked = body.mesh.faces.find(face => face.name === target.face && face.nativePlaneName === target.face);
  const match = partBreps(ctx.doc).filter(candidate => candidate.key === body.key);
  const native = match.length === 1 && match[0].brep;
  const witness = picked && native && native.faces.some(face => face.id === picked.id && face.name === target.face) &&
    offsetPlaneWitness(native, target.face);
  if (!witness) throw refusal('BAD_REFERENCE', 'Offset face: the reference must be one exact native plane.');
  return { ...target, normal: witness.normal, localAnchor: witness.localAnchor, localSupport: witness.localSupport };
}
