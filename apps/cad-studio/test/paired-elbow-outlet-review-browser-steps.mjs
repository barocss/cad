import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkApprovedDuctReview, render } from './duct-proposal-review-browser-steps.mjs';
import { withMcpSession } from './mcp-browser-session.mjs';

export async function reviewPendingOutlet(f, file, call, request, expectedRevision) {
  const before = await readFile(file);
  const { proposals: [proposal] } = await call('proposals', { action: 'list' });
  assert.equal(proposal.id, 'P1');
  assert.match(proposal.modelReviewRevision, /^[0-9a-f]{64}$/);
  const pins = { expectedRevision, proposal: proposal.id, expectedProposalRevision: proposal.modelReviewRevision };
  const { meta, png } = await render(request, pins);
  const orientation = 'opposite', alternate = await render(request, { ...pins, orientation });
  assert.notDeepEqual(png, alternate.png);
  assert.notEqual(meta.candidate.reviewRevision, alternate.meta.candidate.reviewRevision);
  assert.equal(alternate.meta.candidate.bodySha256, meta.candidate.bodySha256);
  assert.deepEqual([meta.candidate.proposal, meta.candidate.proposalRevision, meta.candidate.baseRevision],
    [proposal.id, proposal.modelReviewRevision, expectedRevision]);
  const evidence = meta.pairedElbowOutletOffset;
  assert.deepEqual(alternate.meta.pairedElbowOutletOffset, evidence);
  assert.deepEqual([evidence.sourceBody, evidence.body, evidence.pathKind, evidence.face, evidence.distance],
    ['b1', 'b2', 'line-arc-line', 'n1.end', -4]);
  assert.deepEqual(evidence.displacement, { normal: [0, 1, 0], vector: [0, -4, 0] });
  assert.deepEqual([evidence.originalCap.center, evidence.movedCap.center], [[20, 34, 0], [20, 30, 0]]);
  assert.equal(evidence.movedCap.apertures.length, 2);
  assert.equal(evidence.throughApertures.apertures.length, 2);
  assert.deepEqual(evidence.retained.junctions, evidence.throughApertures.junctions);
  assert.equal(evidence.retained.faces.length, 25);
  assert.equal(evidence.materialChange.sectionArea, 32);
  assert.equal(evidence.materialChange.analytic, -128);
  assert.ok(Math.abs(evidence.materialChange.native + 128) < 1e-6);
  assert.ok(evidence.maximumGapMM < 1e-7);

  const faces = ['n1.start', 'n1.end'], reviewPin = { ...pins, action: 'inspect', faces,
    expectedReviewRevision: meta.candidate.reviewRevision };
  const native = await call('query', reviewPin);
  assert.deepEqual(native.pairedElbowOutletOffset, evidence);
  assert.deepEqual(native.candidate, meta.candidate);
  assert.equal(native.imageSha256, meta.imageSha256);
  assert.equal(native.faces.find(face => face.name === 'n1.end').geometry.point[1], 30);
  const opposite = await call('query', { ...reviewPin, orientation, expectedReviewRevision: alternate.meta.candidate.reviewRevision });
  assert.deepEqual(opposite.faces, native.faces);
  assert.equal(opposite.imageSha256, alternate.meta.imageSha256);

  for (const [pin, code] of [
    [{ orientation }, 'MODEL_REVIEW_IMAGE_STALE'],
    [{ expectedRevision: '0'.repeat(16) }, 'MODEL_REVIEW_BASE_STALE'],
    [{ expectedProposalRevision: '0'.repeat(64) }, 'MODEL_REVIEW_PROPOSAL_STALE'],
  ]) assert.equal((await call('query', { ...reviewPin, ...pin }, true)).code, code);
  assert.deepEqual(await readFile(file), before);
  await writeFile(join(f.output, 'pending-outlet-four-views.png'), png);
  await writeFile(join(f.output, 'pending-outlet-opposite.png'), alternate.png);
  f.report.observations.push({ label: 'pending-outlet-review', ...meta.candidate, imageSha256: meta.imageSha256,
    oppositeImageSha256: alternate.meta.imageSha256, evidence });
  return { meta, png, faces, native, reviewPin, alternate: { png: alternate.png, orientation } };
}

export async function checkReopenedOutlet(f, session, approved, reviewed) {
  const saved = await f.save('paired-elbow-outlet-review-approved');
  const reopened = (await f.freshOpen(saved.file, approved, '11-approved-fresh-open')).doc;
  await withMcpSession(session, saved.file, 'reopened-outlet-review', async (call, request) => {
    await checkApprovedDuctReview(call, request, reviewed);
  });
  return reopened;
}
