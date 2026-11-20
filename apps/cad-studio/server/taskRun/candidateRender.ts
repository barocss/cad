import { readStudioWorkingCopy } from '@barocss/cad-model/engine/container';
import { evaluatePart } from '@barocss/cad-model/engine/evaluate';
import type { ViewsResult } from '@barocss/cad-model/chat/views';
import { runTool } from '@barocss/cad-model/chat/tools';
import type { Evaluate } from '@barocss/cad-model/chat/toolKit';
import { digestOf, sha256Hex } from '@barocss/cad-model/util/digest';
import { revisionOf } from '@barocss/cad-model/util/revision';
import { candidateReviewOnBaseline, matchesCurrentCandidateReview, verifyCandidateReview,
  type CandidateReviewReceipt } from '../../src/files/taskCandidateReview';
import { TaskRunStore } from './store';

/** An on-demand read. The run store is never opened for writing or given an approval token. */
export async function renderTaskCandidate(directory: string, taskId: string, review: CandidateReviewReceipt,
  evaluate: Evaluate = async doc => evaluatePart(doc, 0)) {
  const initial = TaskRunStore.readCandidateReview(directory, taskId);
  const requireCurrent = (current: typeof initial) => {
    if (!matchesCurrentCandidateReview(review, current.receipt)
      || !matchesCurrentCandidateReview(initial.receipt, current.receipt)
      || current.controlRevision !== initial.controlRevision)
      throw new Error('The reviewed candidate changed. Export and review the current attempt again.');
  };
  requireCurrent(initial);
  const baseline = await readStudioWorkingCopy(new Uint8Array(initial.bytes));
  if ('error' in baseline) throw new Error(baseline.error);
  const candidate = candidateReviewOnBaseline(initial.receipt, baseline.doc);
  if ('error' in candidate) throw new Error(candidate.error);
  // Verify and draw the same evaluated body. Protected occurrences retain their own evaluations.
  const native = await evaluate(candidate.local);
  if (!native?.ok) throw new Error('The current candidate could not be evaluated for its views.');
  const verified = await verifyCandidateReview(candidate, doc => doc === candidate.local ? Promise.resolve(native) : evaluate(doc));
  if ('error' in verified) throw new Error(verified.error);
  const revision = revisionOf(candidate.local);
  const rendered = await runTool({ doc: candidate.local, bodies: native.bodies }, 'query',
    { action: 'render', expectedRevision: revision }, evaluate);
  if (rendered.isError || rendered.changed || rendered.images?.length !== 1)
    throw new Error('The candidate views could not be rendered: ' + rendered.content);
  const image = rendered.images[0];
  const metadata: Omit<ViewsResult, 'image'> & { revision: string } = JSON.parse(rendered.content);
  if (metadata.revision !== revision || image.mediaType !== 'image/png'
    || metadata.imageSha256 !== sha256Hex(Buffer.from(image.data, 'base64')))
    throw new Error('The candidate view revision or image checksum differs.');
  // Async native checks and rendering can outlive a decision, stop, replacement or baseline commit.
  requireCurrent(TaskRunStore.readCandidateReview(directory, taskId));
  const receipt = initial.receipt;
  return { runId: receipt.runId, taskId, attemptId: receipt.attemptId, candidateDigest: receipt.candidateDigest,
    occurrence: receipt.scope.occurrence, baselineDigest: receipt.baseline.modelDigest,
    receiptDigest: digestOf(receipt), reviewRevision: receipt.revision, controlRevision: initial.controlRevision,
    ...metadata, image, checks: verified.checks, geometry: verified.geometry };
}
