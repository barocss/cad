import { useEffect, useState } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { EngineClient } from '../engine/client';
import type { ProposalCalloutReply } from '../engine/proposalDrawingCallouts';

const hasCallouts = (doc: StudioDoc) => doc.drawing?.dimensions?.some(d => d.kind === 'diameter' || d.kind === 'radius');

/** A reply belongs to the exact working and displayed candidate snapshots. */
export function useProposalDrawingCallouts(engine: EngineClient, session: number, working: StudioDoc | undefined, candidate: StudioDoc | undefined) {
  const [result, setResult] = useState<{ engine: EngineClient; session: number; working: StudioDoc; candidate: StudioDoc; reply: ProposalCalloutReply }>();
  useEffect(() => {
    if (!working || !candidate || (!hasCallouts(working) && !hasCallouts(candidate))) return;
    let live = true;
    void engine.proposalDrawingCallouts(working, candidate).then(reply => {
      if (live) setResult({ engine, session, working, candidate, reply });
    });
    return () => { live = false; };
  }, [engine, session, working, candidate]);
  return result?.engine === engine && result.session === session && result.working === working && result.candidate === candidate ? result.reply : undefined;
}
