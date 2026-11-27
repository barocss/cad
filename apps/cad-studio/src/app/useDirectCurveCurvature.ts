import { useLayoutEffect, useMemo, useState } from 'react';
import type { DirectGeometry, measureDirectCurveCurvature } from '@barocss/cad-model/engine/direct';
import { DEFAULT_COMB_DENSITY, type CombDensity, type CurvatureCombControls, type CurvatureOverlay } from './useEdgeCurvature';

export function useDirectCurveCurvature(
  generation: number,
  id: string | null,
  visible: boolean,
  direct: DirectGeometry | undefined,
  measure: typeof measureDirectCurveCurvature | undefined,
): CurvatureCombControls {
  const [state, set] = useState<{ generation: number; id: string; scale: number; density: CombDensity; enabled: boolean } | null>(null);
  const current = state?.id === id && state.generation === generation ? state : null;
  const enabled = current?.enabled === true;
  useLayoutEffect(() => {
    set(previous => previous?.id === id && previous.generation === generation ? previous : null);
  }, [id, generation]);
  const read = useMemo(() => {
    if (!enabled || !id || !direct || !measure || !visible) return null;
    try { return { result: measure(direct, id) }; }
    catch (error) { return { error: error instanceof Error ? error.message : 'The curve curvature is unavailable.' }; }
  }, [id, direct, measure, visible, enabled]);
  const overlay: CurvatureOverlay | null = read?.result && id && current
    ? { target: { kind: 'direct', id }, measurement: read.result, scale: current.scale, density: current.density } : null;
  return {
    overlay,
    error: read?.error,
    show() { if (id && visible) set(previous => ({ generation, id, enabled: true,
      scale: previous?.id === id && previous.generation === generation ? previous.scale : 4,
      density: previous?.id === id && previous.generation === generation ? previous.density : DEFAULT_COMB_DENSITY })); },
    clear() { set(previous => previous?.id === id && previous.generation === generation ? { ...previous, enabled: false } : previous); },
    setScale(scale) {
      if (Number.isFinite(scale) && scale >= 0.01 && scale <= 10000)
        set(previous => previous?.id === id && previous.generation === generation ? { ...previous, scale } : previous);
    },
    setDensity(density) {
      set(previous => previous?.id === id && previous.generation === generation ? { ...previous, density } : previous);
    },
  };
}
