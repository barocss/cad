import { useLayoutEffect, useRef, useState } from 'react';
import type { ContinuityReply, ContinuityRequest } from '@barocss/cad-model/engine/edgeContinuity';
import type { CurveCurvatureMeasurement, EdgeCurvatureMeasurement } from '@barocss/cad-model/engine/edgeCurvature';

export interface CurvatureOverlay {
  target: { kind: 'edge' | 'direct'; id: string };
  measurement: CurveCurvatureMeasurement;
  scale: number;
}

export interface CurvatureCombControls {
  overlay: CurvatureOverlay | null;
  error?: string;
  pending?: boolean;
  show(): void;
  clear(): void;
  setScale(scale: number): void;
}

type Read = (request: ContinuityRequest) => Promise<ContinuityReply>;

export function useEdgeCurvature(owner: object | null, picked: Extract<ContinuityRequest, { kind: 'curve' }>['picked'], read: Read) {
  const [state, set] = useState<{ owner: object; result?: EdgeCurvatureMeasurement; error?: string; scale: number } | null>(null);
  const scope = useRef<{ owner: object | null; ticket: number }>({ owner, ticket: 0 });
  useLayoutEffect(() => {
    scope.current.owner = owner;
    set(previous => previous?.owner === owner ? previous : null);
    return () => { scope.current.owner = null; scope.current.ticket++; };
  }, [owner]);
  const current = state?.owner === owner ? state : null;
  const overlay: CurvatureOverlay | null = current?.result
    ? { target: { kind: 'edge', id: current.result.edgeId }, measurement: current.result, scale: current.scale } : null;
  return {
    overlay,
    error: current?.error,
    pending: current !== null && !current.result && !current.error,
    setScale(scale: number) {
      if (Number.isFinite(scale) && scale >= 0.01 && scale <= 10000)
        set(previous => previous?.owner === owner ? { ...previous, scale } : previous);
    },
    clear() { scope.current.ticket++; set(null); },
    async show() {
      if (!owner || !picked || scope.current.owner !== owner) return;
      const ticket = ++scope.current.ticket;
      set({ owner, scale: 4 });
      let reply: ContinuityReply;
      try { reply = await read({ kind: 'curve', edgeId: picked.edgeId, picked }); }
      catch { reply = { error: 'The native edge curvature is unavailable.' }; }
      if (scope.current.owner !== owner || ticket !== scope.current.ticket) return;
      set('curve' in reply ? { owner, scale: 4, result: reply.curve }
        : { owner, scale: 4, error: 'error' in reply ? reply.error : 'The native edge curvature is unavailable.' });
    },
  };
}
