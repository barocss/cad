import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { fixturePlan } from './task-run-fixture';
import { crc32 } from '@barocss/cad-model/io/zip';
import { digestOf, sha256Hex } from '@barocss/cad-model/util/digest';
import type { CandidateReview, CandidateReviewReceipt } from '../src/files/taskCandidateReview';
import { localTaskCandidateImage, readTaskCandidateImage } from '../src/chat/taskCandidateImage';

function fixture() {
  const request = { runKey: 'a'.repeat(64), runId: 'run-a', baselineDigest: 'b'.repeat(64), taskId: 'base',
    attemptId: 'attempt-a', candidateDigest: 'c'.repeat(64) };
  const receipt: CandidateReviewReceipt = { runId: request.runId, revision: 4, attemptId: request.attemptId, candidateDigest: request.candidateDigest,
    plan: fixturePlan, baseline: { modelDigest: request.baselineDigest, sha256: 'd'.repeat(64) },
    submission: { taskId: 'base', specRevision: 'e'.repeat(64), inputDigest: 'f'.repeat(64), heightMm: 6 },
    scope: { occurrence: 'p1', feature: 'n1', field: 'height' } };
  const review: CandidateReview = { ...request, occurrence: 'p1', feature: 'n1', field: 'height', beforeMm: 5, candidateMm: 6,
    preview: { kind: 'ready', bodies: new Map(), volumeChange: 200 },
    checks: [{ id: 'height', status: 'pass', expected: '6 mm', measured: 6, hard: true, basis: 'stated', sourceStatus: undefined }], renderRevision: '0123456789abcdef',
    geometry: { sizeMm: [20, 10, 6], volumeMm3: 1200, centroidMm: [10, 5, 3] },
    localRun: { request, receipt, revision: receipt.revision,
      decision: { ...request, reviewRevision: receipt.revision, controlRevision: 2, receiptDigest: digestOf(receipt) } } };
  const chunk = (name: string, bytes: Buffer) => {
    const data = Buffer.concat([Buffer.from(name), bytes]), head = Buffer.alloc(4), tail = Buffer.alloc(4);
    head.writeUInt32BE(bytes.length); tail.writeUInt32BE(crc32(data));
    return Buffer.concat([head, data, tail]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1000); ihdr.writeUInt32BE(1000, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(1000 * 4001))), chunk('IEND', Buffer.alloc(0))]);
  const response = { ...request, occurrence: review.occurrence, reviewRevision: 4, controlRevision: 2,
    receiptDigest: digestOf(receipt), revision: review.renderRevision, checks: review.checks, geometry: review.geometry,
    image: { mediaType: 'image/png', data: png.toString('base64') }, imageSha256: sha256Hex(png) };
  return { review, response, png };
}

test('candidate image pins the run, receipt, occurrence, native checks and actual PNG bytes', () => {
  const { review, response, png } = fixture();
  assert.equal(readTaskCandidateImage(response, review), 'data:image/png;base64,' + png.toString('base64'));
  for (const key of ['runId', 'taskId', 'attemptId', 'candidateDigest', 'baselineDigest', 'occurrence', 'receiptDigest', 'revision', 'imageSha256']) {
    assert.throws(() => readTaskCandidateImage({ ...response, [key]: 'different' }, review), /does not match/);
  }
  for (const value of [{ controlRevision: 3 }, { reviewRevision: 3 }, { checks: [] },
    { geometry: { ...response.geometry, volumeMm3: 1199 } }, { image: { ...response.image, mediaType: 'text/html' } },
    { image: { ...response.image, data: response.image.data.slice(0, -4) + 'AAAA' } }])
    assert.throws(() => readTaskCandidateImage({ ...response, ...value }, review), /does not match/);
  const resized = Buffer.from(png); resized.writeUInt32BE(2000, 16);
  assert.throws(() => readTaskCandidateImage({ ...response, image: { ...response.image, data: resized.toString('base64') },
    imageSha256: sha256Hex(resized) }, review), /does not match/);
  assert.throws(() => readTaskCandidateImage(response, { ...review, localRun: undefined }), /does not match/);
  // Other task journal entries can advance the receipt revision without changing its content or control pin.
  assert.ok(readTaskCandidateImage({ ...response, reviewRevision: 5,
    receiptDigest: digestOf({ ...review.localRun!.receipt, revision: 5 }) }, review));
});

test('local candidate image transport drops a retired response and preserves exact request scope', async t => {
  const { review, response } = fixture(), previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value: { location: { hostname: '127.0.0.1' } }, configurable: true });
  const calls: { url: string; init?: RequestInit }[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } });
  });
  try {
    assert.equal(await localTaskCandidateImage(review, () => false), undefined);
    assert.ok(await localTaskCandidateImage(review, () => true));
    assert.equal(calls[0].url, '/api/chat/task-runs/render-candidate');
    assert.equal(calls[0].init?.body, JSON.stringify(review.localRun!.request));
    Object.defineProperty(globalThis, 'window', { value: { location: { hostname: 'studio.example' } }, configurable: true });
    await assert.rejects(localTaskCandidateImage(review, () => true), /Open Studio on this computer/);
    assert.equal(calls.length, 2);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
