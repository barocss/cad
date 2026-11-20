import { useEffect, useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { useBottomRow } from './useBottomRow';
import { useFitChips } from './useFitChips';

interface FeatureHistoryLayoutInput {
  nodes: StudioDoc['nodes'];
  marker: number | null;
  sketching: boolean;
  commandActive: boolean;
  rendering: boolean;
  left: number;
  strip: number;
}

/** Keep the history and view bars fitted to the same stage. */
export function useFeatureHistoryLayout({ nodes, marker, sketching, commandActive, rendering, left, strip }: FeatureHistoryLayoutInput) {
  const cornerRight = useRef<HTMLDivElement>(null);
  const historyBar = useRef<HTMLDivElement>(null);
  const [historyRows, setHistoryRows] = useState(false);
  const [historyLabels, setHistoryLabels] = useState(false);
  const [historyNatural, setHistoryNatural] = useState(0);
  const row = useBottomRow(cornerRight, strip, left, historyNatural);
  const markerAt = marker ?? nodes.length;
  const { hidden: historyHidden, natural } = useFitChips(historyBar, historyRows, [
    nodes, markerAt, sketching, commandActive, rendering, historyLabels, row.stacked, row.cramped,
  ]);
  useEffect(() => setHistoryNatural(natural), [natural]);

  const focusStep = (index: number | null) => {
    const step = historyBar.current?.querySelector<HTMLButtonElement>(`[data-node-index="${index}"]`);
    if (step?.getClientRects().length) step.focus({ preventScroll: true });
    else historyBar.current?.querySelector<HTMLButtonElement>('.hs-more')?.focus({ preventScroll: true });
  };

  return {
    row, cornerRight, focusStep,
    visible: !rendering,
    busy: sketching || commandActive,
    bar: { historyBar, historyRows, setHistoryRows, historyLabels, setHistoryLabels, historyHidden },
  };
}
