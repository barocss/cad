import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import type { Problem } from '@barocss/cad-model/engine/references';
import { pickHeldDraftFace, planHeldDraftReplacement, readyHeldDraftReplacement } from './heldDraftFaceReplacement';

export type HeldDraftFaceOwner = Parameters<typeof pickHeldDraftFace>[0];
type Hit = Parameters<typeof pickHeldDraftFace>[1];

export type HeldDraftFaceView =
  | { kind: 'picking'; error?: string }
  | { kind: 'pending'; name: string }
  | { kind: 'ready'; name: string; bodies: BodyResult[] };
export type HeldDraftFaceEditor = {
  view: HeldDraftFaceView | null;
  start(): void; cancel(): void; repick(): void; apply(): boolean;
};

/** A competing preview can take over without changing the accepted doc, worker or renderer. */
export function heldDraftFacePreviewClear({proposal,proposalBusy,comparison,comparisonOverlay,candidateShown}: {
  proposal?: unknown; proposalBusy?: boolean; comparison?: unknown; comparisonOverlay?: unknown; candidateShown?: boolean;
}): boolean {
  return !proposal && !proposalBusy && !comparison && !comparisonOverlay && !candidateShown;
}

export type HeldDraftFaceWork = { scope: object; generation: object };
export function heldDraftFaceWorkCurrent(expected: HeldDraftFaceWork, live: HeldDraftFaceWork): boolean {
  return expected.scope===live.scope && expected.generation===live.generation;
}

export function heldDraftFaceAvailable(owner: HeldDraftFaceOwner): boolean {
  if (!owner.isCurrent() || owner.index!==3 || owner.doc.nodes[3]?.kind!=='draft' || !owner.doc.nodes[3].held) return false;
  // Only admission, not a selected face: no plan is retained and no preview is issued.
  return owner.bodies.some((body, bi) => body.mesh.faces.some((f, fi) =>
    f.name.endsWith('.cut.side3') && !!pickHeldDraftFace(owner, { face: {body:bi,face:fi},faceMesh:body.mesh })));
}

export function createHeldDraftFaceSession(owner: HeldDraftFaceOwner, io: {
  revision(): number;
  evaluate(doc: StudioDoc, revision: number): Promise<EvalResult>;
  accept(doc: StudioDoc, problem: Problem): boolean;
  publish(view: HeldDraftFaceView | null): void;
}) {
  let view: HeldDraftFaceView | null = null;
  let ticket: object | null = null;
  let ready: { doc: StudioDoc; problem: Problem } | null = null;
  const show = (next: HeldDraftFaceView | null) => { view=next; io.publish(next); };
  const cancel = () => { ticket=null; ready=null; if (view) show(null); };
  const owns = (request: object) => ticket === request && owner.isCurrent();
  const start = () => { if (!view && heldDraftFaceAvailable(owner)) show({kind:'picking'}); };
  const repick = () => { if (view && owner.isCurrent()) {ticket=null; ready=null; show({kind:'picking'});} };
  async function pick(hit: Hit) {
    if (!view || view.kind==='ready' || !owner.isCurrent()) return;
    ticket=null; ready=null;
    const selection = pickHeldDraftFace(owner,hit);
    if (!selection) { show({kind:'picking',error:'Select the current cut face on the held Draft body, not the other Split half.'}); return; }
    const request={}; ticket=request;
    show({kind:'pending',name:selection.name});
    const refuse=()=>{ if(owns(request)) { ticket=null; show({kind:'picking',error:'The replacement preview could not be checked. The Draft is unchanged.'}); } };
    try {
      const prefixRevision=io.revision();
      const prefix=await io.evaluate(selection.prefix,prefixRevision);
      if (!owns(request)) return;
      const plan=planHeldDraftReplacement(selection,prefix,prefixRevision);
      if (!plan) {refuse();return;}
      const previewRevision=io.revision();
      if (previewRevision===prefixRevision) {refuse();return;}
      const result=await io.evaluate(plan.next,previewRevision);
      if (!owns(request)) return;
      const next=readyHeldDraftReplacement(plan,result,previewRevision);
      if (!next || !result.ok) {refuse();return;}
      ready={doc:next,problem:selection.problem};
      show({kind:'ready',name:selection.name,bodies:[...result.bodies]});
    } catch { refuse(); }
  }
  function apply() {
    if (view?.kind!=='ready' || !ready || !ticket || !owner.isCurrent()) return false;
    const accepted=ready;
    ticket=null; ready=null;
    // Consume before calling the outer transaction, so repeated/recursive Apply is a no-op.
    const ok=io.accept(accepted.doc,accepted.problem);
    show(null);
    return ok;
  }
  return { start, cancel, repick, pick, apply };
}
