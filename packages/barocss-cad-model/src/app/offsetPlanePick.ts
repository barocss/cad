import { lookKey, rootOf } from './lookKey';
import { featureLabel } from '../engine/doc';
import { offsetPlaneWitness } from '../engine/offsetPlane';
import { partBreps } from '../engine/evaluate';
import type { BodyRef, OffsetPlaneRef } from '../engine/doc';
import { refusal } from '../engine/refusal';
import type { Ctx, FaceSel, Field, Values } from './commands';
import { extrudeEndFaceTarget, extrudeEndFaceValues } from './extrudeEndFacePick';

export function isOffsetToPlane(command: string, values: Values): boolean {
  return (command === 'offset-face' || command === 'offset-face-edit') && values.offsetMode === 'to-plane';
}

export function isReferencePlaneEdit(command: string, values: Values): boolean {
  return command === 'replace-face' || command === 'replace-face-edit' || isOffsetToPlane(command, values);
}

export function awaitingOffsetPlane(command: string, values: Values): boolean {
  return isReferencePlaneEdit(command, values) && values.endFace === undefined && values.keepPlane !== 1;
}

export const offsetFields = (allowPlane: boolean): Field[] => [
  ...(allowPlane ? [{ key: 'offsetMode', label: 'Mode', kind: 'choice' as const,
    options: [{ value: 'distance', label: 'Distance' }, { value: 'to-plane', label: 'To plane' }] }] : []),
  { key: 'd', label: 'Offset', kind: 'mm', when: values => values.offsetMode !== 'to-plane' },
];

/** Mode changes retain the current session target; only an explicit invalid repick clears it. */
export function resetOffsetPlane(_ctx: Ctx, values: Values, _changed: readonly string[]): Values {
  return values;
}

/** Restore a saved target only through the current unique body and exact named planar face. */
export function restoreOffsetPlaneValues(ctx: Ctx, values: Values, saved: OffsetPlaneRef): Values {
  const matches = ctx.bodies.flatMap((body, index) => body.ref?.node === saved.body.node && body.ref.side === saved.body.side ? [index] : []);
  if (matches.length !== 1) return values;
  const next = { ...values, endBody: matches[0], endFace: saved.face };
  const target = extrudeEndFaceTarget(ctx, next);
  return target && target.feature === saved.feature && target.face === saved.face
    && target.body.node === saved.body.node && target.body.side === saved.body.side ? { ...next, keepPlane: 1 } : values;
}

export function offsetPlaneStep(values: Values, saved?: OffsetPlaneRef, ctx?: Ctx, prompt = 'Pick a parallel face on another solid') {
  const name = values.endFace ?? (values.keepPlane === 1 ? saved?.face : undefined);
  const target = ctx && extrudeEndFaceTarget(ctx, values), body = target && ctx?.bodies[Number(values.endBody)];
  const root = body?.ref && ctx ? rootOf(ctx.doc.nodes, body.ref.node) : -1;
  const source = ctx?.doc.nodes[root];
  const label = body && ctx ? ctx.doc.bodies?.[lookKey(ctx.doc.nodes, body)]?.name
    || (source ? featureLabel(source, root, ctx.doc.nodes) : body.key) : undefined;
  const text = body && label ? `${label} (${body.key}) · ${name}` : String(name ?? prompt);
  return { label: 'Reference plane', text, done: name !== undefined };
}

export function pickOffsetPlane(ctx: Ctx, values: Values, hit: FaceSel | null, parent: BodyRef | undefined, before: number): Values | { error: string } | null {
  if (values.offsetMode !== 'to-plane') return null;
  return pickReferencePlane(ctx, values, hit, parent, before);
}

export function pickReferencePlane(ctx: Ctx, values: Values, hit: FaceSel | null, parent: BodyRef | undefined, before: number): Values | { error: string } {
  const next = hit && extrudeEndFaceValues(ctx, values, hit);
  const target = next && extrudeEndFaceTarget(ctx, next);
  if (!next || !target || target.body.node >= before || target.body.node === parent?.node)
    return { error: 'Pick one original planar face of another earlier solid.' };
  return { ...next, keepPlane: 0 };
}

export function captureOffsetPlane(ctx: Ctx, values: Values, parent: BodyRef, before: number, label = 'Offset face'): OffsetPlaneRef {
  const target = extrudeEndFaceTarget(ctx, values);
  if (!target || target.body.node >= before || target.body.node === parent.node)
    throw refusal('BAD_REFERENCE', `${label}: pick one original planar face of another earlier solid.`);
  const body = ctx.bodies[Number(values.endBody)];
  const picked = body.mesh.faces.find(face => face.name === target.face && face.nativePlaneName === target.face);
  const match = partBreps(ctx.doc).filter(candidate => candidate.key === body.key);
  const native = match.length === 1 && match[0].brep;
  const witness = picked && native && native.faces.some(face => face.id === picked.id && face.name === target.face) &&
    offsetPlaneWitness(native, target.face);
  if (!witness) throw refusal('BAD_REFERENCE', `${label}: the reference must be one exact native plane.`);
  return { ...target, normal: witness.normal, localAnchor: witness.localAnchor, localSupport: witness.localSupport };
}
