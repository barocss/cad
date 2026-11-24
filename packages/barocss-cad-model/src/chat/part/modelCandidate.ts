import type { Brep } from '@barocss/cad';
import { partBreps } from '../../engine/evaluate';
import { bodyKeyFor, featureId } from '../../engine/ids';
import { digestOf, requirementEvidenceRevision } from '../../util/digest';
import { revisionOf } from '../../util/revision';
import { cornerBatchProposal, reviewedChamferResizeEvidence, reviewedCornerBatchEvidence, savedChamferResizeProposal } from '../cornerProposalReview';
import { boredWallProposal, reviewedBoreEvidence, type ModelCandidatePin } from '../modelProposalReview';
import { pairedElbowInletProposal, pairedElbowOutletProposal, reviewedPairedElbowInletEvidence, reviewedPairedElbowOutletEvidence } from '../pairedElbowOutletProposalReview';
import { pairedElbowInletPlaneProposal, pairedElbowOutletPlaneProposal, reviewedPairedElbowInletPlaneEvidence, reviewedPairedElbowOutletPlaneEvidence } from '../pairedElbowOutletPlaneProposalReview';
import { pairedTiltedInletProposal, pairedTiltedOppositeCapProposal, pairedTiltedOutletProposal, reviewedPairedTiltedInletEvidence, reviewedPairedTiltedOppositeCapEvidence, reviewedPairedTiltedOutletEvidence } from '../pairedTiltedOutletProposalReview';
import { proposalIsStale } from '../proposals';
import { rectangularDuctProposal, reviewedRectangularDuctEvidence } from '../rectangularDuctProposalReview';
import { rectangularDuctIntersectionProposal, reviewedRectangularDuctIntersectionEvidence } from '../rectangularDuctIntersectionProposalReview';
import { fail, type ChatState, type Evaluate, type PartRun } from '../toolKit';
import { renderViews } from '../views';
import { previewProposalWith } from './proposals';

const isDigest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

type BoreEvidence = { brep: Brep; bore: NonNullable<ReturnType<typeof reviewedBoreEvidence>> };

function boredWallEvidence(doc: ChatState['doc'], edit: NonNullable<ReturnType<typeof boredWallProposal>>): BoreEvidence | { error: string } {
  const { nodes } = doc, owner = bodyKeyFor(nodes, edit.index, 'solid'), offset = nodes[edit.index];
  if (offset?.kind !== 'offset-face' || offset.distance !== edit.distance)
    return { error: 'The proposal did not produce the reviewed outer-wall distance.' };
  const cut = featureId(nodes, edit.cutIndex);
  const native = partBreps(doc).filter(part => part.key === owner &&
    part.brep.source.family === 'analytic-boolean' && part.brep.source.id === cut);
  const [part] = native;
  const bore = native.length === 1 && reviewedBoreEvidence(owner, part.brep, edit.bore);
  return bore ? { brep: part.brep, bore } : { error: 'The original native bore and both openings could not be verified.' };
}

/** Replay and render the same native candidate for both image review and inspection. */
export async function reviewModelCandidate(state: ChatState, args: Record<string, unknown>, evaluate: Evaluate,
  dispatch: PartRun, inspect: boolean) {
  const { proposal, expectedRevision, expectedProposalRevision, expectedReviewRevision } = args;
  const refuse = (code: string, message: string) => ({ refusal: fail(state, message, { code }) });
  if (typeof proposal !== 'string' || !proposal || !isDigest(expectedProposalRevision) ||
    typeof expectedRevision !== 'string' || !/^[a-f0-9]{16}$/.test(expectedRevision) ||
    (inspect && !isDigest(expectedReviewRevision)) || args.highlight !== undefined || args.section !== undefined)
    return refuse('MODEL_REVIEW_INPUT', 'Pass the current base revision, proposal ID and modelReviewRevision from proposals.list. For inspection, also pass the reviewRevision from the candidate image and repeat its orientation if supplied.');
  if (state.partOf || state.doc.instances?.length)
    return refuse('MODEL_REVIEW_SCOPE', 'Review the pending model edit in the base part without placed parts.');
  const baseRevision = revisionOf(state.doc);
  if (expectedRevision !== baseRevision)
    return refuse('MODEL_REVIEW_BASE_STALE', 'The base part changed. Read query.rebuild and proposals.list before reviewing again.');
  const matches = (state.doc.proposals ?? []).filter(entry => entry.id === proposal);
  const pending = matches.length === 1 ? matches[0] : undefined;
  const boreEdit = pending && boredWallProposal(state.doc, pending);
  const cornerEdit = pending && !boreEdit ? cornerBatchProposal(state.doc, pending) : undefined;
  const resizeEdit = pending && !boreEdit && !cornerEdit ? savedChamferResizeProposal(state.doc, pending) : undefined;
  const duct = pending && !boreEdit && !cornerEdit && !resizeEdit ? rectangularDuctProposal(state.doc, pending) : undefined;
  const ductCut = pending && !boreEdit && !cornerEdit && !resizeEdit && !duct ? rectangularDuctIntersectionProposal(state.doc, pending) : undefined;
  const pairedOffset = pending && !boreEdit && !cornerEdit && !resizeEdit && !duct && !ductCut ? pending : undefined;
  const outlet = pairedOffset && pairedElbowOutletProposal(state.doc, pairedOffset);
  const inlet = pairedOffset && !outlet ? pairedElbowInletProposal(state.doc, pairedOffset) : undefined;
  const outletPlane = pairedOffset && !outlet && !inlet ? pairedElbowOutletPlaneProposal(state.doc, pairedOffset) : undefined;
  const inletPlane = pairedOffset && !outlet && !inlet && !outletPlane ? pairedElbowInletPlaneProposal(state.doc, pairedOffset) : undefined;
  const tiltedOutlet = pending && pairedTiltedOutletProposal(state.doc, pending);
  const tiltedInlet = pending && !tiltedOutlet ? pairedTiltedInletProposal(state.doc, pending) : undefined;
  const tiltedOpposite = pending && !tiltedOutlet && !tiltedInlet ? pairedTiltedOppositeCapProposal(state.doc, pending) : undefined;
  const proposalRevision = boreEdit?.revision ?? cornerEdit?.revision ?? resizeEdit?.revision ?? duct?.revision ?? ductCut?.revision ??
    outlet?.revision ?? inlet?.revision ?? outletPlane?.revision ?? inletPlane?.revision ?? tiltedOutlet?.revision ?? tiltedInlet?.revision ?? tiltedOpposite?.revision;
  if (!pending || !proposalRevision)
    return refuse('MODEL_REVIEW_UNAVAILABLE', 'Choose a unique open proposal for a supported bored-wall Offset, sketch corner group, saved Chamfer resize, rectangular duct Sweep, duct Intersect, paired duct inlet or outlet Offset, or a paired tilted cap replacement.');
  if (proposalRevision !== expectedProposalRevision || proposalIsStale(pending, requirementEvidenceRevision(state.doc)))
    return refuse('MODEL_REVIEW_PROPOSAL_STALE', 'The proposal or its source changed. Read proposals.list and request a fresh proposal.');

  const preview = await previewProposalWith(dispatch, state, proposal, evaluate);
  if ('error' in preview) return refuse('MODEL_REVIEW_REPLAY_FAILED', preview.error);
  const evidence = boreEdit ? boredWallEvidence(preview.doc, boreEdit)
    : cornerEdit ? reviewedCornerBatchEvidence(state.doc, preview.doc, cornerEdit)
      : resizeEdit ? reviewedChamferResizeEvidence(state.doc, preview.doc, resizeEdit)
        : duct ? await reviewedRectangularDuctEvidence(state.doc, preview.doc, duct)
          : ductCut ? reviewedRectangularDuctIntersectionEvidence(state.doc, preview.doc, ductCut)
            : outlet ? await reviewedPairedElbowOutletEvidence(state.doc, state.bodies, preview.doc, outlet)
              : inlet ? await reviewedPairedElbowInletEvidence(state.doc, state.bodies, preview.doc, inlet)
                : outletPlane ? await reviewedPairedElbowOutletPlaneEvidence(state.doc, state.bodies, preview.doc, outletPlane)
                  : inletPlane ? await reviewedPairedElbowInletPlaneEvidence(state.doc, state.bodies, preview.doc, inletPlane)
                    : tiltedOutlet ? reviewedPairedTiltedOutletEvidence(state.doc, preview.doc, tiltedOutlet)
                      : tiltedInlet ? reviewedPairedTiltedInletEvidence(state.doc, preview.doc, tiltedInlet)
                        : tiltedOpposite && reviewedPairedTiltedOppositeCapEvidence(state.doc, preview.doc, tiltedOpposite);
  if (!evidence) return refuse('MODEL_REVIEW_REPLAY_FAILED', 'The native geometry of this proposal could not be verified.');
  if ('error' in evidence) return refuse('MODEL_REVIEW_REPLAY_FAILED', evidence.error);
  const { brep, ...geometry } = evidence;

  const orientation = args.orientation === 'opposite' ? 'opposite' as const : undefined;
  const result = await renderViews(preview.doc, preview.bodies, evaluate, orientation ? { orientation } : undefined);
  if (typeof result === 'string') return refuse('MODEL_REVIEW_RENDER_FAILED', result);
  const revision = revisionOf(preview.doc);
  const pins = { proposal, proposalRevision, baseRevision, bodySha256: digestOf(brep), ...(orientation ? { orientation } : {}) };
  const candidate: ModelCandidatePin = {
    ...pins, reviewRevision: digestOf({ ...pins, revision, imageSha256: result.imageSha256 }),
  };
  if (inspect && expectedReviewRevision !== candidate.reviewRevision)
    return refuse('MODEL_REVIEW_IMAGE_STALE', 'That image belongs to a different review. Use the exact proposal image pin and orientation.');
  return { preview, candidate, geometry, revision, result };
}
