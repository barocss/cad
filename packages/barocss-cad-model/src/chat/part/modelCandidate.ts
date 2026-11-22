import { partBreps } from '../../engine/evaluate';
import { bodyKeyFor, featureId } from '../../engine/ids';
import { digestOf, requirementEvidenceRevision } from '../../util/digest';
import { revisionOf } from '../../util/revision';
import { boredWallProposal, reviewedBoreEvidence, type ModelCandidatePin } from '../modelProposalReview';
import { proposalIsStale } from '../proposals';
import { fail, type ChatState, type Evaluate, type PartRun } from '../toolKit';
import { renderViews } from '../views';
import { previewProposalWith } from './proposals';

const isDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Replay and render the same native candidate for both image review and inspection. */
export async function reviewBoredWallCandidate(state: ChatState, args: Record<string, unknown>, evaluate: Evaluate,
  dispatch: PartRun, inspect: boolean) {
  const { proposal, expectedRevision, expectedProposalRevision, expectedReviewRevision } = args;
  const refuse = (code: string, message: string) => ({ refusal: fail(state, message, { code }) });
  if (typeof proposal !== 'string' || !proposal || !isDigest(expectedProposalRevision) ||
    typeof expectedRevision !== 'string' || !/^[a-f0-9]{16}$/.test(expectedRevision) ||
    (inspect && !isDigest(expectedReviewRevision)) || args.highlight !== undefined || args.section !== undefined)
    return refuse('MODEL_REVIEW_INPUT', 'Pass the current base revision, proposal ID and modelReviewRevision from proposals.list. For inspection, also pass the reviewRevision from the candidate image.');
  if (state.partOf || state.doc.instances?.length)
    return refuse('MODEL_REVIEW_SCOPE', 'Review the pending bore in the base part without placed parts.');
  const baseRevision = revisionOf(state.doc);
  if (expectedRevision !== baseRevision)
    return refuse('MODEL_REVIEW_BASE_STALE', 'The base part changed. Read query.rebuild and proposals.list before reviewing again.');
  const matches = (state.doc.proposals ?? []).filter(entry => entry.id === proposal);
  const pending = matches.length === 1 ? matches[0] : undefined;
  const edit = pending && boredWallProposal(state.doc, pending);
  if (!pending || !edit)
    return refuse('MODEL_REVIEW_UNAVAILABLE', 'Choose a unique open proposal for the saved outer-wall Offset of a certified radial bore.');
  if (edit.revision !== expectedProposalRevision || proposalIsStale(pending, requirementEvidenceRevision(state.doc)))
    return refuse('MODEL_REVIEW_PROPOSAL_STALE', 'The proposal or its source changed. Read proposals.list and request a fresh proposal.');

  const preview = await previewProposalWith(dispatch, state, proposal, evaluate);
  if ('error' in preview) return refuse('MODEL_REVIEW_REPLAY_FAILED', preview.error);
  const { nodes } = preview.doc, owner = bodyKeyFor(nodes, edit.index, 'solid'), offset = nodes[edit.index];
  if (offset?.kind !== 'offset-face' || offset.distance !== edit.distance)
    return refuse('MODEL_REVIEW_REPLAY_FAILED', 'The proposal did not produce the reviewed outer-wall distance.');
  const cut = featureId(nodes, edit.cutIndex);
  const native = partBreps(preview.doc).filter(part => part.key === owner &&
    part.brep.source.family === 'analytic-boolean' && part.brep.source.id === cut);
  const [part] = native;
  const bore = native.length === 1 && reviewedBoreEvidence(owner, part.brep, edit.bore);
  if (!bore) return refuse('MODEL_REVIEW_REPLAY_FAILED', 'The original native bore and both openings could not be verified.');

  const result = await renderViews(preview.doc, preview.bodies, evaluate);
  if (typeof result === 'string') return refuse('MODEL_REVIEW_RENDER_FAILED', result);
  const revision = revisionOf(preview.doc);
  const pins = { proposal, proposalRevision: edit.revision, baseRevision, bodySha256: digestOf(part.brep) };
  const candidate: ModelCandidatePin = {
    ...pins, reviewRevision: digestOf({ ...pins, revision, imageSha256: result.imageSha256 }),
  };
  if (inspect && expectedReviewRevision !== candidate.reviewRevision)
    return refuse('MODEL_REVIEW_IMAGE_STALE', 'That image belongs to a different review. Render this exact proposal before inspecting it.');
  return { preview, candidate, bore, revision, result };
}
