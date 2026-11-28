import { useCallback, type RefObject } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { EngineClient } from '../engine/client';
import { useAlignHistoryPreview } from './useAlignHistoryPreview';
import { useOppositeFlangeRadiusPreview } from './useOppositeFlangeRadiusPreview';

type HistoryPreviewOwner = { doc: StudioDoc; evaluated: StudioDoc; workerSession: number; open: object };

type HistoryPreviewsInput = {
  model: { doc: StudioDoc; evaluated: StudioDoc; index: number | null; workerSession: number };
  worker: { engine: Pick<EngineClient, 'part' | 'preview'>; revision: RefObject<number> };
  live: {
    doc: RefObject<StudioDoc>; evaluated: RefObject<StudioDoc>; workerSession: RefObject<number>;
    open: RefObject<object>; marker: RefObject<number | null>; variant: RefObject<string | null>;
  };
  enabled: boolean;
  heldBodies: BodyResult[] | null;
};

export function useStudioHistoryPreviews({ model, worker: { engine, revision }, live, enabled, heldBodies }: HistoryPreviewsInput) {
  const { doc, evaluated, index, workerSession } = model;
  const { doc: currentDoc, evaluated: currentEvaluated, workerSession: currentWorker, open, marker, variant } = live;
  const nextRevision = useCallback(() => revision.current++, [revision]);
  const evaluateAlign = useCallback((candidate: StudioDoc) => engine.preview(candidate, nextRevision()), [engine, nextRevision]);
  const readFlangeRefs = useCallback((source: StudioDoc, rev: number) => engine.part(source, rev, 'refs'), [engine]);
  const checkFlange = useCallback((source: StudioDoc, rev: number) => engine.part(source, rev, 'check'), [engine]);
  const ownsFlangePreview = useCallback((owner: HistoryPreviewOwner) =>
    currentDoc.current === owner.doc && currentEvaluated.current === owner.evaluated && currentWorker.current === owner.workerSession
    && open.current === owner.open && marker.current === null && !variant.current,
  [currentDoc, currentEvaluated, currentWorker, open, marker, variant]);

  const historyAlign = useAlignHistoryPreview({ doc, index, workerSession, enabled }, evaluateAlign);
  const oppositeRadiusPreview = useOppositeFlangeRadiusPreview({ doc, evaluated, index, workerSession, open: open.current, enabled },
    nextRevision, readFlangeRefs, checkFlange, ownsFlangePreview);
  const alignPreviewBodies = historyAlign.result?.kind === 'ready' ? historyAlign.result.bodies : null;
  const flangeBodies = oppositeRadiusPreview.result?.result.kind === 'ready' ? oppositeRadiusPreview.result.result.bodies : null;

  return { historyAlign, oppositeRadiusPreview, alignPreviewBodies,
    historyPreviewBodies: heldBodies ?? alignPreviewBodies ?? flangeBodies };
}
