import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkApprovedDuctReview, checkChangedDuctPath, render } from './duct-proposal-review-browser-steps.mjs';
import { currentPartRevision, withMcpSession } from './mcp-browser-session.mjs';

export async function reviewPendingOutlet(f, file, call, request, expectedRevision, retainedRail, { arcFirst, inlet }) {
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
  const evidenceKey = inlet ? 'pairedElbowInletOffset' : 'pairedElbowOutletOffset';
  const evidence = meta[evidenceKey];
  assert.deepEqual(alternate.meta[evidenceKey], evidence);
  if (retainedRail) {
    const { direct_curves: [rail], direct_revision: directRevision } = await call('query', { action: 'summary' });
    assert.equal(rail.id, 'rail');
    assert.deepEqual(evidence.sourceRail, { path: rail.id, pathRevision: rail.revision, directRevision });
  } else assert.equal(evidence.sourceRail, undefined);
  assert.deepEqual([evidence.sourceBody, evidence.body, evidence.pathKind, evidence.face, evidence.distance],
    ['b1', 'b2', arcFirst ? 'arc-and-line' : 'line-arc-line', inlet ? 'n1.start' : 'n1.end', -4]);
  const [original, moved] = arcFirst || inlet ? [[-10, 0, 0], [-6, 0, 0]] : [[20, 34, 0], [20, 30, 0]];
  assert.deepEqual(evidence.displacement, arcFirst || inlet ? { normal: [-1, 0, 0], vector: [4, 0, 0] }
    : { normal: [0, 1, 0], vector: [0, -4, 0] });
  assert.deepEqual([evidence.originalCap.center, evidence.movedCap.center], [original, moved]);
  assert.equal(evidence.movedCap.apertures.length, 2);
  assert.equal(evidence.throughApertures.apertures.length, 2);
  assert.deepEqual(evidence.retained.junctions, evidence.throughApertures.junctions);
  assert.equal(evidence.retained.faces.length, arcFirst ? 13 : 25);
  if (arcFirst) {
    const joins = evidence.retained.junctions;
    assert.deepEqual(joins.map(joint => joint.pieces), [['bend', 'line']]);
    assert.equal(new Set(joins.flatMap(joint => joint.exteriorSeams.concat(...joint.interiorSeams))).size, 12);
    assert.deepEqual([evidence.originalCap, evidence.movedCap, evidence.retained.inlet]
      .map(cap => cap.apertures.map(aperture => aperture.edges.length)), [[4, 4], [4, 4], [4, 4]]);
    assert.ok(alternate.meta.views.back.visible_faces.includes('n1.start'));
    assert.ok(alternate.meta.views.left.visible_faces.includes('n1.end'));
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, JSON.stringify({ actual, expected }));
    const length = 6 + 10 * Math.PI;
    near(evidence.volume.original.native, 32 * (10 + 10 * Math.PI));
    near(evidence.volume.candidate.native, 32 * length);
    const centroid = [(382 + 19 / 12) / length, (200 * Math.PI - 400 - 19 / 12) / length, 0];
    for (const point of [evidence.centroid.analytic, evidence.centroid.native])
      point.forEach((coordinate, index) => near(coordinate, centroid[index]));
  }
  if (inlet) {
    assert.deepEqual(evidence.retained.outlet.center, [20, 34, 0]);
    assert.deepEqual([evidence.originalCap, evidence.movedCap, evidence.retained.outlet]
      .map(cap => cap.apertures.map(aperture => aperture.edges.length)), [[4, 4], [4, 4], [4, 4]]);
    assert.deepEqual(evidence.retained.junctions.map(joint => joint.pieces), [['line', 'bend'], ['bend', 'tail']]);
    assert.equal(new Set(evidence.retained.junctions.flatMap(joint => joint.exteriorSeams.concat(...joint.interiorSeams))).size, 24);
    assert.ok(alternate.meta.views.left.visible_faces.includes('n1.start'));
    assert.ok(alternate.meta.views.back.visible_faces.includes('n1.end'));
    const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, JSON.stringify({ actual, expected }));
    const length = 20 + 10 * Math.PI;
    near(evidence.volume.original.native, 32 * (24 + 10 * Math.PI));
    near(evidence.volume.candidate.native, 32 * length);
    const centroid = [(662 + 19 / 12) / length, (200 * Math.PI - 22 - 19 / 12) / length, 0];
    for (const point of [evidence.centroid.analytic, evidence.centroid.native])
      point.forEach((coordinate, index) => near(coordinate, centroid[index]));
  }
  assert.equal(evidence.materialChange.sectionArea, 32);
  assert.equal(evidence.materialChange.analytic, -128);
  assert.ok(Math.abs(evidence.materialChange.native + 128) < 1e-6);
  assert.ok(evidence.maximumGapMM < 1e-7);

  const faces = ['n1.start', 'n1.end'], reviewPin = { ...pins, action: 'inspect', faces,
    expectedReviewRevision: meta.candidate.reviewRevision };
  const native = await call('query', reviewPin);
  assert.deepEqual(native[evidenceKey], evidence);
  assert.deepEqual(native.candidate, meta.candidate);
  assert.equal(native.imageSha256, meta.imageSha256);
  const axis = arcFirst || inlet ? 0 : 1;
  assert.equal(native.faces.find(face => face.name === evidence.face).geometry.point[axis], moved[axis]);
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
  const evidence = reviewed.meta.pairedElbowOutletOffset ?? reviewed.meta.pairedElbowInletOffset;
  if (evidence.sourceRail) {
    await f.page.getByRole('button', { name: 'Paired duct rail', exact: true }).waitFor();
    await f.snapshot('12-retained-rail-fresh-open');
  }
  await withMcpSession(session, saved.file, 'reopened-outlet-review', async (call, request) => {
    await checkApprovedDuctReview(call, request, reviewed);
  });
  return reopened;
}

export async function checkChangedOutletRail(session, pending, reviewed, controlPoints) {
  const { sourceRail } = reviewed.meta.pairedElbowOutletOffset ?? reviewed.meta.pairedElbowInletOffset;
  const file = await checkChangedDuctPath(session, pending, reviewed, controlPoints, sourceRail);
  await withMcpSession(session, file, 'outlet-changed-rail-new-proposal', async call => {
    const expectedRevision = await currentPartRevision(call);
    const original = pending.proposals.find(entry => entry.id === reviewed.meta.candidate.proposal);
    const [{ args }] = original.ops;
    const staged = await call('proposals', { action: 'propose', title: 'Review the outlet with a changed rail',
      ops: [{ tool: 'features', args: { action: 'command', ...args, expectedRevision } }] });
    assert.deepEqual([staged.proposal, staged.applied], ['P2', false]);
    const { proposals } = await call('proposals', { action: 'list' });
    const { modelReviewRevision } = proposals.find(entry => entry.id === staged.proposal);
    const before = await readFile(file);
    const refused = await call('query', { action: 'render', proposal: staged.proposal, expectedRevision,
      expectedProposalRevision: modelReviewRevision }, true);
    assert.equal(refused.code, 'MODEL_REVIEW_REPLAY_FAILED');
    assert.match(JSON.stringify(refused), /retained Direct rail does not match/);
    assert.deepEqual(await readFile(file), before);
  });
}
