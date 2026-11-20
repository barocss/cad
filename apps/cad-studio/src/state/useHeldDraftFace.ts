import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { EvalResult } from '@barocss/cad-model/engine/evaluate';
import type { Problem } from '@barocss/cad-model/engine/references';
import { createHeldDraftFaceSession, heldDraftFaceAvailable, heldDraftFaceWorkCurrent, type HeldDraftFaceWork, type HeldDraftFaceOwner, type HeldDraftFaceView } from './heldDraftFaceSession';

type Options = Omit<HeldDraftFaceOwner,'isCurrent'|'index'> & {
  index: number | null; enabled: boolean; worker: number; open: object; evaluated: StudioDoc; work: HeldDraftFaceWork;
  ownsSource(): boolean;
  revision(): number;
  evaluate(doc: StudioDoc, revision: number): Promise<EvalResult>;
  accept(doc: StudioDoc, problem: Problem): boolean;
};

export function useHeldDraftFace(options: Options) {
  const { doc,index,problems,bodies,worker,open,evaluated,enabled,work }=options;
  const {scope,generation}=work;
  const [state,setState]=useState<{token:object;view:HeldDraftFaceView}|null>(null);
  const latest=useRef(options);
  // Reads use latest committed mode/gating on every await, plus the App's synchronous live guards.
  useLayoutEffect(()=>{ latest.current=options; });
  const session=useMemo(()=>{
    const token={};
    const owner:HeldDraftFaceOwner={doc,index:index??-1,problems,bodies,isCurrent:()=>{
      const live=latest.current;
      return enabled && live.enabled && live.doc===doc && live.evaluated===evaluated && live.index===index &&
        live.bodies===bodies && live.problems===problems && live.worker===worker && live.open===open &&
        heldDraftFaceWorkCurrent({scope,generation},live.work) && live.ownsSource();
    }};
    const controls=createHeldDraftFaceSession(owner,{
      revision:()=>latest.current.revision(),
      evaluate:(d,r)=>latest.current.evaluate(d,r),
      accept:(d,p)=>latest.current.accept(d,p),
      publish:view=>setState(previous=>view?{token,view}:previous?.token===token?null:previous),
    });
    return {token,owner,controls};
  },[doc,index,problems,bodies,worker,open,evaluated,enabled,scope,generation]);
  useLayoutEffect(()=>()=>{ session.controls.cancel(); },[session]);
  // Render qualification uses current props for availability; action-time repeats the live owner.
  const available=enabled && heldDraftFaceAvailable({ ...session.owner, isCurrent:()=>true });
  const view=available && state?.token===session.token ? state.view : null;
  return { available, view, ...session.controls };
}
