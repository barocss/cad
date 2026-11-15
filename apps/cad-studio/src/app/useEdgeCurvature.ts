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
  const [state, set] = useState<{ owner: object; enabled: boolean; result?: EdgeCurvatureMeasurement; error?: string; scale: number } | null>(null);
  const scope = useRef<{ owner: object | null; ticket: number }>({ owner, ticket: 0 });
  useLayoutEffect(() => {
    scope.current.owner = owner;
    set(previous => previous?.owner === owner ? previous : null);
    return () => { scope.current.owner = null; scope.current.ticket++; };
  }, [owner]);
  const current = state?.owner === owner ? state : null;
  const overlay: CurvatureOverlay | null = current?.enabled && current.result
    ? { target: { kind: 'edge', id: current.result.edgeId }, measurement: current.result, scale: current.scale } : null;
  return {
    overlay,
    error: current?.enabled ? current.error : undefined,
    pending: current?.enabled === true && !current.result && !current.error,
    setScale(scale: number) {
      if (Number.isFinite(scale) && scale >= 0.01 && scale <= 10000)
        set(previous => previous?.owner === owner ? { ...previous, scale } : previous);
    },
    clear() {
      if (scope.current.owner !== owner) return;
      scope.current.ticket++;
      set(previous => previous?.owner === owner ? { owner, scale: previous.scale, enabled: false } : previous);
    },
    async show() {
      if (!owner || !picked || scope.current.owner !== owner) return;
      const ticket = ++scope.current.ticket;
      set(previous => ({ owner, enabled: true, scale: previous?.owner === owner ? previous.scale : 4 }));
      let reply: ContinuityReply;
      try { reply = await read({ kind: 'curve', edgeId: picked.edgeId, picked }); }
      catch { reply = { error: 'The native edge curvature is unavailable.' }; }
      if (scope.current.owner !== owner || ticket !== scope.current.ticket) return;
      set(previous => previous?.owner === owner && previous.enabled
        ? ('curve' in reply ? { ...previous, result: reply.curve }
          : { ...previous, error: 'error' in reply ? reply.error : 'The native edge curvature is unavailable.' })
        : previous);
    },
  };
}
