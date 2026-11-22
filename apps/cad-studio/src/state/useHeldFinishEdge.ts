import { heldFinishProblem, heldFinishCandidate, heldFinishReplacement, type ReplacementEndpoints } from './heldFinishReplacement';
import { useLayoutEffect, useRef, useState } from 'react';
import type { DisplayEdge } from '@barocss/cad-model/engine/mesh';
import type { ModelNode, StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { signaturesOf } from '@barocss/cad-model/engine/rematch';
import { toSig, type Problem } from '@barocss/cad-model/engine/references';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';

type Finish = Extract<ModelNode, { kind: 'fillet' | 'chamfer' }>;
type Hit = { edge: { body: number; edge: number } | null; edgeMesh?: BodyResult['mesh']; instance?: string };
interface Options {
  doc: StudioDoc;
  index: number | null;
  problems: readonly Problem[];
  bodies: readonly BodyResult[];
  enabled: boolean;
  ownsSource(): boolean;
  evaluate(doc: StudioDoc): Promise<EvalResult>;
  accept(doc: StudioDoc, problem: Problem): boolean;
  notice(value: FriendlyError): void;
}

export function useHeldFinishEdge({ doc, index, problems, bodies, enabled, ownsSource, evaluate, accept, notice }: Options) {
  const node = index === null ? undefined : doc.nodes[index];
  const finish: Finish | null = node?.held && (node.kind === 'fillet' || node.kind === 'chamfer') ? node : null;
  // A terminal held feature exposes its source as a passthrough body.
  const sources = finish && index !== null ? bodies.filter(b => b.key === bodyKeyFor(doc.nodes, index, 'solid')) : [];
  const strictSource = finish && (finish.edges.length > 1 || (finish.kind === 'fillet' && finish.radii));
  const body = strictSource && sources.length !== 1 ? undefined : sources[0];
  const problem = enabled && body && index !== null ? heldFinishProblem(doc, index, problems, body) : undefined;
  const heldName = finish?.edges.length === 2 ? problem?.name : undefined;
  const [draft, setDraft] = useState<{ doc: StudioDoc; index: number; name: string | null; endpoints?: ReplacementEndpoints; edge?: DisplayEdge; pending?: boolean } | null>(null);
  const ticket = useRef<object | null>(null);
  useLayoutEffect(() => {
    ticket.current = null;
    setDraft(null);
    return () => { ticket.current = null; };
  }, [doc, index, body, problem, enabled]);
  const current = enabled && draft?.doc === doc && draft.index === index && problem && body ? draft : null;
  const cancel = () => { ticket.current = null; setDraft(null); };
  const start = () => { if (enabled && problem && body && index !== null) setDraft({ doc, index, name: null }); };
  const pick = (hit: Hit) => {
    if (!current || !body) return false;
    if (current.pending) return true;
    const edge = hit.edgeMesh === body.mesh && hit.edge && !hit.instance ? body.mesh.edges[hit.edge.edge] : undefined;
    const candidate = finish && heldFinishCandidate(finish,edge,body.mesh.edges,doc.parameters,heldName);
    if(candidate && !('error' in candidate)) setDraft({...current,...candidate,edge});
    else {
      setDraft({...current,name:null,endpoints:undefined,edge:undefined});
      notice({title:'Edge not selected',hint:candidate && 'error' in candidate ? candidate.error : 'Select one edge on the body of this feature.',detail:''});
    }
    return true;
  };
  const apply = async () => {
    if (!current?.name || current.pending || !body || !finish || !problem || !ownsSource()) return;
    const { name } = current;
    const signature = signaturesOf(body).edges.get(name);
    if (!signature || signature.shared) return;
    const candidates = body.mesh.edges.filter(edge => edge.names.length === 1 && edge.names[0] === name);
    const varying=finish.kind==='fillet'&&!!finish.radii;
    if(!candidates.length || (varying && (candidates.length!==1 || current.edge!==candidates[0] || !current.endpoints
      || !current.endpoints.start.every((value,i)=>value===candidates[0].a[i]) || !current.endpoints.end.every((value,i)=>value===candidates[0].b[i]))))return;
    if (heldName !== undefined && (candidates.length !== 1 || current.edge !== candidates[0])) return;
    const next = heldFinishReplacement(doc,current.index,candidates[0],body.mesh.edges,toSig(signature),heldName);
    if(!next)return;
    const request = {};
    ticket.current = request;
    setDraft({ ...current, pending: true });
    try {
      const result = await evaluate(next);
      if (ticket.current !== request || !ownsSource()) return;
      if (result.ok) { if (accept(next, problem)) cancel(); }
      else notice({ ...result.error, title: 'Edge replacement not applied' });
    } catch (error) {
      if (ticket.current === request && ownsSource()) notice({ title: 'Edge replacement not applied', hint: 'The feature is unchanged.', detail: String(error) });
    } finally {
      if (ticket.current === request) {
        ticket.current = null;
        setDraft(previous => previous?.doc === doc && previous.index === current.index ? { ...previous, pending: false } : previous);
      }
    }
  };
  const previewEdge = heldName && current?.edge && body ? { mesh: body.mesh, edge: current.edge } : undefined;
  return { available: enabled && !!problem && !!body, current, start, cancel, pick, apply, previewEdge };
}
