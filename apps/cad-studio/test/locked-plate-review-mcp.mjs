import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { currentPartRevision } from './mcp-browser-session.mjs';

/** Read the same full, pending native candidate through its wire image and exact named faces. */
export async function reviewPendingPlate(call, request, output, label) {
  const expectedRevision = await currentPartRevision(call);
  const { proposals: [entry] } = await call('proposals', { action: 'list' });
  assert.deepEqual([entry.id, entry.status, entry.stale], ['P1', 'open', false]);
  assert.match(entry.modelReviewRevision, /^[a-f0-9]{64}$/);
  const pin = { expectedRevision, proposal: entry.id, expectedProposalRevision: entry.modelReviewRevision };
  const result = await request('tools/call', { name: 'query', arguments: { action: 'render', ...pin } });
  assert.equal(result.isError, false, JSON.stringify(result.content[0]));
  const image = JSON.parse(result.content[0].text);
  const picture = result.content.find(item => item.type === 'image');
  assert.equal(picture.mediaType ?? picture.mimeType, 'image/png');
  const bytes = Buffer.from(picture.data, 'base64');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), image.imageSha256);
  await writeFile(join(output, label + '-native-review.png'), bytes);

  const names = image.throughBorePlates[0].bores.flatMap(bore => bore.faces);
  const args = { action: 'inspect', ...pin, faces: names, expectedReviewRevision: image.candidate.reviewRevision };
  const observed = await call('query', args);
  assert.deepEqual(observed.candidate, image.candidate);
  assert.deepEqual(observed.faces.map(face => face.name), names);
  for (const key of ['revision', 'imageSha256', 'lockedPlateReference', 'throughBorePlates'])
    assert.deepEqual(observed[key], image[key], key);
  for (const [key, code] of [
    ['expectedProposalRevision', 'MODEL_REVIEW_PROPOSAL_STALE'],
    ['expectedReviewRevision', 'MODEL_REVIEW_IMAGE_STALE'],
  ]) {
    const refused = await call('query', { ...args, [key]: '0'.repeat(64) }, true);
    assert.equal(refused.code, code);
  }
  return observed;
}
