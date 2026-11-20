import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react';
import { digestOf } from '@barocss/cad-model/util/digest';
import { localTaskCandidateImage } from '../chat/taskCandidateImage';
import type { TaskRunDecision } from '../chat/taskRunOffer';
import type { CandidateReview } from '../files/taskCandidateReview';

export function CandidateReviewSection({ review, shown, available, toggle, decide }: {
  review: CandidateReview; shown: boolean; available: boolean; toggle(): void; decide?(decision: TaskRunDecision): Promise<void>;
}) {
  const [deciding, setDeciding] = useState<TaskRunDecision>();
  const [error, setError] = useState('');
  const canDecide = available && shown && !deciding;
  async function decideCandidate(action: TaskRunDecision) {
    if (!decide || !canDecide) return;
    setDeciding(action);
    setError('');
    try { await decide(action); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not record the candidate decision.'); }
    finally { setDeciding(undefined); }
  }
  const dimension = { height: 'Height', width: 'Width', depth: 'Depth', diameter: 'Diameter', footprint: 'Width × Depth' }[review.field];
  const displayMm = (value: typeof review.beforeMm) => typeof value === 'number' ? value : value.widthMm + ' × ' + value.depthMm;
  const volume = review.preview.volumeChange;
  const delta = volume === null ? null : Math.round(volume * 1000) / 1000;
  return <section className="my-2 text-[11px]" aria-label="Worker candidate review">
    <strong>{shown ? 'Candidate preview' : 'Worker candidate review'}</strong>
    <div>Task {review.taskId} · {review.occurrence}/{review.feature}</div>
    <div>Candidate <code>{review.candidateDigest.slice(0, 12)}</code></div>
    <div>Attempt <code>{review.attemptId}</code></div>
    <div>{review.localRun ? 'Awaiting decision' : 'Awaiting decision at export. Decide in the local run.'}</div>
    <div>{dimension} · {displayMm(review.beforeMm)} mm → {displayMm(review.candidateMm)} mm</div>
    {delta !== null && <div>Volume change · {delta > 0 ? '+' : ''}{delta} mm³</div>}
    <ul className="m-0 list-none p-0" aria-label="Candidate checks">
      {review.checks.map(check => <li key={check.id}>
        <strong>{check.id}</strong> · {check.status === 'pass' ? 'Pass' : check.status === 'fail' ? 'Fail' : 'Unknown'} · {check.expected}
      </li>)}
    </ul>
    <Button type="button" variant="ghost" size="xs" disabled={!available || !!deciding} onClick={toggle}>
      {shown ? 'Show accepted model' : 'Preview candidate'}
    </Button>
    {review.localRun && available && shown && <CandidateViews key={digestOf({ decision: review.localRun.decision,
      occurrence: review.occurrence, feature: review.feature, renderRevision: review.renderRevision })} review={review} disabled={!!deciding} />}
    {decide && <>
      <Button type="button" size="xs" disabled={!canDecide} onClick={() => void decideCandidate('approve')}>
        {deciding === 'approve' ? 'Approving…' : 'Approve candidate'}
      </Button>
      <Button type="button" variant="ghost" size="xs" disabled={!canDecide} onClick={() => void decideCandidate('reject')}>
        {deciding === 'reject' ? 'Rejecting…' : 'Reject candidate'}
      </Button>
    </>}
    {error && <div role="status">{error}</div>}
  </section>;
}

/** A view belongs to one local review. Hiding or changing that review retires all its requests. */
function CandidateViews({ review, disabled }: { review: CandidateReview; disabled: boolean }) {
  const intent = useRef<object | undefined>(undefined);
  const [image, setImage] = useState<{ phase: 'loading' | 'ready' | 'error'; src?: string; error?: string }>();
  useEffect(() => () => { intent.current = undefined; }, []);
  async function renderCandidate() {
    if (disabled || image?.phase === 'loading') return;
    const request = {};
    intent.current = request;
    const current = () => intent.current === request;
    setImage({ phase: 'loading' });
    try {
      const src = await localTaskCandidateImage(review, current);
      if (src && current()) setImage({ phase: 'ready', src });
    } catch (error) {
      if (current()) setImage({ phase: 'error', error: error instanceof Error ? error.message : 'Could not render the candidate image.' });
    }
  }
  return <>
    <Button type="button" variant="ghost" size="xs" disabled={disabled || image?.phase === 'loading'} onClick={() => void renderCandidate()}>
      {image?.phase === 'loading' ? 'Rendering candidate…' : 'Render candidate four views'}
    </Button>
    {image?.phase === 'ready' && <figure className="m-0" aria-label="Current candidate image">
      <figcaption>Current candidate · {review.occurrence} · four views</figcaption>
      <img src={image.src} alt="Current candidate four views" width={1000} height={1000} className="h-auto w-full"
        onError={() => setImage(previous => previous?.phase === 'ready' && previous.src === image.src
          ? { phase: 'error', error: 'Could not display the candidate image.' } : previous)} />
    </figure>}
    {image?.phase === 'error' && <div role="status">{image.error}</div>}
  </>;
}
