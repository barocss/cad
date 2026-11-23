import { drawingCalloutsOf } from '@barocss/cad-model/chat/drawing';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';

type DrawingCallout = Exclude<ReturnType<typeof drawingCalloutsOf>, { error: string }>[number];
export interface ProposalCalloutChange {
  key: string;
  before?: DrawingCallout;
  after?: DrawingCallout;
  fitChanged?: true;
}
export type ProposalCalloutReply = { changes: ProposalCalloutChange[] } | { error: string };

const calloutKey = ({ id, view, kind }: DrawingCallout) => JSON.stringify([id, view, kind]);

/** Compare the actual text marks, including loss or a move to another sheet. */
export function proposalDrawingCallouts(working: StudioDoc, candidate: StudioDoc): ProposalCalloutReply {
  const before = drawingCalloutsOf(working);
  if ('error' in before) return before;
  const after = drawingCalloutsOf(candidate);
  if ('error' in after) return after;
  const remaining = new Map(after.map(callout => [calloutKey(callout), callout]));
  if (remaining.size !== after.length || new Set(before.map(calloutKey)).size !== before.length)
    return { error: 'Callout references are ambiguous.' };
  const changes: ProposalCalloutChange[] = [];
  for (const callout of before) {
    const key = calloutKey(callout), next = remaining.get(key);
    remaining.delete(key);
    const fitChanged = callout.fit !== next?.fit;
    if (!fitChanged && next?.sheet === callout.sheet && next.sheetName === callout.sheetName &&
      next.lines.length === callout.lines.length && next.lines.every((line, index) => line === callout.lines[index])) continue;
    changes.push({ key, before: callout, ...(next ? { after: next } : {}), ...(fitChanged ? { fitChanged: true } : {}) });
  }
  for (const [key, callout] of remaining) changes.push({ key, after: callout, ...(callout.fit ? { fitChanged: true } : {}) });
  return { changes };
}
