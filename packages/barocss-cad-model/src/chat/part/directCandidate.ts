import type { Proposal } from '../../engine/schema/proposals';
import type { BodyResult } from '../../engine/evaluate';
import type { StudioDoc } from '../../engine/doc';
import { requirementEvidenceRevision } from '../../util/digest';
import { directReviewKind, directReviewRevision } from '../directProposalReview';
import { isDirectGuidedFillOperation } from '../directGuidedFillProposal';
import { proposalIsStale } from '../proposals';
import { fail, type ChatState, type Evaluate, type PartRun, type ToolOutcome } from '../toolKit';
import { previewProposalWith } from './proposals';

export const isDirectPin = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export type DirectCandidatePin = { proposal: string; proposalRevision: string; baseDirectRevision: string };

/** Replays a supported review candidate without advancing the working document. */
export async function pinnedDirectCandidate(state: ChatState, args: Record<string, unknown>, baseDirectRevision: string,
  evaluate: Evaluate, dispatch: PartRun, action: 'RENDER' | 'INSPECT' | 'CHECK' | 'GUIDED_FILL_INSPECT'): Promise<
  { refusal: ToolOutcome } | { kind: 'sheet' | 'solid'; preview: { doc: StudioDoc; bodies: BodyResult[] }; candidate: DirectCandidatePin; pending: Proposal }
> {
  const { proposal, expectedProposalRevision } = args;
  const refused = (suffix: string, reason: string) => ({ refusal: fail(state, reason, { code: `DIRECT_${action}_${suffix}` }) });
  if (typeof proposal !== 'string' || !proposal || !isDirectPin(expectedProposalRevision))
    return refused('PROPOSAL_INPUT', 'Pass the proposal ID and its directReviewRevision from proposals.list as expectedProposalRevision.');
  const matches = (state.doc.proposals ?? []).filter(p => p.id === proposal);
  const pending = matches.length === 1 ? matches[0] : undefined;
  const kind = pending && directReviewKind(pending), pin = pending && directReviewRevision(pending);
  const guided = action === 'GUIDED_FILL_INSPECT';
  const supported = guided ? kind === 'sheet' && pending?.ops.length === 1 && isDirectGuidedFillOperation(pending.ops[0])
    : action === 'RENDER' || kind === 'solid';
  if (!pending || !kind || !pin || !supported) {
    if (guided) return refused('PROPOSAL_UNAVAILABLE', 'Choose one open Guided Fill proposal from proposals.list.');
    return refused('PROPOSAL_UNAVAILABLE', action !== 'RENDER' ? 'Choose a unique open Exact Thicken proposal from proposals.list.'
      : 'Choose a unique open Direct sheet or Exact Thicken proposal from proposals.list.');
  }
  if (kind === 'sheet' && state.bodies.length)
    return refused('SCOPE', 'Use sheet and curve review on a base document with only Direct geometry to display.');
  if (pin !== expectedProposalRevision || proposalIsStale(pending, requirementEvidenceRevision(state.doc)))
    return refused('PROPOSAL_STALE', 'The proposal or its source changed. Read proposals.list and review the current document.');
  const preview = await previewProposalWith(dispatch, state, proposal, evaluate);
  if ('error' in preview) return refused('PROPOSAL_FAILED', preview.error);
  return { kind, preview, pending, candidate: { proposal, proposalRevision: pin, baseDirectRevision } };
}
