import { useLayoutEffect, useMemo, useState } from 'react';
import type { DirectGeometry, measureDirectCurveCurvature } from '@barocss/cad-model/engine/direct';
import type { CurvatureCombControls, CurvatureOverlay } from './useEdgeCurvature';

export function useDirectCurveCurvature(
  generation: number,
  id: string | null,
  visible: boolean,
  direct: DirectGeometry | undefined,
  measure: typeof measureDirectCurveCurvature | undefined,
): CurvatureCombControls {
  const [state, set] = useState<{ generation: number; id: string; scale: number } | null>(null);
  const current = state?.id === id && state.generation === generation ? state : null;
  const enabled = current !== null;
  useLayoutEffect(() => {
    set(previous => previous?.id === id && previous.generation === generation ? previous : null);
  }, [id, generation]);
  const read = useMemo(() => {
    if (!enabled || !id || !direct || !measure || !visible) return null;
    try { return { result: measure(direct, id) }; }
    catch (error) { return { error: error instanceof Error ? error.message : 'The curve curvature is unavailable.' }; }
  }, [id, direct, measure, visible, enabled]);
  const overlay: CurvatureOverlay | null = read?.result && id && current
    ? { target: { kind: 'direct', id }, measurement: read.result, scale: current.scale } : null;
  return {
    overlay,
    error: read?.error,
    show() { if (id && visible) set({ generation, id, scale: 4 }); },
    clear() { set(null); },
    setScale(scale) {
      if (current && Number.isFinite(scale) && scale >= 0.01 && scale <= 10000) set({ ...current, scale });
    },
  };
}
