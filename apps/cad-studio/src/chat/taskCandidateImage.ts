import { digestOf, sha256Hex } from '@barocss/cad-model/util/digest';
import { isObj } from '@barocss/cad-model/util/guards';
import { canonical } from '@barocss/cad-model/util/revision';
import type { CandidateReview } from '../files/taskCandidateReview';
import { localTaskRunJSON } from './localTaskRun';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const mismatch = () => new Error('The candidate image does not match the current review. Refresh the candidate review.');

/** Check the actual PNG bytes and the exact local run receipt before displaying an image. */
export function readTaskCandidateImage(value: unknown, review: CandidateReview): string {
  const local = review.localRun;
  if (!local || !isObj(value)) throw mismatch();
  const { request, decision, receipt } = local;
  if (value.runId !== request.runId || value.taskId !== request.taskId || value.attemptId !== request.attemptId
    || value.candidateDigest !== request.candidateDigest || value.baselineDigest !== request.baselineDigest
    || value.occurrence !== review.occurrence || value.controlRevision !== decision.controlRevision
    || !Number.isSafeInteger(value.reviewRevision) || (value.reviewRevision as number) < local.revision
    || value.receiptDigest !== digestOf({ ...receipt, revision: value.reviewRevision })
    || canonical(value.checks) !== canonical(review.checks) || canonical(value.geometry) !== canonical(review.geometry)
    || value.revision !== review.renderRevision
    || !isObj(value.image) || value.image.mediaType !== 'image/png' || typeof value.image.data !== 'string'
    || !value.image.data.length || value.image.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4) throw mismatch();
  let binary: string;
  try { binary = atob(value.image.data); } catch { throw mismatch(); }
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  // The renderer has one fixed 1000 × 1000 four-view sheet. Bound its decoded image as well as its transport.
  const pngHeader = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
  if (bytes.length < 33 || bytes.length > MAX_IMAGE_BYTES || !pngHeader.every((n, i) => bytes[i] === n)
    || new DataView(bytes.buffer).getUint32(16) !== 1000 || new DataView(bytes.buffer).getUint32(20) !== 1000
    || sha256Hex(bytes) !== value.imageSha256) throw mismatch();
  return 'data:image/png;base64,' + value.image.data;
}

export async function localTaskCandidateImage(review: CandidateReview, current: () => boolean) {
  if (!review.localRun) throw mismatch();
  const value = await localTaskRunJSON('render-candidate', JSON.stringify(review.localRun.request));
  if (!current()) return;
  return readTaskCandidateImage(value, review);
}
