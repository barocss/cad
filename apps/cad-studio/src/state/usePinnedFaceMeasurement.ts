import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MeasurePick } from '@barocss/cad-model/app/measure';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { capturePinnedFacePair, readPinnedFacePair, type PinnedFacePair } from '../app/pinnedFaceMeasure';
import type { ProjectStore } from '../storage/store';

interface SavedFaceMeasurement {
  pair: PinnedFacePair;
  generation: number;
  worker: number;
  project: ProjectStore | null;
}

export function usePinnedFaceSession(generation: number, worker: number, project: ProjectStore | null) {
  const [saved, setSaved] = useState<SavedFaceMeasurement | null>(null);
  const owned = saved?.generation === generation && saved.worker === worker && saved.project === project ? saved : null;
  const clear = useCallback(() => setSaved(null), []);
  useEffect(() => {
    if (saved && !owned) clear();
  }, [saved, owned, clear]);

  return {
    pair: owned?.pair ?? null,
    capture: (pair: PinnedFacePair) => setSaved({ pair, generation, worker, project }),
    clear,
  };
}

interface PinnedFaceReadout {
  session: ReturnType<typeof usePinnedFaceSession>;
  doc: StudioDoc;
  bodies: readonly BodyResult[];
  ready: boolean;
  picks: readonly MeasurePick[] | undefined;
  targetCount: number | undefined;
  isCurrent: () => boolean;
  stopMeasuring: () => void;
}

export function usePinnedFaceReadout({ session, doc, bodies, ready, picks, targetCount, isCurrent, stopMeasuring }: PinnedFaceReadout) {
  const { pair, capture } = session;
  const offer = ready && picks && picks.length === targetCount ? capturePinnedFacePair(doc, bodies, picks) : null;
  const result = useMemo(() => ready && pair ? readPinnedFacePair(doc, bodies, pair) : null, [ready, pair, doc, bodies]);
  const pin = offer ? () => {
    if (!isCurrent()) return;
    capture(offer);
    stopMeasuring();
  } : undefined;
  return { result, pin };
}
