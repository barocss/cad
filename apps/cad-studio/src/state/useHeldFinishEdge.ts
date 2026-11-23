import { heldFinishPairProblems, heldFinishProblem, heldFinishCandidate, heldFinishReplacement,
  replaceHeldFinishPair, validFinishPairEdge, type ReplacementEndpoints } from './heldFinishReplacement';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig, type Problem } from '@barocss/cad-model/engine/references';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';

type Finish = Extract<ModelNode, { kind: 'fillet' | 'chamfer' }>;
type Hit = { edge: { body: number; edge: number } | null; edgeMesh?: BodyResult['mesh']; instance?: string };
type Slot = 0 | 1;
type PairDraft = { slot: Slot | null; edges: [DisplayEdge | undefined, DisplayEdge | undefined]; ownsSource(): boolean };
type Draft = { doc: StudioDoc; index: number; name: string | null; endpoints?: ReplacementEndpoints;
  edge?: DisplayEdge; pending?: boolean; pair?: PairDraft };
export type HeldFinishPairReview = { references: [string, string]; picks: [string | undefined, string | undefined]; slot: Slot | null };
export interface HeldFinishEdgeEditor {
  start(): void;
  cancel(): void;
  apply(): void;
  draft: Pick<Draft, 'name' | 'endpoints' | 'pending'> | null;
  paired?: boolean;
  pair?: HeldFinishPairReview;
  selectSlot?(slot: Slot): void;
}
interface Options {
  doc: StudioDoc;
  index: number | null;
  problems: readonly Problem[];
  bodies: readonly BodyResult[];
  enabled: boolean;
  ownsSource(): boolean;
  evaluate(doc: StudioDoc): Promise<EvalResult>;
  accept(doc: StudioDoc, resolved: readonly Problem[]): boolean;
  notice(value: FriendlyError): void;
  retireNotice(value: FriendlyError): void;
}

export function useHeldFinishEdge({ doc, index, problems, bodies, enabled, ownsSource, evaluate, accept, notice, retireNotice }: Options) {
  const node = index === null ? undefined : doc.nodes[index];
  const finish: Finish | null = node?.held && (node.kind === 'fillet' || node.kind === 'chamfer') ? node : null;
  // A terminal held feature exposes its source as a passthrough body.
  const sources = finish && index !== null ? bodies.filter(b => b.key === bodyKeyFor(doc.nodes, index, 'solid')) : [];
  const strictSource = finish && (finish.edges.length > 1 || (finish.kind === 'fillet' && finish.radii));
  const body = strictSource && sources.length !== 1 ? undefined : sources[0];
  const problem = enabled && body && index !== null ? heldFinishProblem(doc, index, problems, body) : undefined;
  const pair = enabled && body && index !== null ? heldFinishPairProblems(doc, index, problems) : undefined;
  const firstProblem = pair?.[0], secondProblem = pair?.[1];
  const heldName = finish?.edges.length === 2 ? problem?.name : undefined;
  const [draft, setDraft] = useState<Draft | null>(null);
  const ticket = useRef<object | null>(null);
  const failureNotice = useRef<FriendlyError | null>(null);
  const clearFailure = useCallback(() => {
    const owned = failureNotice.current;
    failureNotice.current = null;
    if (owned) retireNotice(owned);
  }, [retireNotice]);
  const reportFailure = (failure: FriendlyError) => {
    failureNotice.current = failure;
    notice(failure);
  };
  useLayoutEffect(() => {
    ticket.current = null;
    setDraft(null);
    clearFailure();
    return () => { ticket.current = null; };
  }, [doc, index, body, problem, firstProblem, secondProblem, enabled, clearFailure]);
  const current = enabled && draft?.doc === doc && draft.index === index && body &&
    (draft.pair ? pair && draft.pair.ownsSource() : problem) ? draft : null;
  const cancel = () => { ticket.current = null; setDraft(null); clearFailure(); };
  const start = () => {
    if (!enabled || !body || index === null || (!problem && !pair)) return;
    setDraft({ doc, index, name: null, pair: pair ? { slot: 0, edges: [undefined, undefined], ownsSource } : undefined });
  };
  const selectSlot = (slot: Slot) => {
    if (current?.pair && !current.pending) setDraft({ ...current, pair: { ...current.pair, slot } });
  };
  const pick = (hit: Hit) => {
    if (!current || !body) return false;
    if (current.pending) return true;
    const edge = hit.edgeMesh === body.mesh && hit.edge && !hit.instance ? body.mesh.edges[hit.edge.edge] : undefined;
    if (current.pair) {
      const { slot, edges } = current.pair;
      if (slot === null) return true;
      if (!validFinishPairEdge(edge, body.mesh.edges) || edges[slot === 0 ? 1 : 0] === edge) {
        reportFailure({ title: 'Edge not selected', hint: 'Select a different unmerged straight edge on the body of this feature.', detail: '' });
        return true;
      }
      const picks: PairDraft['edges'] = slot === 0 ? [edge, edges[1]] : [edges[0], edge];
      if (edges[slot] !== edge) clearFailure();
      setDraft({ ...current, pair: { ...current.pair, edges: picks, slot: !picks[0] ? 0 : !picks[1] ? 1 : null } });
      return true;
    }
    const candidate = finish && heldFinishCandidate(finish,edge,body.mesh.edges,doc.parameters,heldName);
    if(candidate && !('error' in candidate)) {
      if (current.edge !== edge) clearFailure();
      setDraft({...current,...candidate,edge});
    }
    else {
      setDraft({...current,name:null,endpoints:undefined,edge:undefined});
      notice({title:'Edge not selected',hint:candidate && 'error' in candidate ? candidate.error : 'Select one edge on the body of this feature.',detail:''});
    }
    return true;
  };
  const replaceSingle = (selected: Draft, source: BodyResult, feature: Finish) => {
    const { name } = selected;
    if (!name) return null;
    const signature = signaturesOf(source).edges.get(name);
    if (!signature || signature.shared) return null;
    const candidates = source.mesh.edges.filter(edge => edge.names.length === 1 && edge.names[0] === name);
    const varying = feature.kind === 'fillet' && !!feature.radii;
    if (!candidates.length || (varying && (candidates.length !== 1 || selected.edge !== candidates[0] || !selected.endpoints
      || !selected.endpoints.start.every((value, i) => value === candidates[0].a[i])
      || !selected.endpoints.end.every((value, i) => value === candidates[0].b[i])))) return null;
    if (heldName !== undefined && (candidates.length !== 1 || selected.edge !== candidates[0])) return null;
    return heldFinishReplacement(doc, selected.index, candidates[0], source.mesh.edges, toSig(signature), heldName);
  };
  const apply = async () => {
    if (!current || current.pending || !body || !finish || !ownsSource()) return;
    const resolved = current.pair ? pair : problem && [problem];
    if (!resolved) return;
    const stillOwnsSource = current.pair?.ownsSource ?? ownsSource;
    if (!stillOwnsSource()) return;
    const next = current.pair ? replaceHeldFinishPair(doc, current.index, resolved, body, current.pair.edges)
      : replaceSingle(current, body, finish);
    if (!next) return;
    const request = {};
    ticket.current = request;
    setDraft({ ...current, pending: true });
    try {
      const result = await evaluate(next);
      if (ticket.current !== request || !stillOwnsSource()) return;
      if (result.ok) { if (accept(next, resolved)) cancel(); }
      else reportFailure({ ...result.error, title: 'Edge replacement not applied' });
    } catch (error) {
      if (ticket.current === request && stillOwnsSource()) reportFailure({ title: 'Edge replacement not applied', hint: 'The feature is unchanged.', detail: String(error) });
    } finally {
      if (ticket.current === request) {
        ticket.current = null;
        setDraft(previous => previous?.doc === doc && previous.index === current.index ? { ...previous, pending: false } : previous);
      }
    }
  };
  const picks: readonly (DisplayEdge | undefined)[] = current?.pair?.edges ?? (heldName && current?.edge ? [current.edge] : []);
  const highlighted = picks.flatMap(edge => edge ? [edge] : []);
  const previewEdges = body && highlighted.length ? { mesh: body.mesh, edges: highlighted } : undefined;
  const pairReview: HeldFinishPairReview | undefined = pair && current?.pair && {
    references: [pair[0].name, pair[1].name], picks: [current.pair.edges[0]?.names[0], current.pair.edges[1]?.names[0]], slot: current.pair.slot,
  };
  return { available: enabled && !!(problem || pair) && !!body, paired: !!pair, current, start, cancel, pick, apply,
    selectSlot, pairReview, previewEdges };
}
