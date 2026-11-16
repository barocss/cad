import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { InPlaceSession } from '../app/editInPlace';
import type { Active } from '../app/commandState';
import { activeFilletEndpoints, filletEdgeEndpoints, withFilletStations, type FilletEndpoints, type FilletStationDraft } from '../app/filletEndpoints';
import type { EngineClient } from '../engine/client';

interface Options {
  model: { doc: StudioDoc; evaluated: StudioDoc; commandDoc: StudioDoc; editNode: number | null;
    workerSession: number; marker: number | null; variantShown: string | null; fresh: boolean; busy: boolean;
    instanceSel: readonly string[]; inPlace: InPlaceSession | null; active: Active | null };
  owner: { docNow: RefObject<StudioDoc>; evaluatedRef: RefObject<StudioDoc>; workerSessionNow: RefObject<number>;
    markerNow: RefObject<number | null>; shownVariant: RefObject<string | null>; ownsEvaluatedSource(): boolean };
  worker: { engine: Pick<EngineClient, 'part'>; nextRevision(): number };
}
/** Owns only read-only Fillet location evidence and the editor's transient station draft. */
export function useFilletEndpointDisplay({ model, owner, worker }: Options) {
  const { doc, evaluated, commandDoc, editNode, workerSession, marker, variantShown, fresh, busy, instanceSel, inPlace, active } = model;
  const { docNow, evaluatedRef, workerSessionNow, markerNow, shownVariant, ownsEvaluatedSource } = owner;
  const { engine, nextRevision } = worker;
  const [historyFilletEnds, setHistoryFilletEnds] = useState<{doc: StudioDoc; index: number; worker: number; locations: FilletEndpoints} | null>(null);
  useEffect(() => {
    let cancelled = false;
    const index = editNode, node = index === null ? null : doc.nodes[index];
    if(index === null || node?.kind !== 'fillet' || !node.radii || marker !== null || variantShown || !fresh || busy || instanceSel.length || inPlace) return;
    const current = () => !cancelled && docNow.current === doc && workerSessionNow.current === workerSession && markerNow.current === null && !shownVariant.current;
    engine.part(prefixDoc(doc,index), nextRevision(), 'refs').then(result => {
      if(!current())return;
      const parents = result.ok ? result.bodies.filter(body => body.ref?.node === node.parent.node && body.ref.side === node.parent.side) : [];
      const edges = parents.length === 1 ? parents[0].mesh.edges.filter(edge => node.edges.length === 1 && edge.names.includes(node.edges[0])) : [];
      setHistoryFilletEnds({doc,index,worker:workerSession,locations:filletEdgeEndpoints(edges.length === 1 ? edges[0] : undefined,node)});
    }).catch(() => { if(current())setHistoryFilletEnds({doc,index,worker:workerSession,locations:{reason:'The original edge could not be read; endpoint locations are unavailable.'}}); });
    return () => {cancelled = true;};
  }, [doc, editNode, workerSession, engine, marker, variantShown, fresh, busy, instanceSel, inPlace]);
  const [filletStationDraft, setFilletStationDraft] = useState<FilletStationDraft | null>(null);
  const publishFilletStations = useCallback((payload: FilletStationDraft) => {
    setFilletStationDraft(payload);
    return () => setFilletStationDraft(current => current === payload ? null : current);
  }, []);
  const savedHistoryEndpointLocations = editNode !== null && doc.nodes[editNode]?.kind === 'fillet' && doc.nodes[editNode].radii && !active && marker === null && !variantShown && fresh && !busy && !instanceSel.length && !inPlace
    ? historyFilletEnds?.doc === doc && historyFilletEnds.index === editNode && historyFilletEnds.worker === workerSession ? historyFilletEnds.locations : {reason:'Reading original edge endpoint locations…'} : null;
  const historyEndpointLocations = savedHistoryEndpointLocations && filletStationDraft?.nodes === doc.nodes && filletStationDraft.index === editNode && filletStationDraft.original === doc.nodes[editNode]
    ? withFilletStations(savedHistoryEndpointLocations,filletStationDraft.fractions) : savedHistoryEndpointLocations;
  const endpointSource = useRef<{ctx: Active['ctx']; doc: StudioDoc; worker: number} | null>(null);
  const endpointContextCurrent = !!active && active.ctx.doc === commandDoc && evaluatedRef.current === evaluated && ownsEvaluatedSource();
  if (!active) endpointSource.current = null;
  else if (endpointContextCurrent && endpointSource.current?.ctx !== active.ctx) endpointSource.current = {ctx:active.ctx,doc,worker:workerSession};
  const endpointSourceCurrent = endpointContextCurrent && !!active && endpointSource.current?.ctx === active.ctx
    && endpointSource.current.doc === doc && endpointSource.current.worker === workerSession
    && fresh && !busy && marker === null && !variantShown && !instanceSel.length && !inPlace
    && active.ctx.doc.nodes.length === doc.nodes.length && active.ctx.doc.nodes.every((node,i) => node === doc.nodes[i]);
  const filletEndpointLocations = active ? endpointSourceCurrent ? activeFilletEndpoints(active) : null : historyEndpointLocations;
  return { historyEndpointLocations, filletEndpointLocations, publishFilletStations };
}
