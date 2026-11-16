import { useLayoutEffect, useRef, useState } from 'react';
import type { ContinuityReply, ContinuityRequest } from '@barocss/cad-model/engine/edgeContinuity';
import type { EdgeCurvatureMeasurement } from '@barocss/cad-model/engine/edgeCurvature';

export function useContinuityLocation(owner: object | null, read: (input: ContinuityRequest) => Promise<ContinuityReply>) {
  const [state, set] = useState<{ owner: object; curve?: EdgeCurvatureMeasurement; error?: string } | null>(null);
  const scope = useRef({ owner, ticket: 0 });
  useLayoutEffect(() => {
    scope.current.owner = owner;
    set(previous => previous?.owner === owner ? previous : null);
    return () => { scope.current.owner = null; scope.current.ticket++; };
  }, [owner]);
  const current = state?.owner === owner ? state : null;
  return {
    curve: current?.curve ?? null,
    error: current?.error,
    async choose(edgeId: string) {
      if (!owner || scope.current.owner !== owner) return;
      const ticket = ++scope.current.ticket;
      set(null);
      if (!edgeId) return;
      let reply: ContinuityReply;
      try { reply = await read({ kind: 'curve', edgeId }); }
      catch { reply = { error: 'The native edge location is unavailable.' }; }
      if (scope.current.owner !== owner || scope.current.ticket !== ticket) return;
      set('curve' in reply && reply.curve.edgeId === edgeId
        ? { owner, curve: reply.curve }
        : { owner, error: 'Native edge location unavailable. The measurement list does not move the viewport selection.' });
    },
  };
}
