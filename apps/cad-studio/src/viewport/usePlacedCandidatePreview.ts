import { useCallback, useEffect, useMemo, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { StudioNotice } from '../app/studioNotice';
import type { TaskRunReviewRequest } from '../chat/taskRunOffer';
import type { CandidateReview } from '../files/taskCandidateReview';
import type { useScenePoses } from '../state/useScenePoses';
import { withPlacedProposalBodies, WORKER_CANDIDATE_TINT, type PlacedProposalPreview } from './instanceEvaluation';
import type { InstanceItem } from './renderer';

type ReviewState = { review: CandidateReview; shown: boolean } | null;

interface Inputs {
  candidate: ReviewState;
  setCandidate: Dispatch<SetStateAction<ReviewState>>;
  reviewView: boolean;
  showInVersions: boolean;
  dockVisible: boolean;
  localCandidateView: RefObject<(occurrence?: string) => boolean>;
  instances: InstanceItem[];
  placements: ReturnType<typeof useScenePoses>['instancesPlaced'];
  isolatedInstances?: readonly string[];
  proposal?: Extract<PlacedProposalPreview, { kind: 'ready' }>;
  reviewTaskRun: (request: Omit<TaskRunReviewRequest, 'baselineDigest'>) => Promise<unknown>;
  setToast: (notice: StudioNotice) => void;
}

export function usePlacedCandidatePreview({
  candidate, setCandidate, reviewView, showInVersions, dockVisible, localCandidateView,
  instances, placements, isolatedInstances, proposal, reviewTaskRun, setToast,
}: Inputs) {
  const visible = (occurrence: string) => (!isolatedInstances || isolatedInstances.includes(occurrence))
    && instances.some(instance => instance.id === occurrence && instance.bodies.length > 0);
  localCandidateView.current = occurrence => reviewView && (occurrence === undefined || visible(occurrence));
  const occurrence = candidate?.review.occurrence;
  const candidateAvailable = showInVersions && occurrence !== undefined && visible(occurrence)
    && (!candidate?.review.localRun || (reviewView && dockVisible));

  const hideCandidatePreview = useCallback(() => setCandidate(value => value?.shown ? { ...value, shown: false } : value), [setCandidate]);
  useEffect(() => {
    if (!candidateAvailable && candidate?.shown) hideCandidatePreview();
  }, [candidateAvailable, candidate?.shown, hideCandidatePreview]);

  const toggleCandidatePreview = () => {
    const request = candidate?.review.localRun?.request;
    if (request && !candidate?.shown) {
      void reviewTaskRun(request).catch(error => setToast({
        title: 'Could not review the worker candidate',
        hint: error instanceof Error ? error.message : String(error),
        detail: '',
      }));
      return;
    }
    setCandidate(value => value && { ...value, shown: !value.shown });
  };

  const placedCandidate = candidateAvailable && candidate?.shown ? candidate.review.preview.bodies : undefined;
  const placedProposal = proposal?.bodies ?? placedCandidate;
  const tint = placedCandidate ? WORKER_CANDIDATE_TINT : undefined;
  const additions = proposal?.additions;
  const viewportInstances = useMemo(() => withPlacedProposalBodies(additions ? [...instances, ...additions] : instances, placedProposal, tint),
    [instances, additions, placedProposal, tint]);
  const viewportPlacements = useMemo(() => withPlacedProposalBodies(placements, placedProposal, tint), [placements, placedProposal, tint]);

  return { candidateAvailable, hideCandidatePreview, toggleCandidatePreview, placedProposal, viewportInstances, viewportPlacements };
}
