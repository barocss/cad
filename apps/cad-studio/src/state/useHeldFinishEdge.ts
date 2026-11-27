import { heldFinishGroupProblems, heldFinishPassthroughBody, heldFinishProblem, heldFinishCandidate, heldFinishReplacement,
  replaceHeldFinishGroup, validFinishGroupEdge, type ReplacementEndpoints } from './heldFinishReplacement';
import { heldChamferThroughHole, heldPairedFilletThroughHole, parentChamferEdge, parentPairedFilletEdge } from '@barocss/cad-model/engine/heldChamferThroughHole';
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
type GroupDraft = { slot: number | null; edges: (DisplayEdge | undefined)[]; sourceEdges?: (DisplayEdge | undefined)[]; ownsSource(): boolean };
type Draft = { doc: StudioDoc; index: number; name: string | null; endpoints?: ReplacementEndpoints;
  edge?: DisplayEdge; sourceEdge?: DisplayEdge; parent?: BodyResult; pending?: boolean; group?: GroupDraft };
export type HeldFinishGroupReview = { references: string[]; picks: (string | undefined)[]; slot: number | null };
export interface HeldFinishEdgeEditor {
  start(): void;
  cancel(): void;
  apply(): void;
  draft: Pick<Draft, 'name' | 'endpoints' | 'pending'> | null;
  grouped?: boolean;
  group?: HeldFinishGroupReview;
  selectSlot?(slot: number): void;
}
interface Options {
  doc: StudioDoc;
  index: number | null;
  problems: readonly Problem[];
  bodies: readonly BodyResult[];
  enabled: boolean;
  ownsSource(): boolean;
  evaluate(doc: StudioDoc, marker?: number): Promise<EvalResult>;
  refreshProblems?(doc: StudioDoc, releasedNode: number, remaining: readonly Problem[], bodies: readonly BodyResult[]): Promise<Problem[]>;
  accept(doc: StudioDoc, resolved: readonly Problem[], nextProblems?: readonly Problem[]): boolean;
  notice(value: FriendlyError): void;
  retireNotice(value: FriendlyError): void;
}

export function useHeldFinishEdge({ doc, index, problems, bodies, enabled, ownsSource, evaluate, refreshProblems, accept, notice, retireNotice }: Options) {
  const node = index === null ? undefined : doc.nodes[index];
  const finish: Finish | null = node?.held && (node.kind === 'fillet' || node.kind === 'chamfer') ? node : null;
  // A terminal held feature exposes its source as a passthrough body.
  const sources = finish && index !== null ? bodies.filter(b => b.key === bodyKeyFor(doc.nodes, index, 'solid')) : [];
  const downstreamChamfer = enabled && index !== null && !sources.length ? heldChamferThroughHole(doc, index, bodies) : undefined;
  const downstreamFillet = enabled && index !== null && !sources.length && !downstreamChamfer ? heldPairedFilletThroughHole(doc, index, bodies) : undefined;
  const downstream = downstreamChamfer ?? downstreamFillet;
  const passthrough = enabled && index !== null && !sources.length && !downstream ? heldFinishPassthroughBody(doc, index, bodies) : undefined;
  const strictSource = finish && ((finish.edges.length > 1 && !downstreamFillet) || (finish.kind === 'fillet' && finish.radii));
  const body = strictSource && sources.length !== 1 ? undefined : sources[0] ?? downstream?.body ?? passthrough;
  const problem = enabled && body && index !== null ? heldFinishProblem(doc, index, problems, body, !!downstreamFillet) : undefined;
  const group = enabled && body && index !== null ? heldFinishGroupProblems(doc, index, problems, !!downstreamFillet) : undefined;
  const [firstProblem, secondProblem, thirdProblem] = group ?? [];
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
  }, [doc, index, body, problem, firstProblem, secondProblem, thirdProblem, enabled, clearFailure]);
  const current = enabled && draft?.doc === doc && draft.index === index && body &&
    (draft.group ? group && draft.group.ownsSource() : problem) ? draft : null;
  const cancel = () => { ticket.current = null; setDraft(null); clearFailure(); };
  const start = async () => {
    if (!enabled || !body || index === null || (!problem && !group)) return;
    const opened = { doc, index, name: null, group: group ? { slot: 0, edges: group.map(() => undefined),
      ...(downstreamFillet ? { sourceEdges: group.map(() => undefined) } : {}), ownsSource } : undefined };
    if (!downstream) { setDraft(opened); return; }
    if (!ownsSource()) return;
    const request = {};
    ticket.current = request;
    setDraft({ ...opened, pending: true });
    let parent: BodyResult | undefined;
    try {
      const result = await evaluate(doc, index);
      if (result.ok && result.bodies.length === 1) parent = result.bodies[0];
    } catch { /* A failed prefix read leaves the original document in place. */ }
    if (ticket.current !== request || !ownsSource()) return;
    ticket.current = null;
    if (parent?.ref?.node === downstream.parent.node && parent.ref.side === downstream.parent.side &&
        parent.topology?.kind === 'solid' && parent.topology.bodyCount === 1 &&
        (!downstreamFillet || !!group || heldFinishProblem(doc, index, problems, parent, true)?.name === problem?.name)) {
      setDraft({ ...opened, parent });
    } else {
      setDraft(null);
      reportFailure({ title: 'Edge replacement unavailable',
        hint: downstreamFillet ? 'The original Fillet body could not be read.' : 'The original Chamfer body could not be read.', detail: '' });
    }
  };
  const selectSlot = (slot: number) => {
    if (current?.group && !current.pending && Number.isInteger(slot) && slot >= 0 && slot < current.group.edges.length) {
      setDraft({ ...current, group: { ...current.group, slot } });
    }
  };
  const pick = (hit: Hit) => {
    if (!current || !body) return false;
    if (current.pending) return true;
    const edge = hit.edgeMesh === body.mesh && hit.edge && !hit.instance ? body.mesh.edges[hit.edge.edge] : undefined;
    if (current.group) {
      const { slot, edges } = current.group;
      if (slot === null) return true;
      if (downstreamFillet) {
        const original = current.parent && parentPairedFilletEdge(downstreamFillet, current.parent, edge);
        const sourceEdges = current.group.sourceEdges ?? edges;
        if (!original || sourceEdges.some((picked, i) => i !== slot && picked === original)) {
          reportFailure({ title: 'Edge not selected', hint: 'Select a different original straight edge clear of the Through Hole.', detail: '' });
          return true;
        }
        const picks = edges.map((picked, i) => i === slot ? edge : picked);
        const sourcePicks = sourceEdges.map((picked, i) => i === slot ? original : picked);
        const nextSlot = sourcePicks.indexOf(undefined);
        if (edges[slot] !== edge) clearFailure();
        setDraft({ ...current, group: { ...current.group, edges: picks, sourceEdges: sourcePicks, slot: nextSlot === -1 ? null : nextSlot } });
        return true;
      }
      if (!validFinishGroupEdge(edge, body.mesh.edges) || edges.some((picked, i) => i !== slot && picked === edge)) {
        reportFailure({ title: 'Edge not selected', hint: 'Select a different unmerged straight edge on the body of this feature.', detail: '' });
        return true;
      }
      const picks = edges.map((picked, i) => i === slot ? edge : picked);
      const nextSlot = picks.indexOf(undefined);
      if (edges[slot] !== edge) clearFailure();
      setDraft({ ...current, group: { ...current.group, edges: picks, slot: nextSlot === -1 ? null : nextSlot } });
      return true;
    }
    const source = current.parent ?? body;
    const original = downstreamChamfer ? current.parent && parentChamferEdge(downstreamChamfer, current.parent, edge)
      : downstreamFillet ? current.parent && parentPairedFilletEdge(downstreamFillet, current.parent, edge) : edge;
    const candidate = finish && heldFinishCandidate(finish, original, source.mesh.edges, doc.parameters, heldName);
    if(candidate && !('error' in candidate)) {
      if (current.edge !== edge) clearFailure();
      setDraft({...current,...candidate,edge,sourceEdge:original});
    }
    else {
      setDraft({...current,name:null,endpoints:undefined,edge:undefined,sourceEdge:undefined});
      const hint = candidate && 'error' in candidate && original ? candidate.error
        : downstreamChamfer ? 'Select an original straight top edge clear of the Through Hole.'
        : downstreamFillet ? 'Select a different original straight edge clear of the Through Hole.'
        : candidate && 'error' in candidate ? candidate.error : 'Select one edge on the body of this feature.';
      // The pick belongs to this replacement even when its source is a terminal body.
      reportFailure({ title: 'Edge not selected', hint, detail: '' });
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
    if (heldName !== undefined && (candidates.length !== 1 || (selected.sourceEdge ?? selected.edge) !== candidates[0])) return null;
    return heldFinishReplacement(doc, selected.index, candidates[0], source.mesh.edges, toSig(signature), heldName, !!downstreamFillet);
  };
  const apply = async () => {
    if (!current || current.pending || !body || !finish || !ownsSource()) return;
    const resolved = current.group ? group : problem && [problem];
    if (!resolved) return;
    const stillOwnsSource = current.group?.ownsSource ?? ownsSource;
    if (!stillOwnsSource()) return;
    const next = current.group
      ? replaceHeldFinishGroup(doc, current.index, resolved, current.parent ?? body, current.group.sourceEdges ?? current.group.edges, !!downstreamFillet)
      : replaceSingle(current, current.parent ?? body, finish);
    if (!next) return;
    const request = {};
    ticket.current = request;
    setDraft({ ...current, pending: true });
    try {
      const result = await evaluate(next);
      if (ticket.current !== request || !stillOwnsSource()) return;
      if (result.ok) {
        const remaining = problems.filter(value => !resolved.includes(value));
        const nextProblems = refreshProblems
          ? await refreshProblems(next, current.index, remaining, result.bodies)
          : remaining;
        if (ticket.current !== request || !stillOwnsSource()) return;
        if (accept(next, resolved, nextProblems)) cancel();
      }
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
  const picks: readonly (DisplayEdge | undefined)[] = current?.group?.edges ?? ((heldName || downstream || passthrough) && current?.edge ? [current.edge] : []);
  const highlighted = picks.flatMap(edge => edge ? [edge] : []);
  const previewEdges = body && highlighted.length ? { mesh: body.mesh, edges: highlighted } : undefined;
  const groupReview: HeldFinishGroupReview | undefined = group && current?.group && {
    references: group.map(value => value.name), picks: current.group.edges.map(edge => edge?.names[0]), slot: current.group.slot,
  };
  return { available: enabled && !!(problem || group) && !!body, grouped: !!group, current, start, cancel, pick, apply,
    selectSlot, groupReview, previewEdges };
}
