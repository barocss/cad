import { placedBase, type PartInstance, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluationKey } from '@barocss/cad-model/engine/evalMemo';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import type { Op } from '@barocss/cad-model/engine/schema/proposals';
import { canonical } from '@barocss/cad-model/util/revision';
import type { Vec3 } from '@barocss/cad-model/engine/mesh';
import type { InstanceRenderLooks } from './instanceLook';

export const WORKER_CANDIDATE_TINT: Vec3 = [0.42, 0.58, 0.85];

export type InstanceEvaluationSource = { ok: true; key: string; base: StudioDoc } | { ok: false; error: string };
/** Use the Model's parent-row view and evaluation key; keep authored instance identity separate. */
export function instanceEvaluationSources(doc: StudioDoc): Map<string, InstanceEvaluationSource> {
  return new Map<string, InstanceEvaluationSource>((doc.instances ?? []).map((inst): [string, InstanceEvaluationSource] => {
    try {
      const base = placedBase(inst, doc);
      return [inst.id, { ok: true, base, key: evaluationKey(base) }];
    } catch (error) {
      return [inst.id, { ok: false, error: error instanceof Error ? error.message : String(error) }];
    }
  }));
}
/** Both the authored instance and its effective parent-row context must match the displayed evaluation. */
export function instanceEvaluationCurrent(have: { inst: PartInstance; sourceKey: string } | undefined, inst: PartInstance, source: InstanceEvaluationSource | undefined): boolean {
  return !!have && have.inst === inst && !!source?.ok && have.sourceKey === source.key;
}

type DistanceMateChange = { occurrence: string; before: number; after: number };

export type PlacedProposalPreview =
  | { kind: 'ready'; bodies: ReadonlyMap<string, BodyResult[]>; volumeChange: number | null; distanceMate?: DistanceMateChange }
  | { kind: 'unavailable'; reason: string };
type PlacedBodies = { inst: PartInstance; sourceKey: string; bodies: BodyResult[] };
type EvaluatePlaced = (inst: PartInstance, base: StudioDoc, parent: StudioDoc) => Promise<EvalResult>;

function measuredVolume(bodies: readonly BodyResult[]): number | null {
  let volume = 0;
  for (const body of bodies) {
    if (typeof body.volume !== 'number' || !Number.isFinite(body.volume)) return null;
    volume += body.volume;
  }
  return volume;
}

/** A single distance edit can move its existing top-level occurrence without changing the mate references. */
function distanceMateChange(before: StudioDoc, after: StudioDoc, ops: readonly Op[]): DistanceMateChange | undefined {
  const [op] = ops;
  if (ops.length !== 1 || op.tool !== 'edit_mate' || !op.args) return;
  const { id, distance } = op.args;
  if (Object.keys(op.args).length !== 2 || typeof id !== 'string' || typeof distance !== 'number' || !Number.isFinite(distance)) return;
  const previous = before.mates?.find(mate => mate.id === id);
  if (previous?.kind !== 'distance' || typeof previous.distance !== 'number' ||
    !Number.isFinite(previous.distance) || previous.distance === distance) return;
  if (canonical(before.mates?.map(mate => mate === previous ? { ...mate, distance } : mate)) !== canonical(after.mates)) return;
  const moving = before.instances?.find(instance => instance.id === previous.b.part);
  if (!moving || moving.hidden || (previous.a.part !== 'base' && !before.instances?.some(instance => instance.id === previous.a.part))) return;
  return { occurrence: moving.id, before: previous.distance, after: distance };
}

/** Review changed placed geometry or one solved distance-mate translation in the viewport. */
export async function placedProposalPreview(before: StudioDoc, after: StudioDoc, accepted: ReadonlyMap<string, PlacedBodies>, evaluate: EvaluatePlaced,
  ops: readonly Op[] = []): Promise<PlacedProposalPreview | null> {
  const oldInstances = before.instances ?? [], newInstances = after.instances ?? [];
  if (!oldInstances.length && !newInstances.length) return null;
  const oldById = new Map(oldInstances.map(i => [i.id, i]));
  const unavailable = (reason: string): PlacedProposalPreview => ({ kind: 'unavailable', reason });
  if (oldInstances.length !== newInstances.length || oldById.size !== oldInstances.length || new Set(newInstances.map(i => i.id)).size !== newInstances.length)
    return unavailable('Placement changes are outside this preview.');
  const distanceMate = distanceMateChange(before, after, ops);
  const oldSources = instanceEvaluationSources(before), newSources = instanceEvaluationSources(after);
  const replacements = new Map<string, BodyResult[]>();
  let volumeChange: number | null = 0;
  for (const next of newInstances) {
    const prev = oldById.get(next.id);
    if (!prev || !!prev.hidden !== !!next.hidden || prev.rotation.some((v, i) => v !== next.rotation[i]))
      return unavailable('Placement changes are outside this preview.');
    const translated = prev.position.some((v, i) => v !== next.position[i]);
    if (translated && distanceMate?.occurrence !== next.id) return unavailable('Placement changes are outside this preview.');
    const a = oldSources.get(next.id), b = newSources.get(next.id);
    if (!a?.ok || !b?.ok) return unavailable(`Could not prepare placed part ${next.name}.`);
    if (distanceMate && a.key !== b.key) return unavailable('Geometry and placement changes cannot be previewed together.');
    if (!translated && a.key === b.key) continue;
    if (next.hidden) return unavailable('A changed placed part is hidden.');
    const old = accepted.get(next.id);
    const previous = old?.inst === prev && old.sourceKey === a.key ? { ok: true as const, bodies: old.bodies } : await evaluate(prev, a.base, before);
    const candidate = await evaluate(next, b.base, after);
    if (!previous.ok || !candidate.ok) return unavailable(`Could not evaluate placed part ${next.name}.`);
    replacements.set(next.id, candidate.bodies);
    const oldVolume = measuredVolume(previous.bodies), newVolume = measuredVolume(candidate.bodies);
    volumeChange = volumeChange === null || oldVolume === null || newVolume === null ? null : volumeChange + newVolume - oldVolume;
  }
  return replacements.size ? { kind: 'ready', bodies: replacements, volumeChange, ...(distanceMate ? { distanceMate } : {}) } : null;
}

export function withPlacedProposalBodies<T extends { id: string; bodies: BodyResult[]; looks?: InstanceRenderLooks }>(
  instances: T[], preview: ReadonlyMap<string, BodyResult[]> | undefined, tint?: Vec3): T[] {
  if (!preview) return instances;
  return instances.map(inst => {
    const bodies = preview.get(inst.id);
    if (!bodies) return inst;
    return tint ? { ...inst, bodies, looks: new Map(bodies.map(body => [body.key, { color: tint }])) } : { ...inst, bodies };
  });
}
