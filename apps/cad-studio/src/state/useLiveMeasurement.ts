import { useMemo } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import { measureBetween, type MeasureResult } from '@barocss/cad-model/app/measure';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { usesCurvedMeshDistance } from '../app/measureProvenance';
import { readMeasureTarget, sameMeasureOccurrence, type MeasureTarget, type PlacedMeasureSource } from '../app/measureTargets';
import { measureQuantityText } from '../ui/quantityText';
import { instanceEvaluationCurrent, type InstanceEvaluationSource } from '../viewport/instanceEvaluation';
import type { InstanceRenderLooks } from '../viewport/instanceLook';

interface LiveMeasurementInputs {
  doc: StudioDoc;
  bodies: readonly BodyResult[];
  targets: readonly MeasureTarget[] | null;
  current: boolean;
  placed: {
    available: boolean;
    evaluated: ReadonlyMap<string, Pick<PlacedMeasureSource, 'inst' | 'bodies'> & { sourceKey: string }>;
    sources: ReadonlyMap<string, InstanceEvaluationSource>;
    looks: ReadonlyMap<string, InstanceRenderLooks>;
  };
}

/** Resolve measurement picks against the current body and placement before preparing the readout. */
export function useLiveMeasurement({ doc, bodies, targets, current, placed }: LiveMeasurementInputs) {
  const { available, evaluated, sources, looks } = placed;
  const placedSources = useMemo(() => {
    const entries = new Map<string, PlacedMeasureSource>();
    if (!available) return entries;
    for (const inst of doc.instances ?? []) {
      const have = evaluated.get(inst.id);
      if (inst.hidden || !have || !instanceEvaluationCurrent(have, inst, sources.get(inst.id))) continue;
      const hidden = new Set(have.bodies.filter(body => looks.get(inst.id)?.get(body.key)?.hidden).map(body => body.key));
      entries.set(inst.id, { inst, bodies: have.bodies, hidden });
    }
    return entries;
  }, [available, doc, evaluated, sources, looks]);

  const items = useMemo(() => targets?.map(target => {
    if (!current) return null;
    const occurrence = target.occurrence ? placedSources.get(target.occurrence.id) : undefined;
    if (target.occurrence && (!occurrence || !sameMeasureOccurrence(target.occurrence, occurrence.inst) || occurrence.hidden.has(target.body))) return null;
    const source = occurrence ? occurrence.bodies : bodies;
    const pick = readMeasureTarget(target, doc, source);
    return pick ? { pick, mesh: source[pick.body].mesh, instance: target.occurrence?.id } : null;
  }), [targets, current, doc, bodies, placedSources]);

  const picks = items?.flatMap(item => item && !item.instance ? [item.pick] : []);
  const instanceFaces = items?.flatMap(item =>
    item?.instance && item.pick.face !== undefined ? [{ id: item.instance, body: item.pick.body, face: item.pick.face }] : []);
  const selection: Selection | undefined = picks && {
    faces: picks.flatMap(pick => pick.face === undefined ? [] : [{ body: pick.body, face: pick.face }]),
    edges: picks.flatMap(pick => pick.edge === undefined ? [] : [{ body: pick.body, edge: pick.edge }]),
    bodies: [],
  };
  const [from, to] = items ?? [];
  const result = from && to ? measureBetween(from.mesh, from.pick, to.mesh, to.pick) : null;
  const approximateDistance = !!from && !!to && (usesCurvedMeshDistance(from) || usesCurvedMeshDistance(to));
  return { placedSources, items, picks, selection, instanceFaces, result, approximateDistance };
}

export function measurementLineFor(result: MeasureResult | null, approximate: boolean) {
  if (!result || !(result.distance > 1e-9)) return null;
  const value = measureQuantityText(result.distance, 2);
  return { a: result.a, b: result.b, label: (approximate ? '≈' : '') + value + ' mm' };
}
