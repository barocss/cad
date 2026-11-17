import type { PartInstance } from '@barocss/cad-model/engine/doc';
import { instanceEvaluationCurrent, type InstanceEvaluationSource } from '../viewport/instanceEvaluation';

type EvaluatedInstance = { inst: PartInstance; sourceKey: string; bodies: readonly { topology?: { kind: string } }[] };
/** Admission only: never prune, recover, or replace the existing isolation snapshot. */
export function addToIsolation(current: readonly string[] | undefined, target: string,
  instances: readonly PartInstance[], evaluated: ReadonlyMap<string, EvaluatedInstance>,
  sources: ReadonlyMap<string, InstanceEvaluationSource>, blocked: string | null): { ids: readonly string[] } | { reason: string } {
  if (blocked) return { reason: blocked };
  if (!current?.length) return { reason: 'Isolate a placed part first.' };
  const valid = (id: string) => {
    const matches = instances.filter(inst => inst.id === id);
    const inst = matches[0], have = evaluated.get(id);
    return !!id && !id.includes('/') && matches.length === 1 && !inst.hidden && !!have?.bodies.length
      && have.bodies.every(body => body.topology?.kind === 'solid')
      && instanceEvaluationCurrent(have, inst, sources.get(id));
  };
  if (new Set(current).size !== current.length || !current.every(valid))
    return { reason: 'The isolated parts are not all current and visible. Restore the view and isolate again.' };
  if (!valid(target)) return { reason: 'This part must be visible and have a current evaluated solid result.' };
  return { ids: current.includes(target) ? current : [...current, target] };
}
