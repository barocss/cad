import type { Command, Ctx, Field, Values } from '@barocss/cad-model/app/commands';
import type { ExtrudeJoinEvidence } from '@barocss/cad-model/app/profileCommands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { FeatureFailure } from './failedFeature';
/** `placing`: a new shape that follows the pointer until a click (or a drop from the rail) stands it there. */
export function missingCommandField(fields: readonly Field[], values: Values): Field | undefined {
  for (const field of fields) {
    const value = values[field.key];
    if (field.kind === 'text' || field.kind === 'file') {
      if (typeof value !== 'string' || !value.trim() || value.length > field.maxLength) return field;
    } else if (field.kind !== 'choice' && (value === '' || !Number.isFinite(Number(value)))) return field;
  }
  return undefined;
}

export function awaitingMirrorPlane(command: string, values: Values): boolean {
  return command === 'mirror' && values.pickPlane === 'yes';
}

type EdgeScope = { picked: readonly string[]; added: readonly string[] };
type ChamferScope = { picked: readonly string[]; added?: readonly string[] };
type FilletScope = EdgeScope & (
  { radius: number; pickedRadii?: never } | { radius?: never; pickedRadii: readonly [number, number] }
);
export type JoinedRevolvePick = { union: number; stock: import('@barocss/cad-model/engine/evaluate').BodyResult };
export interface ExtrudeJoinReceipt { scope: object; evidence: ExtrudeJoinEvidence }
export interface Active { ownsSource?(): boolean; historyFilletRadius?: true; offsetCollapse?: { cmd: Command; ctx: Ctx; values: Values; error: FeatureFailure }; offsetPlanePickIssue?: { cmd: Command; ctx: Ctx; values: Values; hint: string }; joinedRevolvePick?: JoinedRevolvePick; cmd: Command; values: Values; preview: 'busy' | 'ok' | 'error' | 'input'; error?: FeatureFailure; ctx: Ctx; placing?: boolean; upload?: 'busy' | 'error'; fillet?: { type: import('./filletFamily').FilletType; radiusMode: import('./filletFamily').RadiusMode; varyingDraft?: Values }; extrudeResult?: { target: string; pieces: number; solid: boolean }; filletScope?: FilletScope; chamferScope?: ChamferScope; flangeFlatWarning?: { ctx: Ctx; values: Values; reason: string };
  independentExtrude?: { ownsModel(): boolean; joinScope(): object | null };
  extrudeJoinReceipt?: ExtrudeJoinReceipt;
  independentExtrudePreview?: { receipt?: ExtrudeJoinReceipt; values: Values; doc: StudioDoc; bodies: BodyResult[] };
}

export function selectedExtrudeJoin(active: Active): boolean {
  return active.cmd.id === 'extrude' && typeof active.values.op === 'string' && active.values.op.startsWith('join:');
}

export function extrudeJoinContext(active: Active): Ctx {
  const scope = active.independentExtrude?.joinScope();
  const receipt = active.extrudeJoinReceipt;
  return scope && receipt?.scope === scope ? { ...active.ctx, extrudeJoin: receipt.evidence } : active.ctx;
}

export function currentIndependentExtrudePreview(active: Active) {
  const preview = active.independentExtrudePreview;
  if (!preview || preview.values !== active.values || !active.independentExtrude?.ownsModel()) return undefined;
  if (!selectedExtrudeJoin(active)) return preview;
  const receipt = preview.receipt;
  return receipt && receipt === active.extrudeJoinReceipt && receipt.scope === active.independentExtrude.joinScope() ? preview : undefined;
}
/** Stable numbers for objects (a command's context, its values), for the App's subscription key. */
const objectIds = new WeakMap<object, number>();
let nextObjectId = 0;
const idOf = (o: object) => { let id = objectIds.get(o); if (id === undefined) { id = ++nextObjectId; objectIds.set(o, id); } return id; };
/**
 * What of the running command the App renders for (R1d): its start and end, its command, context and placing — and its
 * values, unless the HUD typed them (`typed`, the values its last keystroke made) or the pointer is placing the shape. The
 * preview's state and error are the HUD's; a typed or placed value's preview renders the App once, with its result.
 */
export const activeKey = (a: Active | null, typed: Values | null) =>
  a ? `${a.cmd.id}|${idOf(a.ctx)}|${a.placing ? 1 : 0}|${a.placing || a.values === typed ? '' : idOf(a.values)}` : '';

