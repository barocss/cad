import { readSheets } from '../../drawing/sheets';
import { requirementEvidenceRevision } from '../../util/digest';
import { isObj } from '../../util/guards';
import { runDrawingTool } from '../drawing';
import { DRAWING_DIMENSIONS } from '../drawingToleranceStack';
import { proposalIsStale, proposalRevisionOf } from '../proposals';
import { fail, subToolResult, type ChatState, type Evaluate, type PartRun } from '../toolKit';
import { previewProposalWith } from './proposals';

const isRevision = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Compare the selected working sheet with the same sheet produced by the exact pending proposal. */
export async function reviewDrawingProposal(state: ChatState, { review, ...args }: Record<string, unknown>,
  evaluate: Evaluate, dispatch: PartRun) {
  if (state.partOf) return fail(state, 'Review the drawing proposal from the root document.', { code: 'DRAWING_REVIEW_SCOPE' });
  const request = isObj(review) ? review : {};
  const { proposal, expectedRevision, expectedProposalRevision, ...extra } = request;
  if (typeof proposal !== 'string' || !proposal.trim() || !isRevision(expectedRevision) ||
    !isRevision(expectedProposalRevision) || Object.keys(extra).length || (Object.hasOwn(args, 'include_callouts') && args.include_callouts !== true)) {
    return fail(state, 'Use the proposal ID and proposalRevision from proposals.list and the revision from drawing.dimensions on this sheet. For a drawing review, omit include_callouts or set it to true.',
      { code: 'DRAWING_REVIEW_INPUT' });
  }
  const matches = (state.doc.proposals ?? []).filter(entry => entry.id === proposal);
  const pending = matches.length === 1 ? matches[0] : undefined;
  if (pending?.status !== 'open')
    return fail(state, 'Select a unique open proposal from proposals.list.', { code: 'DRAWING_REVIEW_PROPOSAL' });
  if (proposalRevisionOf(pending) !== expectedProposalRevision || proposalIsStale(pending, requirementEvidenceRevision(state.doc)))
    return fail(state, 'The proposal or its source changed. Refresh proposals.list and review a current proposal.', { code: 'DRAWING_REVIEW_STALE' });

  const readArgs = { ...args, include_callouts: true };
  const working = runDrawingTool(state.doc, DRAWING_DIMENSIONS, readArgs);
  if ('error' in working) return fail(state, working.error);
  if (working.content.revision !== expectedRevision)
    return fail(state, 'The working drawing or selected sheet changed. Read drawing.dimensions on this sheet again.', { code: 'DRAWING_REVIEW_BASE' });

  const preview = await previewProposalWith(dispatch, state, proposal, evaluate);
  if ('error' in preview) return fail(state, preview.error, { code: 'DRAWING_REVIEW_REPLAY' });
  const sheet = typeof args.sheet === 'number' ? args.sheet : 1;
  let candidateSheet = sheet;
  if (sheet > 1) {
    const id = readSheets(state.doc.drawing?.sheets)[sheet - 2]?.id;
    const index = readSheets(preview.doc.drawing?.sheets).findIndex(s => s.id === id);
    if (index < 0)
      return fail(state, 'The proposal removes the selected drawing sheet.', { code: 'DRAWING_REVIEW_SHEET' });
    candidateSheet = index + 2;
  }
  const candidate = runDrawingTool(preview.doc, DRAWING_DIMENSIONS, { ...readArgs, sheet: candidateSheet });
  if ('error' in candidate) return fail(state, candidate.error, { code: 'DRAWING_REVIEW_CANDIDATE' });
  return subToolResult(state, {
    ...working,
    content: {
      ...working.content,
      candidate: { proposal, proposalRevision: expectedProposalRevision, ...candidate.content },
    },
    summary: `Compared the working drawing and proposal ${proposal}`,
  });
}
