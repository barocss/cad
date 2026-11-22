import { useEffect, useMemo, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { placedDoc, type PartInstance, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { placementOf } from '@barocss/cad-model/engine/placement';
import { withDraftCut, type CutDraft } from './assemblyCutDraft';
import { samePlacement } from './bodyResults';
import type { StudioNotice } from './studioNotice';
import type { EngineClient } from '../engine/client';
import type { Lanes } from '../engine/lanes';
import { instanceEvaluationCurrent, instanceEvaluationSources } from '../viewport/instanceEvaluation';

export type PlacedBodyMap = Map<string, { key: string; sourceKey: string; inst: PartInstance; bodies: BodyResult[] }>;
type PlacedBodyWorker = {
  client: EngineClient; lanes: Lanes; revision: RefObject<number>; session: number; currentSession: RefObject<number>;
};

/** Evaluate placed parts and keep Assembly Cut previews separate from the accepted body cache. */
export function usePlacedBodyEvaluation({
  model, worker, accepted, draft, rendering, onNotice,
}: {
  model: { doc: StudioDoc; shown: StudioDoc; current: RefObject<StudioDoc>; currentShown: RefObject<StudioDoc> };
  worker: PlacedBodyWorker;
  accepted: { bodies: PlacedBodyMap; update: Dispatch<SetStateAction<PlacedBodyMap>> };
  draft: CutDraft | null;
  rendering: boolean;
  onNotice(notice: StudioNotice): void;
}) {
  const { doc, shown, current, currentShown } = model;
  const { client, lanes, revision, session, currentSession } = worker;
  const { bodies, update } = accepted;
  const run = useRef(0);
  const instanceSources = useMemo(() => instanceEvaluationSources(shown), [shown]);

  useEffect(() => {
    const asked = (shown.instances ?? []).map(inst => `placed:${inst.id}`);
    const generation = currentSession.current;
    const reportFailure = (error: FriendlyError) => {
      if (current.current !== doc || currentShown.current !== shown || currentSession.current !== generation) return;
      onNotice({ ...error, documentSource: { doc, placed: { view: shown, workerSession: generation } } });
    };
    void (async () => {
      const next: PlacedBodyMap = new Map();
      for (const inst of shown.instances ?? []) {
        if (generation !== currentSession.current) return;
        const source = instanceSources.get(inst.id);
        if (!source?.ok) {
          reportFailure({ title: 'The placed part could not be evaluated', hint: source && !source.ok ? source.error : 'Missing part context.', detail: '' });
          continue;
        }
        const have = bodies.get(inst.id);
        if (have && have.sourceKey === source.key && samePlacement(have.inst, inst)) {
          next.set(inst.id, have.inst === inst ? have : { ...have, inst });
          continue;
        }
        const at = revision.current++;
        const reply = await lanes.run(`placed:${inst.id}`, { revision: at, source: source.key },
          () => client.placed(placedDoc(inst, shown), source.base, placementOf(inst), at));
        if (reply.stale || generation !== currentSession.current) return;
        const result = reply.result;
        if (result.ok) next.set(inst.id, { key: `${inst.id}#${++run.current}`, sourceKey: source.key, inst, bodies: result.bodies });
        else reportFailure(result.error);
      }
      if (generation === currentSession.current) update(next);
    })();
    return () => { for (const lane of asked) lanes.cancel(lane); };
    // The body cache contains replies for these inputs. A reply must not restart an evaluation.
  }, [doc, shown, instanceSources, session]);

  const cutPreviewDoc = useMemo(() => withDraftCut(shown, draft), [shown, draft]);
  const cutPreview = useCutPreview(cutPreviewDoc, shown, instanceSources, worker, run);
  const sceneInstanceBodies = useMemo(() => !rendering && cutPreviewDoc !== shown && cutPreview.size
    ? new Map([...bodies, ...cutPreview]) : bodies, [rendering, bodies, cutPreview, cutPreviewDoc, shown]);
  const renderGeometryReady = (shown.instances ?? []).every(inst => inst.hidden
    || instanceEvaluationCurrent(bodies.get(inst.id), inst, instanceSources.get(inst.id)));
  return { instanceSources, sceneInstanceBodies, renderGeometryReady };
}

function useCutPreview(preview: StudioDoc, shown: StudioDoc, instanceSources: ReturnType<typeof instanceEvaluationSources>,
  { client, lanes, revision, session, currentSession }: PlacedBodyWorker,
  run: RefObject<number>) {
  const [bodies, update] = useState<PlacedBodyMap>(new Map());
  useEffect(() => {
    if (preview === shown) { update(was => was.size ? new Map() : was); return; }
    const sources = instanceEvaluationSources(preview);
    const generation = currentSession.current;
    const changed = (shown.instances ?? []).filter(inst => {
      const candidate = sources.get(inst.id), original = instanceSources.get(inst.id);
      return candidate?.ok && (!original?.ok || candidate.key !== original.key);
    });
    const asked = changed.map(inst => `placed-preview:${inst.id}`);
    void (async () => {
      const next: PlacedBodyMap = new Map();
      for (const inst of changed) {
        const source = sources.get(inst.id);
        if (!source?.ok) continue;
        const at = revision.current++;
        const reply = await lanes.run(`placed-preview:${inst.id}`, { revision: at, source: source.key },
          () => client.placed(placedDoc(inst, preview), source.base, placementOf(inst), at));
        if (reply.stale || generation !== currentSession.current) return;
        if (reply.result.ok) next.set(inst.id, { key: `${inst.id}#p${++run.current}`, sourceKey: source.key, inst, bodies: reply.result.bodies });
      }
      update(next);
    })();
    return () => { for (const lane of asked) lanes.cancel(lane); };
  }, [preview, shown, instanceSources, session]);
  return bodies;
}
