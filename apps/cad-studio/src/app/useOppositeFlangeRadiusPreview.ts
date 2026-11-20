import { useCallback, useRef, useState } from 'react';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { checkOppositeFlangeRadiusApply, isOppositeFlangeRadiusMutation } from '../state/oppositeFlangeRadiusHistory';

type Scope = { doc: StudioDoc; evaluated: StudioDoc; index: number | null; enabled: boolean; workerSession: number; open: object };
type Read = (doc: StudioDoc, revision: number) => Promise<EvalResult | null>;
type Result = { kind: 'pending' | 'refused' } | {kind: 'ready'; bodies: BodyResult[]};
export function useOppositeFlangeRadiusPreview(input: Scope, nextRevision: () => number, refs: Read, preview: Read, stillCurrent: (owner: Scope) => boolean) {
  const scope = useRef(input);
  if (scope.current.doc !== input.doc || scope.current.evaluated !== input.evaluated || scope.current.index !== input.index
      || scope.current.enabled !== input.enabled || scope.current.workerSession !== input.workerSession || scope.current.open !== input.open)
    scope.current = input;
  const pending = useRef<object | null>(null);
  const [state, setState] = useState<{ owner: Scope; token: object; nodes: ModelNode[]; result: Result } | null>(null);
  const read = useCallback((nodes: ModelNode[]) => {
    const owner = scope.current, index = owner.index;
    const next = { ...owner.doc, nodes };
    if (!owner.enabled || index === null || !isOppositeFlangeRadiusMutation(owner.doc, next, index)) return;
    const token = {};
    pending.current = token;
    const current = () => pending.current === token && scope.current === owner && stillCurrent(owner);
    const set = (result: Result) => { if (current()) setState({ owner, token, nodes, result }); };
    set({ kind: 'pending' });
    const timer = window.setTimeout(() => {
      let proof: BodyResult[] | null = null;
      void checkOppositeFlangeRadiusApply(owner.doc, next, index, {
        current, nextRevision, refs, evaluate: preview, onProved: bodies => { proof = bodies; },
      }).then(result => {
        if (!current()) return;
        if (result === 'proved' && proof) set({kind:'ready',bodies:proof});
        else if (result === 'refused') set({kind:'refused'});
        else setState(current => current?.token === token ? null : current);
      }, () => set({kind:'refused'}));
    }, 150);
    return () => {
      window.clearTimeout(timer);
      if (pending.current === token) pending.current = null;
      setState(current => current?.token === token ? null : current);
    };
  }, [nextRevision, refs, preview, stillCurrent]);
  const result = state?.owner === scope.current && state.token === pending.current && scope.current.enabled && stillCurrent(scope.current) ? state : null;
  return { read, result, enabled: input.enabled };
}
